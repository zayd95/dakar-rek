import { audioBus, useLambSounds, type LambDrums, type Rhythm } from '../lamb/audio';
import { WALL_R } from '../world/geew';
import { arenaHearing, hasGestured } from './hearing';
import { ArenaBank, type LoopInfo } from './soundBank';

/**
 * The sound of a làmb evening (docs/audio/ARENA_AND_RADIO.md): authored loops and one-shots (scripts/audio/render-arena.mjs,
 * public/assets/audio/arena/) played on the page's Web Audio graph, under the master gain (the sound setting) and only
 * after the first gesture.
 *
 *   - the drums: one sabar ensemble at a time, by the evening's phase — the gathering groove by the gate and while the
 *     stands fill, the wrestlers' entrance, a bàkk, the bout, the fête — heard from the nearer group of drummers (the one
 *     by the gate, the one on the deck inside), by distance, a little to the side they are on, through the wall when it
 *     stands between; a change of rhythm happens on the bar, as drummers change;
 *   - the crowd: one bed at a time — the street outside the gate near the queue, the stands inside the walls (filling,
 *     roused for an entrance or a bàkk, held for the bout, roaring for the fête), the stands heard over the wall from the
 *     street; crossfaded when it changes, as loud as the stands are full;
 *   - the stands' moments: a cheer, a gasp and a roar for a fall, the referee's whistle, ululations for a result — from the
 *     arena's own cues (src/lamb/audio.ts crowdCheer), as loud as the stands are heard where the player is.
 * Nothing plays in another hub, indoors, with the sound off or far from the arena: the loops are released there.
 * A bout or a cinematic scene away from the evening (src/lamb/duel.ts, src/lamb/scenes.ts) plays its drums through
 * `useLambSounds` below, unless the arena's drummers are already heard (never two ensembles at once).
 */
export type DrumLoop = 'street' | 'entrance' | 'bakk' | 'bout' | 'fete';
export type BedLoop = 'street' | 'stands' | 'hype' | 'tension' | 'roar';
export type Shot = 'cheer1' | 'cheer2' | 'cheerBig' | 'ooh' | 'applause' | 'whistle' | 'ululation';

/** Where the player is and what the evening is doing (src/arena/exterior.ts builds it every frame). */
export interface Hearing {
  /** Loudness 0..1 of the nearer drummers and of the queue's murmur where the player is (src/arena/exteriorRules.ts). */
  drums: number; murmur: number;
  /** The show's phase (src/arena/program.ts SHOW_PHASES, or 'idle'), the drums' rhythm, the player's own fight path, a fête on. */
  phase: string; rhythm: Rhythm; fighter: string | null; party: boolean;
  /** Inside the arena's walls (or on its tiers), metres from its centre, how full the stands are and how roused (0..1). */
  within: boolean; standsDist: number; crowd: number; excite?: number;
  /** The drummers' side (−1 left … 1 right of the camera), and whether the wall stands between them and the player. */
  pan: number; occluded: boolean;
  indoors: boolean; muted: boolean;
}

/** The show's phases with people in the stands. */
const SHOW_ON = new Set(['filling', 'prelims', 'entrance', 'bout', 'result', 'leaving']);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const falloff = (d: number, near: number, range: number) => (d <= near ? 1 : d >= range ? 0 : (1 - (d - near) / (range - near)) ** 2);

/** The drummers' rhythm for the moment: the fête's, a bàkk's, the bout's, the entrance's, or the evening's groove. */
export function drumLoopFor(h: Pick<Hearing, 'phase' | 'rhythm' | 'fighter' | 'party'>): DrumLoop {
  if (h.party) return 'fete';
  if (h.rhythm === 'bakk') return 'bakk';
  if (h.phase === 'result') return 'fete';
  if (h.phase === 'bout' || h.fighter === 'bout') return 'bout';
  if (h.phase === 'entrance' || h.fighter === 'prep' || h.fighter === 'ring') return 'entrance';
  return 'street';
}
/** The stands' crowd for a phase, or none (an empty arena). */
export function standsBedFor(phase: string, rhythm: Rhythm, party: boolean): BedLoop | null {
  if (party || phase === 'result') return 'roar';
  if (!SHOW_ON.has(phase)) return null;
  if (phase === 'bout') return 'tension';
  if (phase === 'entrance' || rhythm === 'bakk') return 'hype';
  return 'stands';
}
const BED_LEVEL: Record<BedLoop, number> = { street: 1, stands: 0.85, hype: 1, tension: 0.8, roar: 1 };
/** Over the wall the stands fade out within this many metres of it. */
export const OVER_WALL = 45;

/** The crowd bed to play: inside the walls the stands (as full as they are); outside, the queue's murmur or the stands over the wall, whichever is louder. */
export function bedFor(h: Hearing): { loop: BedLoop | null; level: number; muffled: boolean } {
  const none = { loop: null, level: 0, muffled: false };
  if (h.indoors || h.muted) return none;
  const stands = standsBedFor(h.phase, h.rhythm, h.party), fill = (0.3 + 0.7 * clamp01(h.crowd)) * (0.85 + 0.3 * clamp01(h.excite ?? 0));
  if (h.within) return stands ? { loop: stands, level: BED_LEVEL[stands] * fill * (h.phase === 'leaving' ? 0.6 : 1), muffled: false } : none;
  const over = stands ? falloff(h.standsDist - WALL_R, 0, OVER_WALL) * 0.5 * fill * BED_LEVEL[stands] : 0;
  if (h.murmur <= 0 && over <= 0) return none;
  return h.murmur >= over ? { loop: 'street', level: h.murmur, muffled: false } : { loop: stands, level: over, muffled: true };
}
/** How much of the stands' cheers (and of the announcer's chime) the player hears: all of it inside the walls, some over them, none far off or indoors. */
export function standsHearingFor(h: Pick<Hearing, 'within' | 'standsDist' | 'indoors' | 'muted'>): { gain: number; muffled: boolean } {
  if (h.indoors || h.muted) return { gain: 0, muffled: false };
  if (h.within) return { gain: 1, muffled: false };
  return { gain: falloff(h.standsDist - WALL_R, 0, OVER_WALL) * 0.6, muffled: true };
}
/** The drums' loudness: by distance outside; inside the walls, while the show is on, they carry over the whole arena. */
export function drumLevel(h: Hearing): number {
  if (h.indoors || h.muted) return 0;
  return h.within && SHOW_ON.has(h.phase) && h.drums > 0 ? Math.max(h.drums, 0.75) : h.drums;
}
/** The one-shots for a cheer: by the moment that called it (src/arena/hearing.ts `moment`), else by its length. Each with its delay (s) and gain. */
export function cheerShots(seconds: number, moment: string | null): [Shot, number, number][] {
  switch (moment) {
    case 'clinch': return [['cheer1', 0, 0.7]];
    case 'fall': return [['cheerBig', 0, 1.1], ['whistle', 0.5, 0.55]];
    case 'decision': return [['cheer2', 0, 1], ['whistle', 0.15, 0.55]];
    case 'entrance': return [['cheer2', 0, 1], ['ululation', 0.6, 0.6]];
    case 'result': return [['cheerBig', 0, 1.1], ['ululation', 0.9, 0.7]];
    default: return [[seconds < 1.2 ? 'cheer1' : seconds < 3 ? 'cheer2' : 'cheerBig', 0, 1]];
  }
}
/** The next bar line of a loop that started at `start` (s on the context clock), at or after `t`. */
export const nextBar = (start: number, bar: number, t: number) => start + Math.max(0, Math.ceil((t - start) / bar - 1e-9)) * bar;

/** Seconds of loop copies scheduled ahead of the clock. */
const AHEAD = 1.6;

interface Voice { id: string; info: LoopInfo; buf: AudioBuffer; gain: GainNode; srcs: { s: AudioBufferSourceNode; end: number }[]; start: number; next: number; fadeUntil: number; dying: number | null; level: number }

/**
 * One looping layer (the drums, the crowd, a bout's own drums): one loop at a time, each copy started exactly one period
 * after the last (the files carry their own tail, which plays under the next copy: no gap at the seam, whatever the
 * decoder adds), changed on the bar (`onBar`) or crossfaded (`xfade` s), released after a few seconds of silence.
 */
export class LoopChannel {
  private cur: Voice | null = null;
  private old: Voice[] = [];
  private quietSince = -1;
  constructor(private kind: 'drums' | 'beds', private bank: ArenaBank, private ctx: BaseAudioContext, private out: AudioNode, private o: { onBar: boolean; xfade: number }) {}
  get playing(): string | null { return this.cur && this.cur.dying === null ? this.cur.id : null; }
  get level() { return this.cur?.level ?? 0; }
  get busy() { return !!this.cur || this.old.length > 0; }

  set(id: string | null, level: number) {
    const now = this.ctx.currentTime;
    if (!id || level < 0.002) {
      if (this.cur) {
        if (this.cur.level !== 0) { this.cur.gain.gain.setTargetAtTime(0, now, 0.25); this.cur.level = 0; }
        if (this.quietSince < 0) this.quietSince = now;
        else if (now - this.quietSince > 2.5) { this.kill(this.cur); this.cur = null; }        // far off: nothing keeps running
      }
      this.pump(); return;
    }
    this.quietSince = -1;
    if (!this.cur || this.cur.id !== id) {
      const info = this.bank.loop(this.kind, id);
      const buf = info ? this.bank.get(this.ctx, info.file) : (void this.bank.prefetch(), null);
      if (info && buf) {
        let at = now + 0.05;
        const c = this.cur;
        if (c && this.o.onBar && c.info.bar && c.level > 0.01) at = Math.max(at, nextBar(c.start, c.info.bar, now + 0.06));   // the drummers change on the bar
        if (c) this.retire(c, at);
        this.cur = this.voice(id, info, buf, at, level, !this.o.onBar);                     // a crowd always fades in; drummers just start
      }
    }
    const v = this.cur;
    if (v && Math.abs(v.level - level) > 0.004) { v.gain.gain.setTargetAtTime(level, Math.max(now, Math.min(v.start, now + 3)), now < v.fadeUntil ? this.o.xfade / 3 : 0.12); v.level = level; }
    this.pump();
  }
  /** Schedules the next copies and lets the retired ones go. */
  pump() {
    const now = this.ctx.currentTime, v = this.cur;
    if (v && v.dying === null) {
      if (v.next < now - 0.02) { v.start = v.next = now + 0.05; }                        // the page slept (a hidden tab, a call): start again from the top
      while (v.next < now + AHEAD) {
        const s = this.ctx.createBufferSource(); s.buffer = v.buf; s.connect(v.gain);
        s.start(v.next); const end = v.next + v.buf.duration; s.stop(end);
        v.srcs.push({ s, end }); v.next += v.info.period;
      }
      v.srcs = v.srcs.filter(x => { if (x.end > now) return true; try { x.s.disconnect(); } catch { /* gone */ } return false; });
    }
    this.old = this.old.filter(o => { if (o.dying !== null && now > o.dying + this.o.xfade + 0.8) { this.kill(o); return false; } return true; });
  }
  stop() { if (this.cur) this.kill(this.cur); this.cur = null; for (const o of this.old) this.kill(o); this.old = []; this.quietSince = -1; }

  private voice(id: string, info: LoopInfo, buf: AudioBuffer, at: number, level: number, fade: boolean): Voice {
    const g = this.ctx.createGain(); g.connect(this.out);
    if (fade) { g.gain.setValueAtTime(0, this.ctx.currentTime); g.gain.setTargetAtTime(level, this.ctx.currentTime, this.o.xfade / 3); } else g.gain.value = level;
    return { id, info, buf, gain: g, srcs: [], start: at, next: at, fadeUntil: fade ? this.ctx.currentTime + this.o.xfade : 0, dying: null, level };
  }
  private retire(v: Voice, at: number) {
    v.dying = at; const g = v.gain.gain;
    g.cancelScheduledValues(this.ctx.currentTime); g.setValueAtTime(v.level, this.ctx.currentTime);
    if (this.o.onBar) { g.setTargetAtTime(0, at, 0.06); for (const x of v.srcs) { try { x.s.stop(Math.min(x.end, at + 0.6)); } catch { /* */ } } }
    else g.setTargetAtTime(0, this.ctx.currentTime, this.o.xfade / 3);
    this.old.push(v);
  }
  private kill(v: Voice) {
    for (const x of v.srcs) { try { x.s.stop(); x.s.disconnect(); } catch { /* already stopped */ } }
    v.srcs = []; try { v.gain.disconnect(); } catch { /* */ }
  }
}

/** Levels on the arena's bus at loudness 1 (the files are mastered near −18 dBFS rms): the drummers, the crowd, a bout's own drums, the one-shots. */
export const MIX = { drums: 0.55, bed: 0.42, lamb: 0.4, shots: 0.42 };
const SHOT_GAP = 0.35, MAX_SHOTS = 4;

class ArenaSoundscape {
  readonly bank = new ArenaBank();
  private bus: { ctx: AudioContext; gain: GainNode } | null = null;
  private drums: LoopChannel | null = null;
  private bed: LoopChannel | null = null;
  private lambCh: LoopChannel | null = null;
  private pan: StereoPannerNode | null = null;
  private drumLp: BiquadFilterNode | null = null;
  private bedLp: BiquadFilterNode | null = null;
  private shotLp: BiquadFilterNode | null = null;
  private lambs: { loop: DrumLoop; rhythm: Rhythm }[] = [];
  private timer = 0;
  private shots: { name: Shot; at: number; end: number }[] = [];
  private last = { drum: null as DrumLoop | null, bed: null as BedLoop | null, drums: 0, bedLevel: 0, muffled: false, pan: 0, occluded: false };
  readonly count = { cheers: 0, shots: 0, skipped: 0 };

  /** The graph, made after the first gesture: drums → pan → wall, crowd → wall, one-shots → wall, each into the arena's bus. */
  private ensure(): boolean {
    if (this.bus) return true;
    if (!hasGestured()) return false;
    const b = audioBus(); if (!b) return false;
    const c = b.ctx; b.gain.gain.value = 1; this.bus = b;
    const lp = (f: number) => { const n = c.createBiquadFilter(); n.type = 'lowpass'; n.frequency.value = f; n.Q.value = 0.6; n.connect(b.gain); return n; };
    this.drumLp = lp(16000); this.bedLp = lp(16000); this.shotLp = lp(16000);
    this.pan = c.createStereoPanner(); this.pan.connect(this.drumLp);
    this.drums = new LoopChannel('drums', this.bank, c, this.pan, { onBar: true, xfade: 0.3 });
    this.bed = new LoopChannel('beds', this.bank, c, this.bedLp, { onBar: false, xfade: 1.6 });
    this.lambCh = new LoopChannel('drums', this.bank, c, b.gain, { onBar: true, xfade: 0.3 });
    void this.bank.prefetch().then(() => { for (const s of Object.values(this.bank.manifest?.shots ?? {})) this.bank.get(c, s.file); });   // the one-shots, decoded ahead
    return true;
  }
  private tickSoon() { if (!this.timer && typeof window !== 'undefined') this.timer = window.setInterval(() => this.tick(), 250); }
  /** Four times a second while anything plays: the copies scheduled ahead (also when no frame comes, e.g. during a bout's own loop), a bout's own drums. */
  private tick() {
    this.drums?.pump(); this.bed?.pump();
    // a bout's own drums: only where its arena is not having its evening (a bout started from the phone), or inside the walls while the evening's
    // drummers are silent; never over them, never heard from across the city (a watched bout goes on behind the walls)
    const lamb = this.lambs[this.lambs.length - 1], allowed = !arenaHearing.active || (arenaHearing.stands > 0.5 && this.last.drums < 0.02);
    if (this.lambCh) this.lambCh.set(lamb ? (lamb.rhythm === 'bakk' ? 'bakk' : lamb.loop) : null, lamb && allowed ? MIX.lamb : 0);
    if (!this.drums?.busy && !this.bed?.busy && !this.lambCh?.busy && !this.lambs.length) { clearInterval(this.timer); this.timer = 0; }
  }

  /** Every frame near an arena (src/arena/exteriorAudio.ts), null elsewhere. */
  update(h: Hearing | null) {
    if (!h) { arenaHearing.active = false; this.last.drums = 0; this.drums?.set(null, 0); this.bed?.set(null, 0); return; }
    const sh = standsHearingFor(h);
    arenaHearing.active = true; arenaHearing.stands = sh.gain; arenaHearing.muffled = sh.muffled;
    const drums = drumLevel(h), bed = bedFor(h), loop = drumLoopFor(h);
    this.last = { drum: drums > 0 ? loop : null, bed: bed.loop, drums, bedLevel: bed.level, muffled: bed.muffled, pan: h.pan, occluded: h.occluded };
    if ((drums <= 0 && bed.level <= 0 && !this.drums?.busy && !this.bed?.busy) || !this.ensure()) return;
    const c = this.bus!.ctx, now = c.currentTime;
    this.pan!.pan.setTargetAtTime(Math.max(-0.7, Math.min(0.7, h.pan * 0.7)), now, 0.1);
    this.drumLp!.frequency.setTargetAtTime(h.occluded ? 1100 : 16000, now, 0.15);
    this.bedLp!.frequency.setTargetAtTime(bed.muffled ? 900 : 16000, now, 0.2);
    this.shotLp!.frequency.setTargetAtTime(sh.muffled ? 1000 : 16000, now, 0.1);
    this.drums!.set(loop, drums * MIX.drums);
    this.bed!.set(bed.loop, bed.level * MIX.bed);
    this.tickSoon();
  }
  /** Another hub, the evening over: every loop of the evening goes (a bout's own drums keep their own life). */
  stopWorld() { this.drums?.stop(); this.bed?.stop(); arenaHearing.active = false; this.last.drums = 0; }

  /** A bout's or a scene's own drums (src/lamb/audio.ts Percussion): the loop by its tempo (the fête's is the fastest). */
  lambDrums(bpm: number): LambDrums {
    const me = { loop: (bpm >= 125 ? 'fete' : bpm >= 120 ? 'bout' : 'entrance') as DrumLoop, rhythm: 'gala' as Rhythm };
    this.lambs.push(me);
    if (this.ensure()) { void this.bank.prefetch(); this.tick(); this.tickSoon(); }
    return {
      setRhythm: r => { me.rhythm = r; },
      stop: () => { this.lambs = this.lambs.filter(x => x !== me); this.tick(); },
    };
  }

  /** A cheer of the stands (src/lamb/audio.ts crowdCheer): the moment's one-shots, as loud as the stands are heard here. */
  cheer(seconds: number, level: number): boolean {
    this.count.cheers++;
    const m = arenaHearing.moment, fresh = m && typeof performance !== 'undefined' && performance.now() - m.at < 60 ? m.m : null;
    if (fresh) arenaHearing.moment = null;
    const heard = arenaHearing.active ? arenaHearing.stands : 1;
    if (heard <= 0.005 || !this.ensure()) { this.count.skipped++; return true; }
    const g = Math.max(0.35, Math.min(1.5, level / 0.2)) * heard;
    for (const [name, delay, k] of cheerShots(seconds, fresh)) this.shot(name, g * k, delay);
    return true;
  }
  private shot(name: Shot, gain: number, delay = 0): boolean {
    const b = this.bus, info = this.bank.manifest?.shots[name]; if (!b || !info) { void this.bank.prefetch(); return false; }
    const buf = this.bank.get(b.ctx, info.file); if (!buf) return false;
    const c = b.ctx, at = c.currentTime + 0.01 + delay;
    this.shots = this.shots.filter(s => s.end > c.currentTime);
    if (this.shots.length >= MAX_SHOTS || this.shots.some(s => s.name === name && Math.abs(s.at - at) < SHOT_GAP)) return false;
    const s = c.createBufferSource(), g = c.createGain(); s.buffer = buf; g.gain.value = gain * MIX.shots;
    s.connect(g).connect(this.shotLp!); s.start(at); s.onended = () => { try { g.disconnect(); } catch { /* */ } };
    this.shots.push({ name, at, end: at + buf.duration }); this.count.shots++;
    return true;
  }

  info() {
    return { ...this.last, playing: { drums: this.drums?.playing ?? null, bed: this.bed?.playing ?? null, lamb: this.lambCh?.playing ?? null }, lambs: this.lambs.length,
      hearing: { active: arenaHearing.active, stands: +arenaHearing.stands.toFixed(2), muffled: arenaHearing.muffled }, bank: this.bank.info(), count: { ...this.count }, context: this.bus?.ctx.state ?? null };
  }
}

export const arenaSound = new ArenaSoundscape();
useLambSounds({ cheer: (s, l) => arenaSound.cheer(s, l), drums: bpm => arenaSound.lambDrums(bpm) });
