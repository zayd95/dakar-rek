import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Batch, signTexture, signCanvasSize } from '../batch';
import { addGrain } from '../grain';
import { PALETTES, extentOf, siteDraw, sizeOf, type DistrictKit, type PaletteName, type Site, type SiteKind, type SiteSize } from './contract';
import { SITES } from './plan';
import { lifeInHub, planYaw, variantOf, variantsFor } from './district';

/**
 * LD2.0-E: the district's viewer (tools/district-viewer/index.html, built by scripts/shots-district-designs.mjs). One design on a site of its size on a
 * road, in the hub's materials (vertex colours, the glass's blue glow, the leaves), by day or at night, from a few cameras; what it costs to draw.
 * The lanes' pictures and the catalogue (docs/kits/ALMADIES_DISTRICT.md) come from here; the game's own look is judged in the game.
 * Driven through `window.district`.
 */
const W = 1000, H = 700;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 600);
const hemi = new THREE.HemisphereLight(0xeaf4ff, 0x8f7c5c, 1.1), sun = new THREE.DirectionalLight(0xfff1dc, 1.9);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); scene.add(hemi, sun, sun.target);

const lam = (o: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, ...o });
const mats = {
  plain: addGrain(lam(), 1, 1), pave: addGrain(lam(), 0.5, 1), leaves: addGrain(lam({ flatShading: true }), 0.8, 2.5), trunks: addGrain(lam(), 0.4, 1),
  water: lam({ emissive: 0x335577, emissiveIntensity: 0.25 }), glass: lam({ emissive: 0x335577, emissiveIntensity: 0.25 }), glassDark: lam({ emissive: 0x335577, emissiveIntensity: 0.25 }), fac: addGrain(lam(), 0.7, 1),
  metal: addGrain(lam(), 0.3, 1), bulbs: new THREE.MeshBasicMaterial({ vertexColors: true }),
};
let current: THREE.Group | null = null, ready = false;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: 0xd9ceb0 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);

export interface ShowOptions {
  kind: SiteKind; variant?: string | number; size?: SiteSize; facing?: 'south' | 'north'; mirror?: boolean; palette?: PaletteName; storeys?: number; name?: string; number?: string;
  gate?: Site['gate']; roads?: ('left' | 'right' | 'back')[]; night?: boolean; lite?: boolean; view?: 'front' | 'street' | 'back' | 'side' | 'aerial' | 'close'; fit?: number;
}
function lighting(night: boolean) {
  scene.background = new THREE.Color(night ? 0x0d1424 : 0xcfe0ea);
  hemi.intensity = night ? 0.25 : 1.1; sun.intensity = night ? 0.15 : 1.9;
  mats.glass.emissiveIntensity = night ? 0.85 : 0.25; mats.glass.emissive.set(night ? 0xffb560 : 0x335577);
}
/** The viewer's lot stands off the hub's grid: which of its edges run by a road is said here (default: a lot's road side is its right; two lots both ends; a block three sides). */
const roads = (o: ShowOptions, size: SiteSize) => { const on = o.roads ?? (size === 'S' ? ['right'] : size === 'M' ? ['left', 'right'] : ['left', 'right', 'back']); return { left: on.includes('left'), right: on.includes('right'), back: on.includes('back') }; };
function makeSite(o: ShowOptions): Site {
  const size = o.size ?? (variantsFor(o.kind, 'S').length ? 'S' : variantsFor(o.kind, 'M').length ? 'M' : 'L');
  const list = variantsFor(o.kind, size);
  const idx = typeof o.variant === 'number' ? o.variant : Math.max(0, list.findIndex(v => v.id === o.variant));
  // the plan's own site that wears this design (its name, palette, storeys, gate), else the first of its kind and size
  const proto = SITES.find(s => s.kind === o.kind && sizeOf(s) === size && variantOf(s).id === list[idx]?.id) ?? SITES.find(s => s.kind === o.kind && sizeOf(s) === size) ?? SITES.find(s => sizeOf(s) === size)!;
  // the prototype's lot rect moved to the origin region so the camera maths stay simple: the plan's frame needs only the rect and the facing
  const { w, d } = extentOf(proto), rect = { x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 };
  return { ...proto, kind: o.kind, variant: idx, rect, facing: o.facing ?? 'south', mirror: o.mirror ?? false, storeys: o.storeys ?? proto.storeys, palette: o.palette ?? proto.palette,
    name: o.name ?? proto.name ?? (o.kind === 'hotel' || o.kind === 'residence' ? 'HÔTEL DES ALMADIES' : undefined), number: o.number ?? '12', gate: o.gate ?? proto.gate, id: `viewer:${o.kind}:${idx}`, roads: roads(o, size) };
}
function show(o: ShowOptions) {
  if (current) { scene.remove(current); current.traverse(x => { const m = x as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); current = null; }
  lighting(!!o.night);
  const site = makeSite(o), g = new THREE.Group(); current = g;
  const batches = { plain: new Batch(), pave: new Batch(), leaves: new Batch(), trunks: new Batch(), water: new Batch(), bulbs: new Batch(), glass: new Batch(), glassDark: new Batch(), fac: new Batch(), metal: new Batch() };
  const kit: DistrictKit = { lite: !!o.lite, ...batches, metalMat: mats.metal, pool: () => {}, sign: (text, bg, fg, x, y, z, yaw, w = 6, h = 1.5) => {
    const { width, height } = signCanvasSize(w, h), tex = signTexture(text, bg, fg, width, height), m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: o.night ? 0.8 : 0 }));
    m.position.set(x, y, z); m.rotation.y = yaw; g.add(m);
  } };
  const d = siteDraw(kit, site), v = variantsFor(site.kind, sizeOf(site))[site.variant % variantsFor(site.kind, sizeOf(site)).length];
  const res = v.build(d) ?? {};
  for (const [k, b] of Object.entries(batches)) { const mesh = b.build((mats as Record<string, THREE.Material>)[k], true, k !== 'glass' && k !== 'glassDark'); if (mesh) g.add(mesh); }
  if (res.group) g.add(res.group);
  // the people a design places (SiteResult.life): a capsule each, blue standing, orange talking, green seated (the game draws its humanoids there); not counted in the cost
  if (res.life) for (const p of lifeInHub(d, res.life).people) {
    const sit = p.clip === 'Sit', m = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, sit ? 0.45 : 1.05, 3, 8), new THREE.MeshLambertMaterial({ color: sit ? 0x6aa84f : p.clip === 'Talk' ? 0xd08a2c : 0x3b6ea5 }));
    m.position.set(p.x, 0.1 + (p.y ?? 0) + (sit ? 0.55 : 0.8), p.z); m.userData.scenery = true; g.add(m);
  }
  // the rooftop restaurant's sign (SiteResult.rooftopSign: the venue paints and lights it in the game): its faces, pictured, not counted in the cost
  if (res.rooftopSign) for (const p of res.rooftopSign.panels) {
    const { width, height } = signCanvasSize(p.w, p.h), tex = signTexture(p.kind === 'front' ? 'TERRASSE DE NGOR' : 'TERRASSE', '#10283a', '#ffe7a8', width, height);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), new THREE.MeshLambertMaterial({ map: tex })), q = d.f.p(p.x, p.z);
    m.position.set(q.x, p.y, q.z); m.rotation.y = planYaw(d, p.yaw); m.userData.scenery = true; g.add(m);
  }
  // the road in front, the pavement, a person for scale
  const road = new THREE.Mesh(new THREE.BoxGeometry(site.rect.x1 - site.rect.x0 + 80, 0.05, 14), new THREE.MeshLambertMaterial({ color: 0x50535a }));
  const sz = site.facing === 'south' ? site.rect.z1 + 7 + 2 : site.rect.z0 - 7 - 2;
  road.position.set(0, -0.01, sz); road.userData.scenery = true; g.add(road);
  const kerb = new THREE.Mesh(new THREE.BoxGeometry(site.rect.x1 - site.rect.x0 + 80, 0.12, 2), new THREE.MeshLambertMaterial({ color: 0xe0dccc })); kerb.position.set(0, 0.05, site.facing === 'south' ? site.rect.z1 + 1 : site.rect.z0 - 1); kerb.userData.scenery = true; g.add(kerb);
  const person = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.75, 8), new THREE.MeshLambertMaterial({ color: 0x4d6b8a }));
  const q = d.f.p(-3, 12.4); person.position.set(q.x, 0.9, q.z); person.userData.scenery = true; g.add(person);
  g.traverse(x => { const m = x as THREE.Mesh; if (m.isMesh) { m.castShadow = !(m.material as THREE.Material).transparent; m.receiveShadow = true; } });
  scene.add(g);
  // the camera, in the plan's frame: the street is +z of the plan
  const f = d.f, ex = d.w / 2, eb = d.depth - 11, c = f.p(0, (11 - eb) / 2), fit = o.fit ?? 1;
  const R = Math.max(d.w, d.depth) * 0.9 * fit, tall = Math.max(site.storeys * 3.4, 6);
  const views: Record<string, { p: [number, number]; y: number; t: [number, number]; ty: number }> = {
    front: { p: [ex * 0.55, 11 + R * 1.15], y: tall * 0.55 + 4, t: [0, -2], ty: tall * 0.4 },
    street: { p: [-ex * 0.8, 11 + 11], y: 1.7, t: [0, -2], ty: tall * 0.45 },
    back: { p: [-ex * 0.7, -eb - R * 0.9], y: tall * 0.6 + 4, t: [0, 0], ty: tall * 0.4 },
    side: { p: [ex + R * 0.9, 2], y: tall * 0.5 + 3, t: [0, 0], ty: tall * 0.4 },
    aerial: { p: [ex * 0.8, 11 + R * 1.2], y: R * 1.1 + tall, t: [0, -3], ty: 0 },
    close: { p: [ex * 0.2, 11 + 9], y: 2.2, t: [0, 6], ty: 3 },
  };
  const vw = views[o.view ?? 'front'], pp = f.p(vw.p[0], vw.p[1]), tt = f.p(vw.t[0], vw.t[1]);
  camera.position.set(pp.x, vw.y, pp.z); camera.lookAt(tt.x, vw.ty, tt.z); camera.updateMatrixWorld();
  sun.position.set(c.x + 30, 45, c.z + 22); sun.target.position.set(c.x, 0, c.z);
  const s = Math.max(30, R * 1.4); Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 200 }); sun.shadow.camera.updateProjectionMatrix();
  const scenery = g.children.filter(x => x.userData.scenery);          // the road, the kerb, the person for scale and the people a design places: pictured, not counted
  ground.visible = false; for (const x of scenery) x.visible = false;
  renderer.render(scene, camera);
  const drawn = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  ground.visible = true; for (const x of scenery) x.visible = true; renderer.render(scene, camera);
  return { id: v.id, name: v.name, size: sizeOf(site), drawn, colliders: d.colliders.length, signs: g.children.filter(x => (x as THREE.Mesh).geometry instanceof THREE.PlaneGeometry).length, tallest: Math.max(0, ...d.colliders.map(c => c.h)) };
}
/** The design as a GLB (base64), without the road, the kerb and the person: every mesh, its vertices shared, no texture coordinates (a material's shader hooks are exported for their colours). */
async function glb(o: ShowOptions) {
  show({ ...o, night: true });
  const out = current!.clone(true);
  for (const c of [...out.children]) if (c.userData.scenery) out.remove(c);
  out.traverse(x => {
    const m = x as THREE.Mesh; if (!m.isMesh) return;
    let g = m.geometry.clone(); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-5); m.geometry = g;
  });
  const buf = await new GLTFExporter().parseAsync(out, { binary: true, onlyVisible: false }) as ArrayBuffer;
  let s = ''; const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return { base64: btoa(s), bytes: b.length };
}
const list = () => (['house', 'villa', 'hotel', 'residence'] as SiteKind[]).flatMap(kind => (['S', 'M', 'L'] as SiteSize[]).flatMap(size => variantsFor(kind, size).map((v, i) => ({ kind, size, id: v.id, name: v.name, index: i }))));
void PALETTES;
(window as unknown as { district: unknown }).district = { show, glb, list, get ready() { return ready; } };
ready = true;
