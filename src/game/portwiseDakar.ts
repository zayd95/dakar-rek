import * as THREE from 'three';
import { Batch, signTexture } from '../world/batch';
import { bar, containerMap, hullShape, plan, roundRect, side } from './portModels';
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
const BOX = { l: 6, h: 2.6, w: 2.4 };
function containers(parent: THREE.Group, spots: { x: number; y: number; z: number }[], yaw = 0) {
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(BOX.l, BOX.h, BOX.w), new THREE.MeshLambertMaterial({ color: 0xffffff, map: containerMap() }), spots.length);
  const obj = new THREE.Object3D(); obj.rotation.y = yaw;
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
  const body = new THREE.Group(); body.rotation.y = -Math.PI / 2; ship.add(body);   // built along x, bow +x; turned to lie along the quay (z)
  const b = new Batch(), L = 70, B = 15;
  plan(b, hullShape(L, B - 0.6, 20, 3), 2.2, 0xa23a30, 0, -1.7, 0, 0.12);           // red underwater body
  plan(b, hullShape(L, B, 20, 3), 3.0, 0x35597a, 0, 0.5, 0, 0.14);                  // navy topsides, flared by the bevel
  plan(b, hullShape(L - 1.4, B - 1.4, 19, 2.6), 0.25, 0xb9ae96, 0, 3.2, 0);          // main deck
  b.box(L - 8, 0.9, 0.18, -2, 3.45, B / 2 - 0.55, 0x1b2c3d); b.box(L - 8, 0.9, 0.18, -2, 3.45, -B / 2 + 0.55, 0x1b2c3d);   // bulwarks
  for (let i = 0; i < 6; i++) for (const z of [-1, 1]) b.box(0.9, 0.5, 1.2, 14 + i * 3, 3.45, z * 5.8, 0x6d737a);          // bow bollards
  // accommodation at the stern: three stepped decks with window bands, wing bridge, funnel, mast
  const x0 = -27;
  plan(b, roundRect(11, 11, 1.2), 2.2, 0xeeeeea, x0, 3.45, 0, 0.1);
  plan(b, roundRect(11.2, 11.2, 1.2), 0.7, 0x203c4a, x0, 4.3, 0);
  plan(b, roundRect(9, 10, 1.2), 2.1, 0xeeeeea, x0 - 0.5, 5.65, 0, 0.1);
  plan(b, roundRect(9.2, 10.2, 1.2), 0.7, 0x203c4a, x0 - 0.5, 6.4, 0);
  plan(b, roundRect(6.5, 9, 1), 2.0, 0xeeeeea, x0 - 1, 7.75, 0, 0.1);
  plan(b, roundRect(6.7, 9.2, 1), 0.8, 0x203c4a, x0 - 1, 8.35, 0);                  // bridge windows
  b.box(7.2, 0.3, 14.5, x0 - 1, 9.75, 0, 0xe3e3df);                                // bridge wings
  plan(b, roundRect(7.4, 9.4, 1.2), 0.25, 0xf4f4f0, x0 - 1, 9.75, 0, 0.08);
  b.cyl(1.2, 1.5, 5, x0 - 6, 5.6, 0, 0xc8502c, 12); b.cyl(1.25, 1.25, 1.1, x0 - 6, 10.2, 0, 0x1d1f22, 12);   // funnel with black top
  bar(b, [x0 - 1, 10, 0], [x0 - 1, 15, 0], 0.18, 0xdad8d2, 6); bar(b, [x0 - 1, 13.6, -1.8], [x0 - 1, 13.6, 1.8], 0.1, 0xdad8d2);   // mast
  b.box(5, 0.9, 3, 25, 3.45, 0, 0x6b6a64);                                         // anchor deck at the bow
  // cargo cranes' hatch coamings between the stacks
  for (let i = 0; i < 6; i++) b.box(0.3, 0.5, 13, -14 + i * 6.4 + 3.2, 3.45, 0, 0x4d5560);
  const mesh = b.build(material(), true, false); if (mesh) body.add(mesh);
  const deck = [];
  for (let j = 0; j < 6; j++) for (let i = 0; i < 5; i++) {
    const high = (i + j) % 3 === 0;
    deck.push({ x: -16 + j * 6.4 + 3.2 - 0.2, y: 4.78, z: -5.5 + i * 2.75 }); if (high) deck.push({ x: -16 + j * 6.4 + 2.9, y: 7.4, z: -5.5 + i * 2.75 });
  }
  containers(body, deck.slice(0, 40));
  return ship;
}
/**
 * The Dakar–Gorée chaloupe, on the game clock (decor for now: it will carry the player once Gorée is built).
 * A 2 h cycle between 6 h and 20 h: boarding at the pier, sailing out toward Gorée, away, coming back, landing.
 */
export const CHALOUPE_DOCK = { x: 224, z: 52.5 };
const CH_OUT: [number, number][] = [[224, 52.5], [252, 57], [290, 100], [306, 124]];
const CH_BACK: [number, number][] = [[306, 124], [292, 100], [262, 72], [236, 70], [214, 64], [216, 57], [224, 52.5]];
function along(path: [number, number][], f: number) {
  const len = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1])), total = len.reduce((a, b) => a + b, 0);
  let d = unit(f) * total;
  for (let i = 0; i < len.length; i++) {
    if (d <= len[i] || i === len.length - 1) { const t = len[i] ? d / len[i] : 0, a = path[i], b = path[i + 1];
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, yaw: -Math.atan2(b[1] - a[1], b[0] - a[0]) }; }
    d -= len[i];
  }
  return { x: path[0][0], z: path[0][1], yaw: 0 };
}
export type ChaloupeState = 'queue' | 'boarding' | 'sailing' | 'away' | 'returning' | 'landing' | 'idle';
export function chaloupePose(hour: number) {
  const dock = { x: CHALOUPE_DOCK.x, z: CHALOUPE_DOCK.z, yaw: 0 };
  if (hour < 6 || hour >= 20) return { state: 'idle' as ChaloupeState, f: 0, visible: true, ...dock };
  const p = (((hour - 6) % 2) + 2) % 2;
  if (p < 0.15) return { state: 'queue' as ChaloupeState, f: p / 0.15, visible: true, ...dock };
  if (p < 0.3) return { state: 'boarding' as ChaloupeState, f: (p - 0.15) / 0.15, visible: true, ...dock };
  if (p < 0.65) return { state: 'sailing' as ChaloupeState, f: (p - 0.3) / 0.35, visible: true, ...along(CH_OUT, ease((p - 0.3) / 0.35)) };
  if (p < 1.3) return { state: 'away' as ChaloupeState, f: 0, visible: false, x: 306, z: 124, yaw: 0 };
  if (p < 1.7) return { state: 'returning' as ChaloupeState, f: (p - 1.3) / 0.4, visible: true, ...along(CH_BACK, ease((p - 1.3) / 0.4)) };
  if (p < 1.85) return { state: 'landing' as ChaloupeState, f: (p - 1.7) / 0.15, visible: true, ...dock };
  return { state: 'queue' as ChaloupeState, f: 1, visible: true, ...dock };
}
function makeChaloupe() {
  const g = new THREE.Group(); g.name = 'dakar-port-chaloupe';
  const b = new Batch();
  const W = 0xf4f3ee, GLASS = 0x1d4650, BLUE = 0x2f6f9f;
  plan(b, hullShape(22, 5.4, 7.5, 1.6), 2.4, W, 0, -0.7, 0, 0.12);                  // hull: pointed bow, rounded transom, flared by the bevel
  plan(b, hullShape(22.4, 5.8, 7.5, 1.6), 0.22, BLUE, 0, 0.35, 0);                  // waterline stripe
  plan(b, hullShape(21.4, 5.0, 7.0, 1.4), 0.3, 0xb7b0a0, 0, 1.78, 0);               // main deck planking
  plan(b, roundRect(13.6, 4.8, 2.0), 2.0, W, 1.4, 2.0, 0, 0.1);                      // lower cabin, rounded ends
  plan(b, roundRect(13.9, 4.95, 2.0), 0.95, GLASS, 1.4, 2.55, 0);                   // its window band
  for (let x = -4.8; x <= 7.6; x += 1.55) for (const z of [-2.5, 2.5]) b.box(0.1, 0.95, 0.1, x, 2.55, z * 0.99, W);   // mullions
  plan(b, roundRect(15.6, 5.8, 2.9), 0.22, W, 1.4, 4.0, 0, 0.16);                  // deck roof: sweeping overhang
  plan(b, roundRect(8.6, 4.2, 1.7), 1.7, W, 2.2, 4.3, 0, 0.1);                       // wheelhouse
  plan(b, roundRect(8.85, 4.35, 1.7), 0.85, GLASS, 2.2, 4.75, 0);                   // wheelhouse windows
  plan(b, roundRect(10.4, 5.2, 2.4), 0.2, W, 2.2, 6.0, 0, 0.14);                    // upper roof
  for (let i = 0; i < 4; i++) bar(b, [-1.7 + i * 1.4, 6.55, 1.5], [-0.5 + i * 1.4, 6.55, 1.5], 0.34, 0xf1efe9, 8);   // life rafts
  for (let i = 0; i < 4; i++) bar(b, [-1.7 + i * 1.4, 6.55, -1.5], [-0.5 + i * 1.4, 6.55, -1.5], 0.34, 0xf1efe9, 8);
  bar(b, [4.2, 6.2, 0], [4.2, 7.0, 0], 0.1, 0x8a8f94); bar(b, [3.4, 7.15, 0], [5.0, 7.15, 0], 0.07, 0x8a8f94);        // radar
  b.sphere(0.5, 0.2, 6.65, -1.7, 0xeceef0, true); b.sphere(0.4, 1.4, 6.6, 1.9, 0xeceef0, true);                       // satcom domes
  b.box(0.3, 0.45, 2.4, -2.2, 4.05, 3.02, 0xc72b2b); b.box(0.3, 0.45, 2.4, -2.2, 4.05, -3.02, 0xc72b2b);              // red LED boards under the overhang
  for (let x = -9.5; x <= 9.5; x += 1.6) for (const z of [-2.55, 2.55]) bar(b, [x, 1.95, z], [x, 2.9, z], 0.035, 0xeceeef, 4);   // rail posts
  for (const z of [-2.55, 2.55]) { bar(b, [-9.5, 2.9, z], [9.5, 2.9, z], 0.04, 0xeceeef, 4); bar(b, [-9.5, 2.45, z], [9.5, 2.45, z], 0.03, 0xeceeef, 4); }
  bar(b, [-9.5, 2.9, -2.55], [-9.5, 2.9, 2.55], 0.04, 0xeceeef, 4);
  bar(b, [-9, 0.45, -4.0], [-9, 1.95, -2.55], 0.4, 0x8c8c86, 4);                      // gangway to the pier (pier side is -z)
  bar(b, [-6, 4.0, 2.4], [-6, 1.9, 2.4], 0.05, 0xdddddd, 4); bar(b, [-6, 4.0, -2.4], [-6, 1.9, -2.4], 0.05, 0xdddddd, 4);   // stern stairs rails
  const mesh = b.build(material(), true, false); if (mesh) g.add(mesh);
  const sign = (z: number, rot: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.7), new THREE.MeshBasicMaterial({ map: signTexture('DAKAR · GORÉE', '#1f5a85', '#ffffff', 512, 56), side: THREE.DoubleSide }));
    m.position.set(4.2, 0.8, z); m.rotation.y = rot; g.add(m);
  };
  sign(2.88, 0); sign(-2.88, Math.PI);
  return g;
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
  addBatch(g, b);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.9),
    new THREE.MeshBasicMaterial({ map: signTexture('EMBARCADÈRE · GORÉE', '#16465f', '#f9df9f', 512, 80), side: THREE.DoubleSide }));
  sign.position.set(200.8, 3.2, 44); sign.rotation.y = -Math.PI / 2; g.add(sign);
  return g;
}
function makeCrane() {
  const group = new THREE.Group(); group.name = 'dakar-port-gantry'; group.position.set(188, 0, 5);
  const b = new Batch(), ORG = 0xd0663a, YEL = 0xe3aa3f;
  for (const z of [-4.2, 4.2]) {
    bar(b, [-6.2, 0, z], [-4.6, 20, z], 0.38, ORG, 6); bar(b, [6.2, 0, z], [4.6, 20, z], 0.38, ORG, 6);       // splayed legs
    bar(b, [-6.2, 0, z], [4.6, 20, z], 0.12, ORG); bar(b, [6.2, 0, z], [-4.6, 20, z], 0.12, ORG);              // X bracing
    bar(b, [-5.4, 9.5, z], [5.4, 9.5, z], 0.2, ORG);                                                           // mid struts
    b.box(14, 0.5, 0.9, 0, 0, z, 0x5b5f64);                                                                    // wheel bogies along the rail
  }
  for (const x of [-5.4, 5.4]) { bar(b, [x, 9.5, -4.2], [x, 9.5, 4.2], 0.2, ORG); bar(b, [x * 0.85, 19.6, -4.2], [x * 0.85, 19.6, 4.2], 0.24, ORG); }
  plan(b, roundRect(12, 10.6, 0.8), 1.2, 0xd8d3c8, 0, 20, 0, 0.1);                                          // portal frame / machinery house
  b.box(5, 2.2, 6, -3, 21.5, 0, 0xc9c4b8);
  // lattice boom (landside tail to the seaward tip), two girders with zig-zag diagonals
  for (const z of [-2.2, 2.2]) {
    bar(b, [-14, 21.7, z], [37, 21.7, z], 0.22, YEL); bar(b, [-14, 20.6, z], [37, 20.6, z], 0.18, YEL);
    for (let x = -14; x < 37; x += 3.4) { bar(b, [x, 20.6, z], [x + 1.7, 21.7, z], 0.07, YEL, 4); bar(b, [x + 1.7, 21.7, z], [x + 3.4, 20.6, z], 0.07, YEL, 4); }
  }
  for (let x = -14; x <= 37; x += 6.8) bar(b, [x, 20.6, -2.2], [x, 20.6, 2.2], 0.12, YEL, 4);
  // A-frame pylon with stays to the boom tip and the tail
  for (const z of [-2.2, 2.2]) bar(b, [0, 21.7, z], [0, 31, 0], 0.22, ORG);
  bar(b, [0, 31, 0], [37, 21.7, -2.2], 0.07, 0x30343a, 4); bar(b, [0, 31, 0], [37, 21.7, 2.2], 0.07, 0x30343a, 4);
  bar(b, [0, 31, 0], [-14, 21.7, -2.2], 0.07, 0x30343a, 4); bar(b, [0, 31, 0], [-14, 21.7, 2.2], 0.07, 0x30343a, 4);
  b.box(1, 0.3, 1, 0, 31, 0, 0xc72b2b);                                                                      // aviation light
  addBatch(group, b);
  const trolley = new THREE.Group(); group.add(trolley);
  const tb = new Batch();
  plan(tb, roundRect(4.4, 3.4, 0.5), 1.1, 0x3f5467, 0, 18.9, 0, 0.06);                                       // trolley frame
  plan(tb, roundRect(2.6, 2.4, 0.4), 1.5, 0xe9e6dc, 0, 17.4, 0, 0.05); plan(tb, roundRect(2.7, 2.5, 0.4), 0.7, 0x234a58, 0, 17.9, 0);   // operator cab and glass
  const th = tb.build(material(), true, false); if (th) trolley.add(th);
  const cable = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1, 0.07), new THREE.MeshBasicMaterial({ color: 0x23272c }));
  const spreader = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.3, 2.5), new THREE.MeshLambertMaterial({ color: 0xd9a349 }));
  const load = new THREE.Mesh(new THREE.BoxGeometry(BOX.l, BOX.h, BOX.w), new THREE.MeshLambertMaterial({ color: 0xb3483d, map: containerMap() }));
  trolley.add(cable, spreader, load);
  return { group, trolley, cable, spreader, load };
}
const shade = (c: number) => new THREE.Color(c).multiplyScalar(0.8).getHex();
function makeTruck(color: number, box: number) {
  const truck = new THREE.Group();
  const b = new Batch();
  b.box(2.2, 0.35, 8.2, 0, 0.55, -1.2, 0x30363b);                                    // chassis rails
  side(b, [[-1.1, 0], [1.3, 0], [1.3, 1.1], [0.75, 1.25], [0.2, 2.55], [-0.95, 2.55], [-1.1, 2.4]], 2.4, color, 0, 0.7, 2.6);   // cab: hood, raked windscreen, roof
  side(b, [[-0.7, 1.6], [0.3, 1.6], [0.15, 2.35], [-0.7, 2.35]], 2.46, 0x1f3d4c, 0, 0.7, 2.6);                                   // side windows
  b.box(2.4, 0.3, 0.3, 0, 0.9, 3.95, 0x2b2f33);                                      // bumper
  for (const x of [-0.8, 0.8]) b.box(0.4, 0.22, 0.1, x, 1.45, 3.9, 0xf2e29a);        // headlights
  b.box(0.3, 0.9, 0.3, 1.2, 2.5, 2.4, 0x888e94);                                    // exhaust stack
  b.cyl(0.9, 0.9, 0.25, 0, 0.9, -0.4, 0x23272b, 10);                                // fifth wheel
  b.box(2.5, 0.28, 6.2, 0, 0.9, -4.6, 0x2b3035);                                    // trailer bed
  b.box(2.4, 2.6, 5.9, 0, 1.18, -4.6, box);                                         // 20 ft container
  for (const sx of [-1, 1]) for (let i = 0; i < 11; i++) b.box(0.07, 2.4, 0.12, sx * 1.22, 1.28, -7.4 + i * 0.52, shade(box));  // ribs
  for (const [x, z] of [[-1.15, 3], [1.15, 3], [-1.15, -0.6], [1.15, -0.6], [-1.15, -5.5], [1.15, -5.5], [-1.15, -6.6], [1.15, -6.6]])
    bar(b, [x - 0.15, 0.5, z], [x + 0.15, 0.5, z], 0.5, 0x1d2024, 10);              // wheels
  addBatch(truck, b);
  return truck;
}
class PortScene {
  readonly group = new THREE.Group();
  private crane = makeCrane();
  private chaloupe = makeChaloupe();
  private riders: Humanoid[] = [];
  private trucks = [makeTruck(0xf0d6a0, 0x24486c), makeTruck(0xc85e38, 0xc3a25f)];
  constructor(hub: HubWorld, private state: GameState) {
    this.group.name = 'portwise-dakar-prototype';
    const b = new Batch();
    b.box(73, 0.12, 150, 164.5, 0.02, 0, 0xb8b1a1);
    b.box(70, 0.04, 6, 153, 0.14, 0, 0x6d7479); // walk from the Plateau's east road
    b.box(2.5, 0.2, 145, 197.5, 0.14, 0, 0x8e8d85);
    for (let z = -65; z < 65; z += 10) b.box(1.5, 0.03, 0.3, 185, 0.18, z, 0xe4d09a);
    b.box(15, 3.2, 5, 156, 0.12, 60, 0x647a85);                       // customs shed: walls, gable roof, loading doors
    side(b, [[-2.9, 0], [2.9, 0], [2.9, 0.5], [0, 1.6], [-2.9, 0.5]], 15.6, 0x56626b, 156, 3.3, 60.2);
    for (let i = 0; i < 4; i++) b.box(2.6, 2.4, 0.15, 150 + i * 4, 0.12, 57.4, 0x3f5160);
    for (let z = -70; z <= 70; z += 14) { bar(b, [196.8, 0.14, z], [196.8, 0.65, z], 0.22, 0x2b2f33, 7); b.cyl(0.34, 0.3, 0.2, 196.8, 0.62, z, 0x3a3f44, 7); }   // bollards
    for (const z of [-48, -14, 20, 56]) { bar(b, [193, 0.14, z], [193, 11, z], 0.16, 0x70777e, 6); b.box(2.4, 0.3, 0.6, 193, 11, z, 0xdde2e6); }   // flood-light masts
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
    this.group.add(makeShip(), this.crane.group, makeFerryPier(), this.chaloupe);
    const jetty = new Batch(); // jetée: breakwater closing the basin to the east (decor)
    jetty.box(5, 2.2, 150, 322, 0.1, -5, 0x7d776d);
    addBatch(this.group, jetty);
    const yard = [];
    for (let i = 0; i < 10; i++) for (let j = 0; j < 5; j++)
      yard.push({ x: 141 + i * 2.9, y: 1.42 + ((i + j) % 3 === 0 ? 2.6 : 0), z: -66 + j * 6.5 });
    containers(this.group, yard, Math.PI / 2);
    this.trucks.forEach(t => this.group.add(t));
    // Quay fence with a gap for the Gorée ferry pier (south môle): the only way onto the water side.
    hub.colliders.push({ x0: 198, x1: 199.5, z0: -75, z1: 40, h: 1.3 });
    hub.colliders.push({ x0: 198, x1: 199.5, z0: 48, z1: 75, h: 1.3 });
    for (const [z0, z1] of [[39.6, 40], [48, 48.4]]) hub.colliders.push({ x0: 199.5, x1: 232, z0, z1, h: 1.3 });
    hub.colliders.push({ x0: 231.6, x1: 232, z0: 40, z1: 48, h: 1.3 });
    hub.bounds.x1 = 232;
    hub.colliders.push({ x0: 149, x1: 164, z0: 58, z1: 63, h: 4.3 });
    hub.colliders.push({ x0: 139, x1: 169.5, z0: -70, z1: -35, h: 5 });
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
  /** The chaloupe follows the game clock; five passengers queue on the pier, walk aboard, ride, and walk off again. */
  private updateChaloupe(hour: number, dt: number) {
    if (!this.riders.length && humanoidReady()) {
      let k = 21; const R = () => ((k = (k * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 5; i++) { const h = new Humanoid(randomLook(R)); h.group.visible = false; this.group.add(h.group); this.riders.push(h); }
    }
    const c = chaloupePose(hour), ch = this.chaloupe;
    ch.visible = c.visible; ch.position.set(c.x, 0, c.z);
    ch.rotation.y += (c.yaw - ch.rotation.y) * (c.state === 'sailing' || c.state === 'returning' ? Math.min(1, dt * 1.5) : 1);
    this.riders.forEach((h, i) => {
      const queue = { x: 204 + (i % 3) * 0.9, z: 42.3 + Math.floor(i / 3) * 1.1 }, deck = { x: CHALOUPE_DOCK.x - 8.4 + i * 0.7, z: CHALOUPE_DOCK.z + 0.8 * (i % 2 ? 1 : -1) };
      const gang = { x: CHALOUPE_DOCK.x - 9, z: 49.2 }, at = (a: { x: number; z: number }, b: { x: number; z: number }, f: number) => ({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f });
      let pos: { x: number; z: number } | null = null, y = 0.22; const climb = (t: number) => 0.22 + 1.73 * unit(t);
      const f = unit((c.f - i * 0.08) / 0.7);
      if (c.state === 'queue') pos = c.f < 1 || hour >= 6 ? queue : null;
      else if (c.state === 'boarding') pos = f < 0.5 ? at(queue, gang, f * 2) : at(gang, deck, f * 2 - 1), y = climb((f - 0.5) * 2);
      else if (c.state === 'sailing' || c.state === 'returning') { pos = { x: c.x, z: c.z }; }
      else if (c.state === 'landing') pos = f < 0.5 ? at(deck, gang, f * 2) : at(gang, queue, f * 2 - 1), y = climb(1 - f * 2);
      h.group.visible = !!pos && c.visible && c.state !== 'idle';
      if (!pos) return;
      if (c.state === 'sailing' || c.state === 'returning') {                       // on the deck: ride along, turned with the boat
        const cs = Math.cos(ch.rotation.y), sn = Math.sin(ch.rotation.y), lx = deck.x - CHALOUPE_DOCK.x, lz = deck.z - CHALOUPE_DOCK.z;
        h.group.position.set(c.x + lx * cs + lz * sn, 1.95, c.z - lx * sn + lz * cs); h.group.rotation.y = ch.rotation.y + Math.PI / 2;
      } else {
        const px = h.group.position.x, pz = h.group.position.z; h.group.position.set(pos.x, y, pos.z);
        if (Math.hypot(pos.x - px, pos.z - pz) > 0.002) h.group.rotation.y = Math.atan2(pos.x - px, pos.z - pz);
        else h.group.rotation.y = c.state === 'boarding' ? Math.PI / 2 : c.state === 'landing' ? -Math.PI / 2 : Math.PI / 2;
      }
      h.animate(dt, 0);
    });
  }
  private placePeople() {
    if (this.people.length || !humanoidReady()) return;
    let k = 7; const R = () => ((k = (k * 16807) % 2147483647) / 2147483647);
    // Mamadou the docker by the stacks, the passeur on the pier, the coffee seller at the gate
    for (const [x, z, yaw, clip] of [[161, -16.6, 0, 'Idle'], [205, 46.6, Math.PI, 'Talk'], [130.4, 10, -Math.PI / 2, 'Talk']] as const) {
      const h = new Humanoid(randomLook(R)); h.group.position.set(x, 0.12, z); h.group.rotation.y = yaw; h.hold = clip;
      this.group.add(h.group); this.people.push(h);
    }
  }
  info(hour: number) { const c = chaloupePose(hour); return { state: c.state, visible: this.chaloupe.visible, x: +this.chaloupe.position.x.toFixed(1), z: +this.chaloupe.position.z.toFixed(1), riders: this.riders.filter(h => h.group.visible).length }; }
  update(seconds: number, hour: number, dt = 0) {
    this.placePeople(); for (const h of this.people) h.animate(dt, 0);
    this.updateChaloupe(hour, dt);
    const p = portCranePose(seconds);
    this.crane.trolley.position.x = p.x;
    this.crane.spreader.position.y = p.y + 1.6;
    this.crane.load.position.y = p.y; this.crane.load.visible = p.carrying;
    const len = Math.max(0.2, 18.9 - p.y - 1.6);
    this.crane.cable.scale.y = len; this.crane.cable.position.y = 18.9 - len / 2;
    this.trucks.forEach((t, i) => {
      const s = portTruckPose(seconds, i * 17); t.position.set(s.x, 0.1, s.z); t.rotation.y = s.yaw;
    });
  }
  dispose() {
    for (const h of [...this.people, ...this.riders]) h.dispose(); this.people = []; this.riders = [];
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
    { id: 'aller_goree', label: 'Prendre la chaloupe pour Gorée', detail: 'Départs toutes les 2 h · décor pour l’instant', seconds: 0,
      requires: () => 'La traversée sera ouverte avec l’île de Gorée' },
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
  update(ctx, dt) { scene?.update(ctx.now() / 1000, ctx.hour(), dt); },
  debug() { return { chaloupe: (hour: number) => scene?.info(hour) ?? null, portPrototype: () => ({ enabled: !!scene, ships: scene ? 1 : 0, cranes: scene ? 1 : 0, containers: scene ? 50 : 0, trucks: scene ? 2 : 0, x: 135, z: 0 }) }; },
};
