// Proposed pay adjustment (targeted, not a flat rate): each shift's competent-play rate at zero mastery is moved towards a target that
// rewards skill (gesture shifts), effort (energy cost) and nothing else. Run: npx vite-node scripts/m1a-sim/pay-table.ts
import { Cfg, runJobs, SH, GARAGE, FISHING, DIVERS, MARKET } from './lifestyles';
const C: Cfg = { name: 'v', variety: 0, varietyCap: 0, polyOld: false, gp: 0.95, qual: () => 0.85 };
// Corniche shifts are done at three stops 30–45 m apart (landing, fish market, workshop): a travel allowance of 20 % keeps a fishing day level with the others
const target = (sh: typeof SH[string]) => (sh.g ? 270_000 : 220_000) * (1 + 0.01 * (sh.en - 18)) * (sh.hub === 'co' ? 1.2 : 1);
const rows = Object.values(SH).map(sh => ({ sh, rate: runJobs(C, () => sh, 60).actPerHour }));
console.log('shift      kind     en  secs   pay → proposed    rate now → target (k F/h)');
const np: Record<string, number> = {};
for (const { sh, rate } of rows) { np[sh.id] = Math.round(sh.pay * target(sh) / rate / 50) * 50; console.log(sh.id.padEnd(10), (sh.g ? 'gesture' : 'plain').padEnd(8), String(sh.en).padStart(3), String(sh.secs).padStart(5), String(sh.pay).padStart(6), '→', String(np[sh.id]).padStart(5), `(${((np[sh.id] / sh.pay - 1) * 100).toFixed(0)}%)`.padStart(6), '  ', Math.round(rate / 1000), '→', Math.round(target(sh) / 1000)); }
for (const sh of Object.values(SH)) sh.pay = np[sh.id];
console.log('\nafter:', Object.values(SH).map(sh => `${sh.id} ${Math.round(runJobs(C, () => sh, 60).actPerHour / 1000)}k`).join(' | '));
const vc: Cfg = { name: 'x', variety: 0.05, varietyCap: 0.15, polyOld: false, gp: 0.95, qual: () => 0.85 };
console.log('\nlifestyles after (variety only, competent), k F/h: garage / market / fishing / diversified');
console.log([GARAGE, MARKET, FISHING, DIVERS].map(p => Math.round(runJobs(vc, p, 600).actPerHour / 1000)).join(' / '));
console.log('sloppy (gesture pay ×0.68) :', [GARAGE, MARKET, FISHING, DIVERS].map(p => Math.round(runJobs({ ...vc, gp: 0.68 }, p, 600).actPerHour / 1000)).join(' / '));
console.log('perfect (gesture pay ×1.2) :', [GARAGE, MARKET, FISHING, DIVERS].map(p => Math.round(runJobs({ ...vc, gp: 1.2 }, p, 600).actPerHour / 1000)).join(' / '));
