// Opponent-level purse table for ordinary ranked bouts (anti-exploit candidate), on the corrected wrestling simulation.
import { applyParity, run, type WCfg } from './wrestling2';
import { runJobs, GARAGE, FISHING, DIVERS, type Cfg } from './lifestyles';
applyParity();
const CP = [60, 120, 300, 600, 1200];
const PH = [0, 100, 200, 300, 400, 500, 600];
const jc: Cfg = { name: '', variety: 0.05, varietyCap: 0.15, polyOld: false, gp: 0.9, qual: () => 0.8 };
const jobs = [GARAGE, FISHING, DIVERS].map(p => runJobs(jc, p, 1200)); const jm = CP.map(m => jobs.reduce((t, r) => t + r.snaps[m].nw, 0) / 3);
const fmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : (n / 1e3).toFixed(0) + 'k');
function row(label: string, c: WCfg) {
  const rs = PH.map((p, i) => run(c, 1200, p, 71 + i, CP)); const m = (f: (r: typeof rs[0]) => number) => rs.reduce((t, r) => t + f(r), 0) / rs.length;
  const w = CP.map(x => m(r => r.nw[x]));
  console.log(label.padEnd(40), w.map((x, i) => ('×' + (x / jm[i]).toFixed(2)).padStart(7)).join(''), `  ord ${fmt(m(r => r.src.ord))} gala ${fmt(m(r => r.src.gala))} title ${fmt(m(r => r.src.title))}`);
}
console.log('net worth ÷ jobs mean at'.padEnd(40), CP.map(x => (x / 60 + ' h').padStart(7)).join(''));
const base: WCfg = { name: '', skill: 'decent', trainAt: 15, ritual: 55, eOrd: 0, eGala: 0, policy: 'weekend' };
const T: [string, number[] | undefined][] = [
  ['current (purse by the player\'s rung)', undefined],
  ['T1 by level 5/6.5/8.5/11/14 k', [5000, 6500, 8500, 11000, 14000]],
  ['T2 by level 5/8/12/17/24 k', [5000, 8000, 12000, 17000, 24000]],
  ['T3 by level 5/10/17/26/38 k', [5000, 10000, 17000, 26000, 38000]],
  ['T4 by level 5/12/25/45/70 k', [5000, 12000, 25000, 45000, 70000]],
];
for (const [who, over] of [['casual weekend fighter (3 bouts/evening), decent', { ordPerEvening: 3 }], ['weekend fighter (all evening), decent', {}], ['weekend fighter (all evening), novice', { skill: 'novice' }], ['casual weekend fighter, novice', { skill: 'novice', ordPerEvening: 3 }], ['weekend fighter (all evening), expert', { skill: 'expert' }], ['bout grinder, decent', { policy: 'grind' }], ['bout grinder, expert', { policy: 'grind', skill: 'expert' }]] as [string, Partial<WCfg>][]) {
  console.log('\n--- ' + who);
  for (const [lab, t] of T) row(lab, { ...base, ...over, ordByLevel: t, name: lab });
}
