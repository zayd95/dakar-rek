import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { HubWorld } from '../world/types';
import { buildVehicle, type VehicleSpec as KitSpec } from '../actors/vehicleKit';
import { Humanoid, humanoidReady, randomLook, type PersonLook } from '../actors/humanoid';
import { trafficClosures, type Closure } from '../actors/npc';
import { arenaExterior, eveningSize } from '../arena/exterior';
import { GALA } from '../arena/program';
import { transport, type Footprint } from '../transport/module';
import { clearKerb } from '../transport/passengers';
import { carRapideKit } from '../transport/carRapide';
import { motoSpec } from '../transport/moto';
import { carSpec } from '../transport/car';
import { driveStep, newDriveState } from '../transport/drive';
import type { DriveSpec } from '../transport/spec';
import { cityTimeAt } from '../core/clock';
import { rng } from '../core/rng';
import { ECURIE_LOOK } from '../crowd/looks';
import { arenaArrivalsNow, insideArena } from '../crowd/module';
import { motoWithPillion } from './arena';
import { GalaAudio } from './galaAudio';
import { LEAVING_FROM } from './rules';
import {
  HOUR_S, JAM_DEPTH, JAM_LOOKS, JAM_LOOK_COUNT, JamTimeline, RANK, Route, agentOn, agentPhase, filterLanes, galaGeo, galaRoads, galaSeed, hornAt, hornVolume,
  jamDepth, jamLevel, jamWindow, motoEvery, motoHandover, motoPillion, motoRoute, motoS, motoTrip, rankRoute, rankS, rankTaxis, rankVisit, rapideHorn, stepRiders, stepSpot,
  walkToMoto, walkToQueue, walkToRank, RANK_CYCLE, RAPIDE_HORN_SLOT, GALA_FLOWS, type GalaGeo, type JamKind, type JamNow, type MotoStops, type MotoTrip, type Pt, type Quality, type RoadDir,
} from './galaRules';

/**
 * The gala-night road to the arena (Pikine), drawn from src/city/galaRules.ts on the shared clock — the same cars at
 * the same places for every player:
 *  - the east approach's jam (three columns, kerb to kerb), its front cars sent round to the north by the traffic agent
 *    in the junction's middle, new ones driving in to its tail; after the bouts it faces the other way, fed from the
 *    parking along the arena; solid for the player's moto and car (transport.addObstacles), whose moto filters through
 *    the gaps where a car does not fit;
 *  - the moto-taxis filtering through the jam to their drop-off on the gate road (the fan on the back steps off and
 *    walks to the queue: the arrivals' walker pool, src/crowd/arrivals.ts); after the bouts they come to take fans home;
 *  - taxis at the corner's rank after the bouts, the crowd walking out to them;
 *  - fans in their écurie's colours on the rear step of the Ligne 23 evening cars, beside the apprenti; horns from the
 *    jam and the car rapides, the agent's whistle.
 * Cost: the jam's looks and the moto-taxis are instanced kit vehicles (one body and one glass mesh a look, one mesh for
 * each moto look); the agent and the step riders are humanoids under the shared crowd budget. A weekday card is 40 % of
 * a gala. Off indoors and inside the arena's walls; nothing far from the arena.
 */

/** Drawn while the camera is within this distance of the junction. */
const VIEW = 190;
/** Fans on the step are drawn within this distance (the apprenti's). */
const NEAR = 70;
/** Jam cars solid for drive mode within this distance of the player. */
const SOLID = 60;
/** Looks' kit seeds (the same colours for everyone). */
const LOOK_SEED: Record<JamKind, number> = { taxi: 3, sedan: 2, suv: 2, pickup: 5 };
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
const HI_VIS: PersonLook = { skin: 0x3b2216, style: 'tee', top: 0xc9e23a, pattern: 'rayure', accent: 0xd8d8d0, bottom: 0x1d2a44, shoes: 0x1c1c1f, muscular: 0.3 };

interface Look { key: string; spec: KitSpec; meshes: THREE.InstancedMesh[]; proxies: THREE.Object3D[]; n: number }
interface Rider { h: Humanoid; armR: THREE.Object3D | null; armL: THREE.Object3D | null }
/** What the checks read. */
interface Stats { fansOut: number; fansIn: number; horns: number; rapideHorns: number; whistles: number; released: number; motos: number; rankTaxis: number }

class GalaTraffic {
  readonly group = new THREE.Group();
  readonly geo: GalaGeo;
  private looks = new Map<string, Look>();
  private moto: Route; private stops: MotoStops;
  private ranks: { route: Route; stopS: number }[];
  private tl: JamTimeline | null = null;
  private tlKey = '';
  private agent: Rider | null = null;
  private agentYaw = Math.PI / 2;
  private riders: Rider[][] = [];
  private audio = new GalaAudio();
  private lastT = NaN;
  private lastGo: 'gate' | 'jam' | null = null;
  private outSince = NaN;
  private wasDir: RoadDir | null = null;
  private solid: Footprint[] = [];
  private unObstacles: () => void;
  private closure: Closure;
  private shut: Set<string>;
  private quality: Quality;
  private rand = rng(6161);
  /** Now: the mode, what the jam shows, the moto-taxis and rank taxis (debug). */
  private now: { dir: RoadDir | null; size: 'gala' | 'card'; seed: number; hour: number; level: number; depth: number; t: number; draw: boolean } = { dir: null, size: 'gala', seed: 0, hour: 0, level: 0, depth: 0, t: 0, draw: false };
  private cars: JamNow[] = [];
  private motos: { m: MotoTrip; x: number; z: number; pillion: boolean }[] = [];
  private taxis: { slot: number; n: number; x: number; z: number; waiting: boolean }[] = [];
  readonly stats: Stats = { fansOut: 0, fansIn: 0, horns: 0, rapideHorns: 0, whistles: 0, released: 0, motos: 0, rankTaxis: 0 };
  /** Debug: force the mode and the size (null: follow the arena's street). */
  force: { dir?: RoadDir | null; size?: 'gala' | 'card' | null } = {};

  constructor(private ctx: GameCtx, private hub: HubWorld) {
    this.quality = ctx.quality();
    this.geo = galaGeo(hub.arena!);
    this.group.name = 'gala_traffic';
    const mr = motoRoute(this.geo);
    this.moto = new Route(mr.pts); this.stops = { holdS: this.moto.at[mr.hold], dropS: this.moto.at[mr.drop], waitS: this.moto.at[mr.wait] };
    this.ranks = this.geo.rank.map((_, i) => { const r = rankRoute(this.geo, i), route = new Route(r.pts); return { route, stopS: route.at[r.stop] }; });
    // the looks: instanced kit vehicles (body + glass), and a light proxy for each instance (src/city/night.ts finds them)
    const cap = 3 * JAM_DEPTH[this.quality] + 18 + RANK[this.quality];
    for (const l of JAM_LOOKS.slice(0, JAM_LOOK_COUNT[this.quality])) this.addLook(l.kind, buildVehicle(l.kind, { seed: LOOK_SEED[l.kind], lod: 'near', driver: true, passengers: false }), cap);
    const ps = motoWithPillion();
    this.addLook('moto', buildVehicle('moto', { seed: ps, lod: 'near', driver: true, passengers: false }), GALA_FLOWS[this.quality] * 2);
    this.addLook('motoP', buildVehicle('moto', { seed: ps, lod: 'near', driver: true, passengers: true }), GALA_FLOWS[this.quality] * 2);
    // no parking on the jam's stretch nor at the taxis' kerb
    const j = this.geo.junction;
    clearKerb(ctx.extra, hub.colliders, [
      { x: j.x + 40, z: j.z, dx: 1, dz: 0, rx: 0, rz: 1, offset: 0, from: -40, to: 40 },
      { x: j.x + 40, z: j.z, dx: 1, dz: 0, rx: 0, rz: -1, offset: 0, from: -40, to: 40 },
      { x: j.x, z: j.z - 30, dx: 0, dz: 1, rx: -1, rz: 0, offset: 0, from: -14, to: 14 },
    ]);
    if (humanoidReady()) {
      const h = new Humanoid(HI_VIS); h.hold = 'Idle'; h.group.visible = false;
      h.group.position.set(this.geo.agent.x, 0.1 + hub.heightAt(this.geo.agent.x, this.geo.agent.z), this.geo.agent.z);
      this.group.add(h.group);
      this.agent = { h, armR: h.group.getObjectByName('upper_armR') ?? null, armL: h.group.getObjectByName('upper_armL') ?? null };
    }
    // the decorative traffic keeps off the gala's roads while it runs; drive mode stops at the jam's cars and the agent
    const key = (ax: number, az: number, bx: number, bz: number) => { const a = `${Math.round(ax)},${Math.round(az)}`, b = `${Math.round(bx)},${Math.round(bz)}`; return a < b ? `${a}|${b}` : `${b}|${a}`; };
    this.shut = new Set(galaRoads(this.geo).map(([p, q]) => key(p.x, p.z, q.x, q.z)));
    this.closure = (ax, az, bx, bz) => this.now.dir !== null && this.shut.has(key(ax, az, bx, bz));
    trafficClosures.more.add(this.closure);
    this.unObstacles = transport.addObstacles(out => { for (const f of this.solid) out.push(f); });
    ctx.extra.add(this.group);
  }

  private addLook(key: string, b: ReturnType<typeof buildVehicle>, cap: number) {
    const meshes: THREE.InstancedMesh[] = [];
    for (const name of ['body', 'glass']) {
      const src = b.group.getObjectByName(name) as THREE.Mesh | undefined;
      if (!src) continue;
      const m = new THREE.InstancedMesh(src.geometry, src.material as THREE.Material, cap);
      m.name = `gala_${key}_${name}`; m.count = 0; m.visible = false; m.frustumCulled = false;
      m.castShadow = name === 'body' && this.quality === 'high' && !key.startsWith('moto');
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m); meshes.push(m);
    }
    const lamps = new THREE.Group(); lamps.name = `gala_${key}_lamps`; this.group.add(lamps);
    const proxies = Array.from({ length: cap }, () => {
      const o = new THREE.Object3D(); o.visible = false; o.userData.vehicleSpec = b.spec; o.userData.engineOn = true; lamps.add(o); return o;
    });
    this.looks.set(key, { key, spec: b.spec, meshes, proxies, n: 0 });
  }

  /** The mode now: the arena's street (arriving, leaving, quiet) and the evening's size, unless forced (debug). */
  private mode() {
    const ph = arenaExterior.phase();
    const dir: RoadDir | null = this.force.dir !== undefined ? this.force.dir : ph === 'arrive' ? 'in' : ph === 'outflow' ? 'out' : null;
    const size = this.force.size ?? arenaExterior.size() ?? eveningSize(this.ctx.day(), Math.max(17, this.ctx.hour()));
    return { dir, size };
  }

  update(dt: number) {
    const ctx = this.ctx, t = ctx.now() / 1000, hour = ctx.hour(), day = ctx.day();
    const real = cityTimeAt(ctx.now()).hourFloat, fixed = Math.abs(hour - real) > 0.02 && Math.abs(Math.abs(hour - real) - 24) > 0.02;
    const { dir, size } = this.mode(), seed = galaSeed(this.hub.id, day), q = this.quality;
    const cam = ctx.camera.position, j = this.geo.junction;
    const draw = !ctx.inside() && !insideArena(ctx, this.hub) && Math.hypot(cam.x - j.x, cam.z - j.z) < VIEW;
    this.group.visible = draw;
    // when the street turns to leaving: the outflow starts now (or at 22 h 24 when one arrives later on the clock)
    if (dir === 'out' && this.wasDir !== 'out') this.outSince = this.wasDir === null && !fixed && hour >= LEAVING_FROM ? t - (hour - LEAVING_FROM) * HOUR_S : t;
    this.wasDir = dir;
    const hourAt = (s: number) => (fixed ? hour : hour - (t - s) / HOUR_S);
    const level = dir ? jamLevel(hour, size, seed, dir === 'out') : 0;
    this.now = { dir, size, seed, hour, level, depth: jamDepth(level, q, size), t, draw };

    // the jam: one timeline a mode (a fixed debug hour starts it empty at that hour; the clock replays the evening)
    const key = dir ? `${dir}|${size}|${seed}|${fixed ? hour.toFixed(3) : 'clock'}|${dir === 'out' ? this.outSince.toFixed(1) : ''}` : '';
    if (key !== this.tlKey) {
      this.tlKey = key;
      this.tl = null;
      if (dir) {
        const since = dir === 'out' ? this.outSince : fixed ? t - 0.5 : Math.min(t - 0.5, t - (hour - (GALA.doors - 0.3)) * HOUR_S);
        const ramp = (s: number) => (dir === 'out' ? Math.min(1, Math.max(0, (s - this.outSince) / 25)) : 1);
        this.tl = new JamTimeline(this.geo, dir, seed, q, since, s => jamDepth(jamLevel(hourAt(s), size, seed, dir === 'out') * ramp(s), q, size));
      }
    }
    this.tl?.advance(t);
    this.cars = this.tl?.at(t) ?? [];
    const jump = !(t - this.lastT < 5);                                       // a load or a warp: no catching up on old events
    for (const l of this.looks.values()) l.n = 0;
    for (const c of this.cars) this.put(c.kind, c.x, c.z, c.yaw);

    // the moto-taxis on the evening's lattice (and the fans they drop or take)
    this.motos = [];
    if (dir) {
      const every = motoEvery(q, size), o = { ...this.stops, seed, every, route: this.moto, hourAt, dirAt: () => dir, size };
      const P = { x: 0, z: 0, yaw: 0 };
      for (let i = Math.floor((t - 90) / every) - 1; i <= Math.floor(t / every) + 1; i++) {
        const m = motoTrip(i, o); if (!m) continue;
        if (!jump) this.motoEvents(m, t);
        const s = motoS(m, t, this.stops);
        if (s === null || s >= this.moto.length - 0.5) continue;
        this.moto.sample(s, P);
        const pillion = motoPillion(m, t);
        this.put(pillion ? 'motoP' : 'moto', P.x, P.z, P.yaw);
        this.motos.push({ m, x: P.x, z: P.z, pillion });
      }
    }
    // the taxis at the corner's rank after the bouts (and the crowd walking out to them)
    this.taxis = [];
    if (dir === 'out') {
      const P = { x: 0, z: 0, yaw: 0 }, slots = rankTaxis(q, size);
      for (let r = 0; r < slots; r++) {
        const { route, stopS } = this.ranks[r];
        for (let n = Math.floor((t - 120) / RANK_CYCLE) - 2; n <= Math.floor(t / RANK_CYCLE) + 1; n++) {
          const v = rankVisit(r, n, { seed, route, stopS, leaving: s => s >= this.outSince - 20 }); if (!v) continue;
          if (!jump) this.rankEvents(r, v.arrive, t);
          const s = rankS(v, t, stopS, route.length); if (s === null) continue;
          route.sample(s, P);
          this.put('taxi', P.x, P.z, P.yaw);
          this.taxis.push({ slot: r, n, x: P.x, z: P.z, waiting: t >= v.arrive && t < v.leave });
        }
      }
    }
    this.flush(draw);

    // the agent in the junction's middle: facing the jam to hold it, turned north to send it round; his whistle
    const on = !!dir && agentOn(hour), ph = agentPhase(t, seed);
    if (this.agent) {
      const a = this.agent, vis = on && draw;
      a.h.group.visible = vis;
      if (vis) {
        const want = ph.go === 'gate' ? Math.PI / 2 : Math.PI, d = Math.atan2(Math.sin(want - this.agentYaw), Math.cos(want - this.agentYaw));
        this.agentYaw += d * Math.min(1, dt * 5); a.h.group.rotation.y = this.agentYaw;
        a.h.animate(dt, 0);
        if (ph.go === 'gate') { a.armR?.rotateX(-1.5); a.armL?.rotateX(-0.2); }            // the flat hand up: stop
        else { a.armR?.rotateX(-1.25 + 0.55 * Math.sin(t * 5.5)); a.armL?.rotateX(-0.3); }   // the arm sweeping them on
      }
    }
    if (on && this.lastGo && ph.go !== this.lastGo && !jump) { this.stats.whistles++; this.audio.play('whistle', draw ? hornVolume(this.dist(j)) : 0); }
    this.lastGo = on ? ph.go : null;

    // horns: the jam's (one-second slots of the shared clock) and the car rapides bringing fans in
    const standing = this.cars.filter(c => c.state !== 'away');
    if (!jump && dir) for (let slot = Math.floor(this.lastT) + 1; slot <= Math.floor(t); slot++) {
      const k = hornAt(slot, seed, size, standing.length, level);
      if (k >= 0) { this.stats.horns++; this.audio.play('car', draw ? hornVolume(this.dist(standing[k])) : 0); }
    }
    this.carRapides(dt, t, dir, size, seed, jump, draw);

    // solid for drive mode: the jam's cars near the player, and the agent
    const me = ctx.player.pos;
    this.solid = this.cars.filter(c => Math.hypot(c.x - me.x, c.z - me.z) < SOLID).map(c => ({ x: c.x, z: c.z, yaw: c.yaw, hl: c.hl, hw: c.hw }));
    if (on) this.solid.push({ x: this.geo.agent.x, z: this.geo.agent.z, yaw: 0, hl: 0.3, hw: 0.3 });
    this.lastT = t;
  }

  private dist(p: Pt) { const me = this.ctx.player.pos; return Math.hypot(p.x - me.x, p.z - me.z); }

  /** A moto-taxi at its drop-off: arriving, the fan on the back steps off and walks to the queue; leaving, one walks out to it. */
  private motoEvents(m: MotoTrip, t: number) {
    const arr = arenaArrivalsNow(); if (!arr || !this.now.draw) return;
    if (m.dir === 'in') {
      const at = motoHandover(m);
      if (this.lastT < at && at <= t && arr.spawn(this.geo.motoStep, walkToQueue(this.geo), 1, 0) > 0) this.stats.fansOut++;
    } else {
      const path = walkToMoto(this.geo), at = motoHandover(m) - 1.5 - pathLength(this.geo.gateOut, path) / 1.35;
      if (this.lastT < at && at <= t && arr.spawn(this.geo.gateOut, path, 1, 0) > 0) this.stats.fansIn++;
    }
  }
  /** Two of the crowd walk out of the gate to a rank taxi, reaching it while it waits (they get in). */
  private rankEvents(slot: number, arrive: number, t: number) {
    const arr = arenaArrivalsNow(); if (!arr || !this.now.draw) return;
    const path = walkToRank(this.geo, slot), at = arrive + 6 - pathLength(this.geo.gateOut, path) / 1.35;
    if (this.lastT < at && at <= t) this.stats.fansIn += arr.spawn(this.geo.gateOut, path, 2, 0.8);
  }

  /** The Ligne 23 evening cars: fans on the rear step beside the apprenti, a toot on the way in. */
  private carRapides(dt: number, t: number, dir: RoadDir | null, size: 'gala' | 'card', seed: number, jump: boolean, draw: boolean) {
    const cars = transport.lineCars('23s'), step = carRapideKit().step?.riding, cam = this.ctx.camera.position;
    const want = dir && draw && step ? stepRiders(size, this.quality) : 0, g = this.geo.gateOut;
    cars.forEach((c, ci) => {
      const full = c.fans || dir === 'out';
      const riders = (this.riders[ci] ??= []);
      while (humanoidReady() && riders.length < stepRiders('gala', this.quality)) riders.push(this.rider(ci, riders.length));
      const near = Math.hypot(c.x - cam.x, c.z - cam.z) < NEAR, close = Math.hypot(c.x - g.x, c.z - g.z) < 60;
      riders.forEach((r, k) => {
        if (r.h.group.parent !== c.body) c.body.add(r.h.group);
        const vis = !!step && k < want && full && near;
        r.h.group.visible = vis;
        if (!vis || !step) return;
        const p = stepSpot(step, k);
        r.h.group.position.set(p.x, p.y, p.z); r.h.group.rotation.y = p.yaw;
        r.h.animate(dt, 0);
        r.armR?.rotateX(-2.4);                                                   // a hand on the bar
        r.armL?.rotateX(close ? -2.2 + 0.6 * Math.sin(t * 6 + k) : -0.5);        // the other one up, near the arena
      });
      if (!jump && full && dir && close && c.v > 1) {
        const slot = Math.floor(t / RAPIDE_HORN_SLOT), sec = rapideHorn(slot, c.index, seed), at = slot * RAPIDE_HORN_SLOT + sec;
        if (sec >= 0 && this.lastT < at && at <= t) { this.stats.rapideHorns++; this.audio.play('rapide', draw ? hornVolume(this.dist(c)) : 0); }
      }
    });
    for (let ci = cars.length; ci < this.riders.length; ci++) for (const r of this.riders[ci] ?? []) r.h.group.visible = false;
  }
  /** A fan for the step, in the colours of one écurie or the other (a tee with stripes of its second colour). */
  private rider(ci: number, k: number): Rider {
    const e = ECURIE_LOOK[(ci + k) % 2 ? 'right' : 'left'];
    const h = new Humanoid({ ...randomLook(this.rand), female: false, style: 'tee', top: e.main, pattern: 'rayure', accent: e.accent, hat: null });
    h.hold = 'Idle'; h.group.visible = false;
    return { h, armR: h.group.getObjectByName('upper_armR') ?? null, armL: h.group.getObjectByName('upper_armL') ?? null };
  }

  private put(key: string, x: number, z: number, yaw: number) {
    const l = this.looks.get(key) ?? this.looks.get('taxi'); if (!l || l.n >= l.proxies.length) return;
    M4.compose(V.set(x, 0.08, z), Q.setFromAxisAngle(UP, yaw), S1);
    for (const m of l.meshes) m.setMatrixAt(l.n, M4);
    const p = l.proxies[l.n]; p.position.set(x, 0.08, z); p.rotation.y = yaw; p.visible = true;
    l.n++;
  }
  private flush(draw: boolean) {
    for (const l of this.looks.values()) {
      for (const m of l.meshes) { m.count = l.n; m.visible = draw && l.n > 0; m.instanceMatrix.needsUpdate = true; }
      for (let i = l.n; i < l.proxies.length && l.proxies[i].visible; i++) l.proxies[i].visible = false;
    }
  }

  /** Run a vehicle straight through the jam as it stands now (drive mode's own step and box test): does it get past? */
  probe(kind: 'moto' | 'car', z: number) {
    const d: DriveSpec | undefined = (kind === 'moto' ? motoSpec() : carSpec()).drive, w = this.hub;
    if (!d) return null;
    const obst: Footprint[] = []; transport.obstacles(obst);
    const blocked = (x: number, zz: number, r: number) => {
      for (const c of w.colliders) if (x > c.x0 - r && x < c.x1 + r && zz > c.z0 - r && zz < c.z1 + r) return true;
      if (w.heightAt(x, zz) > 0.3) return true;
      for (const o of obst) {
        const dx = x - o.x, dz = zz - o.z, c = Math.cos(o.yaw), s = Math.sin(o.yaw), lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) < o.hw + r && Math.abs(lz) < o.hl + r) return true;
      }
      return false;
    };
    const tail = Math.max(this.geo.front, ...this.cars.filter(c => c.state === 'queue').map(c => c.x + c.hl));
    const st = newDriveState(tail + 6, z, -Math.PI / 2);
    let bumps = 0;
    for (let k = 0; k < 30 * 25 && st.x > this.geo.front - 3; k++) if (driveStep(st, { throttle: 1, steer: 0 }, d, 1 / 30, blocked) && Math.abs(st.speed) < 0.5) bumps++;
    return { kind, z, from: tail + 6, x: st.x, passed: st.x <= this.geo.front - 3, bumps };
  }

  info() {
    const tl = this.tl, standing = this.cars.filter(c => c.state === 'queue'), ph = agentPhase(this.now.t, this.now.seed);
    const draws = [...this.looks.values()].flatMap(l => l.meshes).filter(m => m.visible && m.count > 0).length;
    return {
      ...this.now, geo: this.geo, quality: this.quality, outSince: this.outSince, window: jamWindow(this.now.size, this.now.seed),
      agent: { on: !!this.now.dir && agentOn(this.now.hour), go: ph.go, left: Math.round(ph.left * 10) / 10, shown: !!this.agent?.h.group.visible, yaw: this.agentYaw, x: this.geo.agent.x, z: this.geo.agent.z },
      jam: {
        cars: this.cars.length, standing: standing.length, coming: this.cars.filter(c => c.state === 'come').length, away: this.cars.filter(c => c.state === 'away').length,
        columns: this.geo.columns.map((_, c) => tl ? tl.queue(c, this.now.t).length : 0), faces: standing.length ? Math.round(standing[0].yaw * 100) / 100 : null,
        list: this.cars.map(c => ({ col: c.col, kind: c.kind, state: c.state, x: Math.round(c.x * 10) / 10, z: Math.round(c.z * 10) / 10, yaw: Math.round(c.yaw * 100) / 100, hw: c.hw, hl: c.hl })),
      },
      lanes: { moto: filterLanes(standing, this.geo.corridor, 0.42), car: filterLanes(standing, this.geo.corridor, 0.89) },
      motos: this.motos.map(m => ({ i: m.m.i, dir: m.m.dir, x: Math.round(m.x * 10) / 10, z: Math.round(m.z * 10) / 10, pillion: m.pillion,
        state: this.now.t < m.m.holdIn ? 'in' : this.now.t < m.m.holdOut ? 'hold' : this.now.t < m.m.dropIn ? 'to-drop' : this.now.t < m.m.dropOut ? 'drop' : this.now.t < m.m.waitOut ? 'back' : 'out' })),
      rank: this.taxis,
      riders: { shown: this.riders.flat().filter(r => r.h.group.visible).length, made: this.riders.flat().length },
      stats: { ...this.stats }, audio: { ...this.audio.count },
      drawCalls: draws, solid: this.solid.length, closed: this.now.dir !== null,
    };
  }

  dispose() {
    this.unObstacles();
    trafficClosures.more.delete(this.closure);
    this.agent?.h.dispose();
    for (const r of this.riders.flat()) r.h.dispose();
    for (const l of this.looks.values()) for (const m of l.meshes) m.dispose();
    this.audio.dispose();
    this.group.removeFromParent();
  }
}

/** Length of a walk from `from` along `path`. */
function pathLength(from: Pt, path: readonly Pt[]) {
  let d = 0, p = from;
  for (const q of path) { d += Math.hypot(q.x - p.x, q.z - p.z); p = q; }
  return d;
}

let gala: GalaTraffic | null = null;

export const galaTrafficModule: GameModule = {
  name: 'galaTraffic',
  hubLoaded(ctx, hub) {
    gala?.dispose(); gala = null;
    if (hub.arena && hub.id === 'pikine') gala = new GalaTraffic(ctx, hub);
  },
  update(_ctx, dt) { gala?.update(dt); },
  debug: () => ({
    gala: {
      /** The gala road now: mode, level, the jam, the agent, the gaps, the moto-taxis, the rank, the riders, horns, draw calls. */
      info: () => gala?.info() ?? null,
      /** Force arriving ('in'), leaving ('out') or no evening (null); undefined: follow the arena's street again. */
      force: (dir?: RoadDir | null) => { if (gala) gala.force.dir = dir; },
      /** Force a gala night or a weekday card (null: the evening's own). */
      size: (s: 'gala' | 'card' | null) => { if (gala) gala.force.size = s; },
      /** Drive a moto or a car straight through the jam as it stands (drive mode's own test) along z. */
      probe: (kind: 'moto' | 'car', z: number) => gala?.probe(kind, z) ?? null,
    },
  }),
};
