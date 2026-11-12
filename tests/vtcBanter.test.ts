import { describe, expect, it } from 'vitest';
import { Banter, FAREWELLS, GAP, LINES, TEMPERS, qualityOf, temperOf, type Scenario } from '../src/transport/vtcBanter';
import type { DriveEvent } from '../src/transport/driveFeel';
import { find, setGlossesShown } from '../src/i18n/wolof';

const ev = (kind: DriveEvent['kind'], t = 0, speed = 15): DriveEvent => ({ kind, t, speed, strength: 0.5 });
const SCENARIOS = Object.keys(LINES) as Scenario[];

describe('what a passenger says about the driving', () => {
  it('the nervous one says « Dawalal ndank » when the car is fast; the hurried one wants more speed', () => {
    setGlossesShown(false);
    const nervous = new Banter(1, 'nervous'), hurried = new Banter(2, 'hurried');
    expect(nervous.onEvent(ev('fast'), 10)).toMatch(/ndank|tiit|gaaw/i);
    const crawl = hurried.onEvent(ev('crawl'), 10) ?? '';
    expect(crawl).toMatch(/Dama yakamti|Gaawal|rendez-vous|à pied/);
  });
  it('every temper has a line for every scenario (its own, or the scenario’s default)', () => {
    for (const sc of SCENARIOS) for (const t of TEMPERS) { const e = LINES[sc][t] ?? LINES[sc].any; expect(e.length, `${sc}/${t}`).toBeGreaterThan(0); for (const f of e) expect(f().length).toBeGreaterThan(3); }
  });
  it('the scenarios have variations: at least two lines for most tempers of the speed ones', () => {
    for (const sc of ['fast', 'veryFast', 'crawl', 'smooth'] as Scenario[]) for (const t of TEMPERS) expect((LINES[sc][t] ?? LINES[sc].any).length, `${sc}/${t}`).toBeGreaterThanOrEqual(sc === 'veryFast' ? 1 : 2);
  });
  it('does not talk all the time: a pause between lines, a longer one before the same scenario', () => {
    const b = new Banter(3, 'calm');
    expect(b.onEvent(ev('fast'), 100)).not.toBeNull();
    expect(b.onEvent(ev('hardBrake'), 100 + GAP.any - 1)).toBeNull();                    // too soon after any line
    expect(b.onEvent(ev('hardBrake'), 100 + GAP.any + 0.5)).not.toBeNull();
    expect(b.onEvent(ev('fast'), 100 + GAP.same - 1)).toBeNull();                         // the same again too soon
  });
  it('a crash or a very fast burst is answered at once, whatever was said a moment ago', () => {
    const b = new Banter(4, 'calm');
    b.onEvent(ev('smooth'), 50);
    expect(b.onEvent(ev('crash'), 52)).not.toBeNull();
  });
  it('never the same variation twice in a row for one scenario', () => {
    const b = new Banter(5, 'nervous'), seen: string[] = [];
    for (let i = 0; i < 6; i++) { const l = b.onEvent(ev('fast'), 100 + i * (GAP.same + 1)); if (l) seen.push(l); }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
    expect(seen.length).toBeGreaterThanOrEqual(5);
  });
  it('a remark held back by the pause is made a moment later, if it still stands (and not if it is stale)', () => {
    const b = new Banter(9, 'nervous');
    expect(b.onEvent(ev('hardBrake'), 100)).not.toBeNull();
    expect(b.onEvent(ev('fast'), 102)).toBeNull();                                         // too soon after the last line
    expect(b.tick(0.1, 104, { speed: 14, late: false, atStop: false })).toBeNull();      // still in the pause
    expect(b.tick(0.1, 106.2, { speed: 14, late: false, atStop: false })).toMatch(/ndank|tiit|gaaw|pressés|vite/i);
    const c = new Banter(9, 'nervous'); c.onEvent(ev('hardBrake'), 100); c.onEvent(ev('fast'), 102);
    expect(c.tick(0.1, 120, { speed: 14, late: false, atStop: false })).toBeNull();      // far too late: dropped
  });
  it('a hurried passenger complains about a stop in the road, but not at the stop of the drop-off', () => {
    const b = new Banter(6, 'hurried');
    let line: string | null = null, t = 0;
    for (let i = 0; i < 300 && !line; i++) { t += 0.1; line = b.tick(0.1, t, { speed: 0, late: false, atStop: false }); }
    expect(line).toMatch(/pressé|arrêtés|attend|dis/);
    const c = new Banter(6, 'hurried'); let any: string | null = null; for (let i = 0; i < 300; i++) any = c.tick(0.1, i * 0.1, { speed: 0, late: false, atStop: true }) ?? any;
    expect(any).toBeNull();
  });
  it('only a chatty one makes small talk, and only on a smooth stretch', () => {
    const talk = (temper: 'chatty' | 'calm') => { const b = new Banter(7, temper); let n = 0; for (let i = 0; i < 700; i++) if (b.tick(0.1, 20 + i * 0.1, { speed: 9, late: false, atStop: false })) n++; return n; };
    expect(talk('chatty')).toBeGreaterThanOrEqual(1);
    expect(talk('calm')).toBe(0);
  });
  it('the farewell follows how the ride went', () => {
    const t = { fast: 0, veryFast: 0, hardBrake: 0, crash: 0, bump: 0, crawl: 0, smooth: 0 };
    expect(qualityOf(t)).toBe('plain');
    expect(qualityOf({ ...t, smooth: 2 })).toBe('smooth');
    expect(qualityOf({ ...t, crash: 1 })).toBe('rough');
    expect(qualityOf({ ...t, fast: 2, hardBrake: 1 })).toBe('rough');
    expect(qualityOf({ ...t, crawl: 3 })).toBe('slow');
    for (const q of Object.keys(FAREWELLS) as (keyof typeof FAREWELLS)[]) expect(FAREWELLS[q].length).toBeGreaterThanOrEqual(2);
    const b = new Banter(8, 'calm'); b.onEvent(ev('crash'), 1); expect(b.farewell(b.tally)).toMatch(/Jërëjëf/);
    expect(b.tally.crash).toBe(1);
  });
  it('the rush hours make a calm or chatty passenger hurried; the others keep their temper', () => {
    expect(temperOf(0, 8)).toBe('hurried'); expect(temperOf(3, 18)).toBe('hurried'); expect(temperOf(2, 18)).toBe('nervous');
    expect(temperOf(0, 14)).toBe('calm'); expect(temperOf(3, 14)).toBe('chatty'); expect(temperOf(-1, 14)).toBe('chatty');
  });
  it('the Wolof is in the game’s lexicon, with its French', () => {
    for (const p of ['Dawalal ndank', 'Dama yakamti', 'Gaawal', 'Bul gaaw', 'Dama tiit', 'Xoolal', 'Wóoy', 'Baax na', 'Ndank ndank', 'Jërëjëf']) { const e = find(p); expect(e, p).not.toBeNull(); expect(e!.fr.length, p).toBeGreaterThan(2); }
  });
});
