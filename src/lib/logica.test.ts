import { describe, expect, it } from "vitest";
import { distanzaDaLinea, distanzaM, lunghezzeCumulative, lunghezzaTotale, proiezioneSuLinea, puntoAllaDistanza, spostaPunto } from "./geo";
import { daEvitare, evitaAttivo, inRoma, type PuntoRischio } from "./regole";
import { calcolaPercorso, puntiVicini, sceglieAlternativa, tappeDiDeviazione, tracciatoSicuro, type Fornitore } from "./percorso";
import { sceglieLuogo, urlRicerca } from "./nominatim";
import { trattiDaRisposta, urlPercorso, type Tratto } from "./osrm";
import { linkGoogleMaps, tappeDopoLeZoneAggirate } from "./gmaps";
import { DURATA_BASE_S, fermataSuLinea, metriPercorsi } from "./simulazione";

// Solo dati di prova: tracciati lungo un meridiano a nord del centro, nessun dato reale.
const nord = (km: number, lon = 12.5) => ({ lat: 41.9 + km / 111.32, lon });
const linea = [nord(0), nord(1), nord(2), nord(3)];
const tratto = (l: typeof linea): Tratto => ({ linea: l, distanzaM: 3000, durataS: 360 });
const punto = (id: string, p: { lat: number; lon: number }, eventi: number, verificato = true): PuntoRischio => ({
  id, nome: `Punto ${id}`, tipo: "sottopasso", quartiere: "Test", lat: p.lat, lon: p.lon, verificato,
  eventi: Array.from({ length: eventi }, (_, i) => ({ data: `201${i}-01-01`, fonte: `https://esempio.test/${id}/${i}` })),
});

describe("geo", () => {
  it("misura distanze e lunghezze del tracciato", () => {
    expect(distanzaM(linea[0]!, linea[1]!)).toBeCloseTo(1000, -1);
    const cum = lunghezzeCumulative(linea);
    expect(lunghezzaTotale(cum)).toBeCloseTo(3000, -1);
    const meta = puntoAllaDistanza(linea, cum, 1500);
    expect(meta.lat).toBeCloseTo(nord(1.5).lat, 4);
    expect(puntoAllaDistanza(linea, cum, -5)).toEqual(linea[0]);
    expect(puntoAllaDistanza(linea, cum, 1e9)).toEqual(linea[3]);
  });
  it("proietta un punto sul tracciato", () => {
    const cum = lunghezzeCumulative(linea);
    const p = spostaPunto(nord(1), 80, 90); // 80 m a est del secondo vertice
    const r = proiezioneSuLinea(linea, cum, p);
    expect(r.distanzaM).toBeCloseTo(80, 0);
    expect(r.lungoM).toBeCloseTo(1000, -1);
    expect(distanzaDaLinea(p, linea)).toBeCloseTo(80, 0);
  });
});

describe("regole", () => {
  it("evita i punti solo con allerta arancione o rossa, verificati e con almeno 2 eventi", () => {
    expect(evitaAttivo("verde")).toBe(false);
    expect(evitaAttivo("gialla")).toBe(false);
    expect(evitaAttivo("arancione")).toBe(true);
    expect(evitaAttivo("rossa")).toBe(true);
    expect(daEvitare("rossa", punto("a", nord(1), 2))).toBe(true);
    expect(daEvitare("rossa", punto("a", nord(1), 1))).toBe(false);
    expect(daEvitare("rossa", punto("a", nord(1), 3, false))).toBe(false);
    expect(daEvitare("gialla", punto("a", nord(1), 5))).toBe(false);
  });
  it("riconosce i luoghi dentro Roma", () => {
    expect(inRoma({ lat: 41.9, lon: 12.5 })).toBe(true);
    expect(inRoma({ lat: 41.7, lon: 12.7 })).toBe(false);
  });
});

describe("percorso", () => {
  const aggirabile = punto("p1", nord(1.5), 2);
  it("trova solo i punti verificati vicini al tracciato e marca quelli da aggirare", () => {
    const lontano = punto("p2", spostaPunto(nord(1.5), 600, 90), 3);
    const nonVerificato = punto("p3", nord(2), 4, false);
    const v = puntiVicini(linea, [aggirabile, lontano, nonVerificato], "rossa");
    expect(v.map((x) => x.id)).toEqual(["p1"]);
    expect(v[0]!.evitato).toBe(true);
    expect(puntiVicini(linea, [aggirabile], "verde")[0]!.evitato).toBe(false);
  });
  it("sceglie l'alternativa più veloce che aggira tutti i punti", () => {
    const lontana = [nord(0), spostaPunto(nord(1.5), 400, 90), nord(3)];
    const vicina = [nord(0), spostaPunto(nord(1.5), 40, 90), nord(3)];
    const a = { ...tratto(lontana), durataS: 500 };
    const b = { ...tratto(lontana), durataS: 450 };
    expect(tracciatoSicuro(vicina, [aggirabile])).toBe(false);
    expect(sceglieAlternativa([tratto(vicina), a, b], [aggirabile])).toBe(b);
    expect(sceglieAlternativa([tratto(vicina)], [aggirabile])).toBeNull();
    expect(tappeDiDeviazione(aggirabile)).toHaveLength(4);
  });
  it("calcola normale e alternativa con un servizio simulato", async () => {
    const lontana = [nord(0), spostaPunto(nord(1.5), 400, 90), nord(3)];
    let chiamate = 0;
    const fornitore: Fornitore = async (_a, _b, via) => { chiamate++; return via.length ? [tratto(lontana)] : [tratto(linea)]; };
    const r = await calcolaPercorso(linea[0]!, linea[3]!, "rossa", [aggirabile], fornitore);
    expect(r.ok && r.sicuro && r.alternativaFallita === false).toBe(true);
    expect(chiamate).toBeGreaterThan(1); // prima senza alternative, poi con una deviazione forzata
  });
  it("con allerta verde non cerca alternative", async () => {
    let chiamate = 0;
    const fornitore: Fornitore = async () => { chiamate++; return [tratto(linea)]; };
    const r = await calcolaPercorso(linea[0]!, linea[3]!, "verde", [aggirabile], fornitore);
    expect(r.ok && r.sicuro === null && r.vicini.length === 1 && !r.evitaAttivo).toBe(true);
    expect(chiamate).toBe(1);
  });
  it("segnala quando nessuna alternativa è possibile", async () => {
    const fornitore: Fornitore = async () => [tratto(linea)];
    const r = await calcolaPercorso(linea[0]!, linea[3]!, "rossa", [aggirabile], fornitore);
    expect(r.ok && r.sicuro === null && r.alternativaFallita).toBe(true);
  });
  it("gestisce l'assenza di percorsi", async () => {
    const r = await calcolaPercorso(linea[0]!, linea[3]!, "rossa", [], async () => []);
    expect(r).toEqual({ ok: false, errore: "Impossibile calcolare il percorso." });
  });
});

describe("servizi esterni (solo parti pure)", () => {
  it("convierte la risposta OSRM e costruisce l'URL con lon,lat", () => {
    const t = trattiDaRisposta({ code: "Ok", routes: [{ distance: 10, duration: 2, geometry: { coordinates: [[12.5, 41.9], [12.6, 42]] } }] });
    expect(t[0]!.linea[0]).toEqual({ lat: 41.9, lon: 12.5 });
    expect(trattiDaRisposta({ code: "NoRoute" })).toEqual([]);
    const u = urlPercorso({ lat: 41.9, lon: 12.5 }, { lat: 42, lon: 12.6 }, [], true);
    expect(u).toContain("12.500000,41.900000;12.600000,42.000000");
    expect(u).toContain("alternatives=3");
  });
  it("accetta solo risultati Nominatim dentro Roma", () => {
    expect(sceglieLuogo([{ lat: "40.0", lon: "10.0", display_name: "Fuori" }, { lat: "41.9", lon: "12.5", display_name: "Dentro" }])?.nome).toBe("Dentro");
    expect(sceglieLuogo([{ lat: "40.0", lon: "10.0", display_name: "Fuori" }])).toBeNull();
    expect(sceglieLuogo([{ lat: "x", lon: "y", display_name: "Rotto" }])).toBeNull();
    expect(urlRicerca("Via Flaminia")).toContain("Via+Flaminia%2C+Roma");
    expect(urlRicerca("Piazza Navona, Roma")).toContain("Piazza+Navona%2C+Roma");
  });
});

describe("link Google Maps", () => {
  it("usa lat,lon, driving e al massimo 3 tappe dopo le zone aggirate", () => {
    const l = [nord(0), nord(0.5), nord(1), nord(1.5), nord(2), nord(2.5), nord(3)];
    const zone = [nord(0.5), nord(1.5), nord(2.5), nord(2.6)];
    const tappe = tappeDopoLeZoneAggirate(l, zone);
    expect(tappe.length).toBeLessThanOrEqual(3);
    const url = new URL(linkGoogleMaps(l, zone));
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(url.searchParams.get("origin")).toBe(`${l[0]!.lat.toFixed(6)},${l[0]!.lon.toFixed(6)}`);
    expect(url.searchParams.get("travelmode")).toBe("driving");
    expect(url.searchParams.get("waypoints")!.split("|").length).toBeLessThanOrEqual(3);
    expect(linkGoogleMaps([], [])).toBe("");
  });
});

describe("simulazione", () => {
  const cum = lunghezzeCumulative(linea);
  it("ferma il veicolo 60 m prima del primo punto da evitare", () => {
    const f = fermataSuLinea(linea, cum, [
      { nome: "Secondo", ...nord(2.5), evitato: true },
      { nome: "Primo", ...nord(1), evitato: true },
      { nome: "Solo vicino", ...nord(0.2), evitato: false },
    ]);
    expect(f?.nome).toBe("Primo");
    expect(f?.distanzaM).toBeCloseTo(940, -1);
    expect(fermataSuLinea(linea, cum, [{ nome: "X", ...nord(1), evitato: false }])).toBeNull();
    expect(fermataSuLinea(linea, cum, [{ nome: "Y", ...nord(0.01), evitato: true }])?.distanzaM).toBe(0);
  });
  it("il tracciato normale dura DURATA_BASE_S a 1x e la velocità scala il tempo", () => {
    expect(metriPercorsi(3000, DURATA_BASE_S, 1)).toBeCloseTo(3000, 6);
    expect(metriPercorsi(3000, DURATA_BASE_S, 4)).toBeCloseTo(12000, 6);
    expect(metriPercorsi(0, 5, 1)).toBe(0);
  });
});
