// Inventory of the vehicle kit models a player could own: stats from the spec (size, seats, cameras, triangle and draw-call budget, colours) and a lineup picture
// from three views each. Not part of the game; nothing in src/ imports this. Needs the dev server: npx vite --port 5199, then proof/vehicles/run.mjs.
import * as THREE from 'three';
import { buildVehicle, vehicleSpec, type VehicleKind } from '../../src/actors/vehicleKit';
import { jakartaSeed } from '../../src/transport/moto';
import { tiakSeed } from '../../src/transport/motoModule';
import { sedanSeed, SEDAN_SILVER, SEDAN_WHITE, SEDAN_BLUE } from '../../src/transport/car';

const first = (kind: VehicleKind, ok: (s: ReturnType<typeof vehicleSpec>) => boolean) => { for (let s = 1; s < 600; s++) if (ok(vehicleSpec(kind, { seed: s, driver: false, passengers: false }))) return s; return 1; };
const body = (kind: VehicleKind, c: number) => first(kind, s => s.colors.body === c);
const ENTRIES: { id: string; role: string; kind: VehicleKind; seed: number }[] = [
  { id: 'jakarta', role: 'OWNED today (catalogue jakarta, 150 000 F)', kind: 'moto', seed: jakartaSeed() },
  { id: 'tiak loaner', role: 'Tiak Tiak loaner (not owned, free)', kind: 'moto', seed: tiakSeed() },
  { id: 'scooter', role: 'candidate: urban scooter (kit moto variant ≥ 10)', kind: 'moto', seed: first('moto', s => s.variant >= 10) },
  { id: 'sedan silver', role: 'OWNED today (catalogue clando, 2 800 000 F)', kind: 'sedan', seed: sedanSeed(SEDAN_SILVER) },
  { id: 'sedan white', role: 'dealer display', kind: 'sedan', seed: sedanSeed(SEDAN_WHITE) },
  { id: 'sedan blue', role: 'dealer display', kind: 'sedan', seed: sedanSeed(SEDAN_BLUE) },
  { id: 'luxury', role: 'candidate: modern sedan (catalogue berline, soon)', kind: 'luxury', seed: first('luxury', () => true) },
  { id: 'suv black', role: 'candidate: premium SUV (catalogue tout_terrain, soon)', kind: 'suv', seed: body('suv', 0x1a1b1d) },
  { id: 'suv white', role: 'candidate colour', kind: 'suv', seed: body('suv', 0xf2f2f0) },
  { id: 'pickup', role: 'out of scope (kit has it)', kind: 'pickup', seed: first('pickup', () => true) },
  { id: 'truck', role: 'out of scope (catalogue camion, soon)', kind: 'truck', seed: first('truck', () => true) },
];
const r3 = (n: number) => Math.round(n * 100) / 100;
(window as any).inventory = () => ENTRIES.map(e => {
  const sp = vehicleSpec(e.kind, { seed: e.seed, driver: false, passengers: false });
  return { id: e.id, role: e.role, kind: e.kind, seed: e.seed, variant: sp.variant, bodyColour: '#' + sp.colors.body.toString(16).padStart(6, '0'), size_m: [r3(sp.length), r3(sp.width), r3(sp.height)], wheelbase: r3(sp.wheelbase),
    seats: sp.seats.map(s => s.kind).join(','), doors: sp.doors.length, cameras: Object.keys(sp.cameras).join(','), grips: sp.controls.grips, pegs: sp.controls.pegs ?? null, steering: sp.controls.steering,
    near: sp.budget.near, far: sp.budget.far, speed: sp.speed, lodDistance: sp.lodDistance };
});
const W = 1500, H = 900, r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(W, H); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('c')!.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9bd3f3);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a60, 1.1)); const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(4, 8, 5); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ color: 0xb8a98a })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
const group = new THREE.Group(); scene.add(group);
(window as any).show = (i: number, view: 'threeq' | 'side' | 'front' | 'rear') => {
  group.clear(); const e = ENTRIES[i], b = buildVehicle(e.kind, { seed: e.seed, driver: false, passengers: false, stand: true }); group.add(b.group);
  const L = b.spec.length, h = b.spec.height, d = Math.max(L, 3) * 1.25;
  const dirs = { threeq: [0.75, 0.32, 0.65], side: [1, 0.12, 0], front: [0, 0.2, 1], rear: [-0.6, 0.35, -0.8] }[view];
  const cam = new THREE.PerspectiveCamera(32, W / H, 0.1, 100); cam.position.set(dirs[0] * d, dirs[1] * d + h * 0.5, dirs[2] * d); cam.lookAt(0, h * 0.45, 0);
  r.render(scene, cam); return true;
};
(window as any).count = ENTRIES.length; (window as any).ready = true;
