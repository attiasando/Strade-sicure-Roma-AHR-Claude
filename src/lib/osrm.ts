// Percorsi stradali dal servizio pubblico OSRM (OpenStreetMap), senza chiave.
// Il servizio demo è per uso leggero: poche richieste per ogni controllo, mai in parallelo.
import type { Pt } from "./geo";

export type Tratto = { linea: Pt[]; distanzaM: number; durataS: number };

const BASE = "https://router.project-osrm.org/route/v1/driving";

type RispostaOsrm = {
  code: string;
  routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
};

export class ServizioPercorsiNonDisponibile extends Error {}

/** Converte la risposta OSRM in tratti. Funzione pura (testabile). */
export function trattiDaRisposta(r: RispostaOsrm): Tratto[] {
  if (r.code !== "Ok" || !r.routes) return [];
  return r.routes.map((x) => ({
    distanzaM: x.distance,
    durataS: x.duration,
    linea: x.geometry.coordinates.map(([lon, lat]) => ({ lat, lon })),
  }));
}

/** URL della richiesta (lon,lat per OSRM). `via` = tappe intermedie obbligate. */
export function urlPercorso(a: Pt, b: Pt, via: Pt[] = [], alternative = false): string {
  const punti = [a, ...via, b].map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const q = new URLSearchParams({ overview: "full", geometries: "geojson", steps: "false" });
  if (alternative) q.set("alternatives", "3");
  return `${BASE}/${punti}?${q.toString()}`;
}

export async function percorsi(a: Pt, b: Pt, via: Pt[] = [], alternative = false, segnale?: AbortSignal): Promise<Tratto[]> {
  let r: Response;
  try { r = await fetch(urlPercorso(a, b, via, alternative), { signal: segnale }); }
  catch (e) { if ((e as Error).name === "AbortError") throw e; throw new ServizioPercorsiNonDisponibile("Servizio percorsi non raggiungibile."); }
  if (r.status === 429) throw new ServizioPercorsiNonDisponibile("Troppe richieste al servizio percorsi: riprova tra poco.");
  if (!r.ok) throw new ServizioPercorsiNonDisponibile("Il servizio percorsi ha risposto con un errore.");
  return trattiDaRisposta((await r.json()) as RispostaOsrm);
}
