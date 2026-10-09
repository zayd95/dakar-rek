import * as THREE from 'three';
import type { GameModule } from './modules';

/**
 * Table service: while the player eats or drinks (any `order` activity, src/activity/primitives.ts), the dish stands on
 * the table in front of their seat (Seat.table), or on their lap where there is no table, and empties as they eat.
 * Plain shapes and the dishes' usual colours (own design, no brand).
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

let shown: { key: string; group: THREE.Group; food: THREE.Object3D[]; at: THREE.Vector3; prop: string } | null = null;

function clear() {
  if (!shown) return;
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
      shown = { key, group: b.group, food: b.food, at, prop };
    }
    // the plate (or the glass) empties as the step goes on
    const k = Math.min(1, cur!.t / Math.max(0.1, step!.seconds ?? 1)), left = 1 - 0.75 * k;
    for (const f of shown!.food) {
      if (f.userData.drink) { f.scale.y = left; f.position.y = 0.005 + 0.05 * left; }
      else f.scale.set(left, left * f.userData.sy, left);
    }
  },
  debug: () => ({ meal: () => shown ? { prop: shown.prop, x: +shown.at.x.toFixed(2), y: +shown.at.y.toFixed(2), z: +shown.at.z.toFixed(2) } : null }),
};
