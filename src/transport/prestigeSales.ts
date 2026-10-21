import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { HubId } from '../core/types';
import type { HubWorld } from '../world/types';
import type { Affordance, Target, TargetSource } from '../interact/types';
import { Humanoid, humanoidReady, type PersonLook } from '../actors/humanoid';
import { NavGrid, type Pt } from '../world/navgrid';
import { HALL, PRESTIGE_HUB, SALES_HOME, inGrounds } from '../world/prestige';
import { say } from '../i18n/wolof';
import { fcfa } from '../ui/hud';
import { callTexture } from './vehicle';
import { vehicleAudio } from './vehicleAudio';

/**
 * « Prestige Auto »'s salesperson: a real person with a real position, who walks (never teleports) on a walking map of the hall and the forecourt
 * (src/world/navgrid.ts, built from the hub's colliders each time he sets out, so the cars on the floor are walked round, the glass is never crossed and
 * the way out is the door or the bay).
 *
 *   – He stands at his desk. When a customer comes within sight (once per visit, with a long pause before he greets again), he turns to them, walks over, and
 *     greets them in a few words of French and Wolof; he waits a few seconds near them, then goes back. Nothing is forced: the greeting is a line over his head
 *     and « Parler au vendeur » is there if they want it; walking away, or going to a car, is as good an answer as any.
 *   – The player picks a car on the floor (« Essayer cette voiture », src/transport/ownedModule.ts): he walks to that car, unlocks it (a chirp), and holds the keys
 *     out. The player takes them, walks to the driver's side and opens the door themselves.
 *   – When the player is back from the drive and has parked and got out, he walks to them and the same « Parler au vendeur » offers the car with its price
 *     (the confirmation shows the price and the wallet), or the keys are handed back.
 * The cars themselves, the door, the drive and the purchase belong to the vehicle modules; this module only moves the man, speaks for him and tells them what he did.
 */
export interface FloorCarInfo {
  slot: number; x: number; z: number; yaw: number;
  /** Where the salesperson stands to show it (in front of its nose, off the driver's side) and the driver's door's step (where the customer stands). */
  stand: Pt; step: Pt;
  name: string; colour: string; price: number;
  state: 'display' | 'unlocked' | 'out';
  /** Why it cannot be tried or bought now (the player has the model, or a trial car out), else null. */
  locked: string | null;
}
export interface FloorOwner {
  /** The module's key (icons and the checks): 'berline', 'suv', 'car', 'teranga'… */
  readonly model: string;
  /** An SUV (its icon). */
  readonly tall?: boolean;
  floorCars(): FloorCarInfo[];
  unlockFloor(slot: number): void;
  lockFloor(slot: number): void;
  /** The vehicle the player has out on a free trial, parked or driven (null: none). */
  trialCar(): { x: number; z: number; yaw: number; driving: boolean; slot: number; name: string; price: number } | null;
  /** The price and the confirmation for the trial vehicle (or for floor car `slot`), then the purchase in place. */
  askBuy(slot?: number): void;
  /** Hands the trial vehicle back: the dealership collects it (see OwnedVehicleModule.recallTrial). */
  returnTrial(): void;
}

const SALESMAN: PersonLook = { skin: 0x4e2e1c, style: 'tee', top: 0xf1f1ee, bottom: 0x17181c, hat: null, shoes: 0x101012, muscular: 0.2 };
const WALK = 1.35, GREET_RANGE = 22, GREET_PAUSE = 240, WAIT = 9;
const GRID = { x0: -114, x1: -66, z0: 5, z1: 54 };
type MenuItems = Parameters<GameCtx['menu']>[2];
/**
 * One dealership's floor and its salesperson (Prestige Auto, Ndiaye Auto, Sarr Auto): where he stands, the ground he walks, who he is and what he says.
 * Everything else (the cars, the trial, the purchase) is the vehicle modules'.
 */
export interface SalesConfig {
  /** Module name (and debug key: `sales` for Prestige, `sales_<key>` for the others). */
  key: string;
  hub: HubId;
  /** The dealership's name (menus, toasts). */
  title: string;
  /** How the menus name him (« le vendeur », « Pape Sarr »). */
  person: string;
  look: PersonLook;
  /** Where he stands at his post, the walking map's bounds and the dealership's grounds, from the built hub (null: this layout has no such dealer). */
  layout(hub: HubWorld): { home: { x: number; z: number; yaw: number }; grid: { x0: number; x1: number; z0: number; z1: number }; grounds: (x: number, z: number, pad?: number) => boolean } | null;
  greetings: { bubble: string; say: () => string }[];
  /** Opening hours [from, to) on the city clock; absent: always there. */
  hours?: [number, number];
  /** More lines in his menu (a relationship: errands, credit), before « Rien, merci ». */
  talkExtra?(ctx: GameCtx): MenuItems;
  /** The first words of his menu (a relationship's memory), else the default. */
  talkIntro?(ctx: GameCtx, trial: boolean): string | null;
  /** He has just greeted the customer (a relationship counts the visit). */
  onGreet?(ctx: GameCtx): void;
}
const PRESTIGE_LAYOUT: SalesConfig['layout'] = hub => (hub.id === PRESTIGE_HUB ? { home: { x: SALES_HOME.x, z: SALES_HOME.z, yaw: Math.PI }, grid: GRID, grounds: inGrounds } : null);
const GREETINGS = [
  { bubble: 'Bienvenue chez Prestige !', say: () => `Bonjour, ${say('Dalal ak jàmm')} chez Prestige ! ${say('Na nga def ?')} Une voiture à essayer ? C’est gratuit.` },
  { bubble: 'Bonjour, bienvenue !', say: () => `Bonjour ! ${say('Na nga def ?')} Regardez à votre aise : dites-moi laquelle, je vous apporte les clés.` },
  { bubble: 'Bonjour, je vous aide ?', say: () => `${say('Salaam aleekum')} ! Je suis là si vous voulez en essayer une.` },
];

type Move = { path: Pt[]; goal: Pt; face?: Pt; done?: () => void; replanT: number };
type Task =
  | { kind: 'notice'; t: number }
  | { kind: 'greet'; t: number; arrived: boolean }
  | { kind: 'car'; owner: FloorOwner; slot: number; phase: 'walk' | 'unlock' | 'keys' }
  | { kind: 'meet'; owner: FloorOwner; t: number; arrived: boolean }
  | { kind: 'home' };

export class PrestigeSales implements GameModule, TargetSource {
  readonly name: string;
  readonly cfg: SalesConfig;
  private ctx!: GameCtx;
  private hub: HubWorld | null = null;
  private h: Humanoid | null = null;
  private lay: NonNullable<ReturnType<SalesConfig['layout']>> | null = null;
  private pos: { x: number; z: number } = { x: SALES_HOME.x, z: SALES_HOME.z }; private yaw = 0;
  private move: Move | null = null;
  private task: Task | null = null;
  private owners = new Set<FloorOwner>();
  private bubble: THREE.Sprite | null = null; private bubbleT = 0; private bubbleTex: THREE.CanvasTexture | null = null;
  private visit = false; private greeted = false; private pause = 0; private greetN = 0;
  private lastGreet = -1;
  /** The keys in the customer's hand: the car (owner, slot), and since when. */
  private keys: { owner: FloorOwner; slot: number; t: number } | null = null;
  /** The target the interaction system offers: « Parler au vendeur ». */
  private readonly target: Target;
  private aff: Affordance[] = [];
  /** Walk log for the checks: how far he walked, and the largest single-frame step (a teleport would show). */
  private log = { walked: 0, maxStep: 0, greetings: 0, said: [] as string[], walks: 0 };

  constructor(cfg: SalesConfig) {
    this.cfg = cfg; this.name = cfg.key;
    this.target = { id: `${cfg.key}:sales`, name: cfg.person === 'le vendeur' ? `Vendeur · ${cfg.title}` : `${cfg.person} · ${cfg.title}`, kind: 'person', space: 'street', x: 0, y: 1.9, z: 0, radius: 2.4, bias: 0.6, affordances: () => this.affordances() };
  }
  private grounds(x: number, z: number, pad = 0) { return this.lay ? this.lay.grounds(x, z, pad) : false; }
  /** Open now (his hours on the city clock). */
  open(ctx: GameCtx = this.ctx) { const h = this.cfg.hours; if (!h || !ctx) return true; const hr = ctx.hour(); return hr >= h[0] && hr < h[1]; }

  init(ctx: GameCtx) { this.ctx = ctx; ctx.interactions.add(this); }

  register(o: FloorOwner) { this.owners.add(o); }
  unregister(o: FloorOwner) { this.owners.delete(o); if (this.keys?.owner === o) this.keys = null; if (this.task && 'owner' in this.task && this.task.owner === o) this.task = null; }

  hubLoaded(ctx: GameCtx, hub: HubWorld) {
    this.ctx = ctx; this.clear(); this.hub = hub;
    if (hub.id !== this.cfg.hub || !humanoidReady()) return;
    this.lay = this.cfg.layout(hub); if (!this.lay) return;
    this.h = new Humanoid(this.cfg.look); this.h.hold = 'Idle';
    this.pos = { x: this.lay.home.x, z: this.lay.home.z }; this.yaw = this.lay.home.yaw;
    this.place();
    ctx.extra.add(this.h.group);
    this.visit = false; this.greeted = false; this.pause = 0; this.lastGreet = -1;
  }
  private clear() {
    if (this.h) { this.h.group.removeFromParent(); this.h.dispose(); this.h = null; }
    if (this.bubble) { this.bubble.removeFromParent(); (this.bubble.material as THREE.SpriteMaterial).dispose(); this.bubble = null; }
    this.bubbleTex?.dispose(); this.bubbleTex = null;
    this.move = null; this.task = null; this.keys = null; this.hub = null; this.lay = null;
  }

  collect(space: string, x: number, z: number, out: Target[]) {
    if (!this.h || !this.h.group.visible || space !== 'street' || this.ctx.player.seated()) return;
    if (Math.hypot(this.pos.x - x, this.pos.z - z) > 6) return;
    this.target.x = this.pos.x; this.target.z = this.pos.z;
    // a lower score wins the prompt: a car wins near a car, but he wins when he has come over to talk to the customer who came back from the drive
    this.target.bias = this.task?.kind === 'meet' && this.task.arrived ? -3 : 0.6;
    out.push(this.target);
  }

  // ---------------------------------------------------------------- what the player can say to him
  private affordances(): Affordance[] {
    if (!this.aff.length) this.aff = [{ id: 'parler', verb: 'talk', label: this.cfg.person === 'le vendeur' ? 'Parler au vendeur' : `Parler à ${this.cfg.person}`, icon: '🤝', run: () => this.talk() }];
    return this.aff;
  }
  private trial() { for (const o of this.owners) { const t = o.trialCar(); if (t) return { o, t }; } return null; }

  /** The menu: try a car, the prices, the trial vehicle's purchase or return. */
  private talk() {
    const ctx = this.ctx, tr = this.trial(), cars = [...this.owners].flatMap(o => o.floorCars().map(c => ({ o, c })));
    this.face(ctx.player.pos); this.turnTo(ctx.player.pos);
    const items: Parameters<GameCtx['menu']>[2] = [];
    if (tr) {
      items.push({ icon: '💰', label: `Acheter · ${tr.t.name}`, detail: 'Cette voiture-là, celle que tu viens d’essayer', right: fcfa(tr.t.price), onPick: () => { ctx.hud.closeModal(); ctx.setMode('play'); tr.o.askBuy(); } });
      items.push({ icon: '🔑', label: 'Rendre la voiture d’essai', detail: 'Je la fais récupérer', onPick: () => { ctx.hud.closeModal(); ctx.setMode('play'); this.speak('Pas de souci, je m’en occupe.'); tr.o.returnTrial(); } });
    } else {
      items.push({ icon: '🔑', label: 'Essayer une voiture', detail: 'Gratuit · choisis-la sur le plancher, je viens avec les clés', right: 'Gratuit', onPick: () => { ctx.hud.closeModal(); ctx.setMode('play'); this.speak('Allez-y, choisissez : je viens avec les clés.'); } });
      const seen = new Set<string>();
      for (const { c } of cars) if (!seen.has(c.name)) { seen.add(c.name); items.push({ icon: '🏷️', label: c.name, detail: 'Prix fixe, affiché sur la fiche · se choisit sur le plancher', right: fcfa(c.price), disabled: true, reason: 'Approche la voiture qui te plaît : « Essayer » ou « Acheter ».', onPick: () => {} }); }
    }
    if (this.cfg.talkExtra) items.push(...this.cfg.talkExtra(ctx));
    items.push({ icon: '↩️', label: 'Rien, merci', onPick: () => { ctx.hud.closeModal(); ctx.setMode('play'); } });
    ctx.menu(`${this.cfg.title} · ${this.cfg.person}`, this.cfg.talkIntro?.(ctx, !!tr) ?? (tr ? `Alors, elle te plaît ? ${say('Jërëjëf')} d’avoir essayé.` : `${say('Dalal ak jàmm')} chez ${this.cfg.title}.`), items);
  }

  /** The desk's catalogue: the cars on the floor with their prices; each one offers a free trial or the purchase. */
  openCatalogue(ctx: GameCtx) {
    const cars = [...this.owners].flatMap(o => o.floorCars().filter(c => c.state !== 'out').map(c => ({ o, c })));
    const close = () => { ctx.hud.closeModal(); ctx.setMode('play'); };
    ctx.menu(this.cfg.title, 'Prix fixes, affichés. Essaie d’abord : c’est gratuit.', [
      ...cars.map(({ o, c }) => ({ icon: o.tall ? '🚙' : '🚘', label: `${c.name} · ${c.colour}`, detail: c.locked ?? 'Essayer gratuitement ou acheter', right: fcfa(c.price), disabled: !!c.locked, onPick: () => this.carMenu(o, c) })),
      { icon: '↩️', label: 'Fermer', onPick: close },
    ]);
  }
  private carMenu(o: FloorOwner, c: FloorCarInfo) {
    const ctx = this.ctx, close = () => { ctx.hud.closeModal(); ctx.setMode('play'); };
    ctx.menu(`${c.name} · ${c.colour}`, `Prix : ${fcfa(c.price)} · Ton argent : ${fcfa(ctx.state.wallet)}`, [
      { icon: '🔑', label: 'Essayer gratuitement', detail: 'Le vendeur t’apporte les clés', right: 'Gratuit', onPick: () => { close(); this.requestTrial(o, c.slot); } },
      { icon: '💰', label: 'Acheter', detail: 'Tu confirmes le prix avant de payer', right: fcfa(c.price), onPick: () => o.askBuy(c.slot) },
      { icon: '↩️', label: 'Pas maintenant', onPick: close },
    ]);
  }

  // ---------------------------------------------------------------- called by the vehicle modules
  /** The customer chose a car on the floor: he walks to it, unlocks it, and offers the keys. */
  requestTrial(owner: FloorOwner, slot: number) {
    const car = owner.floorCars().find(c => c.slot === slot); if (!car || car.state !== 'display') return;
    if (car.locked) { this.ctx.toast(car.locked); return; }
    if (this.h && !this.open()) { this.ctx.toast(`${this.cfg.title} est fermé : ${this.cfg.person} revient à ${this.cfg.hours![0]} h.`); return; }
    if (!this.h) { owner.unlockFloor(slot); this.keys = { owner, slot, t: 0 }; this.ctx.toast('Clés en main : va côté conducteur et ouvre la portière.'); return; }
    if (this.task && this.task.kind === 'car' && this.task.owner === owner && this.task.slot === slot) return;
    this.dropKeys();
    this.task = { kind: 'car', owner, slot, phase: 'walk' };
    this.speak('Très bon choix, j’arrive.');
    this.walk(car.stand, { face: { x: car.x, z: car.z }, done: () => this.atCar() });
  }
  /** The trial car has the player in it: he goes back to his desk. */
  trialStarted(_o: FloorOwner) { this.keys = null; this.task = null; this.goHome(); }
  /** The player got out of the trial car at (x, z): if they are near, he walks over to them. */
  trialEnded(o: FloorOwner, x: number, z: number) {
    if (!this.h) return;
    if (!this.grounds(x, z, 60) || Math.hypot(x - this.pos.x, z - this.pos.z) > 90) return;
    this.task = { kind: 'meet', owner: o, t: 0, arrived: false };
    this.walk({ x, z }, { stop: 2.0, face: { x, z }, done: () => { const t = this.task; if (t?.kind === 'meet') { t.arrived = true; t.t = 0; this.speak('Alors, ça roule ? Elle vous plaît ?'); this.ctx.toast(`Le vendeur : « Alors, elle te plaît ? Je te fais le prix affiché, ${say('Jërëjëf')} pour l’essai. »`); } } });
  }

  // ---------------------------------------------------------------- the man
  private atCar() {
    const t = this.task; if (!t || t.kind !== 'car') return;
    const car = t.owner.floorCars().find(c => c.slot === t.slot); if (!car) { this.goHome(); return; }
    t.phase = 'unlock'; this.face({ x: car.x, z: car.z });
    vehicleAudio.unlock();                                                         // two chirps of the remote
    t.owner.unlockFloor(t.slot);
    this.ctx.toast('Bip-bip : la voiture est déverrouillée.');
    window.setTimeout(() => {
      if (this.task !== t) return;
      t.phase = 'keys';
      this.speak('Voilà les clés.');
      this.ctx.menu(`${this.cfg.title} · les clés`, `« La voici. ${say('Jërëjëf')} d’essayer chez nous. Côté conducteur, la portière est ouverte pour vous. »`, [
        { icon: '🔑', label: 'Prendre les clés', detail: 'Va côté conducteur et touche « Ouvrir »', onPick: () => { this.ctx.hud.closeModal(); this.ctx.setMode('play'); this.keys = { owner: t.owner, slot: t.slot, t: 0 }; this.task = null; this.ctx.toast('Clés en main : va côté conducteur et ouvre la portière.'); this.goHome(); } },
        { icon: '↩️', label: 'Pas maintenant', onPick: () => { this.ctx.hud.closeModal(); this.ctx.setMode('play'); t.owner.lockFloor(t.slot); vehicleAudio.unlock(); this.task = null; this.goHome(); } },
      ]);
    }, 900);
  }
  /** He hands over the keys of a floor car from where he stands (an errand he asks for: no sales walk). */
  giveKeys(o: FloorOwner, slot: number) { this.dropKeys(); this.task = null; this.keys = { owner: o, slot, t: 0 }; vehicleAudio.unlock(); }
  /** Is this car's key in the customer's hand? */
  hasKeys(o: FloorOwner, slot: number) { return this.keys?.owner === o && this.keys.slot === slot; }
  private dropKeys() { if (this.keys) { const k = this.keys; this.keys = null; k.owner.lockFloor(k.slot); } }

  private goHome() {
    this.task = { kind: 'home' };
    const home = this.lay?.home ?? { x: SALES_HOME.x, z: SALES_HOME.z, yaw: Math.PI };
    this.walk({ x: home.x, z: home.z }, { done: () => { if (this.task?.kind === 'home') this.task = null; this.faceYaw(home.yaw); } });
  }

  update(ctx: GameCtx, dt: number) {
    const h = this.h; if (!h || !this.hub) return;
    // his hours: outside them he is not there (an open-air lot is closed for the night); he comes back at his post
    const open = this.open(ctx);
    if (open !== h.group.visible) {
      h.group.visible = open; if (this.bubble) this.bubble.visible = false;
      if (!open) { this.dropKeys(); this.move = null; this.task = null; if (this.lay) { this.pos = { x: this.lay.home.x, z: this.lay.home.z }; this.yaw = this.lay.home.yaw; this.place(); } }
    }
    if (!open) return;
    const p = ctx.player.pos, d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z), seated = !!ctx.player.seated();
    this.pause = Math.max(0, this.pause - dt);
    // a visit: the customer in the grounds on foot; it ends when they are well away
    const inside = this.grounds(p.x, p.z, 4) && !seated;
    if (inside) this.visit = true; else if (!this.grounds(p.x, p.z, 30)) { if (this.visit) { this.visit = false; this.greeted = false; } }
    // the keys are given back by the customer's absence: far from the car for a while, or sitting somewhere else
    if (this.keys) {
      const car = this.keys.owner.floorCars().find(c => c.slot === this.keys!.slot);
      this.keys.t += dt;
      if (!car || car.state !== 'unlocked' || (Math.hypot(p.x - car.x, p.z - car.z) > 30 && this.keys.t > 20) || (!this.grounds(p.x, p.z, 25))) this.dropKeys();
    }
    const t = this.task;
    // notice → walk to the customer → greet (once per visit)
    if (!t && !this.move && this.visit && !this.greeted && this.pause <= 0 && !seated && ctx.mode() === 'play' && d < GREET_RANGE && d > 2.6 && this.sees(p)) {
      this.greeted = true; this.task = { kind: 'notice', t: 0 }; this.faceYaw(Math.atan2(p.x - this.pos.x, p.z - this.pos.z));
    }
    if (t?.kind === 'notice') {
      t.t += dt; this.turnTo(p, dt);
      if (t.t > 0.9) { this.task = { kind: 'greet', t: 0, arrived: false }; this.walk({ x: p.x, z: p.z }, { stop: 1.9, face: p, done: () => this.greet() }); }
    } else if (t?.kind === 'greet') {
      t.t += dt;
      if (t.arrived) { this.turnTo(p, dt); if (t.t > WAIT || Math.hypot(p.x - this.pos.x, p.z - this.pos.z) > 7) { this.pause = GREET_PAUSE; this.goHome(); } }
      else if (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) > 28 || ctx.mode() !== 'play' && t.t > 20) { this.pause = GREET_PAUSE; this.goHome(); }   // they have left: no chase
    } else if (t?.kind === 'meet') {
      t.t += dt;
      if (t.arrived) { this.turnTo(p, dt); if (t.t > 20 || Math.hypot(p.x - this.pos.x, p.z - this.pos.z) > 9) this.goHome(); }
    }
    this.step(dt);
    this.bubbleT = Math.max(0, this.bubbleT - dt); if (this.bubble) this.bubble.visible = this.bubbleT > 0;
    // hold: walking, talking to someone near, or at ease
    const talking = !this.move && (t?.kind === 'greet' && t.arrived || t?.kind === 'meet' && t.arrived || t?.kind === 'car' && t.phase !== 'walk');
    h.hold = this.move ? null : talking ? 'Talk' : 'Idle';
    h.animate(dt, this.move ? WALK : 0);
    this.place();
  }

  /** Can he see the customer from where he stands? (Anyone in the hall or on its forecourt: the glass is clear, a wall is not.) */
  private sees(p: { x: number; z: number }) {
    if (this.grounds(p.x, p.z, 0)) return true;
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 11;
  }

  private greet() {
    const t = this.task; if (t?.kind !== 'greet') return;
    t.arrived = true; t.t = 0;
    const n = this.cfg.greetings.length; let i = this.greetN++ % n; if (i === this.lastGreet) i = (i + 1) % n; this.lastGreet = i;
    const G = this.cfg.greetings, g = G[i % G.length]; this.speak(g.bubble); this.ctx.toast(`${this.cfg.person === 'le vendeur' ? 'Le vendeur' : this.cfg.person} : « ${g.say()} »`);
    this.log.greetings++; this.cfg.onGreet?.(this.ctx);
  }

  // ---------------------------------------------------------------- movement
  private walk(goal: Pt, o: { stop?: number; face?: Pt; done?: () => void }) {
    if (!this.hub) return;
    const g = new NavGrid(this.lay?.grid ?? GRID, this.hub.colliders), from = { x: this.pos.x, z: this.pos.z };
    // `stop`: end that far short of the goal (beside the customer, not on them)
    let to = goal;
    if (o.stop) {
      const dx = from.x - goal.x, dz = from.z - goal.z, l = Math.hypot(dx, dz) || 1;
      if (l > o.stop) {
        to = { x: goal.x + (dx / l) * o.stop, z: goal.z + (dz / l) * o.stop };
        // the straight line may end inside a parked car beside the customer: stand where he is free, within reach and in sight of them (nearest such spot to him)
        const seen = (c: Pt) => g.free(c) && g.clear(c, { x: c.x + (goal.x - c.x) * 0.6, z: c.z + (goal.z - c.z) * 0.6 });   // free, and nothing solid between him and the customer
        if (!seen(to)) {
          let best: Pt | null = null, bd = Infinity;
          for (const r of [o.stop, o.stop * 0.8, o.stop * 1.2]) for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2, c = { x: goal.x + Math.sin(a) * r, z: goal.z + Math.cos(a) * r };
            if (!seen(c)) continue;
            const d = Math.hypot(c.x - from.x, c.z - from.z); if (d < bd) { bd = d; best = c; }
          }
          if (best) to = best;
        }
      } else to = from;
    }
    const path = g.path(from, to);
    this.log.walks++;
    if (!path) { this.move = null; o.done?.(); return; }
    this.move = { path, goal: to, face: o.face, done: o.done, replanT: 1.2 };
  }
  private step(dt: number) {
    const m = this.move; if (!m) return;
    m.replanT -= dt;
    const next = m.path[0];
    if (!next) { this.finish(); return; }
    const dx = next.x - this.pos.x, dz = next.z - this.pos.z, d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    this.yaw += Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw)) * Math.min(1, dt * 9);
    const stepLen = Math.min(d, WALK * dt);
    if (d > 1e-4) { this.pos.x += (dx / d) * stepLen; this.pos.z += (dz / d) * stepLen; }
    this.log.walked += stepLen; this.log.maxStep = Math.max(this.log.maxStep, stepLen);
    if (d - stepLen < 0.08) { m.path.shift(); if (!m.path.length) this.finish(); }
  }
  private finish() {
    const m = this.move; this.move = null; if (!m) return;
    if (m.face) this.faceYaw(Math.atan2(m.face.x - this.pos.x, m.face.z - this.pos.z));
    m.done?.();
  }
  private face(p: { x: number; z: number }) { this.faceYaw(Math.atan2(p.x - this.pos.x, p.z - this.pos.z)); }
  private faceYaw(y: number) { this.wantYaw = y; }
  private wantYaw: number | null = null;
  private turnTo(p: { x: number; z: number }, dt = 0.2) { const y = Math.atan2(p.x - this.pos.x, p.z - this.pos.z); this.yaw += Math.atan2(Math.sin(y - this.yaw), Math.cos(y - this.yaw)) * Math.min(1, dt * 8); }
  private place() {
    const h = this.h; if (!h) return;
    if (this.wantYaw !== null && !this.move) { this.yaw += Math.atan2(Math.sin(this.wantYaw - this.yaw), Math.cos(this.wantYaw - this.yaw)) * 0.2; if (Math.abs(Math.atan2(Math.sin(this.wantYaw - this.yaw), Math.cos(this.wantYaw - this.yaw))) < 0.02) this.wantYaw = null; }
    h.group.position.set(this.pos.x, 0.12, this.pos.z); h.group.rotation.y = this.yaw;
    if (this.bubble) this.bubble.position.set(this.pos.x, 2.25, this.pos.z);
  }

  /** A line over his head for a few seconds. */
  private speak(text: string) {
    this.log.said.push(text); if (this.log.said.length > 12) this.log.said.shift();
    this.bubbleTex?.dispose(); this.bubbleTex = callTexture(text);
    if (!this.bubble) { this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.bubbleTex, depthWrite: false, transparent: true })); this.bubble.scale.set(1.9, 0.6, 1); this.ctx.extra.add(this.bubble); }
    else { (this.bubble.material as THREE.SpriteMaterial).map = this.bubbleTex; (this.bubble.material as THREE.SpriteMaterial).needsUpdate = true; }
    this.bubbleT = 4.5; this.bubble.visible = true;
  }

  debug(_ctx: GameCtx): Record<string, unknown> {
    return {
      [this.cfg.key === 'prestige' ? 'sales' : `sales_${this.cfg.key}`]: {
        info: () => ({ here: !!this.h && this.h.group.visible, open: this.open(), home: this.lay?.home ?? null, x: +this.pos.x.toFixed(2), z: +this.pos.z.toFixed(2), yaw: +this.yaw.toFixed(2), task: this.task?.kind ?? null, phase: (this.task as { phase?: string } | null)?.phase ?? null, moving: !!this.move, visit: this.visit, greeted: this.greeted, pause: Math.round(this.pause), keys: this.keys ? { model: this.keys.owner.model, slot: this.keys.slot } : null, bubble: this.bubbleT > 0, log: { ...this.log, said: [...this.log.said] }, hall: HALL }),
        /** Checks: let the customer's greeting through at once (no pause). */
        eager: () => { this.pause = 0; this.greeted = false; },
      },
    };
  }
}

export const prestige = new PrestigeSales({
  key: 'prestige', hub: PRESTIGE_HUB, title: 'Prestige Auto', person: 'le vendeur', look: SALESMAN, layout: PRESTIGE_LAYOUT, greetings: GREETINGS,
});
