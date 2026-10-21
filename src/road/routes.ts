import type { HubId } from '../core/types';
import { Ground, Spine, fillet, type Arm, type Pt, type Pose } from './network';

/**
 * The roads that really join two districts: a hand-simplified alignment of an actual Dakar road, in the game's metres, in the frame of its first district (`a`).
 *
 * The condensed scale. Districts are drawn at about 1 : 5 (a 260 m hub stands for about 1.3 km of town) and these corridors at about 1 : 9 (the 13 km from Pikine to Almadies
 * is a 1.5 km drive), so a drive keeps the order of the places, the bends and the junctions of the real road and loses most of the kilometres. `anchors` pair a node of the
 * game road with the real place it stands for (longitude, latitude), and src/geo/anchors.ts turns a position of the game into a place of the map and back from them.
 * THE COORDINATES ARE APPROXIMATE (read off public maps by hand, not extracted from OpenStreetMap, see docs/map/PROVENANCE.md): they put the road in the right
 * part of the right town and in the right order, they are not survey data. scripts/geo/extract-osm.mjs replaces them with extracted ones when its input is available.
 *
 * Frames. The two districts are laid end to end: the corridor leaves `a` through `aMouth` (a point of its perimeter street, heading `yaw`) and enters `b` through `bMouth`. The player
 * stays in `a`'s frame until the middle of the road and then in `b`'s (the district swap, src/road/host.ts): a point (x, z) of `a`'s frame is (x + dx, z + dz) in `b`'s. The two mouths
 * face the same way, so the swap moves nothing but the origin (the same rule as the border road of src/transport/hubLink.ts: no rotation, nothing to re-aim: speed,
 * heading, steering and camera go on untouched).
 */
export type LngLat = [number, number];

export interface RouteAnchor { name: string; /** index of the control node it stands at */ node: number; lngLat: LngLat }

export interface JunctionDef { name: string; node: number; /** the side roads: left and/or right of the travel direction (a → b), their length (m) */ arms: { side: 1 | -1; len: number }[] }

export interface RouteDef {
  id: string;
  a: HubId; b: HubId;
  /** The control polyline, in a's frame. The first node is a's mouth; the last is where b's mouth falls in a's frame. */
  nodes: Pt[];
  /** Radius of the bends. */
  radius: number;
  aMouth: Pose; bMouth: Pose;
  anchors: RouteAnchor[];
  junctions: JunctionDef[];
  /** Roadside character along the road: [0..1 of the length, profile]. */
  profile: [number, Profile][];
  /** Where the district swap happens, as a fraction of the length: on a plain stretch, out of sight of both districts and of any junction. */
  swap: number;
}

/** The look of the roadside: Pikine's dust and breeze block, the market junction, the wide urban road, the white walls and palms of Almadies, the coast road, the old downtown. */
export type Profile = 'banlieue' | 'market' | 'artery' | 'villa' | 'coast' | 'downtown';

/** Carriageway and shoulders (m). The ground a vehicle or a walker may use is `HALF_GROUND` either side of the centre line; beyond it stand walls, hedges and fences. */
export const ROAD_HALF = 5.5;
export const SHOULDER = 3.5;
export const HALF_GROUND = ROAD_HALF + SHOULDER + 1;

const H = 127;                                                  // a district's perimeter street (its edge, see world/builder.ts HALF)

export const ROUTES: readonly RouteDef[] = [
  {
    // Pikine → Patte d'Oie → the VDN at the Foire → the Yoff / Ngor junction → the Route des Almadies
    id: 'pikine-almadies', a: 'pikine', b: 'almadies',
    nodes: [{ x: -H, z: -60 }, { x: -190, z: -60 }, { x: -843, z: 164 }, { x: -1065, z: 88 }, { x: -1288, z: -12 }, { x: -1538, z: -12 }],
    radius: 150,
    aMouth: { x: -H, z: -60, yaw: -Math.PI / 2 }, bMouth: { x: H, z: -60, yaw: -Math.PI / 2 },
    anchors: [
      { name: 'Pikine', node: 0, lngLat: [-17.3965, 14.7535] },
      { name: 'Patte d’Oie', node: 2, lngLat: [-17.4527, 14.7338] },
      { name: 'Foire · VDN', node: 3, lngLat: [-17.4710, 14.7400] },
      { name: 'Carrefour Yoff · Ngor', node: 4, lngLat: [-17.4896, 14.7480] },
      { name: 'Almadies', node: 5, lngLat: [-17.5105, 14.7467] },
    ],
    junctions: [
      { name: 'Patte d’Oie', node: 2, arms: [{ side: 1, len: 55 }, { side: -1, len: 55 }] },
      { name: 'Foire · VDN', node: 3, arms: [{ side: -1, len: 45 }] },
      { name: 'Carrefour Yoff · Ngor', node: 4, arms: [{ side: -1, len: 50 }, { side: 1, len: 50 }] },
    ],
    profile: [[0, 'banlieue'], [0.2, 'market'], [0.42, 'artery'], [0.62, 'market'], [0.72, 'artery'], [0.9, 'villa']],
    swap: 0.4,
  },
  {
    // Pikine → Hann → Colobane → Plateau: the autoroute and the old town's approach
    id: 'pikine-plateau', a: 'pikine', b: 'plateau',
    nodes: [{ x: -60, z: H }, { x: -60, z: 190 }, { x: -190, z: 560 }, { x: -300, z: 900 }, { x: -250, z: 1160 }, { x: -250, z: 1260 }],
    radius: 150,
    aMouth: { x: -60, z: H, yaw: 0 }, bMouth: { x: -60, z: -H, yaw: 0 },
    anchors: [
      { name: 'Pikine', node: 0, lngLat: [-17.3945, 14.7480] },
      { name: 'Échangeur de Hann', node: 2, lngLat: [-17.4290, 14.7200] },
      { name: 'Colobane', node: 3, lngLat: [-17.4470, 14.6870] },
      { name: 'Gare de Dakar', node: 4, lngLat: [-17.4400, 14.6760] },
      { name: 'Plateau', node: 5, lngLat: [-17.4340, 14.6700] },
    ],
    junctions: [
      { name: 'Échangeur de Hann', node: 2, arms: [{ side: 1, len: 55 }, { side: -1, len: 55 }] },
      { name: 'Colobane', node: 3, arms: [{ side: -1, len: 50 }] },
    ],
    profile: [[0, 'banlieue'], [0.25, 'artery'], [0.55, 'market'], [0.78, 'downtown']],
    swap: 0.55,
  },
];

/** A route with its derived geometry. */
export class Road {
  readonly def: RouteDef;
  readonly spine: Spine;
  readonly arms: Arm[];
  readonly ground: Ground;
  /** a's frame → b's frame: add this. */
  readonly dx: number; readonly dz: number;
  /** Arc lengths of the anchors and junctions. */
  readonly anchorS: { name: string; s: number; lngLat: LngLat }[];
  readonly junctionS: { name: string; s: number; x: number; z: number; yaw: number; arms: Arm[] }[];
  /** The district swap happens here (arc length), well out of sight of both districts; `HYST` metres of play each way so a car that stops on the line does not swap back and forth. */
  readonly swapS: number;

  constructor(def: RouteDef) {
    this.def = def;
    this.spine = new Spine(fillet(def.nodes, def.radius));
    const sOf = (i: number) => this.spine.project(def.nodes[i].x, def.nodes[i].z).s;
    this.anchorS = def.anchors.map(a => ({ name: a.name, s: sOf(a.node), lngLat: a.lngLat }));
    this.arms = [];
    this.junctionS = def.junctions.map(j => {
      const s = sOf(j.node), at = this.spine.at(s), lx = Math.cos(at.yaw), lz = -Math.sin(at.yaw);
      const arms = j.arms.map(m => ({ a: { x: at.x, z: at.z }, b: { x: at.x + lx * m.side * m.len, z: at.z + lz * m.side * m.len }, half: ROAD_HALF * 0.8 + 1 }));
      this.arms.push(...arms);
      return { name: j.name, s, x: at.x, z: at.z, yaw: at.yaw, arms };
    });
    this.ground = new Ground(this.spine, HALF_GROUND, this.arms);
    const last = def.nodes[def.nodes.length - 1];
    this.dx = def.bMouth.x - last.x; this.dz = def.bMouth.z - last.z;
    this.swapS = this.spine.length * def.swap;
  }
  get length() { return this.spine.length; }
  get id() { return this.def.id; }
  /** The offset of the frame of `hub` from the road's own frame (a's). */
  offset(hub: HubId): Pt { return hub === this.def.b ? { x: this.dx, z: this.dz } : { x: 0, z: 0 }; }
  other(hub: HubId): HubId { return hub === this.def.a ? this.def.b : this.def.a; }
  touches(hub: HubId) { return hub === this.def.a || hub === this.def.b; }
  /** The roadside look at arc length s. */
  profileAt(s: number): Profile {
    const f = s / this.length; let p = this.def.profile[0][1];
    for (const [from, name] of this.def.profile) if (f >= from) p = name;
    return p;
  }
}

export const HYST = 14;
export const ROADS: readonly Road[] = ROUTES.map(r => new Road(r));
export const roadsOf = (hub: HubId): Road[] => ROADS.filter(r => r.touches(hub));
export const roadById = (id: string): Road | undefined => ROADS.find(r => r.id === id);
