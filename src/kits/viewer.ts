import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ALMADIES_VILLA_PIECES, buildAlmadiesVillaSolo, buildFurnitureLayout, buildPlanShell, type AlmadiesVillaSpec } from './almadiesVilla';
import { setVillaFacadeNight } from '../housing/villaFacade';
import { oakPlanks, stoneTiles, windowView } from '../housing/villaFinish';

/**
 * LD2.0-D round 2, lane R2-E: the Almadies villa kit's viewer (tools/kit-viewer/index.html, built apart from the game by scripts/export-villa-kit.mjs).
 * A page that builds one piece of the kit (src/kits/almadiesVilla.ts) on its own, pictures it for the catalogue (docs/kits/ALMADIES_VILLA_KIT.md),
 * measures what it costs to draw, and hands it back as a GLB file (three's GLTFExporter needs the browser's FileReader). Driven through `window.kit`.
 */
const W = 1000, H = 700;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 400);
const hemi = new THREE.HemisphereLight(0xeaf4ff, 0x8f7c5c, 1.15);
const sun = new THREE.DirectionalLight(0xfff1dc, 1.9); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
scene.add(hemi, sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0xd9ccaa }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.005; ground.receiveShadow = true; scene.add(ground);
let current: THREE.Object3D | null = null;
let night = false;
function lighting(n: boolean) {
  night = n;
  scene.background = new THREE.Color(n ? 0x0d1424 : 0xcfe0ea);
  hemi.intensity = n ? 0.22 : 1.15; sun.intensity = n ? 0.12 : 1.9;
  setVillaFacadeNight(n ? 1 : 0);
}
lighting(false);

/** A piece of the kit built on its own (the plan's origin at the middle of the lot, the street toward +z). */
function build(id: string, spec: Partial<AlmadiesVillaSpec> = {}): THREE.Object3D {
  if (id === 'villa') return buildAlmadiesVillaSolo(spec);
  // cutaways of the ground floor for the pictures: its shell (no ceiling, the floors above hidden), and its furniture in it
  if (id === 'plan-rdc') return buildPlanShell(['rdc']);
  if (id === 'furniture-rdc') { const shell = buildPlanShell(['rdc']); shell.add(buildFurnitureLayout(['rdc'])); return shell; }
  const p = ALMADIES_VILLA_PIECES.find(q => q.id === id);
  if (!p) throw new Error(`no piece ${id}`);
  return p.build(spec);
}
/** What an object costs to draw: its meshes (draw calls) and triangles. */
function cost(o: THREE.Object3D) {
  let draws = 0, tris = 0, verts = 0;
  o.traverse(x => { const m = x as THREE.Mesh; if (!m.isMesh || !m.visible) return; draws++; const g = m.geometry; verts += g.attributes.position.count; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; });
  return { draws, tris: Math.round(tris), verts };
}
type View = { dir?: [number, number, number]; fit?: number; target?: [number, number, number]; dist?: number };
function show(id: string, spec: Partial<AlmadiesVillaSpec> = {}, view: View = {}, n = false) {
  if (current) { scene.remove(current); current = null; }
  lighting(n);
  current = build(id, spec); scene.add(current);
  current.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = m.castShadow || !(m.material as THREE.Material).transparent; m.receiveShadow = true; } });
  const box = new THREE.Box3().setFromObject(current), c = box.getCenter(new THREE.Vector3()), r = box.getBoundingSphere(new THREE.Sphere()).radius;
  const dir = new THREE.Vector3(...(view.dir ?? [0.62, 0.55, 1])).normalize(), t = view.target ? new THREE.Vector3(...view.target) : c;
  const dist = view.dist ?? (r * (view.fit ?? 0.72)) / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.copy(t).addScaledVector(dir, dist); camera.lookAt(t); camera.updateMatrixWorld();
  sun.position.set(c.x + 30, c.y + 45, c.z + 22); sun.target.position.copy(c);
  const s = Math.max(12, r * 1.3); Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 200 }); sun.shadow.camera.updateProjectionMatrix();
  // what the piece alone costs to draw (the ground hidden), then the picture
  ground.visible = false; renderer.render(scene, camera);
  const drawn = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  ground.visible = true; renderer.render(scene, camera);
  return { ...cost(current), drawn, size: box.getSize(new THREE.Vector3()).toArray().map(v => Math.round(v * 100) / 100) };
}
/** The piece as a GLB (base64): every mesh shown, its vertices shared where they can be, no texture coordinates where no texture reads them. */
async function glb(id: string, spec: Partial<AlmadiesVillaSpec> = {}) {
  lighting(true);                                                           // (the façade's lights exported lit: in the game they add their light at night)
  const o = build(id, spec);
  o.traverse(x => {
    x.visible = true;
    const m = x as THREE.Mesh; if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    let g = m.geometry.clone();
    if (!mats.some(t => (t as THREE.MeshLambertMaterial).map)) g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-5); m.geometry = g;
    // (a material with its own shader hook, src/world/grain.ts, is exported for its colours)
  });
  const exporter = new GLTFExporter();
  const buf = await exporter.parseAsync(o, { binary: true, onlyVisible: false }) as ArrayBuffer;
  lighting(night);
  let s = ''; const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return { base64: btoa(s), bytes: b.length };
}
const pieces = () => ALMADIES_VILLA_PIECES.map(({ id, name, builder, what, params, street }) => ({ id, name, builder, what, params, street }));
/** The villa's finishes (src/housing/villaFinish.ts) as PNG data URLs: the travertine and marble slabs, the oak boards, the view from the windows. */
const finishes = () => Object.fromEntries(([['stone-tiles', stoneTiles], ['oak-planks', oakPlanks], ['window-view', windowView]] as const).map(([k, f]) => [k, (f().image as HTMLCanvasElement).toDataURL('image/png')]));
(window as unknown as { kit: unknown }).kit = { pieces, show, glb, finishes, ready: true };
