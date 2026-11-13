import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import type { Pt } from "../lib/geo";
import { lunghezzeCumulative, lunghezzaTotale, puntoAllaDistanza } from "../lib/geo";
import type { PuntoRischio } from "../lib/regole";
import { ROMA_CENTRO } from "../lib/regole";
import { fermataSuLinea, metriPercorsi } from "../lib/simulazione";
import type { PuntoVicino } from "../lib/percorso";

export type PercorsoMappa = { normale: Pt[]; sicuro: Pt[] | null; evidenziati: PuntoVicino[] } | null;
export type SimulazioneMappa = { chiave: number; stato: "ferma" | "in_corso" | "pausa"; velocita: number };
export type EventoSimulazione = { tipo: "fermo"; nome: string } | { tipo: "arrivo_sicuro" } | { tipo: "arrivo_libero" } | { tipo: "fine" };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const ll = (a: Pt[]) => a.map((p) => [p.lat, p.lon] as [number, number]);
const COL = { grigio: "#5b6470", verde: "#16a34a", rosso: "#dc2626", arancio: "#d97706" };

const fontiHtml = (f: { data: string; fonte: string }[]) =>
  `<ul style="margin:4px 0 0;padding-left:16px">${f.map((e) => `<li>${esc(e.data)} – <a href="${esc(e.fonte)}" target="_blank" rel="noopener noreferrer">fonte</a></li>`).join("")}</ul>`;

export default function Mappa({ punti, percorso, simulazione, onEvento }: {
  punti: PuntoRischio[]; percorso: PercorsoMappa; simulazione: SimulazioneMappa; onEvento: (e: EventoSimulazione) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const stratoPunti = useRef<L.LayerGroup | null>(null);
  const stratoPercorso = useRef<L.LayerGroup | null>(null);
  const stratoSim = useRef<L.LayerGroup | null>(null);
  const veicoli = useRef<{ grigio: L.CircleMarker | null; verde: L.CircleMarker | null }>({ grigio: null, verde: null });
  const avanzamento = useRef({ metri: 0, fermo: false, arrivato: false });
  const velocitaRef = useRef(simulazione.velocita);
  const onEventoRef = useRef(onEvento);
  velocitaRef.current = simulazione.velocita;
  onEventoRef.current = onEvento;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false }).setView([ROMA_CENTRO.lat, ROMA_CENTRO.lon], 12);
    L.control.zoom({ position: "bottomright" }).addTo(m);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    stratoPunti.current = L.layerGroup().addTo(m);
    stratoPercorso.current = L.layerGroup().addTo(m);
    stratoSim.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const g = stratoPunti.current;
    if (!g) return;
    g.clearLayers();
    for (const p of punti) {
      L.circleMarker([p.lat, p.lon], { radius: 9, color: COL.arancio, fillColor: COL.arancio, fillOpacity: 0.55, weight: 2 })
        .bindPopup(`<strong>${esc(p.nome)}</strong><br/>${esc(p.quartiere)}<br/>Eventi registrati: ${p.eventi.length}${fontiHtml(p.eventi)}${p.nota ? `<p style="margin:6px 0 0;font-size:11px">${esc(p.nota)}</p>` : ""}`)
        .addTo(g);
    }
  }, [punti]);

  useEffect(() => {
    const g = stratoPercorso.current, m = map.current;
    if (!g || !m) return;
    g.clearLayers();
    if (!percorso) return;
    const grigio = L.polyline(ll(percorso.normale), { color: COL.grigio, weight: 5, opacity: 0.85, dashArray: percorso.sicuro ? "6 6" : undefined }).addTo(g);
    const bounds = grigio.getBounds();
    if (percorso.sicuro) { L.polyline(ll(percorso.sicuro), { color: COL.verde, weight: 6 }).addTo(g); bounds.extend(ll(percorso.sicuro)); }
    for (const e of percorso.evidenziati) {
      const c = e.evitato ? COL.rosso : COL.arancio;
      L.circleMarker([e.lat, e.lon], { radius: 16, color: c, weight: 4, fillOpacity: 0.15 })
        .bindPopup(`<strong>${esc(e.nome)}</strong><br/>${e.evitato ? "Punto aggirato" : "Punto a rischio vicino al percorso"}${fontiHtml(e.fonti)}`).addTo(g);
    }
    m.fitBounds(bounds, { padding: [30, 30] });
  }, [percorso]);

  // Geometria dell'animazione: solo dai tracciati già presenti, nessuna chiamata esterna.
  const geom = useMemo(() => {
    if (!percorso) return null;
    const cumN = lunghezzeCumulative(percorso.normale);
    const cumS = percorso.sicuro ? lunghezzeCumulative(percorso.sicuro) : null;
    const fermata = fermataSuLinea(percorso.normale, cumN, percorso.evidenziati);
    return { cumN, cumS, totN: lunghezzaTotale(cumN), totS: cumS ? lunghezzaTotale(cumS) : 0, fermata };
  }, [percorso]);

  const attiva = simulazione.chiave > 0;

  // Veicoli alla partenza ogni volta che cambia il percorso o si preme "Ricomincia".
  useEffect(() => {
    const g = stratoSim.current;
    if (!g) return;
    g.clearLayers();
    veicoli.current = { grigio: null, verde: null };
    avanzamento.current = { metri: 0, fermo: false, arrivato: false };
    if (!percorso || !attiva) return;
    const mk = (linea: Pt[], colore: string, etichetta: string) =>
      L.circleMarker([linea[0]!.lat, linea[0]!.lon], { radius: 9, color: "#fff", weight: 3, fillColor: colore, fillOpacity: 1 }).bindTooltip(etichetta, { direction: "top" }).addTo(g);
    veicoli.current.grigio = mk(percorso.normale, COL.grigio, "Percorso normale");
    if (percorso.sicuro) veicoli.current.verde = mk(percorso.sicuro, COL.verde, "Percorso alternativo");
  }, [percorso, simulazione.chiave, attiva]);

  // Due veicoli alla stessa velocità reale: quello normale si ferma davanti al punto allagato, quello sicuro lo aggira.
  useEffect(() => {
    if (!geom || !percorso || !attiva || simulazione.stato !== "in_corso") return;
    let raf = 0, ultimo = performance.now();
    const passo = (ora: number) => {
      const dt = Math.min(0.1, (ora - ultimo) / 1000);
      ultimo = ora;
      const av = avanzamento.current;
      av.metri += metriPercorsi(geom.totN, dt, velocitaRef.current);
      const { grigio, verde } = veicoli.current;
      const limite = geom.fermata ? Math.min(geom.totN, geom.fermata.distanzaM) : geom.totN;
      if (grigio) { const p = puntoAllaDistanza(percorso.normale, geom.cumN, Math.min(av.metri, limite)); grigio.setLatLng([p.lat, p.lon]); }
      if (geom.fermata && !av.fermo && av.metri >= geom.fermata.distanzaM) {
        av.fermo = true;
        grigio?.setStyle({ fillColor: COL.rosso });
        grigio?.bindTooltip(`Fermo: ${geom.fermata.nome} allagato`, { direction: "top", permanent: true }).openTooltip();
        onEventoRef.current({ tipo: "fermo", nome: geom.fermata.nome });
      }
      if (verde && percorso.sicuro && geom.cumS) { const p = puntoAllaDistanza(percorso.sicuro, geom.cumS, Math.min(av.metri, geom.totS)); verde.setLatLng([p.lat, p.lon]); }
      const finito = percorso.sicuro ? av.metri >= geom.totS : av.metri >= limite;
      if (finito) {
        if (!av.arrivato) {
          av.arrivato = true;
          onEventoRef.current(percorso.sicuro ? { tipo: "arrivo_sicuro" } : geom.fermata ? { tipo: "fine" } : { tipo: "arrivo_libero" });
        }
        return;
      }
      raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [geom, percorso, attiva, simulazione.stato, simulazione.chiave]);

  return <div ref={el} className="mappa" />;
}
