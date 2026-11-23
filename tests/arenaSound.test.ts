import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LoopChannel, MIX, OVER_WALL, bedFor, cheerShots, drumLevel, drumLoopFor, nextBar, standsHearingFor, type Hearing } from '../src/arena/soundscape';
import { Percussion, useLambSounds } from '../src/lamb/audio';
import type { ArenaBank, ArenaManifest } from '../src/arena/soundBank';
import { WALL_R } from '../src/world/geew';

/** The làmb soundscape (src/arena/soundscape.ts): which loops play where and when, how they are scheduled, the authored files. */
const H = (o: Partial<Hearing> = {}): Hearing => ({ drums: 0, murmur: 0, phase: 'idle', rhythm: 'gala', fighter: null, party: false, within: false, standsDist: 80, crowd: 1, pan: 0, occluded: false, indoors: false, muted: false, ...o });

describe('the arena soundscape: one rhythm and one crowd for each moment of the evening', () => {
  it('the drummers play the gathering groove, the entrance, a bàkk, the bout, the fête', () => {
    expect(drumLoopFor(H({ phase: 'idle' }))).toBe('street');
    expect(drumLoopFor(H({ phase: 'filling' }))).toBe('street');
    expect(drumLoopFor(H({ phase: 'prelims' }))).toBe('street');
    expect(drumLoopFor(H({ phase: 'entrance' }))).toBe('entrance');
    expect(drumLoopFor(H({ phase: 'entrance', rhythm: 'bakk' }))).toBe('bakk');
    expect(drumLoopFor(H({ phase: 'idle', fighter: 'prep' }))).toBe('entrance');          // the player in his corner, his preparations
    expect(drumLoopFor(H({ phase: 'idle', fighter: 'ring', rhythm: 'bakk' }))).toBe('bakk');   // his own bàkk on the way to the ring
    expect(drumLoopFor(H({ phase: 'bout' }))).toBe('bout');
    expect(drumLoopFor(H({ phase: 'result' }))).toBe('fete');
    expect(drumLoopFor(H({ phase: 'idle', party: true }))).toBe('fete');                  // the fête after the player's own bout
  });
  it('inside the walls the stands are heard by phase, as full as they are; an empty arena is silent', () => {
    const inside = (o: Partial<Hearing>) => bedFor(H({ within: true, standsDist: 10, ...o }));
    expect(inside({ phase: 'filling' }).loop).toBe('stands');
    expect(inside({ phase: 'entrance' }).loop).toBe('hype');
    expect(inside({ phase: 'prelims', rhythm: 'bakk' }).loop).toBe('hype');
    expect(inside({ phase: 'bout' }).loop).toBe('tension');
    expect(inside({ phase: 'result' }).loop).toBe('roar');
    expect(inside({ phase: 'idle' }).loop).toBeNull();
    expect(inside({ phase: 'over' }).loop).toBeNull();
    expect(inside({ phase: 'filling', crowd: 0.1 }).level).toBeLessThan(inside({ phase: 'filling', crowd: 1 }).level);
    expect(inside({ phase: 'bout' }).muffled).toBe(false);
  });
  it('outside: the queue\'s murmur near it, the stands over the wall (muffled) when they are louder, nothing far off, indoors or muted', () => {
    expect(bedFor(H({ murmur: 0.8, phase: 'idle' }))).toEqual({ loop: 'street', level: 0.8, muffled: false });
    const over = bedFor(H({ murmur: 0, phase: 'result', standsDist: WALL_R + 5 }));
    expect(over.loop).toBe('roar'); expect(over.muffled).toBe(true); expect(over.level).toBeGreaterThan(0);
    expect(bedFor(H({ murmur: 0, phase: 'result', standsDist: WALL_R + OVER_WALL + 1 })).loop).toBeNull();
    expect(bedFor(H({ murmur: 1, phase: 'bout', indoors: true })).loop).toBeNull();
    expect(bedFor(H({ murmur: 1, phase: 'bout', muted: true })).loop).toBeNull();
  });
  it('the stands\' cheers and the announcer: all of them inside, some over the wall, none far off or indoors', () => {
    expect(standsHearingFor({ within: true, standsDist: 5, indoors: false, muted: false })).toEqual({ gain: 1, muffled: false });
    const near = standsHearingFor({ within: false, standsDist: WALL_R + 3, indoors: false, muted: false });
    expect(near.gain).toBeGreaterThan(0.3); expect(near.gain).toBeLessThan(1); expect(near.muffled).toBe(true);
    expect(standsHearingFor({ within: false, standsDist: WALL_R + OVER_WALL, indoors: false, muted: false }).gain).toBe(0);
    expect(standsHearingFor({ within: true, standsDist: 5, indoors: true, muted: false }).gain).toBe(0);
  });
  it('the drums carry over the whole arena while the show is on; outside they fall with distance; never indoors', () => {
    expect(drumLevel(H({ within: true, phase: 'bout', drums: 0.1 }))).toBe(0.75);
    expect(drumLevel(H({ within: false, phase: 'bout', drums: 0.1 }))).toBe(0.1);
    expect(drumLevel(H({ within: true, phase: 'idle', drums: 0 }))).toBe(0);
    expect(drumLevel(H({ within: true, phase: 'bout', drums: 0.9, indoors: true }))).toBe(0);
  });
  it('each moment has its own cheer: a roar and the whistle for a fall, ululations for a result', () => {
    expect(cheerShots(4, 'fall').map(s => s[0])).toEqual(['cheerBig', 'whistle']);
    expect(cheerShots(4, 'result').map(s => s[0])).toEqual(['cheerBig', 'ululation']);
    expect(cheerShots(3, 'entrance').map(s => s[0])).toContain('ululation');
    expect(cheerShots(1.6, 'clinch').map(s => s[0])).toEqual(['cheer1']);
    expect(cheerShots(0.8, null)[0][0]).toBe('cheer1');
    expect(cheerShots(2, null)[0][0]).toBe('cheer2');
    expect(cheerShots(3.5, null)[0][0]).toBe('cheerBig');
  });
  it('a change of rhythm waits for the bar line', () => {
    expect(nextBar(10, 2, 10)).toBe(10);
    expect(nextBar(10, 2, 10.1)).toBe(12);
    expect(nextBar(10, 2, 13.99)).toBe(14);
    expect(nextBar(10, 2, 8)).toBe(10);
  });
});

/** A fake Web Audio context: enough for the loop scheduler. */
function fakeAudio() {
  const sources: { starts: number[]; stops: number[]; buffer: unknown }[] = [];
  const param = () => ({ value: 0, events: [] as unknown[][], setTargetAtTime(v: number, t: number) { this.events.push(['target', v, t]); }, setValueAtTime(v: number, t: number) { this.events.push(['set', v, t]); }, cancelScheduledValues(t: number) { this.events.push(['cancel', t]); } });
  const ctx = {
    currentTime: 0,
    createGain: () => ({ gain: param(), connect: (n: unknown) => n, disconnect() {} }),
    createBufferSource: () => { const s = { buffer: null as unknown, starts: [] as number[], stops: [] as number[], connect: (n: unknown) => n, disconnect() {}, start(t: number) { this.starts.push(t); }, stop(t?: number) { this.stops.push(t ?? ctx.currentTime); } }; sources.push(s); return s; },
  };
  const loops: Record<string, { file: string; period: number; tail: number; bar?: number }> = { street: { file: 'a', period: 16, tail: 1.2, bar: 2 }, bakk: { file: 'b', period: 14.4, tail: 1.2, bar: 1.8 }, stands: { file: 'c', period: 20, tail: 2 }, roar: { file: 'd', period: 20, tail: 2 } };
  const bank = { loop: (_k: string, id: string) => loops[id] ?? null, get: (_c: unknown, f: string) => ({ duration: Object.values(loops).find(l => l.file === f)!.period + 1.2 }), prefetch: () => Promise.resolve() } as unknown as ArenaBank;
  return { ctx: ctx as unknown as BaseAudioContext, raw: ctx, sources, bank };
}

describe('the loop scheduler', () => {
  it('starts each copy exactly one period after the last, a little ahead of the clock', () => {
    const a = fakeAudio(), ch = new LoopChannel('drums', a.bank, a.ctx, {} as AudioNode, { onBar: true, xfade: 0.3 });
    ch.set('street', 0.5);
    for (let t = 0; t <= 40; t += 0.25) { a.raw.currentTime = t; ch.pump(); }
    const starts = a.sources.flatMap(s => s.starts);
    expect(starts.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeCloseTo(16, 9);
    expect(Math.max(...starts)).toBeLessThan(40 + 1.7);                                   // never more than the look-ahead
    expect(ch.playing).toBe('street');
  });
  it('drums change rhythm on the bar: the new loop starts on the old one\'s next bar line, the old copies stop there', () => {
    const a = fakeAudio(), ch = new LoopChannel('drums', a.bank, a.ctx, {} as AudioNode, { onBar: true, xfade: 0.3 });
    ch.set('street', 0.5);                                                                // starts at 0.05
    a.raw.currentTime = 5.3; ch.set('bakk', 0.5);
    const bakk = a.sources.find(s => (s.buffer as { duration: number }).duration === 14.4 + 1.2)!;
    const first = bakk.starts[0];
    expect((first - 0.05) / 2).toBeCloseTo(Math.round((first - 0.05) / 2), 9);         // a bar line of the street groove (bars of 2 s from 0.05)
    expect(first).toBeGreaterThan(5.3); expect(first).toBeLessThanOrEqual(5.3 + 2.1);
    const old = a.sources[0];
    expect(Math.min(...old.stops)).toBeLessThanOrEqual(first + 0.6 + 1e-9);
    expect(ch.playing).toBe('bakk');
  });
  it('a loop silent for a few seconds is released (nothing keeps running far from the arena)', () => {
    const a = fakeAudio(), ch = new LoopChannel('beds', a.bank, a.ctx, {} as AudioNode, { onBar: false, xfade: 1.6 });
    ch.set('stands', 0.4);
    a.raw.currentTime = 1; ch.set('stands', 0);
    a.raw.currentTime = 2; ch.set('stands', 0);
    expect(ch.busy).toBe(true);
    a.raw.currentTime = 4; ch.set('stands', 0);
    expect(ch.busy).toBe(false);
    expect(a.sources.every(s => s.stops.some(t => t <= 4))).toBe(true);
  });
  it('the crowd crossfades: the new bed fades in while the old one fades out, then the old one goes', () => {
    const a = fakeAudio(), ch = new LoopChannel('beds', a.bank, a.ctx, {} as AudioNode, { onBar: false, xfade: 1.6 });
    ch.set('stands', 0.4);
    a.raw.currentTime = 3; ch.set('roar', 0.4);
    expect(ch.playing).toBe('roar');
    expect(a.sources.at(-1)!.starts[0]).toBeCloseTo(3.05, 6);
    a.raw.currentTime = 6; ch.pump();
    expect(a.sources.filter(s => s.starts[0] < 3).every(s => s.stops.some(t => t <= 6))).toBe(true);
  });
});

describe('a bout\'s or a scene\'s own drums go through the authored loops', () => {
  it('Percussion asks the soundscape for drums by tempo, passes the bàkk rhythm on and lets them go', () => {
    const calls: string[] = [];
    useLambSounds({ cheer: () => true, drums: bpm => { calls.push(`drums ${bpm}`); return { setRhythm: r => calls.push(`rhythm ${r}`), stop: () => calls.push('stop') }; } });
    const p = new Percussion();
    p.start(122); p.start(122);                                                           // once
    p.setRhythm('bakk'); p.stop();
    expect(calls).toEqual(['drums 122', 'rhythm gala', 'rhythm bakk', 'stop']);
    expect(p.playing).toBe(false);
  });
});

describe('the authored files', () => {
  const dir = 'public/assets/audio/arena', m = JSON.parse(new TextDecoder().decode(fs.readFileSync(`${dir}/manifest.json`))) as ArenaManifest;
  it('five drum loops, five crowd beds and the one-shots, every file present, under 2 MB in all', () => {
    expect(Object.keys(m.drums).sort()).toEqual(['bakk', 'bout', 'entrance', 'fete', 'street']);
    expect(Object.keys(m.beds).sort()).toEqual(['hype', 'roar', 'stands', 'street', 'tension']);
    expect(Object.keys(m.shots).sort()).toEqual(['applause', 'cheer1', 'cheer2', 'cheerBig', 'ooh', 'ululation', 'whistle']);
    const files = [...Object.values(m.drums), ...Object.values(m.beds), ...Object.values(m.shots)].map(x => x.file);
    let total = 0;
    for (const f of files) { const b = fs.readFileSync(`${dir}/${f}`); expect(b.length).toBeGreaterThan(5000); expect(b[0] === 0xff || new TextDecoder().decode(b.subarray(0, 3)) === 'ID3').toBe(true); total += b.length; }
    expect(total).toBeLessThan(2 * 1024 * 1024);
  });
  it('each drum loop is a whole number of bars at its tempo (its copies keep time), with a tail to ring under the next', () => {
    for (const [id, l] of Object.entries(m.drums)) {
      expect(l.period, id).toBeCloseTo((l.bars! * 4 * 60) / l.bpm!, 4);
      expect(l.bar! * l.bars!).toBeCloseTo(l.period, 4);
      expect(l.tail).toBeGreaterThan(0.5);
    }
    for (const l of Object.values(m.beds)) { expect(l.period).toBeGreaterThanOrEqual(18); expect(l.tail).toBeGreaterThan(1); }
  });
  it('the drums sit above the crowd on the arena\'s bus', () => { expect(MIX.drums).toBeGreaterThan(MIX.bed); });
});
