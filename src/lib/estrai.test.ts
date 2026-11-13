import { describe, expect, it } from "vitest";
import { estraiLuoghi, interrogazioni } from "./estrai";

describe("estrazione dei luoghi dalla cronaca", () => {
  it("trova strade e sottopassi nelle frasi che parlano di allagamenti", () => {
    const testo =
      "Maltempo a Roma. Chiuso per allagamento il sottopasso di via dei Due Ponti. " +
      "Allagata anche via Collatina all'altezza di via Longoni. " +
      "Oggi sole su Roma e via Appia Antica è aperta. " +
      "Allagato il Lungotevere in Sassia.";
    const nomi = estraiLuoghi(testo).map((c) => c.nome);
    expect(nomi).toContain("Sottopasso di via dei Due Ponti");
    expect(nomi.some((n) => /Collatina/.test(n))).toBe(true);
    expect(nomi.some((n) => /Sassia/.test(n))).toBe(true);
    expect(nomi.some((n) => /Appia Antica/.test(n))).toBe(false); // frase senza allagamento
  });
  it("non duplica lo stesso luogo e ignora testi senza allagamenti", () => {
    const t = "Allagata via Flaminia. Ancora allagamenti su via Flaminia.";
    expect(estraiLuoghi(t).filter((c) => /Flaminia/.test(c.nome))).toHaveLength(1);
    expect(estraiLuoghi("Bel tempo su via Veneto, nessun problema.")).toEqual([]);
  });
  it("costruisce le interrogazioni per anno e zona", () => {
    expect(interrogazioni([2024, 2025], ["Prati", "Tiburtina"])).toHaveLength(4);
    expect(interrogazioni([2024], ["Prati"])[0]).toContain("2024");
  });
});
