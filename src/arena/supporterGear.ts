import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clothMat, type Humanoid } from '../actors/humanoid';
import { ECURIE_LOOK } from '../crowd/looks';
import { SECTION_SIDE } from '../crowd/arenaStands';
import type { FanItem, FanPresence, FanSide } from '../multiplayer/protocol';
import type { Moment } from './program';

/**
 * A supporter's colours on a body (the player's, another player's avatar): pure rules and one function that dresses a
 * humanoid of the kit, with no new humanoid mesh —
 *   - the tee: the body's own tee in the écurie's colour, striped with its accent;
 *   - the cap: the body's own cap (the kufi mesh) in the two colours, over the hair;
 *   - the scarf: round the neck, one end on the chest; the small flag: in the right hand, up with the arms when they go
 *     up (one small mesh each, placed on the neck socket or the hand every frame like the exterior's fans).
 * The écuries' colours are the stands' (src/crowd/looks.ts ECURIE_LOOK): Baobab green and yellow on the left side
 * (sections B–C), Teranga red and white on the right one (F–G).
 */
export type Ecurie = Exclude<FanSide, 'none'>;
const SIDE_OF: Record<Ecurie, 'left' | 'right'> = { baobab: 'left', teranga: 'right' };
/** The écurie's main colour and its accent. */
export const gearColours = (e: Ecurie) => ({ main: ECURIE_LOOK[SIDE_OF[e]].main, accent: ECURIE_LOOK[SIDE_OF[e]].accent });
/** The stands' side of an écurie (src/crowd/arenaStands.ts: 'left' B–C, 'right' F–G). */
export const sideOfEcurie = (e: Ecurie) => SIDE_OF[e];
/** The écurie whose supporters sit in a section of the stands (B–C Baobab, F–G Teranga; the others are mixed). */
export function sectionEcurie(section: string | null | undefined): Ecurie | null {
  const side = section ? SECTION_SIDE[section] : undefined;
  return side === 'left' ? 'baobab' : side === 'right' ? 'teranga' : null;
}
/** « Encourager » makes the neighbours answer: on a place of the stands in one's own écurie's section, wearing its colours. */
export function answersCheer(fan: FanPresence | null, seat: { kind: string; section?: string | null } | null): boolean {
  return !!fan && fan.e !== 'none' && !!seat && seat.kind === 'stand' && sectionEcurie(seat.section) === fan.e;
}
/**
 * The crowd's moments that lift a supporter's flag (with the arms) on a place in the stands: their wrestler walking in,
 * their wrestler throwing the other, their wrestler winning. `side`: the wrestler concerned (the winner for a fall).
 */
export function raisesFlag(fan: FanPresence | null, moment: Moment, side: 'left' | 'right' | null): boolean {
  if (!fan || fan.e === 'none' || fan.k !== 'flag' || !side) return false;
  return (moment === 'entrance' || moment === 'fall' || moment === 'result') && sideOfEcurie(fan.e) === side;
}

// ------------------------------------------------------------------ geometry (shared with the exterior's fans)
const paint = (g: THREE.BufferGeometry, hex: number) => {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
/** Supporter's scarf: round the neck, one end on the chest (white by default: an instance colour gives the écurie's). */
export function scarfGeometry(main = 0xffffff, accent = main) {
  const ring = new THREE.TorusGeometry(0.1, 0.03, 5, 14); ring.rotateX(Math.PI / 2);
  const tail = new THREE.BoxGeometry(0.08, 0.32, 0.016); tail.translate(0.05, -0.17, 0.1);
  const fringe = new THREE.BoxGeometry(0.082, 0.05, 0.018); fringe.translate(0.05, -0.31, 0.1);   // the end in the accent colour
  return mergeGeometries([paint(ring.toNonIndexed(), main), paint(tail.toNonIndexed(), main), paint(fringe.toNonIndexed(), accent)])!;
}
/** Small hand flag: a stick held at the grip (origin) and a cloth at the top (a band in the accent colour). */
export function flagGeometry(cloth = 0xffffff, band = cloth) {
  const stick = new THREE.BoxGeometry(0.022, 0.8, 0.022); stick.translate(0, 0.3, 0);
  const top = new THREE.BoxGeometry(0.36, 0.16, 0.012); top.translate(0.19, 0.62, 0);
  const low = new THREE.BoxGeometry(0.36, 0.08, 0.012); low.translate(0.19, 0.5, 0);
  return mergeGeometries([paint(stick.toNonIndexed(), 0x4a3a2a), paint(top.toNonIndexed(), cloth), paint(low.toNonIndexed(), band)])!;
}
const shared = new Map<string, THREE.BufferGeometry>();
const geometryOf = (e: Ecurie, k: 'scarf' | 'flag') => {
  const key = `${e}:${k}`;
  let g = shared.get(key);
  if (!g) { const c = gearColours(e); g = k === 'scarf' ? scarfGeometry(c.main, c.accent) : flagGeometry(c.main, c.accent); shared.set(key, g); }
  return g;
};

// ------------------------------------------------------------------ dressing a body
interface Dressed {
  key: string;
  mesh: THREE.Mesh | null; node: THREE.Object3D | null; item: FanItem | null;
  /** Garments recoloured, with what they wore before. */
  cloth: { mesh: THREE.Mesh; was: THREE.Material | THREE.Material[]; mine: THREE.Material }[];
  /** Hair hidden under the cap, with its visibility before. */
  hair: { mesh: THREE.Object3D; was: boolean }[];
  kufiWas: boolean;
}
const dressed = new WeakMap<Humanoid, Dressed>();
const P = new THREE.Vector3();
const named = (body: Humanoid, prefix: string) => { const out: THREE.Mesh[] = []; body.group.traverse(o => { if ((o as THREE.Mesh).isMesh && o.name.startsWith(prefix)) out.push(o as THREE.Mesh); }); return out; };
export const fanKey = (fan: FanPresence | null | undefined) => (fan && fan.e !== 'none' ? `${fan.e}:${fan.k}` : '');

function undress(body: Humanoid, d: Dressed | undefined) {
  if (!d) return;
  if (d.mesh) { d.mesh.removeFromParent(); (d.mesh.material as THREE.Material).dispose(); }
  for (const c of d.cloth) { if (c.mesh.material === c.mine) c.mesh.material = c.was; c.mine.dispose(); }
  for (const h of d.hair) h.mesh.visible = h.was;
  const kufi = named(body, 'Cloth_Kufi');
  if (d.item === 'cap') for (const k of kufi) k.visible = d.kufiWas;
  dressed.delete(body);
}
/** Whether a body still shows what it was dressed in (a new look may have replaced the garments since). */
function intact(body: Humanoid, d: Dressed): boolean {
  if (d.mesh && d.mesh.parent !== body.group) return false;
  if (d.cloth.some(c => c.mesh.material !== c.mine)) return false;
  if (d.item === 'cap' && named(body, 'Cloth_Kufi').some(k => !k.visible)) return false;
  return true;
}

/**
 * Dress a humanoid in a supporter's colours (null or 'none': as it was), and place the scarf or the flag for this frame.
 * Call it every frame for a drawn body: changing nothing is cheap. Returns the key of what it wears ('' for nothing).
 */
export function dressFan(body: Humanoid, fan: FanPresence | null | undefined): string {
  const key = fanKey(fan);
  let d = dressed.get(body);
  if (d && (d.key !== key || !intact(body, d))) { undress(body, d); d = undefined; }
  if (!d && key) {
    const e = fan!.e as Ecurie, k = fan!.k, c = gearColours(e);
    d = { key, mesh: null, node: null, item: k, cloth: [], hair: [], kufiWas: false };
    if (k === 'tee') for (const m of named(body, 'Cloth_Tee')) { const mine = clothMat(c.main, 'rayure', c.accent); d.cloth.push({ mesh: m, was: m.material, mine }); m.material = mine; }
    if (k === 'cap') {
      for (const m of named(body, 'Cloth_Kufi')) { d.kufiWas = m.visible; const mine = clothMat(c.main, 'rayure', c.accent); d.cloth.push({ mesh: m, was: m.material, mine }); m.material = mine; m.visible = true; }
      for (const m of [...named(body, 'Hair_Short'), ...named(body, 'Hair_Puff')]) { d.hair.push({ mesh: m, was: m.visible }); m.visible = false; }
    }
    if (k === 'scarf' || k === 'flag') {
      const mesh = new THREE.Mesh(geometryOf(e, k), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      mesh.name = `fan_${k}`; mesh.castShadow = false; mesh.frustumCulled = false;
      body.group.add(mesh); d.mesh = mesh;
      d.node = body.group.getObjectByName(k === 'scarf' ? 'socket_neck' : 'handR') ?? null;
    }
    dressed.set(body, d);
  }
  if (d?.mesh) {
    // where the neck or the hand is this frame, in the body's own frame (the arms raise the flag)
    if (d.node) { d.node.updateWorldMatrix(true, false); d.node.getWorldPosition(P); body.group.updateWorldMatrix(true, false); body.group.worldToLocal(P); }
    else P.set(d.item === 'flag' ? -0.22 : 0, d.item === 'flag' ? 1.0 : 1.45, 0);
    if (d.item === 'scarf') { d.mesh.position.set(P.x, P.y - 0.03, P.z); d.mesh.rotation.set(0, 0, 0); }
    else { d.mesh.position.copy(P); d.mesh.rotation.set(0, Math.PI / 2, 0.15); }
  }
  body.group.userData.fan = key || null;
  return key;
}
