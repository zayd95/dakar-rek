// The integrated game's acceptance run (docs/proof/playable/ACCEPTANCE.md): every phase's own end-to-end journey, one after the other, against ONE served build of the integration branch.
// A run is a list of the repository's own check scripts (each plays a phase with the real touch controls or the game's debug hooks, in a browser on a phone-sized page); this file only runs them in
// order, keeps each one's log, counts its « FAIL: » lines and its exit code, and writes one summary. It never edits a check to make it pass and never retries: a red line stays red.
// Usage: node scripts/run-playable-acceptance.mjs <baseUrl> <outDir> [name,name,...]     (names as in LIST; none = all)
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const [base = 'http://127.0.0.1:4174/', out = '/tmp/claude-0/playable', only] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const dir = n => `${out}/${n}`;
/** name, script, extra arguments after <base> <outDir> (null: the script takes the base only), minutes before the run is cut off. */
const LIST = [
  ['nightlife', 'check-nightlife-journey.mjs', [], 25],                // LD2.0-E × M4 × Le Patio: drive in, the club, the hotel's roof, Awa, La Vague, the taxi, the next evening, reload
  ['almadies-parking', 'check-almadies-parking.mjs', [], 10],
  ['almadies-evening', 'check-almadies-journey.mjs', [], 20],          // M4 « One Evening Out »
  ['rooftop', 'check-rooftop.mjs', [], 10],
  ['patio', 'check-patio.mjs', [], 15],
  ['ngor-beach', 'check-ngor-beach.mjs', [], 15],                      // the Plage de Ngor
  ['traversee', 'check-traversee.mjs', null, 20],                      // the boats to the island
  ['mermoz', 'check-mermoz-journey.mjs', [], 20],                      // M1: the VDN, the BRT, a job, an evening
  ['mermoz-home', 'check-mermoz-home.mjs', [], 12],                    // housing: the F3
  ['cite-maison', 'check-cite-maison.mjs', [], 12],                    // housing: the Cité Jàmm house and its rent
  ['trade', 'check-trade-journey.mjs', [], 25],                        // M2: a business of one's own
  ['match', 'check-match-journey.mjs', [], 20],                        // M3: the evening football, the regulars
  ['ld2a', 'check-ld2a-journey.mjs', [], 20],                          // LD2.0-A: earning, guidance, the bank
  ['vtc', 'check-vtc-ride.mjs', [], 15],                               // transport: a ride-hailing trip
  ['night', 'check-night.mjs', null, 10],                              // day and night
  ['district', 'check-district.mjs', [], 12],                          // the Almadies district: plan, budgets, street unchanged
  ['online', 'check-multiplayer.mjs', 'none', 30],                    // presence in every district, a dropped network and its reconnection (builds the online bundle and starts its own local worker)
];
const chosen = only ? LIST.filter(([n]) => only.split(',').includes(n)) : LIST;
const results = [];
for (const [name, script, extra, minutes] of chosen) {
  const o = dir(name); fs.mkdirSync(o, { recursive: true });
  const args = extra === 'none' ? ['scripts/' + script] : ['scripts/' + script, base, ...(extra === null ? [] : [o, ...extra])];
  if (name === 'night') args.push(o);
  const log = fs.createWriteStream(`${out}/${name}.log`);
  const t0 = Date.now();
  console.log(new Date().toISOString().slice(11, 19), 'RUN ', name, '·', script);
  const code = await new Promise(res => {
    const p = spawn('node', args, { env: { ...process.env, CHROMIUM: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', NOVIDEO: '1' } });
    const timer = setTimeout(() => { log.write(`\nCUT OFF after ${minutes} min\n`); p.kill('SIGKILL'); }, minutes * 60000);
    p.stdout.pipe(log, { end: false }); p.stderr.pipe(log, { end: false });
    p.on('close', c => { clearTimeout(timer); res(c); });
  });
  log.end();
  const text = fs.readFileSync(`${out}/${name}.log`, 'utf8');
  const fails = text.split('\n').filter(l => /^(FAIL|✗|not ok)\b/.test(l) || /\bFAIL:/.test(l.slice(0, 12)));
  const passes = text.split('\n').filter(l => /^(PASS|✓)\b/.test(l)).length;
  const cut = /CUT OFF/.test(text);
  results.push({ name, script, exit: code, passes, fails: fails.length, cut, seconds: Math.round((Date.now() - t0) / 1000), firstFails: fails.slice(0, 4).map(l => l.slice(0, 220)) });
  console.log(`     ${code === 0 && !fails.length && !cut ? 'GREEN' : 'RED  '} ${name}: exit ${code}, ${passes} pass, ${fails.length} fail${cut ? ', CUT OFF' : ''}, ${results.at(-1).seconds}s`);
}
fs.writeFileSync(`${out}/summary.json`, JSON.stringify({ base, at: new Date().toISOString(), results }, null, 1));
const red = results.filter(r => r.exit !== 0 || r.fails || r.cut);
console.log(`\n${results.length - red.length}/${results.length} green; red: ${red.map(r => r.name).join(', ') || 'none'}`);
