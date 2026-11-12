// Competent-play rate of every simulated shift and of the lifestyles, with the pays now in the content. npx vite-node scripts/m1a-sim/implemented-rates.ts
import { Cfg, runJobs, SH, GARAGE, FISHING, DIVERS, MARKET } from './lifestyles';
const C: Cfg = { name: 'v', variety: 0, varietyCap: 0, polyOld: false, gp: 0.95, qual: () => 0.85 };
console.log(Object.values(SH).map(sh => `${sh.id} ${Math.round(runJobs(C, () => sh, 60).actPerHour / 1000)}k`).join(' | '));
const vc: Cfg = { ...C, variety: 0.05, varietyCap: 0.15 };
const L = (c: Cfg) => [GARAGE, MARKET, FISHING, DIVERS].map(p => Math.round(runJobs(c, p, 600).actPerHour / 1000)).join(' / ');
console.log('garage / market / fishing / diversified, competent:', L(vc), '| sloppy (×0.68):', L({ ...vc, gp: 0.68 }), '| perfect (×1.2):', L({ ...vc, gp: 1.2 }));
