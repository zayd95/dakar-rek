import * as THREE from 'three';

/**
 * The cabin of the car someone rides in, seen from the street: through its windows, and through its rear door on the pavement side while a passenger
 * gets in or out (src/transport/vtc.ts). Nothing here changes the car's own model: a few meshes are added to it while it is needed, and taken off.
 *
 * The authored bodies (public/assets/vehicles/<model>.glb) are solid shells: their glass is painted on (the `glass` cell of the trim atlas), and the
 * only door that opens is the driver's. So, for the car being ridden in:
 *  - the glass is seen through: its triangles mark the stencil where they are the visible surface, the depth there is cleared to the far plane, then
 *    the cabin (the body's own lining and seats, `cabin`) and the people in it are drawn (render order 7), and the glass again, tinted, on top;
 *  - the rear door on the pavement side opens: the faces of the shell inside that door's outline (between the panel seams of the authored body:
 *    its `stations`) are copied into a leaf on a hinge at its front edge, which swings; where the door stood, the shell is marked and cleared the
 *    same way and filled with the dark of the cabin, so the opening shows the inside, the seats and the person stepping in.
 * The kit's cars have real glass (transparent) and no rear leaf: they get a door made of two boxes (the panel in the body's paint, a dark window)
 * and the same opening. The renderer needs a stencil buffer (src/main.ts).
 * Cost while it is on: 3 draw calls per glazed part, 4 to 6 while the door is open; nothing at all for any other car.
 */
export const ORDER = { mark: 5, clear: 6, inside: 7, leaf: 8, tint: 9 } as const;

/** The rear doors of each body (both sides alike): their front and rear edges (z) and their lower edge (y), on the panel seams of the authored bodies. */
const REAR_DOOR: Record<string, { z0: number; z1: number; y0: number }> = {
  teranga: { z0: -1.02, z1: -0.36, y0: 0.42 },
  rafet: { z0: -0.98, z1: -0.35, y0: 0.32 },
  lamane: { z0: -0.98, z1: -0.12, y0: 0.47 },
  gainde: { z0: -1.0, z1: -0.2, y0: 0.47 },
  compacte: { z0: -0.95, z1: -0.26, y0: 0.42 },
};
/** How far the rear door swings open (rad). */
export const REAR_OPEN = 1.05;

// ------------------------------------------------------------------------------------------------ materials (shared)
let mats: { mark: THREE.Material; clear: THREE.Material; fill: THREE.Material; card: THREE.Material; pane: THREE.Material } | null = null;
const stencilEq = { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp };
function materials() {
  if (mats) return mats;
  const mark = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.ReplaceStencilOp });
  const clear = new THREE.ShaderMaterial({
    vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'void main() { gl_FragDepth = 1.0; gl_FragColor = vec4(0.0); }',
    colorWrite: false, depthWrite: true, depthFunc: THREE.AlwaysDepth, ...stencilEq,
  });
  const fill = new THREE.MeshBasicMaterial({ color: 0x141517, depthWrite: false, depthFunc: THREE.AlwaysDepth, ...stencilEq });
  const card = new THREE.MeshLambertMaterial({ color: 0x55575c });            // a door's inner trim
  const pane = new THREE.MeshLambertMaterial({ color: 0x1b2631, transparent: true, opacity: 0.55, depthWrite: false });
  for (const m of [mark, clear, fill, card, pane]) m.userData.shared = true;
  return (mats = { mark, clear, fill, card, pane });
}
const tints = new Map<THREE.Texture, THREE.Material>();
const tintOf = (map: THREE.Texture) => {
  let m = tints.get(map);
  if (!m) { m = new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0.3, depthWrite: false }); m.userData.shared = true; tints.set(map, m); }
  return m;
};

// ------------------------------------------------------------------------------------------------ geometry taken from a body (cached per source geometry)
const GLASS = { u0: 256 / 1024, u1: 384 / 1024, v0: 0, v1: 128 / 1024 };                 // the atlas cell (2, 0); glTF uvs run down the image
const subCache = new WeakMap<THREE.BufferGeometry, Map<string, THREE.BufferGeometry | null>>();
/** The triangles of `g` that pass `keep` (centroid, face normal, uv of each corner or null), as a plain non-indexed geometry with the same attributes. */
function facesOf(g: THREE.BufferGeometry, key: string, keep: (c: THREE.Vector3, n: THREE.Vector3, uv: (i: number) => [number, number] | null, idx: number[]) => boolean): THREE.BufferGeometry | null {
  let per = subCache.get(g); if (!per) { per = new Map(); subCache.set(g, per); }
  if (per.has(key)) return per.get(key)!;
  const pos = g.getAttribute('position'), uvA = g.getAttribute('uv'), index = g.getIndex(), n = index ? index.count : pos.count;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), cen = new THREE.Vector3(), nor = new THREE.Vector3(), e = new THREE.Vector3();
  const vi = (k: number) => (index ? index.getX(k) : k), uv = (i: number): [number, number] | null => (uvA ? [uvA.getX(i), uvA.getY(i)] : null);
  const picked: number[] = [];
  for (let t = 0; t + 2 < n; t += 3) {
    const ids = [vi(t), vi(t + 1), vi(t + 2)];
    a.fromBufferAttribute(pos, ids[0]); b.fromBufferAttribute(pos, ids[1]); c.fromBufferAttribute(pos, ids[2]);
    cen.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    nor.subVectors(c, b).cross(e.subVectors(a, b)).normalize();
    if (keep(cen, nor, uv, ids)) picked.push(...ids);
  }
  let out: THREE.BufferGeometry | null = null;
  if (picked.length) {
    out = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(g.attributes)) {
      const s = attr.itemSize, arr = new Float32Array(picked.length * s);
      picked.forEach((v, j) => { for (let q = 0; q < s; q++) arr[j * s + q] = q === 0 ? attr.getX(v) : q === 1 ? attr.getY(v) : q === 2 ? attr.getZ(v) : attr.getW(v); });
      out.setAttribute(name, new THREE.BufferAttribute(arr, s));
    }
    out.computeBoundingSphere();
  }
  per.set(key, out);
  return out;
}
const inGlass = (uv: (i: number) => [number, number] | null, ids: number[]) => ids.every(i => { const p = uv(i); return !!p && p[0] > GLASS.u0 && p[0] < GLASS.u1 && p[1] > GLASS.v0 && p[1] < GLASS.v1; });

/** A copy of `g` pushed `d` metres along minus its normals (inward), its faces turned the other way: the inside of a leaf. */
function innerOf(g: THREE.BufferGeometry, d: number): THREE.BufferGeometry {
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), out = new THREE.BufferGeometry(), n = pos.count;
  const p = new Float32Array(n * 3), q = new Float32Array(n * 3), v = new THREE.Vector3(), m = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) for (const [j, k] of [[0, 0], [1, 2], [2, 1]]) {          // corners 1 and 2 swapped: the face turns over
    v.fromBufferAttribute(pos, i + k); m.fromBufferAttribute(nor, i + k).normalize();
    p.set([v.x - m.x * d, v.y - m.y * d, v.z - m.z * d], (i + j) * 3); q.set([-m.x, -m.y, -m.z], (i + j) * 3);
  }
  out.setAttribute('position', new THREE.BufferAttribute(p, 3)); out.setAttribute('normal', new THREE.BufferAttribute(q, 3));
  return out;
}

// ------------------------------------------------------------------------------------------------ one car
/** A rear door: its leaf on its hinge, the meshes that open the shell where it stood. `side`: −1 the right (−x, the pavement when driving on the right), 1 the left. */
interface Door { side: -1 | 1; pivot: THREE.Object3D; hole: THREE.Mesh[] }
interface Rig {
  /** The model these meshes were added to (a model swap — the ridden flag, a new paint — builds them again on the new one). */
  model: THREE.Object3D;
  glass: THREE.Mesh[];
  cabin: THREE.Object3D | null;
  doors: Door[];
}
interface State { holders: Set<string>; doorK: number; doorSide: -1 | 1; rig: Rig | null; eye: boolean }
const states = new WeakMap<THREE.Object3D, State>();
const stateOf = (body: THREE.Object3D) => { let s = states.get(body); if (!s) { s = { holders: new Set(), doorK: 0, doorSide: -1, rig: null, eye: false }; states.set(body, s); } return s; };

/** The car's model under its body group (the kit's or the authored one), and the part of it drawn near the camera. */
function modelOf(body: THREE.Object3D): THREE.Object3D | null { return body.children.find(c => c.userData.vehicleSpec) ?? null; }
function nearOf(model: THREE.Object3D): THREE.Object3D {
  const lod = model.getObjectByName('glb_lod') ?? model.getObjectByName('lod');
  return (lod as THREE.LOD | undefined)?.levels?.[0]?.object ?? model;
}
/** The authored body's id (`glb_teranga` → teranga), or null for a kit model. */
const glbId = (model: THREE.Object3D) => (model.name.startsWith('glb_') ? model.name.slice(4) : null);
/** The meshes of a body node (not its driver's door, not its cabin, not the wheels). */
function partsOf(near: THREE.Object3D, node: string): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  near.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    let p: THREE.Object3D | null = m;
    while (p && p !== near && !['body', 'door', 'cabin'].includes(p.name) && !/^axle_/.test(p.name)) p = p.parent;
    if (p && p.name === node) out.push(m);
  });
  return out;
}
const overlay = (geo: THREE.BufferGeometry, mat: THREE.Material, order: number, name: string) => {
  const m = new THREE.Mesh(geo, mat); m.renderOrder = order; m.name = name; m.castShadow = false; m.userData.cabinView = true; return m;
};

function build(model: THREE.Object3D): Rig {
  const M = materials(), near = nearOf(model), id = glbId(model), rig: Rig = { model, glass: [], cabin: null, doors: [] };
  if (id) {
    // the glass: of the shell and of the driver's door (it swings with it)
    for (const node of ['body', 'door']) for (const src of partsOf(near, node)) {
      const mat = src.material as THREE.MeshLambertMaterial, map = mat.map; if (!map || mat.name !== 'trim') continue;   // the authored atlas only (a scanned body's texture has no glass cell)
      const g = facesOf(src.geometry, 'glass', (_c, _n, uv, ids) => inGlass(uv, ids)); if (!g) continue;
      const parts = [overlay(g, M.mark, ORDER.mark, 'glass_mark'), overlay(g, M.clear, ORDER.clear, 'glass_clear'), overlay(g, tintOf(map), ORDER.tint, 'glass_tint')];
      src.add(...parts); rig.glass.push(...parts);
    }
    rig.cabin = near.getObjectByName('cabin') ?? null;
  }
  return rig;
}

/** A rear door of the car (`side` −1 right, 1 left), built the first time it is opened. */
function buildDoor(rig: Rig, side: -1 | 1, spec: { width: number } | null): Door | null {
  const M = materials(), near = nearOf(rig.model), id = glbId(rig.model), box = id ? REAR_DOOR[id] : null;
  const pivot = new THREE.Group(); pivot.name = `rear_door_${side < 0 ? 'r' : 'l'}`; const hole: THREE.Mesh[] = [];
  if (box) {
    // the authored shell's faces inside the door's outline, facing out on that side: its paint, its glass, its seams and its handle
    let hx = 0;
    const leafParts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
    for (const src of partsOf(near, 'body')) {
      const g = facesOf(src.geometry, `rear:${side}:${box.z0}:${box.z1}:${box.y0}`, (c, n) => c.x * side > 0.2 && n.x * side > 0.3 && c.z > box.z0 && c.z < box.z1 && c.y > box.y0);
      if (!g) continue;
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) if (p.getZ(i) > box.z1 - 0.06 && p.getY(i) < 1.0 && Math.abs(p.getX(i)) > Math.abs(hx)) hx = p.getX(i);
      leafParts.push({ geo: g, mat: src.material as THREE.Material });
      hole.push(overlay(g, M.mark, ORDER.mark, 'door_mark'), overlay(g, M.clear, ORDER.clear, 'door_clear'), overlay(g, M.fill, ORDER.clear, 'door_fill'));
    }
    pivot.position.set(hx, 0, box.z1);
    for (const { geo, mat } of leafParts) {
      const outer = new THREE.Mesh(geo, mat), inner = new THREE.Mesh(innerOf(geo, 0.035), M.card);
      for (const m of [outer, inner]) { m.position.set(-hx, 0, -box.z1); m.renderOrder = ORDER.leaf; m.castShadow = true; m.userData.cabinView = true; pivot.add(m); }
      inner.userData.own = true;
    }
  } else if (spec) {
    // a kit car: the door drawn as a panel in the body's paint under a dark window, the opening as a quad on the side
    const vs = rig.model.userData.vehicleSpec as { colors?: { body: number }; doors?: { id: string; z: number; y: number; height: number; width: number; x: number }[] } | undefined;
    const d = vs?.doors?.find(x => x.id === (side < 0 ? 'rr' : 'rl')); if (!d) return null;
    const z0 = d.z - d.width / 2 - 0.05, z1 = d.z + d.width / 2 - 0.05, y0 = d.y + 0.02, belt = d.y + d.height * 0.52, top = d.y + d.height - 0.04, x = side * (spec.width / 2 + 0.004);
    const quad = new THREE.PlaneGeometry(z1 - z0, belt - y0); quad.rotateY(side * Math.PI / 2); quad.translate(x, (belt + y0) / 2, (z0 + z1) / 2);
    hole.push(overlay(quad, M.mark, ORDER.mark, 'door_mark'), overlay(quad, M.clear, ORDER.clear, 'door_clear'), overlay(quad, M.fill, ORDER.clear, 'door_fill'));
    const paint = new THREE.MeshLambertMaterial({ color: vs?.colors?.body ?? 0x888888 }); paint.userData.own = true;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.05, belt - y0, z1 - z0), paint); panel.position.set(0, (belt + y0) / 2, -(z1 - z0) / 2);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.02, top - belt, z1 - z0 - 0.06), M.pane); win.position.set(-side * 0.02, (top + belt) / 2, -(z1 - z0) / 2);
    for (const m of [panel, win]) { m.renderOrder = ORDER.leaf; m.userData.cabinView = true; m.userData.own = true; pivot.add(m); }
    pivot.position.set(x - side * 0.025, 0, z1);
  } else return null;
  for (const h of hole) h.visible = false;
  pivot.visible = false;
  near.add(pivot, ...hole);
  return { side, pivot, hole };
}

function drop(rig: Rig) {
  for (const m of rig.glass) m.removeFromParent();
  for (const door of rig.doors) {
    for (const m of [door.pivot, ...door.hole]) m.removeFromParent();
    door.pivot.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh || !m.userData.own) return; m.geometry.dispose(); if (!(m.material as THREE.Material).userData.shared) (m.material as THREE.Material).dispose(); });
    for (const h of door.hole) if (h.geometry.type === 'PlaneGeometry') h.geometry.dispose();
  }
  if (rig.cabin) { rig.cabin.traverse(o => { o.renderOrder = 0; }); rig.cabin.visible = ((rig.model.userData.kitDoor as THREE.Object3D | undefined)?.rotation.y ?? 0) !== 0; }   // as the driver's door has it
}

/**
 * Each frame for a car someone rides in (the VTC module, the owned car at the wheel): the see-through glass while anyone `holds` it, the rear door at
 * `doorK` (0 shut … 1 open), rebuilt on a new model. `spec`: the car's VehicleSpec (its width, for a kit car's door).
 */
export function cabinView(body: THREE.Object3D, spec: { width: number; seats: { id: string; z: number; y: number }[] } | null) {
  const st = stateOf(body), model = modelOf(body);
  const want = st.holders.size > 0 || st.doorK > 0;
  if (st.rig && (!want || st.rig.model !== model || !model?.parent)) { drop(st.rig); st.rig = null; }
  if (!want || !model) return;
  if (!st.rig) st.rig = build(model);
  // the camera at the wheel (`eyeInside`): the body's own cabin — its seats, the driver's among them, and its lining — is the street's view of the
  // inside; seen from the driver's eye its seat back stood in front of the windscreen (a black wall over the road, 24 Oct playtest). The car's
  // interior (src/transport/carInterior.ts) stands in for it there, and the see-through glass is for eyes outside.
  const rig = st.rig, see = st.holders.size > 0 && !st.eye;
  for (const m of rig.glass) m.visible = see;
  if (rig.cabin) {
    const show = !st.eye && (see || st.doorK > 0 || ((model.userData.kitDoor as THREE.Object3D | undefined)?.rotation.y ?? 0) !== 0);
    rig.cabin.visible = show;
    if (rig.cabin.renderOrder !== ORDER.inside) rig.cabin.traverse(o => { o.renderOrder = ORDER.inside; });
  }
  if (st.doorK > 0 && !rig.doors.some(d => d.side === st.doorSide)) { const d = buildDoor(rig, st.doorSide, spec); if (d) rig.doors.push(d); }
  for (const d of rig.doors) {
    const k = d.side === st.doorSide ? st.doorK : 0, open = k > 0.002;
    d.pivot.visible = open; for (const h of d.hole) h.visible = open;
    d.pivot.rotation.y = -d.side * REAR_OPEN * k;                                   // the leaf's tail swings out on its own side
  }
}
/** The camera is at the wheel of this car (« Au volant »): its own cabin and see-through glass are not drawn (cabinView). */
export function eyeInside(body: THREE.Object3D, on: boolean) { const st = states.get(body); if (on) stateOf(body).eye = true; else if (st) st.eye = false; }
/** `who` holds the glass of this car see-through (or lets go). */
export function holdCabin(body: THREE.Object3D, who: string, on: boolean) { const st = stateOf(body); if (on) st.holders.add(who); else st.holders.delete(who); }
/** A rear door (`side` −1 right, 1 left): 0 shut … 1 open (eased by the caller). One rear door is open at a time. */
export function setRearDoor(body: THREE.Object3D, k: number, side: -1 | 1 = -1) { const st = stateOf(body); st.doorK = Math.max(0, Math.min(1, k)); st.doorSide = side; }
/**
 * Where a rear door is, in the car's frame: its front (hinge) and rear edges along z and how far out the body's side is there (`out`: |x| of the skin
 * at the door). The person getting in stands off it; the authored bodies' doors are on their seams, a kit car's at its spec's rear doors.
 */
export function rearDoorBox(body: THREE.Object3D, spec: { width: number }): { z0: number; z1: number; out: number } {
  const m = modelOf(body), id = m ? glbId(m) : null, box = id ? REAR_DOOR[id] : null;
  if (box) return { z0: box.z0, z1: box.z1, out: spec.width / 2 };
  const d = (m?.userData.vehicleSpec as { doors?: { id: string; z: number; width: number }[] } | undefined)?.doors?.find(x => x.id === 'rr');
  return d ? { z0: d.z - d.width / 2 - 0.05, z1: d.z + d.width / 2 - 0.05, out: spec.width / 2 } : { z0: -1.0, z1: -0.3, out: spec.width / 2 };
}
/** Whether this car's glass can be seen through (an authored body with painted glass, or a kit car with real glass). */
export function seeThroughOk(body: THREE.Object3D): boolean {
  const m = modelOf(body); if (!m) return false;
  const st = stateOf(body); if (st.rig && st.rig.model === m && glbId(m)) return st.rig.glass.length > 0;
  return !glbId(m) || glbId(m) !== 'compacte';
}
/** People drawn after the cleared glass (render order 7) while they sit in a car, back to the ordinary order after. */
export function sitterOrder(o: THREE.Object3D, inCar: boolean) {
  const k = inCar ? ORDER.inside : 0;
  o.traverse(c => { if ((c as THREE.Mesh).isMesh && c.renderOrder !== k) c.renderOrder = k; });
}
/** Checks: what is drawn for this car now. */
export function cabinInfo(body: THREE.Object3D) {
  const st = states.get(body), r = st?.rig;
  return { holders: st ? [...st.holders] : [], eyeInside: !!st?.eye, doorK: st?.doorK ?? 0, doorSide: st?.doorSide ?? -1, glass: r ? r.glass.length / 3 : 0, glassOn: !!r?.glass[0]?.visible, cabin: !!r?.cabin?.visible, doors: r?.doors.length ?? 0, doorOpen: !!r?.doors.some(d => d.pivot.visible), leafTris: r?.doors.reduce((n, d) => { let k = 0; d.pivot.traverse(o => { const g = (o as THREE.Mesh).geometry; if (g) k += g.getAttribute('position').count / 3; }); return n + k; }, 0) ?? 0 };
}
