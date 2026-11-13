import { describe, expect, it } from "vitest";
import { MAX_FOTO_BYTE, percorsoFoto, validaSegnalazione, type BozzaSegnalazione } from "./segnalazione";

// Solo dati di prova.
const OGGI = "2026-11-14";
const buona: BozzaSegnalazione = {
  luogo: "  Sottopasso   di   via Esempio ", fonte: "https://esempio.test/articolo", data: "2025-03-01", descrizione: "",
  foto: { tipo: "image/jpeg", dimensione: 200_000 },
};
const errori = (b: Partial<BozzaSegnalazione>) => {
  const r = validaSegnalazione({ ...buona, ...b }, OGGI);
  return r.ok ? null : r.errori;
};

describe("segnalazione", () => {
  it("accetta una segnalazione valida e ripulisce gli spazi", () => {
    const r = validaSegnalazione(buona, OGGI);
    expect(r).toEqual({ ok: true, valori: { luogo: "Sottopasso di via Esempio", fonte_url: "https://esempio.test/articolo", data_evento: "2025-03-01", descrizione: null } });
  });
  it("la foto è obbligatoria", () => expect(errori({ foto: null })?.foto).toMatch(/obbligatoria/));
  it("rifiuta formati non immagine", () => expect(errori({ foto: { tipo: "application/pdf", dimensione: 10 } })?.foto).toMatch(/JPEG/));
  it("rifiuta un file vuoto", () => expect(errori({ foto: { tipo: "image/png", dimensione: 0 } })?.foto).toMatch(/vuoto/));
  it("la fonte deve essere un indirizzo http(s)", () => {
    expect(errori({ fonte: "javascript:alert(1)" })?.fonte).toBeDefined();
    expect(errori({ fonte: "articolo di giornale" })?.fonte).toBeDefined();
  });
  it("luogo troppo corto o troppo lungo", () => {
    expect(errori({ luogo: "ab" })?.luogo).toBeDefined();
    expect(errori({ luogo: "x".repeat(121) })?.luogo).toBeDefined();
  });
  it("la data non può essere futura né antica; è facoltativa", () => {
    expect(errori({ data: "2026-11-15" })?.data).toBeDefined();
    expect(errori({ data: "1999-12-31" })?.data).toBeDefined();
    expect(errori({ data: "" })).toBeNull();
  });
  it("descrizione al massimo 500 caratteri", () => expect(errori({ descrizione: "x".repeat(501) })?.descrizione).toBeDefined());
  it("raccoglie più errori insieme", () => expect(Object.keys(errori({ luogo: "", foto: null }) ?? {})).toEqual(["luogo", "foto"]));
  it("il limite di dimensione è 5 MB", () => expect(MAX_FOTO_BYTE).toBe(5 * 1024 * 1024));
  it("la foto va nella cartella dell'utente", () => expect(percorsoFoto("u-1", "abc")).toBe("u-1/abc.jpg"));
});
