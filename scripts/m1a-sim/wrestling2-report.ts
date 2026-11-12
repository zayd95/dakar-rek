import { applyParity, run, type WCfg } from './wrestling2';
import { runJobs, GARAGE, FISHING, DIVERS, type Cfg } from './lifestyles';
applyParity();
const CP = [60, 120, 300, 600, 1200];
const fmt = (n: number) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'k' : String(Math.round(n)));
const PH = [0, 100, 200, 300, 400, 500, 600];                       // starts spread over the 4-week season (672 city hours)
const jc: Cfg = { name: '', variety: 0.05, varietyCap: 0.15, polyOld: false, gp: 0.9, qual: () => 0.8 };
console.log('NET WORTH, greedy reinvestment, zero mastery'.padEnd(58), CP.map(x => (x / 60) + ' h').map(x => x.padStart(8)).join(''), '  rungs reached (min): 1/2/3/4/5/6');
const jobs = [GARAGE, FISHING, DIVERS].map(p => runJobs(jc, p, 1200)); const jm = CP.map((m, i) => jobs.reduce((t, r) => t + r.snaps[m].nw, 0) / 3);
console.log('jobs, mean of garage/fishing/diversified (parity pay)'.padEnd(58), jm.map(x => fmt(x).padStart(8)).join(''));
function avg(c: WCfg, minutes = 1200) {
  const rs = PH.map((p, i) => run(c, minutes, p, 31 + i, CP)); const m = (f: (r: typeof rs[0]) => number) => rs.reduce((t, r) => t + f(r), 0) / rs.length;
  const rm = (k: number) => { const v = rs.map(r => r.rungAt[k]).filter(x => x !== undefined); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) + (v.length < rs.length ? `(${v.length}/${rs.length})` : '') : '—'; };
  const w = CP.map(x => m(r => r.nw[x]));
  console.log(c.name.padEnd(58), w.map(x => fmt(x).padStart(8)).join(''), '  ', [1, 2, 3, 4, 5, 6].map(rm).join('/'));
  console.log(' '.repeat(58), w.map((x, i) => ('×' + (x / jm[i]).toFixed(1)).padStart(8)).join(''), `  vs jobs | ord ${fmt(m(r => r.src.ord))} gala ${fmt(m(r => r.src.gala))} title ${fmt(m(r => r.src.title))} jobs ${fmt(m(r => r.src.jobs))} | bouts ${m(r => r.n.ord + r.n.gala + r.n.title).toFixed(0)} (gala ${m(r => r.n.gala).toFixed(0)}, title ${m(r => r.n.title).toFixed(0)}) win ${(m(r => r.win) * 100).toFixed(0)}% belts ${m(r => r.titles).toFixed(1)}`);
}
const base: WCfg = { name: '', skill: 'decent', trainAt: 15, ritual: 55, eOrd: 0, eGala: 0, policy: 'grind' };
for (const pol of ['grind', 'weekend'] as const) {
  console.log(`\n=== CURRENT rules (ordinary purse = rung purse, galas ×2, titles ×3, no bout fatigue), policy: ${pol}`);
  for (const [sk, ta] of [['novice', 15], ['decent', 15], ['decent', null], ['expert', 15]] as const) avg({ ...base, name: `${sk}${ta === null ? ', never trains' : ', trains after 15 bouts'}`, skill: sk, trainAt: ta, policy: pol });
}
console.log('\n=== sensitivity (decent, trains): ritual 40 s / 90 s');
for (const r of [40, 90]) avg({ ...base, name: `grind, ritual ${r} s`, ritual: r });
console.log('\n=== OPTION ONLY, not proposed: ordinary purse table 6k..16k and −25 / −35 energy (decent, trains)');
const T_A = [6000, 7000, 8500, 10000, 12000, 14000, 16000];
for (const pol of ['grind', 'weekend'] as const) avg({ ...base, name: `ordinary table A + fatigue, ${pol}`, ord: T_A, eOrd: 25, eGala: 35, policy: pol });
