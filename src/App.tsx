import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import punti from "./data/punti.json";
import replayDati from "./data/replay.json";
import { LIVELLI, type Livello, type PuntoRischio } from "./lib/regole";
import { calcolaPercorso, type Esito, type EsitoOk } from "./lib/percorso";
import { percorsi, ServizioPercorsiNonDisponibile } from "./lib/osrm";
import { cercaLuogo, RicercaNonDisponibile } from "./lib/nominatim";
import { linkGoogleMaps } from "./lib/gmaps";
import { VELOCITA } from "./lib/simulazione";
import type { EventoSimulazione, PercorsoMappa, SimulazioneMappa } from "./components/Mappa";

const Mappa = lazy(() => import("./components/Mappa"));
const PUNTI = punti as PuntoRischio[];
const REPLAY = replayDati as { etichetta: string; partenza: string; arrivo: string; livello: Livello; calcolato_il: string; servizi: string; risultato: EsitoOk };

const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
const min = (s: number) => `${Math.round(s / 60)} min`;

function ApriGoogleMaps({ esito }: { esito: EsitoOk }) {
  const [qr, setQr] = useState<string | null>(null);
  const url = useMemo(() => (esito.sicuro ? linkGoogleMaps(esito.sicuro.linea, esito.vicini.filter((v) => v.evitato)) : ""), [esito]);
  useEffect(() => {
    let attivo = true;
    if (!url) return;
    import("qrcode").then((Q) => Q.toDataURL(url, { width: 160, margin: 1 })).then((d) => { if (attivo) setQr(d); }).catch(() => {});
    return () => { attivo = false; };
  }, [url]);
  if (!url) return null;
  return (
    <div className="gmaps">
      <a className="bottone" href={url} target="_blank" rel="noopener noreferrer">Apri in Google Maps</a>
      {qr && <img src={qr} width={72} height={72} alt="QR code per aprire il percorso alternativo in Google Maps" />}
    </div>
  );
}

function Riepilogo({ esito }: { esito: Esito }) {
  if (!esito.ok) return <div role="alert" className="riquadro errore"><strong>{esito.errore}</strong></div>;
  const { normale, sicuro, vicini, evitaAttivo, alternativaFallita } = esito;
  const aggirati = vicini.filter((v) => v.evitato);
  return (
    <div role="status" className="riquadro">
      <p><strong>Percorso normale (grigio):</strong> {km(normale.distanzaM)} · {min(normale.durataS)}</p>
      {sicuro && <p><strong>Percorso alternativo (verde):</strong> {km(sicuro.distanzaM)} · {min(sicuro.durataS)} — aggira {aggirati.length} {aggirati.length === 1 ? "punto" : "punti"} a rischio</p>}
      {alternativaFallita && <p className="errore"><strong>Non è stato trovato un percorso alternativo che eviti i punti a rischio. Valuta di non metterti in viaggio.</strong></p>}
      {vicini.length === 0 && <p>Nessun punto a rischio verificato entro 150 m dal percorso.</p>}
      {vicini.length > 0 && !evitaAttivo && <p>Il percorso passa vicino a {vicini.length} {vicini.length === 1 ? "punto" : "punti"} storicamente allagat{vicini.length === 1 ? "o" : "i"}: {vicini.map((v) => v.nome).join(", ")}. Con allerta verde o gialla è solo un avviso informativo.</p>}
      {vicini.length > 0 && evitaAttivo && vicini.some((v) => !v.evitato) && <p>Altri punti vicini con meno di 2 eventi registrati: {vicini.filter((v) => !v.evitato).map((v) => v.nome).join(", ")}.</p>}
      {aggirati.map((v) => (
        <p key={v.id} className="piccolo"><strong>{v.nome}</strong>{v.fonti.map((f, i) => <a key={f.fonte + i} href={f.fonte} target="_blank" rel="noopener noreferrer"> Fonte {i + 1} ({f.data.slice(0, 4)})</a>)}</p>
      ))}
      {sicuro && <ApriGoogleMaps esito={esito} />}
      <p className="piccolo">Le informazioni si basano su articoli di cronaca e possono essere incomplete. Google Maps può ricalcolare un tracciato diverso. Nessun percorso è garantito sicuro. Segui le indicazioni della Protezione Civile e in caso di pericolo chiama il <a href="tel:112">112</a>.</p>
    </div>
  );
}

function PannelloSimulazione({ stato, chiave, finita, velocita, messaggi, onAvvia, onPausa, onRicomincia, onVelocita }: {
  stato: SimulazioneMappa["stato"]; chiave: number; finita: boolean; velocita: number; messaggi: string[];
  onAvvia: () => void; onPausa: () => void; onRicomincia: () => void; onVelocita: (v: number) => void;
}) {
  return (
    <section aria-label="Simulazione del viaggio" className="riquadro">
      <strong>Simulazione del viaggio</strong>
      <p className="piccolo">Due veicoli partono insieme alla stessa velocità: uno sul percorso normale (grigio), uno su quello alternativo (verde). Usa i tracciati già calcolati e non fa nuove richieste.</p>
      <div className="riga">
        {stato === "in_corso" ? <button type="button" onClick={onPausa}>Pausa</button>
          : <button type="button" onClick={onAvvia}>{stato === "pausa" ? "Riprendi" : finita ? "Rivedi" : "Avvia simulazione"}</button>}
        {chiave > 0 && <button type="button" className="secondario" onClick={onRicomincia}>Ricomincia</button>}
        <label className="velocita">Velocità <select value={velocita} onChange={(e) => onVelocita(Number(e.target.value))}>{VELOCITA.map((v) => <option key={v} value={v}>{v}x</option>)}</select></label>
      </div>
      <ul aria-live="polite" className="messaggi">{messaggi.map((m) => <li key={m}>{m}</li>)}</ul>
    </section>
  );
}

export default function App() {
  const [replay, setReplay] = useState(true);
  const [livello, setLivello] = useState<Livello>(REPLAY.livello);
  const [partenza, setPartenza] = useState(REPLAY.partenza);
  const [arrivo, setArrivo] = useState(REPLAY.arrivo);
  const [calcolo, setCalcolo] = useState(false);
  const [esito, setEsito] = useState<Esito | null>(REPLAY.risultato);

  function cambiaReplay(attivo: boolean) {
    setReplay(attivo);
    if (attivo) { setLivello(REPLAY.livello); setPartenza(REPLAY.partenza); setArrivo(REPLAY.arrivo); setEsito(REPLAY.risultato); }
    else { setPartenza(""); setArrivo(""); setLivello("verde"); setEsito(null); }
  }

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    if (replay) { setEsito(REPLAY.risultato); return; }
    if (partenza.trim().length < 2 || arrivo.trim().length < 2) { setEsito({ ok: false, errore: "Inserisci partenza e arrivo." }); return; }
    setCalcolo(true); setEsito(null);
    try {
      const a = await cercaLuogo(partenza);
      if (!a) { setEsito({ ok: false, errore: "Partenza non trovata a Roma." }); return; }
      const b = await cercaLuogo(arrivo);
      if (!b) { setEsito({ ok: false, errore: "Arrivo non trovato a Roma." }); return; }
      setEsito(await calcolaPercorso(a, b, livello, PUNTI, (x, y, via, alt) => percorsi(x, y, via, alt)));
    } catch (err) {
      setEsito({ ok: false, errore: err instanceof RicercaNonDisponibile || err instanceof ServizioPercorsiNonDisponibile ? err.message : "Calcolo del percorso non riuscito." });
    } finally { setCalcolo(false); }
  }

  // Oggetto stabile finché non cambia l'esito: l'animazione non deve ripartire a ogni render.
  const mappa: PercorsoMappa = useMemo(
    () => (esito?.ok ? { normale: esito.normale.linea, sicuro: esito.sicuro?.linea ?? null, evidenziati: esito.vicini } : null),
    [esito],
  );

  const [simChiave, setSimChiave] = useState(0);
  const [simStato, setSimStato] = useState<SimulazioneMappa["stato"]>("ferma");
  const [simVelocita, setSimVelocita] = useState<number>(1);
  const [simMessaggi, setSimMessaggi] = useState<string[]>([]);
  const [simFinita, setSimFinita] = useState(false);
  const simulazione: SimulazioneMappa = useMemo(() => ({ chiave: simChiave, stato: simStato, velocita: simVelocita }), [simChiave, simStato, simVelocita]);
  useEffect(() => { setSimChiave(0); setSimStato("ferma"); setSimMessaggi([]); setSimFinita(false); }, [mappa]);

  const ricomincia = () => { setSimChiave((c) => c + 1); setSimMessaggi([]); setSimFinita(false); setSimStato("in_corso"); };
  const avvia = () => { if (simChiave === 0 || simFinita) ricomincia(); else setSimStato("in_corso"); };
  const evento = useCallback((e: EventoSimulazione) => {
    const aggiungi = (m: string) => setSimMessaggi((x) => [...x, m]);
    if (e.tipo === "fermo") aggiungi(`Percorso normale: fermo davanti a «${e.nome}», allagato.`);
    else {
      aggiungi(e.tipo === "arrivo_sicuro" ? "Percorso alternativo: ha aggirato i punti a rischio ed è arrivato a destinazione."
        : e.tipo === "arrivo_libero" ? "Nessun punto da evitare con questo livello di allerta: il percorso normale arriva a destinazione."
        : "Nessun percorso alternativo disponibile: non mettersi in viaggio.");
      setSimFinita(true); setSimStato("ferma");
    }
  }, []);

  return (
    <main className="app">
      <div className="area-mappa">
        <Suspense fallback={<div className="mappa" />}>
          <Mappa punti={PUNTI} percorso={mappa} simulazione={simulazione} onEvento={evento} />
        </Suspense>
      </div>

      <div className="pannello">
        <div className="titolo"><strong>Strade Sicure Roma</strong><a href="#come-funziona">Come funziona</a></div>

        <label className="riquadro riga interruttore">
          <span><strong>Replay di un calcolo reale</strong></span>
          <input type="checkbox" role="switch" checked={replay} onChange={(e) => cambiaReplay(e.target.checked)} disabled={calcolo} />
        </label>
        {replay && <p className="piccolo">Calcolo reale del {new Date(REPLAY.calcolato_il).toLocaleString("it-IT")}: {REPLAY.etichetta}. Percorsi da OpenStreetMap (OSRM), registrati e riprodotti senza nuove richieste.</p>}

        <header className={`allerta allerta-${livello}`}>
          <div><span className="piccolo">Livello di allerta (scelto da te)</span><strong>Allerta {livello}</strong></div>
          {!replay && <select aria-label="Livello di allerta" value={livello} onChange={(e) => setLivello(e.target.value as Livello)}>{LIVELLI.map((l) => <option key={l} value={l}>{l}</option>)}</select>}
        </header>
        <p className="piccolo">L'app non legge ancora l'allerta ufficiale: scegli tu lo scenario da simulare.</p>

        <form onSubmit={invia} className="riquadro">
          <label>Partenza<input value={partenza} readOnly={replay} onChange={(e) => setPartenza(e.target.value)} placeholder="Es. Piazza del Popolo" autoComplete="off" /></label>
          <label>Arrivo<input value={arrivo} readOnly={replay} onChange={(e) => setArrivo(e.target.value)} placeholder="Es. Stazione Termini" autoComplete="off" /></label>
          <button type="submit" disabled={calcolo}>{calcolo ? "Calcolo in corso…" : "Controlla percorso"}</button>
          {!replay && <p className="piccolo">Gli indirizzi vengono inviati a Nominatim e a OSRM per trovare le coordinate e il percorso. Questa app non li salva.</p>}
        </form>

        {esito && <Riepilogo esito={esito} />}
        {esito?.ok && (
          <PannelloSimulazione stato={simStato} chiave={simChiave} finita={simFinita} velocita={simVelocita} messaggi={simMessaggi}
            onAvvia={avvia} onPausa={() => setSimStato("pausa")} onRicomincia={ricomincia} onVelocita={setSimVelocita} />
        )}

        <details id="come-funziona" className="riquadro">
          <summary><strong>Come funziona</strong></summary>
          <p className="piccolo">1. <strong>Mappa storica:</strong> {PUNTI.length} punti verificati, ognuno con almeno due eventi di cronaca e link alle fonti. L'agente storico (script con Exa) cerca nuove notizie; ogni punto passa da un controllo di fonti e coordinate prima di essere usato.</p>
          <p className="piccolo">2. <strong>Percorso:</strong> calcola il tragitto normale, controlla i punti a rischio entro 150 m e, con allerta arancione o rossa, cerca un'alternativa che li aggiri.</p>
          <p className="piccolo">3. <strong>Limiti:</strong> pochi punti, posizioni precise al livello dell'incrocio, nessuna previsione ufficiale. Non sostituisce i soccorsi.</p>
          <p className="piccolo">Dati: © OpenStreetMap contributors (ODbL), OSRM, Nominatim; confini quartieri: Roma Capitale (GeoRoma, dati aperti).</p>
        </details>
      </div>

      <footer className="avviso-112">In caso di pericolo chiama il <a href="tel:112">112</a>. Questa app non sostituisce i soccorsi.</footer>
    </main>
  );
}
