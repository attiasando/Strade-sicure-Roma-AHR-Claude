// Regole di decisione (pure, testabili).
import type { Pt } from "./geo";

export type Livello = "verde" | "gialla" | "arancione" | "rossa";
export const LIVELLI: Livello[] = ["verde", "gialla", "arancione", "rossa"];

/** Entro questa distanza dal percorso un punto a rischio conta come "vicino". */
export const RAGGIO_M = 150;
/** Eventi storici minimi perché un punto venga aggirato. */
export const EVENTI_MINIMI = 2;

/** Riquadro di Roma: serve a scartare risultati di geocoding fuori città. */
export const ROMA_BBOX = { latMin: 41.78, latMax: 42.05, lonMin: 12.33, lonMax: 12.67 } as const;
export const ROMA_CENTRO: Pt = { lat: 41.9028, lon: 12.4964 };

export const inRoma = (p: Pt): boolean =>
  p.lat >= ROMA_BBOX.latMin && p.lat <= ROMA_BBOX.latMax && p.lon >= ROMA_BBOX.lonMin && p.lon <= ROMA_BBOX.lonMax;

/** Con allerta arancione o rossa si evitano i punti a rischio; con verde o gialla solo avviso. */
export const evitaAttivo = (l: Livello): boolean => l === "arancione" || l === "rossa";

export type PuntoRischio = {
  id: string;
  nome: string;
  tipo: "sottopasso" | "strada";
  quartiere: string;
  lat: number;
  lon: number;
  eventi: { data: string; fonte: string }[];
  /** true solo se coordinate e fonti sono state controllate (vedi scripts/verifica-punti). */
  verificato: boolean;
  /** Quanto è precisa la posizione e come è stata ricavata. */
  nota?: string;
};

export const daEvitare = (l: Livello, p: Pick<PuntoRischio, "verificato" | "eventi">): boolean =>
  evitaAttivo(l) && p.verificato && p.eventi.length >= EVENTI_MINIMI;
