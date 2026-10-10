import * as THREE from 'three';
import type { GameCtx, GameModule } from './modules';
import { grip, mouth, nod, reach } from '../actors/gesture';

/**
 * Table service: while the player eats or drinks (any `order` activity, src/activity/primitives.ts), the dish stands on
 * the table in front of their seat (Seat.table), or on their lap where there is no table, and empties as they eat.
 * Plain shapes and the dishes' usual colours (own design, no brand). The player eats for real: the right hand takes
 * a spoonful (or a piece of meat) from the plate and brings it to the mouth, again and again; a glass goes to the lips
 * and back to the table.
 */
interface Dish {
  /** Rice or the base of the plate; null = no plate (a glass, meat on paper). */
  base: number | null;
  /** Pieces on top: colour, size, offset on the plate. */
  top: [number, number, number, number][];
  glass?: number;
  paper?: boolean;
}
const FISH = 0x9a7048, CARROT = 0xe07a2a, CABBAGE = 0xa9c27a, CASSAVA = 0xeee4cc, ONION = 0xe9d9a6;
const DISHES: Record<string, Dish> = {
  // ceebu jën: red rice, a piece of fish, vegetables
  ceebu: { base: 0xc8642f, top: [[FISH, 0.06, 0.02, 0.01], [CARROT, 0.03, -0.05, 0.03], [CABBAGE, 0.04, 0.0, -0.06], [CASSAVA, 0.035, 0.06, -0.04]] },
  riz: { base: 0xd9a35a, top: [[FISH, 0.055, 0.0, 0.02], [CARROT, 0.025, -0.05, -0.03]] },
  yassa: { base: 0xf1ead6, top: [[ONION, 0.07, 0.0, 0.0], [0x9a5a2a, 0.05, 0.04, 0.03]] },
  mafe: { base: 0xf1ead6, top: [[0x8a4a1f, 0.075, 0.01, 0.0], [0x6b3518, 0.035, -0.04, 0.03]] },
  poisson: { base: 0xf4f1e8, top: [[0x8a5a32, 0.07, 0.0, 0.0], [0x6b8f3a, 0.03, 0.07, 0.04], [ONION, 0.03, -0.07, -0.03]] },
  dibi: { base: null, paper: true, top: [[0x6a3518, 0.06, 0.0, 0.0], [0x5a2c12, 0.05, 0.05, 0.03], [ONION, 0.035, -0.05, -0.02]] },
  brochettes: { base: null, paper: true, top: [[0x6a3518, 0.04, 0.0, 0.0], [0x6a3518, 0.04, 0.05, 0.0]] },
  sandwich: { base: null, paper: true, top: [[0xd9a35a, 0.07, -0.04, 0.0], [0xd9a35a, 0.07, 0.05, 0.0], [0x7a3a1e, 0.04, 0.0, 0.02]] },
  bissap: { base: null, top: [], glass: 0x8b1a2b },
  jus: { base: null, top: [], glass: 0xd98b2a },
  drink: { base: null, top: [], glass: 0xc94a2a },
  plate: { base: 0xe8dcc0, top: [[0x9a6a3a, 0.06, 0.0, 0.0]] },
};

function build(id: string): { group: THREE.Group; food: THREE.Object3D[] } {
  const d = DISHES[id] ?? DISHES.plate;
  const group = new THREE.Group(), food: THREE.Object3D[] = [];
  const mat = (c: number, opacity = 1) => new THREE.MeshLambertMaterial({ color: c, transparent: opacity < 1, opacity });
  if (d.glass !== undefined) {
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.032, 0.13, 12), mat(0xdfe8ee, 0.45)); glass.position.y = 0.065; group.add(glass);
    const drink = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.03, 0.1, 12), mat(d.glass)); drink.position.y = 0.055; drink.userData.drink = true; group.add(drink); food.push(drink);
    group.userData.glass = true;
    return { group, food };
  }
  const under = new THREE.Mesh(d.paper ? new THREE.BoxGeometry(0.3, 0.006, 0.24) : new THREE.CylinderGeometry(0.15, 0.12, 0.025, 18), mat(d.paper ? 0xd8c8a0 : 0xf4f1e8));
  under.position.y = d.paper ? 0.003 : 0.0125; group.add(under);
  const y0 = d.paper ? 0.006 : 0.025;
  if (d.base !== null) {
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(d.base));
    mound.scale.y = mound.userData.sy = 0.42; mound.position.y = y0; group.add(mound); food.push(mound);
  }
  for (const [c, r, x, z] of d.top) {
    const piece = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 6), mat(c));
    piece.scale.y = piece.userData.sy = 0.5; piece.position.set(x, y0 + (d.base !== null ? 0.04 : r * 0.4), z); group.add(piece); food.push(piece);
  }
  return { group, food };
}

let shown: { key: string; group: THREE.Group; food: THREE.Object3D[]; at: THREE.Vector3; prop: string; spoon: THREE.Mesh | null; bites: number } | null = null;
let phase = 0, owner: GameCtx | null = null;
const T1 = new THREE.Vector3(), T2 = new THREE.Vector3();
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
/** 0 at the plate … 1 at the mouth: a bite every 1.9 s (take, lift, chew, back). */
const lift = (c: number) => c < 0.3 ? 0 : c < 0.48 ? smooth((c - 0.3) / 0.18) : c < 0.72 ? 1 : 1 - smooth((c - 0.72) / 0.18);

function clear() {
  if (!shown) return;
  const b = owner?.player.body(); if (b?.overlay === eatPose) b.overlay = null;
  shown.spoon?.removeFromParent(); shown.spoon?.geometry.dispose();
  shown.group.removeFromParent();
  shown.group.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose(); });
  shown = null;
}

export const meals: GameModule = {
  name: 'meals',
  hubLoaded: () => clear(),
  update(ctx) {
    const cur = ctx.activities.current, seat = ctx.player.seated();
    const step = cur?.step, eating = !!seat && !!step && (step.primitive === 'eat' || step.primitive === 'drink');
    if (!eating) { clear(); return; }
    const prop = step!.prop ?? (step!.primitive === 'drink' ? 'drink' : 'plate'), key = `${seat!.id}:${prop}`;
    if (shown?.key !== key) {
      clear();
      const fx = Math.sin(seat!.yaw), fz = Math.cos(seat!.yaw);
      const at = seat!.table ? new THREE.Vector3(seat!.table.x, seat!.table.y, seat!.table.z) : new THREE.Vector3(seat!.x + fx * 0.27, seat!.top + 0.12, seat!.z + fz * 0.27);   // on the lap
      const b = build(prop);
      b.group.position.copy(at); b.group.rotation.y = seat!.yaw;
      ctx.scene.add(b.group);
      const drink = DISHES[prop]?.glass !== undefined || step!.primitive === 'drink';
      const spoon = drink || DISHES[prop]?.paper ? null : new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.03), new THREE.MeshLambertMaterial({ color: 0xc8ccd0 }));
      if (spoon) ctx.scene.add(spoon);
      shown = { key, group: b.group, food: b.food, at, prop, spoon, bites: 0 }; phase = 0;
      owner = ctx;
      const body = ctx.player.body(); if (body) body.overlay = eatPose;
    }
    const c = (cur!.t % 1.9) / 1.9;
    if (phase < 0.48 && c >= 0.48) shown!.bites++;                       // the spoon reaches the mouth
    phase = c;
    // the plate (or the glass) empties as the step goes on
    const k = Math.min(1, cur!.t / Math.max(0.1, step!.seconds ?? 1)), left = 1 - 0.75 * k;
    for (const f of shown!.food) {
      if (f.userData.drink) { f.scale.y = left; f.position.y = 0.005 + 0.05 * left; }
      else f.scale.set(left, left * f.userData.sy, left);
    }
  },
  debug: () => ({ meal: () => shown ? { prop: shown.prop, x: +shown.at.x.toFixed(2), y: +shown.at.y.toFixed(2), z: +shown.at.z.toFixed(2), bites: shown.bites, lifting: lift(phase) > 0.9 } : null }),
};

/** The eating gesture (Humanoid.overlay): right hand plate → mouth; a glass travels with the hand. */
function eatPose(h: import('../actors/humanoid').Humanoid) {
  if (!shown) return;
  const yaw = h.group.rotation.y, r = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
  const k = lift(phase), drink = !!shown.group.userData.glass;
  const plate = T1.copy(shown.at).add(new THREE.Vector3(0, drink ? 0.06 : 0.07, 0)).addScaledVector(r, 0.05);
  const m = mouth(h, T2); m.y -= 0.06;
  reach(h, 'R', plate.lerp(m, k), new THREE.Vector3(0, -1, 0).addScaledVector(r, 0.7));
  if (k > 0.6) nod(h, -0.1 * k); else nod(h, 0.18);                       // looks at the plate, then up to the bite
  const g = grip(h, 'R', T2);
  if (shown.spoon) { shown.spoon.position.copy(g); shown.spoon.rotation.set(0, yaw + 0.4, 0); }
  if (drink) shown.group.position.copy(k > 0.05 ? g.add(new THREE.Vector3(0, -0.05, 0)) : shown.at);
}
