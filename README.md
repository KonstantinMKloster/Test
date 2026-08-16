# Politik YouTube Digest

Webapp, die die Inhalte ausgewählter politischer YouTube-Kanäle beobachtet und
**alle 6 Stunden automatisch** eine kurze Zusammenfassung neuer Videos schreibt
– jeweils **mit Link zur Quelle** (Original-Video).

Beobachtete Kanäle (siehe [`config/channels.json`](config/channels.json)):

- Clownswelt (`@Clownswelt`)
- DerDara (`@DerDaraUncut`)
- HeyWolfi (`@heyWolfi`)
- NIUS (`@NiusDE`)

> Die Channel-IDs wurden per Web-Recherche ermittelt. Prüfe sie einmal, indem
> du `npm run scrape` laufen lässt und kontrollierst, ob die richtigen Videos
> auftauchen – falls YouTube eine ID geändert hat oder ich mich vertan habe,
> einfach in `config/channels.json` korrigieren (`channelId` = die `UC...`-ID
> aus der Kanal-URL `youtube.com/channel/UC...`).

## Wie es funktioniert

1. **Scraping ohne API-Key**: `scripts/scrape.mjs` liest pro Kanal den
   öffentlichen RSS-Feed (`youtube.com/feeds/videos.xml?channel_id=...`) –
   das ist kostenlos, braucht keinen Google-API-Key und kein Quota-Limit.
2. **Transkript (best effort)**: Für jedes neue Video wird versucht, das
   Untertitel-Transkript von der Watch-Seite zu laden (inoffiziell, kann bei
   YouTube-Layout-Änderungen brechen). Gibt es kein Transkript, wird die
   RSS-Videobeschreibung als Fallback-Text genutzt.
3. **Zusammenfassung**:
   - **Standard, kostenlos, kein Key nötig**: lokale extraktive
     Zusammenfassung (Häufigkeits-Scoring der Sätze, `src/lib/summarize.mjs`).
   - **Optional, bessere Qualität**: Wird ein `OPENAI_API_KEY` als Secret
     hinterlegt, nutzt das Skript automatisch OpenAI für eine echte
     KI-Zusammenfassung in Stichpunkten.
4. **Speicherung**: Ergebnisse landen in [`data/summaries.json`](data/summaries.json)
   (Titel, Kanal, Datum, Zusammenfassung, **Quelle/Video-URL**).
5. **Webapp**: `index.html` + `assets/app.js` laden `data/summaries.json` und
   zeigen die Zusammenfassungen als durchsuch- und filterbare Karten an –
   rein statisch, kein Backend nötig.
6. **Automatisierung**: [`.github/workflows/scrape.yml`](.github/workflows/scrape.yml)
   führt den Scraper per GitHub-Actions-Cron **alle 6 Stunden** aus und
   committet die aktualisierten Daten zurück ins Repo.

## Lokal starten

```bash
npm install
npm run scrape   # einmaliger Scrape-Lauf, füllt data/summaries.json
npm run dev      # Webapp unter http://localhost:3000
```

## Deployment / Automatisierung aktivieren

1. **Diesen Branch mergen** – GitHub führt Scheduled Workflows nur im
   Default-Branch aus. Erst nach dem Merge startet der 6h-Rhythmus.
2. **(Optional) OpenAI aktivieren**: Repo → Settings → Secrets and variables →
   Actions → New repository secret → `OPENAI_API_KEY`. Ohne diesen Secret
   läuft alles trotzdem, dann eben mit der kostenlosen lokalen Zusammenfassung.
3. **Webapp hosten**: Repo → Settings → Pages → Deploy from branch → `main` /
   `/ (root)`. Danach ist die Seite unter der GitHub-Pages-URL erreichbar und
   aktualisiert sich alle 6 Stunden automatisch mit.
4. **Manuell testen**: Repo → Actions → "Scrape & Zusammenfassung (alle 6
   Stunden)" → "Run workflow", um sofort einen Lauf auszulösen statt zu warten.

## Kanäle anpassen

Einfach [`config/channels.json`](config/channels.json) editieren:

```json
{ "name": "Anzeigename", "handle": "@handle", "channelId": "UCxxxxxxxxxxxxxxxxxxxxxx" }
```

Die `channelId` findest du, indem du auf der Kanal-Seite auf "..." → "Kanal
teilen" → "Kanal-ID kopieren" klickst, oder im Seitenquelltext nach
`"channelId":"UC` suchst.

## Grenzen & Hinweise

- Das Transkript-Scraping nutzt keine offizielle, dokumentierte API – es kann
  brechen, wenn YouTube etwas ändert. Der Code fällt dann automatisch auf die
  Videobeschreibung zurück, ein Lauf schlägt dadurch nicht komplett fehl.
- Es werden **nur Zusammenfassungen mit Link zur Quelle** gespeichert/gezeigt,
  keine vollständigen Transkripte oder Video-Inhalte – für den fairen Umgang
  mit fremden Inhalten (Zitat-/Berichterstattungszweck) bitte so beibehalten.
- Die lokale Zusammenfassung ist einfach (extraktiv) und kann holprig wirken;
  für bessere Qualität lohnt sich der `OPENAI_API_KEY`.
