import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { HubWorld } from '../world/types';
import type { Affordance, Target, TargetSource } from '../interact/types';
import type { ActivitySpec } from '../activity/types';
import { Humanoid, humanoidReady, type PersonLook } from '../actors/humanoid';
import { NavGrid, type Pt } from '../world/navgrid';
import { callTexture } from './vehicle';
import { vehicleAudio, profileFor } from './vehicleAudio';
import { fcfa } from '../ui/hud';
import { say } from '../i18n/wolof';
import { holding, repairAsset } from '../economy/assets';
import { C, garageDeals, nextLoanSeq, openLoan, openLoans } from '../economy/credit';
import { creditClock } from '../economy/creditModule';
import { relLevel } from '../venues/venue';
import { specOf } from '../economy/catalog';
import { healthTag } from './condition';
import { INSPECT_SECONDS, REPAIR_SECONDS, REPAIR_STEPS, garageOpen, garageQuote, inBay, reopens, type Bay, type Quote } from './garage';
import { OWNED_VEHICLES } from './fleet';
import type { OwnedVehicleModule } from './ownedModule';

/**
 * Garage Modou's repair service (Pass 3 · S3), in Pikine, owned by the vehicle layer. Nothing is instant and nothing is carried across the city:
 *
 *   – the player drives (or limps, after a roadside fix) the vehicle into the **repair bay**, the painted pad on the kerb in front of the workshop, and gets out;
 *   – « Faire réparer » at the bay: Lamine, Modou's apprentice, comes out of the workshop on his own legs (a walking map built from the hub's colliders, as the Prestige salesperson's), kneels
 *     by the vehicle for a few seconds and the **quote** opens: the state, the price, the time. « Pas maintenant » (or any way out of the card) ends it: nothing is paid;
 *   – « Réparer » runs about 30 s of visible work (three steps, tool taps, the player held at the bay, « Arrêter » at any time: nothing is paid then either), and the price is taken **once, at the end**, exactly as quoted;
 *   – the engine is tried, the horn tapped, Lamine walks back to his bench.
 *
 * Lamine is a separate, visibly different person (orange overalls, a cap): the real Modou is not touched (his routines and situations are not read or changed here). The bill
 * is Modou's business: « Discuter » asks him for an arrangement (src/economy/credit.ts `garageDeals`): he reads his relationship with the player (the relations store, `modou`,
 * and the `modou_trust` flag the social beats set) and his memory of their slate; a part now and the rest later becomes a garage debt (src/economy/creditModule.ts), repaid at the
 * bay or from the phone, and paying it back raises his trust. The vehicle's health lives in its asset (save v6); a repair sets it back to 100 % (or, partial, to 70 %).
 * Only the garage of Pikine exists for now: a vehicle in another district keeps the roadside fix, and nothing is towed or teleported.
 */
const HUB = 'pikine', GARAGE = 'pikine:garage:31';
const WALK = 1.45, REACH = 7;
const LAMINE: PersonLook = { skin: 0x6b4128, style: 'tee', top: 0xe0701a, bottom: 0x2a3550, hat: 'kufi', hatColor: 0x1d1d1f, shoes: 0x16161a, muscular: 0.35 };
const LINES = {
  coming: ['J’arrive, ne bouge pas.', 'Oui patron, je m’en occupe.'],
  look: ['Voyons ça…', 'Hmm, il y a du travail.'],
  work: ['Une minute, ça va aller.', 'Passe-moi la clé de 13…'],
  done: ['Voilà, comme neuve !', 'Écoute-la ronronner.'],
};

type Vehicle = { mod: OwnedVehicleModule; asset: string; uid: string; name: string; price: number; hp: number; x: number; z: number; yaw: number };
type Phase = 'coming' | 'inspect' | 'quote' | 'work';
/** What was agreed: the condition the vehicle is brought back to, what is paid at the end, what goes on Modou's slate. */
interface Plan { to: number; pay: number; debt: number; label: string }
interface Job { v: Vehicle; phase: Phase; t: number; quote: Quote | null; stand: Pt; paid: boolean; plan: Plan | null }

export class GarageModule implements GameModule, TargetSource {
  /** The repair bay at the workshop's kerb, when Garage Modou is in this hub (another module's errand ends there). */
  bayNow(): Bay | null { return this.bay; }
  readonly name = 'garage';
  private ctx!: GameCtx;
  private hub: HubWorld | null = null;
  private bay: Bay | null = null;
  private post: Pt = { x: 0, z: 0 };
  private area = { x0: 0, x1: 0, z0: 0, z1: 0 };
  private h: Humanoid | null = null;
  private pos: Pt = { x: 0, z: 0 }; private yaw = 0;
  private move: { path: Pt[]; face?: Pt; done?: () => void } | null = null;
  private job: Job | null = null;
  private bubble: THREE.Sprite | null = null; private bubbleT = 0; private bubbleTex: THREE.CanvasTexture | null = null;
  private tapT = 0; private pickN = 0;
  private readonly target: Target = { id: 'garage:bay', name: 'Atelier · Garage Modou', kind: 'place', space: 'street', x: 0, z: 0, y: 1.2, radius: 5.5, bias: 0, affordances: () => this.affordances() };
  /** What happened (the checks): jobs started, quotes shown, refused, stopped, paid, and the money taken. */
  private log = { started: 0, quotes: 0, refused: 0, stopped: 0, paid: 0, charged: 0, walked: 0, maxStep: 0, said: [] as string[] };

  init(ctx: GameCtx) { this.ctx = ctx; ctx.interactions.add(this); }

  hubLoaded(ctx: GameCtx, hub: HubWorld) {
    this.ctx = ctx; this.clear(); this.hub = hub;
    if (hub.id !== HUB) return;
    const g = hub.interactables.find(i => i.id === GARAGE); if (!g) return;
    const road = Math.round(g.z / 60) * 60, side = Math.sign(g.z - road) || -1, kz = road + side * 4.3;
    this.bay = { x: g.x - 1.5, z: kz, yaw: Math.PI / 2, hl: 2.7, hw: 1.5 };              // the kerb in front of the workshop; the Jakarta's delivery spot (g.x + 1.5) is just east of it
    this.post = { x: g.x - 1.4, z: g.z - 3.1 };                                        // Lamine's place, on the floor of the open workshop just inside its front (Modou's bench is further in, on the west side)
    this.area = { x0: g.x - 14, x1: g.x + 16, z0: Math.min(g.z, kz) - 8, z1: Math.max(g.z, kz) + 8 };
    this.post = new NavGrid(this.area, hub.colliders).nearestFree(this.post) ?? this.post;                    // a free spot, whatever the workshop's furniture
    this.buildBay(ctx, side);
    this.refreshApprentice();
  }
  private clear() {
    if (this.h) { this.h.group.removeFromParent(); this.h.dispose(); this.h = null; }
    if (this.bubble) { this.bubble.removeFromParent(); (this.bubble.material as THREE.SpriteMaterial).dispose(); this.bubble = null; }
    this.bubbleTex?.dispose(); this.bubbleTex = null;
    if (this.job?.phase === 'work') this.ctx?.activities.cancel();
    this.job = null; this.move = null; this.bay = null; this.hub = null;
  }

  // ---------------------------------------------------------------- the bay in the world
  private buildBay(ctx: GameCtx, side: number) {
    const b = this.bay!, root = new THREE.Group(); root.name = 'garage_bay';
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(2 * b.hl, 2 * b.hw), new THREE.MeshLambertMaterial({ color: 0x3a3c40, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(b.x, 0.04, b.z);
    const line = new THREE.MeshBasicMaterial({ color: 0xf2c230, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const bar = (w: number, d: number, x: number, z: number) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), line); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, z); root.add(m); };
    bar(2 * b.hl, 0.1, b.x, b.z - b.hw); bar(2 * b.hl, 0.1, b.x, b.z + b.hw); bar(0.1, 2 * b.hw, b.x - b.hl, b.z); bar(0.1, 2 * b.hw, b.x + b.hl, b.z);
    for (let k = -1; k <= 1; k++) bar(0.5, 0.12, b.x + k * 1.4, b.z);                      // three marks down the middle: where the vehicle's centre goes
    // the sign: a post at the workshop end of the pad, facing the road
    const postM = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.3, 0.1), new THREE.MeshLambertMaterial({ color: 0x2b2d31 }));
    const px = b.x - b.hl - 0.4, pz = b.z + side * (b.hw + 0.3); postM.position.set(px, 1.15, pz);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
    const c = cv.getContext('2d');
    if (c) {
      c.fillStyle = '#e0701a'; c.fillRect(0, 0, 256, 96); c.fillStyle = '#1d1f24'; c.fillRect(6, 6, 244, 84);
      c.fillStyle = '#f2c230'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '900 30px system-ui, sans-serif'; c.fillText('ATELIER', 128, 32);
      c.fillStyle = '#ffffff'; c.font = '700 22px system-ui, sans-serif'; c.fillText('Garage Modou · réparations', 128, 66, 236);
    }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const signM = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.56), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })); signM.position.set(px, 2.0, pz);
    signM.rotation.y = side < 0 ? 0 : Math.PI;                                                // reads from the road
    root.add(pad, postM, signM);
    ctx.extra.add(root);
  }

  // ---------------------------------------------------------------- the apprentice
  /** Present at his bench in the opening hours (and for a job); out of sight when the workshop is shut and the player is away. */
  private refreshApprentice() {
    if (!this.hub || !this.bay || !humanoidReady()) return;
    const want = garageOpen(this.ctx.hour()) || !!this.job;
    if (want && !this.h) {
      this.h = new Humanoid(LAMINE); this.h.hold = 'Idle';
      this.pos = { ...this.post }; this.yaw = 0; this.ctx.extra.add(this.h.group); this.place();
    } else if (!want && this.h) {
      const p = this.ctx.player.pos;
      if (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) > 30) { this.h.group.removeFromParent(); this.h.dispose(); this.h = null; this.move = null; }
    }
  }

  // ---------------------------------------------------------------- what the player sees and can do
  private vehicles(): Vehicle[] {
    if (!this.bay) return [];
    const out: Vehicle[] = [];
    for (const mod of OWNED_VEHICLES) {
      const p = mod.parkedHere(), a = holding(this.ctx.state, mod.def.asset), sp = specOf(mod.def.asset);
      if (!p || !a || !sp || a.how !== 'owned' || !inBay(this.bay, p)) continue;
      out.push({ mod, asset: mod.def.asset, uid: a.uid, name: sp.name, price: sp.price ?? 0, hp: a.condition, x: p.x, z: p.z, yaw: p.yaw });
    }
    return out;
  }
  collect(space: string, x: number, z: number, out: Target[]) {
    if (!this.bay || space !== 'street' || this.ctx.player.seated()) return;
    if (Math.hypot(x - this.bay.x, z - this.bay.z) > REACH) return;
    this.target.x = this.bay.x; this.target.z = this.bay.z;
    const need = this.vehicles().some(v => v.hp < 100);
    this.target.bias = need || this.job ? -1.5 : 3;                                          // it wins the prompt when a vehicle in the bay needs the garage; otherwise it stays in the sheet
    out.push(this.target);
  }
  private affordances(): Affordance[] {
    const vs = this.vehicles(), hour = this.ctx.hour(), busy = !!this.job || this.ctx.activities.running;
    const slate = openLoans(this.ctx.state.data.loans.list, 'modou')[0];
    const pay: Affordance[] = slate ? [{ id: 'ardoise', verb: 'talk', label: 'Rembourser Modou', icon: '💵', detail: `${slate.label} · reste ${fcfa(slate.principal - slate.paid)}`, run: () => creditClock.repayMenu(this.ctx, slate) }] : [];
    return [...pay, ...this.repairAffordances(vs, hour, busy)];
  }
  private repairAffordances(vs: Vehicle[], hour: number, busy: boolean): Affordance[] {
    if (!vs.length) return [{ id: 'garer', verb: 'inspect', label: 'Faire réparer', icon: '🔧', detail: 'Gare ta moto ou ta voiture dans l’emplacement jaune, puis reviens ici', disabled: 'Gare ton véhicule dans l’emplacement jaune', run: () => {} }];
    return vs.map((v): Affordance => {
      const q = garageQuote(v.price, v.hp);
      const why = busy ? 'Un travail est en cours' : !garageOpen(hour) ? `L’atelier est fermé : il rouvre ${reopens(hour)}` : v.hp >= 99.5 ? `${v.name} est en parfait état` : null;
      return { id: `reparer:${v.asset}`, verb: 'inspect', label: `Faire réparer · ${v.name}`, icon: '🔧', detail: why ?? `${healthTag(v.hp)} · Lamine regarde d’abord, devis avant de payer${q.free ? ' · petite retouche offerte' : ''}`, disabled: why, run: () => this.begin(v) };
    });
  }

  // ---------------------------------------------------------------- the job
  private begin(v: Vehicle) {
    const ctx = this.ctx;
    if (this.job || ctx.activities.running || !this.bay || !garageOpen(ctx.hour()) || v.hp >= 99.5) return;
    if (!humanoidReady()) { ctx.toast('L’atelier est occupé pour le moment.'); return; }
    this.refreshApprentice();
    if (!this.h) return;
    // he stands on the workshop side of the vehicle (the side away from the road), level with it
    const b = this.bay, nx = Math.sin(b.yaw + Math.PI / 2), nz = Math.cos(b.yaw + Math.PI / 2);
    const sideSign = (this.post.z - v.z) * nz + (this.post.x - v.x) * nx >= 0 ? 1 : -1;
    const stand = { x: v.x + nx * sideSign * 1.35, z: v.z + nz * sideSign * 1.35 };
    this.job = { v, phase: 'coming', t: 0, quote: null, stand, paid: false, plan: null };
    this.log.started++;
    ctx.toast('Modou, depuis son établi : « Lamine ! Va voir cette ' + (v.mod.def.kit === 'moto' ? 'moto' : 'voiture') + ' ! »');
    this.speak(this.pick(LINES.coming));
    this.walk(stand, { face: { x: v.x, z: v.z }, done: () => { const j = this.job; if (j && j.phase === 'coming') { j.phase = 'inspect'; j.t = 0; this.speak(this.pick(LINES.look)); } } });
  }
  private abort(msg?: string) {
    const j = this.job; if (!j) return;
    if (j.phase === 'work') this.ctx.activities.cancel();
    this.job = null;
    if (msg) this.ctx.toast(msg);
    this.goHome();
  }
  private refuse(why = 'Pas de souci. Rien à payer.') {
    if (!this.job) return;
    this.log.refused++;
    this.ctx.hud.closeModal(); this.ctx.setMode('play');
    this.abort(why);
  }
  private openQuote() {
    const j = this.job; if (!j) return;
    const ctx = this.ctx, v = j.v, q = garageQuote(v.price, v.hp); j.quote = q; j.phase = 'quote'; this.log.quotes++;
    const can = (c: number) => c === 0 || ctx.state.canAfford(c);
    const html = `<div class="kv">État de ${v.name} : <b>${Math.round(v.hp)} %</b> → remise à <b>100 %</b>${q.partial ? ` (ou à ${q.partial.to} % : ${fcfa(q.partial.cost)})` : ''}<br>Durée : environ ${REPAIR_SECONDS} secondes · Lamine travaille devant toi<br>Tu paies <b>une seule fois, à la fin</b>${q.cost ? ` : ${fcfa(q.cost)}` : ' : rien (petite retouche offerte)'}<br>Ton argent : ${fcfa(ctx.state.wallet)}</div>`;
    const name = v.name;
    ctx.menu('Garage Modou · devis', `Lamine : « ${say('Jërëjëf')} d’être venu. Voilà ce qu’il faut faire. »`, [
      { icon: '🔧', label: 'Réparer entièrement', detail: can(q.cost) ? `Remise à 100 % · environ ${REPAIR_SECONDS} s · tu paies à la fin` : 'Pas assez d’argent', right: q.cost ? fcfa(q.cost) : 'Offert', disabled: !can(q.cost), reason: 'Pas assez d’argent pour ce devis', onPick: () => this.agree({ to: 100, pay: q.cost, debt: 0, label: `Réparation · ${name} · Garage Modou` }) },
      ...(q.partial ? [{ icon: '🪛', label: `Réparation partielle · jusqu’à ${q.partial.to} %`, detail: can(q.partial.cost) ? 'Elle repart bien, pas comme neuve · tu paies à la fin' : 'Pas assez d’argent', right: fcfa(q.partial.cost), disabled: !can(q.partial.cost), reason: 'Pas assez d’argent pour ce devis', onPick: () => this.agree({ to: q.partial!.to, pay: q.partial!.cost, debt: 0, label: `Réparation partielle · ${name} · Garage Modou` }) }] : []),
      ...(q.cost > 0 ? [{ icon: '🗣️', label: 'Discuter avec Modou', detail: 'Payer une partie plus tard, un prix d’ami… il décide', onPick: () => this.discuss() }] : []),
      { icon: '↩️', label: 'Pas maintenant', detail: 'Rien à payer', onPick: () => this.refuse() },
    ], html);
  }
  /** « Discuter »: Modou's answer for the full and the partial repair (src/economy/credit.ts garageDeals), by what he thinks of the player and their slate. */
  private discuss() {
    const j = this.job, ctx = this.ctx; if (!j?.quote) return;
    const q = j.quote, trust = relLevel(ctx, 'modou'), trusted = ctx.state.data.flags.includes('modou_trust'), loans = ctx.state.data.loans.list, name = j.v.name;
    const scopes = [{ to: 100, cost: q.cost, what: 'tout' }, ...(q.partial ? [{ to: q.partial.to, cost: q.partial.cost, what: `jusqu’à ${q.partial.to} %` }] : [])];
    const items: Parameters<GameCtx['menu']>[2] = []; let line = '';
    for (const sc of scopes) {
      const r = garageDeals({ cost: sc.cost, trust, trusted, loans }); line = r.line;
      for (const d of r.deals) if (d.id !== 'full') items.push({ icon: d.id === 'trust' ? '🤝' : '📝', label: `${sc.to === 100 ? 'Tout réparer' : `Réparer ${sc.what}`} · ${d.label}`, detail: d.debt ? `${fcfa(d.pay)} à la fin, ${fcfa(d.debt)} sur l’ardoise de Modou (${C.garage.installments} fois)` : 'Payé à la fin, une fois', right: fcfa(d.pay), disabled: !ctx.state.canAfford(d.pay), reason: 'Pas assez d’argent', onPick: () => this.agree({ to: sc.to, pay: d.pay, debt: d.debt, label: `${sc.to === 100 ? 'Réparation' : 'Réparation partielle'} · ${name} · Garage Modou` }) });
    }
    this.log.said.push(`discuss:${trust}:${items.length}`);
    ctx.menu('Garage Modou · Modou', `Modou : « ${line} » (confiance ${trust})`, [
      ...items,
      { icon: '↩️', label: items.length ? 'Revenir au devis' : 'D’accord', onPick: () => this.openQuote() },
    ]);
  }
  private agree(p: Plan) { const j = this.job; if (!j) return; j.plan = p; this.confirm(); }
  private confirm() {
    const j = this.job, ctx = this.ctx; if (!j || j.phase !== 'quote' || !j.quote) return;
    ctx.hud.closeModal(); ctx.setMode('play');
    j.phase = 'work'; j.t = 0; this.tapT = 0;
    const steps = REPAIR_STEPS.map((s, i) => ({
      label: s.label, primitive: 'work' as const, seconds: s.seconds,
      ...(i === REPAIR_STEPS.length - 1 ? { then: () => this.complete() } : {}),
    }));
    const spec: ActivitySpec = { id: 'garage:repair', primitive: 'work', label: `Réparation · ${j.v.name}`, icon: '🔧', quiet: true, steps };
    this.speak(this.pick(LINES.work));
    ctx.activities.start(spec, { place: 'Garage Modou', at: { x: j.v.x, z: j.v.z } });
  }
  /** The last step ended: the one payment, exactly what was agreed; the rest (an arrangement) goes on Modou's slate; the vehicle is back to the agreed condition. */
  private complete() {
    const j = this.job, ctx = this.ctx; if (!j || j.phase !== 'work' || !j.quote) return;
    const plan = j.plan ?? { to: 100, pay: j.quote.cost, debt: 0, label: `Réparation · ${j.v.name} · Garage Modou` };
    const a = holding(ctx.state, j.v.asset);
    const ok = !!a && a.uid === j.v.uid && repairAsset(ctx.state, j.v.uid, plan.pay, plan.label, plan.to);
    j.paid = true;
    if (!ok) { this.job = null; ctx.toast('Impossible de finir : rien n’a été pris.'); this.goHome(); return; }
    if (plan.debt > 0) {
      openLoan(ctx.state.data.loans.list, nextLoanSeq(ctx.state), { lender: 'modou', kind: 'repair', label: `${plan.label.split(' · ')[0]} ${j.v.name} · ardoise Modou`, principal: plan.debt, installment: Math.ceil(plan.debt / C.garage.installments / 500) * 500, every: C.garage.every, day: ctx.day(), asset: j.v.uid, spec: j.v.asset });
      ctx.toast(`Modou note ${fcfa(plan.debt)} sur ton ardoise : « Tu me le rends en ${C.garage.installments} fois. »`);
    }
    this.log.paid++; this.log.charged += plan.pay;
    vehicleAudio.start(profileFor(j.v.mod.def.kit)); window.setTimeout(() => { vehicleAudio.hornOn(j.v.mod.def.kit); window.setTimeout(() => vehicleAudio.hornOff(), 220); }, 1300);
    ctx.toast(plan.to >= 100 ? `${j.v.name} est comme neuve ✓ ${plan.pay ? `· ${fcfa(plan.pay)}` : '· retouche offerte'}` : `${j.v.name} repart à ${plan.to} % ✓ · ${fcfa(plan.pay)}`);
    this.speak(this.pick(LINES.done));
    ctx.save();
    this.job = null; this.goHome();
  }

  update(ctx: GameCtx, dt: number) {
    if (!this.hub || !this.bay) return;
    this.ctx = ctx;
    this.refreshApprentice();
    const j = this.job, p = ctx.player.pos;
    if (j) {
      j.t += dt;
      const here = j.v.mod.parkedHere();
      // the vehicle was driven away, or the player went off, or changed hub: the job ends, nothing was taken
      if (j.phase !== 'work' && (!here || !inBay(this.bay, here) || Math.hypot(p.x - this.bay.x, p.z - this.bay.z) > 14)) { if (j.phase === 'quote') { ctx.hud.closeModal(); ctx.setMode('play'); } this.abort('Tu t’es éloigné : rien à payer.'); }
      else if (j.phase === 'inspect' && j.t >= INSPECT_SECONDS) this.openQuote();
      else if (j.phase === 'quote' && ctx.mode() === 'play') { this.log.refused++; this.abort('Pas de souci. Rien à payer.'); }       // the card was closed without a choice
      else if (j.phase === 'work') {
        if (!ctx.activities.running && !j.paid) { this.log.stopped++; this.abort('Arrêté : rien n’est pris.'); }          // « Arrêter »: stopped before the end, nothing paid
        else if ((this.tapT -= dt) <= 0) { this.tapT = 1.1 + Math.random() * 0.5; vehicleAudio.impact(2.0 + Math.random()); }
      }
    }
    this.stepMove(dt);
    const h = this.h;
    if (h) {
      const ph = this.job?.phase;
      h.hold = this.move ? null : ph === 'inspect' || ph === 'quote' || ph === 'work' ? 'Kneel' : 'Idle';
      if (!this.move && this.job) this.turnTo(this.job.v);
      h.animate(dt, this.move ? WALK : 0);
      this.place();
    }
    this.bubbleT = Math.max(0, this.bubbleT - dt); if (this.bubble) this.bubble.visible = this.bubbleT > 0;
  }

  // ---------------------------------------------------------------- movement (the same walking map as the Prestige salesperson)
  private goHome() { this.walk(this.post, { done: () => { this.yaw = 0; } }); }
  private walk(goal: Pt, o: { face?: Pt; done?: () => void }) {
    if (!this.hub || !this.h) { o.done?.(); return; }
    const g = new NavGrid(this.area, this.hub.colliders), path = g.path({ x: this.pos.x, z: this.pos.z }, goal);
    if (!path) { this.move = null; o.done?.(); return; }
    this.move = { path, face: o.face, done: o.done };
  }
  private stepMove(dt: number) {
    const m = this.move; if (!m) return;
    const next = m.path[0]; if (!next) { this.finish(); return; }
    const dx = next.x - this.pos.x, dz = next.z - this.pos.z, d = Math.hypot(dx, dz), want = Math.atan2(dx, dz);
    this.yaw += Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw)) * Math.min(1, dt * 9);
    const len = Math.min(d, WALK * dt);
    if (d > 1e-4) { this.pos.x += (dx / d) * len; this.pos.z += (dz / d) * len; }
    this.log.walked += len; this.log.maxStep = Math.max(this.log.maxStep, len);
    if (d - len < 0.08) { m.path.shift(); if (!m.path.length) this.finish(); }
  }
  private finish() { const m = this.move; this.move = null; if (!m) return; if (m.face) this.yaw = Math.atan2(m.face.x - this.pos.x, m.face.z - this.pos.z); m.done?.(); }
  private turnTo(p: Pt) { const y = Math.atan2(p.x - this.pos.x, p.z - this.pos.z); this.yaw += Math.atan2(Math.sin(y - this.yaw), Math.cos(y - this.yaw)) * 0.15; }
  private place() { const h = this.h; if (!h) return; h.group.position.set(this.pos.x, 0.12, this.pos.z); h.group.rotation.y = this.yaw; if (this.bubble) this.bubble.position.set(this.pos.x, 2.25, this.pos.z); }
  private pick(a: string[]) { return a[this.pickN++ % a.length]; }
  private speak(text: string) {
    this.log.said.push(text); if (this.log.said.length > 12) this.log.said.shift();
    if (!this.h) return;
    this.bubbleTex?.dispose(); this.bubbleTex = callTexture(text);
    if (!this.bubble) { this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.bubbleTex, depthWrite: false, transparent: true })); this.bubble.scale.set(1.9, 0.6, 1); this.ctx.extra.add(this.bubble); }
    else { (this.bubble.material as THREE.SpriteMaterial).map = this.bubbleTex; (this.bubble.material as THREE.SpriteMaterial).needsUpdate = true; }
    this.bubbleT = 3.5; this.bubble.visible = true;
  }

  debug(_ctx: GameCtx): Record<string, unknown> {
    return {
      garage: {
        info: () => ({ garage: this.hub?.interactables.find(i => i.id === GARAGE) ? { x: this.hub.interactables.find(i => i.id === GARAGE)!.x, z: this.hub.interactables.find(i => i.id === GARAGE)!.z } : null, bay: this.bay, post: this.post, here: !!this.h, x: +this.pos.x.toFixed(2), z: +this.pos.z.toFixed(2), moving: !!this.move, phase: this.job?.phase ?? null, job: this.job ? { name: this.job.v.name, quote: this.job.quote, paid: this.job.paid } : null, vehicles: this.vehicles().map(v => ({ asset: v.asset, hp: v.hp, x: v.x, z: v.z })), log: this.log, open: garageOpen(this.ctx.hour()) }),
      },
    };
  }
}

export const garage = new GarageModule();
