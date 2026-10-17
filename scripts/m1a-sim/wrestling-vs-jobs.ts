import { applyParity, runWrestler, type WCfg } from './wrestling';
import { runJobs, GARAGE, FISHING, DIVERS, type Cfg } from './lifestyles';
applyParity();
const CP = [60, 120, 300, 600, 1200];
const fmt = (n: number) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'k' : String(Math.round(n)));
const PH = [0, 28, 56, 84, 112, 140];
const jc: Cfg = { name: '', variety: 0.05, varietyCap: 0.15, polyOld: false, gp: 0.9, qual: () => 0.8 };
console.log('NET WORTH (wallet + ventures), greedy reinvestment, zero mastery start, competent play'.padEnd(52), CP.map(x => (x / 60).toFixed(0) + ' h').map(x => x.padStart(8)).join(''), ' rungs 3 / 4 / 5 (min)');
const jobs: Record<string, number[]> = {};
for (const [n, p] of [['jobs: garage (rate-parity)', GARAGE], ['jobs: fishing', FISHING], ['jobs: diversified', DIVERS]] as const) { const r = runJobs(jc, p, 1200); jobs[n] = CP.map(m => r.snaps[m].nw); console.log(n.padEnd(52), jobs[n].map(x => fmt(x).padStart(8)).join('')); }
const jobMid = CP.map((_, i) => (jobs['jobs: garage (rate-parity)'][i] + jobs['jobs: fishing'][i] + jobs['jobs: diversified'][i]) / 3);
function avg(c: WCfg) {
  const rs = PH.map((p, k) => runWrestler(c, 1200, p, 21 + k, CP)); const m = (f: (r: typeof rs[0]) => number) => rs.reduce((t, r) => t + f(r), 0) / rs.length;
  const rm = (k: number) => { const v = rs.map(r => r.rungAt[k]).filter(x => x !== undefined); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) + (v.length < rs.length ? '*' : '') : '—'; };
  const w = CP.map(x => m(r => r.nw[x]));
  console.log(c.name.padEnd(52), w.map(x => fmt(x).padStart(8)).join(''), ' ', [3, 4, 5].map(rm).join(' / '));
  console.log(' '.repeat(52), w.map((x, i) => ('×' + (x / jobMid[i]).toFixed(1)).padStart(8)).join(''), '  vs job mean | ord', fmt(m(r => r.src.ord)), 'gala', fmt(m(r => r.src.gala)), 'title', fmt(m(r => r.src.title)), '| bouts', m(r => r.fights).toFixed(0), 'titles', m(r => r.titles).toFixed(1));
}
const base: WCfg = { name: '', ord: null, ritual: 100, duel: 70, eOrd: 0, eGala: 0, skill: 0, policy: 'weekend' };
const T_A = [6000, 7000, 8500, 10000, 12000, 14000, 16000];
console.log('\nWEEKEND FIGHTER (jobs by day; ordinary + gala/title on Fri–Sun evenings) — the realistic career');
avg({ ...base, name: 'CURRENT purses, no bout fatigue' });
avg({ ...base, name: 'W-A: ordinary table, galas/titles unchanged', ord: T_A, eOrd: 25, eGala: 35 });
avg({ ...base, name: 'W-A + softer mid-ladder galas (rungs 3–4 ×0.6)', ord: T_A, eOrd: 25, eGala: 35, galaScale: [1, 1, 1, 0.6, 0.6, 1, 1] });
console.log('\nBOUT GRINDER (ordinary bouts nonstop, galas when open) — the exploit case');
avg({ ...base, name: 'CURRENT purses, no bout fatigue', policy: 'grind' });
avg({ ...base, name: 'W-A: ordinary table, galas/titles unchanged', ord: T_A, eOrd: 25, eGala: 35, policy: 'grind' });
avg({ ...base, name: 'W-A + softer mid-ladder galas (rungs 3–4 ×0.6)', ord: T_A, eOrd: 25, eGala: 35, galaScale: [1, 1, 1, 0.6, 0.6, 1, 1], policy: 'grind' });
