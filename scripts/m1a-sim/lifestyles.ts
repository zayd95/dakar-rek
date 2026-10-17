// M1-A progression simulation v2 (read-only): real shift durations (gesture play time, not the 4 s fallback), travel, meals,
// rest, furniture, and greedy reinvestment into ventures. Everything starts from zero mastery.
import './stub';
import { ECONOMY } from '../../src/economy/config';
import { purseOf, boutPoints, rankOf, RUNGS, type BoutEntry, type BoutRes } from '../../src/career/career';
const JOG = 4.2, HUBHOP = 20, OVER = 3;
const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export type Sh = { id: string; cat: string; pay: number; en: number; at: [number, number]; hub: string; secs: number; g?: boolean; fa?: number };
// secs = real play seconds of the action itself: plain actions = content `seconds`; gesture actions = MEASURED in the browser by
// measure-gestures.mjs (human-like bot, gesture clock): meca 13.7 s, roue 6.9 s, vendre 11.8 s (meca_conf has the same gestures as meca).
export const SH: Record<string, Sh> = {
  meca:     { id: 'meca', cat: 'artisanat', pay: 2000, en: 18, at: [102, -5], hub: 'pk', secs: 13.7, g: true, fa: 6 },
  meca_conf:{ id: 'meca_conf', cat: 'artisanat', pay: 2800, en: 18, at: [102, -5], hub: 'pk', secs: 13.7, g: true, fa: 6 },
  roue:     { id: 'roue', cat: 'artisanat', pay: 1500, en: 12, at: [102, -5], hub: 'pk', secs: 6.9, g: true, fa: 4 },
  stock:    { id: 'stock', cat: 'service', pay: 1500, en: 15, at: [-105, 82], hub: 'pk', secs: 4 },
  courrier: { id: 'courrier', cat: 'service', pay: 2400, en: 20, at: [-90, -38], hub: 'pk', secs: 5, fa: 5 },
  debarq:   { id: 'debarq', cat: 'peche', pay: 3200, en: 26, at: [-138, 96], hub: 'co', secs: 6, fa: 8 },
  filets:   { id: 'filets', cat: 'peche', pay: 1800, en: 14, at: [-138, 96], hub: 'co', secs: 5 },
  poisson:  { id: 'poisson', cat: 'peche', pay: 2200, en: 20, at: [-98, 99], hub: 'co', secs: 5 },
  atelier:  { id: 'atelier', cat: 'artisanat', pay: 1600, en: 14, at: [-94, 76], hub: 'co', secs: 5 },
  vendre:   { id: 'vendre', cat: 'commerce', pay: 2500, en: 22, at: [28, -41], hub: 'pl', secs: 11.8, g: true, fa: 8 },
  couture:  { id: 'couture', cat: 'artisanat', pay: 1800, en: 16, at: [75, 82], hub: 'pl', secs: 4 },
};
const HOME: [number, number] = [-42, -54], MAIGA: [number, number] = [78, -5];
export type Cfg = {
  name: string;
  variety: number; varietyCap: number; polyOld: boolean;
  mastery?: { A: number; K: number; credit: (c: Ctx) => number };   // per-category mastery from credit points
  m2?: { A: number; kN: number; alpha: number; wq: number; we: number; wt: number; trustN: number; plainQ: number };   // mastery v2: quality + experience + trust
  gp: number;                         // expected gesture pay factor (score-driven): 0.95 competent, 1.2 perfect, 0.65 sloppy
  qual: (sh: Sh) => number;           // quality 0..1 of this completion (score or on-time)
};
type Ctx = { sh: Sh; q: number; recentSame: number; newPlace: boolean; trust: number };
export interface St { t: number; money: number; en: number; fa: number; pts: Record<string, number>; recent: Map<string, number>; pos: [number, number]; hub: string; owned: Record<string, number>; passive: number; active: number; spent: number; furn: boolean; hist: string[]; seen: Set<string>; shifts: number; lastAcc: number; st: Record<string, { n: number; ema: number; tasks: Set<string>; places: Map<string, number> }> }
export const move = (s: St, to: [number, number], hub: string) => { if (s.hub !== hub) { s.hub = hub; s.pos = to; adv(s, HUBHOP); } else { const d = dist(s.pos, to); s.pos = to; adv(s, d / JOG); } };
const T = ECONOMY.business.tiers;
const unitPrice = (id: string, n: number) => { const tt = T.find(x => x.id === id)!; return Math.round(tt.price * ECONOMY.business.growth ** n / 1000) * 1000; };
const passiveRate = (s: St) => T.reduce((r, x) => r + x.perHour * (s.owned[x.id] ?? 0), 0);          // per city hour = per real minute
export function adv(s: St, dt: number) { s.t += dt; s.en = Math.max(0, s.en - 0.9 * dt / 60); s.fa = Math.max(0, s.fa - 1.6 * dt / 60); const g = passiveRate(s) * dt / 60; s.money += g; s.passive += g; }
export function reinvest(s: St) {
  for (;;) {
    let best: string | null = null, br = 0;
    for (const x of T) { const p = unitPrice(x.id, s.owned[x.id] ?? 0); if (s.money >= p + 3000 && x.perHour / p > br) { br = x.perHour / p; best = x.id; } }
    if (!best) break;
    s.money -= unitPrice(best, s.owned[best] ?? 0); s.owned[best] = (s.owned[best] ?? 0) + 1; s.spent += 0; adv(s, 6);
  }
  if (!s.furn && s.money >= 32_500 + 3000) { s.money -= 32_500; s.furn = true; adv(s, 40); }
}
export function maintain(s: St, minEn: number) {
  if (s.fa < 30) { move(s, MAIGA, 'pk'); adv(s, OVER + 2); s.money -= 500; s.spent += 500; s.fa = Math.min(100, s.fa + 40); }
  if (s.en < minEn) { move(s, HOME, 'pk'); adv(s, OVER + 5 + 6); s.en = Math.min(100, s.en + 70); }
}
const varietyOf = (s: St, cat: string, c: Cfg) => {
  const set = new Set([...s.recent.entries()].filter(([, t]) => s.t - t <= 72 * 60).map(([k]) => k)); set.add(cat);
  const n = set.size;
  return c.polyOld ? Math.min(2, 1 + 0.2 * (n - 1)) : 1 + Math.min(c.varietyCap, c.variety * (n - 1));
};
const AVAIL: Record<string, { tasks: number; places: number }> = (() => { const o: Record<string, { tasks: Set<string>; places: Set<string> }> = {}; for (const sh of Object.values(SH)) { (o[sh.cat] ??= { tasks: new Set(), places: new Set() }); o[sh.cat].tasks.add(sh.id); o[sh.cat].places.add(sh.hub + sh.at.join(',')); } return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { tasks: v.tasks.size, places: v.places.size }])); })();
export const levelV2 = (s: St, cat: string, c: Cfg) => { const m = c.m2!, x = s.st[cat]; if (!x) return 0; const a = AVAIL[cat]; const Lq = x.ema * (1 - Math.exp(-x.n / m.kN)), Le = Math.min(1, x.tasks.size / a.tasks), trusted = [...x.places.values()].filter(v => v >= m.trustN).length, Lt = Math.min(1, trusted / a.places); return m.wq * Lq + m.we * Le + m.wt * Lt; };
const masteryOf = (s: St, cat: string, c: Cfg) => (c.m2 ? 1 + c.m2.A * levelV2(s, cat, c) : c.mastery ? 1 + c.mastery.A * (1 - Math.exp(-(s.pts[cat] ?? 0) / c.mastery.K)) : 1);
export function doShift(s: St, sh: Sh, c: Cfg, passiveMult = 1) {
  maintain(s, sh.en + 2); move(s, sh.at, sh.hub);
  const q = c.qual(sh);
  const base = sh.g ? sh.pay * c.gp : sh.pay;
  const pay = Math.round(base * varietyOf(s, sh.cat, c) * masteryOf(s, sh.cat, c));
  adv(s, sh.secs + OVER);
  s.money += pay; s.active += pay; s.en -= sh.en; s.fa = Math.max(0, s.fa - (sh.fa ?? 0));
  if (c.m2) {
    const m = c.m2, x = (s.st[sh.cat] ??= { n: 0, ema: 0, tasks: new Set(), places: new Map() });
    const Q = sh.g ? Math.max(0, Math.min(1, (q - 0.5) / 0.5)) : m.plainQ;            // gesture score → 0..1; plain work has no quality signal
    x.n++; x.ema = x.n === 1 ? Q : x.ema + m.alpha * (Q - x.ema);
    if (Q >= 0.5) { x.tasks.add(sh.id); const pk = sh.hub + sh.at.join(','); x.places.set(pk, (x.places.get(pk) ?? 0) + 1); }
  }
  if (c.mastery) {
    const key = sh.id + '@' + sh.hub, recentSame = s.hist.slice(-5).filter(x => x === sh.id).length;
    s.pts[sh.cat] = (s.pts[sh.cat] ?? 0) + c.mastery.credit({ sh, q, recentSame, newPlace: !s.seen.has(key), trust: 0 });
    s.seen.add(key); s.hist.push(sh.id);
  }
  s.recent.set(sh.cat, s.t); s.shifts++;
  reinvest(s);
}
export const fresh = (): St => ({ t: 0, money: 3000, en: 85, fa: 70, pts: {}, recent: new Map(), pos: HOME, hub: 'pk', owned: {}, passive: 0, active: 0, spent: 0, furn: false, hist: [], seen: new Set(), shifts: 0, lastAcc: 0, st: {} });
export const nw = (s: St) => s.money + T.reduce((r, x) => { let v = 0; for (let i = 0; i < (s.owned[x.id] ?? 0); i++) v += unitPrice(x.id, i); return r + v; }, 0);
export const CP = [10, 30, 60, 120, 300, 600, 1200];
export function runJobs(c: Cfg, pick: (i: number, s: St) => Sh, minutes = 600) {
  const s = fresh(), snaps: Record<number, { nw: number; act: number; pas: number }> = {}; let i = 0;
  while (s.t < minutes * 60) { const b = s.t; doShift(s, pick(i++, s), c); for (const m of CP) if (b < m * 60 && s.t >= m * 60) snaps[m] = { nw: nw(s), act: s.active, pas: s.passive }; }
  for (const m of CP) snaps[m] ??= { nw: nw(s), act: s.active, pas: s.passive };
  return { snaps, shifts: s.shifts, actPerHour: Math.round(s.active / (s.t / 3600)), pts: s.pts };
}
const fmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'k' : String(Math.round(n)));
export const row = (name: string, r: ReturnType<typeof runJobs>, extra = '') => console.log(name.padEnd(30), CP.map(m => fmt(r.snaps[m].nw).padStart(8)).join(''), '  act/h', fmt(r.actPerHour).padStart(7), extra);
export const hdr = () => console.log('net worth at (min)'.padEnd(30), CP.map(m => String(m).padStart(8)).join(''));
export const GARAGE = (i: number) => [SH.meca, SH.meca, SH.roue, SH.meca_conf][i % 4];
export const FISHING = (i: number) => [SH.debarq, SH.poisson, SH.filets, SH.atelier][i % 4];
export const MARKET = (i: number) => SH.vendre;
export const DIVERS = (i: number) => [SH.meca, SH.vendre, SH.debarq, SH.courrier, SH.atelier, SH.poisson][Math.floor(i / 3) % 6];
