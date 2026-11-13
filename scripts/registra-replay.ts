// Registra un calcolo REALE (percorso normale + alternativa) tra due luoghi pubblici, per il "Replay" dell'app.
// Usa gli stessi moduli dell'app e i servizi pubblici OSRM e Nominatim. Nessun dato inventato:
// se non c'è un'alternativa che aggira un punto verificato con ≥2 eventi, non salva nulla.
//   npx vite-node scripts/registra-replay.ts -- --prova            (stampa la vicinanza ai punti, non salva)
//   npx vite-node scripts/registra-replay.ts -- "Piazza del Popolo" "Prima Porta" rossa   (calcola e salva)
import fs from "node:fs";
import { calcolaPercorso, puntiVicini } from "../src/lib/percorso";
import { sceglieLuogo, urlRicerca } from "../src/lib/nominatim";
import { percorsi } from "../src/lib/osrm";
import type { Livello, PuntoRischio } from "../src/lib/regole";
import punti from "../src/data/punti.json";

const LUOGHI_PUBBLICI = ["Piazza del Popolo", "Stazione Termini", "Colosseo", "Piazza San Pietro", "Stazione Roma Ostiense", "Stazione Roma Tiburtina", "Stadio Olimpico", "Ponte Milvio", "Saxa Rubra", "Prima Porta", "Piazza di Spagna", "Stazione Roma Prima Porta"];
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function geocodifica(nome: string) {
  await pausa(1200);
  const r = await fetch(urlRicerca(nome), { headers: { "User-Agent": "StradeSicureRoma-hackathon (registra-replay)" } });
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  const l = sceglieLuogo(await r.json());
  if (!l) throw new Error(`Luogo non trovato a Roma: ${nome}`);
  return l;
}

const args = process.argv.slice(2).filter((a) => a !== "--");
if (args[0] === "--prova") {
  const nomi = args.slice(1).length ? args.slice(1) : LUOGHI_PUBBLICI;
  const luoghi: Record<string, Awaited<ReturnType<typeof geocodifica>>> = {};
  for (const n of nomi) { try { luoghi[n] = await geocodifica(n); } catch (e) { console.log("saltato", n, (e as Error).message); } }
  const nomiOk = Object.keys(luoghi);
  for (const da of nomiOk) for (const a of nomiOk) {
    if (da === a) continue;
    await pausa(600);
    const t = (await percorsi(luoghi[da]!, luoghi[a]!))[0];
    if (!t) continue;
    const v = puntiVicini(t.linea, punti as PuntoRischio[], "rossa");
    if (v.length) console.log(`${da} → ${a}: ${(t.distanzaM / 1000).toFixed(1)} km, vicini: ${v.map((x) => x.id + (x.evitato ? "*" : "")).join(", ")}`);
  }
  console.log("fine prova (* = da aggirare con allerta rossa)");
} else {
  const [da, a, livello = "rossa"] = args as [string, string, Livello?];
  if (!da || !a) throw new Error("Uso: registra-replay.ts <partenza> <arrivo> [livello]");
  const A = await geocodifica(da), B = await geocodifica(a);
  const esito = await calcolaPercorso(A, B, livello, punti as PuntoRischio[], (x, y, via, alt) => percorsi(x, y, via, alt));
  if (!esito.ok) throw new Error(esito.errore);
  if (!esito.sicuro || esito.alternativaFallita) throw new Error("Nessuna alternativa reale: nulla salvato.");
  if (!esito.vicini.some((v) => v.evitato)) throw new Error("Nessun punto aggirato: nulla salvato.");
  const replay = { etichetta: `${da} → ${a}`, partenza: da, arrivo: a, livello, calcolato_il: new Date().toISOString(), servizi: "OSRM (router.project-osrm.org) e Nominatim, dati © OpenStreetMap contributors (ODbL)", risultato: esito };
  // replay.json è un elenco: aggiunge o sostituisce il replay con la stessa etichetta (accetta anche il vecchio formato a oggetto singolo).
  const file = new URL("../src/data/replay.json", import.meta.url);
  let elenco: { etichetta: string }[] = [];
  try { const letto = JSON.parse(fs.readFileSync(file, "utf8")); elenco = Array.isArray(letto) ? letto : [letto]; } catch { /* primo replay */ }
  elenco = [...elenco.filter((r) => r.etichetta !== replay.etichetta), replay];
  fs.writeFileSync(file, JSON.stringify(elenco));
  console.log(`Salvato replay: ${replay.etichetta}, normale ${(esito.normale.distanzaM / 1000).toFixed(1)} km, alternativa ${(esito.sicuro.distanzaM / 1000).toFixed(1)} km, aggira ${esito.vicini.filter((v) => v.evitato).map((v) => v.nome).join("; ")}`);
}
