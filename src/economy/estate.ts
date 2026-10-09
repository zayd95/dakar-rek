import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { Collider, HubWorld } from '../world/types';
import { buildInterior } from '../world/interiors';
import type { AssetState } from '../core/types';
import type { Seat } from '../interact/seats';
import type { Target } from '../interact/types';
import * as P from '../activity/primitives';
import { ownable, shop, type PlaceHooks } from '../activity/templates';
import type { Anchor, PlaceSpec } from '../activity/places';
import type { ActivitySpec } from '../activity/types';
import { Humanoid, humanoidReady, randomLook, type PersonLook } from '../actors/humanoid';
import { rng } from '../core/rng';
import { fcfa, type MenuItem } from '../ui/hud';
import { phoneHooks } from '../ui/phoneHooks';
import { ECONOMY } from './config';
import {
  HOUR_MS, adRunning, assetsOf, assetsRevision, assetsValue, buyAsset, cannotBuy, cannotLet, cannotMoveIn, cannotRent, cannotRentAd,
  cannotSell, cannotUpgrade, chargeOf, chargesPerHour, comfortOf, currentHome, endLease, furnitureIn, holding, holds, incomeOf, incomePerHour, moveIn,
  netWorth, normalize, rentAdSpace, rentAsset, repairAsset, repairCost, saleValue, sellAsset, setLeased, setOwnAd, specOfAsset, upgradeAsset, valueOf,
} from './assets';
import {
  AIRCRAFT, BILLBOARDS, GRADE_LABEL, HOMES, KIND_ICON, KIND_LABEL, LAND, VEHICLES, VENTURES, furnitureSpec, homeSpec, specOf,
  type AssetSpec, type FurnitureSpec, type FurnitureType, type HomeSpec,
} from './catalog';
import { CATALOGUE, cannotBuy as cannotBuyFurniture, deliverFurniture, furnitureById, hasGoodMattress, piecesOf } from './furniture';
import { furnitureModel } from './furnitureModels';
import { buildHomeInterior } from './homeInterior';
import { footprint, toHome, yawOf } from './placement';
import { CITE_HUB, billboardTexture, buildCiteJamm, dressPlot, plotBoardTexture, signPanel, type CiteJamm } from './citeJamm';
import { Batch, signTexture } from '../world/batch';
import { BLK, HALF, PITCH, ROAD } from '../world/builder';
import { HomeEditor, type HomeView } from './homeEditor';
import { ownedVentures } from './business';
import './estate.css';

/**
 * Ownership in the world (docs/OWNERSHIP.md): one module on the shared seam (src/game/modules.ts) for every home, plot,
 * billboard and piece of furniture of the generic asset model (assets.ts).
 * - Homes: each home has a street door; its interior is built here and given to the game with ctx.addInterior. The
 *   furniture of the home (assets) stands in it with its seats, colliders and activities (sleep, cook, shower, sit,
 *   watch TV, work at the desk…); « Aménager » opens the placement mode (homeEditor.ts).
 * - The Cité Jàmm (Pikine, citeJamm.ts): Keur Meubles (shop recipe → catalogue), the Résidence Jàmm and a house (ownable
 *   homes: visit, rent, buy, move in), two plots and a billboard (ownable: buy, let, upgrade, sell, ad space).
 * - Sheets show what a purchase costs and brings before the one confirmation; no approval, no paperwork, no waiting.
 * - Phone: « Biens » (net worth, income, charges, everything held, listings) and « Maison » (the home, its furniture).
 */
const ROOM_X = 1600, ROOM_STEP = 60;
const FLOOR = 0.1;
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const perDay = (n: number) => `${fcfa(n)} / jour`;
/** Directory entries of the Cité Jàmm (places directory, walking marker): id by catalogue entry. */
const ENTRY: Record<string, string> = {
  appart_jamm: 'pikine:city:jamm', maison_cite: 'pikine:city:maison', parcelle_150: 'pikine:city:parcelles', parcelle_300: 'pikine:city:parcelles',
  panneau_jamm: 'pikine:city:panneau', keur_meubles: 'pikine:city:keur_meubles',
  villa_almadies: 'almadies:city:villa', residence_ngor: 'almadies:city:residence',
};
const SELLER_LINES = [
  'Pape, vendeur : « Dalal ak jàmm ! Essaie les canapés, tout est livré chez toi, sans frais. »',
  'Pape, vendeur : « Les lits en bois viennent d’arriver. Bien dormir, c’est bien travailler. »',
  'Pape, vendeur : « Un réchaud, et tu cuisines chez toi pour moins cher qu’à la gargote. »',
  'Pape, vendeur : « Jërëjëf ! Ba beneen yoon, inch’Allah. »',
];
const ROOMS: { id: string; label: string; what: string; types: FurnitureType[] }[] = [
  { id: 'salon', label: 'Salon', what: 'Canapés, fauteuils, chaises et tables', types: ['sofa', 'chair', 'table'] },
  { id: 'chambre', label: 'Chambre', what: 'Lits, literie et rangements', types: ['bed', 'mattress', 'wardrobe'] },
  { id: 'cuisine', label: 'Cuisine', what: 'Réchaud, cuisinière, cuisine équipée', types: ['kitchen'] },
  { id: 'bureau', label: 'Bureau', what: 'Travailler chez toi, une fois par heure en ville', types: ['desk'] },
  { id: 'loisirs', label: 'Télé et musique', what: 'Télés, radios, chaînes hi-fi', types: ['tv', 'radio'] },
  { id: 'deco', label: 'Déco', what: 'Tapis, miroirs, plantes et lampes', types: ['rug', 'mirror', 'plant', 'lamp'] },
];

class Estate {
  ctx!: GameCtx;
  private hub: HubWorld | null = null;
  private views = new Map<string, HomeView>();
  private rev = -1;
  private cite: CiteJamm | null = null;
  private plotCols = new Map<string, Collider[]>();
  private boardKey = '';
  private plotKeys = new Map<string, string>();
  private people: Humanoid[] = [];
  editor!: HomeEditor;
  private talkN = 0;

  init(ctx: GameCtx) {
    this.ctx = ctx;
    this.editor = new HomeEditor(ctx);
    normalize(ctx.state);
    phoneHooks.openAssets = () => this.openAssets();
    phoneHooks.openHome = () => this.openHomeApp();
    // « Aménager » (and the listing of a home being visited) wherever nothing else is at hand inside a home
    ctx.interactions.add({ name: 'estate-home', collect: (space, x, z, out) => this.collectSelf(space, x, z, out) });
  }
  private get s() { return this.ctx.state; }

  // ---------------------------------------------------------------- hub
  hubLoaded(_ctx: GameCtx, hub: HubWorld) {
    this.editor.close();
    for (const h of this.people) h.dispose();
    this.people = []; this.views.clear(); this.plotCols.clear(); this.plotKeys.clear(); this.boardKey = '';
    this.hub = hub; this.cite = null;
    if (hub.id === CITE_HUB) this.buildCite(hub);
    if (hub.id === 'almadies') this.buildVillas(hub);
    HOMES.forEach((spec, i) => {
      if (spec.hub !== hub.id) return;
      const door = hub.interactables.find(it => it.id === spec.home.door); if (!door) return;
      const furniture = new THREE.Group();
      const v: HomeView = { spec, door, ox: ROOM_X + i * ROOM_STEP, oz: 0, int: null!, base: [], spots: null, ceiling: [], shellKey: '?', furniture, pieces: new Map(), seatIds: [] };
      this.views.set(spec.id, v);
    });
    this.rev = -1;
    this.refresh();
  }

  private buildCite(hub: HubWorld) {
    const ctx = this.ctx, c = buildCiteJamm(hub, ctx.quality() === 'low');
    this.cite = c;
    ctx.seats.addAll(c.seats);
    const hooks: PlaceHooks = {
      ownership: id => this.openSheet(id), holds: id => holds(this.s, id), enterHome: id => this.enterHome(id),
      browse: () => this.openCatalogue(), converse: () => this.talkSeller(),
    };
    const A = (id: string, kind: Anchor['kind'], p: { x: number; z: number }, radius = 2.2): Anchor => ({ id, kind, x: p.x, z: p.z, radius });
    ctx.places.add(shop({ id: 'keur_meubles', name: 'Keur Meubles', space: 'street', catalogue: 'meubles', seller: 'vendeur', anchors: [A('till', 'shop', c.shop.till)] }, hooks));
    for (const [id, h] of Object.entries(c.homes)) {
      ctx.places.add(ownable({ id, name: homeSpec(id)!.name.split(' · ')[0], space: 'street', type: 'home', assetId: id, anchors: [A('sign', 'door', h.sign)] }, hooks));
      hub.interactables.push({ id: homeSpec(id)!.home.door, name: homeSpec(id)!.name, kind: 'actions', x: h.door.x, z: h.door.z, radius: -1, actions: [] });   // the street door (exit spot), not a target
      hub.interactables.push({ id: ENTRY[id], name: h.name, kind: 'actions', x: h.entry.x, z: h.entry.z, radius: -1, actions: [], description: 'Logement à louer ou à vendre' });
    }
    for (const [id, p] of Object.entries(c.plots)) ctx.places.add(ownable({ id, name: specOf(id)!.name.split(' · ')[0], space: 'street', type: 'plot', assetId: id, anchors: [A('sign', 'land', p.sign)] }, hooks));
    ctx.places.add(ownable({ id: 'panneau_jamm', name: 'Panneau publicitaire', space: 'street', type: 'billboard', assetId: 'panneau_jamm', anchors: [A('sign', 'billboard', c.billboard.sign)] }, hooks));
    // the places directory (« Les coins du quartier ») and its walking marker; radius −1: listed, never a target
    const dir = (id: string, name: string, p: { x: number; z: number }, description: string) => hub.interactables.push({ id, name, kind: 'actions', x: p.x, z: p.z, radius: -1, actions: [], description });
    dir(ENTRY.keur_meubles, 'Keur Meubles · meubles', c.shop.entry, 'Meubles simples, confort et prestige, livrés chez toi');
    dir(ENTRY.parcelle_150, 'Parcelles à vendre · Cité Jàmm', c.plotsEntry, 'Deux terrains à acheter, à louer en attendant de construire');
    dir(ENTRY.panneau_jamm, 'Panneau publicitaire · Cité Jàmm', c.billboard.entry, 'À acheter et à louer aux annonceurs, ou pour ta pub');
    // Pape, the seller, behind the till
    if (humanoidReady()) {
      const look: PersonLook = { ...randomLook(rng(71)), style: 'tee', top: 0x3b2414, bottom: 0x2b2b33, female: false, hat: 'kufi', hatColor: 0xf2f2ec };
      const h = new Humanoid(look); h.hold = 'Idle';
      h.group.position.set(c.shop.seller.x, FLOOR + 0.05, c.shop.seller.z); h.group.rotation.y = c.shop.seller.yaw;
      ctx.extra.add(h.group); this.people.push(h);
    }
  }

  /**
   * The villa and the luxury residence of Almadies stand behind two villa gates of the hub (world/builder.ts puts each
   * villa lot's gate at the lot's centre, on the street side): a listing board, the door, a directory entry.
   */
  private buildVillas(hub: HubWorld) {
    const ctx = this.ctx;
    const hooks: PlaceHooks = { ownership: id => this.openSheet(id), holds: id => holds(this.s, id), enterHome: id => this.enterHome(id) };
    for (const [id, gate] of Object.entries(VILLA_GATES)) {
      const sp = homeSpec(id)!, door = { x: gate.x, z: gate.z + 1.4 }, board = { x: gate.x + 2.3, z: gate.z + 0.9 };
      hub.interactables.push({ id: sp.home.door, name: sp.name, kind: 'actions', x: door.x, z: door.z, radius: -1, actions: [] });
      hub.interactables.push({ id: ENTRY[id], name: sp.name, kind: 'actions', x: gate.x - 2.6, z: gate.z + 2.2, radius: -1, actions: [], description: 'Logement à louer ou à vendre' });
      ctx.places.add(ownable({ id, name: sp.name.split(' · ')[0], space: 'street', type: 'home', assetId: id, anchors: [{ id: 'sign', kind: 'door', x: door.x, z: door.z + 0.3, radius: 2.2 }] }, hooks));
      const b = new Batch();
      for (const dx of [-0.75, 0.75]) b.box(0.1, 2.3, 0.1, board.x + dx, 0.12, board.z, 0x6b4a2e);
      const mesh = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }), true, true); if (mesh) hub.group.add(mesh);
      const panel = signPanel(signTexture(id === 'villa_almadies' ? 'VILLA À VENDRE' : 'RÉSIDENCE DE LUXE', '#0c4a6e', '#fde68a', 512, 160), 1.8, 0.6);
      panel.position.set(board.x, 1.95, board.z + 0.07); hub.group.add(panel); hub.signs.push(panel);
      hub.colliders.push({ x0: board.x - 0.9, z0: board.z - 0.1, x1: board.x + 0.9, z1: board.z + 0.1, h: 2.3 });
    }
  }

  update(ctx: GameCtx, dt: number) {
    if (assetsRevision() !== this.rev) this.refresh();
    this.editor.update();
    const p = ctx.player.pos;
    for (const h of this.people) { const near = Math.hypot(h.group.position.x - p.x, h.group.position.z - p.z) < 60; h.group.visible = near; if (near) h.animate(dt, 0); }
  }
  spaceChanged() { if (this.editor.isOpen) this.editor.close(); }

  /** Brings the world in line with the assets (after any change: purchase, placement, settlement…). */
  refresh() {
    this.rev = assetsRevision();
    for (const v of this.views.values()) this.syncHome(v);
    this.syncCite();
    this.rev = assetsRevision();
  }

  // ---------------------------------------------------------------- homes
  private shellKeyOf(v: HomeView, held: AssetState | undefined) {
    if (!held) return '-';
    const mattress = v.spec.home.level === 'room' && hasGoodMattress(this.s, held.uid);
    return [...held.upgrades].sort().join(',') + (mattress ? '+matelas' : '');
  }
  private syncHome(v: HomeView) {
    const ctx = this.ctx, s = this.s, held = holding(s, v.spec.id), hub = this.hub!.id;
    const key = this.shellKeyOf(v, held);
    if (key !== v.shellKey) {
      if (v.spec.home.level === 'room') {
        const int = buildInterior('home', v.ox, v.oz, v.door.name, hub, held && hasGoodMattress(s, held.uid) ? ['matelas'] : []);
        const comfort = held ? comfortOf(held) : 0;
        const bed = int.interactables.find(i => i.id === `${hub}:in:bed`);
        if (bed && comfort) bed.actions = bed.actions.map(a => ({ ...a, label: a.label + ' · moustiquaire', needs: { ...a.needs, energie: (a.needs?.energie ?? 0) + comfort } }));
        v.int = int; v.spots = null; v.ceiling = [];
      } else {
        const h = buildHomeInterior(v.spec, v.ox, v.oz, hub, held?.upgrades ?? []);
        v.int = h.int; v.spots = h.spots; v.ceiling = h.ceiling;
      }
      v.base = [...v.int.colliders];
      v.int.group.add(v.furniture);
      ctx.addInterior(v.door, v.int);
      v.shellKey = key;
      for (const p of v.pieces.values()) v.furniture.remove(p.obj);
      v.pieces.clear();
    }
    // pieces: one model per placed piece, at its saved spot
    const want = held ? furnitureIn(s, held.uid).filter(f => f.at && !furnitureSpec(f.spec)?.fixed) : [];
    for (const [uid, p] of v.pieces) if (!want.some(f => f.uid === uid && f.spec === p.spec)) { v.furniture.remove(p.obj); disposeModel(p.obj); v.pieces.delete(uid); }
    for (const f of want) {
      let p = v.pieces.get(f.uid);
      if (!p) { const obj = furnitureModel(furnitureSpec(f.spec)!); obj.userData.uid = f.uid; v.furniture.add(obj); p = { obj, spec: f.spec }; v.pieces.set(f.uid, p); }
      p.obj.position.set(v.ox + f.at!.x, FLOOR, v.oz + f.at!.z); p.obj.rotation.y = yawOf(f.at!);
    }
    this.upgradeDressing(v, held);
    // colliders: the shell's, then every piece standing (rugs are walked on)
    v.int.colliders.length = 0; v.int.colliders.push(...v.base);
    for (const f of want) { const fs = furnitureSpec(f.spec)!; if (fs.flat) continue; const r = footprint(fs, f.at!); v.int.colliders.push({ x0: v.ox + r.x0, z0: v.oz + r.z0, x1: v.ox + r.x1, z1: v.oz + r.z1, h: 1 }); }
    // seats: unchanged ones stay (with whoever sits there), the others are replaced
    const seats: Seat[] = [];
    for (const f of want) (furnitureSpec(f.spec)!.seats ?? []).forEach((st, k) => {
      const [x, z] = toHome(f.at!, st.x, st.z);
      seats.push({ id: seatId(hub, f.uid, k), x: v.ox + x, z: v.oz + z, top: st.top - 0.1 + FLOOR, yaw: yawOf(f.at!) + st.yaw, kind: st.kind, space: 'home', occupant: null });
    });
    const same = (a: Seat | null, b: Seat) => !!a && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6 && a.yaw === b.yaw && a.top === b.top;
    for (const id of v.seatIds) {
      const old = ctx.seats.get(id), next = seats.find(x => x.id === id);
      if (next && same(old, next)) continue;
      if (ctx.player.seated()?.id === id) ctx.player.standUp(true);
      ctx.seats.remove(id);
    }
    for (const st of seats) if (!ctx.seats.get(st.id)) ctx.seats.add(st);
    v.seatIds = seats.map(x => x.id);
    // activities of the home
    if (held) ctx.places.add(this.homePlace(v, held, want)); else ctx.places.remove(`home:${v.spec.id}`);
  }

  /** Comfort upgrades that show: a mosquito net over the starter bed, a ceiling fan, an air conditioner, a lit cove. */
  private upgradeDressing(v: HomeView, held: AssetState | undefined) {
    const old = v.furniture.getObjectByName('upgrades'); if (old) { v.furniture.remove(old); disposeModel(old); }
    if (!held || !held.upgrades.length) return;
    const g = new THREE.Group(); g.name = 'upgrades';
    const has = (u: string) => held.upgrades.includes(u), L = v.spec.home, H = L.level === 'house' ? 3.1 : L.level === 'villa' ? 3.3 : L.level === 'residence' ? 3.4 : 2.9;
    const mat = new THREE.MeshLambertMaterial({ color: 0xf8f8f2, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    if (has('moustiquaire')) {                                             // over the starter room's bed (x0 + 1.1, oz − 0.6)
      const net = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 1.05, 1.5, 12, 1, true), mat); net.position.set(v.ox - 1.9, 1.6, v.oz - 0.55); g.add(net);
    }
    const solid = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c })); m.position.set(x, y, z); g.add(m); };
    if (has('ventilo')) { solid(0.06, 0.4, 0.06, v.ox + 1.5, H - 0.2, v.oz + 0.5, 0x333333); for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.015, 0.9), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 })); b.position.set(v.ox + 1.5 + Math.sin(k * 2.094) * 0.45, H - 0.38, v.oz + 0.5 + Math.cos(k * 2.094) * 0.45); b.rotation.y = k * 2.094; g.add(b); } }
    if (has('clim') || has('domotique')) solid(1.0, 0.32, 0.22, v.ox - L.w / 2 + 1.6, H - 0.55, v.oz - L.d / 2 + 0.12, 0xf2f2ee);
    if (has('domotique')) { const strip = new THREE.Mesh(new THREE.BoxGeometry(L.w - 0.6, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: 0xfff1d0 })); strip.position.set(v.ox, H - 0.08, v.oz - L.d / 2 + 0.06); g.add(strip); }
    if (has('jardin')) for (let k = 0; k < 4; k++) { const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), new THREE.MeshLambertMaterial({ color: k % 2 ? 0xd94a8c : 0x3f7a35 })); p.position.set(v.ox - L.w / 2 + 2 + k * 2.2, 0.55, v.oz - L.d / 2 + 0.5); g.add(p); }
    v.furniture.add(g);
  }

  private homePlace(v: HomeView, held: AssetState, pieces: AssetState[]): PlaceSpec {
    const anchors: Anchor[] = [], offers: Record<string, ActivitySpec[]> = {}, hub = this.hub!.id;
    const comfort = comfortOf(held);
    for (const f of pieces) {
      const fs = furnitureSpec(f.spec)!, at = f.at!;
      if (fs.sleep) {
        const [x, z] = toHome(at, 0, 0);
        anchors.push({ id: f.uid, name: fs.name, kind: 'furniture', x: v.ox + x, z: v.oz + z, y: 1.1, radius: Math.max(fs.w, fs.d) / 2 + 0.9 });
        offers[f.uid] = [P.sleep({ id: 'dormir', label: 'Dormir', detail: `+${fs.sleep + comfort} énergie`, seat: seatId(hub, f.uid, 0), seconds: 6, energy: fs.sleep + comfort })];
        continue;
      }
      const u = fs.use; if (!u) continue;
      const [sx, sz] = u.spot ?? [0, fs.d / 2 + 0.6], [x, z] = toHome(at, sx, sz);
      anchors.push({ id: f.uid, name: fs.name, kind: 'furniture', x: v.ox + x, z: v.oz + z, y: 1.3, radius: 1.1 });
      offers[f.uid] = [this.useSpec(fs, f, hub)];
    }
    if (v.spots) {
      anchors.push({ id: 'cuisine', name: 'Cuisine', kind: 'counter', x: v.spots.kitchen.x, z: v.spots.kitchen.z, y: 1.4, radius: 1.2 });
      offers.cuisine = [P.use({ id: 'cuisiner', label: 'Cuisiner un repas', primitive: 'eat', detail: '500 F d’ingrédients, faim +50', price: 500, seconds: 6, clip: 'Grab', effects: { needs: { faim: 50, moral: 4 }, counters: { meals: 1 } } })];
      anchors.push({ id: 'douche', name: 'Douche', kind: 'spot', x: v.spots.shower.x, z: v.spots.shower.z, y: 1.6, radius: 1.1 });
      offers.douche = [P.use({ id: 'douche', label: 'Prendre une douche', primitive: 'wash', seconds: 3, effects: { needs: { hygiene: 60, moral: 3 } } })];
    }
    return { id: `home:${v.spec.id}`, type: 'home', name: v.spec.name, space: 'home', anchors, offers };
  }
  private useSpec(fs: FurnitureSpec, f: AssetState, hub: string): ActivitySpec {
    const u = fs.use!, s = this.s;
    const deskWait = () => {
      const last = s.data.counters.bureau_at; if (last === undefined) return null;
      const left = last + HOUR_MS - s.data.playedMs;
      return left > 0 ? `Reviens dans ${Math.ceil(left / 1000)} s (une fois par heure en ville)` : null;
    };
    return P.use({
      id: u.id, label: u.label, seconds: u.seconds, price: u.price, primitive: u.price ? 'eat' : u.pay ? 'work' : 'use',
      detail: u.pay ? `+${fcfa(u.pay)} · une fois par heure en ville` : u.price ? `${fcfa(u.price)} d’ingrédients` : undefined,
      seat: u.sit && fs.seats?.length ? seatId(hub, f.uid, 0) : undefined, clip: u.sit ? undefined : u.pay ? undefined : 'Talk',
      effects: { money: u.pay, needs: u.needs, counters: u.counter ? { [u.counter]: 1 } : undefined, category: u.pay ? 'service' : 'loisir' },
      requires: u.pay ? deskWait : undefined,
      then: u.pay ? () => { s.data.counters.bureau_at = s.data.playedMs; } : undefined,
    });
  }

  /** The view of the interior the player is in, if it is a home of this hub. */
  viewInside(): HomeView | null { const i = this.ctx.inside(); return i ? [...this.views.values()].find(v => v.int === i.int) ?? null : null; }
  private collectSelf(space: string, x: number, z: number, out: Target[]) {
    if (space !== 'home' || this.editor.isOpen) return;
    const v = this.viewInside(); if (!v) return;
    const held = holding(this.s, v.spec.id);
    out.push({
      id: 'home:self', name: v.spec.name.split(' · ')[0], kind: 'self', space, x, z, radius: 1, bias: 2.6,
      affordances: () => !held
        ? [{ id: 'annonce', verb: 'inspect', label: 'Voir l’annonce', icon: '🔍', detail: 'Louer ou acheter ce logement', run: () => this.openSheet(v.spec.id) }]
        : furnitureIn(this.s, held.uid).some(f => !furnitureSpec(f.spec)?.fixed)
          ? [{ id: 'amenager', verb: 'use', label: 'Aménager', icon: '🛋️', detail: 'Déplacer, tourner, ranger tes meubles', run: () => { this.editor.open(v); } },
             { id: 'commander', verb: 'browse', label: 'Commander des meubles', icon: '🛒', detail: 'Keur Meubles livre et installe chez toi', run: () => this.openCatalogue() }]
          : [{ id: 'commander', verb: 'browse', label: 'Commander des meubles', icon: '🛒', detail: 'Keur Meubles livre et installe chez toi', run: () => this.openCatalogue() }],
    });
  }
  private enterHome(id: string) {
    const sp = homeSpec(id); if (!sp) return;
    if (!holds(this.s, id)) { this.openSheet(id); return; }
    this.ctx.enter(sp.home.door);
  }

  // ---------------------------------------------------------------- the cité's visuals
  private syncCite() {
    const c = this.cite, s = this.s; if (!c || !this.hub) return;
    for (const [id, p] of Object.entries(c.plots)) {
      const a = holding(s, id), wall = !!a?.upgrades.includes('mur'), key = `${a ? a.how : '-'}:${a?.leased}:${wall}`;
      if (this.plotKeys.get(id) === key) continue;
      this.plotKeys.set(id, key);
      const sp = specOf(id)!;
      setMap(p.board, a ? (a.leased ? plotBoardTexture('MARAÎCHAGE', `Loué · ${sp.size} m²`) : plotBoardTexture('PROPRIÉTÉ PRIVÉE', `${sp.size} m² · à toi`)) : plotBoardTexture(`À VENDRE · ${sp.size} m²`, fcfa(sp.price ?? 0)));
      const cols = dressPlot(p.group, p.rect, !!a?.leased, wall);
      const old = this.plotCols.get(id) ?? [];
      this.hub.colliders.splice(0, this.hub.colliders.length, ...this.hub.colliders.filter(x => !old.includes(x)), ...cols);
      this.plotCols.set(id, cols);
    }
    const b = holding(s, c.billboard.specId), mine = ventureName(s);
    const state: 'vacant' | 'leased' | 'own' = b?.leased ? 'leased' : b?.ownAd || (!b && s.data.assets.adUntil > s.data.playedMs) ? 'own' : 'vacant';
    const day = Math.floor(s.data.playedMs / (HOUR_MS * 24)), lit = !!b?.upgrades.includes('eclairage');
    const key = `${state}:${state === 'leased' ? day : ''}:${state === 'own' ? mine : ''}:${lit}`;
    if (key !== this.boardKey) {
      this.boardKey = key;
      setMap(c.billboard.panel, billboardTexture(state, day, mine));
      c.billboard.lights.visible = lit;
    }
  }

  // ---------------------------------------------------------------- sheets
  private open(title: string, subtitle: string, items: MenuItem[], html = '') {
    this.ctx.setMode('menu');
    this.ctx.hud.openMenu(title, subtitle, items, html);
  }
  private done(msg: string, reopen?: () => void) {
    this.ctx.toast(msg); this.ctx.save();
    if (reopen) reopen(); else { this.ctx.hud.closeModal(); }
  }
  /** Compact confirmation: what it costs and brings, then one tap. */
  confirm(title: string, rows: [string, string][], label: string, right: string, why: string | null, yes: () => void, back: () => void) {
    const html = `<div class="est-rows">${rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`;
    this.open(title, 'Vérifie avant de confirmer :', [
      { icon: '✅', label, right, detail: why ?? 'Une seule fois : pas de papiers, pas d’attente', disabled: !!why, onPick: yes },
      { icon: '↩️', label: 'Retour', onPick: back },
    ], html);
  }
  private left(price: number) { return fcfa(Math.max(0, this.s.wallet - price)); }

  /** The sheet of a home, a plot or a billboard: listing (buy, rent, visit) or management (enter, move in, let, upgrade, sell). */
  openSheet(specId: string) {
    const sp = specOf(specId); if (!sp) return;
    const s = this.s, a = holding(s, specId), home = homeSpec(specId), reopen = () => this.openSheet(specId);
    const items: MenuItem[] = [], rows: string[] = [];
    rows.push(`${KIND_ICON[sp.kind]} ${esc(sp.what)}`);
    rows.push(`${esc(sp.where ?? '')}${sp.size ? ` · ${sp.size.toLocaleString('fr-FR')} m²` : ''}`);
    if (!a) {
      if (sp.price) rows.push(`Prix : <b>${fcfa(sp.price)}</b>${sp.rent ? ` · ou en location : <b>${perDay(sp.rent)}</b>` : ''}`);
      if (sp.income && sp.kind !== 'home') rows.push(`Une fois à toi et loué : <b>+${fcfa(sp.income)} / h</b> en ville`);
      if (sp.upkeep) rows.push(`Charges si tu l’achètes : ${fcfa(sp.upkeep)} / h`);
      if (sp.soon) rows.push(`<span class="soon">${esc(sp.soon)}</span>`);
      if (sp.price) items.push({ icon: '🔑', label: 'Acheter', right: '−' + fcfa(sp.price), detail: cannotBuy(s, specId) ?? this.benefit(sp), disabled: !!cannotBuy(s, specId), onPick: () => this.confirmBuy(sp) });
      if (sp.rent) items.push({ icon: '📝', label: 'Louer', right: perDay(sp.rent), detail: cannotRent(s, specId) ?? `${fcfa(sp.rent / 24)} chaque heure en ville · tu rends les clés quand tu veux`, disabled: !!cannotRent(s, specId), onPick: () => this.confirmRent(sp) });
      if (home && this.inHub(sp)) items.push({ icon: '🚪', label: 'Visiter', detail: 'Entrer voir le logement, vide', onPick: () => { this.ctx.hud.closeModal(); this.ctx.enter(home.home.door); } });
      if (sp.kind === 'billboard') {
        const why = cannotRentAd(s), run = adRunning(s);
        items.push({ icon: '📣', label: 'Louer l’espace pub · 1 jour', right: '−' + fcfa(ECONOMY.property.adSpace.perDay), detail: why ?? `Ta pub en ville : tes affaires rapportent +${Math.round(ECONOMY.property.adSpace.boost * 100)} %${run ? ' (un jour de plus)' : ''}`, disabled: !!why,
          onPick: () => this.confirm('Espace pub · 1 jour', [['Prix', fcfa(ECONOMY.property.adSpace.perDay)], ['Effet', `Revenus de tes affaires +${Math.round(ECONOMY.property.adSpace.boost * 100)} % pendant une journée en ville`], ['Tes affaires', `${Object.keys(ownedVentures(s)).length ? 'oui' : 'aucune pour l’instant'}`], ['Il te restera', this.left(ECONOMY.property.adSpace.perDay)]],
            'Louer l’espace', '−' + fcfa(ECONOMY.property.adSpace.perDay), cannotRentAd(s), () => { if (rentAdSpace(s, sp.name)) this.done('Ta pub est affichée ✓ · un jour en ville', reopen); }, reopen) });
      }
    } else {
      const sub = [a.how === 'rented' ? `Loué par toi · ${perDay(sp.rent ?? 0)}` : a.how === 'given' ? 'Prêté par la famille' : `À toi · valeur ${fcfa(valueOf(a))}`];
      if (s.data.assets.home === a.uid) sub.push('tu y habites');
      rows.push(sub.join(' · '));
      const inc = incomeOf(s, a), chg = chargeOf(a);
      if (inc) rows.push(`Rapporte <b>+${fcfa(inc)} / h</b> en ville`);
      if (chg) rows.push(`${a.how === 'rented' ? 'Loyer' : 'Charges'} : ${fcfa(chg)} / h`);
      if ((specOf(specId)?.wear ?? 0) > 0) rows.push(`État : ${Math.round(a.condition)} %`);
      if (a.upgrades.length) rows.push(`Améliorations : ${a.upgrades.map(u => esc(sp.upgrades?.find(x => x.id === u)?.name ?? u)).join(', ')}`);
      if (home) {
        const inside = this.viewInside()?.spec.id === specId;
        if (!inside && this.inHub(sp)) items.push({ icon: '🚪', label: 'Entrer chez toi', onPick: () => { this.ctx.hud.closeModal(); this.ctx.enter(home.home.door); } });
        if (inside) items.push({ icon: '🛋️', label: 'Aménager', detail: 'Déplacer, tourner, ranger tes meubles', onPick: () => { this.ctx.hud.closeModal(); const v = this.viewInside(); if (v) this.editor.open(v); } });
        const why = cannotMoveIn(s, a.uid);
        if (why !== 'Tu y habites déjà') items.push({ icon: '📦', label: 'Emménager ici', detail: why ?? `Tes meubles suivent et s’installent où il y a de la place (${furnitureIn(s, currentHome(s).uid).length} pièces)`, disabled: !!why,
          onPick: () => { if (moveIn(s, a.uid, true)) this.done(`Tu habites maintenant : ${sp.name} ✓ · tes meubles ont suivi`, reopen); } });
      }
      if (a.how === 'owned' && (sp.kind === 'land' || sp.kind === 'billboard' || home)) {
        const why = a.leased ? null : cannotLet(s, a.uid), what = sp.kind === 'land' ? 'à un maraîcher' : sp.kind === 'billboard' ? 'aux annonceurs' : 'à une famille';
        const gain = (sp.income ?? 0) * (a.upgrades.reduce((m, u) => m * (sp.upgrades?.find(x => x.id === u)?.rentMult ?? 1), 1));
        items.push(a.leased
          ? { icon: '⏹️', label: 'Arrêter la location', detail: 'Il ne rapporte plus rien, il redevient libre', onPick: () => { setLeased(s, a.uid, false); this.done('Location arrêtée', reopen); } }
          : { icon: '💼', label: `Mettre en location ${what}`, right: `+${fcfa(gain)} / h`, detail: why ?? 'Payé chaque heure en ville, pendant que tu joues', disabled: !!why, onPick: () => { if (setLeased(s, a.uid, true)) this.done(`Loué ${what} ✓ · +${fcfa(gain)} chaque heure en ville`, reopen); } });
      }
      if (a.how === 'owned' && sp.kind === 'billboard') items.push(a.ownAd
        ? { icon: '🧽', label: 'Retirer ta pub', onPick: () => { setOwnAd(s, a.uid, false); this.done('Ta pub est retirée', reopen); } }
        : { icon: '📣', label: 'Afficher ta pub', detail: `Tes affaires rapportent +${Math.round(ECONOMY.property.adSpace.boost * 100)} % (le panneau ne se loue plus)`, onPick: () => { setOwnAd(s, a.uid, true); this.done('Ta pub est affichée ✓', reopen); } });
      for (const up of sp.upgrades ?? []) {
        if (a.upgrades.includes(up.id)) continue;
        const why = cannotUpgrade(s, a.uid, up.id);
        items.push({ icon: '⭐', label: up.name, right: '−' + fcfa(up.price), detail: why ?? up.what, disabled: !!why,
          onPick: () => this.confirm(up.name, [['Prix', fcfa(up.price)], ['Effet', up.what], ['Pour', sp.name], ['Il te restera', this.left(up.price)]], 'Confirmer', '−' + fcfa(up.price), cannotUpgrade(s, a.uid, up.id),
            () => { if (upgradeAsset(s, a.uid, up.id)) this.done(`${up.name} ✓`, reopen); }, reopen) });
      }
      if (a.how === 'owned' && a.condition < 95) { const cost = repairCost(a); items.push({ icon: '🔧', label: 'Réparer', right: '−' + fcfa(cost), detail: `Comme neuf : le loyer remonte`, disabled: !s.canAfford(cost), onPick: () => { if (repairAsset(s, a.uid)) this.done('Réparé ✓', reopen); } }); }
      if (sp.kind === 'land') items.push({ icon: '🏗️', label: 'Construire', detail: 'Bientôt : les chantiers arrivent avec la vague 2', disabled: true, onPick: () => {} });
      if (a.how === 'rented') items.push({ icon: '🗝️', label: 'Rendre les clés', detail: 'Le loyer s’arrête ; tes meubles reviennent chez toi', onPick: () => this.confirm('Rendre les clés', [['Logement', sp.name], ['Loyer', 'il s’arrête maintenant'], ['Tes meubles', 'ils reviennent dans ton logement']], 'Rendre les clés', '', null, () => { endLease(s, a.uid); this.done('Clés rendues ✓', reopen); }, reopen) });
      if (!cannotSell(s, a.uid)) items.push({ icon: '💰', label: 'Vendre', right: '+' + fcfa(saleValue(a)), detail: 'Payé tout de suite', onPick: () => this.confirm(`Vendre : ${sp.name}`, [['Tu reçois', fcfa(saleValue(a))], ['Valeur actuelle', fcfa(valueOf(a))], ...(inc ? [['Il ne rapportera plus', `+${fcfa(inc)} / h`] as [string, string]] : []), ...(home ? [['Tes meubles', 'ils reviennent dans ton logement'] as [string, string]] : [])],
        'Vendre', '+' + fcfa(saleValue(a)), cannotSell(s, a.uid), () => { const got = sellAsset(s, a.uid); this.done(`Vendu ✓ +${fcfa(got)}`, reopen); }, reopen) });
    }
    if (!this.inHub(sp) && sp.hub) rows.push(`À ${esc(sp.where ?? sp.hub)} : prends un car rapide pour y aller.`);
    else if (ENTRY[specId] && !this.near(specId)) items.push({ icon: '📍', label: 'Y aller à pied', detail: 'Pose le repère de la ville', onPick: () => { this.ctx.walkTo(ENTRY[specId]); this.done(`Repère : ${sp.name}`); } });
    this.open(sp.name.split(' · ')[0], `${KIND_LABEL[sp.kind]}${sp.where ? ' · ' + sp.where : ''}`, items, `<div class="kv">${rows.filter(Boolean).join('<br>')}</div>`);
  }
  private benefit(sp: AssetSpec): string {
    if (sp.kind === 'home') { const h = sp as HomeSpec; return `${h.home.w * h.home.d | 0} m² à meubler${h.home.level === 'room' ? '' : ', cuisine et douche'} · ou à louer : +${fcfa(sp.income ?? 0)} / h`; }
    if (sp.kind === 'land') return `Loué à un maraîcher : +${fcfa(sp.income ?? 0)} / h`;
    if (sp.kind === 'billboard') return `Loué aux annonceurs : +${fcfa(sp.income ?? 0)} / h, ou ta pub`;
    return sp.what;
  }
  private confirmBuy(sp: AssetSpec) {
    const s = this.s, back = () => this.openSheet(sp.id), h = homeSpec(sp.id);
    const rows: [string, string][] = [['Prix', fcfa(sp.price!)], ['Il te restera', this.left(sp.price!)]];
    if (h) {
      rows.push(['Surface', `${sp.size} m² · ${h.home.level === 'room' ? 'une pièce' : 'salon, cuisine, douche'}`]);
      rows.push(['Débloque', 'Emménager, y mettre tes meubles, cuisiner et te doucher chez toi']);
      rows.push(['Ou le louer', `+${fcfa(sp.income ?? 0)} / h en ville`]);
      if (sp.upkeep) rows.push(['Charges', `${fcfa(sp.upkeep)} / h`]);
      if (holding(s, sp.id)?.how === 'rented') rows.push(['Ta location', 'elle s’arrête : il devient à toi']);
    } else {
      rows.push(['Rapporte', `+${fcfa(sp.income ?? 0)} / h une fois loué`]);
      if (sp.upgrades?.length) rows.push(['Améliorable', sp.upgrades.map(u => u.name).join(', ')]);
      rows.push(['Revente', `tout de suite, ${Math.round(ECONOMY.property.saleShare * 100)} % de sa valeur`]);
    }
    this.confirm(`Acheter : ${sp.name.split(' · ')[0]}`, rows, 'Acheter', '−' + fcfa(sp.price!), cannotBuy(s, sp.id),
      () => { if (buyAsset(s, sp.id)) this.done(`${sp.name.split(' · ')[0]} est à toi ✓  −${fcfa(sp.price!)}`, back); }, back);
  }
  private confirmRent(sp: AssetSpec) {
    const s = this.s, back = () => this.openSheet(sp.id);
    this.confirm(`Louer : ${sp.name.split(' · ')[0]}`, [
      ['Loyer', `${perDay(sp.rent!)} · soit ${fcfa(sp.rent! / 24)} chaque heure en ville`], ['Payé', 'au fil du jeu, pendant que tu joues (rien hors ligne)'],
      ['Débloque', 'Emménager, y mettre tes meubles, cuisiner et te doucher chez toi'], ['Impayé', `après ${ECONOMY.property.evictDays} jours de loyer impayé, le propriétaire reprend les clés`],
    ], 'Louer', perDay(sp.rent!), cannotRent(s, sp.id), () => { if (rentAsset(s, sp.id)) this.done(`Clés en main ✓ · ${sp.name.split(' · ')[0]}`, back); }, back);
  }
  private inHub(sp: AssetSpec) { return !sp.hub || sp.hub === this.hub?.id; }
  private near(specId: string) {
    const e = this.hub?.interactables.find(i => i.id === ENTRY[specId]), p = this.ctx.player.pos, d = this.ctx.inside()?.door;
    return !!e && Math.hypot(e.x - (d?.x ?? p.x), e.z - (d?.z ?? p.z)) < 12;
  }

  // ---------------------------------------------------------------- Keur Meubles
  openCatalogue(room?: string) {
    const s = this.s, home = specOfAsset(currentHome(s)).name;
    if (!room) {
      this.open('Keur Meubles', `Livré chez toi : ${home} · en poche ${fcfa(s.wallet)}`, ROOMS.map(r => {
        const list = CATALOGUE.filter(f => r.types.includes(f.type)), prices = list.map(f => f.price ?? 0);
        return { icon: list[0]?.emoji ?? '🛋️', label: r.label, detail: `${r.what} · de ${fcfa(Math.min(...prices))} à ${fcfa(Math.max(...prices))}`, onPick: () => this.openCatalogue(r.id) };
      }), `<div class="kv">Simple, Confort, Prestige : choisis, c’est livré et installé chez toi. Ensuite « Aménager » chez toi pour déplacer.</div>`);
      return;
    }
    const r = ROOMS.find(x => x.id === room)!;
    const items: MenuItem[] = CATALOGUE.filter(f => r.types.includes(f.type)).sort((a, b) => (a.price ?? 0) - (b.price ?? 0)).map(f => {
      const n = piecesOf(s, f.id).length, why = cannotBuyFurniture(s, f.id);
      return { icon: f.emoji, label: f.name, right: fcfa(f.price ?? 0), detail: `${GRADE_LABEL[f.grade]} · ${why && why !== 'Pas assez d’argent' ? why : f.what}${n ? ` · ${n} chez toi` : ''}`, disabled: !!why, onPick: () => this.confirmFurniture(f, () => this.openCatalogue(room)) };
    });
    items.push({ icon: '↩️', label: 'Tout le catalogue', onPick: () => this.openCatalogue() });
    this.open(`Keur Meubles · ${r.label}`, `Livré chez toi : ${home} · en poche ${fcfa(s.wallet)}`, items);
  }
  /** Confirmation of a piece of furniture: price, what it does, where it goes. */
  confirmFurniture(f: FurnitureSpec, back: () => void) {
    const s = this.s, home = specOfAsset(currentHome(s)).name;
    const rows: [string, string][] = [['Prix', fcfa(f.price ?? 0)], ['Gamme', GRADE_LABEL[f.grade]], ['Ce qu’il apporte', f.what]];
    if (f.sleep) rows.push(['Sommeil', `+${f.sleep} énergie par nuit`]);
    if (f.seats?.length) rows.push(['Places assises', String(f.seats.length)]);
    if (f.use?.pay) rows.push(['Rapporte', `+${fcfa(f.use.pay)} une fois par heure en ville`]);
    rows.push(['Livré', f.fixed ? `sur ton lit (${home})` : `chez toi (${home}), installé où il y a de la place`]);
    rows.push(['Il te restera', this.left(f.price ?? 0)]);
    this.confirm(`Acheter : ${f.name}`, rows, 'Acheter', '−' + fcfa(f.price ?? 0), cannotBuyFurniture(s, f.id), () => {
      const piece = deliverFurniture(s, f.id);
      if (piece) this.done(`${f.name} ✓  −${fcfa(f.price ?? 0)} · ${f.fixed ? 'sur ton lit' : piece.at ? 'livré et installé chez toi' : 'livré, rangé (plus de place)'}`, back);
    }, back);
  }
  private talkSeller() { this.ctx.toast(SELLER_LINES[this.talkN++ % SELLER_LINES.length]); this.s.adjust({ social: 2 }); }

  // ---------------------------------------------------------------- phone apps
  /** « Biens »: net worth, income and charges per hour, everything held, the listings. */
  openAssets() {
    const s = this.s, held = s.data.assets.list.filter(a => { const sp = specOf(a.spec); return sp && !a.home && sp.kind !== 'business' && sp.kind !== 'furniture'; });
    const ventures = assetsOf(s, 'business').length, pieces = assetsOf(s, 'furniture').length, ad = s.data.assets.adUntil - s.data.playedMs;
    const html = `<div class="biz-sum">
        <div><small>Fortune totale</small><b>${fcfa(netWorth(s))}</b></div>
        <div><small>Valeur des biens</small><b>${fcfa(assetsValue(s))}</b></div>
        <div><small>Revenus par heure</small><b>+${fcfa(incomePerHour(s))}</b></div>
        <div><small>Loyers et charges</small><b>−${fcfa(chargesPerHour(s))}</b></div>
      </div>${s.data.assets.arrears ? `<div class="draft">Loyer impayé : ${fcfa(s.data.assets.arrears)} (payé dès que tu gagnes de l’argent)</div>` : ''}${ad > 0 ? `<div class="kv">📣 Ta pub tourne encore ${Math.ceil(ad / HOUR_MS)} h en ville.</div>` : ''}
      <div class="draft">Revenus et loyers comptent chaque heure en ville (1 min de jeu), seulement pendant que tu joues.</div>`;
    const items: MenuItem[] = held.map(a => {
      const sp = specOfAsset(a), inc = incomeOf(s, a), chg = chargeOf(a);
      const tag = s.data.assets.home === a.uid ? '★ chez toi · ' : '';
      return { icon: KIND_ICON[sp.kind], label: sp.name, right: inc ? `+${fcfa(inc)}/h` : chg ? `−${fcfa(chg)}/h` : a.how === 'owned' ? fcfa(valueOf(a)) : '',
        detail: tag + (a.how === 'rented' ? `loué par toi · ${perDay(sp.rent ?? 0)}` : a.how === 'given' ? 'prêté par la famille' : a.leased ? 'à toi · loué' : 'à toi'), onPick: () => this.openSheet(sp.id) };
    });
    items.push({ icon: '🏪', label: 'Affaires', detail: ventures ? `${ventures} affaire${ventures > 1 ? 's' : ''}` : 'Aucune pour l’instant', onPick: () => { this.ctx.hud.closeModal(); phoneHooks.openBusiness?.(); } });
    items.push({ icon: '🛋️', label: 'Meubles', detail: `${pieces} pièce${pieces > 1 ? 's' : ''} · aménage chez toi`, onPick: () => this.openHomeApp() });
    items.push({ icon: '🔎', label: 'Annonces', detail: 'Logements, terrains, panneau… et ce qui arrive bientôt', onPick: () => this.openListings() });
    this.open('Biens', `${held.length} bien${held.length > 1 ? 's' : ''} · en poche ${fcfa(s.wallet)}`, items, html);
  }
  openListings() {
    const s = this.s, list = [...HOMES, ...LAND, ...BILLBOARDS, ...VEHICLES, ...AIRCRAFT].filter(sp => !holds(s, sp.id) && (sp.price || sp.rent));
    this.open('Annonces', 'À acheter ou à louer', [
      ...list.map(sp => ({ icon: KIND_ICON[sp.kind], label: sp.name, right: sp.price ? fcfa(sp.price) : perDay(sp.rent!),
        detail: sp.soon ?? [sp.where, sp.rent ? `location ${perDay(sp.rent)}` : '', sp.income && sp.kind !== 'home' ? `+${fcfa(sp.income)}/h une fois loué` : ''].filter(Boolean).join(' · '),
        disabled: !!sp.soon, onPick: () => this.openSheet(sp.id) })),
      { icon: '↩️', label: 'Retour aux biens', onPick: () => this.openAssets() },
    ]);
  }
  /** « Maison »: where the player lives, its furniture, arranging it, ordering more. */
  openHomeApp() {
    const s = this.s, h = currentHome(s), sp = specOfAsset(h), all = furnitureIn(s, h.uid), placed = all.filter(f => f.at || furnitureSpec(f.spec)?.fixed).length;
    const inside = this.viewInside(), here = inside?.spec.id === h.spec;
    const homes = assetsOf(s, 'home');
    const items: MenuItem[] = [
      { icon: '🛋️', label: 'Aménager', detail: here ? 'Déplacer, tourner, ranger tes meubles' : 'Entre chez toi pour aménager', disabled: !here || !all.length, onPick: () => { this.ctx.hud.closeModal(); if (inside) this.editor.open(inside); } },
      { icon: '🛒', label: 'Commander chez Keur Meubles', detail: 'Livré et installé chez toi', onPick: () => this.openCatalogue() },
      ...homes.map(a => ({ icon: s.data.assets.home === a.uid ? '★' : '🏠', label: specOfAsset(a).name, detail: s.data.assets.home === a.uid ? 'Tu y habites' : a.how === 'rented' ? 'Loué par toi · emménager, rendre les clés' : 'À toi · emménager, louer, vendre', onPick: () => this.openSheet(a.spec) })),
      { icon: '🔑', label: 'Tous mes biens', onPick: () => this.openAssets() },
    ];
    const list = all.map(f => `${furnitureSpec(f.spec)!.emoji} ${esc(furnitureSpec(f.spec)!.name)}${f.at || furnitureSpec(f.spec)!.fixed ? '' : ' (rangé)'}`).join(' · ');
    this.open(sp.name.split(' · ')[0], `${sp.where ?? ''} · ${all.length} meuble${all.length > 1 ? 's' : ''} (${placed} installés)`, items,
      `<div class="kv">${all.length ? list : 'Pas encore de meubles : Keur Meubles (Cité Jàmm, en face) livre chez toi.'}${comfortOf(h) ? `<br>Confort : +${comfortOf(h)} énergie au réveil` : ''}</div>`);
  }

  // ---------------------------------------------------------------- debug (window.__dakar, ?debug only)
  debug() {
    // called when window.__dakar is assembled, before init: everything is read when a function runs
    const self = this;
    return {
      estate: () => ({
        home: specOfAsset(currentHome(self.s)).id, worth: netWorth(self.s), value: assetsValue(self.s), income: incomePerHour(self.s), charges: chargesPerHour(self.s), arrears: self.s.data.assets.arrears,
        assets: self.s.data.assets.list.map(a => ({ uid: a.uid, spec: a.spec, kind: specOf(a.spec)?.kind, how: a.how, leased: a.leased, ownAd: !!a.ownAd, home: a.home ?? null, at: a.at ?? null, upgrades: [...a.upgrades], condition: Math.round(a.condition) })),
      }),
      citeSpots: () => this.cite ? { till: this.cite.shop.till, seller: this.cite.shop.seller, homes: this.cite.homes, plots: Object.fromEntries(Object.entries(this.cite.plots).map(([k, p]) => [k, p.sign])), billboard: this.cite.billboard.sign, entries: ENTRY } : null,
      assetSheet: (id: string) => this.openSheet(id), catalogue: (room?: string) => this.openCatalogue(room), assetsApp: () => this.openAssets(), homeApp2: () => this.openHomeApp(), listings: () => this.openListings(),
      buyAsset: (id: string) => !!buyAsset(self.s, id), rentAsset: (id: string) => !!rentAsset(self.s, id), moveIn: (id: string) => { const a = holding(self.s, id); return !!a && moveIn(self.s, a.uid, true); },
      letAsset: (id: string, on = true) => { const a = holding(self.s, id); return !!a && setLeased(self.s, a.uid, on); },
      buyPiece: (id: string) => { const p = deliverFurniture(self.s, id); return p ? { uid: p.uid, at: p.at ?? null } : null; },
      homeView: () => { const v = this.viewInside(); return v ? { spec: v.spec.id, ox: v.ox, oz: v.oz, pieces: [...v.pieces.entries()].map(([uid, p]) => ({ uid, spec: p.spec, x: p.obj.position.x, z: p.obj.position.z, yaw: p.obj.rotation.y })), seats: v.seatIds.map(id => this.ctx.seats.get(id)).filter(Boolean), colliders: v.int.colliders.length } : null; },
      placer: {
        open: () => { const v = this.viewInside(); return v ? self.editor.open(v) : false; }, close: () => self.editor.close(), info: () => self.editor.info(),
        select: (uid: string) => self.editor.select(uid), move: (dx: number, dz: number) => self.editor.move(dx, dz), moveTo: (x: number, z: number) => self.editor.moveTo(x, z), rotate: () => self.editor.rotate(), put: () => self.editor.put(), stash: () => self.editor.stash(),
      },
      legacyItem: (id: string) => furnitureById(id)?.name ?? null,
      enterHome: (id: string) => { const sp = homeSpec(id); if (sp) this.ctx.enter(sp.home.door); return !!sp; },
      citeState: () => ({ board: this.boardKey, plots: Object.fromEntries(this.plotKeys), plotColliders: Object.fromEntries([...this.plotCols].map(([k, v]) => [k, v.length])) }),
      homeSpots: () => { const v = this.viewInside(); return v ? { spots: v.spots, spawn: v.int.spawn, door: v.door.id } : null; },
    };
  }
}

const seatId = (hub: string, uid: string, k: number) => `${hub}:home:${uid}:${k}`;
/** Gates of two villa lots of Almadies, block (1, 1), lots 3 and 2 (the gate is the lot's centre, on the street side). */
const LOT = (BLK - 2) / 2, BM = (k: number) => -HALF + ROAD + k * PITCH;   // lot size and block corner (world/builder.ts)
const VILLA_GATES: Record<string, { x: number; z: number }> = {
  villa_almadies: { x: BM(1) + LOT + 2 + LOT / 2, z: BM(1) + LOT + 2 + LOT - 0.3 },
  residence_ngor: { x: BM(1) + LOT / 2, z: BM(1) + LOT + 2 + LOT - 0.3 },
};
const ventureName = (s: GameCtx['state']) => { const v = [...VENTURES].reverse().find(x => (ownedVentures(s)[x.id] ?? 0) > 0); return v ? v.name : 'Ton affaire'; };
function setMap(m: THREE.Mesh, tex: THREE.Texture) {
  const mat = m.material as THREE.MeshLambertMaterial;
  mat.map?.dispose(); mat.map = tex; mat.emissiveMap = tex; mat.needsUpdate = true;
}
function disposeModel(o: THREE.Object3D) { o.traverse(c => { const m = c as THREE.Mesh; if (!m.isMesh) return; m.geometry?.dispose(); const mat = m.material as THREE.Material; if (mat && !mat.userData.shared) mat.dispose(); }); }

const estate = new Estate();
/** The ownership module (registered in src/game/modules.ts MODULES). */
export const ESTATE_MODULE: GameModule = {
  name: 'estate',
  init: ctx => estate.init(ctx),
  hubLoaded: (ctx, hub) => estate.hubLoaded(ctx, hub),
  update: (ctx, dt) => estate.update(ctx, dt),
  spaceChanged: () => estate.spaceChanged(),
  debug: () => estate.debug(),
};
