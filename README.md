# ETHGlobal showcase dataset

A scraped dataset of every ETHGlobal showcase project. Use it to check if a hackathon
idea already exists, and to study what wins prizes.

**17,881 projects · 68 events · 2015–2026**

## Where the data lives

| File | Contents | In git? |
|---|---|---|
| `ethglobal-showcase.csv` | **The real dataset.** 17,881 rows, 68 events. | ❌ gitignored (12MB) — keep a copy in Google Drive |
| `data/details.json` | Pipeline subset: 6,119 projects, 15 events, with full descriptions | ✅ |
| `data/listings.json` | Listing-level records for the same subset | ✅ |
| `data/progress.json` | Scrape progress and completed detail records | ✅ |
| `output/corpus-*.md` | Compact per-event project lists, ready to read or feed an agent | ✅ |

⚠️ **Copy `ethglobal-showcase.csv` back into the repo root before you run anything.**
The scripts read it directly. It is not generated from `data/*.json` and cannot be —
it holds far more events than the pipeline does.

### CSV columns

`Project Name, Event, Description, Prize Count, Prize 1..Prize 12, All Sponsors, GitHub, Demo, URL`

Descriptions contain commas and newlines. Always parse with a quoted-field parser.
Never use `split(',')`.

## Add a new event

Four commands. Replace `<slug>` with the event slug from the showcase URL.

1. Scrape the listing:
   ```
   node scrape-event-listing.js <slug>
   ```
2. Scrape the detail pages:
   ```
   node scrape-event-details.js <slug> --all --spacing=2200
   ```
3. Merge into the dataset:
   ```
   node integrate-event.js <slug> "<Event Name>"
   ```
4. Regenerate the viewer:
   ```
   node generate-output.js
   ```

### Options

- `scrape-event-details.js` — omit `--all` to fetch winners only. The script is
  **resumable**. Re-run it to retry failures.
- `integrate-event.js` — add `--finalists=slug1,slug2` only when the site has not
  posted finalist badges yet. Normally it detects them automatically.

## Build a corpus to read

```
node build-idea-corpus.js "ETHGlobal Lisbon 2026" --winners-only
```

Writes `output/corpus-<event>.md`. Finalists appear first. Omit `--winners-only`
for every project in the event.

## Gotchas

**Event slugs differ from event names.** Check the showcase URL first.
`openagents` is Open Agents 2026. `agents` is Agentic Ethereum 2025 — a different event.
`lisbon2026` is a different event from `lisbon` (2023). The same applies to `newyork2026`.

**Listing pages return duplicate cards.** Always dedupe by slug. Lisbon 2026 returned
178 entries for 173 distinct projects.

**Finalists carry badge org-id `xdat5`.** The scraper detects this automatically.
Right after an event the badges may not be live yet. Supply the list manually then.

**ETHGlobal rate-limits hard.** Use 2200ms spacing or slower. At that rate, 173 detail
pages took about 13 minutes with zero failures.

**Back up before you integrate.** Copy the CSV, run the integration, then confirm two
things: the new file starts with the old file byte-for-byte (a pure append), and no row
has the wrong field count. Check for slug collisions first — the upsert matches on the
URL-column slug and would otherwise overwrite a row from another event.

## Scripts

| Script | Purpose |
|---|---|
| `scrape-event-listing.js` | Scrape one event's listing pages, dedupe by slug |
| `scrape-event-details.js` | Scrape detail pages for an event (resumable) |
| `integrate-event.js` | Merge an event into the pipeline and the root CSV |
| `build-idea-corpus.js` | Write a compact markdown corpus for one event |
| `generate-output.js` | Regenerate `output/` CSV and HTML viewer |

`lib/` holds the fetcher, the listing parser and the detail parser.

Older per-event scripts (`scrape-openagents.js`, `integrate-ny2026.js`, and others)
still work but the four generic commands above replace them.

## Setup

```
npm install
```

Requires Node. Dependencies are `cheerio` and `csv-stringify`.
