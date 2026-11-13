// Estrazione dei luoghi da un testo di cronaca (usata dall'agente storico). Funzioni pure, testabili.
// Euristica semplice e prudente: restituisce SOLO candidati da verificare, mai punti già pronti.

const PAROLE_ALLAGAMENTO = /allag|alluvion|sottopass\w*\s+(?:chius|invas|sott['’]acqua)|esond|bomba d['’]acqua/i;
// "sottopasso di via dei Due Ponti", "via Collatina", "Lungotevere in Sassia", "viale del Muro Torto", ...
const LUOGO =
  /\b(sottopass\w*\s+(?:di|del|della|dei|degli|dell['’])\s*)?((?:[Vv]ia|[Vv]iale|[Pp]iazza|[Ll]argo|[Ll]ungotevere|[Cc]irconvallazione)\s+(?:(?:di|del|della|dei|degli|delle|dell['’]|in)\s*)?[A-ZÀ-Ý][\w'’.-]*(?:\s+(?:(?:di|del|della|dei|in)\s+)?[A-ZÀ-Ý][\w'’.-]*){0,3})/g;

export type Candidato = { nome: string; estratto: string };

/** Frasi del testo che parlano di allagamenti e nominano una strada. Duplicati rimossi. */
export function estraiLuoghi(testo: string): Candidato[] {
  const frasi = testo.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
  const visti = new Set<string>();
  const out: Candidato[] = [];
  for (const f of frasi) {
    if (!PAROLE_ALLAGAMENTO.test(f)) continue;
    for (const m of f.matchAll(LUOGO)) {
      const nome = `${m[1] ? "Sottopasso " + m[1].replace(/^sottopass\w*\s+/i, "") : ""}${m[2]}`.replace(/\s+/g, " ").trim().replace(/[.\-'’]+$/, "");
      const chiave = nome.toLowerCase();
      if (visti.has(chiave) || nome.length < 8) continue;
      visti.add(chiave);
      out.push({ nome, estratto: f.slice(0, 240) });
    }
  }
  return out;
}

/** Interrogazioni per l'agente: per anno e per zona di Roma. */
export function interrogazioni(anni: number[], zone: string[]): string[] {
  return anni.flatMap((a) => zone.map((z) => `allagamento sottopasso strada ${z} Roma maltempo ${a}`));
}
