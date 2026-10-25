import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { HubWorld } from '../world/types';
import type { Affordance, Target } from '../interact/types';
import { fcfa, type MenuItem } from '../ui/hud';
import { phoneHooks } from '../ui/phoneHooks';
import { Humanoid, humanoidReady, randomLook, type PersonLook } from '../actors/humanoid';
import { rng } from '../core/rng';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BANA, BANA_NAME, BANA_PLACE, GOODS, closeSession, customer, lotOf, nextClientIn, openSession, ownsTable, restock, resultLine, serve, stockOf, sync,
  tableCard, unitsText, waitingText, whyNotOpen, whyNotRestock, type Customer,
} from './bana';
import { buyVenture, cannotBuy, nextPrice, ownedOf, perHourOf } from './business';
import { HOUR_MS } from './assets';
import './bana.css';

/**
 * The bana-bana table in the world (LD2.0-A): Pikine's market street, on the Maïga du marché's lot, just west of the Maïga — set back from the pavement,
 * off the carriageway, clear of the Maïga's door and bench and of the corner. The logic is src/economy/bana.ts; this module draws it and plays it.
 * - Before the player owns a bana unit: an empty table, a hand-written « Table à céder · 50 000 F » board and its seller, Tata Dior, who is leaving for
 *   the Thiaroye market; « Voir la table à céder » explains it and offers the venture purchase (the one `buyVenture(s, 'bana')`).
 * - Once owned: the goods in stock on the cloth (a basin of peanuts and paper cornets, the recharge cards' stand, tissue packs), the player's own board
 *   (« Chez <prénom> »), a young cousin minding it. « Tenir la table »: the player stands behind it and serves the customers who walk up, one tap each;
 *   « Fermer la table » (or walking away) pays the till once. « Acheter de la marchandise »: the market's wholesaler, at cost.
 * Everything is a few boxes, cones and cylinders (no new asset); the board is a canvas.
 */
const esc = (t: string) => t.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
const SELLER = 'Tata Dior';
/** The young cousin who minds the table when the player is not there (the family's share: the venture's hourly income). */
const COUSIN = 'Mor';
const SELLER_LOOK: PersonLook = { skin: 0x4e2e1c, female: true, heavy: 0.5, style: 'dress', top: 0x6b3fa0, pattern: 'wax', accent: 0xf4c20d, hat: 'headwrap', hatColor: 0xf4c20d, shoes: 0x6b4a2e };
const COUSIN_LOOK: PersonLook = { skin: 0x5b3420, style: 'tee', top: 0xe8742c, pattern: 'uni', accent: 0xffffff, bottom: 0x3d4a5c, shoes: 0xf2f2ec };
/** The table's centre from the Maïga du marché's sheet (src/world/builder.ts: the Maïga, 7 m wide, its front on z − 2; the lot's free corner west of it). */
export const tableAt = (maiga: { x: number; z: number }) => ({ x: maiga.x - 6.8, z: maiga.z - 3.1 });
const W = 1.6, D = 0.74, H = 0.8;

interface Walker { h: Humanoid; phase: 'in' | 'wait' | 'out' | 'off'; key: string; path: { x: number; z: number }[]; seg: number }
/** A box, cone, cylinder… placed (position, rotation) and painted (its vertices' colour), to be merged with the others into one mesh. */
type Part = THREE.BufferGeometry;
function part(g: THREE.BufferGeometry, color: number, at: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale = 1): Part {
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(scale, scale, scale)));
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
/** Drawn from the camera up to these distances (m), per preset: the table and its parasol, its goods and its board, its people. */
const FAR = { low: { table: 60, goods: 32, people: 45 }, medium: { table: 110, goods: 50, people: 70 }, high: { table: 130, goods: 60, people: 80 } } as const;

/**
 * The table in the world, in few draw calls (Pikine's phone frame has a budget: tests/perf.frame.test.ts): the table, its cloth, the crate, the stool and
 * the parasol are ONE mesh (vertex colours); the goods on the cloth are one more, rebuilt when the stock changes; the board is a canvas on a plane. Beyond
 * a few dozen metres the goods, the board and the people are not drawn, and the whole table goes beyond the preset's distance.
 */
class BanaTable {
  readonly group = new THREE.Group();
  private mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private body: THREE.Mesh;
  private goodsMesh: THREE.Mesh;
  private goodsKey = '';
  private shown: Record<string, boolean> = {};
  private board: THREE.Mesh;
  private boardTex: THREE.CanvasTexture;
  private boardKey = '';
  private y0: number;
  readonly seller: Humanoid | null;
  readonly cousin: Humanoid | null;
  private walkers: Walker[] = [];
  private custKey = '';
  private far = { table: true, goods: true, people: true };
  /** Who is at the table (whether drawn or not from where the camera is): the seller before it is sold, the cousin after. */
  here = { seller: false, cousin: false };

  constructor(private hub: HubWorld, readonly at: { x: number; z: number }) {
    this.group.name = 'bana_table';
    const { x, z } = at, y0 = this.y0 = 0.08 + (hub.heightAt(x, z) || 0);
    const box = (w: number, h: number, d: number, px: number, py: number, pz: number, c: number, rot?: [number, number, number]) => part(new THREE.BoxGeometry(w, h, d), c, [px, py + h / 2, pz], rot);
    const parts: Part[] = [];
    // the table: four legs, the top, a wax cloth hanging down in front with a yellow band (the street side is +z)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.06, H - 0.04, 0.06, x + sx * (W / 2 - 0.08), y0, z + sz * (D / 2 - 0.08), 0x5a3f2a));
    parts.push(box(W, 0.04, D, x, y0 + H - 0.04, z, 0x8b6a47), box(W + 0.04, 0.012, D + 0.04, x, y0 + H, z, 0x1f7a44));
    parts.push(box(W + 0.04, 0.34, 0.012, x, y0 + H - 0.34, z + D / 2 + 0.02, 0x1f7a44), box(W + 0.04, 0.045, 0.014, x, y0 + H - 0.24, z + D / 2 + 0.025, 0xf4c20d));
    // under it a crate; behind it a plastic stool; a parasol over it; the board's stake at the front corner
    parts.push(box(0.5, 0.3, 0.36, x + 0.45, y0, z - 0.05, 0x8b6a47), box(0.34, 0.42, 0.34, x + 0.3, y0, z - 0.85, 0x2d6e9e));
    parts.push(part(new THREE.CylinderGeometry(0.025, 0.025, 2.3, 6), 0x2b2b2b, [x - 0.62, y0 + 1.15, z - 0.42]), part(new THREE.ConeGeometry(1.35, 0.45, 8, 1, true), 0xd9322b, [x - 0.62, y0 + 2.42, z - 0.42]));
    const sx = x - W / 2 - 0.38, sz = z + D / 2 + 0.05;
    parts.push(box(0.045, 1.12, 0.045, sx, y0, sz - 0.03, 0x5a3f2a));
    this.body = new THREE.Mesh(mergeGeometries(parts, false)!, this.mat);
    for (const g of parts) g.dispose();
    this.body.name = 'bana_body';
    this.goodsMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat); this.goodsMesh.name = 'bana_goods'; this.goodsMesh.visible = false;
    // the hand-written board on its stake, turned a little toward the pavement
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 352;
    this.boardTex = new THREE.CanvasTexture(cv); this.boardTex.colorSpace = THREE.SRGBColorSpace; this.boardTex.anisotropy = 4;
    this.board = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.64), new THREE.MeshLambertMaterial({ map: this.boardTex, side: THREE.DoubleSide }));
    this.board.position.set(sx, y0 + 1.36, sz); this.board.rotation.set(-0.06, -0.35, 0.04); this.board.name = 'bana_board';
    this.group.add(this.body, this.goodsMesh, this.board);
    hub.colliders.push({ x0: x - W / 2 - 0.02, z0: z - D / 2 - 0.02, x1: x + W / 2 + 0.02, z1: z + D / 2 + 0.03, h: H + 0.05 });   // the table only: the seller's side stays walkable
    // the people: the seller before it is sold, then a young cousin minding it
    this.seller = humanoidReady() ? new Humanoid(SELLER_LOOK) : null;
    this.cousin = humanoidReady() ? new Humanoid(COUSIN_LOOK) : null;
    for (const h of [this.seller, this.cousin]) if (h) { h.group.position.set(x - 0.15, y0 + 0.02, z - 0.95); h.group.rotation.y = 0; h.hold = 'Idle'; h.group.visible = false; this.group.add(h.group); }
    if (humanoidReady()) for (let i = 0; i < 2; i++) {
      const h = new Humanoid(randomLook(rng(i + 7))); h.group.visible = false; this.group.add(h.group);
      this.walkers.push({ h, phase: 'off', key: '', path: [], seg: 0 });
    }
  }

  /** The goods on the cloth, as one mesh: a basin of peanuts (the pile grows with the stock) and paper cornets, the recharge cards' stand, tissue packs. */
  private buildGoods(stock: (id: string) => number) {
    const { x, z } = this.at, top = this.y0 + H + 0.012, a = stock('arachides'), r = stock('recharge'), m = stock('mouchoirs');
    const amax = GOODS.find(g => g.id === 'arachides')!.max, packs = m > 0 ? Math.ceil(Math.min(5, m / 4)) : 0;
    const key = `${a > 0 ? Math.ceil(a / 5) : 0}:${r > 0 ? 1 : 0}:${packs}`; if (key === this.goodsKey) return;
    this.goodsKey = key;
    const parts: Part[] = [];
    if (a > 0) {
      parts.push(part(new THREE.CylinderGeometry(0.21, 0.16, 0.1, 14), 0xd8d2c4, [x - 0.45, top + 0.05, z - 0.06]));
      parts.push(part(new THREE.SphereGeometry(0.17, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xb9844a, [x - 0.45, top + 0.08, z - 0.06], [0, 0, 0], 0.55 + 0.45 * Math.min(1, a / amax)));
      for (let i = 0; i < 4; i++) parts.push(part(new THREE.ConeGeometry(0.035, 0.15, 8), 0xf2efe6, [x - 0.62 + i * 0.11, top + 0.035, z + 0.24], [Math.PI / 2, 0, 0.3 - i * 0.2]));
    }
    if (r > 0) {
      parts.push(part(new THREE.BoxGeometry(0.24, 0.16, 0.05), 0xf2c200, [x + 0.05, top + 0.08, z - 0.14], [-0.25, 0, 0]));
      [0xe8742c, 0x2f6fb3, 0x1a9d54].forEach((c, i) => parts.push(part(new THREE.BoxGeometry(0.065, 0.004, 0.095), c, [x - 0.04 + i * 0.09, top + 0.002, z + 0.12], [0, (i - 1) * 0.25, 0])));
    }
    for (let i = 0; i < packs; i++) parts.push(part(new THREE.BoxGeometry(0.14, 0.045, 0.08), i % 2 ? 0x9cc8e8 : 0xf2f2ec, [x + 0.52 + (i % 2) * 0.03, top + 0.0225 + i * 0.046, z + 0.02]));
    this.goodsMesh.geometry.dispose();
    this.goodsMesh.geometry = parts.length ? mergeGeometries(parts, false)! : new THREE.BufferGeometry();
    for (const g of parts) g.dispose();
    this.shown = { arachides: a > 0, recharge: r > 0, mouchoirs: packs > 0 };
  }

  /** The board: « TABLE À CÉDER · 50 000 F » before, the player's own card after. */
  private paintBoard(owned: boolean, name: string, price: number) {
    const key = owned ? `owned:${name}` : `sale:${price}`; if (key === this.boardKey) return;
    this.boardKey = key;
    const cv = this.boardTex.image as HTMLCanvasElement, g = cv.getContext('2d'); if (!g) return;
    g.fillStyle = '#c9a46c'; g.fillRect(0, 0, cv.width, cv.height);                       // brown cardboard, a darker fold and edges
    g.fillStyle = 'rgba(90,60,30,.18)'; g.fillRect(0, cv.height * 0.52, cv.width, 6);
    g.strokeStyle = 'rgba(80,50,20,.45)'; g.lineWidth = 10; g.strokeRect(5, 5, cv.width - 10, cv.height - 10);
    const hand = (t: string, y: number, size: number, color: string, tilt = 0) => {
      g.save(); g.translate(cv.width / 2, y); g.rotate(tilt); g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
      let s = size; g.font = `800 ${s}px "Marker Felt", "Comic Sans MS", "Chalkboard SE", cursive, sans-serif`;
      while (g.measureText(t).width > cv.width - 50 && s > 20) { s -= 4; g.font = `800 ${s}px "Marker Felt", "Comic Sans MS", "Chalkboard SE", cursive, sans-serif`; }
      g.fillText(t, 0, 0); g.restore();
    };
    if (!owned) {
      hand('TABLE À CÉDER', 92, 66, '#b42318', -0.03);
      hand(fcfa(price), 196, 92, '#1d1d24', 0.02);
      hand(`voir ${SELLER}`, 292, 44, '#1e3a8a', -0.02);
    } else {
      hand(name ? `CHEZ ${name.toUpperCase()}` : 'BANA-BANA', 92, 70, '#1e3a8a', -0.03);
      hand('Arachides · Crédit', 200, 52, '#1d1d24', 0.02);
      hand('Mouchoirs', 286, 52, '#1d1d24', -0.01);
    }
    this.boardTex.needsUpdate = true;
  }
  boardText() { return this.boardKey; }

  /** Goods on the cloth as the stock says; seller or cousin; the board; what is drawn from the camera's distance. A few times a second. */
  sync(owned: boolean, name: string, open: boolean, stock: (id: string) => number, price: number, cam: THREE.Vector3, q: keyof typeof FAR) {
    this.paintBoard(owned, name, price);
    this.buildGoods(owned ? stock : () => 0);
    const dist = Math.hypot(cam.x - this.at.x, cam.z - this.at.z), far = FAR[q] ?? FAR.medium;
    this.far = { table: dist <= far.table || open, goods: dist <= far.goods || open, people: dist <= far.people || open };
    this.body.visible = this.far.table;
    this.goodsMesh.visible = this.far.goods && this.goodsKey !== '0:0:0';
    this.board.visible = this.far.goods;
    this.here = { seller: !owned && !!this.seller, cousin: owned && !!this.cousin };
    if (this.seller) this.seller.group.visible = this.here.seller && this.far.people;
    if (this.cousin) {
      this.cousin.group.visible = this.here.cousin && this.far.people;
      const { x, z } = this.at;
      if (open) { this.cousin.group.position.x = x + 1.35; this.cousin.group.position.z = z - 0.55; this.cousin.group.rotation.y = -Math.PI / 2 + 0.4; }
      else { this.cousin.group.position.x = x - 0.15; this.cousin.group.position.z = z - 0.95; this.cousin.group.rotation.y = 0; }
    }
  }
  /** What the stock puts on the cloth (whether drawn now or not, by distance). */
  goodsShown() { return Object.fromEntries(GOODS.map(g => [g.id, !!this.shown[g.id]])); }
  /** The table's draw calls now (debug): its meshes visible. */
  drawn() { let n = 0; this.group.traverse(o => { if ((o as THREE.Mesh).isMesh && o.visible) { let p: THREE.Object3D | null = o; while (p && p.visible) p = p.parent; if (!p) n++; } }); return n; }

  /** The customer at the table now (`c`, keyed by session and count): the one before walks off, this one walks up. */
  customers(c: Customer | null, key: string) {
    if (key === this.custKey) return;
    this.custKey = key;
    const { x, z } = this.at;
    for (const w of this.walkers) if (w.phase === 'in' || w.phase === 'wait') {   // the one served (or left waiting at closing) walks off toward the pavement
      const p = w.h.group.position;
      w.phase = 'out'; w.path = [{ x: p.x, z: p.z }, { x: p.x + (p.x < x ? -1.2 : 1.2), z: z + 2.4 }, { x: x + (p.x < x ? -6 : 6), z: z + 2.9 }]; w.seg = 0;
    }
    if (!c) return;
    const w = this.walkers.find(v => v.phase === 'off') ?? this.walkers[0]; if (!w) return;
    const R = rng(c.seed);
    let look = randomLook(R);
    for (let i = 0; i < 6 && !!look.female !== c.female; i++) look = randomLook(R);
    w.h.setLook(look);
    const side = c.seed % 2 ? 1 : -1, slot = { x: x + ((c.seed >> 3) % 5 - 2) * 0.12, z: z + D / 2 + 0.6 };
    w.key = key; w.phase = 'in'; w.seg = 0;
    w.path = [{ x: x + side * 3.6, z: z + 2.7 }, { x: x + side * 1.2, z: z + 2.0 }, slot];
    w.h.group.position.set(w.path[0].x, 0.1 + (this.hub.heightAt(w.path[0].x, w.path[0].z) || 0), w.path[0].z);
    w.h.group.visible = true;
  }
  customersShown() { return this.walkers.filter(w => w.h.group.visible).map(w => w.phase); }

  update(dt: number) {
    for (const h of [this.seller, this.cousin]) if (h?.group.visible) h.animate(dt, 0);
    for (const w of this.walkers) {
      if (w.phase === 'off') continue;
      if (!this.far.people) { w.phase = 'off'; w.h.group.visible = false; continue; }   // nobody watches from that far: the customer is gone
      if (w.phase === 'wait') { w.h.hold = 'Talk'; w.h.animate(dt, 0); continue; }
      let step = 1.6 * dt, moving = false;
      while (step > 0 && w.seg < w.path.length - 1) {
        const p = w.h.group.position, b = w.path[w.seg + 1], dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz);
        if (d > 0.01) w.h.group.rotation.y = Math.atan2(dx, dz);
        if (d <= step) { p.x = b.x; p.z = b.z; w.seg++; step -= d; } else { p.x += (dx / d) * step; p.z += (dz / d) * step; step = 0; }
        moving = true;
      }
      w.h.hold = null;
      w.h.animate(dt, moving ? 1.6 : 0);
      if (w.seg >= w.path.length - 1) {
        if (w.phase === 'in') { w.phase = 'wait'; w.h.group.rotation.y = Math.PI; }            // at the table, facing it
        else { w.phase = 'off'; w.h.group.visible = false; }
      }
    }
  }

  dispose() {
    for (const h of [this.seller, this.cousin, ...this.walkers.map(w => w.h)]) h?.dispose();
    this.boardTex.dispose(); (this.board.material as THREE.Material).dispose(); this.board.geometry.dispose();
    this.body.geometry.dispose(); this.goodsMesh.geometry.dispose(); this.mat.dispose();
    this.group.removeFromParent();
  }
}

/** The player's first name for the board (« Chez Awa »), or '' for the default guest name. */
function playerName(): string {
  const n = (phoneHooks.profileName?.() ?? '').trim();
  return !n || /^Dakarois\b/i.test(n) ? '' : n.split(/\s+/)[0].slice(0, 12);
}

class Bana {
  private ctx!: GameCtx;
  private table: BanaTable | null = null;
  private t = 0;
  private sheet: 'offer' | 'table' | 'session' | 'restock' | 'summary' | null = null;
  get s() { return this.ctx.state; }

  init(ctx: GameCtx) {
    this.ctx = ctx;
    ctx.interactions.add({ name: 'bana', collect: (space, x, z, out) => this.collect(space, x, z, out) });
    phoneHooks.banaPlace = () => ({ id: BANA_PLACE, hub: 'pikine', name: 'Table de bana-bana' });   // « Mes pistes » leads there (src/economy/pistesModule.ts)
    sync(ctx.state);
  }

  hubLoaded(ctx: GameCtx, hub: HubWorld) {
    this.table?.dispose(); this.table = null;
    if (hub.id !== 'pikine') { if (sync(this.s).open) this.close(true); return; }   // the player left Pikine with the table open: the till is paid (in Pikine, walking away does it)
    const m = hub.interactables.find(i => i.id.startsWith('pikine:maiga:')); if (!m) return;
    const at = tableAt(m);
    // the ground it stands on is kept open: the street furniture, the painted walls and the parked cars keep off it (src/world/types.ts keepClear)
    (hub.keepClear ??= []).push({ x0: at.x - 1.9, x1: at.x + 1.9, z0: at.z - 1.6, z1: at.z + 1.4, why: 'bana_table' });
    // a place to walk to (« Y aller », the walking marker), not a target of its own: the table's target is below
    hub.interactables.push({ id: BANA_PLACE, name: 'Table de bana-bana', kind: 'actions', x: at.x, z: at.z + D / 2 + 0.7, radius: -1, actions: [], description: 'Marché de Pikine, à côté de la Maïga' });
    this.table = new BanaTable(hub, at);
    ctx.extra.add(this.table.group);
    this.refresh(true);
  }

  private get here() { return this.table ? { x: this.table.at.x, z: this.table.at.z + D / 2 + 0.7 } : null; }
  private collect(space: string, x: number, z: number, out: Target[]) {
    const h = this.here; if (!h || space !== 'street') return;
    if (Math.hypot(h.x - x, h.z - z) > BANA.reach + 0.5) return;
    const owned = ownsTable(this.s);
    out.push({ id: BANA_PLACE, name: owned ? 'Ta table de bana-bana' : 'Table à céder', kind: 'shop', space: 'street', x: h.x, z: h.z, y: 1.7, radius: BANA.reach, bias: -0.4, affordances: () => this.affordances() });
  }

  private affordances(): Affordance[] {
    const s = this.s, b = sync(s);
    if (!ownsTable(s)) return [
      { id: 'voir', verb: 'inspect', label: 'Voir la table à céder', icon: '🧺', detail: `${fcfa(nextPrice(s, 'bana'))} · ses clients avec`, run: () => this.openOffer() },
      { id: 'parler', verb: 'talk', label: `Parler à ${SELLER}`, icon: '💬', run: () => this.ctx.toast(`${SELLER} : « Je pars vendre au marché de Thiaroye avec ma sœur. Ma table et mes clients, je les cède. »`) },
    ];
    if (b.open) {
      const c = customer(s);
      return [
        c ? { id: 'servir', verb: 'sell', label: `Servir ${c.name}`, icon: '🤝', detail: `${unitsText(c.good, c.qty)} · +${fcfa(c.amount)}`, run: () => this.serveOne() }
          : { id: 'fermer', verb: 'sell', label: 'Fermer et encaisser', icon: '🔒', run: () => this.close() },
        ...(c ? [{ id: 'fermer', verb: 'sell' as const, label: 'Fermer la table', icon: '🔒', detail: `Encaisser ${fcfa(b.open.sales)}`, run: () => this.close() }] : []),
        { id: 'voir', verb: 'inspect', label: 'Voir la table', icon: '📋', run: () => this.openSession() },
      ];
    }
    return [
      { id: 'tenir', verb: 'work', label: 'Tenir la table', icon: '🧺', disabled: whyNotOpen(s), detail: waitingText(b.clients), run: () => this.start() },
      { id: 'stock', verb: 'buy', label: 'Acheter de la marchandise', icon: '🛒', run: () => this.openRestock() },
      { id: 'voir', verb: 'inspect', label: 'Voir ma table', icon: '📋', run: () => this.openTable() },
    ];
  }

  // ---------------------------------------------------------------- the sheets
  private menu(title: string, subtitle: string, items: MenuItem[], html = '', kind: Bana['sheet'] = null) {
    this.sheet = kind;
    this.ctx.menu(title, subtitle, items, html);
  }
  private rows(list: [string, string][]) { return `<div class="est-rows">${list.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`; }

  /** Before buying: what the table is, what it brings, the one purchase (the venture's), with the price and what is left after. */
  openOffer() {
    const s = this.s, price = nextPrice(s, 'bana'), why = cannotBuy(s, 'bana');
    const html = `${this.rows([['Prix', fcfa(price)], ['Rapporte', `+${fcfa(perHourOf('bana'))} par heure en ville`], ['Il te restera', fcfa(Math.max(0, s.wallet - price))]])}
      <div class="biz-note">La famille la tient quand tu n’es pas là. Quand tu la tiens toi-même : achète la marchandise, sers les clients, garde le bénéfice.</div>`;
    this.menu('Table à céder', `${SELLER} : « Je pars vendre à Thiaroye. Ma table et mes clients, je te les cède. »`, [
      { icon: '✅', label: 'Reprendre la table', right: '−' + fcfa(price), detail: why === 'Pas assez d’argent' ? `Il te manque ${fcfa(price - s.wallet)}` : why ?? 'Une seule fois : pas de papiers, pas d’attente', disabled: !!why, onPick: () => this.buy() },
      { icon: '↩️', label: 'Plus tard', onPick: () => this.ctx.hud.closeModal() },
    ], html, 'offer');
  }

  /** The venture purchase, the same as the Affaires app's (business.ts buyVenture): the table is set up at once. */
  buy(): boolean {
    const s = this.s, price = nextPrice(s, 'bana');
    if (!buyVenture(s, 'bana')) { this.ctx.toast(cannotBuy(s, 'bana') ?? 'Achat impossible'); return false; }
    const b = sync(s);
    this.ctx.save();
    this.refresh(true);
    this.ctx.toast(`${BANA_NAME} ✓  −${fcfa(price)} · ${waitingText(b.clients)}`);
    this.openTable();
    return true;
  }

  /** The table: stock, customers, the last session, today and since the purchase; « Tenir la table », restock. */
  openTable() {
    const s = this.s, c = tableCard(s), why = whyNotOpen(s);
    const w = waitingText(c.clients);
    this.menu('Ta table de bana-bana', `${w.charAt(0).toUpperCase() + w.slice(1)} · ${c.stock.some(g => g.n > 0) ? 'marchandise en place' : 'pas de marchandise'}`, [
      { icon: '🧺', label: 'Tenir la table', detail: why ?? 'Sers les clients un par un', disabled: !!why, onPick: () => this.start() },
      { icon: '🛒', label: 'Acheter de la marchandise', detail: 'Le grossiste du marché, au prix de gros', onPick: () => this.openRestock() },
      { icon: '🏢', label: 'Mes affaires', detail: 'Toutes tes affaires et leurs revenus', onPick: () => { this.ctx.hud.closeModal(); phoneHooks.openBusiness?.(); } },
    ], tableHtml(s), 'table');
  }

  openRestock() {
    const s = this.s;
    const items: MenuItem[] = GOODS.map(g => {
      const n = lotOf(s, g.id), why = whyNotRestock(s, g.id);
      return { icon: g.icon, label: n > 0 ? unitsText(g, n) : g.name, right: n > 0 ? '−' + fcfa(n * g.cost) : undefined, disabled: !!why,
        detail: why ?? `${fcfa(g.cost)} pièce · revendu ${fcfa(g.price)} · ${stockOf(s, g.id)}/${g.max} sur la table`,
        onPick: () => { const r = restock(s, g.id); if (r) { this.ctx.save(); this.refresh(); this.ctx.toast(`${g.icon} +${unitsText(g, r.units)} · −${fcfa(r.cost)}`); } this.openRestock(); } };
    });
    items.push({ icon: '↩️', label: 'Retour à la table', onPick: () => this.openTable() });
    this.menu('Marchandise', `Grossiste du marché · en poche ${fcfa(s.wallet)}`, items, '', 'restock');
  }

  /** « Tenir la table »: the player behind it, facing the street; the first customer walks up. */
  start() {
    const s = this.s;
    if (!openSession(s)) { this.ctx.toast(whyNotOpen(s) ?? 'Pas maintenant'); this.openTable(); return; }
    const t = this.table;
    if (t) { this.ctx.player.standUp(true); this.ctx.player.place(t.at.x - 0.2, t.at.z - 0.95, 0); }
    this.ctx.save();
    this.refresh();
    this.openSession();
  }

  /** The session: the customer at the table (what they want, the price), « Servir », « Fermer la table » with the till. */
  openSession() {
    const s = this.s, b = sync(s), o = b.open; if (!o) { this.openTable(); return; }
    const c = customer(s);
    const who = c ? `<div class="bana-who"><i aria-hidden="true">${c.female ? '👩🏾' : '👨🏾'}</i><div><b>${esc(c.name)}</b><span>« ${esc(c.line)} »</span></div><em>+${esc(fcfa(c.amount))}</em></div>`
      : `<div class="bana-who"><i aria-hidden="true">🙌</i><div><b>${b.clients <= 0 ? 'Plus de clients pour l’instant' : 'Plus de marchandise'}</b><span>${b.clients <= 0 ? 'Ils reviennent pendant que tu joues.' : 'Ferme et rachète de la marchandise.'}</span></div></div>`;
    const html = `${who}<div class="bana-calc">Recette ${esc(fcfa(o.sales))} − marchandise ${esc(fcfa(o.cost))} = <b>${esc(fcfa(o.sales - o.cost))}</b></div>`;
    const items: MenuItem[] = [];
    if (c) items.push({ icon: '🤝', label: `Servir ${c.name}`, detail: unitsText(c.good, c.qty), right: '+' + fcfa(c.amount), onPick: () => this.serveOne() });
    items.push({ icon: '🔒', label: c ? 'Fermer la table' : 'Fermer et encaisser', detail: 'La recette va dans ton portefeuille', right: o.sales > 0 ? `+${fcfa(o.sales)}` : undefined, onPick: () => this.close() });
    this.menu('Table ouverte', `${o.served} servi${o.served > 1 ? 's' : ''} · ${waitingText(b.clients)}`, items, html, 'session');
  }

  /** One customer served (one tap): the goods leave the table, the price goes in the till. */
  serveOne(): Customer | null {
    const c = serve(this.s); if (!c) { this.openSession(); return null; }
    this.ctx.save();
    this.refresh();
    if (this.ctx.hud.modalOpen && this.sheet === 'session') this.openSession();
    else this.ctx.toast(`🤝 ${c.name} · +${fcfa(c.amount)} · recette ${fcfa(sync(this.s).open?.sales ?? 0)}`);   // served with the action button: the sheet stays closed
    return c;
  }

  /** Close the table: the till is paid once; the result (sales − cost = profit) is shown. `quiet`: a toast instead of the sheet (walked away, left Pikine). */
  close(quiet = false) {
    const r = closeSession(this.s); if (!r) return null;
    this.ctx.save();
    this.refresh();
    if (r.served === 0) { if (!quiet) this.openTable(); return r; }
    const b = sync(this.s);
    // walked away (or left Pikine): the cousin takes the table back and says what went into the wallet (a line of speech: always shown, src/ui/quiet.ts)
    if (quiet) { this.ctx.toast(`${COUSIN} : « Je reprends la table. Ta recette : +${fcfa(r.sales)}, bénéfice ${fcfa(r.profit)}. »`); return r; }
    this.menu('Table fermée', `${r.served} client${r.served > 1 ? 's' : ''} servi${r.served > 1 ? 's' : ''} · recette dans ton portefeuille`, [
      { icon: '🛒', label: 'Acheter de la marchandise', onPick: () => this.openRestock() },
      { icon: '👍', label: 'OK', onPick: () => this.ctx.hud.closeModal() },
    ], `${this.rows([['Recette', '+' + fcfa(r.sales)], ['Marchandise vendue (prix de gros)', '−' + fcfa(r.cost)], ['Bénéfice', fcfa(r.profit)]])}
      <div class="biz-note">Aujourd’hui : ${esc(fcfa(b.today))} de bénéfice · depuis l’achat : ${esc(fcfa(b.total))}.</div>`, 'summary');
    return r;
  }

  /** Board, goods, people as the save says (and the customer at the table). */
  private refresh(force = false) {
    const t = this.table; if (!t) return;
    const s = this.s, b = sync(s), owned = ownsTable(s);
    t.sync(owned, playerName(), !!b.open, id => stockOf(s, id), nextPrice(s, 'bana'), this.ctx.camera.position, this.ctx.quality());
    const c = b.open ? customer(s) : null;
    t.customers(c, b.open && c ? `${b.open.id}:${b.open.served}` : force ? '' : 'none');
  }

  update(ctx: GameCtx, dt: number) {
    const t = this.table;
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.25;
      const b = sync(this.s);
      if (b.open && t && !ctx.inside() && Math.hypot(ctx.player.pos.x - t.at.x, ctx.player.pos.z - t.at.z) > BANA.leave) this.close(true);   // walked away: the till is paid
      if (t) this.refresh();
    }
    t?.update(dt);
  }

  debug() {
    const s = () => this.s;
    return {
      /** The table: where it is, its card (stock, customers, last session, today, total), what is drawn. */
      bana: () => {
        const t = this.table, c = customer(s());
        return {
          at: t ? { x: t.at.x, z: t.at.z } : null, front: this.here, owned: ownsTable(s()), units: ownedOf(s(), 'bana'), card: tableCard(s()), why: whyNotOpen(s()),
          customer: c ? { name: c.name, good: c.good.id, qty: c.qty, amount: c.amount, cost: c.cost } : null, nextClientMs: nextClientIn(s()), hourMs: HOUR_MS,
          board: t?.boardText() ?? null, goods: t?.goodsShown() ?? null, drawn: t?.drawn() ?? 0, seller: !!t?.here.seller, cousin: !!t?.here.cousin, walkers: t?.customersShown() ?? [],
          sheet: this.ctx.hud.modalOpen ? this.sheet : null, flag: s().data.flags.includes('bana_table'), ack: s().data.bana.ack,
          lastLine: s().data.bana.last ? resultLine(s().data.bana.last!) : null,
        };
      },
      banaSheet: (which: 'offer' | 'table' | 'restock' | 'session' = 'table') => { if (which === 'offer') this.openOffer(); else if (which === 'restock') this.openRestock(); else if (which === 'session') this.openSession(); else this.openTable(); },
    };
  }
}

/** The table's card inside its own sheet: the goods, the customers, the last session's calculation, today and since the purchase. */
function tableHtml(s: GameCtx['state']): string {
  const c = tableCard(s), next = c.nextInMs;
  const stock = c.stock.map(g => `<span class="${g.n ? '' : 'out'}">${g.icon} ${g.n}/${g.max}</span>`).join('');
  const wait = next === Infinity ? 'clientèle au complet' : `prochain client dans ${Math.ceil(next / 1000)} s de jeu`;
  return `<div class="bana-card"><div class="bana-stock">${stock}</div>
    <div class="bana-line">Clients : <b>${c.clients}/${c.max}</b> · ${esc(wait)}</div>
    ${c.last ? `<div class="bana-calc">Dernière fois : ${esc(resultLine(c.last))}</div>` : ''}
    <div class="bana-line">Bénéfice aujourd’hui <b>${esc(fcfa(c.today))}</b> · depuis l’achat <b>${esc(fcfa(c.total))}</b></div>
    <div class="bana-line">Et toujours +${esc(fcfa(c.perHour * c.units))}/h : la famille la tient quand tu n’es pas là${c.family ? ` (${c.family} autre${c.family > 1 ? 's' : ''} table${c.family > 1 ? 's' : ''} de la famille)` : ''}.</div></div>`;
}

const bana = new Bana();
export const banaModule: GameModule = {
  name: 'bana',
  init: ctx => bana.init(ctx),
  hubLoaded: (ctx, hub) => bana.hubLoaded(ctx, hub),
  update: (ctx, dt) => bana.update(ctx, dt),
  debug: () => bana.debug(),
};
