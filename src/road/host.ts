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
const TRAFFIC: Record<Quality, number> = { low: 3, medium: 6, high: 8 };

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
      const v = new CorridorView(road, world.id, { mats: this.mats, lite, rand: this.rand, traffic: TRAFFIC[quality] });
      this.scene.add(v.root); v.attach(world, world.id); keep.push(v);
    }
    this.views = keep;
    if (at) for (const v of keep) v.stream(at.x, at.z, 0, 140);                    // a player who is already on the road sees it at once; the rest streams in
  }

  /** The player is standing at (x, z) of the loaded district, `player`: the vehicle or body traffic must not run into. Builds and frees chunks, moves the traffic. */
  update(dt: number, x: number, z: number, player: Pt | null) {
    for (const v of this.views) v.update(dt, x, z, player, TRAFFIC[this.quality]);
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
