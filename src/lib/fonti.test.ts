import { describe, expect, it } from "vitest";
import { conPiuDate, leggiRss, parlaDiAllagamenti, robotsPermette, senzaTag, unisci, type Raccolto } from "./fonti";

// Solo dati di prova: feed, robots.txt e luoghi inventati.
const RSS = `<?xml version="1.0"?><rss><channel><title>Canale</title>
<item><title><![CDATA[Allagato il sottopasso di via Esempio]]></title><link>https://esempio.test/a1</link><pubDate>Fri, 10 Jan 2025 10:00:00 +0100</pubDate><description><![CDATA[<p>Forte pioggia &amp; strade chiuse.</p>]]></description></item>
<item><title>Senza link</title><link>non-un-url</link></item>
<item><title>Data sbagliata</title><link>https://esempio.test/a2</link><pubDate>ieri</pubDate></item>
</channel></rss>`;

const ROBOTS = `User-agent: *
Disallow: /privato/
Disallow: /*?riservato=
Allow: /privato/aperto

User-agent: BotVietato
Disallow: /

User-agent: StradeSicureRomaBot
Disallow: /solo-per-noi/
`;

const r = (nome: string, data: string, fonte: string): Raccolto => ({ nome, data, fonte, estratto: "" });

describe("fonti", () => {
  it("toglie i tag e decodifica le entità", () => {
    expect(senzaTag("<p>Pioggia &amp; <b>vento</b></p><script>x()</script>")).toBe("Pioggia & vento");
  });

  it("legge un feed RSS e scarta le voci senza indirizzo valido", () => {
    const v = leggiRss(RSS);
    expect(v).toHaveLength(2);
    expect(v[0]).toEqual({ titolo: "Allagato il sottopasso di via Esempio", url: "https://esempio.test/a1", data: "2025-01-10", testo: "Forte pioggia & strade chiuse." });
    expect(v[1]!.data).toBe("");
  });

  it("riconosce i testi sugli allagamenti", () => {
    expect(parlaDiAllagamenti("Nubifragio su Roma")).toBe(true);
    expect(parlaDiAllagamenti("Concerto in piazza")).toBe(false);
  });

  describe("robots.txt", () => {
    it("rispetta Disallow del gruppo generico", () => {
      expect(robotsPermette(ROBOTS, "/privato/pagina", "AltroBot")).toBe(false);
      expect(robotsPermette(ROBOTS, "/notizie/pagina", "AltroBot")).toBe(true);
    });
    it("la regola più lunga vince (Allow più specifico)", () => {
      expect(robotsPermette(ROBOTS, "/privato/aperto", "AltroBot")).toBe(true);
    });
    it("gestisce i caratteri jolly", () => {
      expect(robotsPermette(ROBOTS, "/articolo?riservato=1", "AltroBot")).toBe(false);
    });
    it("usa il gruppo dedicato al nostro agente al posto di *", () => {
      expect(robotsPermette(ROBOTS, "/solo-per-noi/x")).toBe(false);
      expect(robotsPermette(ROBOTS, "/privato/pagina")).toBe(true);
    });
    it("rispetta il divieto totale per un agente nominato", () => {
      expect(robotsPermette(ROBOTS, "/qualsiasi", "BotVietato")).toBe(false);
    });
    it("senza regole applicabili è consentito", () => {
      expect(robotsPermette("", "/x")).toBe(true);
    });
  });

  it("unisce senza doppioni e riporta solo i nuovi", () => {
    const vecchi = [r("Via A", "2025-01-01", "https://esempio.test/1")];
    const { tutti, aggiunti } = unisci(vecchi, [r("via a", "2025-01-01", "https://esempio.test/1"), r("Via A", "2025-06-01", "https://esempio.test/2")]);
    expect(aggiunti).toHaveLength(1);
    expect(tutti).toHaveLength(2);
    expect(vecchi).toHaveLength(1);
  });

  it("elenca i luoghi con almeno due date diverse", () => {
    const c = [r("Via A", "2025-01-01", "u1"), r("via a", "2025-06-01", "u2"), r("Via B", "2025-01-01", "u3"), r("Via B", "2025-01-01", "u4")];
    expect(conPiuDate(c)).toEqual([{ nome: "Via A", date: ["2025-01-01", "2025-06-01"] }]);
  });
});
