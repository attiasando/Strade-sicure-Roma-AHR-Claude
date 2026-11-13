import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { ripulisciFoto } from "../lib/foto";
import { MAX_FOTO_BYTE, percorsoFoto, validaSegnalazione, type Errori } from "../lib/segnalazione";

const oggi = () => new Date().toISOString().slice(0, 10);
const VUOTO = { luogo: "", fonte: "", data: "", descrizione: "" };

export default function Segnala() {
  const [sessione, setSessione] = useState<Session | null>(null);
  const [pronto, setPronto] = useState(false);
  const [email, setEmail] = useState("");
  const [mailInviata, setMailInviata] = useState(false);
  const [campi, setCampi] = useState(VUOTO);
  const [foto, setFoto] = useState<File | null>(null);
  const [errori, setErrori] = useState<Errori>({});
  const [messaggio, setMessaggio] = useState<{ tipo: "ok" | "errore"; testo: string } | null>(null);
  const [invio, setInvio] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSessione(data.session); setPronto(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessione(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabase) return null; // build senza configurazione Supabase: la sezione non compare

  async function accedi(e: React.FormEvent) {
    e.preventDefault();
    setMessaggio(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setMessaggio({ tipo: "errore", testo: "Inserisci un indirizzo email valido." }); return; }
    const { error } = await supabase!.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.href.split("#")[0] } });
    if (error) setMessaggio({ tipo: "errore", testo: "Invio del link non riuscito. Riprova tra qualche minuto." });
    else setMailInviata(true);
  }

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setMessaggio(null);
    const r = validaSegnalazione({ ...campi, foto: foto ? { tipo: foto.type, dimensione: foto.size } : null }, oggi());
    if (!r.ok) { setErrori(r.errori); return; }
    if (!foto || !sessione) return;
    if (foto.size > MAX_FOTO_BYTE * 4) { setErrori({ foto: "La foto è troppo grande (massimo 20 MB prima della riduzione)." }); return; }
    setErrori({}); setInvio(true);
    const percorso = percorsoFoto(sessione.user.id, crypto.randomUUID());
    try {
      const pulita = await ripulisciFoto(foto); // toglie EXIF/GPS e riduce il peso
      if (pulita.size > MAX_FOTO_BYTE) throw new Error("La foto è ancora troppo pesante: scegline una più piccola.");
      const su = await supabase!.storage.from("segnalazioni-foto").upload(percorso, pulita, { contentType: "image/jpeg" });
      if (su.error) throw new Error("Caricamento della foto non riuscito.");
      const { error } = await supabase!.from("segnalazioni").insert({ ...r.valori, foto_path: percorso });
      if (error) {
        await supabase!.storage.from("segnalazioni-foto").remove([percorso]);
        throw new Error(error.message.includes("limite") ? "Hai raggiunto il limite di 5 segnalazioni ogni 24 ore." : "Invio non riuscito. Riprova più tardi.");
      }
      setCampi(VUOTO); setFoto(null);
      setMessaggio({ tipo: "ok", testo: "Grazie! La segnalazione è stata ricevuta. Sarà controllata prima di essere usata: servono due fonti datate." });
    } catch (err) {
      setMessaggio({ tipo: "errore", testo: err instanceof Error ? err.message : "Invio non riuscito." });
    } finally { setInvio(false); }
  }

  const imposta = (k: keyof typeof VUOTO) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setCampi((c) => ({ ...c, [k]: e.target.value }));
  const err = (k: keyof Errori) => errori[k] && <span role="alert" className="errore piccolo">{errori[k]}</span>;

  return (
    <details className="riquadro" id="segnala">
      <summary><strong>Segnala un punto allagato</strong></summary>
      <p className="piccolo">Riservato agli utenti registrati. Serve una foto e l'indirizzo di un articolo. La segnalazione è solo una proposta: diventa un punto della mappa dopo un controllo e con almeno due fonti datate.</p>

      {!pronto ? <p className="piccolo">Caricamento…</p> : !sessione ? (
        mailInviata ? <p role="status">Ti abbiamo inviato un link: aprilo dalla tua email per accedere.</p> : (
          <form onSubmit={accedi} className="riquadro">
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="nome@esempio.it" /></label>
            <button type="submit">Ricevi il link di accesso</button>
            <p className="piccolo">Conserviamo solo la tua email, per l'accesso: non la mostriamo a nessuno e non la pubblichiamo.</p>
          </form>
        )
      ) : (
        <form onSubmit={invia} className="riquadro" noValidate>
          <p className="piccolo">Accesso effettuato. <button type="button" className="secondario" onClick={() => supabase!.auth.signOut()}>Esci</button></p>
          <label>Luogo<input value={campi.luogo} onChange={imposta("luogo")} placeholder="Es. Sottopasso di via Esempio" maxLength={120} />{err("luogo")}</label>
          <label>Articolo (indirizzo web)<input value={campi.fonte} onChange={imposta("fonte")} inputMode="url" placeholder="https://…" />{err("fonte")}</label>
          <label>Data dell'evento (facoltativa)<input type="date" value={campi.data} max={oggi()} onChange={imposta("data")} />{err("data")}</label>
          <label>Descrizione (facoltativa)<textarea value={campi.descrizione} onChange={imposta("descrizione")} maxLength={500} rows={3} />{err("descrizione")}</label>
          <label>Foto (obbligatoria)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />{err("foto")}</label>
          <p className="piccolo">Niente volti, targhe o numeri civici riconoscibili. Posizione e dati nascosti nella foto vengono eliminati prima dell'invio. La foto non sarà mai pubblica.</p>
          <button type="submit" disabled={invio}>{invio ? "Invio in corso…" : "Invia la segnalazione"}</button>
        </form>
      )}
      {messaggio && <p role={messaggio.tipo === "ok" ? "status" : "alert"} className={messaggio.tipo === "errore" ? "errore" : ""}>{messaggio.testo}</p>}
    </details>
  );
}
