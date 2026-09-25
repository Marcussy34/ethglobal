// Backfill every ETHGlobal showcase event into the pipeline. Resumable: re-run to continue.
// Usage: node backfill-events.js [--spacing=2200] [--only=slug1,slug2]
// Reads  data/events.json (the site's event list: slug, name, start date)
// Skips  events already integrated (their name is in data/listings.json) and events
//        whose listing scrape came back empty (no showcase, e.g. everything before HackMoney 2020)
// Per event: scrape-event-listing.js -> scrape-event-details.js --all -> integrate-event.js
// Ends with generate-output.js so the viewer reflects the full dataset.
const fs = require('fs');
const { spawnSync } = require('child_process');

const spacingArg = process.argv.find(a => a.startsWith('--spacing='));
const SPACING = spacingArg ? +spacingArg.split('=')[1] : 2200;
const onlyArg = process.argv.find(a => a.startsWith('--only='));
const ONLY = onlyArg ? new Set(onlyArg.split('=')[1].split(',').filter(Boolean)) : null;

// Finalists announced at the finale but not yet badged on the showcase when scraped (README gotchas)
const MANUAL_FINALISTS = {
  ethonline2026: 'leekdiyhardwarewallet-5qssg,novi-corpus-qtfxd,tare-ozced,openbook-8ngw6,cordon-vw3kh,petri-mjy1y,onchainrouter-8r4jm,eth-arcade-96wyn',
};

function run(args) {
  const r = spawnSync('node', args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${args.join(' ')} exited with ${r.status}`);
}
const integrated = () => new Set(JSON.parse(fs.readFileSync('data/listings.json', 'utf8')).map(l => l.event));
const listingOf = slug => `data/${slug}-live-listing.json`;

const events = JSON.parse(fs.readFileSync('data/events.json', 'utf8')).sort((a, b) => a.start.localeCompare(b.start));
const todo = events.filter(e => (!ONLY || ONLY.has(e.slug)) && !integrated().has(e.name));
console.log(`Backfill: ${todo.length} of ${events.length} events to do, spacing ${SPACING}ms`);

const skipped = [];
todo.forEach((e, i) => {
  console.log(`\n===== [${i + 1}/${todo.length}] ${e.slug} | ${e.name} | ${e.start} =====`);
  if (!fs.existsSync(listingOf(e.slug))) run(['scrape-event-listing.js', e.slug]);
  if (!JSON.parse(fs.readFileSync(listingOf(e.slug), 'utf8')).length) {
    console.log('No showcase projects for this event, skipping.');
    skipped.push(e.slug);
    return;
  }
  run(['scrape-event-details.js', e.slug, '--all', `--spacing=${SPACING}`]);
  const fin = MANUAL_FINALISTS[e.slug];
  run(['integrate-event.js', e.slug, e.name, ...(fin ? [`--finalists=${fin}`] : [])]);
});

run(['generate-output.js']);
if (skipped.length) console.log(`\nEvents with no showcase: ${skipped.join(', ')}`);
console.log('\nBACKFILL DONE');
