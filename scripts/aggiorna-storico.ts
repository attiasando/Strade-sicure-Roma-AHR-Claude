// Raccolta dello storico (pensata per girare ogni settimana): Exa + feed RSS + pagine il cui robots.txt lo consente.
// Aggiunge NUOVI candidati a data/candidati-nuovi.json (senza cancellare quelli già presenti); non tocca punti.json.
// Ogni candidato resta da verificare a mano: fonte scaricata, coordinate da OpenStreetMap, almeno 2 eventi.
// Uso:  npm run agente:settimanale                  (anno corrente e precedente, tutte le fonti)
//       npm run agente:settimanale -- 2025 --solo=rss   (anno e fonte a scelta: exa | rss)
// Il riepilogo stampa solo conteggi e nomi dei luoghi, mai estratti di articoli né la chiave.
import fs from "node:fs";
import { estraiLuoghi, interrogazioni } from "../src/lib/estrai";
import { AGENTE, conPiuDate, leggiRss, parlaDiAllagamenti, robotsPermette, senzaTag, unisci, type Raccolto } from "../src/lib/fonti";

const ZONE = ["Prati", "Flaminio", "Tiburtina", "Tor di Quinto", "Portuense", "Ostiense", "EUR", "Montesacro", "Prenestina", "Aurelia", "Collatina", "Cassia"];
/** Feed RSS liberi di testate romane. Aggiungere qui solo feed pubblici. (RomaToday blocca l'accesso automatico: escluso.) */
const FEED = ["https://roma.fanpage.it/feed/"];
const MAX_ARTICOLI = 30;
const PAUSA_MS = 1500;
const USER_AGENT = `${AGENTE}/1.0 (progetto hackathon, repo pubblico attiasando/Strade-sicure-Roma-AHR-Claude)`;
const FILE = new URL("../data/candidati-nuovi.json", import.meta.url);

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));
const argomenti = process.argv.slice(2);
const solo = argomenti.find((a) => a.startsWith("--solo="))?.slice(7);
const anni = argomenti.filter((a) => /^\d{4}$/.test(a)).map(Number);
if (!anni.length) { const y = new Date().getFullYear(); anni.push(y - 1, y); }
const usa = (fonte: string) => !solo || solo === fonte;

function chiaveExa(): string | null {
  if (process.env["EXA_API_KEY"]) return process.env["EXA_API_KEY"];
  try { return fs.readFileSync(new URL("../.env", import.meta.url), "utf8").match(/^EXA_API_KEY=(.+)$/m)?.[1]?.trim() ?? null; } catch { return null; }
}

async function scarica(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xml,text/xml,*/*" }, signal: AbortSignal.timeout(15000) });
    return r.ok ? await r.text() : null;
  } catch { return null; }
}

const robotsCache = new Map<string, string | null>();
/** Pagina consentita solo se il robots.txt è leggibile e la permette; se non si legge, si rinuncia. */
async function consentita(url: string): Promise<boolean> {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) { robotsCache.set(u.origin, await scarica(`${u.origin}/robots.txt`)); await pausa(PAUSA_MS); }
  const robots = robotsCache.get(u.origin);
  return robots != null && robotsPermette(robots, u.pathname + u.search);
}

const raccolti: Raccolto[] = [];
const conta: Record<string, number> = { exa: 0, rss: 0, pagine: 0, paginevietate: 0 };

// 1) Exa: per anno e zona, come l'agente storico.
if (usa("exa")) {
  const key = chiaveExa();
  if (!key) console.error("Exa saltata: manca EXA_API_KEY (variabile d'ambiente o .env locale).");
  else {
    for (const q of interrogazioni(anni, ZONE)) {
      try {
        const r = await fetch("https://api.exa.ai/search", {
          method: "POST", headers: { "x-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, numResults: 5, type: "auto", contents: { text: { maxCharacters: 6000 } } }),
        });
        if (!r.ok) throw new Error(`Exa ${r.status}`);
        const risultati = ((await r.json()) as { results?: { url: string; publishedDate?: string; text?: string }[] }).results ?? [];
        for (const x of risultati) {
          if (!x.text || !/^https?:\/\//.test(x.url)) continue;
          for (const c of estraiLuoghi(x.text)) { raccolti.push({ nome: c.nome, data: (x.publishedDate ?? "").slice(0, 10), fonte: x.url, estratto: c.estratto }); conta["exa"]!++; }
        }
      } catch (e) { console.error(`Ricerca Exa saltata (${(e as Error).message})`); }
      await pausa(400);
    }
  }
}

// 2) RSS + pagine: dalle voci che parlano di allagamenti; l'articolo intero solo se robots.txt lo consente.
if (usa("rss")) {
  let letti = 0;
  for (const feed of FEED) {
    const xml = await scarica(feed);
    if (!xml) { console.error(`Feed non raggiungibile: ${feed}`); continue; }
    for (const v of leggiRss(xml)) {
      if (!parlaDiAllagamenti(`${v.titolo} ${v.testo}`)) continue;
      for (const c of estraiLuoghi(`${v.titolo}. ${v.testo}`)) { raccolti.push({ nome: c.nome, data: v.data, fonte: v.url, estratto: c.estratto }); conta["rss"]!++; }
      if (letti >= MAX_ARTICOLI) continue;
      if (!(await consentita(v.url))) { conta["paginevietate"]!++; continue; }
      letti++;
      const html = await scarica(v.url);
      await pausa(PAUSA_MS);
      if (!html) continue;
      for (const c of estraiLuoghi(senzaTag(html))) { raccolti.push({ nome: c.nome, data: v.data, fonte: v.url, estratto: c.estratto }); conta["pagine"]!++; }
    }
  }
}

let esistenti: Raccolto[] = [];
try { esistenti = JSON.parse(fs.readFileSync(FILE, "utf8")) as Raccolto[]; } catch { /* primo avvio */ }
const { tutti, aggiunti } = unisci(esistenti, raccolti);
fs.mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
fs.writeFileSync(FILE, JSON.stringify(tutti, null, 2));

console.log(`Anni: ${anni.join(", ")} · fonti: ${solo ?? "exa + rss"}`);
console.log(`Trovati: Exa ${conta["exa"]}, RSS ${conta["rss"]}, pagine ${conta["pagine"]} (pagine non consentite da robots.txt o non leggibili: ${conta["paginevietate"]}).`);
console.log(`Nuovi candidati: ${aggiunti.length} · totale nel file: ${tutti.length} (data/candidati-nuovi.json, fuori da git).`);
const primi = conPiuDate(tutti).slice(0, 10);
console.log(primi.length ? `Luoghi con almeno 2 date diverse (da controllare a mano):\n${primi.map((p) => `  - ${p.nome}: ${p.date.join(", ")}`).join("\n")}` : "Nessun luogo con almeno 2 date diverse.");
