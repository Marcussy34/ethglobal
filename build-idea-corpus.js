// Build a compact markdown corpus of an event's projects for idea review.
// Usage: node build-idea-corpus.js "<Event Name>" [--winners-only] [--out=path]
const fs = require('fs');

const EVENT = process.argv[2];
if (!EVENT) { console.error('Usage: node build-idea-corpus.js "<Event Name>" [--winners-only]'); process.exit(1); }
const WINNERS_ONLY = process.argv.includes('--winners-only');
const outArg = process.argv.find(a => a.startsWith('--out='));

function parseCSV(text){const rows=[];let row=[],field="",inQ=false;for(let i=0;i<text.length;i++){const c=text[i];if(inQ){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else inQ=false;}else field+=c;}else{if(c==='"')inQ=true;else if(c===","){row.push(field);field="";}else if(c==="\n"){row.push(field);rows.push(row);row=[];field="";}else if(c==="\r"){}else field+=c;}}if(field.length||row.length){row.push(field);rows.push(row);}return rows;}

// Fallback when the gitignored root CSV is absent: synthesise the same column layout from
// data/details.json so the corpus still builds. Only pipeline events are available this way.
function rowsFromDetails(){
  const PRIZE_N = 12;
  const fmt = p => `${p.sponsor} - ${p.trackName} (${p.placement || p.prizeType})`;
  const header = ['Project Name','Event','Description','Prize Count',
    ...Array.from({length:PRIZE_N},(_,i)=>`Prize ${i+1}`), 'All Sponsors','GitHub','Demo','URL'];
  const body = JSON.parse(fs.readFileSync('data/details.json','utf8')).map(d => {
    const prizes = d.prizes || [];
    return [d.name, d.event, (d.projectDescription || d.description || '').substring(0,500), String(prizes.length),
      ...Array.from({length:PRIZE_N},(_,i)=> i < prizes.length ? fmt(prizes[i]) : ''),
      [...new Set(prizes.map(p=>p.sponsor))].join('; '), d.githubUrl||'', d.demoUrl||'', 'https://ethglobal.com/showcase/'+d.slug];
  });
  return [header, ...body];
}

const rows = fs.existsSync('ethglobal-showcase.csv')
  ? parseCSV(fs.readFileSync('ethglobal-showcase.csv','utf8'))
  : (console.error('WARN ethglobal-showcase.csv missing: building from data/details.json'), rowsFromDetails());
const h = rows[0], idx = {}; h.forEach((x,i)=>idx[x]=i);
const PRIZE_COLS = h.filter(x=>/^Prize \d+$/.test(x)).length;

let ev = rows.slice(1).filter(r => r[idx.Event] === EVENT);
if (!ev.length) { console.error(`No rows for event "${EVENT}"`); process.exit(1); }

const isFinalist = r => r.slice(idx['Prize 1'], idx['Prize 1']+PRIZE_COLS).some(p => /finalist/i.test(p||''));
const prizesOf = r => r.slice(idx['Prize 1'], idx['Prize 1']+PRIZE_COLS).filter(Boolean);

let list = WINNERS_ONLY ? ev.filter(r => +r[idx['Prize Count']] > 0) : ev;
// finalists first, then most prizes, then name
list.sort((a,b) => (isFinalist(b)-isFinalist(a)) || (+b[idx['Prize Count']] - +a[idx['Prize Count']]) || a[0].localeCompare(b[0]));

const out = [];
out.push(`# ${EVENT} — project corpus`);
out.push(`Total projects in event: ${ev.length} · winners: ${ev.filter(r=>+r[idx['Prize Count']]>0).length} · finalists: ${ev.filter(isFinalist).length}`);
out.push(`Listing below: ${list.length} ${WINNERS_ONLY ? 'winners only' : 'all projects'}\n`);

for (const r of list) {
  const fin = isFinalist(r) ? ' ★FINALIST' : '';
  const pz = prizesOf(r);
  out.push(`## ${r[idx['Project Name']]}${fin}`);
  if (pz.length) out.push(`PRIZES: ${pz.join(' | ')}`);
  else out.push(`PRIZES: (none)`);
  const desc = (r[idx.Description]||'').replace(/\s+/g,' ').trim();
  out.push(`WHAT: ${desc || '(no description)'}`);
  out.push(`URL: ${r[idx.URL]}`);
  out.push('');
}

const outPath = outArg ? outArg.split('=')[1]
  : `output/corpus-${EVENT.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}${WINNERS_ONLY?'-winners':''}.md`;
fs.mkdirSync('output', { recursive: true });
fs.writeFileSync(outPath, out.join('\n'));
console.log(`Wrote ${outPath} — ${list.length} projects, ${out.join('\n').length} chars`);
