import * as THREE from 'three';
import type { HubId } from '../core/types';
import type { GameModule } from '../game/modules';
import type { Collider, HubWorld, RoadEdge } from '../world/types';
import { buildVehicle, type VehicleKind } from '../actors/vehicleKit';
import { Humanoid, humanoidReady, randomLook, type PersonLook } from '../actors/humanoid';
import { trafficClosures, type Closure } from '../actors/npc';
import { GRID, LINES, loopNodes, roadCentre } from '../transport/lines';
import { routeIn, routeOut, type Side } from '../transport/taxiRules';
import { taxiDrop, taxiRank } from '../transport/taxi';
import { rng } from '../core/rng';

/**
 * Road events (spec §26): a generic system, not a police simulation. On some days a stretch of road holds a police
 * checkpoint, a breakdown, an accident, roadworks or a jam at rush hour, for a few hours; the decorative traffic takes
 * another way (src/actors/npc.ts closures), the cones, vehicles and people there are solid, so a player driving or
 * walking goes round. The same events for everyone (the city day and the hub seed them), never on the roads of the car
 * rapide lines, the taxis or the fight-evening drop-off, so nobody's trip is ever blocked.
 */
export type RoadEventKind = 'checkpoint' | 'panne' | 'accident' | 'travaux' | 'bouchon';
export interface RoadEvent { kind: RoadEventKind; edge: RoadEdge; from: number; to: number; seed: number }
export const EVENT_NAMES: Record<RoadEventKind, string> = {
  checkpoint: 'Contrôle de police', panne: 'Car rapide en panne', accident: 'Accrochage', travaux: 'Travaux', bouchon: 'Embouteillage',
};

const key = (e: RoadEdge) => { const a = `${Math.round(e.ax)},${Math.round(e.az)}`, b = `${Math.round(e.bx)},${Math.round(e.bz)}`; return a < b ? `${a}|${b}` : `${b}|${a}`; };
const frac = (x: number) => x - Math.floor(x);
const hash = (a: number, b: number) => frac(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453);

/** Unit grid edges along a polyline of road-node points (centre lines; points past the map's edge are cut). */
function gridEdges(pts: readonly { x: number; z: number }[]): string[] {
  const out: string[] = [], lim = roadCentre(GRID.nb) + 0.5, snap = (v: number) => Math.max(-lim, Math.min(lim, v));
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = { x: snap(pts[i].x), z: snap(pts[i].z) }, b = { x: snap(pts[i + 1].x), z: snap(pts[i + 1].z) };
    const n = Math.round(Math.hypot(b.x - a.x, b.z - a.z) / GRID.pitch);
    const steps = Math.max(1, n), dx = (b.x - a.x) / steps, dz = (b.z - a.z) / steps;
    for (let k = 0; k < steps; k++) {
      const e = { ax: a.x + dx * k, az: a.z + dz * k, bx: a.x + dx * (k + 1), bz: a.z + dz * (k + 1) };
      // only whole grid edges (node to node) count
      const onNode = (v: number) => Math.abs((v - roadCentre(0)) / GRID.pitch - Math.round((v - roadCentre(0)) / GRID.pitch)) < 0.02;
      if (onNode(e.ax) && onNode(e.az) && onNode(e.bx) && onNode(e.bz)) out.push(key(e));
      else {                                                                     // a partial leg (from a rank): its whole edge
        const fx = Math.floor((Math.min(e.ax, e.bx) - roadCentre(0)) / GRID.pitch), fz = Math.floor((Math.min(e.az, e.bz) - roadCentre(0)) / GRID.pitch);
        if (Math.abs(e.ax - e.bx) < 0.5) out.push(key({ ax: e.ax, az: roadCentre(fz), bx: e.ax, bz: roadCentre(fz + 1) }));
        else out.push(key({ ax: roadCentre(fx), az: e.az, bx: roadCentre(fx + 1), bz: e.az }));
      }
    }
  }
  return out;
}

/** Roads somebody's trip depends on in this hub: the car rapide lines, the taxis in and out, the arena drop-off. */
export function busyEdges(hub: Pick<HubWorld, 'id' | 'spawn'>): Set<string> {
  const out = new Set<string>();
  for (const l of LINES.filter(l => l.hub === hub.id)) { const n = loopNodes(l); gridEdges([...n, n[0]]).forEach(k => out.add(k)); }
  const rank = taxiRank(hub).spot, drop = taxiDrop(rank);
  for (const side of ['x-', 'x+', 'z-', 'z+'] as Side[]) { gridEdges(routeOut(rank, side)).forEach(k => out.add(k)); gridEdges(routeIn(drop, side)).forEach(k => out.add(k)); }
  // Pikine: the fight-evening drop-off and the road in front of the arena gate (its queue)
  if (hub.id === 'pikine') gridEdges([{ x: roadCentre(0), z: roadCentre(1) }, { x: roadCentre(3), z: roadCentre(1) }]).concat(gridEdges([{ x: roadCentre(2), z: roadCentre(1) }, { x: roadCentre(2), z: roadCentre(GRID.nb) }])).forEach(k => out.add(k));
  return out;
}

/**
 * Today's road events of a hub (pure): one or two, on roads nobody's trip uses, each for a few hours — checkpoints in
 * the morning or evening, breakdowns and accidents any time of day, roadworks in working hours, jams at rush hour.
 */
export function roadEvents(hub: HubId, day: number, edges: readonly RoadEdge[], busy: Set<string>, spawn: { x: number; z: number }): RoadEvent[] {
  const d = Math.floor(day), salt = hub.length * 31 + hub.charCodeAt(0);
  const free = edges.filter(e => !busy.has(key(e)) && Math.hypot((e.ax + e.bx) / 2 - spawn.x, (e.az + e.bz) / 2 - spawn.z) > 25);
  if (!free.length) return [];
  const n = 1 + (hash(d, salt) < 0.45 ? 1 : 0), out: RoadEvent[] = [];
  const kinds: RoadEventKind[] = ['checkpoint', 'panne', 'accident', 'travaux', 'bouchon'];
  for (let i = 0; i < n; i++) {
    const kind = kinds[Math.floor(hash(d * 7 + i, salt + 1) * kinds.length)];
    const edge = free[Math.floor(hash(d * 13 + i, salt + 2) * free.length)];
    if (out.some(o => key(o.edge) === key(edge))) continue;
    const r = hash(d * 17 + i, salt + 3);
    const [from, to] = kind === 'checkpoint' ? (r < 0.5 ? [7 + r * 2, 10.5 + r * 2] : [17 + r, 21 + r])
      : kind === 'travaux' ? [8, 17]
      : kind === 'bouchon' ? (r < 0.5 ? [7, 9.5] : [17.5, 20])
      : [9 + r * 9, 9 + r * 9 + 1.5];
    out.push({ kind, edge, from, to, seed: d * 101 + i });
  }
  return out;
}
export const activeAt = (e: RoadEvent, hour: number) => { const h = ((hour % 24) + 24) % 24; return h >= e.from && h < e.to; };

// ------------------------------------------------------------------ the scene of an event
const POLICE: PersonLook = { skin: 0x3b2216, style: 'tee', top: 0x223a5e, bottom: 0x1d2a44, accent: 0xffffff, shoes: 0x1c1c1f, muscular: 0.4 };
const WORKER: PersonLook = { skin: 0x4e2e1c, style: 'tee', top: 0xf27a1a, bottom: 0x2b2f3a, accent: 0xf2f2ec, shoes: 0x3a2a1e };

interface Scene { ev: RoadEvent; group: THREE.Group; people: Humanoid[]; boxes: Collider[]; built: boolean }

class RoadEventsView {
  readonly group = new THREE.Group();
  private scenes: Scene[] = [];
  private closure: Closure;
  private shut = new Set<string>();
  private coneGeo = new THREE.ConeGeometry(0.22, 0.6, 8);
  private coneMat = new THREE.MeshLambertMaterial({ color: 0xff6a13 });
  private barrierMat: THREE.MeshLambertMaterial;
  private barrierGeo = new THREE.BoxGeometry(2.4, 0.5, 0.08);
  constructor(private hub: HubWorld, day: number) {
    this.group.name = 'road_events';
    this.barrierMat = new THREE.MeshLambertMaterial({ map: barrierTexture(), color: 0xffffff });
    const evs = roadEvents(hub.id, day, hub.edges, busyEdges(hub), hub.spawn);
    this.scenes = evs.map(ev => ({ ev, group: new THREE.Group(), people: [], boxes: [], built: false }));
    this.closure = (ax, az, bx, bz) => this.shut.has(key({ ax, az, bx, bz }));
    trafficClosures.more.add(this.closure);
  }

  update(dt: number, hour: number, cam: THREE.Vector3) {
    for (const s of this.scenes) {
      const on = activeAt(s.ev, hour), mid = { x: (s.ev.edge.ax + s.ev.edge.bx) / 2, z: (s.ev.edge.az + s.ev.edge.bz) / 2 };
      const far = Math.hypot(mid.x - cam.x, mid.z - cam.z) > 60;
      if (on && !s.built && far) this.build(s);
      else if (!on && s.built && far) this.unbuild(s);
      if (s.built) for (const h of s.people) h.animate(dt, 0);
    }
  }

  /** Lay out the scene on the edge: along the road from its middle, on the right-hand lane (x local = across the road). */
  private build(s: Scene) {
    const e = s.ev.edge, len = Math.hypot(e.bx - e.ax, e.bz - e.az), dx = (e.bx - e.ax) / len, dz = (e.bz - e.az) / len;
    const mx = (e.ax + e.bx) / 2, mz = (e.az + e.bz) / 2, rx = -dz, rz = dx, yaw = Math.atan2(dx, dz), R = rng(s.ev.seed);
    const at = (along: number, lat: number) => ({ x: mx + dx * along + rx * lat, z: mz + dz * along + rz * lat });
    const solid = (x: number, z: number, hw: number, hd: number, h: number) => { const c: Collider = { x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd, h }; s.boxes.push(c); this.hub.colliders.push(c); };
    const cone = (along: number, lat: number) => { const p = at(along, lat); const m = new THREE.Mesh(this.coneGeo, this.coneMat); m.position.set(p.x, 0.38, p.z); s.group.add(m); solid(p.x, p.z, 0.25, 0.25, 0.7); };
    const vehicle = (kind: VehicleKind, along: number, lat: number, turn: number, o: { driver?: boolean; seed?: number } = {}) => {
      const p = at(along, lat), v = buildVehicle(kind, { seed: o.seed ?? Math.floor(R() * 1e6), driver: o.driver ?? false, passengers: false });
      v.group.position.set(p.x, 0.06, p.z); v.group.rotation.y = yaw + turn; s.group.add(v.group);
      const hl = v.spec.length / 2, hw = v.spec.width / 2, c = Math.abs(Math.cos(yaw + turn)), sn = Math.abs(Math.sin(yaw + turn));
      solid(p.x, p.z, c * hw + sn * hl, sn * hw + c * hl, Math.min(2.4, v.spec.height));
    };
    const person = (look: PersonLook, along: number, lat: number, face: number, clip: 'Idle' | 'Talk' = 'Idle') => {
      if (!humanoidReady()) return;
      const p = at(along, lat), h = new Humanoid(look); h.group.position.set(p.x, 0.1, p.z); h.group.rotation.y = yaw + face; h.hold = clip; s.group.add(h.group); s.people.push(h);
    };
    const barrier = (along: number, lat: number) => { const p = at(along, lat); const m = new THREE.Mesh(this.barrierGeo, this.barrierMat); m.position.set(p.x, 0.75, p.z); m.rotation.y = yaw + Math.PI / 2; s.group.add(m); solid(p.x, p.z, 1.3, 1.3, 1); };
    switch (s.ev.kind) {
      case 'checkpoint':                                                       // cones narrow the road, a pickup, two officers
        for (const k of [-9, -6, -3, 0]) cone(k, 1.2 + (k + 9) * 0.25);
        vehicle('pickup', 6, 4.3, 0, { seed: 31, driver: false });
        person(POLICE, 1, 3.4, -Math.PI / 2, 'Talk'); person(POLICE, 3.5, 5.6, -Math.PI / 2 - 0.4);
        break;
      case 'panne':                                                            // a car rapide at the kerb, its passengers waiting
        vehicle('carRapide', 0, 4.1, 0, { driver: false });
        for (let k = 0; k < 3; k++) person(randomLook(R), -3 + k * 1.4, 6.1, Math.PI / 2 + (R() - 0.5), k === 1 ? 'Talk' : 'Idle');
        cone(-7, 3.2);
        break;
      case 'accident':                                                         // two cars at an angle in the lane, onlookers
        vehicle('sedan', -1.5, 2.2, 0.35); vehicle('taxi', 2.2, 1.6, -0.5, { seed: 7 });
        person(randomLook(R), 0, 5.8, Math.PI / 2, 'Talk'); person(randomLook(R), 1.4, 6.1, Math.PI / 2 + 0.5, 'Talk');
        cone(-6, 2);
        break;
      case 'travaux':                                                          // the right-hand lane dug up behind barriers
        barrier(-4, 2.4); barrier(4, 2.4);
        for (const k of [-7, -2, 2, 7]) cone(k, 0.6);
        person(WORKER, 0, 3.2, 0.3); vehicle('pickup', 10, 4.3, 0, { seed: 5 });
        break;
      case 'bouchon':                                                          // a line of cars waiting, drivers at the wheel
        for (let k = 0; k < 5; k++) vehicle((['taxi', 'sedan', 'carRapide', 'sedan', 'taxi'] as VehicleKind[])[k], -12 + k * 5.6, 2.2, 0, { driver: true });
        break;
    }
    this.shut.add(key(s.ev.edge));                                         // the decorative traffic goes another way
    this.group.add(s.group);
    s.built = true;
  }

  private unbuild(s: Scene) {
    for (const h of s.people) h.dispose();
    for (const c of s.boxes) { const i = this.hub.colliders.indexOf(c); if (i >= 0) this.hub.colliders.splice(i, 1); }
    s.people = []; s.boxes = [];
    s.group.clear(); s.group.removeFromParent();
    this.shut.delete(key(s.ev.edge));
    s.built = false;
  }

  info(hour: number) { return this.scenes.map(s => ({ kind: s.ev.kind, name: EVENT_NAMES[s.ev.kind], from: s.ev.from, to: s.ev.to, on: activeAt(s.ev, hour), built: s.built, edge: s.ev.edge, closed: this.shut.has(key(s.ev.edge)) })); }

  dispose() {
    for (const s of this.scenes) if (s.built) this.unbuild(s);
    trafficClosures.more.delete(this.closure);
    this.coneGeo.dispose(); this.coneMat.dispose(); this.barrierGeo.dispose(); this.barrierMat.map?.dispose(); this.barrierMat.dispose();
    this.group.removeFromParent();
  }
}

function barrierTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const c = cv.getContext('2d'); if (!c) return null;
  for (let i = -2; i < 12; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#d8261c'; c.beginPath(); c.moveTo(i * 24, 0); c.lineTo(i * 24 + 24, 0); c.lineTo(i * 24 + 56, 64); c.lineTo(i * 24 + 32, 64); c.fill(); }
  c.fillStyle = '#141414'; c.fillRect(70, 14, 116, 36); c.fillStyle = '#ffd400'; c.font = '900 26px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('TRAVAUX', 128, 33);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

let view: RoadEventsView | null = null, viewDay = -1;

export const roadEventsModule: GameModule = {
  name: 'roadEvents',
  hubLoaded(ctx, hub) {
    view?.dispose();
    viewDay = Math.floor(ctx.day());
    view = new RoadEventsView(hub, viewDay);
    ctx.extra.add(view.group);
  },
  update(ctx, dt) {
    if (!view) return;
    const w = ctx.world();
    if (w && Math.floor(ctx.day()) !== viewDay) { view.dispose(); viewDay = Math.floor(ctx.day()); view = new RoadEventsView(w, viewDay); ctx.extra.add(view.group); }   // a new day, new events
    if (!ctx.inside()) view.update(dt, ctx.hour(), ctx.camera.position);
  },
  debug: ctx => ({ roadEvents: () => view?.info(ctx.hour()) ?? [] }),
};
