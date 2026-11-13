// Raccolta settimanale dello storico: funzioni pure (RSS, robots.txt, unione dei candidati).
// Nessuna rete qui dentro: il fetch sta negli script, così tutto si può testare con dati finti.
// Produce solo CANDIDATI da verificare, mai punti già verificati.

export type Voce = { titolo: string; url: string; data: string; testo: string };
export type Raccolto = { nome: string; data: string; fonte: string; estratto: string };

/** Nome con cui lo script si presenta ai siti (anche per robots.txt). */
export const AGENTE = "StradeSicureRomaBot";

const ENTITA: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'", "&nbsp;": " ", "&rsquo;": "’", "&lsquo;": "‘" };
const decodifica = (s: string) => s.replace(/&(?:amp|lt|gt|quot|#39|#x27|nbsp|rsquo|lsquo);/g, (e) => ENTITA[e] ?? e);

/** Testo leggibile da un frammento HTML (senza script e stili). */
export const senzaTag = (html: string): string =>
  decodifica(html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const tag = (blocco: string, nome: string): string => {
  const m = blocco.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, "i"));
  return m ? senzaTag(m[1]!.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")) : "";
};

/** Voci di un feed RSS 2.0. Le voci senza titolo o senza indirizzo http(s) vengono scartate. */
export function leggiRss(xml: string): Voce[] {
  const voci: Voce[] = [];
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const b = m[1]!;
    const titolo = tag(b, "title");
    const url = tag(b, "link");
    if (!titolo || !/^https?:\/\//.test(url)) continue;
    const t = new Date(tag(b, "pubDate"));
    voci.push({ titolo, url, data: Number.isNaN(t.getTime()) ? "" : t.toISOString().slice(0, 10), testo: tag(b, "description") || tag(b, "content:encoded") });
  }
  return voci;
}

/** Il testo parla di allagamenti? (filtro grossolano prima di scaricare un articolo intero) */
export const parlaDiAllagamenti = (t: string): boolean => /allag|alluvion|nubifragi|bomba d['’]acqua|esond/i.test(t);

const regola = (p: string): RegExp =>
  new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));

/**
 * Il robots.txt consente a `agente` di leggere `percorso` (con eventuale query)?
 * Usa il gruppo col nome dell'agente, altrimenti `*`; vince la regola più lunga, a parità Allow.
 * Nessuna regola applicabile = consentito. Un robots.txt non leggibile va trattato come "non consentito" da chi chiama.
 */
export function robotsPermette(robots: string, percorso: string, agente: string = AGENTE): boolean {
  const gruppi: { agenti: string[]; regole: { permesso: boolean; modello: string }[] }[] = [];
  let corrente: (typeof gruppi)[number] | null = null;
  let leggendoAgenti = false;
  for (const riga of robots.split(/\r?\n/)) {
    const m = riga.replace(/#.*/, "").match(/^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*$/);
    if (!m) continue;
    const k = m[1]!.toLowerCase(), v = m[2]!;
    if (k === "user-agent") {
      if (!leggendoAgenti || !corrente) { corrente = { agenti: [], regole: [] }; gruppi.push(corrente); }
      corrente.agenti.push(v.toLowerCase());
      leggendoAgenti = true;
    } else if ((k === "allow" || k === "disallow") && corrente) {
      leggendoAgenti = false;
      if (v) corrente.regole.push({ permesso: k === "allow", modello: v });
    } else leggendoAgenti = false;
  }
  const nome = agente.toLowerCase();
  const gruppo = gruppi.find((g) => g.agenti.some((a) => a !== "*" && nome.includes(a))) ?? gruppi.find((g) => g.agenti.includes("*"));
  if (!gruppo) return true;
  let migliore: { permesso: boolean; lunghezza: number } | null = null;
  for (const r of gruppo.regole) {
    if (!regola(r.modello).test(percorso)) continue;
    const lunghezza = r.modello.length;
    if (!migliore || lunghezza > migliore.lunghezza || (lunghezza === migliore.lunghezza && r.permesso)) migliore = { permesso: r.permesso, lunghezza };
  }
  return migliore ? migliore.permesso : true;
}

/** Unisce i nuovi candidati a quelli già noti, senza doppioni (stesso nome e stessa fonte). */
export function unisci(esistenti: Raccolto[], nuovi: Raccolto[]): { tutti: Raccolto[]; aggiunti: Raccolto[] } {
  const chiave = (c: Raccolto) => `${c.nome.toLowerCase()}|${c.fonte}`;
  const visti = new Set(esistenti.map(chiave));
  const aggiunti: Raccolto[] = [];
  for (const c of nuovi) {
    if (visti.has(chiave(c))) continue;
    visti.add(chiave(c));
    aggiunti.push(c);
  }
  return { tutti: [...esistenti, ...aggiunti], aggiunti };
}

/** Luoghi con almeno `minimo` date diverse: i primi da controllare a mano. */
export function conPiuDate(candidati: Raccolto[], minimo = 2): { nome: string; date: string[] }[] {
  const per = new Map<string, { nome: string; date: Set<string> }>();
  for (const c of candidati) {
    const k = c.nome.toLowerCase();
    const e = per.get(k) ?? { nome: c.nome, date: new Set<string>() };
    if (c.data) e.date.add(c.data);
    per.set(k, e);
  }
  return [...per.values()].filter((e) => e.date.size >= minimo).map((e) => ({ nome: e.nome, date: [...e.date].sort() })).sort((a, b) => b.date.length - a.date.length);
}
