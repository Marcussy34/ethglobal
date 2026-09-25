// Verify every ETHGlobal showcase event is fully indexed, and fill any gaps. Safe to re-run.
// Usage: node audit-coverage.js [--spacing=2200] [--report-only]
// For each event in data/events.json:
//   - no listing file, or an empty one -> scrape the listing (confirms "no showcase" events too)
//   - gap = listing projects missing from the pipeline, or pipeline projects without details
//   - on a gap: seed data/<slug>-details.json from the pipeline so only the gaps are fetched,
//     scrape details, then re-integrate (existing finalists are passed through, so manual
//     finalist lists such as ETHOnline 2026 survive)
// Exit 0 = every event complete, 1 = network failure (re-run), 2 = gaps remain after filling.
const fs = require('fs');
const { spawnSync } = require('child_process');

const spacingArg = process.argv.find(a => a.startsWith('--spacing='));
const SPACING = spacingArg ? +spacingArg.split('=')[1] : 2200;
const REPORT_ONLY = process.argv.includes('--report-only');

const readJSON = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const isFinalist = p => (p.prizes || []).some(x => /finalist/i.test(x.placement || ''));
// Child scripts exit non-zero only on network failure, so stop and let the caller retry
function run(args) {
  const r = spawnSync('node', args, { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`NETWORK? ${args.join(' ')} exited ${r.status}`); process.exit(1); }
}

// Gaps for one event: listing slugs absent from the pipeline, plus pipeline rows never detailed
function gapsOf(e, listing) {
  const pipe = readJSON('data/details.json').filter(p => p.event === e.name);
  const inPipe = new Set(pipe.map(p => p.slug));
  const missing = [...new Set(listing.map(l => l.slug))].filter(s => !inPipe.has(s));
  const unscraped = pipe.filter(p => !p.scraped).map(p => p.slug);
  return { pipe, missing, unscraped };
}

// Seed the per-event details file with records the pipeline already has, so the resumable
// detail scraper only fetches what is missing
function seedDetails(e, pipe) {
  const file = `data/${e.slug}-details.json`;
  const have = fs.existsSync(file) ? readJSON(file) : [];
  const bySlug = new Map(have.map(r => [r.slug, r]));
  for (const p of pipe.filter(p => p.scraped && p.projectDescription)) {
    if (!bySlug.has(p.slug) || bySlug.get(p.slug)._fail) bySlug.set(p.slug, {
      slug: p.slug, name: p.name, event: p.event, description: p.description,
      projectDescription: p.projectDescription, howItsMade: p.howItsMade, prizes: p.prizes,
      githubUrl: p.githubUrl, demoUrl: p.demoUrl, teamMembers: p.teamMembers,
    });
  }
  fs.writeFileSync(file, JSON.stringify([...bySlug.values()], null, 2));
}

const events = readJSON('data/events.json').sort((a, b) => a.start.localeCompare(b.start));
const report = [];
for (const e of events) {
  const lf = `data/${e.slug}-live-listing.json`;
  const needsListing = !fs.existsSync(lf) || readJSON(lf).length === 0;
  if (needsListing && !REPORT_ONLY) run(['scrape-event-listing.js', e.slug]);
  const listing = fs.existsSync(lf) ? readJSON(lf) : null;
  if (!listing) { report.push({ e, status: 'NO LISTING' }); continue; }
  if (!listing.length) { report.push({ e, status: 'no showcase' }); continue; }

  let g = gapsOf(e, listing);
  if ((g.missing.length || g.unscraped.length) && !REPORT_ONLY) {
    console.log(`\n== fill ${e.slug}: ${g.missing.length} missing, ${g.unscraped.length} without details ==`);
    seedDetails(e, g.pipe);
    run(['scrape-event-details.js', e.slug, '--all', `--spacing=${SPACING}`]);
    const fin = g.pipe.filter(isFinalist).map(p => p.slug);
    run(['integrate-event.js', e.slug, e.name, ...(fin.length ? [`--finalists=${fin.join(',')}`] : [])]);
    g = gapsOf(e, listing);
  }
  const gap = g.missing.length + g.unscraped.length;
  report.push({ e, listing: new Set(listing.map(l => l.slug)).size, pipe: g.pipe.length,
    winners: g.pipe.filter(p => (p.prizes || []).length).length, finalists: g.pipe.filter(isFinalist).length,
    gap, status: gap ? `GAP ${g.missing.length} missing, ${g.unscraped.length} undetailed` : 'OK' });
}

console.log('\nevent'.padEnd(24) + 'name'.padEnd(30) + 'listing  indexed  winners  finalists  status');
for (const r of report) {
  const n = v => String(v ?? '-').padStart(7);
  console.log(r.e.slug.padEnd(23) + r.e.name.padEnd(30) + n(r.listing) + '  ' + n(r.pipe) + '  ' + n(r.winners) + '  ' + n(r.finalists) + '    ' + r.status);
}
const ok = report.filter(r => r.status === 'OK'), gaps = report.filter(r => /GAP|NO LISTING/.test(r.status));
console.log(`\nComplete: ${ok.length} events, ${ok.reduce((a, r) => a + r.pipe, 0)} projects | no showcase: ${report.filter(r => r.status === 'no showcase').length} | with gaps: ${gaps.length}`);
process.exit(gaps.length ? 2 : 0);
