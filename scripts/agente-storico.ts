// Agente storico: cerca con Exa notizie di cronaca su allagamenti a Roma e propone NUOVI luoghi candidati.
//   1) interroga Exa per anno e zona; 2) estrae strade e sottopassi dalle frasi sugli allagamenti;
//   3) scrive data/candidati-nuovi.json con nome, data, URL e frase di origine.
// NON aggiunge nulla a punti.json: ogni candidato va controllato (fonte, coordinate, ≥2 eventi) prima di essere usato.
// Uso: copia .env.example in .env, inserisci EXA_API_KEY, poi `npm run agente:storico -- 2024 2025`.
import fs from "node:fs";
import { estraiLuoghi, interrogazioni } from "../src/lib/estrai";

const ZONE = ["Prati", "Flaminio", "Tiburtina", "Tor di Quinto", "Portuense", "Ostiense", "EUR", "Montesacro", "Prenestina", "Aurelia", "Collatina", "Cassia"];

function chiave(): string {
  if (process.env["EXA_API_KEY"]) return process.env["EXA_API_KEY"];
  try {
    const m = fs.readFileSync(new URL("../.env", import.meta.url), "utf8").match(/^EXA_API_KEY=(.+)$/m);
    if (m?.[1]) return m[1].trim();
  } catch { /* nessun .env */ }
  throw new Error("Manca EXA_API_KEY: copia .env.example in .env e inserisci la chiave (il file .env non va mai su git).");
}

type RisultatoExa = { url: string; title?: string; publishedDate?: string; text?: string };

async function cerca(query: string, key: string): Promise<RisultatoExa[]> {
  const r = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ query, numResults: 5, type: "auto", contents: { text: { maxCharacters: 6000 } } }),
  });
  if (!r.ok) throw new Error(`Exa ${r.status}`);
  return ((await r.json()) as { results?: RisultatoExa[] }).results ?? [];
}

const anni = process.argv.slice(2).filter((a) => /^\d{4}$/.test(a)).map(Number);
if (!anni.length) throw new Error("Indica almeno un anno, es. `npm run agente:storico -- 2024`.");
const key = chiave();
const trovati = new Map<string, { nome: string; data: string; fonte: string; estratto: string }>();

for (const q of interrogazioni(anni, ZONE)) {
  let risultati: RisultatoExa[] = [];
  try { risultati = await cerca(q, key); } catch (e) { console.error(`Ricerca saltata (${(e as Error).message}): ${q}`); continue; }
  for (const x of risultati) {
    if (!x.text || !/^https?:\/\//.test(x.url)) continue;
    for (const c of estraiLuoghi(x.text)) {
      const k = `${c.nome.toLowerCase()}|${x.url}`;
      if (!trovati.has(k)) trovati.set(k, { nome: c.nome, data: (x.publishedDate ?? "").slice(0, 10), fonte: x.url, estratto: c.estratto });
    }
  }
  await new Promise((r) => setTimeout(r, 400)); // gentile con l'API
}

const uscita = new URL("../data/candidati-nuovi.json", import.meta.url);
fs.mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
fs.writeFileSync(uscita, JSON.stringify([...trovati.values()], null, 2));
console.log(`${trovati.size} candidati scritti in data/candidati-nuovi.json (da verificare a mano: fonte, coordinate, almeno 2 eventi).`);
