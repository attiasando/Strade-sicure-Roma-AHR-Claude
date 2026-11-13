// Segnalazione di un punto da parte di un utente registrato: validazione pura (testabile).
// La stessa regola è ripetuta dal database (supabase/schema.sql): qui serve a dare errori chiari prima dell'invio.

export const TIPI_FOTO = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_FOTO_BYTE = 5 * 1024 * 1024;

export type BozzaSegnalazione = {
  luogo: string; fonte: string; data: string; descrizione: string;
  foto: { tipo: string; dimensione: number } | null;
};
export type ValoriSegnalazione = { luogo: string; fonte_url: string; data_evento: string | null; descrizione: string | null };
export type Errori = Partial<Record<"luogo" | "fonte" | "data" | "descrizione" | "foto", string>>;

const URL_OK = /^https?:\/\/[^\s]{4,500}$/i;

/** `oggi` in formato AAAA-MM-GG (passato dal chiamante, così il test non dipende dall'orologio). */
export function validaSegnalazione(b: BozzaSegnalazione, oggi: string): { ok: true; valori: ValoriSegnalazione } | { ok: false; errori: Errori } {
  const errori: Errori = {};
  const luogo = b.luogo.trim().replace(/\s+/g, " ");
  const fonte = b.fonte.trim();
  const descrizione = b.descrizione.trim();
  if (luogo.length < 3 || luogo.length > 120) errori.luogo = "Indica il luogo (strada o sottopasso), da 3 a 120 caratteri.";
  if (!URL_OK.test(fonte)) errori.fonte = "Inserisci l'indirizzo (http o https) di un articolo che racconta l'allagamento.";
  if (b.data && (!/^\d{4}-\d{2}-\d{2}$/.test(b.data) || b.data < "2000-01-01" || b.data > oggi)) errori.data = "La data dell'evento deve essere passata e valida.";
  if (descrizione.length > 500) errori.descrizione = "La descrizione può avere al massimo 500 caratteri.";
  if (!b.foto) errori.foto = "La foto è obbligatoria.";
  else if (!(TIPI_FOTO as readonly string[]).includes(b.foto.tipo)) errori.foto = "La foto deve essere JPEG, PNG o WebP.";
  else if (b.foto.dimensione <= 0) errori.foto = "Il file della foto è vuoto.";
  if (Object.keys(errori).length) return { ok: false, errori };
  return { ok: true, valori: { luogo, fonte_url: fonte, data_evento: b.data || null, descrizione: descrizione || null } };
}

/** Percorso della foto nel bucket: sempre dentro la cartella dell'utente (lo impone anche il database). */
export const percorsoFoto = (utenteId: string, idCasuale: string): string => `${utenteId}/${idCasuale}.jpg`;
