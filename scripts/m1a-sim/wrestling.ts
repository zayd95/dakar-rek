// Wrestling career simulation (read-only): real ladder functions (rankOf, boutPoints, purseOf, RUNGS), the real weekly gala calendar
// (Fri–Sun from 16 h, one gala/title bout per evening, the belt on Sundays, wall-clock city time → random phase), bout length, ritual,
// fatigue, rest, meals, reinvestment. Compared with the job lifestyles at the same horizon.
import './stub';
import { purseOf, boutPoints, rankOf, RUNGS, type BoutEntry, type BoutRes } from '../../src/career/career';
import { fresh, adv, move, maintain, reinvest, nw, doShift, SH, type Cfg, type St } from './lifestyles';
const PARITY: Record<string, number> = { meca: 3600, meca_conf: 3600, roue: 2150, stock: 2000, courrier: 2250, debarq: 2850, filets: 1450, poisson: 1800, atelier: 1450, vendre: 3400, couture: 1500 };
export const applyParity = () => { for (const sh of Object.values(SH)) sh.pay = PARITY[sh.id]; };
export interface WCfg { name: string; ord: number[] | null; ritual: number; duel: number; eOrd: number; eGala: number; skill: number; policy: 'grind' | 'weekend'; galaMult?: number; galaScale?: number[] }
const LV = [1, 2, 3, 4, 5, 5, 5];   // roster levels 1..5 (src/career/roster.ts); opponentFor picks the 3 nearest in points
const ARENA: [number, number] = [30, -54];
export interface WRes { nw: Record<number, number>; rungAt: Record<number, number>; src: { ord: number; gala: number; title: number; jobs: number }; bouts: { ord: number; gala: number; title: number }; wins: number; fights: number; rung: number; titles: number }
export function runWrestler(c: WCfg, minutes: number, phaseMin: number, seed = 7, CP = [60, 120, 300, 600, 1200]): WRes {
  const s = fresh(); let rng = seed * 2654435761 >>> 0;
  const rnd = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 2 ** 32; };
  const bouts: BoutEntry[] = []; const src = { ord: 0, gala: 0, title: 0, jobs: 0 }, cnt = { ord: 0, gala: 0, title: 0 };
  let held = false, defences = 0, wins = 0, fights = 0, titles = 0; const snaps: Record<number, number> = {}, rungAt: Record<number, number> = { 0: 0 };
  let galaDay = -1, i = 0;
  const hoursNow = () => phaseMin / 1 / 60 * 0 + (phaseMin + s.t / 60);           // city hours since Monday 00:00 of week 0 (1 city hour = 1 real min)
  const day = () => Math.floor(hoursNow() / 24), hour = () => hoursNow() % 24, wd = () => day() % 7;
  const evening = () => [4, 5, 6].includes(wd()) && hour() >= 16;
  const rankNow = () => rankOf(bouts, day(), { held, defences });
  const bout = (kind: 'ord' | 'gala' | 'title') => {
    const r = rankNow(); const rung = r.rung;
    const e = kind === 'ord' ? c.eOrd : c.eGala;
    maintain(s, e + 22 > 100 ? 90 : e + 22 > 0 ? e + 22 : 22);
    move(s, ARENA, 'pk');
    adv(s, c.ritual + c.duel * (0.7 + 0.6 * rnd()));
    const L = kind === "title" ? 5 : kind === "gala" ? Math.min(5, LV[rung] + 1) : LV[rung];
    const pw = (kind === 'ord' ? 0.60 : kind === 'gala' ? 0.50 : held ? 0.55 : 0.45) + c.skill;
    const u = rnd(), res: BoutRes = u < pw ? 'V' : u < pw + 0.1 ? 'N' : 'D';
    let purse: number;
    if (kind === 'ord' && c.ord) { const k = res === 'V' ? 1.5 * (1 + 0.1 * Math.max(1, L)) : res === 'N' ? 1 : 0.6; purse = Math.round(c.ord[rung] * k / 250) * 250; }
    else purse = purseOf('classe', res, rung, L, kind === 'ord' ? undefined : kind) * (kind === 'ord' ? 1 : (c.galaMult ?? 1) * (c.galaScale?.[rung] ?? 1));
    s.money += purse; s.en = Math.max(0, s.en - e); src[kind] += purse; cnt[kind]++; fights++; if (res === 'V') wins++;
    bouts.push({ at: s.t * 1000, day: day(), mode: 'classe', opp: 'o' + (i++), style: 'x', level: L, res, how: 'décision', purse, pts: boutPoints('classe', res, L, false, kind === 'ord' ? undefined : kind), kind: kind === 'ord' ? undefined : kind } as BoutEntry);
    if (kind === 'title') { if (held) { if (res === 'V') defences++; else { held = false; defences = 0; } } else if (res === 'V') { held = true; defences = 0; titles++; } }
    const nr = rankNow().rung; for (let k = 1; k <= nr; k++) rungAt[k] ??= s.t / 60;
    reinvest(s);
  };
  const jobPick = [SH.meca, SH.vendre, SH.debarq, SH.courrier, SH.atelier, SH.poisson];
  const jobCfg: Cfg = { name: 'j', variety: 0.05, varietyCap: 0.15, polyOld: false, gp: 0.9, qual: () => 0.8 };
  while (s.t < minutes * 60) {
    const before = s.t, w0 = s.active;
    const rung = rankNow().rung, d = day();
    let did = false;
    if (evening() && galaDay !== d) {
      if (wd() === 6 && rung >= 4) { bout('title'); galaDay = d; did = true; }
      else if (rung >= 3) { bout('gala'); galaDay = d; did = true; }
    }
    if (!did) {
      if (c.policy === 'grind' || evening()) bout('ord');
      else { const b = s.active; doShift(s, jobPick[Math.floor(i++ / 3) % 6], jobCfg); src.jobs += s.active - b; }
    }
    for (const m of CP) if (before < m * 60 && s.t >= m * 60) snaps[m] = nw(s);
  }
  for (const m of CP) snaps[m] ??= nw(s);
  return { nw: snaps, rungAt, src, bouts: cnt, wins, fights, rung: rankNow().rung, titles };
}
