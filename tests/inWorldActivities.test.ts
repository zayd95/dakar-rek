import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import { Seats } from '../src/interact/seats';
import { ActivityRunner, gesturePay, type ActivityServices } from '../src/activity/runner';
import * as T from '../src/activity/templates';
import { G, asTiming } from '../src/activity/gestures';
import type { Gesture } from '../src/activity/types';
import { playInWorld, registerInWorld, type InWorldPlayer } from '../src/activity/inWorld';
import { GRILL_RULES, cook, cue, customerLine, newSkewer, orderScore, servable, sideColor, sideScore, skewerScore, turn, type Skewer } from '../src/activity/grillRules';
import { GRADE_SCORE, MOVES, PHRASE_BEATS, WINDOWS, danceScore, grade, levelOf, matchTouch, nextDownbeat, routine, sectionAt } from '../src/activity/danceRules';
import { VAGUE_TRACK } from '../src/venues/vagueTrack';
import { VagueMusic, BEAT } from '../src/venues/vagueMusic';
import { VAGUE_BPM } from '../src/crowd/clubPlan';

/** A grill round played by a simple rule: lay, turn each brochette when its underside reaches `turnAt`, serve once every side reaches `serveAt`. */
function grillRound(n: number, o: { turnAt?: number; serveAt?: number; never?: boolean; heat?: number } = {}) {
  const sticks: Skewer[] = Array.from({ length: n }, newSkewer);
  let t = 0;
  const dt = 0.05;
  while (t < GRILL_RULES.maxSeconds) {
    t += dt;
    sticks.forEach((s, i) => { if (t > i * GRILL_RULES.layEvery) cook(s, dt, o.heat ?? 1); });
    if (!o.never) for (const s of sticks) if (s.turns === 0 && s.down >= (o.turnAt ?? 1.0)) turn(s);
    if (!o.never && sticks.every(s => s.turns > 0 && s.down >= (o.serveAt ?? 1.0))) break;
  }
  return { score: orderScore(sticks), seconds: t, sticks };
}

describe('the grill (src/activity/grillRules.ts): forgiving', () => {
  it('a side is golden over a wide window; raw and burnt still count for something', () => {
    expect(sideScore(0)).toBe(0.25); expect(sideScore(GRILL_RULES.golden)).toBe(1); expect(sideScore(1.1)).toBe(1); expect(sideScore(GRILL_RULES.over)).toBe(1);
    expect(sideScore(1.6)).toBeGreaterThan(0.6); expect(sideScore(5)).toBe(0.4);
    const golden = (GRILL_RULES.over - GRILL_RULES.golden) / GRILL_RULES.rate;
    expect(golden).toBeGreaterThan(3.5);                                          // seconds of golden underside before it starts to darken
  });
  it('turned on time and served: a perfect order in about 20–30 s; a bigger order on a hotter grill still fits', () => {
    const r = grillRound(3);
    expect(r.score).toBe(1); expect(r.seconds).toBeGreaterThan(14); expect(r.seconds).toBeLessThan(32);
    const hot = grillRound(6, { heat: 1.3 });
    expect(hot.score).toBeGreaterThan(0.95); expect(hot.seconds).toBeLessThan(GRILL_RULES.maxSeconds);
  });
  it('imperfect timing costs a little, never the shift: late turns, an early serve, nothing touched', () => {
    const late = grillRound(4, { turnAt: 1.45 });
    expect(late.score).toBeGreaterThan(0.85); expect(late.score).toBeLessThan(1);
    const early = grillRound(4, { turnAt: 0.7, serveAt: 0.66 });
    expect(early.score).toBeGreaterThan(0.75);
    const idle = grillRound(4, { never: true });
    expect(idle.score).toBeGreaterThan(0.3); expect(idle.score).toBeLessThan(0.5);
    // the pay keeps its minimum, and only a near-perfect order gets the tip
    expect(gesturePay(900, idle.score)).toBeGreaterThanOrEqual(Math.round(900 * 0.3));
    expect(gesturePay(900, late.score)).toBeLessThan(gesturePay(900, 1));
  });
  it('what each brochette asks for, and when the order can go', () => {
    const s = newSkewer();
    expect(cue(s)).toBe('wait');
    cook(s, (GRILL_RULES.golden + 0.01) / GRILL_RULES.rate); expect(cue(s)).toBe('turn');
    turn(s); expect(s.turns).toBe(1); expect(s.up).toBeGreaterThan(GRILL_RULES.golden);
    expect(servable([s])).toBe(false);
    cook(s, (GRILL_RULES.golden + 0.01) / GRILL_RULES.rate); expect(cue(s)).toBe('done'); expect(servable([s])).toBe(true);
    expect(skewerScore(s)).toBe(1);
    cook(s, 10); expect(cue(s)).toBe('burning');
  });
  it('the colour goes from raw red to golden brown to burnt, darker all the way', () => {
    const lum = (c: number) => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11;
    const steps = [0, 0.4, 0.8, 1.2, 1.6, 2].map(d => lum(sideColor(d)));
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
    expect(sideColor(0)).not.toBe(sideColor(1)); expect(lum(sideColor(0, true))).toBeGreaterThan(lum(sideColor(0)));
  });
  it('the customer answers by the score, in everyday Wolof', () => {
    expect(customerLine(0.95).mood).toBe('top'); expect(customerLine(0.95).text).toMatch(/Neex na/);
    expect(customerLine(0.7).mood).toBe('ok'); expect(customerLine(0.3).text).toMatch(/Ndank ndank/);
  });
  it('the ladder asks for bigger orders on a hotter grill; without a grill at hand it is the old timing bar', () => {
    expect(G.grill(3)).toMatchObject({ kind: 'grill', skewers: 3, heat: 1 });
    expect(G.grill(6)).toMatchObject({ kind: 'grill', skewers: 6 });
    expect(asTiming(G.grill(4))).toMatchObject({ kind: 'timing', rounds: 4, verb: 'Retourner' });
    expect(asTiming(G.dance(5, 1.35))).toMatchObject({ kind: 'timing', rounds: 5, speed: 1.35 });
  });
});

describe('the dance (src/activity/danceRules.ts): on the music’s beat map, forgiving', () => {
  const track = VAGUE_TRACK;
  it('a performance is two-bar phrases starting on a downbeat; every cue on a beat or its « and »', () => {
    const start = nextDownbeat(13.3, 4, 2.5);
    expect(start % 4).toBe(0); expect(start - 13.3).toBeGreaterThanOrEqual(2.5);
    const r = routine({ rounds: 5, speed: 1.35, start, seed: 7, track });
    expect(r.phrases).toHaveLength(5);
    r.phrases.forEach((p, i) => { expect(p.from).toBe(start + i * PHRASE_BEATS); expect(p.to - p.from).toBe(PHRASE_BEATS); });
    for (const c of r.cues) { expect(Number.isInteger(c.beat * 2)).toBe(true); expect(c.beat).toBeGreaterThanOrEqual(start); expect(c.beat).toBeLessThan(start + 5 * PHRASE_BEATS); }
    expect(new Set(r.phrases.map(p => p.move)).size).toBeGreaterThan(1);       // a few distinct moves
    expect(r.cues.map(c => c.i)).toEqual(r.cues.map((_, i) => i));
  });
  it('variation comes from the music: the drums’ solo makes it sabar footwork, a fill adds a step', () => {
    const brk = track.sections.find(s => s.id === 'break')!;
    const r = routine({ rounds: 2, speed: 1.1, start: brk.from * 4, seed: 1, track });
    expect(sectionAt(track, brk.from * 4)).toBe('break');
    expect(r.phrases[0].move).toBe('sabar'); expect(r.phrases[0].variation).toMatch(/tambours/);
    const fill = track.fills[0];                                                 // a phrase whose last bar ends on a fill
    const f = routine({ rounds: 1, speed: 1.1, start: (fill - 1) * 4, seed: 2, track });
    expect(f.cues.some(c => c.beat === (fill - 1) * 4 + 7.5)).toBe(true);
  });
  it('levels: the first steps, the evening’s, the contest final', () => {
    expect(levelOf(1.1)).toBe(0); expect(levelOf(1.35)).toBe(1); expect(levelOf(1.75)).toBe(2);
    expect(T.CONTEST_ROUNDS.map(c => levelOf(c.speed))).toEqual([1, 1, 2]);
    const easy = routine({ rounds: 4, speed: 1.1, start: 0, seed: 3, track });
    expect(easy.phrases.every(p => p.move === 'pas' || p.move === 'sabar')).toBe(true);
    for (const m of Object.values(MOVES)) expect(m.cues.length).toBeGreaterThanOrEqual(6);
  });
  it('touches are judged in seconds of music, with wide windows; a touch between cues costs nothing', () => {
    expect(grade(0.03, true)).toBe('parfait'); expect(grade(-0.12, true)).toBe('bien'); expect(grade(0.19, true)).toBe('ok');
    expect(grade(0.05, false)).toBe('à côté'); expect(grade(0.25, true)).toBe('raté');
    const r = routine({ rounds: 1, speed: 1.1, start: 8, seed: 4, track });
    const judged = new Set<number>();
    const m = matchTouch(r.cues, judged, 'R', 9 + 0.1 / BEAT, BEAT);                // 100 ms late on the second step (R, beat 9)
    expect(m?.cue.beat).toBe(9); expect(m!.dt).toBeCloseTo(0.1, 6);
    expect(matchTouch(r.cues, judged, 'L', 8.5 + 0.0, BEAT)?.dt ?? null).not.toBeNull();   // half a beat is 0.25 s: still caught by the nearest
    expect(matchTouch(r.cues, judged, 'L', 8 - 0.4 / BEAT, BEAT)).toBeNull();     // far before the first: ignored
  });
  it('a dancer a little late all along still dances well; missing everything scores nothing', () => {
    const r = routine({ rounds: 4, speed: 1.1, start: 0, seed: 5, track });
    const late = r.cues.map(() => GRADE_SCORE[grade(0.12, true)]);
    expect(danceScore(late)).toBeGreaterThanOrEqual(0.8);
    expect(danceScore(r.cues.map(() => 0))).toBe(0);
    expect(danceScore(r.cues.map((_, i) => (i % 2 ? 1 : GRADE_SCORE['à côté'])))).toBeGreaterThan(0.6);
    expect(WINDOWS.ok).toBeGreaterThanOrEqual(0.2);
  });
});

describe('outcome hooks: played in the world, the runner applies the step once', () => {
  function rig(play: (g: Gesture, done: (s: number) => void) => () => void) {
    const state = new GameState(newSave()); state.data.wallet = 10000;
    const seats = new Seats(); const toasts: string[] = []; let pays = 0;
    const s: ActivityServices = {
      state, seats, space: () => 'street', player: () => ({ x: 0, z: 0 }), seated: () => null, sit: () => false,
      clip: () => {}, busy: () => {}, progress: () => {}, toast: m => toasts.push(m), save: () => {},
      pay: (m: number) => { pays++; return m; },
      gesture: (g, label, done) => { const w = playInWorld(g, label, done); if (!w) throw new Error('no place'); return w.abort; },
    } as ActivityServices;
    const runner = new ActivityRunner(s);
    // a place that reports its score twice (a natural end racing a debug finish) and again after the end
    const fake: InWorldPlayer = { kind: 'grill', accepts: () => true, info: () => null, finishNow: () => false, play: (g, _l, done) => play(g, done) };
    return { state, runner, toasts, pays: () => pays, fake };
  }
  it('a grill shift: paid once, counted once on the ladder, its hooks once', () => {
    let later: ((s: number) => void) | null = null;
    const r = rig((_g, done) => { done(1); done(0.2); later = done; return () => {}; });
    const un = registerInWorld(r.fake);
    const place = T.dibi({ id: 'p:dibi', name: 'Chez Pathé', space: 'street', owner: 'Pathé', anchors: [{ id: 'counter', kind: 'spot', x: 0, z: 0 }, { id: 'grill', kind: 'spot', x: 4, z: 0 }] }, { count: () => 0, hour: () => 13 });
    const job = place.offers.grill[0];
    r.state.data.needs.energie = 100;
    expect(r.runner.start(job)).toBe(true);
    later!(0.5);                                                                 // a late report after the end
    expect(r.runner.running).toBe(false);
    expect(r.state.wallet).toBe(10000 + gesturePay(900, 1));
    expect(r.state.data.counters[T.dibiCounters('p:dibi').grill]).toBe(1);
    expect(r.pays()).toBe(1);
    un();
  });
  it('stopped mid-way: the place is told, nothing is paid, a late report changes nothing', () => {
    let aborted = 0, report: ((s: number) => void) | null = null;
    const r = rig((_g, done) => { report = done; return () => { aborted++; }; });
    const un = registerInWorld(r.fake);
    const place = T.dibi({ id: 'q:dibi', name: 'x', space: 'street', anchors: [{ id: 'counter', kind: 'spot', x: 0, z: 0 }, { id: 'grill', kind: 'spot', x: 4, z: 0 }] }, {});
    r.runner.start(place.offers.grill[0]);
    expect(r.runner.running).toBe(true);
    r.runner.cancel('Arrêté');
    expect(aborted).toBe(1);
    report!(1);
    expect(r.state.wallet).toBe(10000); expect(r.pays()).toBe(0);
    un();
  });
});

describe('La Vague’s music: the beat map is the file’s', () => {
  const T0 = VAGUE_TRACK;
  it('the loop is whole bars at the track’s tempo; the crowd and the lights dance at it', () => {
    expect(T0.loop).toBeCloseTo(T0.bars * T0.beatsPerBar * 60 / T0.bpm, 9);
    expect(T0.bpm).toBeGreaterThanOrEqual(100); expect(T0.bpm).toBeLessThanOrEqual(124);
    expect(T0.loop).toBeGreaterThanOrEqual(30); expect(T0.loop).toBeLessThanOrEqual(60);
    expect(VAGUE_BPM).toBe(T0.bpm); expect(BEAT).toBeCloseTo(60 / T0.bpm, 12);
    expect(T0.sections[0].from).toBe(0); expect(T0.sections.at(-1)!.to).toBe(T0.bars);
    for (let i = 1; i < T0.sections.length; i++) expect(T0.sections[i].from).toBe(T0.sections[i - 1].to);
    expect(T0.chords).toHaveLength(T0.bars);
  });
  it('as encoded: the downbeats land on the grid (measured by the renderer), the seam is under the music, the file is small', () => {
    expect(T0.measured.downbeatsMs).toHaveLength(T0.bars);
    expect(T0.measured.maxErrorMs).toBeLessThan(2);
    expect(T0.seamDiffDb).toBeLessThan(-15);
    expect(T0.truePeakDb).toBeLessThan(-0.5);
    const file = `public/${T0.file}`;
    expect(readFileSync(file).length).toBe(T0.bytes);
    expect(T0.bytes).toBeLessThan(1.5 * 1024 * 1024);
  });
  it('the game finds the loop from the sync tick whatever the decoder’s delay', () => {
    const sr = 48000;
    for (const delay of [0, 0.0251, 0.05]) {
      const x = new Float32Array(sr * 2), at = Math.round((T0.tickSample / T0.sampleRate + delay) * sr);
      for (let i = 0; i < 40; i++) x[at + i] = 0.5 * Math.sin(i / 3);
      x[at] = 0.3;
      const buf = { sampleRate: sr, getChannelData: () => x, length: x.length } as unknown as AudioBuffer;
      const p = VagueMusic.loopPoints(buf);
      expect(p.delay).toBeCloseTo(delay, 3); expect(p.start).toBeCloseTo(T0.loopStart + delay, 3);
    }
  });
  const ffmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
  it.runIf(ffmpeg)('decoded again (48 kHz, like a phone): from the tick, every beat of the loop starts on the grid', () => {
    const sr = 48000;
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', `public/${T0.file}`, '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
    const x = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + (raw.byteLength & ~3)));
    const buf = { sampleRate: sr, getChannelData: () => x, length: x.length } as unknown as AudioBuffer;
    const { start } = VagueMusic.loopPoints(buf);
    // the attack of each beat (the high band's steepest first rise near the expected time)
    const w = Math.round(sr * 0.001), e = new Float32Array(x.length); { let z = 0; const a = Math.exp(-2 * Math.PI * 1000 / sr); for (let i = 0; i < x.length; i++) { z = x[i] * (1 - a) + z * a; const h = x[i] - z; e[i] = h * h; } }
    const env = new Float32Array(x.length); { let acc = 0; for (let i = 0; i < x.length; i++) { acc += e[i] - (i >= w ? e[i - w] : 0); env[i] = acc / w; } }
    const errs: number[] = [];
    for (let k = 0; k < T0.bars * T0.beatsPerBar; k += 4) {
      const exp = Math.round((start + k * 60 / T0.bpm) * sr), i0 = exp - Math.round(0.012 * sr), i1 = exp + Math.round(0.02 * sr);
      let best = -Infinity; for (let i = i0; i < i1; i++) best = Math.max(best, env[i] - env[i - w]);
      let on = exp; for (let i = i0; i < i1; i++) if (env[i] - env[i - w] > best * 0.35) { on = i; break; }
      errs.push((on - w / 2 - exp) / sr * 1000);
    }
    expect(Math.max(...errs.map(Math.abs))).toBeLessThan(3);
  });
});
