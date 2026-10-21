// Dev-only lab (served by `vite`, not part of the build): the real Meshy bodies with a look, several bodies × views in one picture, under the studio's light or the
// game's day and night light. Query: ?rows=f:afro:2:0:1,m:kufi:4:2:3 (body:hair:skin:outfit:color[:clip:seconds]; body `mb`/`fb`: the files under /_before/, to compare)
// &views=front,34,side,back &frame=head|bust|body &light=studio|day|night &cell=300
import * as THREE from 'three';
import { Humanoid, type Clip } from '../../src/actors/humanoid';
import { loadPlayerBody } from '../../src/actors/playerBody';
import type { Appearance, HairId } from '../../src/actors/appearance';
import { STUDIO_LIGHT, gameLight } from '../../src/ui/studioStage';

const q = new URLSearchParams(location.search);
const rows = (q.get('rows') ?? 'f:natural:4:0:0').split(',').map(r => {
  const [b, hair, skin, outfit, color, clip, t] = r.split(':');
  return { avatar: b.startsWith('m') ? 'homme' as const : 'femme' as const, low: b === 'ml' || b === 'mlb', base: b.endsWith('b') ? '/_before/' : '/', clip: (clip || 'Idle') as Clip, t: Number(t ?? 0.66),
    look: hair === 'none' ? null : { hair: hair as HairId, skin: +skin, outfit: +outfit, color: +color } as Appearance };
});
const views = (q.get('views') ?? 'front,34,side,back').split(','), frame = q.get('frame') ?? 'head', light = q.get('light') ?? 'studio', cell = +(q.get('cell') ?? 300);
const YAW: Record<string, number> = { front: 0, '34': -0.65, side: -Math.PI / 2, back: Math.PI, '34b': 2.4 };
const canvas = document.getElementById('c') as HTMLCanvasElement;
const tall = frame === 'body', W = cell * views.length, H = (tall ? cell * 2 : cell) * rows.length;
const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); r.setPixelRatio(1); r.setSize(W, H);
r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.setScissorTest(true);
const scene = new THREE.Scene();
if (light === 'studio') { for (const l of STUDIO_LIGHT()) scene.add(l); scene.background = new THREE.Color(0x2a2f3a); }
else { const g = gameLight(light === 'night'); for (const l of g.lights) scene.add(l); r.toneMappingExposure = g.exposure; scene.background = new THREE.Color(light === 'night' ? 0x0d1424 : 0x9fc4e8); }
// ?glb=<url>: a raw file (a Meshy source as it came) instead of the rows, drawn as made
if (q.get('glb')) {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const g = (await new GLTFLoader().loadAsync(q.get('glb')!)).scene, box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), hgt = box.max.y - box.min.y;
  g.position.set(-c.x, -box.min.y, -c.z);
  const holder = new THREE.Group(); holder.add(g); holder.scale.setScalar(1.85 / hgt); scene.add(holder);
  if (q.get('clay')) g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.material = new THREE.MeshLambertMaterial({ color: 0xb98a6a }); });
  if (q.get('wire')) g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { const w = m.clone(); w.material = new THREE.MeshBasicMaterial({ color: 0x66ffcc, wireframe: true, transparent: true, opacity: 0.35 }); m.parent!.add(w); } });
  views.forEach((v, vi) => {
    holder.rotation.y = YAW[v] ?? 0; holder.updateMatrixWorld(true);
    const ch = tall ? cell * 2 : cell, cam2 = new THREE.PerspectiveCamera(tall ? 24 : 22, tall ? 0.5 : 1, 0.05, 20);
    if (frame === 'body') { cam2.position.set(0, 1.0, 5.2); cam2.lookAt(0, 0.98, 0); } else if (frame === 'elbow') { const ex = +(q.get('ex') ?? 0.27), ey = +(q.get('ey') ?? 1.08); cam2.position.set(ex, ey, 0.75); cam2.lookAt(ex, ey, 0); } else if (frame === 'bust') { cam2.position.set(0, 1.42, 2.6); cam2.lookAt(0, 1.38, 0); } else { cam2.position.set(0, 1.62, 0.95); cam2.lookAt(0, 1.6, 0); }
    r.setViewport(vi * cell, 0, cell, ch); r.setScissor(vi * cell, 0, cell, ch); r.render(scene, cam2);
  });
  (window as unknown as { __ready: boolean }).__ready = true;
  throw new Error('done');   // (nothing more on this page)
}
const bodies: Humanoid[] = [];
for (const row of rows) {
  const id = await loadPlayerBody(row.avatar, row.low, row.base);
  // locomotion as the game drives it (the body moves, the gait follows the speed); a held pose (Sit, Ride, Lie, Kneel) through `hold`; anything else played
  const LOCO: Record<string, number> = { Walk: 1.4, Jog: 3, Run: 5.5 }, HOLD = ['Sit', 'Ride', 'Lie', 'Kneel', 'SitFloor'];
  const h = new Humanoid(undefined, id); h.fullRate = true; h.setAppearance(row.look);
  if (HOLD.includes(row.clip) || (!LOCO[row.clip] && row.clip !== 'Idle')) h.hold = row.clip;   // (a gesture is held as the game holds it: talking, grabbing, celebrating)
  if (q.get('shaveOnly')) h.group.traverse(o => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh && m.morphTargetDictionary?.shave !== undefined) m.morphTargetInfluences![m.morphTargetDictionary.shave] = 1; });
  if (q.get('probe')) h.group.traverse(o => { const m = o as THREE.SkinnedMesh; if (!m.isSkinnedMesh) return; const g = m.geometry, ha = g.getAttribute('_hair'), p = g.getAttribute('position'); let n = 0, mx = 0; const names = Object.keys(g.attributes).join(','); if (ha) for (let i = 0; i < p.count; i++) if (p.getY(i) < 1.6 && ha.getX(i) > 0.01) { n++; mx = Math.max(mx, ha.getX(i)); } console.error(`probe ${m.name}: attrs ${names} count ${p.count} hair-below-1.6 ${n} max ${mx}`); });
  // ?clay=1: the geometry alone (one plain material, the skinning and morphs kept): a fold shows as a fold, never hidden or faked by the texture
  if (q.get('clay')) h.group.traverse(o => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh && !m.name.startsWith('hair')) m.material = new THREE.MeshLambertMaterial({ color: 0xb98a6a }); });
  if (q.get('wire')) h.group.traverse(o => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh && !m.name.startsWith('hair')) { const w = new THREE.SkinnedMesh(m.geometry, new THREE.MeshBasicMaterial({ color: 0x66ffcc, wireframe: true, transparent: true, opacity: 0.3 })); w.bind(m.skeleton, m.bindMatrix); m.parent!.add(w); } });
  const speed = LOCO[row.clip] ?? 0;
  for (let i = 0, n = Math.max(1, Math.round(row.t * 60)); i < n; i++) { h.group.position.z += speed / 60; h.animate(1 / 60, speed); }
  h.group.position.set(0, 0, 0);
  bodies.push(h);
}
const cam = new THREE.PerspectiveCamera(tall ? 24 : 22, tall ? 0.5 : 1, 0.05, 20);
rows.forEach((row, ri) => {
  const h = bodies[ri]; scene.add(h.group);
  const sc = h.group.scale.x, headY = (row.avatar === 'femme' ? 1.74 : 1.79) * sc;
  views.forEach((v, vi) => {
    h.group.rotation.y = YAW[v] ?? 0; h.group.updateMatrixWorld(true);
    if (frame === 'body') { cam.position.set(0, 1.0 * sc, 5.2 * sc); cam.lookAt(0, 0.98 * sc, 0); }
    else if (frame === 'bust') { cam.position.set(0, 1.42 * sc, 2.6 * sc); cam.lookAt(0, 1.38 * sc, 0); }   // head to hips: shoulders, arms, elbows
    else if (frame === 'arm') { cam.position.set(0, 1.22 * sc, 1.6 * sc); cam.lookAt(0, 1.2 * sc, 0); h.group.position.x = -Math.cos(h.group.rotation.y) * 0.24 * sc; h.group.position.z = Math.sin(h.group.rotation.y) * 0.24 * sc; }   // the left arm, shoulder to wrist
    else if (frame === 'neck') { cam.position.set(0, 1.6 * sc, 0.75 * sc); cam.lookAt(0, 1.58 * sc, 0); }   // the neck and the collar
    else { cam.position.set(0, headY + 0.03, 0.95); cam.lookAt(0, headY, 0); }
    const ch = tall ? cell * 2 : cell, y = H - (ri + 1) * ch;
    r.setViewport(vi * cell, y, cell, ch); r.setScissor(vi * cell, y, cell, ch); r.render(scene, cam);
  });
  h.group.removeFromParent();
});
(window as unknown as { __ready: boolean }).__ready = true;
