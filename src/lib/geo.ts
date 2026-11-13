// Funzioni geografiche pure. Coordinate: {lat, lon} in gradi (WGS84).
export type Pt = { lat: number; lon: number };

const R = 6371000;
const rad = (g: number) => g * (Math.PI / 180);

/** Distanza in metri tra due punti (approssimazione equirettangolare, adatta alla scala cittadina). */
export function distanzaM(a: Pt, b: Pt): number {
  const lat0 = rad((a.lat + b.lat) / 2);
  const dx = rad(b.lon - a.lon) * R * Math.cos(lat0);
  const dy = rad(b.lat - a.lat) * R;
  return Math.hypot(dx, dy);
}

/** cum[i] = metri dall'inizio del tracciato fino al vertice i. */
export function lunghezzeCumulative(linea: Pt[]): number[] {
  const cum: number[] = [];
  let tot = 0;
  for (let i = 0; i < linea.length; i++) {
    if (i > 0) tot += distanzaM(linea[i - 1]!, linea[i]!);
    cum.push(tot);
  }
  return cum;
}

export const lunghezzaTotale = (cum: number[]): number => (cum.length ? cum[cum.length - 1]! : 0);

/** Posizione dopo `d` metri dall'inizio (d limitato a [0, lunghezza]). */
export function puntoAllaDistanza(linea: Pt[], cum: number[], d: number): Pt {
  if (!linea.length) throw new Error("Tracciato vuoto");
  const tot = lunghezzaTotale(cum);
  const x = Math.max(0, Math.min(tot, d));
  if (x <= 0 || linea.length === 1) return linea[0]!;
  if (x >= tot) return linea[linea.length - 1]!;
  let i = 1;
  while (i < cum.length - 1 && cum[i]! < x) i++;
  const a = linea[i - 1]!, b = linea[i]!;
  const seg = cum[i]! - cum[i - 1]!;
  const t = seg > 0 ? (x - cum[i - 1]!) / seg : 0;
  return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
}

/** Proiezione di `p` sul tracciato: distanza minima in metri e posizione lungo il tracciato (metri dall'inizio). */
export function proiezioneSuLinea(linea: Pt[], cum: number[], p: Pt): { distanzaM: number; lungoM: number } {
  if (linea.length < 2) return { distanzaM: linea[0] ? distanzaM(p, linea[0]) : Infinity, lungoM: 0 };
  const lat0 = rad(p.lat);
  const xy = (q: Pt) => ({ x: rad(q.lon) * R * Math.cos(lat0), y: rad(q.lat) * R });
  const P = xy(p);
  let best = Infinity, lungo = 0;
  for (let i = 0; i < linea.length - 1; i++) {
    const A = xy(linea[i]!), B = xy(linea[i + 1]!);
    const dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / l2)) : 0;
    const d = Math.hypot(P.x - (A.x + t * dx), P.y - (A.y + t * dy));
    if (d < best) { best = d; lungo = cum[i]! + t * (cum[i + 1]! - cum[i]!); }
  }
  return { distanzaM: best, lungoM: lungo };
}

/** Distanza minima in metri tra un punto e un tracciato. */
export function distanzaDaLinea(p: Pt, linea: Pt[]): number {
  return proiezioneSuLinea(linea, lunghezzeCumulative(linea), p).distanzaM;
}

/** Punto a `metri` da `p` nella direzione `gradi` (0 = nord, 90 = est). */
export function spostaPunto(p: Pt, metri: number, gradi: number): Pt {
  const b = rad(gradi);
  return {
    lat: p.lat + (metri * Math.cos(b)) / 111320,
    lon: p.lon + (metri * Math.sin(b)) / (111320 * Math.cos(rad(p.lat))),
  };
}
