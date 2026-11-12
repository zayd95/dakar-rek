// Anti-exploit candidates for repeatable ordinary ranked bouts (rematch decay), on the corrected wrestling simulation.
import { applyParity, run, type WCfg } from './wrestling2';
import { runJobs, GARAGE, FISHING, DIVERS, type Cfg } from './lifestyles';
applyParity();
const CP = [60, 120, 300, 600, 1200];
const PH = [0, 100, 200, 300, 400, 500, 600];
const jc: Cfg = { name: '', variety: 0.05, varietyCap: 0.15, polyOld: false, gp: 0.9, qual: () => 0.8 };
const jobs = [GARAGE, FISHING, DIVERS].map(p => runJobs(jc, p, 1200)); const jm = CP.map(m => jobs.reduce((t, r) => t + r.snaps[m].nw, 0) / 3);
const fmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : (n / 1e3).toFixed(0) + 'k');
function row(label: string, c: WCfg) {
  const rs = PH.map((p, i) => run(c, 1200, p, 51 + i, CP)); const m = (f: (r: typeof rs[0]) => number) => rs.reduce((t, r) => t + f(r), 0) / rs.length;
  const w = CP.map(x => m(r => r.nw[x]));
  console.log(label.padEnd(46), w.map((x, i) => ('×' + (x / jm[i]).toFixed(2)).padStart(7)).join(''), `  ord ${fmt(m(r => r.src.ord))} gala ${fmt(m(r => r.src.gala))} title ${fmt(m(r => r.src.title))} | bouts ${m(r => r.n.ord).toFixed(0)}+${m(r => r.n.gala).toFixed(0)}+${m(r => r.n.title).toFixed(0)}`);
}
console.log('net worth ÷ jobs mean at'.padEnd(46), CP.map(x => (x / 60 + ' h').padStart(7)).join(''));
const base: WCfg = { name: '', skill: 'decent', trainAt: 15, ritual: 55, eOrd: 0, eGala: 0, policy: 'weekend' };
const RM = (window: number, free: number, slope: number, points = false) => ({ window, free, slope, floor: 0.1, points });
const variants: [string, Partial<WCfg>][] = [
  ['current', {}],
  ['A: same day, 2 free, slope 0.5', { rematch: RM(1, 2, 0.5) }],
  ['B: same day, 2 free, slope 1.0', { rematch: RM(1, 2, 1.0) }],
  ['C: same day, 1 free, slope 0.5', { rematch: RM(1, 1, 0.5) }],
  ['D: 3 days, 3 free, slope 0.5', { rematch: RM(3, 3, 0.5) }],
  ['E: = B + the same on ladder points', { rematch: RM(1, 2, 1.0, true) }],
];
for (const [who, over] of [['weekend fighter (all evening), decent', { policy: 'weekend' }], ['casual weekend fighter (3 bouts/evening), decent', { policy: 'weekend', ordPerEvening: 3 }], ['weekend fighter, novice', { policy: 'weekend', skill: 'novice' }], ['weekend fighter, expert', { policy: 'weekend', skill: 'expert' }], ['bout grinder, decent', { policy: 'grind' }], ['bout grinder, novice', { policy: 'grind', skill: 'novice' }]] as [string, Partial<WCfg>][]) {
  console.log('\n--- ' + who);
  for (const [lab, v] of variants) row(lab, { ...base, ...over, ...v, name: lab });
}
