// Orchestrazione: percorso normale → punti a rischio vicini → alternativa che li aggira.
import { distanzaDaLinea, spostaPunto, type Pt } from "./geo";
import { daEvitare, RAGGIO_M, evitaAttivo, type Livello, type PuntoRischio } from "./regole";
import type { Tratto } from "./osrm";

export type PuntoVicino = {
  id: string; nome: string; lat: number; lon: number; eventi: number; evitato: boolean;
  fonti: { data: string; fonte: string }[];
};

export type EsitoOk = {
  ok: true;
  normale: Tratto;
  sicuro: Tratto | null;
  vicini: PuntoVicino[];
  evitaAttivo: boolean;
  alternativaFallita: boolean;
};
export type Esito = { ok: false; errore: string } | EsitoOk;

/** Punti verificati entro RAGGIO_M dal tracciato, con l'indicazione se vanno aggirati. Funzione pura. */
export function puntiVicini(linea: Pt[], punti: PuntoRischio[], livello: Livello): PuntoVicino[] {
  return punti
    .filter((p) => p.verificato && distanzaDaLinea(p, linea) <= RAGGIO_M)
    .map((p) => ({
      id: p.id, nome: p.nome, lat: p.lat, lon: p.lon, eventi: p.eventi.length,
      evitato: daEvitare(livello, p), fonti: p.eventi,
    }));
}

/** Un tracciato è sicuro se resta oltre RAGGIO_M da tutti i punti da evitare. Funzione pura. */
export const tracciatoSicuro = (linea: Pt[], daAggirare: Pt[]): boolean =>
  daAggirare.every((p) => distanzaDaLinea(p, linea) > RAGGIO_M);

/** Tappe obbligate di prova attorno a un punto: quattro direzioni a 350 m. Funzione pura. */
export function tappeDiDeviazione(p: Pt): Pt[] {
  return [0, 90, 180, 270].map((g) => spostaPunto(p, 350, g));
}

/** Tra i tratti proposti sceglie il più breve che aggira tutti i punti. Funzione pura. */
export function sceglieAlternativa(tratti: Tratto[], daAggirare: Pt[]): Tratto | null {
  return tratti
    .filter((t) => t.linea.length > 1 && tracciatoSicuro(t.linea, daAggirare))
    .sort((a, b) => a.durataS - b.durataS)[0] ?? null;
}

export type Fornitore = (a: Pt, b: Pt, via: Pt[], alternative: boolean) => Promise<Tratto[]>;

/** Calcolo completo. `fornitore` è il servizio percorsi (OSRM nell'app, simulato nei test). */
export async function calcolaPercorso(a: Pt, b: Pt, livello: Livello, punti: PuntoRischio[], fornitore: Fornitore): Promise<Esito> {
  const proposti = await fornitore(a, b, [], true);
  const normale = proposti[0];
  if (!normale) return { ok: false, errore: "Impossibile calcolare il percorso." };

  const vicini = puntiVicini(normale.linea, punti, livello);
  const daAggirare = vicini.filter((v) => v.evitato);
  if (!daAggirare.length) {
    return { ok: true, normale, sicuro: null, vicini, evitaAttivo: evitaAttivo(livello), alternativaFallita: false };
  }

  // 1) alternative proposte dal servizio; 2) se nessuna aggira tutto, deviazioni forzate (poche richieste).
  let sicuro = sceglieAlternativa(proposti.slice(1), daAggirare);
  if (!sicuro) {
    const tappe = daAggirare.flatMap((p) => tappeDiDeviazione(p)).slice(0, 6);
    for (const tappa of tappe) {
      const t = (await fornitore(a, b, [tappa], false))[0];
      if (t && tracciatoSicuro(t.linea, daAggirare)) { sicuro = t; break; }
    }
  }
  return { ok: true, normale, sicuro, vicini, evitaAttivo: true, alternativaFallita: !sicuro };
}
