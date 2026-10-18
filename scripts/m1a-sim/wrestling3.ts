// Wrestling career simulation with the ordinary-purse exploit scenarios (replaces wrestling2.ts; same engine): the game's own ladder (ladderAt: the city's twelve wrestlers move
// with the calendar), opponent selection (opponentFor: the three nearest in points; the gala opponent a notch above, never the main
// event), rank eligibility (rankOf: points, ranked wins, a level beaten, the belt, defences), gala/title entry rules (galaBlock, titleBout:
// Fri–Sun evenings from 16 h, one gala bout an evening, belt on Sundays, energy ≥ 25) and purses (purseOf). Bout results and lengths are
// sampled from duel-matrix.json: headless players in the real duel code against each roster wrestler (duel-matrix.ts).
// Assumed: the ritual around a bout (sign-up, walk to the wrestlers' gate, tunnel, corner, ring, result cards, walk back) = RITUAL s.
import './stub';
import fs from 'node:fs';
import { purseOf, boutPoints, rankOf, RUNGS as RUNGS_, type BoutEntry, type BoutRes } from '../../src/career/career';
import { ladderAt, opponentFor, titleBout, beltOf, mainEvent, isFightDay, isTitleDay, GALA_RUNG as _G, wrestlerById } from '../../src/career/roster';
import { galaBlock } from '../../src/career/roster';
import { RUNGS } from '../../src/career/career';
import { fresh, adv, move, maintain, reinvest, nw, doShift, SH, type Cfg } from './lifestyles';
const MATRIX = JSON.parse(fs.readFileSync(new URL('./duel-matrix.json', import.meta.url), 'utf8')) as Record<string, Record<string, Record<string, { win: number; loss: number; mean: number }>>>;
const STALL = JSON.parse(fs.readFileSync(new URL('./stall-matrix.json', import.meta.url), 'utf8')) as Record<string, Record<string, { win: number; loss: number; mean: number }>>;
const GALA_RUNG = RUNGS.findIndex(r => r.id === 'reputes'), TITLE_RUNG = RUNGS.findIndex(r => r.id === 'contender');
const PARITY: Record<string, number> = { meca: 3600, meca_conf: 3600, roue: 2150, stock: 2000, courrier: 2250, debarq: 2850, filets: 1450, poisson: 1800, atelier: 1450, vendre: 3400, couture: 1500 };
export const applyParity = () => { for (const sh of Object.values(SH)) sh.pay = PARITY[sh.id]; };
const ARENA: [number, number] = [30, -54];
export interface WCfg {
  name: string; skill: 'novice' | 'decent' | 'expert'; trainAt: number | null;   // bouts after which the player has trained (fresh → trained attributes)
  ritual: number; eOrd: number; eGala: number; policy: 'grind' | 'weekend';
  /** Anti-exploit candidate: the purse (and optionally the ladder points) of an ordinary bout against an opponent already fought `free`
   *  times in the same `window` city days shrinks to 1 / (1 + slope × (n − free + 1)), never below `floor`. Friendly bouts and galas/titles: untouched. */
  rematch?: { window: number; free: number; slope: number; floor: number; points?: boolean; purse?: boolean };
  /** Ordinary-bout purse: the game's `purseOf` as it is now ('real': by the opponent's level), the previous rule ('legacy': by the player's
   *  rung), or a table by opponent level (a candidate). Galas and titles always use the real `purseOf`. */
  ordinary?: 'real' | 'legacy' | number[];
  /** What the player does in an ordinary bout: honest play (measured duels), deliberate quick losses, abandoning, or a pure stall. */
  behaviour?: 'honest' | 'quickLoss' | 'abandon' | 'stall'; climbTo?: number;   // behaviour applies once the rank reaches `climbTo` (honest before)
  ordPerEvening?: number;             // 'weekend' fighters: ordinary bouts per fight evening (default: as many as fit)
}
export interface WRes { nw: Record<number, number>; rungAt: Record<number, number>; src: { ord: number; gala: number; title: number; jobs: number }; n: { ord: number; gala: number; title: number }; win: number; titles: number; rung: number; secsInBouts: number }
const DAY0 = 3;                       // city day the first phase starts on (day numbers: weekday = day mod 7, Friday = 4)
export function run(c: WCfg, minutes: number, phaseHours: number, seed: number, CP = [60, 120, 300, 600, 1200]): WRes {
  const s = fresh(); let rng = (seed * 2654435761) >>> 0;
  const rnd = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 2 ** 32; };
  const bouts: BoutEntry[] = []; const src = { ord: 0, gala: 0, title: 0, jobs: 0 }, n = { ord: 0, gala: 0, title: 0 };
  let wins = 0, titles = 0, galaDay = -1, secsInBouts = 0, k = 0; const ordToday = new Map<number, number>(); const snaps: Record<number, number> = {}, rungAt: Record<number, number> = {};
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
    const beh = kind === 'ord' && c.behaviour && c.behaviour !== 'honest' && rankNow().rung >= (c.climbTo ?? 0) ? c.behaviour : 'honest';
    const sm = STALL[profile()][oppId];
    let res: BoutRes, dur: number; const u = rnd();
    if (beh === 'quickLoss') { res = 'D'; dur = 8; }
    else if (beh === 'abandon') { res = 'A'; dur = 15; }
    else if (beh === 'stall') { res = u < sm.win ? 'V' : u < sm.win + sm.loss ? 'D' : 'N'; dur = sm.mean * (0.6 + 0.8 * rnd()); }
    else { res = u < m.win ? 'V' : u < m.win + m.loss ? 'D' : 'N'; dur = m.mean * (0.6 + 0.8 * rnd()); }
    adv(s, c.ritual + dur); secsInBouts += c.ritual + dur;
    const rung = rankNow().rung, level = w.level;
    let purse: number, f = 1;
    if (kind === 'ord' && c.rematch) { const R = c.rematch, nPrev = bouts.filter(b => b.opp === w.name && b.mode === 'classe' && !b.kind && dayNow() - b.day < R.window).length; f = nPrev < R.free ? 1 : Math.max(R.floor, 1 / (1 + R.slope * (nPrev - R.free + 1))); }
    const kk = res === 'A' ? 0 : res === 'V' ? 1.5 * (1 + 0.1 * Math.max(1, level)) : res === 'N' ? 1 : 0.6;
    if (kind === 'ord' && c.ordinary === 'legacy') purse = Math.round((RUNGS_[Math.max(0, Math.min(RUNGS_.length - 1, rung))].purse * kk) / 250) * 250;
    else if (kind === 'ord' && Array.isArray(c.ordinary)) purse = Math.round((c.ordinary[level - 1] * kk) / 250) * 250;
    else purse = purseOf('classe', res, rung, level, kind === 'ord' ? undefined : kind);
    purse = Math.round(purse * (c.rematch?.purse === false ? 1 : f) / 250) * 250;
    s.money += purse; s.en = Math.max(0, s.en - e); src[kind] += purse; n[kind]++; if (res === 'V') wins++;
    bouts.push({ at: s.t * 1000, day: dayNow(), mode: 'classe', opp: w.name, style: w.style, level, res, how: 'projection', purse, pts: Math.round(boutPoints('classe', res, level, false, kind === 'ord' ? undefined : kind) * (c.rematch?.points && boutPoints('classe', res, level) > 0 ? f : 1)), kind: kind === 'ord' ? undefined : kind });
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
      const room = (ordToday.get(d) ?? 0) < (c.ordPerEvening ?? Infinity);
      if (c.policy === 'grind' || (evening && room)) { ordToday.set(d, (ordToday.get(d) ?? 0) + 1); fight('ord', opponentFor(l, rk.score, rankedCount(), isFightDay(d) ? mainEvent(l, d) : []).id); }
      else { const b = s.active; doShift(s, jobPick[Math.floor(k++ / 3) % 6], jobCfg); src.jobs += s.active - b; }
    }
    for (const m of CP) if (before < m * 60 && s.t >= m * 60) snaps[m] = nw(s);
  }
  for (const m of CP) snaps[m] ??= nw(s);
  return { nw: snaps, rungAt, src, n, win: wins / Math.max(1, n.ord + n.gala + n.title), titles, rung: rankNow().rung, secsInBouts };
}
