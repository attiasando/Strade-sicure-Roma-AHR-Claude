# Strade Sicure Roma

> Hackathon **Agentic Hack Rome 2026** (Urbe Hub, 13-14 novembre 2026).
> **In caso di pericolo chiama il 112. Questa app non sostituisce i soccorsi e non è un servizio di Roma Capitale.**

Durante un'allerta meteo a Roma molti si mettono in viaggio senza sapere che il loro percorso passa da sottopassi e strade che si allagano spesso. Strade Sicure Roma controlla il percorso, avvisa se attraversa un punto a rischio e propone un'alternativa che lo aggira, apribile in Google Maps.

**Sito online:** https://attiasando.github.io/Strade-sicure-Roma-AHR-Claude/ (GitHub Pages, build automatica a ogni push su `main`).

## Cosa fa

- **Mappa storica:** punti a rischio ricavati dalla cronaca, ognuno con almeno **due eventi datati** e i link agli articoli.
- **Controllo del percorso:** dato partenza e arrivo, calcola il tragitto normale e cerca i punti a rischio entro 150 m.
- **Percorso alternativo:** con allerta arancione o rossa cerca un tragitto che aggira i punti con almeno due eventi.
- **Apri in Google Maps** (link e QR code), con 2-3 tappe lungo il percorso alternativo.
- **Simulazione del viaggio:** due veicoli partono insieme; quello sul percorso normale si ferma davanti al sottopasso allagato, quello sul percorso alternativo lo aggira.
- **Replay di calcoli reali:** due calcoli veri (Saxa Rubra → Stazione Termini, Ponte di Nona → Stazione Termini) registrati e riproducibili senza nuove richieste.

## Gli agenti

| Agente | Cosa fa | Dove |
| --- | --- | --- |
| Storico (Exa) | Cerca per anno e zona notizie di allagamenti, estrae i luoghi dalle frasi e propone candidati con fonte | `scripts/agente-storico.ts`, `src/lib/estrai.ts` |
| Percorso | Chiama OSRM, trova i punti vicini, prova le alternative e le deviazioni forzate finché ne trova una che aggira tutti i punti | `src/lib/percorso.ts` |
| Replay | Registra un calcolo reale tra luoghi pubblici; non salva nulla se non esiste un'alternativa vera | `scripts/registra-replay.ts` |

## Stato reale e limiti (leggere prima di giudicare)

- **Quattro punti verificati**: sottopasso di via dei Due Ponti, sottopasso di via Collatina (via Longoni), sottopasso della stazione Tiburtina, sottopasso ferroviario di via Pasquale Baffi (Portuense). Per ognuno ci sono due eventi datati (2014-2026): le fonti sono state scaricate e controllate, nominano il luogo e parlano di allagamento.
- **Posizioni:** ricavate da OpenStreetMap a livello di incrocio, galleria o ponte (via Baffi è la meno precisa: circa 75 m). La posizione esatta del sottopasso non è stata verificata sul posto; la nota di ogni punto lo dice.
- **L'allerta non è letta da fonti ufficiali:** il livello (verde, gialla, arancione, rossa) lo sceglie l'utente. Non c'è ancora l'integrazione con Protezione Civile.
- **Nessun avviso vocale** in questa versione.
- **Lo script dell'agente storico con Exa è scritto e le sue funzioni di estrazione sono testate, ma non è stato eseguito con una chiave reale.** Un candidato nuovo non finisce mai in `src/data/punti.json` da solo.
- Il servizio percorsi (OSRM demo) e la ricerca indirizzi (Nominatim) sono servizi pubblici gratuiti: possono essere lenti o limitare le richieste.
- Google Maps può ricalcolare un tracciato diverso. **Nessun percorso è garantito sicuro.**

## Privacy

- Nessun dato personale salvato: non c'è un server né un database.
- Gli indirizzi che scrivi vengono inviati dal tuo browser a **Nominatim** (ricerca indirizzi) e le coordinate a **OSRM** (percorsi). Questa app non li salva né li registra. Il replay usa solo luoghi pubblici.
- Nessuna chiave API nel sito. La chiave Exa serve solo allo script locale dell'agente storico e sta in `.env`, che git ignora.

## Come avviarlo

```bash
npm install
npm run dev        # sviluppo
npm test           # test
npm run build      # build di produzione in dist/
```

Serve Node 20 o successivo (usato: 22).

Agente storico (facoltativo): copia `.env.example` in `.env`, inserisci `EXA_API_KEY`, poi `npm run agente:storico -- 2024 2025`. Scrive `data/candidati-nuovi.json` da controllare a mano.

Nuovo replay: `npm run agente:replay -- "Saxa Rubra" "Stazione Termini" rossa` (non salva se non c'è un'alternativa reale).

## Come aggiungere un punto

1. Trova **due articoli** di eventi diversi che nominano lo stesso luogo e parlano di allagamento.
2. Ricava le coordinate da OpenStreetMap e annota quanto sono precise.
3. Aggiungi il punto a `src/data/punti.json` con `verificato: true` solo se hai controllato fonti e coordinate.

## Tecnologie e dati

React, TypeScript, Vite, Leaflet. Percorsi: [OSRM](https://project-osrm.org/) (servizio demo). Indirizzi: [Nominatim](https://nominatim.org/). Mappa e dati stradali: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL). Confini dei quartieri usati per assegnare il quartiere: Roma Capitale (GeoRoma, dati aperti) tramite il progetto `quartieri-roma-2026` di Urbe Hub.

Ricerca storica: [Exa](https://exa.ai).
