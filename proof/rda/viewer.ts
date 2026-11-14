// Review viewer for the Roi des Arènes wrestlers (docs/wrestling/RDA-INTEGRATION.md): the real `Wrestler` class (src/actors/humanoid.ts)
// on the v4 body and on the RDA body, the game's lights, tone mapping and materials, any clip at any time, any build and piece switch.
// Not part of the game: `npx vite --port 53xx` from the repo root, then proof/rda/viewer.html?level=high; driven by proof/rda/shoot.mjs.
import * as THREE from 'three';
import { preloadHumanoid, preloadBody, Wrestler, type Clip } from '../../src/actors/humanoid';
import { rdaUrl } from '../../src/actors/rdaFlag';
import type { WrestlerLook } from '../../src/core/types';

const q = new URLSearchParams(location.search);
const W = Number(q.get('w') ?? 640), H = Number(q.get('h') ?? 640);
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(W, H); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; document.body.appendChild(r.domElement);
const sc = new THREE.Scene(); sc.background = new THREE.Color(0xc9b48f);
sc.add(new THREE.HemisphereLight(0xffffff, 0x8a7a60, 0.9)); const sun = new THREE.DirectionalLight(0xffffff, 1); sun.position.set(4, 8, 5); sc.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshLambertMaterial({ color: 0xd8c39a })); ground.rotation.x = -Math.PI / 2; sc.add(ground);
await preloadHumanoid('/');
const rdaOk = await preloadBody('rda', rdaUrl(q.get('level') === 'medium' ? 'medium' : 'high', '/'));
type Spec = { body: 'rda' | 'v4'; build?: 'athletic' | 'heavy'; look?: WrestlerLook; cut?: 'A' | 'B'; skin?: number; parts?: { armsWaist?: boolean; chest?: boolean }; x?: number; z?: number; yaw?: number; clip?: Clip };
const figs: (Wrestler & { userData?: Clip | null })[] = [];
const api = window as unknown as Record<string, unknown>;
api.setup = (list: Spec[]) => {
  for (const f of figs) f.dispose(); figs.length = 0;
  for (const d of list) {
    const w = new Wrestler(d.skin ?? 0x5b3420, d.body);
    if (d.look) w.setLook(d.look, d.cut ?? 'A');
    if (d.build) w.setBuild(d.build);
    if (d.parts) w.setRdaParts(d.parts);
    w.group.position.set(d.x ?? 0, 0, d.z ?? 0); w.group.rotation.y = d.yaw ?? 0; w.holdFade = 0; (w as unknown as { userData: Clip | null }).userData = d.clip ?? null; sc.add(w.group);
    figs.push(w);
  }
  return { rdaOk, bodies: figs.map(f => f.body) };
};
/** Every figure posed at `t` seconds into its clip (the figure's own `clip`, else this one); a camera on the group. */
api.show = (clip: Clip, t: number, view = 'front', o: { zoom?: number; ty?: number; on?: number } = {}) => {
  for (const f of figs) { const c = (f.userData ?? clip) as Clip; f.hold = c; f.clipName = null; f.play(c, 0); f.animate(t, 0); f.group.updateMatrixWorld(true); }
  const box = new THREE.Box3(); (o.on !== undefined ? [figs[o.on]] : figs).forEach(f => box.expandByObject(f.group));
  const c0 = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 80);
  const dirs: Record<string, number[]> = { front: [0, 0.05, 1], back: [0, 0.05, -1], side: [1, 0.05, 0], threeq: [0.7, 0.15, 0.7] };
  const target = c0.clone(); let dist = Math.max(size.y * 2.1, size.x * 1.25 * H / W) / (o.zoom ?? 1);
  if (o.ty !== undefined) target.y = box.min.y + size.y * o.ty;
  if (view === 'face' || view === 'face3q') { figs[o.on ?? 0].bone('head')!.getWorldPosition(target); target.y += 0.12; dist = 1.0 / (o.zoom ?? 1); }
  cam.position.copy(target).addScaledVector(new THREE.Vector3(...(dirs[view === 'face' ? 'front' : view === 'face3q' ? 'threeq' : view] ?? dirs.front)).normalize(), dist); cam.lookAt(target);
  r.render(sc, cam); return { calls: r.info.render.calls, triangles: r.info.render.triangles };
};
api.ready = true;
