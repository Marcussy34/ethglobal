# ETHGlobal showcase dataset

A scraped dataset of every ETHGlobal showcase project. Use it to check if a hackathon
idea already exists, and to study what wins prizes.

**18,693 projects · 69 events · 2020–2026** (7,995 prize winners, 628 finalists)

Coverage is complete: every event on the showcase, verified with `audit-coverage.js`.

## Start here

Everything is committed, so a fresh clone is ready to use. No scraping needed.

- **Brainstorm / validate an idea:** search `ethglobal-showcase.csv` (all 18,693 projects in one file)
  or open `output/ethglobal-showcase.html` in a browser.
- **Study winners of one event:** read `output/corpus-*-winners.md`.
- **Only run `npm install`** if you want to scrape new events or rebuild outputs.

## Where the data lives

| File | Contents | In git? |
|---|---|---|
| `ethglobal-showcase.csv` | The whole dataset as one CSV: 18,693 rows, 69 events. Generated from `data/details.json`. | ✅ (12MB) |
| `data/details.json` | **The source of truth.** Every project with full descriptions, prizes and links | ✅ |
| `data/listings.json` | Listing-level records for the same projects | ✅ |
| `data/<slug>-live-listing.json`, `data/<slug>-details.json` | Per-event scrape results (an empty listing means the event has no showcase) | ✅ |
| `data/progress.json` | Scrape progress and completed detail records | ✅ |
| `data/events.json` | Every showcase event on the site: slug, name, start date | ✅ |
| `output/corpus-*.md` | Compact per-event project lists, ready to read or feed an agent | ✅ |
| `output/ethglobal-showcase.html` | Browsable viewer of the whole dataset (same data as the CSV) | ✅ |

The root CSV is rebuilt from the pipeline. After any change to `data/`, run:

```
node generate-output.js && cp output/ethglobal-showcase.csv .
```

If the CSV is absent, `integrate-event.js` still merges into `data/*.json` but skips the
CSV upsert (it prints a WARN), and `build-idea-corpus.js` falls back to `data/details.json`
(it holds every event). Rebuild the CSV with the command above to bring it back.

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

## Backfill every event

```
node backfill-events.js
```

Walks `data/events.json` oldest-first and runs the three steps above for every event not yet
in `data/listings.json`. Resumable: re-run it after an interruption and it continues. Events
with an empty listing (no showcase) are skipped. Ends with `generate-output.js`.

Options: `--spacing=2200` (detail-page spacing) and `--only=slug1,slug2`.

## Verify coverage

```
node audit-coverage.js
```

Checks every event in `data/events.json` against its showcase listing. Any project missing
from the pipeline, or indexed without details, is fetched and integrated (existing finalists
are kept). Prints a per-event table. Exit code 0 means complete, 1 means a network failure
(re-run it), 2 means gaps remain. Add `--report-only` to check without fetching.

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

**The showcase starts at HackMoney (April 2020).** The nine events before it (ETHWaterloo 2017
to ETHLondonUK 2020) and ETHNYC 2020 return no projects. **Prize data starts at HackFS 2021.**
The eight events from HackMoney 2020 to HackMoney 2021 have projects but no prize or finalist data.

**Detail pages end with ETHGlobal's own footer links** (x.com/ethglobal and others). The detail
parser skips footer links so they are not recorded as a project's demo. An empty `demoUrl`
means the project listed no demo.

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
| `backfill-events.js` | Run the full pipeline for every event not yet integrated (resumable) |
| `audit-coverage.js` | Verify every event is fully indexed and fill any gaps |

`lib/` holds the fetcher, the listing parser and the detail parser.

Older per-event scripts (`scrape-openagents.js`, `integrate-ny2026.js`, and others)
still work but the four generic commands above replace them.

## Setup

```
npm install
```

Requires Node. Dependencies are `cheerio` and `csv-stringify`.
