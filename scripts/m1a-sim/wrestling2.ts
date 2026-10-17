// Corrected wrestling career simulation (replaces wrestling.ts): the game's own ladder (ladderAt: the city's twelve wrestlers move
// with the calendar), opponent selection (opponentFor: the three nearest in points; the gala opponent a notch above, never the main
// event), rank eligibility (rankOf: points, ranked wins, a level beaten, the belt, defences), gala/title entry rules (galaBlock, titleBout:
// Fri–Sun evenings from 16 h, one gala bout an evening, belt on Sundays, energy ≥ 25) and purses (purseOf). Bout results and lengths are
// sampled from duel-matrix.json: headless players in the real duel code against each roster wrestler (duel-matrix.ts).
// Assumed: the ritual around a bout (sign-up, walk to the wrestlers' gate, tunnel, corner, ring, result cards, walk back) = RITUAL s.
import './stub';
import fs from 'node:fs';
import { purseOf, boutPoints, rankOf, type BoutEntry, type BoutRes } from '../../src/career/career';
import { ladderAt, opponentFor, titleBout, beltOf, mainEvent, isFightDay, isTitleDay, GALA_RUNG as _G, wrestlerById } from '../../src/career/roster';
import { galaBlock } from '../../src/career/roster';
import { RUNGS } from '../../src/career/career';
import { fresh, adv, move, maintain, reinvest, nw, doShift, SH, type Cfg } from './lifestyles';
const MATRIX = JSON.parse(fs.readFileSync(new URL('./duel-matrix.json', import.meta.url), 'utf8')) as Record<string, Record<string, Record<string, { win: number; loss: number; mean: number }>>>;
const GALA_RUNG = RUNGS.findIndex(r => r.id === 'reputes'), TITLE_RUNG = RUNGS.findIndex(r => r.id === 'contender');
const PARITY: Record<string, number> = { meca: 3600, meca_conf: 3600, roue: 2150, stock: 2000, courrier: 2250, debarq: 2850, filets: 1450, poisson: 1800, atelier: 1450, vendre: 3400, couture: 1500 };
export const applyParity = () => { for (const sh of Object.values(SH)) sh.pay = PARITY[sh.id]; };
const ARENA: [number, number] = [30, -54];
export interface WCfg {
  name: string; skill: 'novice' | 'decent' | 'expert'; trainAt: number | null;   // bouts after which the player has trained (fresh → trained attributes)
  ritual: number; eOrd: number; eGala: number; policy: 'grind' | 'weekend';
  ord?: number[];                     // option only: a separate ordinary purse table (not proposed for implementation)
}
export interface WRes { nw: Record<number, number>; rungAt: Record<number, number>; src: { ord: number; gala: number; title: number; jobs: number }; n: { ord: number; gala: number; title: number }; win: number; titles: number; rung: number; secsInBouts: number }
const DAY0 = 3;                       // city day the first phase starts on (day numbers: weekday = day mod 7, Friday = 4)
export function run(c: WCfg, minutes: number, phaseHours: number, seed: number, CP = [60, 120, 300, 600, 1200]): WRes {
  const s = fresh(); let rng = (seed * 2654435761) >>> 0;
  const rnd = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 2 ** 32; };
  const bouts: BoutEntry[] = []; const src = { ord: 0, gala: 0, title: 0, jobs: 0 }, n = { ord: 0, gala: 0, title: 0 };
  let wins = 0, titles = 0, galaDay = -1, secsInBouts = 0, k = 0; const snaps: Record<number, number> = {}, rungAt: Record<number, number> = {};
  const hoursAbs = () => phaseHours + s.t / 60;                                  // city hours: 1 city hour = 1 real minute of play
  const dayNow = () => DAY0 + Math.floor(hoursAbs() / 24), hourNow = () => hoursAbs() % 24;
  let memo: { key: string; l: ReturnType<typeof ladderAt> } | null = null;
  const ladder = () => { const d = dayNow(), key = `${d}|${bouts.length}`; if (!memo || memo.key !== key) memo = { key, l: ladderAt(d, bouts, []) }; return memo.l; };
  const rankNow = () => rankOf(bouts, dayNow(), beltOf(ladder(), dayNow()));
  const rankedCount = () => bouts.filter(b => b.mode === 'classe').length;
  const profile = () => (c.trainAt !== null && bouts.length >= c.trainAt ? 'trained' : 'fresh');
  const jobPick = [SH.meca, SH.vendre, SH.debarq, SH.courrier, SH.atelier, SH.poisson];
  const jobCfg: Cfg = { name: 'j', variety: 0.05, varietyCap: 0.15, polyOld: false, gp: 0.9, qual: () => 0.8 };
  function fight(kind: 'ord' | 'gala' | 'title', oppId: string) {
    const e = kind === 'ord' ? c.eOrd : c.eGala;
    maintain(s, Math.max(kind === 'ord' ? 20 : 25, e) + 2);
    move(s, ARENA, 'pk');
    const m = MATRIX[profile()][c.skill][oppId], w = wrestlerById(oppId)!;
    const u = rnd(), res: BoutRes = u < m.win ? 'V' : u < m.win + m.loss ? 'D' : 'N';
    const dur = m.mean * (0.6 + 0.8 * rnd());
    adv(s, c.ritual + dur); secsInBouts += c.ritual + dur;
    const rung = rankNow().rung, level = w.level;
    let purse: number;
    if (kind === 'ord' && c.ord) { const kk = res === 'V' ? 1.5 * (1 + 0.1 * Math.max(1, level)) : res === 'N' ? 1 : 0.6; purse = Math.round(c.ord[rung] * kk / 250) * 250; }
    else purse = purseOf('classe', res, rung, level, kind === 'ord' ? undefined : kind);
    s.money += purse; s.en = Math.max(0, s.en - e); src[kind] += purse; n[kind]++; if (res === 'V') wins++;
    bouts.push({ at: s.t * 1000, day: dayNow(), mode: 'classe', opp: w.name, style: w.style, level, res, how: 'projection', purse, pts: boutPoints('classe', res, level, false, kind === 'ord' ? undefined : kind), kind: kind === 'ord' ? undefined : kind });
    if (kind === 'title' && res === 'V' && beltOf(ladder(), dayNow()).defences === 0) titles++;
    const nr = rankNow().rung; for (let r = 0; r <= nr; r++) rungAt[r] ??= s.t / 60;
    reinvest(s);
  }
  rungAt[0] = 0;
  while (s.t < minutes * 60) {
    const before = s.t, d = dayNow(), h = hourNow(), l = ladder(), rk = rankNow();
    let did = false;
    const evening = isFightDay(d) && h >= 16;
    if (evening && galaDay !== d && s.en >= 25) {
      const tb = titleBout(l, d, rk.rung >= TITLE_RUNG);
      if (tb && isTitleDay(d) && !galaBlock('title', { day: d, hour: h, pending: false, energie: s.en, foughtTonight: false })) { fight('title', tb.opp.id); galaDay = d; did = true; }
      else if (rk.rung >= GALA_RUNG && !galaBlock('gala', { day: d, hour: h, pending: false, energie: s.en, foughtTonight: false })) {
        const main = mainEvent(l, d);
        fight('gala', opponentFor(l, rk.score + 40, rankedCount(), main).id); galaDay = d; did = true;
      }
    }
    if (!did) {
      if (c.policy === 'grind' || evening) fight('ord', opponentFor(l, rk.score, rankedCount(), isFightDay(d) ? mainEvent(l, d) : []).id);
      else { const b = s.active; doShift(s, jobPick[Math.floor(k++ / 3) % 6], jobCfg); src.jobs += s.active - b; }
    }
    for (const m of CP) if (before < m * 60 && s.t >= m * 60) snaps[m] = nw(s);
  }
  for (const m of CP) snaps[m] ??= nw(s);
  return { nw: snaps, rungAt, src, n, win: wins / Math.max(1, n.ord + n.gala + n.title), titles, rung: rankNow().rung, secsInBouts };
}
