import { describe, it, expect, afterEach } from 'vitest';
import {
  BAKK_BEATS, CEREMONY, CORNER_PACE, IN_ARRIVE, IN_FILE, OUT_FILE, announceLine, answerLine, bakkSpot, boastLine, chantLine, chantSpot, cornerSides,
  entranceCues, entourageIn, entourageToCorner, goxOf, griotCornerSpot, griotLine, pathLength, playerBoastLine, poseAt, recordText, ringSpot, setOffCorner,
  setOffIn, setRecordSource, tunnelStart, wrestlerPlan, type Fighter, type Who,
} from '../src/arena/ceremony';
import { cornerSpot } from '../src/arena/people';
import { BAKK_ID, PLAYER_BAKK, bakkActivity, standsSide } from '../src/arena/bakk';
import { BILL, SHOW } from '../src/arena/program';
import { PREP_SIDE, prepCornerCentre } from '../src/world/arenaModules';
import { RING_R, TUNNEL_MOUTH_R, WALL_R } from '../src/world/geew';
import { unknownPhrases } from '../src/i18n/lines';
import { glossed } from '../src/i18n/wolof';

const C = { x: 100, z: -40 };
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const r = (p: { x: number; z: number }) => dist(p, C);
const WHO: Who[] = ['left', 'right'];
const bill = { left: { ...BILL.left }, right: { ...BILL.right } } as { left: Fighter; right: Fighter };
const CS = cornerSides(bill);

describe('the entrance ceremony: when', () => {
  it('each wrestler walks out, does his bàkk alone on the sand, then goes to his corner; both come to the ring for the bout', () => {
    for (const who of WHO) { const T = CEREMONY[who]; expect(T.out[1]).toBe(T.bakk[0]); expect(T.bakk[1]).toBe(T.corner[0]); expect(T.bakk[1] - T.bakk[0]).toBeGreaterThanOrEqual(5); }
    expect(CEREMONY.left.bakk[1]).toBeLessThanOrEqual(CEREMONY.right.bakk[0]);                       // one bàkk at a time
    expect(CEREMONY.ring[0]).toBeGreaterThan(CEREMONY.right.corner[1]);
    expect(CEREMONY.end).toBeGreaterThan(CEREMONY.ring[1]);
    expect(SHOW.entrance).toBe(CEREMONY.end);
  });
  it('the cues: the announcer names him as he walks out, then his bàkk — the drums change, his boast, the griot, the chant — and the drums go back', () => {
    const cues = entranceCues(bill, 12);
    for (let i = 1; i < cues.length; i++) expect(cues[i].t).toBeGreaterThanOrEqual(cues[i - 1].t);
    for (const who of WHO) {
      const mine = cues.filter(c => c.who === who), T = CEREMONY[who], at = (k: string) => mine.find(c => c.kind === k)!.t;
      expect(mine.map(c => c.kind)).toEqual(['announce', 'bakk', 'boast', 'griot', 'chant', 'drums']);
      expect(at('announce')).toBeLessThan(T.out[1]); expect(at('bakk')).toBe(T.bakk[0]); expect(at('drums')).toBe(T.bakk[1]);
      for (const k of ['boast', 'griot', 'chant']) { expect(at(k)).toBeGreaterThan(T.bakk[0]); expect(at(k)).toBeLessThan(T.bakk[1] - 1); }
      for (const c of mine.filter(c => c.text)) expect(c.text).toContain(bill[who].name);
    }
    // two lines on screen at most from one side at once (a toast lasts about 4 s)
    const said = cues.filter(c => c.text);
    for (let i = 2; i < said.length; i++) expect(said[i].t - said[i - 2].t).toBeGreaterThan(2.5);
  });
});

describe('the entrance ceremony: where', () => {
  it('a wrestler comes out of the tunnel, does his bàkk inside the ring on his side, goes to his corner, then to the ring', () => {
    for (const who of WHO) {
      const plan = wrestlerPlan(C.x, C.z, who, CS[who]), T = CEREMONY[who];
      const at = (t: number) => poseAt(plan, t, C.x, C.z, who);
      expect(dist(at(0), tunnelStart(C.x, C.z, who))).toBeLessThan(1e-6); expect(r(at(0))).toBeGreaterThan(TUNNEL_MOUTH_R);
      const b = at((T.bakk[0] + T.bakk[1]) / 2);
      expect(b.part).toBe('bakk'); expect(dist(b, bakkSpot(C.x, C.z, who))).toBeLessThan(1e-6); expect(r(b)).toBeLessThan(RING_R - 2);
      expect(Math.sign(b.x - C.x)).toBe(who === 'left' ? 1 : -1);
      const p = at(T.corner[1] + 0.5);
      expect(p.part).toBe('prep'); expect(dist(p, prepCornerCentre(C.x, C.z, CS[who]))).toBeLessThan(1e-6); expect(p.clip).toBe('Prep');
      const ready = at(CEREMONY.end - 0.2);
      expect(dist(ready, ringSpot(C.x, C.z, who))).toBeLessThan(1e-6); expect(ready.clip).toBe('Stance');
      // walking at a walk, jogging to the ring
      for (const leg of plan.filter(l => l.path.length > 1)) {
        const v = pathLength(leg.path) / (leg.t1 - leg.t0);
        expect(v, `${who} ${leg.part}`).toBeLessThan(leg.part === 'ring' ? 5 : 3.2);
      }
    }
  });
  it('the bàkk is danced in beats: the dance and the arms up, to his own stands then to the ring', () => {
    const plan = wrestlerPlan(C.x, C.z, 'left', CS.left), T = CEREMONY.left, n = BAKK_BEATS.length;
    const beats = Array.from({ length: n }, (_, i) => poseAt(plan, T.bakk[0] + ((i + 0.5) / n) * (T.bakk[1] - T.bakk[0]), C.x, C.z, 'left'));
    expect(beats.map(b => b.clip)).toEqual(BAKK_BEATS.map(b => b.clip));
    expect(beats.map(b => b.beat)).toEqual([0, 1, 2, 3]);
    expect(Math.sin(beats[0].yaw)).toBeCloseTo(1);                                                     // the left one's stands are on +x
    expect(new Set(beats.map(b => b.clip)).size).toBeGreaterThanOrEqual(2);
  });
  it('the two wrestlers never walk into each other', () => {
    const plans = WHO.map(w => wrestlerPlan(C.x, C.z, w, CS[w]));
    for (let t = 0; t <= CEREMONY.end; t += 0.1) {
      const a = poseAt(plans[0], t, C.x, C.z, 'left'), b = poseAt(plans[1], t, C.x, C.z, 'right');
      expect(dist(a, b), `t ${t.toFixed(1)}`).toBeGreaterThan(1.2);
    }
  });
  it('his people stand round him during his bàkk: apart, inside the ring, clear of the referee and of the other wrestler', () => {
    for (const who of WHO) {
      const spots = [0, 1, 2, 3, 'griot' as const].map(k => chantSpot(C.x, C.z, who, k)), b = bakkSpot(C.x, C.z, who);
      const other = bakkSpot(C.x, C.z, who === 'left' ? 'right' : 'left'), referee = { x: C.x, z: C.z + 2.4 };
      for (const p of spots) {
        expect(r(p)).toBeLessThan(RING_R - 0.4); expect(dist(p, b)).toBeGreaterThan(1.3); expect(dist(p, b)).toBeLessThan(2.3);
        expect(dist(p, referee)).toBeGreaterThan(2); expect(dist(p, other)).toBeGreaterThan(1.8);
        expect(Math.cos(p.yaw - Math.atan2(b.x - p.x, b.z - p.z))).toBeGreaterThan(0.99);               // facing him
      }
      for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) expect(dist(spots[i], spots[j])).toBeGreaterThan(0.9);
    }
  });
  it('they walk in behind him and stand round him before his bàkk starts, then follow him to the corner before he leaves it', () => {
    for (const who of WHO) {
      const T = CEREMONY[who];
      for (const k of [0, 1, 2, 3, 'griot'] as const) {
        const path = entourageIn(C.x, C.z, who, k), go = setOffIn(who, k);
        expect(go).toBeGreaterThan(T.out[0]);                                                          // behind him
        expect(pathLength(path) / (T.bakk[0] + IN_ARRIVE - go), `${who} ${k}`).toBeLessThan(3.6);       // a brisk walk
        expect(r(path[0])).toBeLessThan(WALL_R + 1.5);
        const to = k === 'griot' ? griotCornerSpot(C.x, C.z, CS[who]) : cornerSpot(C.x, C.z, CS[who], k);
        const leave = setOffCorner(who, k), back = entourageToCorner(C.x, C.z, who, CS[who], k, to);
        expect(leave).toBeGreaterThanOrEqual(T.bakk[1] + 0.5);                                         // once he has gone
        expect(leave + pathLength(back) / CORNER_PACE, `${who} ${k}`).toBeLessThan(CEREMONY.ring[0] - 0.2);
      }
      expect(IN_FILE[0]).toBe('griot'); expect(OUT_FILE[OUT_FILE.length - 1]).toBe('griot');
    }
  });
  it('the corners follow the card: each wrestler his écurie\'s side, the other one the other side', () => {
    expect(cornerSides(bill)).toEqual({ left: PREP_SIDE.baobab, right: PREP_SIDE.teranga });
    const same = cornerSides({ left: { id: 'a', name: 'A', ecurie: 'Teranga' }, right: { id: 'b', name: 'B', ecurie: 'Teranga' } });
    expect(same.left).toBe(PREP_SIDE.teranga); expect(same.right).toBe(-PREP_SIDE.teranga);
    const none = cornerSides({ left: { id: 'a', name: 'A', ecurie: 'indépendant' }, right: { id: 'b', name: 'B', ecurie: 'indépendant' } });
    expect(none).toEqual({ left: 1, right: -1 });
    const other = cornerSides({ left: { id: 'a', name: 'A', ecurie: 'indépendant' }, right: { id: 'b', name: 'B', ecurie: 'Baobab' } });
    expect(other.right).toBe(PREP_SIDE.baobab); expect(other.left).toBe(-PREP_SIDE.baobab);
  });
});

describe('the entrance ceremony: what is said', () => {
  afterEach(() => setRecordSource(null));
  const plain = (s: string) => glossed(s, true).replace(/[  ]/g, ' ');
  const ROSTER: Fighter[] = [bill.left, bill.right, { id: 'ousmane', name: 'Ousmane', ecurie: 'Baobab' }, { id: 'gora', name: 'Gora', ecurie: 'indépendant' }];
  const lines = (f: Fighter) => Array.from({ length: 40 }, (_, k) => [boastLine(f, `d${k}`), griotLine(f, `d${k}`)]).flat().concat(chantLine(f));
  it('the announcer names him, his écurie and his neighbourhood, with his record when the roster knows it', () => {
    expect(plain(announceLine(bill.left, 'left', null))).toBe('🎤 L’annonceur : À ma gauche, pour l’écurie Baobab, venu de Pikine… Babacar !');
    expect(plain(announceLine(bill.right, 'right', { v: 7, d: 1, n: 0 }))).toBe('🎤 L’annonceur : À ma droite, pour l’écurie Teranga, venu de Guédiawaye… Lamine ! 7 victoires, 1 défaite !');
    expect(announceLine(ROSTER[3], 'left', null)).toContain('sans écurie');
    expect(recordText({ v: 1, d: 0, n: 2 })).toBe('1 victoire, 0 défaite, 2 nuls');
    setRecordSource(id => (id === 'babacar' ? { v: 5, d: 2, n: 1 } : null));
    const cues = entranceCues(bill, 3);
    expect(cues.find(c => c.who === 'left' && c.kind === 'announce')!.text).toContain('5 victoires, 2 défaites, 1 nul');
    expect(cues.find(c => c.who === 'right' && c.kind === 'announce')!.text).not.toMatch(/victoire/);
    expect(goxOf(ROSTER[2])).toBe('Pikine'); expect(goxOf(ROSTER[3])).toBe('Dakar');
  });
  it('the same evening says the same lines; other evenings, others', () => {
    expect(entranceCues(bill, 9)).toEqual(entranceCues(bill, 9));
    const seen = new Set(Array.from({ length: 30 }, (_, d) => boastLine(bill.left, String(d))));
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
  it('the Wolof is the lexicon\'s, written in CLAD; boasts are about himself, never against anyone; nothing religious', () => {
    unknownPhrases.clear();
    const all = ROSTER.flatMap(lines).concat([0, 1, 2, 3].map(k => playerBoastLine(`p${k}`)), answerLine(true), answerLine(false));
    expect([...unknownPhrases]).toEqual([]);
    for (const l of all.map(plain)) {
      for (const m of l.matchAll(/«\s([^»]*)\s»/g)) expect(m[1]).toMatch(/^[a-zàéëóñŋ ,.?!-]*$/i);
      expect(l).not.toMatch(/dieu|allah|prière|prier|marabout|gris-gris|amulette|bain|coran|baraka|inch|bénédiction|sacré/i);
      expect(l).not.toMatch(/nul\b|faible|lâche|minable|écraser|détruire|honte|peur de moi/i);
    }
    for (const f of ROSTER) for (const l of lines(f)) for (const o of ROSTER.filter(x => x.id !== f.id)) expect(l).not.toContain(o.name);   // never about the other one
  });
});

describe('the player\'s bàkk before the ring', () => {
  it('two short beats, the boast then the answer; nothing earned, nothing spent', () => {
    let answered = false, ended = 0;
    const a = bakkActivity('s', { answered: () => answered, answer: () => { answered = true; }, end: () => { ended++; } });
    expect(a.id).toBe(BAKK_ID);
    expect(a.steps.map(s => s.clip)).toEqual(PLAYER_BAKK.map(b => b.clip));
    expect(a.steps.reduce((t, s) => t + (s.seconds ?? 0), 0)).toBeLessThanOrEqual(5);
    for (const s of a.steps) expect(s.effects).toBeUndefined();
    expect(a.price).toBeUndefined();
    a.steps[0].then?.(); expect(answered).toBe(true);
    const line = a.steps[1].line; expect(typeof line === 'function' ? plain(line()) : '').toContain('tribunes');
    a.steps[1].then?.(); expect(ended).toBe(1);
  });
  it('the stands that answer are those by the player\'s corner', () => {
    expect(standsSide('baobab')).toBe(PREP_SIDE.baobab > 0 ? 'left' : 'right');
    expect(standsSide('teranga')).not.toBe(standsSide('baobab'));
  });
});

const plain = (s: string) => glossed(s, true).replace(/[  ]/g, ' ');
