// Layer storico: solo per la visualizzazione. Il calcolo dei percorsi usa sempre tutti gli eventi.
import type { PuntoRischio } from "./regole";

export type Evento = PuntoRischio["eventi"][number];
/** Un punto con gli eventi dell'anno scelto; `attivo` = ha almeno un evento in quell'anno. */
export type PuntoStorico = { punto: PuntoRischio; eventi: Evento[]; attivo: boolean };

export const annoEvento = (data: string): number => Number(data.slice(0, 4));

/** Anni con almeno un evento, dal più recente al più vecchio. */
export const anniDisponibili = (punti: PuntoRischio[]): number[] =>
  [...new Set(punti.flatMap((p) => p.eventi.map((e) => annoEvento(e.data))))].filter(Number.isFinite).sort((a, b) => b - a);

/** `anno = null`: tutti gli eventi. Con un anno, i punti senza eventi in quell'anno restano `attivo: false`. */
export const perAnno = (punti: PuntoRischio[], anno: number | null): PuntoStorico[] =>
  punti.map((punto) => {
    const eventi = anno === null ? punto.eventi : punto.eventi.filter((e) => annoEvento(e.data) === anno);
    return { punto, eventi, attivo: eventi.length > 0 };
  });
