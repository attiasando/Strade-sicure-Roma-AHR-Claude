import { describe, expect, it } from "vitest";
import type { PuntoRischio } from "./regole";
import { anniDisponibili, annoEvento, perAnno } from "./storico";

// Solo dati di prova.
const p = (id: string, date: string[]): PuntoRischio => ({
  id, nome: `Punto ${id}`, tipo: "sottopasso", quartiere: "Test", lat: 41.9, lon: 12.5, verificato: true,
  eventi: date.map((data, i) => ({ data, fonte: `https://esempio.test/${id}/${i}` })),
});
const PUNTI = [p("a", ["2014-12-03", "2018-04-09"]), p("b", ["2018-01-01", "2026-02-12"]), p("c", ["2014-11-07", "2014-12-01"])];

describe("storico", () => {
  it("legge l'anno dalla data", () => expect(annoEvento("2018-04-09")).toBe(2018));
  it("elenca gli anni senza doppioni, dal più recente", () => expect(anniDisponibili(PUNTI)).toEqual([2026, 2018, 2014]));
  it("senza anno mostra tutti gli eventi e tutti i punti attivi", () => {
    const r = perAnno(PUNTI, null);
    expect(r.every((x) => x.attivo)).toBe(true);
    expect(r[0]!.eventi).toHaveLength(2);
  });
  it("con un anno tiene solo gli eventi di quell'anno e disattiva gli altri punti", () => {
    const r = perAnno(PUNTI, 2018);
    expect(r.map((x) => x.attivo)).toEqual([true, true, false]);
    expect(r[0]!.eventi.map((e) => e.data)).toEqual(["2018-04-09"]);
  });
  it("non modifica i punti originali", () => {
    perAnno(PUNTI, 2014);
    expect(PUNTI[0]!.eventi).toHaveLength(2);
  });
});
