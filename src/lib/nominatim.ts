// Ricerca di indirizzi con Nominatim (OpenStreetMap), senza chiave.
// Regole d'uso del servizio: al massimo una richiesta al secondo, mai ricerche mentre si digita.
// Gli indirizzi digitati dall'utente vengono inviati a Nominatim e NON vengono salvati da questa app.
import { inRoma, ROMA_BBOX } from "./regole";
import type { Pt } from "./geo";

export type Luogo = Pt & { nome: string };

type RigaNominatim = { lat: string; lon: string; display_name: string };

/** Accetta solo risultati con coordinate valide dentro Roma. Funzione pura (testabile). */
export function sceglieLuogo(righe: RigaNominatim[]): Luogo | null {
  for (const r of righe) {
    const lat = Number(r.lat), lon = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (inRoma({ lat, lon })) return { lat, lon, nome: r.display_name };
  }
  return null;
}

export function urlRicerca(testo: string): string {
  const q = new URLSearchParams({
    format: "jsonv2",
    limit: "3",
    countrycodes: "it",
    viewbox: `${ROMA_BBOX.lonMin},${ROMA_BBOX.latMax},${ROMA_BBOX.lonMax},${ROMA_BBOX.latMin}`,
    bounded: "1",
    q: /roma/i.test(testo) ? testo : `${testo}, Roma`,
  });
  return `https://nominatim.openstreetmap.org/search?${q.toString()}`;
}

export class RicercaNonDisponibile extends Error {}

let ultima = 0;
/** Coda condivisa: garantisce almeno 1,1 secondi tra due richieste. */
async function attendiTurno() {
  const ora = Date.now();
  const attesa = Math.max(0, ultima + 1100 - ora);
  ultima = ora + attesa;
  if (attesa) await new Promise((r) => setTimeout(r, attesa));
}

export async function cercaLuogo(testo: string): Promise<Luogo | null> {
  const t = testo.trim();
  if (t.length < 2) return null;
  await attendiTurno();
  let r: Response;
  try { r = await fetch(urlRicerca(t)); } catch { throw new RicercaNonDisponibile("Ricerca indirizzi non raggiungibile."); }
  if (!r.ok) throw new RicercaNonDisponibile("La ricerca indirizzi ha risposto con un errore.");
  return sceglieLuogo((await r.json()) as RigaNominatim[]);
}
