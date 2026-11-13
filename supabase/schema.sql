-- Strade Sicure Roma: segnalazioni degli utenti registrati (tabella, sicurezza, foto obbligatoria).
-- Come si usa: Supabase > SQL Editor > New query > incolla tutto > Run. Si può rieseguire senza danni.
-- Non contiene chiavi né dati: è lo schema, quindi può stare nel repo pubblico.
--
-- Principi:
--  * solo utenti registrati (Auth) possono scrivere; ognuno vede SOLO le proprie segnalazioni;
--  * la foto è obbligatoria e controllata dal server (non solo dal modulo);
--  * le foto stanno in un bucket PRIVATO e nessuna è mai pubblica;
--  * l'email dell'utente vive solo in auth.users e non viene mai copiata né mostrata;
--  * una segnalazione è solo una proposta: diventa un punto solo con 2 fonti datate verificate a mano.

create table if not exists public.segnalazioni (
  id          uuid primary key default gen_random_uuid(),
  utente      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  creata_il   timestamptz not null default now(),
  luogo       text not null check (char_length(luogo) between 3 and 120),
  descrizione text check (descrizione is null or char_length(descrizione) <= 500),
  fonte_url   text not null check (fonte_url ~* '^https?://[^ ]{4,500}$'),
  data_evento date,
  foto_path   text not null,
  stato       text not null default 'nuova' check (stato in ('nuova', 'approvata', 'scartata')),
  constraint foto_nella_propria_cartella check (foto_path like utente::text || '/%')
);

alter table public.segnalazioni enable row level security;

revoke all on public.segnalazioni from anon;
grant select, insert on public.segnalazioni to authenticated;

drop policy if exists "inserisce le proprie" on public.segnalazioni;
create policy "inserisce le proprie" on public.segnalazioni
  for insert to authenticated
  with check (utente = auth.uid() and stato = 'nuova');

drop policy if exists "legge le proprie" on public.segnalazioni;
create policy "legge le proprie" on public.segnalazioni
  for select to authenticated
  using (utente = auth.uid());

-- Controlli lato server: foto realmente caricata, data non futura, massimo 5 segnalazioni ogni 24 ore.
create or replace function public.controlla_segnalazione() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from storage.objects where bucket_id = 'segnalazioni-foto' and name = new.foto_path) then
    raise exception 'La foto è obbligatoria: caricala prima di inviare la segnalazione.';
  end if;
  if new.data_evento is not null and new.data_evento > current_date then
    raise exception 'La data dell''evento non può essere futura.';
  end if;
  if (select count(*) from public.segnalazioni where utente = new.utente and creata_il > now() - interval '24 hours') >= 5 then
    raise exception 'Hai raggiunto il limite di 5 segnalazioni ogni 24 ore.';
  end if;
  return new;
end;
$$;

drop trigger if exists controlla_segnalazione on public.segnalazioni;
create trigger controlla_segnalazione before insert on public.segnalazioni
  for each row execute function public.controlla_segnalazione();

-- Foto: bucket privato, massimo 5 MB, solo JPEG/PNG/WebP, ognuno nella cartella col proprio id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('segnalazioni-foto', 'segnalazioni-foto', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "carica nella propria cartella" on storage.objects;
create policy "carica nella propria cartella" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'segnalazioni-foto' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "legge le proprie foto" on storage.objects;
create policy "legge le proprie foto" on storage.objects
  for select to authenticated
  using (bucket_id = 'segnalazioni-foto' and (storage.foldername(name))[1] = auth.uid()::text);

-- Moderazione: dal pannello Supabase (Table Editor > segnalazioni) si cambia `stato` e si guardano le foto
-- in Storage > segnalazioni-foto. Le foto non sono mai pubbliche e l'app non le mostra a nessuno tranne a chi le ha caricate.
