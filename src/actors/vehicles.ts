import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Batch } from '../world/batch';

const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c });
function bx(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m;
}

/**
 * Blender-made vehicles (public/assets/car_rapide.glb, sedan.glb; source assets-src/vehicles_v1.blend), loaded at
 * start-up. Each GLB is flattened into one geometry with baked colours (material colour × baked AO) so a vehicle
 * costs one draw call. Sedans keep their paint in a second group so taxis and private cars share one model.
 */
let rapideTemplate: THREE.BufferGeometry | null = null;
let sedanTaxi: { baked: THREE.BufferGeometry; paint: THREE.BufferGeometry } | null = null;
let sedanPrivate: { baked: THREE.BufferGeometry; paint: THREE.BufferGeometry } | null = null;
export const assetStatus = { carRapide: 'TEMP procedural' as 'TEMP procedural' | 'Blender GLB', sedan: 'TEMP procedural' as 'TEMP procedural' | 'Blender GLB' };

async function loadGlb(url: string): Promise<THREE.Object3D | null> {
  try {
    const res = await fetch(url); if (!res.ok) return null;
    return (await new GLTFLoader().parseAsync(await res.arrayBuffer(), '')).scene;
  } catch { return null; }
}
/** Colour overrides for the flattened look (no reflections here, so glass and chrome need help to read). */
const TINT: Record<string, number> = { Glass: 0x4b6372, Chrome: 0x9aa1a8, Tyre: 0x2a2a2a };
/** Mesh parts whose material passes `keep`, merged; colour = (white or material colour) × AO. */
function flatten(root: THREE.Object3D, keep: (name: string) => boolean, tintFrom: (name: string) => boolean): THREE.BufferGeometry | null {
  const geos: THREE.BufferGeometry[] = [];
  root.updateMatrixWorld(true);
  root.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial; if (!keep(mat.name)) return;
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    const n = g.attributes.position.count, ao = g.attributes.color as THREE.BufferAttribute | undefined;
    const c = tintFrom(mat.name) ? (TINT[mat.name] ? new THREE.Color(TINT[mat.name]) : mat.color) : new THREE.Color(1, 1, 1);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const a = ao ? ao.getX(i) : 1; col[i * 3] = c.r * a; col[i * 3 + 1] = c.g * a; col[i * 3 + 2] = c.b * a; }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.attributes.position); out.setAttribute('normal', g.attributes.normal);
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (g.index) out.setIndex(g.index);
    geos.push(out.index ? out.toNonIndexed() : out);
  });
  if (!geos.length) return null;
  const merged = mergeGeometries(geos, false); merged?.computeBoundingSphere(); return merged;
}

export async function preloadAssets(base = import.meta.env.BASE_URL): Promise<void> {
  const [rap, sed] = await Promise.all([loadGlb(`${base}assets/car_rapide.glb`), loadGlb(`${base}assets/sedan.glb`)]);
  if (rap) { rapideTemplate = flatten(rap, () => true, () => true); if (rapideTemplate) assetStatus.carRapide = 'Blender GLB'; }
  if (sed) {
    const paintT = (n: string) => n === 'Paint_Body';
    const paintP = (n: string) => n === 'Paint_Body' || n === 'Paint_Accent';
    const bT = flatten(sed, n => !paintT(n), () => true), pT = flatten(sed, paintT, () => false);
    const bP = flatten(sed, n => !paintP(n) && n !== 'TaxiSign', () => true), pP = flatten(sed, paintP, () => false);
    if (bT && pT && bP && pP) { sedanTaxi = { baked: bT, paint: pT }; sedanPrivate = { baked: bP, paint: pP }; assetStatus.sedan = 'Blender GLB'; }
  }
}
const bakedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });
const paintMats = new Map<number, THREE.Material>();
function paintMat(c: number) {
  let m = paintMats.get(c);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: c, vertexColors: true, roughness: 0.35, metalness: 0.1 }); paintMats.set(c, m); }
  return m;
}

/** Shared vertex-coloured material for procedural vehicles (one draw call per vehicle). */
const vehicleMat = new THREE.MeshLambertMaterial({ vertexColors: true });
let rapideGeo: THREE.BufferGeometry | null = null;

/**
 * TEMPORARY procedural car rapide (until car_rapide.glb is modelled in Blender): yellow and blue Saviem-style
 * minibus with a white roof, roof rack and luggage, rear ladder and open rear step, painted bands and
 * decorative panels (no text: lettering stays a separately authored asset). Built once, shared by all.
 */
function carRapideGeometry(): THREE.BufferGeometry {
  if (rapideGeo) return rapideGeo;
  const b = new Batch();
  const Y = 0xf2c230, BL = 0x1e5fb4, W = 0xf4f1e8, D = 0x1d1d1f, GL = 0x23313f, CH = 0xb8bcc0;
  b.box(2.3, 1.15, 6.6, 0, 0.55, 0, Y);                        // lower body
  b.box(2.32, 0.32, 6.62, 0, 1.05, 0, BL);                     // blue belt band
  b.box(2.34, 0.08, 6.64, 0, 1.4, 0, 0xd9322b);                // red pinstripe
  b.box(2.2, 1.0, 5.3, 0, 1.48, -0.55, Y);                     // passenger cabin
  b.box(2.24, 0.62, 5.0, 0, 1.68, -0.6, GL);                   // window row
  for (let k = 0; k < 6; k++) b.box(2.26, 0.62, 0.12, 0, 1.68, -2.9 + k * 0.92, Y); // window pillars
  b.box(2.22, 0.18, 5.4, 0, 2.46, -0.55, W);                   // white roof
  b.box(2.1, 0.9, 1.3, 0, 1.0, 2.75, Y);                       // bonnet
  b.box(2.12, 0.25, 1.32, 0, 1.75, 2.0, W);                    // cab roof
  b.box(2.14, 0.55, 0.1, 0, 1.4, 2.12, GL);                    // windscreen
  b.box(2.2, 0.25, 0.2, 0, 0.45, 3.45, CH);                    // front bumper
  b.box(1.4, 0.4, 0.06, 0, 0.95, 3.42, 0x9aa0a6);              // grille
  for (const sx of [-1, 1]) {
    b.box(0.3, 0.3, 0.05, sx * 0.85, 1.0, 3.42, 0xfff5d0);     // headlights
    b.box(0.05, 0.35, 1.6, sx * 1.17, 0.7, 0.4, sx > 0 ? 0x2f8f4e : 0xd9322b); // painted side panels
    b.box(0.05, 0.35, 1.0, sx * 1.17, 0.7, -2.2, 0xf4f1e8);
    for (const z of [-2.2, 2.4]) { b.cyl(0.45, 0.45, 0.32, sx * 1.02, 0.45, z, D, 12, [0, 0, Math.PI / 2]); b.cyl(0.2, 0.2, 0.34, sx * 1.02, 0.45, z, CH, 8, [0, 0, Math.PI / 2]); }
  }
  b.box(1.9, 0.08, 4.2, 0, 2.62, -0.8, D);                     // roof rack frame
  for (const sx of [-1, 1]) b.box(0.06, 0.25, 4.2, sx * 0.95, 2.6, -0.8, D);
  b.box(1.0, 0.5, 0.8, -0.35, 2.68, -1.6, 0x6b3fa0); b.box(0.7, 0.4, 0.7, 0.4, 2.68, -0.5, 0x8b6a47); b.box(0.9, 0.35, 0.6, 0.1, 2.68, 0.6, 0x1a9d54); // luggage
  b.box(0.5, 2.0, 0.06, 0.7, 0.6, -3.32, D);                   // rear ladder rails
  for (let k = 0; k < 5; k++) b.box(0.5, 0.05, 0.08, 0.7, 0.8 + k * 0.38, -3.33, D);
  b.box(1.0, 0.1, 0.5, -0.4, 0.3, -3.5, CH);                   // rear step (apprentice's perch)
  b.box(0.9, 1.4, 0.05, -0.4, 0.55, -3.31, GL);                // open rear door
  rapideGeo = b.build(vehicleMat, false, false)!.geometry;
  return rapideGeo;
}

/** Car rapide: Blender asset when loaded, otherwise the TEMPORARY procedural placeholder. */
export function makeCarRapide(): THREE.Group {
  const g = new THREE.Group();
  if (rapideTemplate) {
    g.name = 'car_rapide'; const m = new THREE.Mesh(rapideTemplate, bakedMat); m.castShadow = true; m.userData.shared = true; g.add(m); return g;
  }
  g.name = 'TEMP_car_rapide';
  const m = new THREE.Mesh(carRapideGeometry(), vehicleMat); m.castShadow = true; m.userData.shared = true; g.add(m);
  return g;
}

/** Taxi (yellow, black bonnet and roof sign) or private car in `color`; TEMPORARY boxes if the GLB is missing. Visual only: decorative traffic has no gameplay collisions. */
export function makeTaxi(color = 0xf0b800): THREE.Group {
  const taxi = color === 0xf0b800, set = taxi ? sedanTaxi : sedanPrivate;
  if (set) {
    const g = new THREE.Group(); g.name = taxi ? 'taxi' : 'car';
    for (const [geo, mat] of [[set.baked, bakedMat], [set.paint, paintMat(color)]] as const) {
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.userData.shared = true; g.add(m);
    }
    return g;
  }
  const g = new THREE.Group(); g.name = 'TEMP_taxi';
  const body = lam(color), dark = lam(0x1d1d1d), glass = lam(0x4a6b8a);
  g.add(bx(1.9, 0.8, 4.2, 0, 0.7, 0, body)); g.add(bx(1.7, 0.7, 2.2, 0, 1.4, -0.2, body)); g.add(bx(1.72, 0.45, 2.1, 0, 1.45, -0.2, glass));
  for (const sx of [-1, 1]) for (const z of [-1.4, 1.4]) g.add(bx(0.3, 0.7, 0.7, sx * 0.95, 0.35, z, dark));
  return g;
}
