import * as THREE from 'three';
import { Batch, signTexture } from '../world/batch';
import { isTestHost } from '../core/testParams';
import type { HubWorld } from '../world/types';
import type { GameModule } from './modules';
import { Humanoid, humanoidReady, randomLook } from '../actors/humanoid';
import type { GameState } from '../core/state';
import type { Action, Interactable } from '../world/types';

/**
 * Portwise-inspired terminal, opt-in only: ?portPrototype=1&hub=plateau
 * Portwise source: https://github.com/alexngdev99/rork-seaport-logistics-3d
 * MIT © 2026 Portwise contributors (licence details in docs/PORTWISE_SPIKE.md).
 * Procedural geometry and deterministic timelines adapted to native Three.js.
 */
export const PORT_VISIT_SPAWN = { x: 166, z: 37, yaw: 2.5 } as const;
const COLORS = [0xd45e3c, 0x24486c, 0x577d6a, 0xc3a25f, 0xae433a, 0x627c8c];
const material = () => new THREE.MeshLambertMaterial({ vertexColors: true });
const unit = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => { const t = unit(n); return t * t * (3 - 2 * t); };

export function portCranePose(seconds: number) {
  const t = ((seconds % 16) + 16) % 16;
  if (t < 2) return { x: 22, y: 16 - 8 * ease(t / 2), carrying: false };
  if (t < 4) return { x: 22, y: 8 + 8 * ease((t - 2) / 2), carrying: true };
  if (t < 7) return { x: 22 - 29 * ease((t - 4) / 3), y: 16, carrying: true };
  if (t < 9) return { x: -7, y: 16 - 13 * ease((t - 7) / 2), carrying: true };
  if (t < 11) return { x: -7, y: 3 + 13 * ease((t - 9) / 2), carrying: false };
  return { x: -7 + 29 * ease((t - 11) / 5), y: 16, carrying: false };
}
const ROUTE = [{ x: 148, z: 23 }, { x: 183, z: 23 }, { x: 183, z: -28 }, { x: 173, z: -28 }, { x: 173, z: 23 }, { x: 148, z: 23 }];
export function portTruckPose(seconds: number, offset = 0) {
  const lengths = ROUTE.slice(1).map((p, i) => Math.hypot(p.x - ROUTE[i].x, p.z - ROUTE[i].z));
  const total = lengths.reduce((a, b) => a + b / 5 + 2, 0);
  let t = ((seconds + offset) % total + total) % total;
  for (let i = 0; i < lengths.length; i++) {
    const moving = lengths[i] / 5, dur = moving + 2;
    if (t < dur) {
      const a = ROUTE[i], b = ROUTE[i + 1], f = unit(t / moving);
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    t -= dur;
  }
  return { ...ROUTE[0], yaw: 0 };
}
function addBatch(parent: THREE.Group, b: Batch) {
  const mesh = b.build(material(), true, false);
  if (mesh) parent.add(mesh);
}
function containers(parent: THREE.Group, spots: { x: number; y: number; z: number }[]) {
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 1.35, 2.3), new THREE.MeshLambertMaterial({ color: 0xffffff }), spots.length);
  const obj = new THREE.Object3D();
  spots.forEach((p, i) => {
    obj.position.set(p.x, p.y, p.z); obj.updateMatrix();
    inst.setMatrixAt(i, obj.matrix); inst.setColorAt(i, new THREE.Color(COLORS[(i + Math.floor(i / 7)) % COLORS.length]));
  });
  inst.instanceMatrix.needsUpdate = true; inst.frustumCulled = false;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  parent.add(inst);
}
function makeShip() {
  const ship = new THREE.Group(); ship.name = 'dakar-port-ship'; ship.position.set(208.5, 0, -6);
  const b = new Batch();
  b.box(15, 5, 69, 0, -1.7, 0, 0x24394e); b.box(14, 0.7, 64, 0, 3.2, 0, 0xd4cbb9);
  b.box(10, 5, 10, 0, 3.9, -28, 0xe8e7e1); b.box(10, 1.2, 10, 0, 3.7, 29, 0xc35c43);
  addBatch(ship, b);
  const deck = [];
  for (let j = 0; j < 12; j++) for (let i = 0; i < 4; i++)
    deck.push({ x: -5 + i * 3.2, y: 4.6 + ((i + j) % 4 === 0 ? 1.4 : 0), z: -22 + j * 3.7 });
  containers(ship, deck);
  return ship;
}
/** Gorée on the horizon, south-east of the port: a low basalt island, the fort on its height, ochre and red houses. */
function makeGoree() {
  const g = new THREE.Group(); g.name = 'dakar-port-goree'; g.position.set(320, 0, 150);
  const b = new Batch();
  b.box(80, 3, 34, 0, -1, 0, 0x5b4a3c); b.box(26, 9, 22, -26, 0, -2, 0x5f5043);           // the island, its height to the south
  b.box(18, 4, 14, -26, 8, -2, 0x9a8c74);                                                   // the fort on the height
  const houses = [0xc8643c, 0xe0a85a, 0xb8483a, 0xe8c27a, 0xd9774a, 0xc95b4a, 0xe6b46a];
  for (let i = 0; i < 12; i++) b.box(4 + (i % 3), 3 + (i % 2) * 2, 4, -6 + (i % 6) * 6.5, 1.8, -8 + Math.floor(i / 6) * 9, houses[i % houses.length]);
  for (let i = 0; i < 5; i++) { b.box(0.5, 7, 0.5, 10 + i * 5, 1.8, 10, 0x6b5a3a); b.box(3.2, 0.8, 3.2, 10 + i * 5, 8.6, 10, 0x3f6b3a); }
  addBatch(g, b);
  return g;
}
function makeFerryPier() {
  const g = new THREE.Group(); g.name = 'dakar-port-ferry-pier';
  const b = new Batch();
  b.box(33, 0.2, 8, 215.5, 0.02, 44, 0x9a8f7b);                      // pier deck, x 199..232, z 40..48
  for (let x = 202; x < 232; x += 6) for (const z of [39.8, 48.2]) b.box(0.3, 1.0, 0.3, x, 0.2, z, 0x4a3f33);
  b.box(14, 2.6, 4.2, 224, -0.4, 53, 0xf1ece0);                       // ferry hull, alongside the pier
  b.box(9, 2.2, 3.4, 224, 2.2, 53, 0xe8ecef); b.box(14.2, 0.4, 4.4, 224, 2.2, 53, 0x2f6f9f);
  addBatch(g, b);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.9),
    new THREE.MeshBasicMaterial({ map: signTexture('EMBARCADÈRE · GORÉE', '#16465f', '#f9df9f', 512, 80), side: THREE.DoubleSide }));
  sign.position.set(200.8, 3.2, 44); sign.rotation.y = -Math.PI / 2; g.add(sign);
  return g;
}
function makeCrane() {
  const group = new THREE.Group(); group.name = 'dakar-port-gantry'; group.position.set(188, 0, 5);
  const b = new Batch();
  for (const x of [-5, 5]) for (const z of [-4, 4]) b.box(0.7, 20, 0.7, x, 0, z, 0xc76437);
  b.box(11, 1.2, 10, 0, 19.5, 0, 0xce713a);
  b.box(43, 1, 1, 7, 20, -3, 0xdfa445); b.box(43, 1, 1, 7, 20, 3, 0xdfa445);
  addBatch(group, b);
  const trolley = new THREE.Group(); group.add(trolley);
  const head = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 2.4), new THREE.MeshLambertMaterial({ color: 0x3f5467 }));
  head.position.y = 19.4; trolley.add(head);
  const cable = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1, 0.07), new THREE.MeshBasicMaterial({ color: 0x23272c }));
  const spreader = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.28, 2.5), new THREE.MeshLambertMaterial({ color: 0xd9a349 }));
  const load = new THREE.Mesh(new THREE.BoxGeometry(3, 1.35, 2.3), new THREE.MeshLambertMaterial({ color: 0xb3483d }));
  trolley.add(cable, spreader, load);
  return { group, trolley, cable, spreader, load };
}
function makeTruck(color: number) {
  const truck = new THREE.Group();
  const b = new Batch();
  b.box(2.3, 1.8, 2.4, 0, 0.5, 2.2, color);
  b.box(2.5, 1.1, 5, 0, 0.55, -1.6, 0x40474d);
  b.box(2.35, 1.5, 4.4, 0, 1.5, -1.6, 0x4c7892);
  for (const x of [-1.3, 1.3]) for (const z of [-3, 2]) b.box(0.25, 0.85, 0.9, x, 0.2, z, 0x242a2f);
  addBatch(truck, b);
  return truck;
}
class PortScene {
  readonly group = new THREE.Group();
  private crane = makeCrane();
  private trucks = [makeTruck(0xf0d6a0), makeTruck(0xc85e38)];
  constructor(hub: HubWorld, private state: GameState) {
    this.group.name = 'portwise-dakar-prototype';
    const b = new Batch();
    b.box(73, 0.12, 150, 164.5, 0.02, 0, 0xb8b1a1);
    b.box(70, 0.04, 6, 153, 0.14, 0, 0x6d7479); // walk from the Plateau's east road
    b.box(2.5, 0.2, 145, 197.5, 0.14, 0, 0x8e8d85);
    for (let z = -65; z < 65; z += 10) b.box(1.5, 0.03, 0.3, 185, 0.18, z, 0xe4d09a);
    b.box(15, 4, 4, 156, 0.12, 60, 0x647a85);
    // The entrance must be visible from the eastward Plateau road, not hidden behind the blocks.
    b.box(0.45, 4.4, 0.45, 136, 0.12, -6.1, 0x286078);
    b.box(0.45, 4.4, 0.45, 136, 0.12, 6.1, 0x286078);
    b.box(0.55, 0.42, 12.8, 136, 4.45, 0, 0xe6ac49);
    addBatch(this.group, b);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(11.7, 1.4),
      new THREE.MeshBasicMaterial({ map: signTexture('PORT AUTONOME DE DAKAR', '#16465f', '#f9df9f', 768, 112), side: THREE.DoubleSide }));
    sign.rotation.y = -Math.PI / 2;
    sign.position.set(135.66, 4.2, 0);
    this.group.add(sign);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(700, 900), new THREE.MeshLambertMaterial({ color: 0x246987 }));
    water.rotation.x = -Math.PI / 2; water.position.set(548, 0.07, 0); this.group.add(water);
    this.group.add(makeGoree());
    this.group.add(makeShip(), this.crane.group, makeFerryPier());
    const jetty = new Batch(); // jetée: breakwater closing the basin to the east (decor)
    jetty.box(5, 2.2, 150, 322, 0.1, -5, 0x7d776d);
    addBatch(this.group, jetty);
    const yard = [];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 10; j++)
      yard.push({ x: 141 + i * 3.6, y: 0.9 + ((i + j) % 3) * 1.4, z: -66 + j * 4.5 });
    containers(this.group, yard);
    this.trucks.forEach(t => this.group.add(t));
    // Quay fence with a gap for the Gorée ferry pier (south môle): the only way onto the water side.
    hub.colliders.push({ x0: 198, x1: 199.5, z0: -75, z1: 40, h: 1.3 });
    hub.colliders.push({ x0: 198, x1: 199.5, z0: 48, z1: 75, h: 1.3 });
    for (const [z0, z1] of [[39.6, 40], [48, 48.4]]) hub.colliders.push({ x0: 199.5, x1: 232, z0, z1, h: 1.3 });
    hub.colliders.push({ x0: 231.6, x1: 232, z0: 40, z1: 48, h: 1.3 });
    hub.bounds.x1 = 232;
    hub.colliders.push({ x0: 149, x1: 164, z0: 58, z1: 63, h: 4.3 });
    hub.colliders.push({ x0: 139, x1: 158, z0: -69, z1: -19, h: 5 });
    hub.interactables.push(...portPlaces(() => this.state));
    const stand = new Batch(); // the Touba coffee stand at the gate
    stand.box(1.6, 1.0, 0.8, 129.6, 0.12, 10, 0x7a4b2a); stand.box(1.9, 0.08, 1.1, 129.6, 2.1, 10, 0xd8b04a);
    for (const z of [9.5, 10.5]) stand.box(0.08, 2.0, 0.08, 128.9, 0.12, z, 0x3b3b3b);
    addBatch(this.group, stand);
    hub.interactables.push({ id: 'plateau:port:quai', name: 'Port Autonome de Dakar', kind: 'actions',
      x: 132, z: 0, radius: 5, description: 'Entrée du terminal : avance vers les quais pour voir les navires, les grues et les camions.',
      actions: [{ id: 'voir_port', label: 'Observer les opérations', seconds: 1 }] });
  }
  private people: Humanoid[] = [];
  private placePeople() {
    if (this.people.length || !humanoidReady()) return;
    let k = 7; const R = () => ((k = (k * 16807) % 2147483647) / 2147483647);
    // Mamadou the docker by the stacks, the passeur on the pier, the coffee seller at the gate
    for (const [x, z, yaw, clip] of [[161, -16.6, 0, 'Idle'], [205, 46.6, Math.PI, 'Talk'], [130.4, 10, -Math.PI / 2, 'Talk']] as const) {
      const h = new Humanoid(randomLook(R)); h.group.position.set(x, 0.12, z); h.group.rotation.y = yaw; h.hold = clip;
      this.group.add(h.group); this.people.push(h);
    }
  }
  update(seconds: number, dt = 0) {
    this.placePeople(); for (const h of this.people) h.animate(dt, 0);
    const p = portCranePose(seconds);
    this.crane.trolley.position.x = p.x;
    this.crane.spreader.position.y = p.y + 0.8;
    this.crane.load.position.y = p.y; this.crane.load.visible = p.carrying;
    const len = Math.max(0.2, 19 - p.y);
    this.crane.cable.scale.y = len; this.crane.cable.position.y = 19.3 - len / 2;
    this.trucks.forEach((t, i) => {
      const s = portTruckPose(seconds, i * 17); t.position.set(s.x, 0.1, s.z); t.rotation.y = s.yaw;
    });
  }
  dispose() {
    for (const h of this.people) h.dispose(); this.people = [];
    const g = new Set<THREE.BufferGeometry>(), m = new Set<THREE.Material>();
    this.group.traverse(o => {
      const obj = o as THREE.Mesh;
      if (obj.geometry) g.add(obj.geometry);
      if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(x => m.add(x));
    });
    g.forEach(x => x.dispose()); m.forEach(x => { (x as THREE.MeshBasicMaterial).map?.dispose(); x.dispose(); }); this.group.removeFromParent();
  }
}
const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];
const flagged = (s: GameState, f: string) => s.data.flags.includes(f);
const talk = (who: string, line: () => string) => `${who} : « ${line()} »`;
/** Port people as plain data on the existing action runner: a line when the step starts, needs, counters, flags. */
export function portPlaces(state: () => GameState): Interactable[] {
  const docker: Action[] = [
    { id: 'parler_docker', label: 'Discuter avec le docker', detail: 'Il regarde les conteneurs en fumant', seconds: 3, steps: [{
      label: 'Discussion', primitive: 'talk', seconds: 3, clip: 'Talk',
      line: () => talk('Mamadou', () => flagged(state(), 'met_docker') ? pick(['Le bateau de ce matin venait de Tanger…', 'Y’a trop de monde qui veut entrer dans le port maintenant.', 'Les grues, elles s’arrêtent jamais. Nous non plus.'])
        : 'Tu te perds pas, mon frère ? Ici c’est le vrai travail. Les conteneurs, c’est la vie de Dakar.'),
      effects: { needs: { social: 8, moral: 3 }, counters: { chats: 1 }, flags: ['met_docker'] } }] },
    { id: 'aider_caisse', label: 'Aider à pousser une caisse', detail: '+1 500 F · un peu de fatigue', gain: 1500, seconds: 4,
      requires: s => (s.data.needs.energie < 20 ? 'Trop fatigué' : null), steps: [{
      label: 'Pousser la caisse', primitive: 'work', seconds: 4, clip: 'Grab',
      line: () => talk('Mamadou', () => 'Respect. T’es pas comme les touristes du Plateau. Tiens, 1 500 F. Va boire un Touba.'),
      effects: { money: 1500, category: 'transport', needs: { energie: -18, hygiene: -6, faim: -5, moral: 4 }, counters: { shifts: 1 }, flags: ['helped_docker'] } }] },
  ];
  const goree: Action[] = [
    { id: 'regarder_goree', label: 'Regarder vers Gorée', detail: 'L’île est là, juste en face', seconds: 3, steps: [{
      label: 'Regarder la mer', primitive: 'inspect', seconds: 3,
      line: 'Gorée… même quand on la voit tous les jours, ça fait quelque chose.',
      effects: { needs: { moral: 10, social: 2 }, flags: ['seen_goree'] } }] },
    { id: 'parler_passeur', label: 'Parler au passeur', detail: 'Il attend les passagers pour Gorée', seconds: 2.5, steps: [{
      label: 'Discussion', primitive: 'talk', seconds: 2.5, clip: 'Talk',
      line: () => talk('Le passeur', () => flagged(state(), 'seen_goree') ? 'Beaucoup de gens passent ici sans s’arrêter. Toi tu regardes. C’est bien.'
        : 'Aujourd’hui la mer est calme. Une vingtaine de minutes et t’es de l’autre côté. Tu viens pour la Maison des Esclaves ou juste pour marcher ?'),
      effects: { needs: { social: 6, moral: 4 }, counters: { chats: 1 } } }] },
    { id: 'aller_goree', label: 'Prendre la chaloupe pour Gorée', detail: 'Bientôt disponible', seconds: 0,
      requires: () => 'La chaloupe partira dans une prochaine version' },
  ];
  const cafe: Action[] = [
    { id: 'touba_port', label: 'Boire un café Touba', detail: 'Bien fort, 100 F', cost: 100, seconds: 1.5, steps: [{
      label: 'Café Touba', primitive: 'drink', seconds: 1.5, prop: 'cup',
      line: 'Vendeur : « Café du port, mon frère. Ça réveille même les morts. »',
      effects: { needs: { faim: 2, energie: 7, moral: 5, social: 2 }, counters: { cafes: 1 } } }] },
  ];
  return [
    { id: 'plateau:port:docker', name: 'Mamadou (docker)', kind: 'actions', x: 161, z: -18, radius: 3.5, actions: docker,
      description: 'Un docker en pause, près des piles de conteneurs.' },
    { id: 'plateau:port:goree', name: 'Embarcadère Gorée', kind: 'actions', x: 206, z: 44, radius: 4, actions: goree,
      description: 'Le passeur attend au bout de la jetée. Gorée est juste en face.' },
    { id: 'plateau:port:cafe', name: 'Café Touba du Port', kind: 'actions', x: 132, z: 10, radius: 3, actions: cafe,
      description: 'Un vendeur de café Touba à l’entrée du port.' },
  ];
}
let scene: PortScene | null = null;
const previewParams = () => typeof window !== 'undefined' && !!window.location?.search && isTestHost(window.location.hostname)
  ? new URLSearchParams(window.location.search) : null;
const enabled = () => previewParams()?.has('portPrototype') ?? false;
export const portwiseDakar: GameModule = {
  name: 'portwise-dakar',
  hubLoaded(ctx, hub) {
    scene?.dispose(); scene = null;
    if (!enabled() || hub.id !== 'plateau') return;
    scene = new PortScene(hub, ctx.state); ctx.extra.add(scene.group);
    // Dedicated smoke-test arrival. Normal Plateau spawns and saved positions stay unchanged.
    if (previewParams()?.has('portVisit')) hub.spawn = { ...PORT_VISIT_SPAWN };
  },
  update(ctx, dt) { scene?.update(ctx.now() / 1000, dt); },
  debug() { return { portPrototype: () => ({ enabled: !!scene, ships: scene ? 1 : 0, cranes: scene ? 1 : 0, containers: scene ? 50 : 0, trucks: scene ? 2 : 0, x: 135, z: 0 }) }; },
};
