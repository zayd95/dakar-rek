import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Crowd level of detail (docs/NPC_LIFE.md, « density budget »). Every animated humanoid costs about ten draw calls
 * (body, five head parts, hair, clothes, shoes) and as many again in the shadow pass, so the street keeps only the
 * nearest few as full animated bodies; the others become one cheap instanced figure each (one draw call for all of them,
 * standing or seated), and the farthest are not drawn.
 *
 *  - `cullHumanoid` lets the renderer skip a humanoid outside the camera (and the shadow camera) with a bounding sphere
 *    around the body (the GLB's meshes are left un-culled by default).
 *  - `Impostors` draws the far figures.
 *  - `ForeignBodies` finds the humanoids other systems put in the hub group (walkers, placed people, the cast,
 *    apprentices, monument life) so the same budget covers them: beyond it their skinned body is hidden (their owner
 *    keeps simulating them) and a figure stands in. Mark an object `userData.noLod = true` to keep it out.
 */

/** Around a standing or seated body, in its group's space (the GLB meshes have identity transforms in the group). */
const BODY_SPHERE = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.35);

export function cullHumanoid(group: THREE.Object3D) {
  group.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.frustumCulled = true;
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) (m as THREE.SkinnedMesh).boundingSphere = BODY_SPHERE;
  });
}

// ------------------------------------------------------------------ far figures
const TROUSERS = 0x31353d, SKIN = 0x4e2e1c;
function figure(seated: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y0: number, z: number, hex: number) => {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y0 + h / 2, z);
    const c = new THREE.Color(hex), n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(g);
  };
  const W = 0xffffff;                                                       // white = takes the instance colour
  if (!seated) {
    for (const sx of [-1, 1]) box(0.15, 0.84, 0.17, sx * 0.095, 0, 0, TROUSERS);
    box(0.44, 0.68, 0.25, 0, 0.82, 0, W);
    for (const sx of [-1, 1]) box(0.11, 0.62, 0.13, sx * 0.28, 0.86, 0, W);
    box(0.2, 0.27, 0.22, 0, 1.5, 0.01, SKIN);
  } else {
    for (const sx of [-1, 1]) { box(0.15, 0.48, 0.15, sx * 0.095, 0, 0.42, TROUSERS); box(0.15, 0.15, 0.5, sx * 0.095, 0.42, 0.2, TROUSERS); }
    box(0.44, 0.62, 0.25, 0, 0.5, -0.03, W);
    for (const sx of [-1, 1]) box(0.11, 0.56, 0.13, sx * 0.28, 0.56, 0.02, W);
    box(0.2, 0.27, 0.22, 0, 1.12, -0.02, SKIN);
  }
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}

let impostorMat: THREE.MeshLambertMaterial | null = null;
function material() {
  if (impostorMat) return impostorMat;
  impostorMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  // white vertices take the instance colour (clothes), the others keep their own (trousers, skin)
  impostorMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
      vColor.xyz = ( color.r > 0.99 && color.g > 0.99 && color.b > 0.99 ) ? instanceColor.xyz : color.xyz;
#endif`);
  };
  impostorMat.customProgramCacheKey = () => 'dakar-impostor-v1';
  return impostorMat;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

/** Instanced far figures: one mesh standing, one seated. Fill between begin() and end() every frame. */
export class Impostors {
  readonly group = new THREE.Group();
  private stand: THREE.InstancedMesh;
  private sit: THREE.InstancedMesh;
  private ns = 0; private nt = 0;
  constructor(readonly max: number, shadows: boolean) {
    const mk = (seated: boolean) => {
      const m = new THREE.InstancedMesh(figure(seated), material(), max);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color(0xffffff)); m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;                       // instances move every frame: no stale bounding sphere
      m.castShadow = shadows; m.count = 0; m.name = seated ? 'impostors_seated' : 'impostors_standing';
      this.group.add(m); return m;
    };
    this.stand = mk(false); this.sit = mk(true);
  }
  get count() { return this.ns + this.nt; }
  begin() { this.ns = 0; this.nt = 0; }
  /** A figure from a world matrix (another system's body). */
  addMatrix(m: THREE.Matrix4, color: THREE.Color, seated: boolean) {
    const mesh = seated ? this.sit : this.stand, i = seated ? this.nt : this.ns;
    if (i >= this.max) return;
    mesh.setMatrixAt(i, m); mesh.setColorAt(i, color);
    if (seated) this.nt++; else this.ns++;
  }
  /** A figure at a position and facing. */
  add(x: number, y: number, z: number, yaw: number, scale: number, color: THREE.Color, seated: boolean) {
    _p.set(x, y, z); _q.setFromAxisAngle(_up, yaw); _s.setScalar(scale);
    this.addMatrix(_m.compose(_p, _q, _s), color, seated);
  }
  end() {
    for (const [m, n] of [[this.stand, this.ns], [this.sit, this.nt]] as const) {
      m.count = n;
      if (n) { m.instanceMatrix.needsUpdate = true; m.instanceColor!.needsUpdate = true; }
    }
  }
  setShadows(on: boolean) { this.stand.castShadow = on; this.sit.castShadow = on; }
  dispose() { for (const m of [this.stand, this.sit]) { m.geometry.dispose(); m.dispose(); } this.group.removeFromParent(); }
}

// ------------------------------------------------------------------ other systems' bodies
export interface Foreign {
  g: THREE.Object3D;
  /** The skinned scene under the group: hidden when the body is beyond the budget. */
  root: THREE.Object3D;
  head: THREE.Object3D | null;
  color: THREE.Color;
  /** Ranking factor (< 1: kept as a full body farther away, e.g. the recurring cast). */
  prio: number;
  /** 0 hidden, 1 far figure, 2 full body. */
  lod: 0 | 1 | 2;
  d: number;
}

const CLOTH_TOP = ['Cloth_Tee', 'Cloth_Boubou', 'Cloth_DressTop', 'Ngemb_A', 'Ngemb_B'];
const FALLBACK = new THREE.Color(0xb59a74);
function clothColour(g: THREE.Object3D): THREE.Color {
  let c: THREE.Color | null = null;
  g.traverse(o => {
    const m = o as THREE.Mesh;
    if (c || !m.isMesh || !m.visible || !CLOTH_TOP.some(n => m.name.startsWith(n))) return;
    const mat = m.material as THREE.MeshLambertMaterial;
    if (mat?.color && !(mat.color.r > 0.98 && mat.color.g > 0.98 && mat.color.b > 0.98 && mat.map)) c = mat.color.clone();
  });
  return c ?? FALLBACK.clone();
}

/** Visible as far as its owner is concerned (the group and every parent up to the scene). */
export function ownerVisible(o: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

export class ForeignBodies {
  readonly list: Foreign[] = [];
  private known = new Map<THREE.Object3D, Foreign>();
  private seen = new Set<THREE.Object3D>();

  /** Finds the humanoid bodies under `root` (the hub group of other systems), keeping the state of those already known. */
  scan(root: THREE.Object3D, prioOf: (g: THREE.Object3D) => number) {
    const seen = this.seen; seen.clear();
    const walk = (o: THREE.Object3D) => {
      if (o.userData.noLod) return;
      if (o.name === 'humanoid_v2') {
        seen.add(o);
        const known = this.known.get(o);
        if (!known) this.adopt(o, prioOf(o)); else known.prio = prioOf(o);           // owners may change it (featured people)
        return;
      }
      for (const c of o.children) walk(c);
    };
    walk(root);
    for (const [g, f] of this.known) if (!seen.has(g)) { f.root.visible = true; this.known.delete(g); }
    this.list.length = 0;
    for (const f of this.known.values()) this.list.push(f);
  }

  private adopt(g: THREE.Object3D, prio: number) {
    const root = g.children.find(c => c.name === 'Scene') ?? g.children[0];
    if (!root) return;
    cullHumanoid(g);
    this.known.set(g, { g, root, head: g.getObjectByName('head') ?? null, color: clothColour(g), prio, lod: 2, d: 0 });
  }

  /** Seated (or crouched): the head is much lower than standing. Matrices are those of the last rendered frame. */
  seated(f: Foreign) {
    if (!f.head) return false;
    return f.head.matrixWorld.elements[13] - f.g.matrixWorld.elements[13] < 1.3;
  }

  /** Give every body back to its owner (scene, hub change, LOD off). */
  restore() { for (const f of this.known.values()) { f.root.visible = true; f.lod = 2; } }
  clear() { this.restore(); this.known.clear(); this.list.length = 0; }
}
