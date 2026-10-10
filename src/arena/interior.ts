import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import { Humanoid, humanoidReady, randomLook, type PersonLook } from '../actors/humanoid';
import { rng } from '../core/rng';
import { SECTIONS } from '../world/geew';
import { ARENA_FLOOR, PREP_SIDE, WALKWAY_R, interiorSpots, type Spot, type SpotRole } from '../world/arenaModules';
import { ECURIES } from './exteriorRules';
import { arenaExterior } from './exterior';

/**
 * The people of a fight evening inside the walls of the Pikine arena, on the props the builder draws
 * (src/world/arenaModules.ts): sabar drummers on their deck by the wrestlers' tunnel, officials at their table, journalists
 * at the press table and behind the cameras, each écurie's people in its preparation corner, and vendors walking the
 * walkway in front of the stands. They are there while the exterior's fight evening is on (`arenaExterior.active()`),
 * drawn and animated within 45 m of the player only, fewer on lower graphics quality. Spectators on the tiers belong to
 * the crowd system and the arena visit (lane/w3-crowd, lane/w2-arena); this module never takes a seat of the registry.
 */
export const INTERIOR_DENSITY = {
  low: { drummer: 2, official: 2, press: 1, media: 1, camp: 2, vendors: 1 },
  medium: { drummer: 3, official: 3, press: 2, media: 1, camp: 3, vendors: 2 },
  high: { drummer: 4, official: 3, press: 2, media: 2, camp: 3, vendors: 3 },
} as const;
const VIEW = 45;

interface Vendor { h: Humanoid; a0: number; a1: number; a: number; dir: 1 | -1; speed: number; pause: number }

const LOOKS = (R: () => number): Record<SpotRole, (s: Spot) => PersonLook> => ({
  drummer: () => ({ ...randomLook(R), style: 'boubou', pattern: 'wax' }),
  official: () => ({ ...randomLook(R), style: 'tee', top: 0x0f3d6e, pattern: 'uni', female: false }),
  press: () => ({ ...randomLook(R), style: 'tee', top: 0x2b2f36, pattern: 'uni' }),
  media: () => ({ ...randomLook(R), style: 'tee', top: 0x1c1c1e, pattern: 'uni' }),
  camp: s => ({ ...randomLook(R), style: 'tee', top: s.side === PREP_SIDE.baobab ? ECURIES[0].colour : ECURIES[1].colour, pattern: 'uni', female: false }),
});

class Interior {
  readonly group = new THREE.Group();
  private still: { h: Humanoid; role: SpotRole }[] = [];
  private vendors: Vendor[] = [];
  private shown = false;

  constructor(ctx: GameCtx, readonly cx: number, readonly cz: number, quality: 'low' | 'medium' | 'high') {
    this.group.name = 'arena_interior'; this.group.visible = false;
    if (!humanoidReady()) { ctx.extra.add(this.group); return; }
    const R = rng(9191), d = INTERIOR_DENSITY[quality], looks = LOOKS(R), taken: Record<string, number> = {};
    for (const s of interiorSpots(cx, cz)) {
      const key = s.role === 'camp' ? `camp${s.side}` : s.role, cap = d[s.role];
      if ((taken[key] = (taken[key] ?? 0) + 1) > cap) continue;
      const h = new Humanoid(looks[s.role](s)); h.hold = s.clip;
      h.group.position.set(s.x, s.y, s.z); h.group.rotation.y = s.yaw; h.group.visible = false;
      this.group.add(h.group); this.still.push({ h, role: s.role });
    }
    // vendors of the stands: a tray on the head, walking the walkway along a section and back
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.08, 12), new THREE.MeshLambertMaterial({ color: 0xc9a043 }));
    const goods = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.26), new THREE.MeshLambertMaterial({ color: 0xd9482b }));
    for (let n = 0; n < d.vendors; n++) {
      const sec = SECTIONS[[1, 6, 3][n % 3]];
      const h = new Humanoid({ ...randomLook(R), style: 'tee', top: 0xf4c20d, pattern: 'uni' });
      const t = tray.clone(), gd = goods.clone(); t.position.y = 1.86; gd.position.y = 1.96; h.group.add(t, gd);
      h.group.visible = false; this.group.add(h.group);
      this.vendors.push({ h, a0: sec.a0 + 0.06, a1: sec.a1 - 0.06, a: sec.a0 + (sec.a1 - sec.a0) * (0.3 + 0.4 * R()), dir: R() < 0.5 ? 1 : -1, speed: 0.55 + R() * 0.25, pause: 0 });
    }
    ctx.extra.add(this.group);
  }

  update(dt: number, on: boolean, viewer: { x: number; z: number }, draw: boolean) {
    if (on !== this.shown) { this.shown = on; this.group.visible = on; if (!on) for (const h of this.all()) h.group.visible = false; }
    if (!on) return;
    for (const v of this.vendors) {                                                   // walk, pause to sell, turn at the aisles
      if (v.pause > 0) v.pause -= dt;
      else {
        v.a += (v.dir * v.speed * dt) / WALKWAY_R;
        if (v.a > v.a1 || v.a < v.a0) { v.a = Math.min(v.a1, Math.max(v.a0, v.a)); v.dir = v.dir === 1 ? -1 : 1; v.pause = 2.5; }
        else if (Math.random() < dt * 0.08) v.pause = 2 + Math.random() * 2;
      }
      const x = this.cx + Math.sin(v.a) * WALKWAY_R, z = this.cz + Math.cos(v.a) * WALKWAY_R;
      v.h.group.position.set(x, ARENA_FLOOR, z);
      v.h.group.rotation.y = v.pause > 0 ? v.a + Math.PI : v.a + (v.dir === 1 ? Math.PI / 2 : -Math.PI / 2);
    }
    for (const h of this.all()) {
      const p = h.group.position, vis = draw && Math.hypot(p.x - viewer.x, p.z - viewer.z) <= VIEW;
      h.group.visible = vis;
      if (vis) h.animate(dt, this.vendors.some(v => v.h === h && v.pause <= 0) ? 0.9 : 0);
    }
  }

  private all() { return [...this.still.map(s => s.h), ...this.vendors.map(v => v.h)]; }
  counts() {
    const by: Record<string, number> = {};
    for (const s of this.still) by[s.role] = (by[s.role] ?? 0) + 1;
    by.vendor = this.vendors.length;
    return { shown: this.shown, people: this.all().length, drawn: this.all().filter(h => h.group.visible).length, by };
  }
  dispose() { for (const h of this.all()) h.dispose(); this.group.removeFromParent(); }
}

let interior: Interior | null = null;
let forced: boolean | null = null;

export const arenaInteriorModule: GameModule = {
  name: 'arenaInterior',
  hubLoaded(ctx, hub) {
    interior?.dispose(); interior = null;
    if (hub.arena) interior = new Interior(ctx, hub.arena.cx, hub.arena.cz, ctx.quality());
  },
  update(ctx, dt) {
    if (!interior) return;
    interior.update(dt, forced ?? arenaExterior.active(), ctx.player.pos, !ctx.inside());
  },
  debug: () => ({
    /** The people inside the walls: shown (fight evening), drawn near the player, by role. */
    arenaIn: () => interior?.counts() ?? null,
    /** Force the interior's people on / off (null: follow the fight evening). */
    arenaInForce: (v: boolean | null) => { forced = v; },
  }),
};
