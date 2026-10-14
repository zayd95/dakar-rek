import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { HubWorld } from '../world/types';
import type { Seat } from '../interact/seats';
import type { Target } from '../interact/types';
import { Batch, signTexture } from '../world/batch';
import { MAGIC } from '../world/city';
import { signPanel } from '../economy/citeJamm';
import { Humanoid, humanoidReady, randomLook } from '../actors/humanoid';
import { rng } from '../core/rng';
import { conversation, nightOf } from './venue';

/**
 * Magic Land Lite (Corniche): a small fairground on the block east of Soumbédioune, across the road from the fishing
 * village: a gate on the promenade side, a grande roue (the landmark, 22 m), a pirate ship, a baby-foot for two, three
 * snack kiosks and an « I ♥ DAKAR » photo corner, lit for the evening. Rides pay a ticket from the wallet, riders sit on
 * moving locked seats of the shared registry (like a car rapide's), the kiosks use the same order menu as the rooftops.
 * Benches, trees, crowd and ground are the city block's (src/world/city.ts 'magicland'). No coaster, no fuel, no new economy.
 * Local frame: the park centre is (MAGIC.cx, MAGIC.cz), the gate in the west side (toward Soumbédioune), +x east, +z south.
 */
const G = 0.12;
const W = (lx: number, lz: number) => ({ x: MAGIC.cx + lx, z: MAGIC.cz + lz });
const FEE = { wheel: 1500, ship: 1000, foot: 200 };
const WHEEL = { lx: 10, lz: -7, hubY: 11.2, R: 9.6, n: 10, idle: 0.1, speed: 0.3, turns: 1.5 };
const SHIP = { lx: 9, lz: 14, pivotY: 7.2, L: 5.4, amp: 0.85, secs: 26 };
const FOOT = { lx: -10, lz: 11 };
const KIOSKS = [
  { id: 'barbe', lx: -15, lz: -20, name: 'Barbe à papa & glaces', color: 0xe8528a, menu: [{ n: 'Barbe à papa', i: '🍭', p: 500, faim: 6, moral: 7 }, { n: 'Glace vanille', i: '🍦', p: 700, faim: 8, moral: 6 }, { n: 'Glace coco', i: '🍨', p: 800, faim: 8, moral: 7 }] },
  { id: 'beignet', lx: -6, lz: -20, name: 'Beignets & jus', color: 0xf2a900, menu: [{ n: 'Beignets', i: '🥯', p: 500, faim: 18, moral: 4 }, { n: 'Jus de bissap', i: '🍹', p: 600, faim: 6, moral: 5 }, { n: 'Jus de bouye', i: '🥤', p: 600, faim: 6, moral: 5 }] },
  { id: 'brochette', lx: 20, lz: -19, name: 'Brochettes & maïs grillé', color: 0x2f9d6a, menu: [{ n: 'Brochettes', i: '🍢', p: 1200, faim: 32, moral: 4 }, { n: 'Maïs grillé', i: '🌽', p: 500, faim: 16, moral: 3 }, { n: 'Eau fraîche', i: '💧', p: 200, faim: 2, moral: 2 }] },
] as const;
const PHOTO = { lx: -15, lz: -6.5 };

interface Built {
  lamps: THREE.MeshLambertMaterial[];
  hub: HubWorld; group: THREE.Group; glowMat: THREE.MeshBasicMaterial;
  wheel: { rot: THREE.Object3D; cars: THREE.Mesh[]; seats: Seat[]; angle: number; omega: number };
  ship: { hull: THREE.Group; seats: Seat[]; phi: number };
  opponent: Humanoid | null; board: THREE.Mesh; boardTex: THREE.CanvasTexture;
}
type Ride = { kind: 'wheel'; phase: 'boarding' | 'riding' | 'stopping'; car: number; angleEnd: number; t: number }
  | { kind: 'ship'; t: number; seat: Seat }
  | { kind: 'foot'; phase: 'arriving' | 'play'; t: number; me: number; adv: number; round: number };
let built: Built | null = null, ride: Ride | null = null, ctxRef: GameCtx | null = null, rnd: () => number = Math.random;
const money = (n: number) => `${n.toLocaleString('fr-FR').replace(/[  ]/g, ' ')} F`;

function lit(b: Batch, x: number, y: number, z: number, c: number) { b.sphere(0.07, x, y, z, c); }

function build(ctx: GameCtx, hub: HubWorld): Built {
  const group = new THREE.Group(); group.name = 'magic_land';
  const solid = new Batch(), glow = new Batch();
  const col = (lx: number, lz: number, w: number, d: number, h: number) => { const p = W(lx, lz); hub.colliders.push({ x0: p.x - w / 2, z0: p.z - d / 2, x1: p.x + w / 2, z1: p.z + d / 2, h }); };
  const box = (w: number, h: number, d: number, lx: number, lz: number, c: number, y = G, rot = 0) => { const p = W(lx, lz); solid.box(w, h, d, p.x, y, p.z, c, rot); };
  const bulbs = (lx0: number, lz0: number, lx1: number, lz1: number, y: number, n: number, cols = [0xffd166, 0xff6b9d, 0x6bd5ff, 0xa6e86b]) => { for (let i = 0; i <= n; i++) { const t = i / n, p = W(lx0 + (lx1 - lx0) * t, lz0 + (lz1 - lz0) * t); lit(glow, p.x, y - Math.sin(t * Math.PI) * 0.25, p.z, cols[i % cols.length]); } };
  const panel = (text: string, bg: string, fg: string, lx: number, lz: number, y: number, yawFacing: number, w: number, h: number) => {
    const m = signPanel(signTexture(text, bg, fg, 512, Math.round(512 * h / w)), w, h), p = W(lx, lz); m.position.set(p.x, y, p.z); m.rotation.y = yawFacing; group.add(m); hub.signs.push(m);
  };

  // ---- gate (west side, toward Soumbédioune) and the fence around the rest of the block
  for (const sz of [-3.7, 3.7]) { for (let k = 0; k < 6; k++) box(0.9, 0.7, 0.9, -22.3, sz, k % 2 ? 0xf7e7b4 : 0x2a6fb3, G + k * 0.7); col(-22.3, sz, 1, 1, 4.2); }
  box(1.2, 0.6, 8.6, -22.3, 0, 0x6a1b9a, G + 4.2);
  panel('MAGIC LAND', '#6a1b9a', '#ffe082', -23.0, 0, G + 5.35, -Math.PI / 2, 8.6, 1.5);
  bulbs(-22.9, -4.2, -22.9, 4.2, G + 4.0, 18);
  const fence = (lx: number, lz: number, w: number, d: number) => { box(w, 1.3, d, lx, lz, 0x2a6fb3); box(w + 0.1, 0.12, d + 0.1, lx, lz, 0xf7e7b4, G + 1.3); col(lx, lz, w, d, 1.3); };
  fence(0, -22.3, 44.6, 0.3); fence(0, 22.3, 44.6, 0.3); fence(22.3, 0, 0.3, 44.6);
  fence(-22.3, -13.2, 0.3, 18.4); fence(-22.3, 13.2, 0.3, 18.4);

  // ---- the grande roue: fixed frame here, the rim/spokes/bulbs turn with the group, the cars hang under the rim
  const wp = W(WHEEL.lx, WHEEL.lz), P = WHEEL;
  const frame = (side: number) => { for (const sz of [-1, 1]) { const len = Math.hypot(5.2, P.hubY), m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, len, 6), new THREE.MeshLambertMaterial({ color: 0xf5f5f0 })); m.position.set(wp.x + side * 1.35, G + P.hubY / 2, wp.z + sz * 2.6); m.rotation.x = -sz * Math.atan2(5.2, P.hubY); group.add(m); } };
  frame(-1); frame(1);
  const hubM = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3.2, 12), new THREE.MeshLambertMaterial({ color: 0xe8528a })); hubM.rotation.z = Math.PI / 2; hubM.position.set(wp.x, G + P.hubY, wp.z); group.add(hubM);
  const rimB = new Batch(), rimG = new Batch();
  const rotRoot = new THREE.Group(); rotRoot.position.set(wp.x, G + P.hubY, wp.z); group.add(rotRoot);
  for (const sx of [-0.55, 0.55]) { const t = new THREE.TorusGeometry(P.R, 0.11, 6, 48); t.rotateY(Math.PI / 2); rimB.geometry(t, sx < 0 ? 0xf5f5f0 : 0x2a6fb3, sx, 0, 0); }
  const spoke = new THREE.BoxGeometry(0.08, 0.08, P.R);
  for (let k = 0; k < P.n; k++) { const m = new THREE.Mesh(spoke, new THREE.MeshLambertMaterial({ color: k % 2 ? 0xf5f5f0 : 0xe8528a })); const a = (k / P.n) * Math.PI; m.position.set(0, 0, 0); m.rotation.x = a; m.scale.z = 2; rotRoot.add(m); }
  for (let k = 0; k < 40; k++) { const a = (k / 40) * Math.PI * 2; rimG.sphere(0.12, 0.6 * (k % 2 ? 1 : -1), Math.cos(a) * P.R, Math.sin(a) * P.R, [0xffd166, 0xff6b9d, 0x6bd5ff, 0xa6e86b][k % 4]); }
  const rimMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const rimM = rimB.build(rimMat, true, false); if (rimM) rotRoot.add(rimM);
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const rg = rimG.build(glowMat, false, false); if (rg) rotRoot.add(rg);
  const carCols = [0xe8528a, 0xf2a900, 0x2a6fb3, 0x2f9d6a, 0x8e44ad], cars: THREE.Mesh[] = [], carSeats: Seat[] = [];
  const carGeo = new THREE.BoxGeometry(1.5, 0.9, 1.6);
  for (let k = 0; k < P.n; k++) {
    const m = new THREE.Mesh(carGeo, new THREE.MeshLambertMaterial({ color: carCols[k % carCols.length] })); group.add(m); cars.push(m);
    const s = ctx.seats.add({ id: `corniche:magic:wheel:${k}`, x: wp.x, z: wp.z, top: 0.6, yaw: -Math.PI / 2, kind: 'bench', space: 'street', occupant: null, locked: true } as Seat);
    carSeats.push(s);
  }
  col(WHEEL.lx, WHEEL.lz - 2.6, 1, 1, 2); col(WHEEL.lx, WHEEL.lz + 2.6, 1, 1, 2);
  // boarding platform and ticket booth
  box(5, 0.16, 4.5, WHEEL.lx - 0.5, WHEEL.lz, 0xcfa56c, G); box(1.9, 2.4, 1.7, WHEEL.lx - 5.5, WHEEL.lz + 3.8, 0xf2a900); box(2.3, 0.18, 2.1, WHEEL.lx - 5.5, WHEEL.lz + 3.8, 0xe8528a, G + 2.4);
  col(WHEEL.lx - 5.5, WHEEL.lz + 3.8, 1.9, 1.7, 2.4);
  panel('GRANDE ROUE · 1 500 F', '#1d2a3a', '#ffe7a8', WHEEL.lx - 5.5, WHEEL.lz + 4.7, G + 3.2, 0, 3.2, 0.7);

  // ---- the pirate ship: two A-frame towers, the swinging hull hangs from the pivot
  const sp = W(SHIP.lx, SHIP.lz);
  for (const sz of [-1.6, 1.6]) for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 7.6, 6), new THREE.MeshLambertMaterial({ color: 0x8a5a2b })); m.position.set(sp.x + sx * 1.3, G + SHIP.pivotY / 2, sp.z + sz); m.rotation.z = -sx * 0.18; group.add(m); }
  col(SHIP.lx, SHIP.lz, 4.6, 4.2, 2);
  const hull = new THREE.Group(); hull.position.set(sp.x, G + SHIP.pivotY, sp.z); group.add(hull);
  const hb = new Batch();
  hb.box(6.2, 0.35, 2.2, 0, -SHIP.L, 0, 0x5b3a1e); hb.box(5.6, 0.7, 2.3, 0, -SHIP.L + 0.35, 0, 0xb5532f); hb.box(6.4, 0.18, 2.4, 0, -SHIP.L + 1.05, 0, 0xf7e7b4);
  hb.box(0.18, 1.6, 0.18, 0, -SHIP.L + 1.2, 0, 0x4a2f16); hb.box(1.3, 0.9, 0.04, 0.7, -SHIP.L + 2.4, 0, 0x1c1c1f);
  for (const sz of [-0.55, 0.55]) hb.box(0.1, SHIP.L, 0.1, 2.4, -SHIP.L / 2, sz, 0xdddddd), hb.box(0.1, SHIP.L, 0.1, -2.4, -SHIP.L / 2, sz, 0xdddddd);
  for (const [sx, sz] of [[-1.1, -0.7], [1.1, -0.7], [-1.1, 0.7], [1.1, 0.7]]) hb.box(0.6, 0.12, 0.45, sx, -SHIP.L + 0.9, sz, 0x2a6fb3);
  const hm = hb.build(new THREE.MeshLambertMaterial({ vertexColors: true }), true, true); if (hm) hull.add(hm);
  const shipSeats: Seat[] = [[-1.1, -0.7], [1.1, -0.7], [-1.1, 0.7], [1.1, 0.7]].map(([, sz], i) => ctx.seats.add({ id: `corniche:magic:ship:${i}`, x: sp.x, z: sp.z, top: 1, yaw: sz > 0 ? Math.PI : 0, kind: 'bench', space: 'street', occupant: null, locked: true } as Seat));
  void shipSeats;
  box(5.6, 0.16, 4.2, SHIP.lx, SHIP.lz + 0.2, 0xcfa56c, G); box(1.8, 2.3, 1.6, SHIP.lx + 5.5, SHIP.lz + 4, 0x6a1b9a); col(SHIP.lx + 5.5, SHIP.lz + 4, 1.8, 1.6, 2.3);
  panel('BATEAU PIRATE · 1 000 F', '#1d2a3a', '#ffe7a8', SHIP.lx + 5.5, SHIP.lz + 4.9, G + 3.1, 0, 3.2, 0.7);

  // ---- the baby-foot under a little canopy
  const fp = W(FOOT.lx, FOOT.lz);
  box(1.7, 0.78, 0.95, FOOT.lx, FOOT.lz, 0x7a4a22, G); box(1.5, 0.05, 0.78, FOOT.lx, FOOT.lz, 0x2f9d4a, G + 0.78); col(FOOT.lx, FOOT.lz, 1.7, 0.95, 0.9);
  for (const dx of [-0.5, 0, 0.5]) { box(0.05, 0.05, 1.3, FOOT.lx + dx, FOOT.lz, 0xcfcfcf, G + 0.95); for (const dz of [-0.2, 0.2]) box(0.08, 0.2, 0.08, FOOT.lx + dx, FOOT.lz + dz, dx < 0 ? 0xd9482b : 0x2a6fb3, G + 0.8); }
  for (const dx of [-3, 3]) for (const dz of [-2.6, 2.6]) box(0.14, 3.0, 0.14, FOOT.lx + dx, FOOT.lz + dz, 0xf5f5f0); col(FOOT.lx, FOOT.lz - 2.6, 6.2, 0.4, 3);
  for (let k = 0; k < 5; k++) box(1.3, 0.12, 5.4, FOOT.lx - 2.6 + k * 1.3, FOOT.lz, k % 2 ? 0xf5f5f0 : 0xd9482b, G + 3.0);
  bulbs(FOOT.lx - 3, FOOT.lz - 2.6, FOOT.lx + 3, FOOT.lz - 2.6, G + 2.9, 10); bulbs(FOOT.lx - 3, FOOT.lz + 2.6, FOOT.lx + 3, FOOT.lz + 2.6, G + 2.9, 10);
  const boardTex = (() => { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: boardTex })); board.position.set(fp.x, G + 3.55, fp.z + 2.7); group.add(board);
  panel('BABY-FOOT · 200 F', '#1d2a3a', '#ffe7a8', FOOT.lx, FOOT.lz - 2.9, G + 3.5, Math.PI, 3.0, 0.62);

  // ---- snack kiosks
  for (const k of KIOSKS) {
    box(3.6, 2.4, 2.2, k.lx, k.lz, 0xf5f5f0); box(3.8, 0.2, 2.6, k.lx, k.lz + 0.2, k.color, G + 2.4); for (let s = 0; s < 6; s++) box(0.6, 0.5, 0.06, k.lx - 1.5 + s * 0.6, k.lz + 1.6, s % 2 ? 0xf5f5f0 : k.color, G + 2.0);
    col(k.lx, k.lz, 3.6, 2.2, 2.4); bulbs(k.lx - 1.8, k.lz + 1.6, k.lx + 1.8, k.lz + 1.6, G + 2.0, 8);
    panel(k.name.toUpperCase(), '#1d2a3a', '#ffe7a8', k.lx, k.lz + 1.2, G + 3.05, 0, 3.4, 0.55);
  }

  // ---- photo corner « I ♥ DAKAR »
  for (const dx of [-1.9, 1.9]) box(0.14, 2.6, 0.14, PHOTO.lx + dx, PHOTO.lz, 0x6a1b9a);
  panel('I ♥ DAKAR', '#e8528a', '#fff7e0', PHOTO.lx, PHOTO.lz + 0.1, G + 2.0, 0, 3.8, 1.5);
  box(5, 0.1, 2.2, PHOTO.lx, PHOTO.lz + 2.0, 0xf7e7b4, G); for (const dx of [-0.5, 0.5]) box(0.25, 0.02, 0.5, PHOTO.lx + dx, PHOTO.lz + 2.3, 0x2a6fb3, G + 0.1);
  col(PHOTO.lx, PHOTO.lz, 4, 0.4, 2.6);
  // a few string lights over the promenade
  bulbs(-22, -3.4, 0, -3.4, G + 4.2, 16); bulbs(-22, 3.4, 0, 3.4, G + 4.2, 16);
  for (const lx of [-22, -12, -2]) for (const sz of [-3.4, 3.4]) box(0.1, 4.2, 0.1, lx, sz, 0x4a4a52);

  const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true }), lamps: THREE.MeshLambertMaterial[] = [solidMat, rimMat];
  const sm = solid.build(solidMat, true, true); if (sm) group.add(sm);
  for (const m of cars) lamps.push(m.material as THREE.MeshLambertMaterial);
  const gm = glow.build(glowMat, false, false); if (gm) group.add(gm);
  ctx.extra.add(group);
  // the opponent of the baby-foot (only visible during a match)
  let opponent: Humanoid | null = null;
  if (humanoidReady()) { opponent = new Humanoid({ ...randomLook(rng(311)), style: 'tee', top: 0xd9482b, bottom: 0x2b2f3a, female: false }); opponent.hold = 'Idle'; opponent.group.position.set(fp.x, G + 0.05, fp.z + 1.1); opponent.group.rotation.y = Math.PI; opponent.group.visible = false; ctx.extra.add(opponent.group); }
  const hullMat = hm ? (hm.material as THREE.MeshLambertMaterial) : null; if (hullMat) lamps.push(hullMat);
  return { lamps, hub, group, glowMat, wheel: { rot: rotRoot, cars, seats: carSeats, angle: 0, omega: WHEEL.idle }, ship: { hull, seats: shipSeats, phi: 0 }, opponent, board, boardTex };
}

function drawBoard(b: Built, me: number | null, adv: number, text = '') {
  const c = b.boardTex.image as HTMLCanvasElement, g = c.getContext('2d')!;
  g.fillStyle = '#10223a'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#ffe082'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 30px system-ui, sans-serif';
  g.fillText(me === null ? (text || 'BABY-FOOT') : `TOI ${me} – ${adv} ADV`, 128, 34);
  b.boardTex.needsUpdate = true;
}

const unwrap = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
/** Angle still to turn before wheel car k is at the bottom (0). */
const toBottom = (b: Built, k: number) => unwrap(-(b.wheel.angle + (k / WHEEL.n) * Math.PI * 2));

function pay(ctx: GameCtx, amount: number, label: string): boolean {
  if (ctx.state.wallet < amount) { ctx.toast(`Il te faut ${money(amount)} · ${money(ctx.state.wallet)} dans ta poche`); return false; }
  ctx.state.addMoney(-amount, `Magic Land : ${label}`); ctx.state.count('magicland'); return true;
}
function endRide(ctx: GameCtx, exit: { lx: number; lz: number; yaw: number }, msg: string) {
  ctx.player.standUp(true);
  const p = W(exit.lx, exit.lz); ctx.player.place(p.x, p.z, exit.yaw);
  ride = null; ctx.setMode('play'); ctx.state.adjust({ moral: 10, social: 3 }); ctx.toast(msg); ctx.save();
}

function startWheel(ctx: GameCtx, b: Built) {
  if (ride) return;
  if (!pay(ctx, FEE.wheel, 'grande roue')) return;
  let car = 0, best = Infinity; for (let k = 0; k < WHEEL.n; k++) { const d = toBottom(b, k); if (d < best) { best = d; car = k; } }
  ride = { kind: 'wheel', phase: 'boarding', car, angleEnd: 0, t: 0 }; ctx.setMode('busy');
  ctx.toast('La grande roue ralentit… embarquement');
}
function startShip(ctx: GameCtx, b: Built) {
  if (ride) return;
  if (!pay(ctx, FEE.ship, 'bateau pirate')) return;
  const seat = b.ship.seats.find(s => !s.occupant) ?? b.ship.seats[0];
  const p = W(SHIP.lx, SHIP.lz + 2.6); ctx.player.place(p.x, p.z, 0);
  ctx.seats.release(seat.id, 'player'); ctx.player.sit(seat);
  if (ctx.player.seated()?.id !== seat.id) { ctx.state.addMoney(FEE.ship, 'Magic Land : remboursé'); return; }
  ride = { kind: 'ship', t: 0, seat }; ctx.toast('Accrochez-vous ! Le bateau pirate se balance');
}

function startFoot(ctx: GameCtx, b: Built) {
  if (ride) return;
  if (!pay(ctx, FEE.foot, 'baby-foot')) return;
  const p = W(FOOT.lx, FOOT.lz - 1.2); ctx.player.place(p.x, p.z, 0); ctx.setMode('busy');
  ride = { kind: 'foot', phase: 'arriving', t: 0, me: 0, adv: 0, round: 0 };
  drawBoard(b, null, 0, 'EN ATTENTE…'); ctx.toast('Tu prends la place côté nord · un adversaire arrive');
}
function footRound(ctx: GameCtx, b: Built, line: string) {
  const r = ride; if (!r || r.kind !== 'foot') return;
  const shots = [{ label: 'Tir puissant', icon: '💥', p: 0.46, risk: 0.30 }, { label: 'Tir placé', icon: '🎯', p: 0.56, risk: 0.22 }, { label: 'Une-deux avec l’attaquant', icon: '🔁', p: 0.5, risk: 0.14 }];
  const over = () => r.me >= 3 || r.adv >= 3 || r.round >= 9;
  const finish = (): null => {
    const won = r.me > r.adv; drawBoard(b, r.me, r.adv); if (b.opponent) b.opponent.group.visible = false;
    ctx.state.adjust({ moral: won ? 12 : 6, social: 6 }); if (won) ctx.state.count('babyfoot_victoires');
    ctx.setMode('play'); ride = null; ctx.toast(won ? `🏆 Victoire ${r.me}–${r.adv} !` : r.me === r.adv ? `Match nul ${r.me}–${r.adv}` : `Défaite ${r.me}–${r.adv} · revanche ?`); ctx.save(); return null;
  };
  conversation(ctx, 'Baby-foot', line, shots.map(s => ({ label: s.label, icon: s.icon, pick: () => {
    r.round++; const u = rnd(), v = rnd(); let say: string;
    if (u < s.p) { r.me++; say = 'BUT ! '; } else if (v < s.risk) { r.adv++; say = 'But de l’adversaire… '; } else say = 'Arrêt ! ';
    drawBoard(b, r.me, r.adv);
    if (over()) return finish() ?? null;
    return `${say}Score ${r.me}–${r.adv}. On continue : choisis ton coup.`;
  } })));
}

export const MagicLandModule: GameModule = {
  name: 'magicland',
  init(ctx) {
    ctxRef = ctx;
    ctx.interactions.add({ name: 'magicland', collect: (space, x, z, out: Target[]) => {
      const b = built; if (!b || space !== 'street') return;
      const near = (lx: number, lz: number, r: number) => { const p = W(lx, lz); return Math.hypot(p.x - x, p.z - z) < r; };
      const spot = (id: string, name: string, lx: number, lz: number, r: number, label: string, icon: string, detail: string, run: () => void, disabled: string | null = null) => {
        const p = W(lx, lz); out.push({ id: `magic:${id}`, name, kind: 'counter', space, x: p.x, z: p.z, radius: r, bias: 0.8, affordances: () => [{ id, verb: 'browse', label, icon, detail, disabled, run }] });
      };
      const busy = ride ? 'Une activité est en cours' : null;
      if (ride && ride.kind !== 'foot') {
        out.push({ id: 'magic:ride', name: 'Magic Land', kind: 'self', space, x, z, radius: 1, bias: -2, affordances: () => [{ id: 'enjoy', verb: 'inspect', label: ride && ride.kind === 'wheel' ? 'Profite de la vue' : 'Accroche-toi !', icon: '🎡', disabled: 'Tu descendras à la fin du tour', run: () => {} }] });
        return;
      }
      if (near(WHEEL.lx - 5.5, WHEEL.lz + 3.8, 4)) spot('wheel', 'Grande roue', WHEEL.lx - 5.5, WHEEL.lz + 5, 4, `Grande roue · ${money(FEE.wheel)}`, '🎡', 'Un tour lent, belle vue sur la Corniche', () => startWheel(ctxRef!, b), busy ?? (ctxRef!.state.wallet < FEE.wheel ? 'Pas assez d’argent' : null));
      if (near(SHIP.lx + 5.5, SHIP.lz + 4, 4)) spot('ship', 'Bateau pirate', SHIP.lx + 5.5, SHIP.lz + 5, 4, `Bateau pirate · ${money(FEE.ship)}`, '🏴‍☠️', 'Un balancement de 25 secondes', () => startShip(ctxRef!, b), busy ?? (ctxRef!.state.wallet < FEE.ship ? 'Pas assez d’argent' : null));
      if (near(FOOT.lx, FOOT.lz - 1.6, 3.2)) spot('foot', 'Baby-foot', FOOT.lx, FOOT.lz - 1.6, 3.2, `Jouer au baby-foot · ${money(FEE.foot)}`, '⚽', 'Deux places : un adversaire prend la place en face · premier à 3', () => startFoot(ctxRef!, b), busy ?? (ctxRef!.state.wallet < FEE.foot ? 'Pas assez d’argent' : null));
      if (near(PHOTO.lx, PHOTO.lz + 2.2, 3.4)) spot('photo', 'Coin photo', PHOTO.lx, PHOTO.lz + 2.3, 3.4, 'Photo souvenir', '📸', 'I ♥ DAKAR', () => { ctxRef!.state.count('photos'); ctxRef!.state.adjust({ moral: 6, social: 3 }); ctxRef!.toast('📸 Clic ! Un beau souvenir de Magic Land'); ctxRef!.save(); });
      for (const k of KIOSKS) if (near(k.lx, k.lz + 1.8, 3.4)) spot(k.id, k.name, k.lx, k.lz + 2, 3.4, 'Commander', k.menu[0].i, 'Snacks de la fête', () => {
        const ctx = ctxRef!, s = ctx.state;
        ctx.menu(k.name, `Ton argent : ${money(s.wallet)}`, k.menu.map(d => ({ icon: d.i, label: d.n, right: '−' + money(d.p), disabled: s.wallet < d.p, detail: s.wallet < d.p ? 'Pas assez d’argent' : undefined, onPick: () => {
          if (s.wallet < d.p) return; s.addMoney(-d.p, `Magic Land : ${d.n}`); s.adjust({ faim: d.faim, moral: d.moral }); s.count('magicland'); ctx.toast(`${d.i} ${d.n} — bon appétit`); ctx.save(); ctx.hud.closeModal();
        } })));
      });
    } });
  },
  hubLoaded(ctx, hub) {
    if (built) { built.group.removeFromParent(); built.group.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); }); if (built.opponent) { built.opponent.group.removeFromParent(); built.opponent.dispose(); } built = null; }
    ride = null;
    if (hub.id !== MAGIC.hub) return;
    built = build(ctx, hub); drawBoard(built, null, 0);
    hub.interactables.push({ id: 'corniche:city:magicland', name: 'Magic Land · fête foraine', kind: 'actions', x: W(-24, 0).x, z: W(-24, 0).z, radius: -1, actions: [], description: 'Grande roue, bateau pirate, baby-foot et snacks, face à Soumbédioune' });
  },
  update(ctx, dt) {
    const b = built; if (!b) return;
    const night = nightOf(ctx.hour()); b.glowMat.color.setScalar(0.3 + 0.7 * night); for (const m of b.lamps) m.emissive.setScalar(0.13 * night);
    const p = ctx.player.pos, far = Math.hypot(p.x - W(0, 0).x, p.z - W(0, 0).z) > 140 && !ride;
    const w = b.wheel, wp = W(WHEEL.lx, WHEEL.lz), r = ride;
    // the wheel: slow idle turn; stops at the platform for a rider, one and a half turns, back to the platform
    if (r && r.kind === 'wheel') {
      r.t += dt;
      if (r.phase === 'boarding') {
        const d = toBottom(b, r.car); w.omega = Math.max(0.03, Math.min(WHEEL.idle, d * 0.6));
        if (d < 0.02 || d > Math.PI * 2 - 0.02) {
          w.omega = 0; const seat = w.seats[r.car], pl = W(WHEEL.lx, WHEEL.lz);
          ctx.player.place(pl.x, pl.z, -Math.PI / 2); ctx.seats.release(seat.id, 'player'); ctx.player.sit(seat);
          if (ctx.player.seated()?.id !== seat.id) { ctx.state.addMoney(FEE.wheel, 'Magic Land : remboursé'); ride = null; ctx.setMode('play'); }
          else { ctx.setMode('play'); r.phase = 'riding'; r.t = 0; r.angleEnd = w.angle + Math.PI * 2 * WHEEL.turns; ctx.toast('🎡 La grande roue monte… regarde la Corniche'); }
        }
      } else if (r.phase === 'riding') {
        w.omega = Math.min(WHEEL.speed, w.omega + dt * 0.18);
        if (w.angle >= r.angleEnd) r.phase = 'stopping';
      } else {
        const d = toBottom(b, r.car); w.omega = Math.max(0.03, Math.min(WHEEL.speed, d * 0.6));
        if (d < 0.02 || d > Math.PI * 2 - 0.02) { w.omega = 0; endRide(ctx, { lx: WHEEL.lx - 3, lz: WHEEL.lz + 2.2, yaw: -Math.PI / 2 }, 'Merci de votre visite ! 🎡'); w.omega = WHEEL.idle; }
      }
    } else w.omega += (WHEEL.idle - w.omega) * Math.min(1, dt * 1.5);
    if (!far || (r && r.kind === 'wheel')) {
      w.angle += w.omega * dt; w.rot.rotation.x = w.angle;
      w.cars.forEach((m, k) => {
        const a = w.angle + (k / WHEEL.n) * Math.PI * 2, cz = wp.z + WHEEL.R * Math.sin(a), cy = G + WHEEL.hubY - WHEEL.R * Math.cos(a) - 1.0;
        m.position.set(wp.x, cy, cz); const s = w.seats[k]; s.x = wp.x; s.z = cz; s.top = cy - 0.35 + 0.42;
      });
    }
    // the pirate ship: pendulum, amplitude ramps up and down over the ride
    const sp = W(SHIP.lx, SHIP.lz), sh = b.ship;
    if (r && r.kind === 'ship') {
      r.t += dt; const u = Math.min(1, r.t / 5), d = Math.min(1, (SHIP.secs - r.t) / 5), amp = SHIP.amp * Math.max(0, Math.min(u, d));
      sh.phi = Math.sin(r.t * 1.5) * amp;
      if (r.t >= SHIP.secs) { sh.phi = 0; endRide(ctx, { lx: SHIP.lx, lz: SHIP.lz + 2.7, yaw: Math.PI }, 'Quel balancement ! ⚓'); }
    } else sh.phi *= Math.max(0, 1 - dt * 2);
    if (!far || r) {
      sh.hull.rotation.z = sh.phi;
      const c = Math.cos(sh.phi), s = Math.sin(sh.phi), seatsLocal: [number, number][] = [[-1.1, -0.7], [1.1, -0.7], [-1.1, 0.7], [1.1, 0.7]];
      sh.seats.forEach((st, i) => { const [lx, lz] = seatsLocal[i], ly = -SHIP.L + 0.9; st.x = sp.x + lx * c - ly * s; st.z = sp.z + lz; st.top = G + SHIP.pivotY + lx * s + ly * c + 0.45; });
    }
    // baby-foot: the opponent takes the opposite place, a short countdown, then the rounds
    if (r && r.kind === 'foot' && r.phase === 'arriving') {
      r.t += dt; if (b.opponent && r.t > 0.8) b.opponent.group.visible = true;
      if (r.t > 2.2) { r.phase = 'play'; drawBoard(b, 0, 0); ctx.toast('Match : premier à 3 buts'); footRound(ctx, b, 'Les deux joueurs sont là. À toi de jouer : choisis ton coup.'); }
    }
    if (b.opponent && b.opponent.group.visible) b.opponent.animate(dt, 0);
  },
  spaceChanged(ctx) {
    // leaving the park while a foot match is open (a door…) ends it quietly
    if (ride && ride.kind === 'foot' && ctx.inside()) { ride = null; ctx.setMode('play'); if (built?.opponent) built.opponent.group.visible = false; }
  },
  debug: () => ({
    magic: {
      info: () => built ? { cx: MAGIC.cx, cz: MAGIC.cz, ride: ride ? { kind: ride.kind, phase: (ride as { phase?: string }).phase ?? null } : null, wheelAngle: +built.wheel.angle.toFixed(2), shipPhi: +built.ship.phi.toFixed(2), seats: { wheel: built.wheel.seats.length, ship: built.ship.seats.length }, spots: { gate: W(-23, 0), wheel: W(WHEEL.lx - 5.5, WHEEL.lz + 5), ship: W(SHIP.lx + 5.5, SHIP.lz + 5), foot: W(FOOT.lx, FOOT.lz - 1.6), photo: W(PHOTO.lx, PHOTO.lz + 2.3), kiosks: KIOSKS.map(k => W(k.lx, k.lz + 2)) } } : null,
      seed: (n: number) => { let s = n; rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); },
      rideNow: () => (ride ? { kind: ride.kind, seat: ctxRef?.player.seated()?.id ?? null } : null),
    },
  }),
};
