// Link "Apri in Google Maps": costruito solo nel browser, senza chiavi, mai salvato.
// Attenzione: Google vuole lat,lon (OSRM e GeoJSON usano lon,lat).
import { distanzaM, type Pt } from "./geo";

const fmt = (p: Pt) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;

/** Fino a 3 tappe lungo il percorso sicuro, subito dopo ogni zona aggirata (primo punto oltre 200 m). */
export function tappeDopoLeZoneAggirate(linea: Pt[], aggirati: Pt[], massimo = 3): Pt[] {
  const tappe: Pt[] = [];
  for (const v of aggirati) {
    let vicino = 0, dMin = Infinity;
    linea.forEach((p, i) => { const d = distanzaM(p, v); if (d < dMin) { dMin = d; vicino = i; } });
    let j = vicino;
    while (j < linea.length - 1 && distanzaM(linea[j]!, v) <= 200) j++;
    const t = linea[j];
    if (t && !tappe.some((x) => x.lat === t.lat && x.lon === t.lon)) tappe.push(t);
    if (tappe.length === massimo) break;
  }
  return tappe;
}

export function linkGoogleMaps(linea: Pt[], aggirati: Pt[]): string {
  const primo = linea[0], ultimo = linea[linea.length - 1];
  if (!primo || !ultimo) return "";
  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  u.searchParams.set("origin", fmt(primo));
  u.searchParams.set("destination", fmt(ultimo));
  const tappe = tappeDopoLeZoneAggirate(linea, aggirati);
  if (tappe.length) u.searchParams.set("waypoints", tappe.map(fmt).join("|"));
  u.searchParams.set("travelmode", "driving");
  return u.toString();
}
