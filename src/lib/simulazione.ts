// Logica pura dell'animazione del viaggio: nessuna chiamata esterna, nessun salvataggio.
import { proiezioneSuLinea, type Pt } from "./geo";

/** Secondi che il veicolo impiega a percorrere il tracciato normale a velocità 1x. */
export const DURATA_BASE_S = 16;
/** A quanti metri dal punto allagato si ferma il veicolo sul percorso normale. */
export const MARGINE_FERMATA_M = 60;
export const VELOCITA = [1, 2, 4] as const;

export type Fermata = { nome: string; distanzaM: number };
export type PuntoSim = { nome: string; lat: number; lon: number; evitato: boolean };

/**
 * Dove si ferma il veicolo sul percorso normale: `margineM` metri prima del primo punto da evitare che incontra.
 * Senza punti da evitare non si ferma mai (null).
 */
export function fermataSuLinea(linea: Pt[], cum: number[], punti: PuntoSim[], margineM = MARGINE_FERMATA_M): Fermata | null {
  let primo: { nome: string; d: number } | null = null;
  for (const p of punti) {
    if (!p.evitato) continue;
    const d = proiezioneSuLinea(linea, cum, p).lungoM;
    if (!primo || d < primo.d) primo = { nome: p.nome, d };
  }
  return primo ? { nome: primo.nome, distanzaM: Math.max(0, primo.d - margineM) } : null;
}

/** Metri percorsi dopo `secondi` a velocità `velocita`: il tracciato normale dura DURATA_BASE_S a 1x. */
export function metriPercorsi(lunghezzaNormaleM: number, secondi: number, velocita: number): number {
  return lunghezzaNormaleM <= 0 ? 0 : (lunghezzaNormaleM / DURATA_BASE_S) * secondi * velocita;
}
