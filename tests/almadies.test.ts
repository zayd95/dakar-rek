import { describe, expect, it } from 'vitest';
import type { SaveData } from '../src/core/types';
import { clubNight } from '../src/activity/templates';
import { hourStamp } from '../src/social/memory';
import {
  AL, AWA_LINES, STAGE, awaTalk, chooseToast, clubOpen, endEvening, eveningOf, giftReady, gifted, noteCounter, stages, talked,
} from '../src/districts/almadiesRules';

const blank = (): Pick<SaveData, 'flags' | 'counters'> => ({ flags: [], counters: {} });
const night = eveningOf(5, 21);

describe('Almadies M4: one evening out (src/districts/almadiesRules.ts)', () => {
  it('an evening is the club’s night: the small hours belong to the evening before', () => {
    for (const day of [0, 1, 7, 30]) for (const hour of [0, 3, 11.9, 12, 18, 21, 23.9]) expect(eveningOf(day, hour)).toBe(clubNight(day, hour));
    expect(eveningOf(6, 2)).toBe(eveningOf(5, 22));
  });

  it('a stage counts only when the activity’s own counter moves; loading a save invents nothing', () => {
    const d = blank();
    expect(noteCounter(d, night, 'dine', 4)).toBe(0);                  // first read: adopts the counter, no stage
    expect(stages(d, night)).toBe(0);
    expect(noteCounter(d, night, 'dine', 4)).toBe(0);                  // no change
    expect(noteCounter(d, night, 'dine', 5)).toBe(STAGE.dine);        // a meal ended
    expect(noteCounter(d, night, 'dine', 6)).toBe(0);                  // a second meal the same evening adds nothing
    expect(noteCounter(d, night, 'dance', 0)).toBe(0);
    expect(noteCounter(d, night, 'dance', 1)).toBe(STAGE.dance);
    expect(stages(d, night)).toBe(STAGE.dine | STAGE.dance);
    expect(stages(d, night + 1)).toBe(0);                              // the next evening starts empty
  });

  it('the first talk is « first », sets the memory once, gives the social moment once an evening, and cannot be farmed', () => {
    const d = blank();
    expect(awaTalk(d, night)).toBe('first');
    expect(talked(d, night, hourStamp(5, 20))).toEqual({ kind: 'first', moment: true });
    expect(d.counters[AL.met]).toBe(hourStamp(5, 20) + 1);
    for (let i = 0; i < 5; i++) expect(talked(d, night, hourStamp(5, 20))).toEqual({ kind: 'again', moment: false });
    expect(stages(d, night)).toBe(STAGE.talk);
  });

  it('on a later evening she recognises the guest once, remembers what they said and what they did, and offers one coffee', () => {
    const d = blank();
    talked(d, night, hourStamp(5, 20)); chooseToast(d, 2);
    noteCounter(d, night, 'dine', 0); noteCounter(d, night, 'dine', 1); noteCounter(d, night, 'dance', 0); noteCounter(d, night, 'dance', 1);
    expect(giftReady(d, night)).toBe(false);                           // not on the evening of the first talk
    expect(endEvening(d, night)?.lines.join(' ')).toMatch(/Dîner.*souviendra.*dansé/);
    const later = night + 1;
    expect(awaTalk(d, later)).toBe('recognise');
    expect(giftReady(d, later)).toBe(true);
    const t = talked(d, later, hourStamp(6, 20));
    expect(t).toEqual({ kind: 'recognise', moment: true });
    const said = AWA_LINES.recognise(d.counters[AL.toast], d.counters[AL.lastMask]);
    expect(said).toMatch(/bon travail/); expect(said).toMatch(/danser/);
    gifted(d, later);
    expect(giftReady(d, later)).toBe(false);                           // once an evening
    expect(awaTalk(d, later)).toBe('again');
    expect(giftReady(d, later + 1)).toBe(true);
  });

  it('the end-of-evening card comes once, only when something was done, and counts evenings', () => {
    const d = blank();
    expect(endEvening(d, night)).toBeNull();                           // nothing done: no card
    noteCounter(d, night, 'dine', 0); noteCounter(d, night, 'dine', 1);
    const c = endEvening(d, night)!;
    expect(c.title).toMatch(/première/); expect(c.lines.some(l => /Dîner/.test(l))).toBe(true);
    expect(endEvening(d, night)).toBeNull();                           // once
    expect(d.counters[AL.evenings]).toBe(1);
    talked(d, night + 1, hourStamp(6, 20));
    expect(endEvening(d, night + 1)!.title).toMatch(/2ᵉ/);
    expect(d.counters[AL.evenings]).toBe(2);
  });

  it('a full evening says so; the club hour hint follows the club’s hours (21 h to 5 h)', () => {
    const d = blank();
    talked(d, night, 0); noteCounter(d, night, 'dine', 0); noteCounter(d, night, 'dine', 1); noteCounter(d, night, 'dance', 0); noteCounter(d, night, 'dance', 1);
    expect(endEvening(d, night)!.lines.join(' ')).toMatch(/complète/);
    expect([20.9, 21, 23, 0, 4.9, 5, 12].map(clubOpen)).toEqual([false, true, true, true, true, false, false]);
    expect(AWA_LINES.club(true)).toMatch(/c’est ouvert/); expect(AWA_LINES.club(false)).toMatch(/21 h/);
  });

  it('only flags and counters with the al_ prefix are written (no schema change)', () => {
    const d = blank();
    talked(d, night, 3); chooseToast(d, 3); noteCounter(d, night, 'dine', 1); noteCounter(d, night, 'dine', 2); gifted(d, night); endEvening(d, night);
    expect(Object.keys(d.counters).every(k => k.startsWith('al_'))).toBe(true);
    expect(d.flags).toEqual([]);
    for (const v of Object.values(d.counters)) expect(Number.isFinite(v)).toBe(true);
  });
});
