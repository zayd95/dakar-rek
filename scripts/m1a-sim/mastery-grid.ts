import { Cfg, runJobs, SH, GARAGE, FISHING, MARKET, DIVERS } from './lifestyles';
const newPay: Record<string, number> = { meca: 3600, meca_conf: 3600, roue: 2150, stock: 2000, courrier: 2250, debarq: 2850, filets: 1450, poisson: 1800, atelier: 1450, vendre: 3400, couture: 1500 };
for (const sh of Object.values(SH)) sh.pay = newPay[sh.id];
const mk = (gp: number, q: number, m2: any): Cfg => ({ name: 'x', variety: 0.05, varietyCap: 0.15, polyOld: false, gp, qual: () => q, m2 });
const L = (c: Cfg) => [GARAGE, MARKET, FISHING, DIVERS].map(p => runJobs(c, p, 600).actPerHour);
const f = (a: number[]) => a.map(x => String(Math.round(x / 1000)).padStart(4)).join(' ') + '   max/min ' + (Math.max(...a) / Math.min(...a)).toFixed(2);
console.log('act k/h (10 h horizon): garage market fishing diversified');
for (const A of [0.15, 0.20, 0.25]) for (const plainQ of [0.5, 0.7]) {
  const m2 = { A, kN: 40, alpha: 0.1, wq: 0.5, we: 0.3, wt: 0.2, trustN: 6, plainQ };
  console.log(`A=${A} plainQ=${plainQ}  avg(.8):`, f(L(mk(0.9, 0.8, m2))), '| skilled:', f(L(mk(1.0, 0.9, m2))), '| sloppy:', f(L(mk(0.68, 0.55, m2))));
}
console.log('no mastery   avg(.8):', f(L(mk(0.9, 0.8, undefined))));
