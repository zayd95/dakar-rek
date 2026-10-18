// Final economic report for the ordinary-purse change (docs/ORDINARY-PURSES.md): the previous rule ('legacy'), the implemented one
// ('real' = the game's purseOf) and the heavier 5/8/12/17/24 k table, on the real ladder and measured duels, seven start dates.
// Run: npx vite-node scripts/m1a-sim/wrestling3-report.ts
import { applyParity, run, type WCfg } from './wrestling3';
import { runJobs, GARAGE, FISHING, DIVERS, type Cfg } from './lifestyles';
applyParity();
const CP = [60, 120, 300, 600, 1200];
const PH = [0, 100, 200, 300, 400, 500, 600];
const jc: Cfg = { name: '', variety: 0.05, varietyCap: 0.15, polyOld: false, gp: 0.9, qual: () => 0.8 };
const jobs = [GARAGE, FISHING, DIVERS].map(p => runJobs(jc, p, 1200)); const jm = CP.map(m => jobs.reduce((t, r) => t + r.snaps[m].nw, 0) / 3);
const jobsHour = jobs.reduce((t, r) => t + r.actPerHour, 0) / 3;
const fmt = (n: number) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : (n / 1e3).toFixed(0) + 'k');
const stats = (c: WCfg, seed = 211) => { const rs = PH.map((p, i) => run(c, 1200, p, seed + i, CP)); const m = (f: (r: typeof rs[0]) => number) => rs.reduce((t, r) => t + f(r), 0) / rs.length; return { nw: CP.map(x => m(r => r.nw[x])), ord: m(r => r.src.ord), gala: m(r => r.src.gala), title: m(r => r.src.title), win: m(r => r.win), rung: m(r => r.rung), n: m(r => r.n.ord) }; };
const xs = (a: number[]) => a.map((x, i) => ('×' + (x / jm[i]).toFixed(1)).padStart(7)).join('');
const base: WCfg = { name: '', skill: 'decent', trainAt: 15, ritual: 55, eOrd: 0, eGala: 0, policy: 'grind' };
const T2 = [5000, 8000, 12000, 17000, 24000];
const RULES: [string, WCfg['ordinary']][] = [['previous (by rung)', 'legacy'], ['implemented 5/6.5/8.5/11/14 k', 'real'], ['heavier 5/8/12/17/24 k', T2]];
console.log(`jobs: active income ${fmt(jobsHour)} F/h; net worth ${jm.map(fmt).join(' / ')} at 1 / 2 / 5 / 10 / 20 h\n`);
console.log('A. NET WORTH ÷ jobs mean at'.padEnd(52), CP.map(x => (x / 60 + ' h').padStart(7)).join(''));
const PROFILES: [string, Partial<WCfg>][] = [
  ['casual weekend fighter (3 bouts/evening), novice', { policy: 'weekend', ordPerEvening: 3, skill: 'novice' }],
  ['casual weekend fighter (3 bouts/evening), decent', { policy: 'weekend', ordPerEvening: 3 }],
  ['weekend fighter (all evening), decent', { policy: 'weekend' }],
  ['weekend fighter (all evening), expert', { policy: 'weekend', skill: 'expert' }],
  ['bout grinder (no jobs), decent', {}], ['bout grinder, expert', { skill: 'expert' }]];
for (const [who, over] of PROFILES) { console.log('-- ' + who); for (const [lab, ord] of RULES) console.log('  ' + lab.padEnd(50), xs(stats({ ...base, ...over, ordinary: ord }).nw)); }
console.log('\nB. ORDINARY-BOUT LOOP: income per hour of bouts alone (grinder, 20 h, average over start dates), × jobs');
for (const [lab, ord] of RULES) {
  const f = (o: number) => `${fmt(o / 20)}/h ×${(o / 20 / jobsHour).toFixed(1)}`;
  const d = stats({ ...base, ordinary: ord }), e = stats({ ...base, skill: 'expert', ordinary: ord }), q5 = stats({ ...base, behaviour: 'quickLoss', climbTo: 5, ordinary: ord }), q0 = stats({ ...base, behaviour: 'quickLoss', ordinary: ord });
  console.log('  ' + lab.padEnd(34), 'honest decent', f(d.ord).padEnd(16), 'honest expert', f(e.ord).padEnd(16), 'quick losses after rung 5', f(q5.ord).padEnd(16), 'quick losses from the start', f(q0.ord));
}
console.log('\nC. DELIBERATE BEHAVIOURS under the implemented rule (net worth ÷ jobs; ordinary / gala / title income over 20 h)');
for (const [lab, over] of [['honest grinder, decent', {}], ['pure staller (guards, never attacks)', { behaviour: 'stall' }], ['quick losses from the start', { behaviour: 'quickLoss' }], ['honest to rung 3, then quick losses', { behaviour: 'quickLoss', climbTo: 3 }], ['honest to rung 5, then quick losses', { behaviour: 'quickLoss', climbTo: 5 }], ['abandon every bout', { behaviour: 'abandon' }]] as [string, Partial<WCfg>][]) {
  const r = stats({ ...base, ...over, ordinary: 'real' });
  console.log('  ' + lab.padEnd(40), xs(r.nw), `  ord ${fmt(r.ord)} gala ${fmt(r.gala)} title ${fmt(r.title)}  win ${(r.win * 100).toFixed(0)}% rung ${r.rung.toFixed(1)}`);
}
console.log('\nD. WHERE THE REMAINING GRINDER ADVANTAGE COMES FROM (implemented rule, decent, 20 h)');
const g = stats({ ...base, ordinary: 'real' }), w = stats({ ...base, policy: 'weekend', ordinary: 'real' }), c3 = stats({ ...base, policy: 'weekend', ordPerEvening: 3, ordinary: 'real' });
for (const [lab, r] of [['grinder', g], ['weekend (all evening)', w], ['casual weekend', c3]] as const) console.log('  ' + lab.padEnd(24), `income ordinary ${fmt(r.ord)} · gala ${fmt(r.gala)} · title ${fmt(r.title)} · total ${fmt(r.ord + r.gala + r.title)} · net worth ${fmt(r.nw[4])} (×${(r.nw[4] / jm[4]).toFixed(1)})`);
console.log(`  prestige income is calendar-limited (one gala or title bout an evening, Fri–Sun): grinder ${fmt(g.gala + g.title)} vs weekend ${fmt(w.gala + w.title)} over 20 h`);
