// Generic: scrape detail pages for an event's projects.
// Usage: node scrape-event-details.js <eventSlug> [--all] [--spacing=2500]
//   default  -> only projects with prizeCount > 0
//   --all    -> every project in the listing
// Reads  data/<slug>-live-listing.json
// Writes data/<slug>-details.json  (resumable: re-run to retry failures)
const fs = require('fs');
const { fetchPage } = require('./lib/fetcher');
const { parseDetailPage } = require('./lib/parser-detail');

const slug = process.argv[2];
if (!slug) { console.error('Usage: node scrape-event-details.js <eventSlug> [--all]'); process.exit(1); }
const ALL = process.argv.includes('--all');
const spacingArg = process.argv.find(a => a.startsWith('--spacing='));
const SPACING_MS = spacingArg ? +spacingArg.split('=')[1] : 2500;

const IN = `data/${slug}-live-listing.json`;
const OUT = `data/${slug}-details.json`;

(async () => {
  const list = JSON.parse(fs.readFileSync(IN, 'utf8'));
  const bySlug = new Map(list.map(l => [l.slug, l]));
  const targets = list.filter(l => ALL || l.prizeCount > 0).map(l => l.slug);

  const done = {};
  if (fs.existsSync(OUT)) {
    try { JSON.parse(fs.readFileSync(OUT, 'utf8')).forEach(r => done[r.slug] = r); } catch {}
  }
  const todo = targets.filter(s => !done[s] || done[s]._fail || !done[s].projectDescription);
  console.log(`Targets: ${targets.length} (${ALL ? 'all' : 'winners only'}), to fetch: ${todo.length}, spacing ${SPACING_MS}ms`);

  let ok = 0, fail = 0, n = 0, streak = 0;
  for (const s of todo) {
    n++;
    const l = bySlug.get(s);
    const html = await fetchPage(`https://ethglobal.com/showcase/${s}`);
    if (!html) {
      done[s] = { slug: s, name: l.name, event: l.event, description: l.description, prizes: [], _fail: true };
      fail++; streak++;
      // Five failures in a row means the network is down, not the pages. Save and stop; re-run to resume.
      if (streak >= 5) {
        fs.writeFileSync(OUT, JSON.stringify(Object.values(done), null, 2));
        console.error(`FATAL ${streak} consecutive fetch failures at [${n}/${todo.length}]; stopping (resumable)`);
        process.exit(1);
      }
    } else {
      const d = parseDetailPage(html);
      done[s] = {
        slug: s, name: d.name || l.name, event: l.event, description: l.description,
        projectDescription: d.projectDescription, howItsMade: d.howItsMade, prizes: d.prizes,
        githubUrl: d.githubUrl, demoUrl: d.demoUrl, teamMembers: d.teamMembers,
      };
      ok++; streak = 0;
    }
    if (n % 10 === 0) {
      fs.writeFileSync(OUT, JSON.stringify(Object.values(done), null, 2));
      console.log(`[${n}/${todo.length}] ok=${ok} fail=${fail}`);
    }
    await new Promise(r => setTimeout(r, SPACING_MS));
  }
  fs.writeFileSync(OUT, JSON.stringify(Object.values(done), null, 2));
  const recs = Object.values(done);
  const winners = recs.filter(r => (r.prizes || []).length > 0);
  const finalists = recs.filter(r => (r.prizes || []).some(p => p.placement === 'finalist'));
  console.log(`DONE. ok=${ok} fail=${fail}; file has ${recs.length} records`);
  console.log(`  with prizes: ${winners.length}, finalists: ${finalists.length}`);
  finalists.forEach(f => console.log('  FINALIST: ' + f.name));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
