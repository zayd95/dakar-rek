import type * as THREE from 'three';
import type { HubId } from '../core/types';
import type { HubWorld } from '../world/types';
import { ChunkMats } from './chunks';
import { CorridorView } from './corridor';
import type { Footprint } from './traffic';
import type { Pt } from './network';
import { roadsOf, type Road } from './routes';

export type Quality = 'low' | 'medium' | 'high';
/** Cars on a road at once, by graphics preset. */
const TRAFFIC: Record<Quality, number> = { low: 4, medium: 7, high: 9 };
/** `?debug&notraffic`: empty roads, to measure what a vehicle itself can do (scripts/check-drive-feel.mjs); never in a normal game. */
const NO_TRAFFIC = typeof location !== 'undefined' && /[?&]debug\b/.test(location.search) && /[?&]notraffic\b/.test(location.search);
/** Vehicles waiting at the side roads of the junctions, by graphics preset. */
const WAITERS: Record<Quality, number> = { low: 0, medium: 2, high: 3 };

/** The swap the player has just reached: which district to load, how the frames differ, and which road it is. */
export interface Swap { road: Road; to: HubId; from: HubId; /** add to a position of `from`'s frame to get it in `to`'s */ dx: number; dz: number }

/**
 * The roads between districts, for the game: attaches the loaded district's roads to the scene, keeps their chunks and traffic round the player, and says when the player has
 * crossed the middle of a road so the other district must become the loaded one. ONE mechanism for every road (src/road/routes.ts is the data): Pikine ↔ Almadies and
 * Pikine ↔ Plateau go through exactly the same code. It never moves the player or a vehicle: the caller carries the pose across (src/main.ts `corridorSwap`, the owned vehicle's `corridorCross`).
 */
export class CorridorHost {
  private views: CorridorView[] = [];
  private mats: ChunkMats | null = null;
  private lite = false;
  private handover: string | null = null;
  private quality: Quality = 'medium';
  private night = 0;
  /** A traffic driver sounds a horn (the game answers with a very quiet recorded one). */
  onHorn: ((near: number) => void) | null = null;

  constructor(private scene: THREE.Object3D, private rand: () => number) {}

  /** A district has just been built: attach its roads (reusing the one the player is driving along, if this load is a swap). `at`: where the player will be, for the first chunks. */
  attach(world: HubWorld, quality: Quality, at: Pt | null) {
    this.quality = quality;
    const lite = quality === 'low';
    if (this.mats && lite !== this.lite) { for (const v of this.views) v.dispose(); this.views = []; this.mats.dispose(); this.mats = null; }
    if (!this.mats) { this.lite = lite; this.mats = new ChunkMats(lite); this.mats.setNight(this.night); }
    const roads = roadsOf(world.id), keep: CorridorView[] = [];
    for (const v of this.views) {
      if (this.handover === v.road.id && roads.includes(v.road)) { v.detach(); v.attach(world, world.id); keep.push(v); }
      else v.dispose();
    }
    this.handover = null;
    for (const road of roads) {
      if (keep.some(v => v.road === road)) continue;
      const v = new CorridorView(road, world.id, { mats: this.mats, lite, rand: this.rand, traffic: NO_TRAFFIC ? 0 : TRAFFIC[quality], waiters: NO_TRAFFIC ? 0 : WAITERS[quality], onHorn: n => this.onHorn?.(n) });
      this.scene.add(v.root); v.attach(world, world.id); keep.push(v);
    }
    this.views = keep;
    if (at) for (const v of keep) v.stream(at.x, at.z, 0, 140);                    // a player who is already on the road sees it at once; the rest streams in
  }

  /** The player is standing at (x, z) of the loaded district, `player`: the vehicle or body traffic must not run into. Builds and frees chunks, moves the traffic. */
  update(dt: number, x: number, z: number, player: Pt | null) {
    for (const v of this.views) v.update(dt, x, z, player, NO_TRAFFIC ? 0 : TRAFFIC[this.quality]);
  }

  /** The lamps along the roads follow the dusk (0 day … 1 night), like the districts' own. */
  setNight(night: number) { this.night = night; this.mats?.setNight(night); }

  /** Has the player gone past the middle of a road? (x, z in the loaded district's frame.) */
  watch(x: number, z: number): Swap | null {
    for (const v of this.views) {
      const s = v.swap(x, z); if (!s) continue;
      const from = v.hub, d = v.road.offset(s.to), f = v.road.offset(from);
      return { road: v.road, to: s.to, from, dx: d.x - f.x, dz: d.z - f.z };
    }
    return null;
  }

  /** How far out on a road the point is, and which district it leads to (null off the roads). The district is built ahead once the player is far enough out. */
  approach(x: number, z: number): { to: HubId; depth: number } | null {
    for (const v of this.views) {
      if (!v.contains(x, z, 0)) continue;
      const s = v.project(x, z).s;
      return v.hub === v.road.def.a ? { to: v.road.def.b, depth: s } : { to: v.road.def.a, depth: v.road.length - s };
    }
    return null;
  }

  /** The next `attach` is a swap along this road: its chunks, traffic and people stay. */
  prepare(road: Road) { this.handover = road.id; }

  /** Footprints of the road's traffic near (x, z), for the owned vehicle's collisions. */
  footprints(out: Footprint[], x: number, z: number) { for (const v of this.views) v.footprints(out, x, z); }

  get active() { return this.views.length > 0; }
  info() { return this.views.map(v => v.info()); }
  view(roadId: string) { return this.views.find(v => v.road.id === roadId) ?? null; }

  dispose() { for (const v of this.views) v.dispose(); this.views = []; this.mats?.dispose(); this.mats = null; }
}
