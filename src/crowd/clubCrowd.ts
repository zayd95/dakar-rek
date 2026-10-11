import * as THREE from 'three';
import { Crowd, type CrowdQuality, type CrowdSlot } from './crowd';
import { nightLook } from './looks';
import {
  BAR_SPOTS, CLEAR_R, PLAYER_ROOM, RAIL_SPOTS, TABLE_SPOTS, VAGUE, VAGUE_BPM, VAGUE_CROWD, contestOn, dropAt, floorCount, floorSpots, queueAt, queuePool,
  ringPlan, ringSpots, soloAt, standCount, type ClubMoment, type Spot,
} from './clubPlan';

/** The club's frame (src/venues/kit.ts VenueKit): local ↔ world. */
export interface ClubFrame { w(x: number, z: number): { x: number; z: number }; local(x: number, z: number): { x: number; z: number }; yaw: number }
/** What the club tells its crowd every frame. */
export interface ClubNow {
  night: number; hour: number; moment: ClubMoment; open: boolean; contest: boolean;
  /** The club's own clock (s): the queue moves on it. */
  t: number;
  /** Where people get out of a taxi at the Ngor rank (local). */
  from: { x: number; z: number };
  /** Players on the terrace or at its gate (world): the local player and friends. The crowd steps aside for them. */
  players: readonly { x: number; z: number }[];
  /** The local player (world), for the full bodies near them; null when they are not here. */
  me: { x: number; z: number } | null;
  camera: THREE.Camera | null;
  /** Drawn (the camera is near, in the street or on the terrace). */
  visible: boolean;
}

type Kind = 'floor' | 'stand' | 'queue';
interface Who {
  id: string; kind: Kind; i: number; home: Spot;
  /** Where they are (world), and where they are drawn (stepped aside from a player). */
  x: number; z: number; yaw: number; sx: number; sz: number;
  on: boolean;
  /** Last move sent to the crowd (unchanged: not sent again, the instances are not rewritten). */
  sent: string;
}

/** Seconds of arms up before the floor dances harder after a drop. */
const HARDER_AFTER = 3.6;

/**
 * La Vague's crowd (docs/CROWD.md) on the reusable crowd: a dense dance floor (20 / 40 / 60 by quality, the nearest few
 * full humanoids), people standing at the bar, the lounge's edge and the high table, and at the peak a short queue
 * outside the gate fed by taxis at the Ngor rank. They dance on the club's beat, answer the DJ's drops and the songs the
 * player asks for (arms up, a shout, then they dance harder), make a ring round the sabar night's contest after 23 h
 * with a soloist in the middle in turn, and step aside for any player (never on one). The same night looks the same for
 * everyone: places, faces, drops and the contest's soloists come from the night (src/crowd/clubPlan.ts).
 */
export class VagueCrowd {
  crowd: Crowd | null = null;
  private night = Number.NaN;
  private who: Who[] = [];
  private byKind: Record<Kind, Who[]> = { floor: [], stand: [], queue: [] };
  private ring = new Map<number, number>();
  private ringSpots = ringSpots();
  private lastDrop = -1;
  private primed = false;
  private ringT = 0;
  private solo = -1;
  private ringOn = false;
  private harder = -1;
  private drops = 0;
  private requests = 0;
  private planned = { floor: 0, stand: 0, queue: 0 };
  /** The players the crowd stepped aside for on the last frame drawn. */
  private players: readonly { x: number; z: number }[] = [];

  constructor(private frame: ClubFrame, private quality: CrowdQuality, private parent: THREE.Object3D) {}

  /** The deck's top on the terrace, the street outside the gate. */
  private y(localZ: number) { return localZ > VAGUE.gate.z + 0.05 ? 0 : VAGUE.deck; }
  private build(night: number) {
    this.crowd?.dispose();
    const N = VAGUE_CROWD[this.quality], F = this.frame;
    const spots = floorSpots(N.floor, night);
    this.ring = ringPlan(spots);
    const list: { kind: Kind; home: Spot }[] = [
      ...spots.map(home => ({ kind: 'floor' as const, home })),
      ...[...BAR_SPOTS.slice(0, N.bar), ...RAIL_SPOTS.slice(0, N.rail), ...TABLE_SPOTS.slice(0, N.table)].map(home => ({ kind: 'stand' as const, home })),
      ...Array.from({ length: queuePool(N.queue) }, () => ({ kind: 'queue' as const, home: { x: VAGUE.gate.x, z: VAGUE.gate.z + 3, yaw: 0 } })),
    ];
    const count = { floor: 0, stand: 0, queue: 0 };
    this.who = list.map(o => {
      const i = count[o.kind]++, p = F.w(o.home.x, o.home.z);
      return { id: `vague:${o.kind}:${i}`, kind: o.kind, i, home: o.home, x: p.x, z: p.z, yaw: F.yaw + o.home.yaw, sx: p.x, sz: p.z, on: false, sent: '' };
    });
    this.byKind = { floor: this.who.filter(w => w.kind === 'floor'), stand: this.who.filter(w => w.kind === 'stand'), queue: this.who.filter(w => w.kind === 'queue') };
    const slots: CrowdSlot[] = this.who.map(w => ({ id: w.id, x: w.x, y: this.y(w.home.z), z: w.z, yaw: w.yaw, seated: false, manual: true, tags: [w.kind] }));
    this.crowd = new Crowd(slots, { quality: this.quality, near: N.near, nearRadius: 7, nearNeedsFocus: true, name: 'la-vague', seed: 61, fidget: 0.02, blobs: this.quality !== 'low', look: slot => nightLook(slot.id, night) });
    for (const w of this.who) this.crowd.setPresent(w.id, false);
    this.crowd.group.name = 'vague_crowd';
    this.parent.add(this.crowd.group);
    this.crowd.setMood('floor', 'dance', VAGUE_BPM);                        // on the club's beat
    this.crowd.setMood('stand', 'chat');
    this.night = night; this.primed = false; this.solo = -1; this.harder = -1; this.ringT = 0;
  }

  /** Every frame. Returns what happened worth a word (a drop the player hears), or null. */
  update(dt: number, n: ClubNow): 'drop' | null {
    if (n.night !== this.night || !this.crowd) this.build(n.night);
    const c = this.crowd!, N = VAGUE_CROWD[this.quality], F = this.frame;
    const floorOn = n.open ? floorCount(n.moment, N.floor) : 0, standOn = n.open ? standCount(n.moment, N.bar + N.rail + N.table) : 0;
    const queue = n.open && n.moment === 'peak' ? queueAt(n.t, N.queue, n.from) : [];
    this.planned = { floor: floorOn, stand: standOn, queue: queue.length };
    // the DJ's drops (the night's, on the city's clock): the first one heard is the next one, not one already played
    const drop = n.open && n.moment !== 'closed' ? dropAt(n.night, n.hour) : -1;
    let said: 'drop' | null = null;
    if (!this.primed) { this.primed = true; this.lastDrop = drop; }
    else if (drop >= 0 && drop !== this.lastDrop) { this.lastDrop = drop; if (n.visible) { this.drops++; this.burst(); said = 'drop'; } }
    c.group.visible = n.visible;
    if (!n.visible) return null;                                            // far away: nothing moves, nothing is drawn

    this.players = n.players;
    const ringOn = this.ringOn = n.open && contestOn(n.contest, n.hour);
    // the soloist in the middle of the ring, in turn (not while a player is there)
    const mid = F.w(VAGUE.floor.x, VAGUE.floor.z), busyMid = n.players.some(p => Math.hypot(p.x - mid.x, p.z - mid.z) < CLEAR_R + 0.3);
    const soloRing = ringOn && !busyMid ? soloAt(n.night, n.hour) : -1;
    let soloist = -1;
    if (soloRing >= 0) for (const [i, j] of this.ring) if (j === soloRing && i < floorOn) soloist = i;
    const queued = new Map(queue.map(q => [q.k, q]));
    for (const w of this.who) {
      let target: Spot = w.home, on = false, speed = 0, localZ = w.home.z;
      if (w.kind === 'floor') {
        on = w.i < floorOn;
        const r = ringOn ? this.ring.get(w.i) : undefined;
        if (w.i === soloist) target = { x: VAGUE.floor.x, z: VAGUE.floor.z + 0.3, yaw: Math.PI };
        else if (r !== undefined) target = this.ringSpots[r];
      } else if (w.kind === 'stand') on = w.i < standOn;
      else {
        const q = queued.get(w.i);
        on = !!q;
        if (q) { speed = q.speed; localZ = q.z; const p = F.w(q.x, q.z); w.x = p.x; w.z = p.z; w.yaw = F.yaw + q.yaw; }
      }
      if (!on) { this.show(w, false); continue; }
      if (w.kind !== 'queue') {                                             // walk to the place (the ring forms, the soloist steps in)
        const p = F.w(target.x, target.z), dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz);
        if (!w.on || d < 0.03) { w.x = p.x; w.z = p.z; w.yaw = F.yaw + target.yaw; }
        else { const s = Math.min(d, 1.4 * dt); w.x += (dx / d) * s; w.z += (dz / d) * s; speed = d > 0.1 ? 1.4 : 0; w.yaw = speed ? Math.atan2(dx, dz) : F.yaw + target.yaw; }
        localZ = target.z;
      }
      // never on a player: step aside, or not drawn when there is no room
      let x = w.x, z = w.z;
      for (const p of n.players) {
        const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
        if (d >= PLAYER_ROOM) continue;
        const ux = d < 1e-3 ? 1 : dx / d, uz = d < 1e-3 ? 0 : dz / d;
        x = p.x + ux * PLAYER_ROOM; z = p.z + uz * PLAYER_ROOM;
      }
      const room = n.players.every(p => Math.hypot(x - p.x, z - p.z) >= PLAYER_ROOM - 0.05);
      this.show(w, room);
      if (!room) continue;
      w.sx = x; w.sz = z;
      const key = `${x.toFixed(3)},${z.toFixed(3)},${w.yaw.toFixed(3)},${speed}`;
      if (key !== w.sent) { w.sent = key; c.move(w.id, x, this.y(localZ), z, w.yaw, speed); }
    }
    // the soloist dances harder, the ring claps in turns
    if (soloist !== this.solo) { if (this.solo >= 0) c.calmOne(`vague:floor:${this.solo}`); this.solo = soloist; }
    if (soloist >= 0 && c.reactionOf(`vague:floor:${soloist}`) !== 'dance') c.reactOne(`vague:floor:${soloist}`, 'dance', 6);
    this.ringT -= dt;
    if (ringOn && this.ringT <= 0) {
      this.ringT = 3.5;
      const turn = Math.floor(n.t / 3.5);
      for (const [i] of this.ring) if (i < floorOn && i !== soloist && (i * 7 + turn) % 3 !== 0) c.reactOne(`vague:floor:${i}`, 'applause', 3);
    }
    // after the arms up, a good part of the floor dances harder for a few bars
    if (this.harder >= 0) {
      this.harder -= dt;
      if (this.harder < 0) for (const w of this.byKind.floor) if (w.on && (w.i * 13) % 5 < 3) c.reactOne(w.id, 'dance', 10);
    }
    c.setFocus(n.me?.x ?? 0, n.me ? n.me.z : null);
    if (n.camera) c.setCamera(n.camera);
    c.update(dt, true);
    return said;
  }
  private show(w: Who, on: boolean) {
    if (w.on === on) return;
    w.on = on; w.sent = '';
    this.crowd?.setPresent(w.id, on);
  }
  /** The floor: arms up and a shout, then the `dance` reaction for a few bars (on the club's tempo). */
  private burst() {
    const c = this.crowd; if (!c) return;
    c.react('floor', 'celebrate', { share: 0.7, seconds: 3.4 });
    c.react('floor', 'shout', { share: 0.3, seconds: 2.4 });
    this.harder = HARDER_AFTER;
  }
  /** The player's song request is playing: the floor answers like a drop. */
  request() { this.requests++; this.burst(); }
  /** A good dance by the player: the dancers nearest them cheer. */
  cheer(at: { x: number; z: number }, n: number) {
    const c = this.crowd; if (!c) return;
    for (const w of this.nearest(at, n)) { c.calmOne(w.id); c.reactOne(w.id, 'celebrate', 2.6); }
  }
  private nearest(at: { x: number; z: number }, n: number) {
    return this.byKind.floor.filter(w => w.on).sort((a, b) => Math.hypot(a.sx - at.x, a.sz - at.z) - Math.hypot(b.sx - at.x, b.sz - at.z)).slice(0, n);
  }
  /** The drop window last heard (src/crowd/clubPlan.ts dropAt), for the DJ's line. */
  get dropIndex() { return this.lastDrop; }
  /** How many are there at this hour (floor, standing, queue), whether drawn or not. */
  present() { return this.planned.floor + this.planned.stand + this.planned.queue; }
  /** For debug and the checks: who is where, the ring, drops, draw calls, the nearest dancers to the player. */
  info(me: { x: number; z: number } | null) {
    const c = this.crowd, drawn = { floor: 0, stand: 0, queue: 0 };
    for (const w of this.who) if (w.on) drawn[w.kind]++;
    const shown = this.who.filter(w => w.on);
    return {
      night: this.night, quality: this.quality, budget: VAGUE_CROWD[this.quality], ...this.planned, drawn, ring: this.ringOn ? [...this.ring.keys()].filter(i => this.byKind.floor[i]?.on).length : 0, solo: this.solo, drops: this.drops, requests: this.requests,
      reacting: c?.stats().kinds ?? {}, near: c?.people().length ?? 0, drawCalls: c && c.group.visible ? c.drawCalls() : 0,
      // the dancers nearest the player as the checks read them (`clip` Celebrate while they cheer)
      dancers: me ? this.nearest(me, 8).map(w => ({ x: w.sx, z: w.sz, shown: true, clip: c?.reactionOf(w.id) === 'celebrate' ? 'Celebrate' : 'Dance_A' })) : [],
      queuers: this.byKind.queue.filter(w => w.on).map(w => { const l = this.frame.local(w.sx, w.sz); return { x: l.x, z: l.z }; }),
      minToPlayer: me && shown.length ? Math.min(...shown.map(w => Math.hypot(w.sx - me.x, w.sz - me.z))) : null,
      // and to every player here (friends too): never less than PLAYER_ROOM
      minToPlayers: this.players.length && shown.length ? Math.min(...this.players.flatMap(p => shown.map(w => Math.hypot(w.sx - p.x, w.sz - p.z)))) : null,
    };
  }
  /** Bodies near the player (the crowd's full humanoids). */
  people() { return this.crowd?.people() ?? []; }
  dispose() { this.crowd?.dispose(); this.crowd = null; this.who = []; this.byKind = { floor: [], stand: [], queue: [] }; this.night = Number.NaN; }
}
