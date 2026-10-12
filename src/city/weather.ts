import * as THREE from 'three';
import type { GameModule } from '../game/modules';
import { streetLevel } from '../actors/npc';
import { GRID, roadCentre } from '../transport/lines';
import { rng } from '../core/rng';
import { weatherAt, weatherStreet, type Weather } from './rules';

/**
 * A light weather layer (spec §25): sun, overcast, a shower, the wet streets after it — the day's weather comes from
 * the shared clock (src/city/rules.ts weatherAt), so everyone in Dakar has the same sky. What it changes:
 *  - the light: the sky greys, the sun dims, the haze closes in under rain (main.ts reads `weatherNow`);
 *  - the ground: the roads darken and puddles shine while they are wet (one merged overlay, two draw calls);
 *  - the rain itself: streaks falling round the camera (one draw call, only while it rains, not indoors);
 *  - the street: fewer people out in the rain, slower cars (src/actors/npc.ts streetLevel, on top of the hour's).
 */
export const weatherNow: Weather = { kind: 'sun', cloud: 0, rain: 0, wet: 0 };

const STREAKS = { low: 160, medium: 360, high: 600 } as const;
const BOX = { w: 26, h: 14 };

class WeatherView {
  readonly group = new THREE.Group();
  private wetMat = new THREE.MeshBasicMaterial({ color: 0x080a10, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  private puddleMat = new THREE.MeshBasicMaterial({ color: 0xa9bccb, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  private rainMat = new THREE.LineBasicMaterial({ color: 0xe6eef8, transparent: true, opacity: 0, depthWrite: false });
  private wet: THREE.Mesh; private puddles: THREE.Mesh; private rain: THREE.LineSegments;
  private drops: Float32Array; private n: number;
  private rand = rng(777);

  constructor(quality: 'low' | 'medium' | 'high') {
    this.group.name = 'weather';
    // the roads of the grid (src/world/builder.ts: centre lines at roadCentre(k), 14 m wide, 266 m long)
    const parts: THREE.BufferGeometry[] = [], half = (GRID.nb * GRID.pitch + GRID.road) / 2 + 6;
    for (let k = 0; k <= GRID.nb; k++) {
      const a = new THREE.PlaneGeometry(GRID.road, half * 2); a.rotateX(-Math.PI / 2); a.translate(roadCentre(k), 0.095, 0); parts.push(a);
      const b = new THREE.PlaneGeometry(half * 2, GRID.road); b.rotateX(-Math.PI / 2); b.translate(0, 0.096, roadCentre(k)); parts.push(b);
    }
    this.wet = new THREE.Mesh(merge(parts), this.wetMat); this.wet.name = 'wet_roads'; this.wet.renderOrder = 1;
    // puddles along the kerbs, where water stays
    const R = rng(4040), pd: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 46; i++) {
      const k = Math.floor(R() * (GRID.nb + 1)), along = (R() - 0.5) * 230, side = R() < 0.5 ? -1 : 1, lat = side * (3.2 + R() * 1.6);
      const g = new THREE.CircleGeometry(0.6 + R() * 1.1, 10); g.rotateX(-Math.PI / 2); g.scale(1, 1, 0.45 + R() * 0.4);
      if (R() < 0.5) g.translate(roadCentre(k) + lat, 0.1, along); else { g.rotateY(Math.PI / 2); g.translate(along, 0.1, roadCentre(k) + lat); }
      pd.push(g);
    }
    this.puddles = new THREE.Mesh(merge(pd), this.puddleMat); this.puddles.name = 'puddles'; this.puddles.renderOrder = 2;
    this.n = STREAKS[quality];
    this.drops = new Float32Array(this.n * 6);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(this.drops, 3));
    this.rain = new THREE.LineSegments(geo, this.rainMat); this.rain.frustumCulled = false; this.rain.name = 'rain';
    for (let i = 0; i < this.n; i++) this.seed(i, { x: 0, y: 0, z: 0 }, true);
    this.group.add(this.wet, this.puddles, this.rain);
    this.apply({ kind: 'sun', cloud: 0, rain: 0, wet: 0 }, false);
  }

  private seed(i: number, c: { x: number; y: number; z: number }, anyHeight: boolean) {
    const x = c.x + (this.rand() - 0.5) * BOX.w, z = c.z + (this.rand() - 0.5) * BOX.w, y = c.y + (anyHeight ? this.rand() * BOX.h : BOX.h) - 4;
    const d = this.drops, o = i * 6;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = x + 0.06; d[o + 4] = y - 0.95; d[o + 5] = z + 0.1;
  }

  apply(w: Weather, indoors: boolean) {
    this.wetMat.opacity = 0.42 * w.wet;
    this.puddleMat.opacity = 0.4 * w.wet;
    this.wet.visible = this.puddles.visible = w.wet > 0.02;
    this.rainMat.opacity = 0.7 * w.rain;
    this.rain.visible = w.rain > 0.02 && !indoors;
  }

  /** The streaks fall round the camera (wrapped back to the top of the box when they reach the ground). */
  fall(dt: number, cam: THREE.Vector3) {
    if (!this.rain.visible) return;
    const d = this.drops, v = 16 * dt;
    for (let i = 0; i < this.n; i++) {
      const o = i * 6;
      d[o + 1] -= v; d[o + 4] -= v; d[o] += 0.03 * v; d[o + 3] += 0.03 * v;          // a little wind from the sea
      if (d[o + 4] < 0 || Math.abs(d[o] - cam.x) > BOX.w / 2 + 4 || Math.abs(d[o + 2] - cam.z) > BOX.w / 2 + 4) this.seed(i, cam, false);
    }
    (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.wet.geometry.dispose(); this.puddles.geometry.dispose(); this.rain.geometry.dispose();
    this.wetMat.dispose(); this.puddleMat.dispose(); this.rainMat.dispose();
    this.group.removeFromParent();
  }
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // plain position/normal/uv triangles: concatenate (all parts are non-indexed or indexed the same way)
  const flat = parts.map(p => (p.index ? p.toNonIndexed() : p));
  const n = flat.reduce((t, p) => t + p.attributes.position.count, 0), pos = new Float32Array(n * 3);
  let o = 0;
  for (const p of flat) { pos.set(p.attributes.position.array as Float32Array, o); o += p.attributes.position.count * 3; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  for (const p of parts) p.dispose();
  return g;
}

let view: WeatherView | null = null;
/** Debug only: force a weather (the checks see each kind). */
let forced: Weather | null = null;

export const weatherModule: GameModule = {
  name: 'weather',
  hubLoaded(ctx) {
    view?.dispose();
    view = new WeatherView(ctx.quality());
    ctx.extra.add(view.group);
  },
  update(ctx, dt) {
    const w = forced ?? weatherAt(ctx.day(), ctx.hour());
    Object.assign(weatherNow, w);
    const s = weatherStreet(w);
    streetLevel.walkers = s.walkers; streetLevel.traffic = s.traffic; streetLevel.speed = s.speed;
    if (!view) return;
    const indoors = !!ctx.inside();
    view.apply(w, indoors);
    view.fall(dt, ctx.camera.position);
  },
  debug: ctx => ({
    weather: {
      now: () => ({ ...weatherNow, street: { ...streetLevel } }),
      at: (day: number, hour: number) => weatherAt(day, hour),
      /** Force a weather ('sun' | 'overcast' | 'rain' | 'after'), or null for the day's own. */
      force: (kind: Weather['kind'] | null) => {
        forced = kind === null ? null : kind === 'rain' ? { kind, cloud: 0.85, rain: 1, wet: 1 } : kind === 'after' ? { kind, cloud: 0.4, rain: 0, wet: 0.9 } : kind === 'overcast' ? { kind, cloud: 0.7, rain: 0, wet: 0 } : { kind, cloud: 0.05, rain: 0, wet: 0 };
        void ctx;
      },
    },
  }),
};
