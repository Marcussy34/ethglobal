// Generic: integrate a scraped ETHGlobal event into the dataset.
// Usage: node integrate-event.js <eventSlug> "<Event Name>" [--finalists=a-slug,b-slug]
//   1) optionally inject finalist prizes (only needed when the site has no xdat5 badge yet)
//   2) merge into the data pipeline (listings.json, progress.json, details.json)
//   3) upsert every project into the root ethglobal-showcase.csv
const fs = require('fs');
const { stringify } = require('csv-stringify/sync');

const slug = process.argv[2];
const EVENT_NAME = process.argv[3];
if (!slug || !EVENT_NAME) {
  console.error('Usage: node integrate-event.js <eventSlug> "<Event Name>" [--finalists=slug1,slug2]');
  process.exit(1);
}
const finArg = process.argv.find(a => a.startsWith('--finalists='));
const MANUAL_FINALISTS = finArg ? finArg.split('=')[1].split(',').filter(Boolean) : [];
const FINALIST_PRIZE = {
  sponsor: 'ETHGlobal',
  trackName: `🏆 ${EVENT_NAME} Finalist`,
  prizeType: 'finalist',
  placement: 'finalist',
  rawText: `ETHGlobal -  🏆 ${EVENT_NAME} Finalist`,
};

function parseCSV(text){const rows=[];let row=[],field="",inQ=false;for(let i=0;i<text.length;i++){const c=text[i];if(inQ){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else inQ=false;}else field+=c;}else{if(c==='"')inQ=true;else if(c===","){row.push(field);field="";}else if(c==="\n"){row.push(field);rows.push(row);row=[];field="";}else if(c==="\r"){}else field+=c;}}if(field.length||row.length){row.push(field);rows.push(row);}return rows;}
function formatPrize(p){let pl='';if(p.placement==='pool')pl='pool';else if(p.placement==='finalist')pl='finalist';else if(p.placement)pl=p.placement;else pl=p.prizeType;return `${p.sponsor} - ${p.trackName} (${pl})`;}
function writeJSON(file,obj){const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(obj,null,2));fs.renameSync(tmp,file);}

function main(){
  const listing = JSON.parse(fs.readFileSync(`data/${slug}-live-listing.json`,'utf8'));
  const detailsArr = JSON.parse(fs.readFileSync(`data/${slug}-details.json`,'utf8'));
  const detail = new Map(detailsArr.map(d => [d.slug, d]));

  // Finalists = xdat5 listing badge (authoritative) ∪ any manually supplied slugs
  const finSet = new Set(MANUAL_FINALISTS);
  listing.forEach(l => { if ((l.prizeBadgeOrgIds||[]).includes('xdat5')) finSet.add(l.slug); });

  // 1) inject finalist prize where the detail page did not already carry one
  let injected = 0; const missingDetail = [];
  for (const s of finSet) {
    const d = detail.get(s);
    if (!d) { missingDetail.push(s); continue; }
    d.prizes = d.prizes || [];
    if (!d.prizes.some(p => /finalist/i.test(p.placement||''))) { d.prizes.unshift({ ...FINALIST_PRIZE }); injected++; }
  }
  if (missingDetail.length) console.log('WARN finalists missing detail:', missingDetail.join(', '));

  const records = listing.map(l => {
    const d = detail.get(l.slug);
    const prizes = d && !d._fail ? (d.prizes || []) : (finSet.has(l.slug) ? [{ ...FINALIST_PRIZE }] : []);
    return {
      name: (d && d.name) || l.name,
      slug: l.slug,
      event: EVENT_NAME,
      description: l.description || '',
      projectDescription: (d && d.projectDescription) || '',
      howItsMade: (d && d.howItsMade) || '',
      prizes,
      githubUrl: (d && d.githubUrl) || '',
      demoUrl: (d && d.demoUrl) || '',
      teamMembers: (d && d.teamMembers) || [],
      prizeCount: l.prizeCount,
      prizeBadgeOrgIds: l.prizeBadgeOrgIds || [],
    };
  });

  // ---- 2) Pipeline merge ----
  const listings = JSON.parse(fs.readFileSync('data/listings.json','utf8'));
  const progress = JSON.parse(fs.readFileSync('data/progress.json','utf8'));
  const have = new Set(listings.map(l => l.slug));
  let addedL = 0, addedC = 0;
  for (const r of records) {
    if (!have.has(r.slug)) {
      listings.push({ name: r.name, slug: r.slug, description: r.description, event: r.event, prizeCount: r.prizeCount, prizeBadgeOrgIds: r.prizeBadgeOrgIds });
      have.add(r.slug); addedL++;
    }
    const d = detail.get(r.slug);
    if ((d && !d._fail) || finSet.has(r.slug)) {
      progress.completed[r.slug] = { name: r.name, projectDescription: r.projectDescription, howItsMade: r.howItsMade, prizes: r.prizes, githubUrl: r.githubUrl, demoUrl: r.demoUrl, teamMembers: r.teamMembers };
      addedC++;
    }
  }
  writeJSON('data/listings.json', listings);
  writeJSON('data/progress.json', progress);
  const details = listings.map(l => {
    const dd = progress.completed[l.slug];
    return dd ? { ...l, projectDescription: dd.projectDescription||'', howItsMade: dd.howItsMade||'', prizes: dd.prizes||[], githubUrl: dd.githubUrl||'', demoUrl: dd.demoUrl||'', teamMembers: dd.teamMembers||[], scraped: true }
              : { ...l, prizes: [], scraped: false };
  });
  writeJSON('data/details.json', details);

  console.log(`Finalist prizes injected: ${injected} (finalist set size ${finSet.size})`);
  console.log(`Pipeline: listings +${addedL} (total ${listings.length}), completed +${addedC}, details.json ${details.length}`);

  // ---- 3) Root CSV upsert ----
  // The root CSV is gitignored and may be absent (it lives in Google Drive). Skip cleanly;
  // re-running this script later is safe because the upsert matches on slug.
  if (!fs.existsSync('ethglobal-showcase.csv')) {
    console.log('WARN ethglobal-showcase.csv missing: root CSV upsert skipped. Re-run after restoring it.');
    return;
  }
  const recs = parseCSV(fs.readFileSync('ethglobal-showcase.csv','utf8'));
  const h = recs[0]; const idx={}; h.forEach((x,i)=>idx[x]=i); const NCOL=h.length;
  const PRIZE_COLS = h.filter(x=>/^Prize \d+$/.test(x)).length;
  const slugOf = u => (u||'').replace(/^https?:\/\/ethglobal\.com\/showcase\//,'').trim();
  const rowBySlug = new Map(); for(let r=1;r<recs.length;r++) rowBySlug.set(slugOf(recs[r][idx.URL]), recs[r]);
  function setRow(row, rec){
    row[idx['Project Name']]=rec.name; row[idx['Event']]=rec.event;
    row[idx['Description']]=(rec.projectDescription||rec.description||'').substring(0,500);
    const prizes=rec.prizes||[];
    row[idx['Prize Count']]=String(prizes.length);
    for(let i=0;i<PRIZE_COLS;i++) row[idx['Prize '+(i+1)]] = i<prizes.length?formatPrize(prizes[i]):'';
    row[idx['All Sponsors']]=[...new Set(prizes.map(p=>p.sponsor))].join('; ');
    row[idx['GitHub']]=rec.githubUrl||''; row[idx['Demo']]=rec.demoUrl||'';
    row[idx['URL']]='https://ethglobal.com/showcase/'+rec.slug;
  }
  let upd=0, app=0;
  for(const rec of records){
    if(rowBySlug.has(rec.slug)){ setRow(rowBySlug.get(rec.slug), rec); upd++; }
    else { const row=new Array(NCOL).fill(''); setRow(row, rec); recs.push(row); app++; }
  }
  const bad = recs.filter(r=>r.length!==NCOL).length;
  if(bad){console.error('ABORT: '+bad+' rows wrong field count');process.exit(1);}
  fs.writeFileSync('ethglobal-showcase.csv', stringify(recs,{quoted_empty:false}));

  const ev = recs.slice(1).filter(r=>r[idx.Event]===EVENT_NAME);
  const prizeCols = i => ev.filter(r=>/finalist/i.test((r.slice(idx['Prize 1'], idx['Prize 1']+PRIZE_COLS)).join(' ')));
  console.log(`Root CSV: updated ${upd}, appended ${app}; "${EVENT_NAME}" rows now ${ev.length}`);
  console.log(`  winners: ${ev.filter(r=>+r[idx['Prize Count']]>0).length}, finalists: ${prizeCols().length}`);
}
main();
