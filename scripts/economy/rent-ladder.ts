// The home ladder's rents against the economy (docs/economy/RENT_JAMM.md). Run: npx vite-node scripts/economy/rent-ladder.ts
// One in-game month = 30 city days; a city day is 24 minutes of play (src/core/clock.ts), so a month is 12 hours of play.
import { HOMES } from '../../src/economy/catalog';
import { CITY_DAY_MS } from '../../src/core/clock';
const DAY_H = CITY_DAY_MS / 3_600_000, MONTH_DAYS = 30;
// What a competent player earns by active play, F per played hour (docs/M1A-ECONOMY.md F1: 271 k competent, 195 k sloppy, 343 k perfect, with variety only).
const EARN: Record<string, number> = { sloppy: 195_000, competent: 271_000, perfect: 343_000 };
const f = (n: number) => Math.round(n).toLocaleString('fr-FR');
console.log('home | m² | price | rent/day | rent/month | F/m²/month | rent/price %/month | % of a month\'s active pay (sloppy / competent / perfect) | played minutes of competent work to pay one month');
for (const h of HOMES.filter(x => x.rent)) {
  const month = h.rent! * MONTH_DAYS, per = (e: number) => (100 * month) / (e * DAY_H * MONTH_DAYS);
  console.log([h.id, h.size, f(h.price!), f(h.rent!), f(month), f(month / h.size!), (100 * month / h.price!).toFixed(2), `${per(EARN.sloppy).toFixed(1)} / ${per(EARN.competent).toFixed(1)} / ${per(EARN.perfect).toFixed(1)}`, (60 * month / EARN.competent).toFixed(1)].join(' | '));
}
