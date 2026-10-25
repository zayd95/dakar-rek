import * as THREE from 'three';
import type { HubId } from '../core/types';
import type { Collider, HubWorld, RoadGround } from '../world/types';
import { PlacedPeople } from '../actors/placedPeople';
import { humanoidReady } from '../actors/humanoid';
import type { Pt, Projection } from './network';
import { HYST, type Road } from './routes';
import { CHUNK, buildChunk, type Chunk, type ChunkMats } from './chunks';
import { CorridorTraffic, type Footprint } from './traffic';
import { BrtLine } from './brt';

/** Chunks within this many metres of the player are built; those farther than `KEEP` are freed (the fog ends at 300 m: nothing past WINDOW is ever seen). */
export const WINDOW = 340, KEEP = 470;

interface Live { chunk: Chunk; solid: Collider[]; people: PlacedPeople | null }

export interface ViewOpts { mats: ChunkMats; lite: boolean; rand: () => number; traffic: number; waiters?: number; onHorn?: (near: number) => void }

/**
 * A road between districts, as the loaded district sees it: its ground (what `world.corridors` asks), its chunks, built round the player and freed behind, and its traffic.
 * Everything is in the road's own frame (district a's); `offset` (zero in a, `(dx, dz)` in b) carries it into the frame of the district that is loaded, and is the ONLY thing that
 * changes when the player crosses the middle of the road and the other district becomes the loaded one (`rebase`): the chunks, the traffic and the people stay as they are.
 */
export class CorridorView implements RoadGround {
  readonly road: Road;
  hub: HubId;
  offset: Pt;
  readonly root = new THREE.Group();
  private readonly chunks = new Map<number, Live>();
  private world: HubWorld | null = null;
  private traffic: CorridorTraffic | null = null;
  /** The road's BRT crossings (buses and signals), made when the player comes near one. */
  private brt: BrtLine[] = [];
  private lastS = 0;
  /** Chunks built, freed, and the slowest build (ms): the checks and the debug hook read them. */
  readonly stats = { built: 0, freed: 0, slowest: 0, last: 0 };

  constructor(road: Road, hub: HubId, private o: ViewOpts) {
    this.road = road; this.hub = hub; this.offset = road.offset(hub);
    this.root.name = `road:${road.id}`; this.root.position.set(this.offset.x, 0, this.offset.z);
  }

  /** The ground this road adds to the district's own (hub frame). */
  contains(x: number, z: number, r: number): boolean { return this.road.ground.contains(x - this.offset.x, z - this.offset.z, r); }

  /** Where a point (hub frame) stands on the road. */
  project(x: number, z: number): Projection {
    const px = x - this.offset.x, pz = z - this.offset.z;
    let p = this.road.spine.project(px, pz, this.lastS, 160);
    // a view that has just been attached round a player who is already far along the road (a reload, a swap onto a road already driven) has no useful hint: the whole road is searched, once
    if (Math.hypot(px - p.x, pz - p.z) > 40) p = this.road.spine.project(px, pz);
    this.lastS = p.s; return p;
  }

  /** The loaded district (`world`) takes over this road: colliders go into its list, in its frame. Used by the first load and by a rebase. */
  attach(world: HubWorld, hub: HubId) {
    this.world = world; this.hub = hub; this.offset = this.road.offset(hub);
    this.root.position.set(this.offset.x, 0, this.offset.z);
    for (const l of this.chunks.values()) { l.solid = this.shifted(l.chunk.colliders); world.colliders.push(...l.solid); }
    world.corridors = [...(world.corridors ?? []).filter(c => c !== this), this];
  }

  private shifted(cs: Collider[]): Collider[] { const o = this.offset; return cs.map(c => ({ x0: c.x0 + o.x, x1: c.x1 + o.x, z0: c.z0 + o.z, z1: c.z1 + o.z, h: c.h })); }

  /** The district it was attached to is going away: drop the references to its colliders (the chunks themselves stay for the next district). */
  detach() { this.world = null; for (const l of this.chunks.values()) l.solid = []; }

  private build(i: number) {
    const t0 = performance.now();
    const chunk = buildChunk({ road: this.road, mats: this.o.mats, lite: this.o.lite }, i);
    this.root.add(chunk.group);
    const live: Live = { chunk, solid: this.shifted(chunk.colliders), people: null };
    if (this.world) this.world.colliders.push(...live.solid);
    if (chunk.people.length && humanoidReady()) live.people = new PlacedPeople({ people: chunk.people } as unknown as HubWorld, this.o.rand, h => chunk.group.add(h.group));
    this.chunks.set(i, live);
    const ms = performance.now() - t0; this.stats.built++; this.stats.last = ms; this.stats.slowest = Math.max(this.stats.slowest, ms);
  }

  private free(i: number) {
    const l = this.chunks.get(i); if (!l) return;
    if (this.world) for (const c of l.solid) { const k = this.world.colliders.indexOf(c); if (k >= 0) this.world.colliders.splice(k, 1); }
    l.people?.dispose(); l.chunk.dispose(); this.chunks.delete(i); this.stats.freed++;
  }

  /**
   * Keeps the chunks round (x, z) (hub frame): builds the nearest missing ones (at most `limit` this call, so the frame stays light) and frees the far ones.
   * `prime`: build everything within `r` metres now (a district just loaded round a player already on the road).
   */
  stream(x: number, z: number, limit = 1, prime = 0): number {
    const px = x - this.offset.x, pz = z - this.offset.z, n = Math.ceil(this.road.length / CHUNK);
    const mid = (i: number) => this.road.spine.at(i * CHUNK + CHUNK / 2);
    const dist = (i: number) => { const m = mid(i); return Math.hypot(m.x - px, m.z - pz); };
    const s = this.project(x, z).s, c = Math.floor(s / CHUNK), span = Math.ceil(WINDOW / CHUNK) + 2;
    const want: { i: number; d: number }[] = [];
    for (let i = Math.max(0, c - span); i <= Math.min(n - 1, c + span); i++) { const d = dist(i); if (d <= WINDOW && !this.chunks.has(i)) want.push({ i, d }); }
    want.sort((a, b) => a.d - b.d);
    let made = 0;
    for (const w of want) { if (made >= limit && w.d > prime) break; this.build(w.i); made++; }
    for (const i of [...this.chunks.keys()]) if (dist(i) > KEEP) this.free(i);
    return made;
  }

  /** The chunk that has a solid thing at (x, z) in the road frame (a stall, a parked vehicle, a pole): for the traffic. */
  solidRoad(x: number, z: number, r: number): boolean {
    const i = Math.floor(this.road.spine.project(x, z, this.lastS, 400).s / CHUNK);
    for (let k = i - 1; k <= i + 1; k++) {
      const l = this.chunks.get(k); if (!l) continue;
      for (const c of l.chunk.colliders) if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return true;
    }
    const w = this.world;
    if (w) {                                                                                                  // a vehicle parked at the kerb is in the district's own colliders
      const hx = x + this.offset.x, hz = z + this.offset.z;
      for (const c of w.colliders) if (hx > c.x0 - r && hx < c.x1 + r && hz > c.z0 - r && hz < c.z1 + r) return true;
    }
    return false;
  }

  update(dt: number, x: number, z: number, player: Pt | null, density: number) {
    this.stream(x, z, 1);
    const px = x - this.offset.x, pz = z - this.offset.z;
    for (const l of this.chunks.values()) l.people?.update(dt, { x: px, z: pz }, 70);
    const near = this.chunks.size > 0 && Math.min(...[...this.chunks.keys()].map(i => { const m = this.road.spine.at(i * CHUNK + CHUNK / 2); return Math.hypot(m.x - px, m.z - pz); })) < WINDOW;
    if (!this.traffic && density > 0 && near) { this.traffic = new CorridorTraffic(this.road, this.o.rand, density, this.o.lite, { waiters: this.o.waiters, onHorn: this.o.onHorn }); this.root.add(this.traffic.group); }
    const me = player ? { x: player.x - this.offset.x, z: player.z - this.offset.z } : null;
    // the BRT crossings: made once the player is within 360 m (they are seen from the road), run while within that
    for (const lay of this.road.brt) {
      const d = Math.hypot(lay.x - px, lay.z - pz);
      let line = this.brt.find(b => b.lay === lay);
      if (!line && d < 360) { line = new BrtLine(lay, this.o.lite, this.o.rand); this.brt.push(line); this.root.add(line.group); }
      line?.update(dt, { player: me, trafficAt: (x, z, r) => this.trafficAt(x, z, r) }, d < 360);
    }
    this.traffic?.update(dt, {
      solid: (a, b, r) => this.solidRoad(a, b, r) || this.brt.some(l => l.busAt(a, b, r)), player: me,
      signals: this.brt.length ? dir => this.brt.map(l => l.signal(dir)) : undefined,
    }, near ? { x: px, z: pz } : null);
  }

  /** Checks: put traffic car `i` on the road (see CorridorTraffic.put). Makes the traffic first if the road has none yet. */
  putTraffic(i: number, s: number, dir: 1 | -1) {
    if (!this.traffic) { this.traffic = new CorridorTraffic(this.road, this.o.rand, Math.max(this.o.traffic, 4), this.o.lite, { waiters: this.o.waiters, onHorn: this.o.onHorn }); this.root.add(this.traffic.group); }
    return this.traffic.put(i, s, dir);
  }

  /** Footprints of the traffic (and of the BRT buses) near (x, z) for the vehicle the player drives (hub frame). */
  footprints(out: Footprint[], x: number, z: number, range = 60) {
    this.traffic?.footprints(out, x - this.offset.x, z - this.offset.z, range, this.offset.x, this.offset.z);
    for (const b of this.brt) b.footprints(out, x - this.offset.x, z - this.offset.z, range, this.offset.x, this.offset.z);
  }
  /** Is a road traffic vehicle standing in this road-frame circle? (The BRT's crossing must be clear before a bus goes.) */
  private trafficAt(x: number, z: number, r: number): boolean {
    const fp: Footprint[] = []; this.traffic?.footprints(fp, x, z, 30, 0, 0);
    return fp.some(f => Math.hypot(f.x - x, f.z - z) < r + Math.max(f.hl, f.hw));
  }
  /** Checks and the debug hook: the BRT crossings' state (road frame). */
  brtInfo() { return this.brt.map(b => b.info()); }

  /** Which way the player must swap district, if the point (hub frame) is past the middle of the road on the far side of it. */
  swap(x: number, z: number): { to: HubId; at: number } | null {
    const px = x - this.offset.x, pz = z - this.offset.z;
    if (!this.road.ground.contains(px, pz, 0)) return null;
    const s = this.project(x, z).s;
    if (this.hub === this.road.def.a && s > this.road.swapS + HYST) return { to: this.road.def.b, at: s };
    if (this.hub === this.road.def.b && s < this.road.swapS - HYST) return { to: this.road.def.a, at: s };
    return null;
  }

  /** What the checks and the debug hook read. */
  info() {
    return { road: this.road.id, hub: this.hub, offset: this.offset, chunks: [...this.chunks.keys()].sort((a, b) => a - b), ...this.stats, colliders: [...this.chunks.values()].reduce((a, l) => a + l.solid.length, 0), traffic: (this.traffic?.positions() ?? []).map(c => ({ ...c, x: c.x + this.offset.x, z: c.z + this.offset.z })), brt: this.brtInfo().map(b => ({ ...b, buses: b.buses.map(x => ({ ...x, x: x.x + this.offset.x, z: x.z + this.offset.z })) })) };       // in the loaded district's frame, like everything the debug API gives
  }

  dispose() {
    for (const i of [...this.chunks.keys()]) this.free(i);
    this.traffic?.dispose(); this.traffic = null; for (const b of this.brt) b.dispose(); this.brt = []; this.root.removeFromParent();
    if (this.world) this.world.corridors = (this.world.corridors ?? []).filter(c => c !== this);
    this.world = null;
  }
}
