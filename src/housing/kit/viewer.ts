import * as THREE from 'three';
import { buildHomeInterior } from '../../economy/homeInterior';
import { TEMPLATES, homeSpecFromTemplate, type IdentityId, type TemplateId } from './index';
import { planFor, levelsOf, levelOfRoom } from '../plan';

/**
 * The home kit's viewer (tools/home-viewer/index.html, scripts/shots-home-kit.mjs): one template under one identity, the way round it is asked, from above at an
 * angle, at the level asked, by day or at night — the shell as the game draws it (src/housing/apartment.ts), without the game. Driven through `window.homes`.
 */
const W = 900, H = 640;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 400);
const hemi = new THREE.HemisphereLight(0xeaf4ff, 0x9a8a70, 1.0), sun = new THREE.DirectionalLight(0xfff1dc, 1.2), lamp = new THREE.PointLight(0xffd9a0, 0, 40, 1.5);
scene.add(hemi, sun, sun.target, lamp);
let current: THREE.Object3D | null = null, serial = 0;

export interface ShowOptions { template: TemplateId; identity?: IdentityId; mirror?: boolean; level?: string; night?: boolean; view?: 'plan' | 'oblique' }
function show(o: ShowOptions) {
  if (current) { scene.remove(current); current = null; }
  const id = `viewer_${o.template}_${o.identity ?? 'own'}_${o.mirror ? 'm' : 'n'}_${serial++}`;
  const spec = homeSpecFromTemplate(o.template, { id, identity: o.identity, mirror: o.mirror, name: TEMPLATES[o.template].name, hub: 'pikine', place: 'x', where: 'x', door: 'pikine:home:x' });
  const OX = 0, OZ = 0, home = buildHomeInterior(spec, OX, OZ, 'viewer');
  current = home.int.group; scene.add(current);
  const plan = planFor(id)!, levels = levelsOf(plan), lv = levels.find(l => l.id === o.level) ?? levels[0];
  const rs = plan.rooms.filter(r => levelOfRoom(plan, r) === lv);
  const x0 = Math.min(...rs.map(r => r.box.x0)) - lv.dx, x1 = Math.max(...rs.map(r => r.box.x1)) - lv.dx, z0 = Math.min(...rs.map(r => r.box.z0)), z1 = Math.max(...rs.map(r => r.box.z1));
  const cx = OX + (x0 + x1) / 2, cz = OZ + (z0 + z1) / 2, y0 = 0.1 + lv.y, span = Math.max(x1 - x0, (z1 - z0) * 1.25);
  const hour = o.night ? 21 : 11;
  scene.background = new THREE.Color(o.night ? 0x0d1424 : 0xcfe0ea);
  hemi.intensity = o.night ? 0.35 : 1.0; sun.intensity = o.night ? 0.1 : 1.2; sun.position.set(cx + 20, y0 + 40, cz + 25); sun.target.position.set(cx, y0, cz);
  lamp.intensity = o.night ? 30 : 0; lamp.position.set(cx, y0 + 2.8, cz);
  const d = span * 1.08 / Math.tan((camera.fov * Math.PI) / 360) / 1.9;
  if (o.view === 'plan') camera.position.set(cx, y0 + d * 1.18, cz + 0.001); else camera.position.set(cx, y0 + d * 0.92, cz + d * 0.62);
  camera.lookAt(cx, y0, cz);
  // the shell's cutaway follows the player's floor; the player stands far away so the see-through hole is not in the picture
  const player = new THREE.Vector3(OX + 600, y0 + 0.0, OZ);
  for (let i = 0; i < 4; i++) home.int.update?.(0.25, player, camera, hour);
  renderer.render(scene, camera);
  let calls = renderer.info.render.calls, tris = renderer.info.render.triangles;
  return { id, level: lv.id, calls, tris, area: TEMPLATES[o.template].area };
}
declare global { interface Window { homes: { show: typeof show; ready: boolean; canvas: HTMLCanvasElement } } }
window.homes = { show, ready: true, canvas: renderer.domElement };
