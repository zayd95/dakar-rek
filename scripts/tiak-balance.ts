// Tiak Tiak balance, simulated (docs/release/BALANCE-1.0.1-tiak.md): a courier works the rolling board (src/economy/tiakOffers.ts) for one real hour of play from each district,
// on foot (runs inside the district only) and on the Tiak bike (any run, carrying on from the district it ends in). The boards, the pay and the lengths are the game's own; the
// speeds and the handling times are ASSUMPTIONS written below, not measurements. Usage: npx vite-node scripts/tiak-balance.ts
import { HUB_IDS, type HubId } from '../src/core/types';
import { ECONOMY } from '../src/economy/config';
import { deliveryLimitMs } from '../src/economy/jobs';
import { limitFactor, routeMetres, routePay, tiakOffers, type Route, type TiakPoint } from '../src/economy/tiakOffers';

const ASSUME = {
  /** m/s on foot along the streets (the run is 7 m/s, the jog 4.4: src/game/stride.ts; the delivery limits count 5.6). */
  foot: 5.6,
  /** m/s on the Tiak bike inside a district (top speed 20 m/s, src/transport/moto.ts; corners, traffic, the kerb) and on a road between districts. */
  bikeTown: 9, bikeRoad: 15,
  /** Seconds: opening the board and choosing; picking up; handing over; getting on and off the bike at each end. */
  board: 6, pickup: 4, handover: 4, mount: 12,
  /** The courier's needs, from the code: a delivery costs 6 energy, 3 hunger (ECONOMY.tiak.fatigue); hunger falls 1.6 a played minute (src/core/state.ts). */
  /** A Café Touba gives 6 energy for 100 F, the cheapest meal (riz au poisson) 40 hunger for 500 F (src/world/content.ts); seconds each stop takes (ASSUMED, the walk to the counter included). */
  cafeS: 15, mealS: 30,
};
const NEEDS = { energyStart: 85, energyMin: ECONOMY.tiak.minEnergy, perDelivery: -ECONOMY.tiak.fatigue.energie, cafe: { energy: 6, cost: 100 }, hungerPerMin: 1.6, hungerPerDelivery: -ECONOMY.tiak.fatigue.faim, meal: { faim: 40, cost: 500 } };
const HOUR_S = 3600, CITY_HOUR_S = 60;                                                  // one city hour is one real minute (src/core/clock.ts)
interface Mode { name: string; bike: boolean; foot: number }
// « as the script walked »: 3.7 m/s is what scripts/check-tiak-everywhere.mjs measured on the game's clock (five districts, a thumb on the stick's edge, corners and passers-by included)
const MODES: Mode[] = [
  { name: 'on foot at 3.7 m/s (as the script walked), runs inside the district', bike: false, foot: 3.7 },
  { name: `on foot at ${ASSUME.foot} m/s (a clean run), runs inside the district`, bike: false, foot: ASSUME.foot },
  { name: 'Tiak bike, any run', bike: true, foot: ASSUME.foot },
];

function simulate(start: HubId, mode: Mode, day: number) {
  let t = 0, hub = start, at: { x: number; z: number } = { x: 0, z: 0 }, money = 0, n = 0, late = 0, local = 0, away = 0, energy = NEEDS.energyStart, faim = 70, living = 0;
  const taken: string[] = [], perHub: Partial<Record<HubId, number>> = {};
  const cost = (r: Route) => {
    const g = r.gen!, a: TiakPoint = g.from, m = routeMetres(r)!, cross = !!r.toHub;
    const approach = Math.abs(a.x - at.x) + Math.abs(a.z - at.z);
    const ride = mode.bike ? (cross ? m / ASSUME.bikeRoad : m / ASSUME.bikeTown) + ASSUME.mount : m / mode.foot;
    const leg = ASSUME.pickup + ride + ASSUME.handover;
    return { total: ASSUME.board + approach / (mode.bike ? ASSUME.bikeTown : mode.foot) + (mode.bike ? ASSUME.mount : 0) + leg, leg };
  };
  while (t < HOUR_S) {
    const list = tiakOffers(hub, day, Math.floor(t / CITY_HOUR_S), new Set(taken)).filter(r => mode.bike || !r.toHub);
    const best = list.map(r => ({ r, c: cost(r) })).sort((p, q) => routePay(q.r) / q.c.total - routePay(p.r) / p.c.total)[0];
    if (!best || t + best.c.total > HOUR_S) break;
    const limit = (deliveryLimitMs(routeMetres(best.r)!) * limitFactor(best.r)) / 1000, isLate = best.c.leg > limit;
    // the needs first: a coffee when too tired for the next run, a meal when hungry (both cost time and money)
    while (energy < NEEDS.energyMin + NEEDS.perDelivery) { energy += NEEDS.cafe.energy; living += NEEDS.cafe.cost; t += ASSUME.cafeS; }
    if (faim < 30) { faim += NEEDS.meal.faim; living += NEEDS.meal.cost; t += ASSUME.mealS; }
    energy -= NEEDS.perDelivery; faim -= NEEDS.hungerPerDelivery + (best.c.total / 60) * NEEDS.hungerPerMin;
    money += Math.round(routePay(best.r) * (isLate ? ECONOMY.tiak.latePayFactor : 1));
    n++; if (isLate) late++; if (best.r.toHub) away++; else local++;
    t += best.c.total; taken.push(best.r.id); if (taken.length > 2) taken.shift();
    hub = best.r.gen!.to.hub; at = best.r.gen!.to; perHub[hub] = (perHub[hub] ?? 0) + 1;
  }
  return { n, money, late, local, away, perHub, living };
}

const DAYS = 20, fmt = (v: number) => Math.round(v).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
console.log(`assumptions: ${JSON.stringify(ASSUME)} · ${DAYS} city days per row · base pay (no variety bonus)`);
const rows: { mode: string; hub: HubId; n: number; money: number; mean: number; late: number; away: number; living: number }[] = [];
for (const mode of MODES) for (const h of HUB_IDS) {
  let n = 0, money = 0, late = 0, away = 0, living = 0;
  for (let d = 0; d < DAYS; d++) { const r = simulate(h, mode, 20400 + d * 3 + HUB_IDS.indexOf(h)); n += r.n; money += r.money; late += r.late; away += r.away; living += r.living; }
  rows.push({ mode: mode.name, hub: h, n: n / DAYS, money: money / DAYS, mean: money / n, late: late / DAYS, away: away / DAYS, living: living / DAYS });
}
console.log('| mode | starting district | deliveries / real hour | of which to another district | late | income / real hour | coffee and meals / hour | net / hour | mean pay |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.mode} | ${r.hub} | ${r.n.toFixed(1)} | ${r.away.toFixed(1)} | ${r.late.toFixed(1)} | ${fmt(r.money)} F | ${fmt(r.living)} F | ${fmt(r.money - r.living)} F | ${fmt(r.mean)} F |`);
const GOALS: [string, number][] = [['F2: first monthly rent 50 000 F + 10 000 F charges', 60000], ['F2 furnishing', 300000], ['Jakarta', 150000]];
console.log('\n| goal | F | ' + rows.map(r => `${r.hub} ${r.mode.startsWith('on foot at 3.7') ? 'foot 3.7' : r.mode.startsWith('on foot') ? 'foot 5.6' : 'bike'}`).join(' | ') + ' |');
console.log('|---|---|' + rows.map(() => '---').join('|') + '|');
for (const [name, f] of GOALS) console.log(`| ${name} | ${fmt(f)} | ` + rows.map(r => `${Math.ceil(f / r.mean)} (${(f / (r.money - r.living)).toFixed(1)} h)`).join(' | ') + ' |');
// the offers themselves: how the boards are paid, per district
console.log('\n| district | local pay min–mean–max | to another district min–mean–max | express share |');
console.log('|---|---|---|---|');
for (const h of HUB_IDS) {
  const loc: number[] = [], awy: number[] = []; let x = 0, all = 0;
  for (let d = 0; d < 30; d++) for (let hour = 0; hour < 24; hour++) for (const r of tiakOffers(h, 20400 + d, hour)) { (r.toHub ? awy : loc).push(routePay(r)); all++; if (r.gen!.express) x++; }
  const s = (l: number[]) => `${fmt(Math.min(...l))} – ${fmt(l.reduce((a, b) => a + b, 0) / l.length)} – ${fmt(Math.max(...l))} F`;
  console.log(`| ${h} | ${s(loc)} | ${s(awy)} | ${((x / all) * 100).toFixed(0)} % |`);
}
