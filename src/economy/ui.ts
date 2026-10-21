import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { HubId } from '../core/types';
import { fcfa, type Hud, type MenuItem } from '../ui/hud';
import { phoneHooks } from '../ui/phoneHooks';
import type { Action, HubWorld, Interactable } from '../world/types';
import type { ShopDetail } from '../world/shopKit';
import { buildQuincaillerie } from './stall';
import { HUB_NAMES } from '../world/content';
import { ECONOMY } from './config';
import { ROUTES, acceptJob, cancelJob, completeJob, deliveryHub, deliveryLimitMs, offers, payNow, pickUp, pickupFrags, remainingMs, routeById, routePay, whyNot, type Completion, type Place, type Route } from './jobs';
import { planTrip } from '../road/graph';
import { cards, routeCard, orderCard, actionCard, tip, disclosure, iconOf, type Spot } from './deliveryCards';
import { ORDERS, TOURS, abandonTour, acceptTour, completeStop, currentTour, depart, historyOf, limitsOf, patienceFactor, payFactor, paysOf, previewOrder, tourRemainingMs, tourTotal, toursAt, toursIn, trustOf, trustWord, whyNotTour, type Order, type Tour, type TourCompletion, type TourStop } from './tour';
import { FURNITURE, cannotBuy, deliverFurniture, furnitureCount, furnitureById, ownedFurnitureIds, owns, priceOf } from './furniture';
import { assetsValue, chargesPerHour, currentHome, incomePerHour as allIncome, specOfAsset, takeNotices } from './assets';
import { homeGoalLine } from './progress';
import { ACTIVITIES, ACTIVITY_INFO, WINDOW_MS, activityOf, fromCategory, isRecent, multiplier, noticeActivities, payPreview, polyLine, polyvalence, practise, signature, timeLeft, workPay, type Activity } from './polyvalence';
import type { ActivityCategory } from '../activity/types';
import { HOUR_MS, VENTURES, accrue, baseIncome, buyVenture, cannotBuy as cannotBuyVenture, firstVentureHint, incomePerHour, lockedWhy, nextPrice, ownedOf, ownedVentures, perHourOf, unitPrice, unitsOwned, venturesValue } from './business';
import { fcfaShort } from './format';
import './economy.css';

/**
 * Economy runtime: Tiak Tiak offers and the delivery marker, the furniture shop (Pikine), the wallet history screen,
 * the « Affaires » (ventures, hourly income, polyvalence) and the phone hooks (ledger, openJobs, openHome, openBusiness,
 * wealth). Menus use hud.openMenu. Everything is saved on this device only.
 */
export const JOBS_ACTION: Action = { id: 'tiak', label: 'Livraisons Tiak Tiak', detail: 'Porter des commandes dans le quartier', seconds: 0, special: 'jobs' };
export const SHOP_ACTION: Action = { id: 'meubles', label: 'Voir les meubles', detail: 'Livrés dans ta chambre', seconds: 0, special: 'shop' };
/** At the Banque Teranga agencies: the ventures (same menu as the phone app). */
export const BUSINESS_ACTION: Action = { id: 'affaires', label: 'Investir dans une affaire', detail: 'Bana-bana, kiosque, boutique… jusqu’à la grande entreprise', seconds: 0, special: 'business' };
const LOCAL_NOTE = 'Argent virtuel du jeu, sauvegardé sur cet appareil (pas encore de compte).';
const INCOME_NOTE = 'Les affaires rapportent à chaque heure en ville (1 min de jeu), seulement pendant que tu joues : rien hors ligne.';

export interface EconomyDeps {
  state: GameState;
  hud: Hud;
  scene: THREE.Scene;
  /** Called before a menu opens (main.ts switches to menu mode). */
  menu(): void;
  save(): boolean;
  /** Set (or clear) the city's walking marker — main.ts `destination`, the one "Les coins du quartier" uses. */
  walkTo(placeId: string | null): void;
}

const esc = (t: string) => t.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
/** A stop as a card shows it: an icon and the place's short name (« Banque Teranga · Pikine » → « Banque Teranga »). */
const SHORT: Record<string, string> = {
  'Gargote Mame Diarra': 'Chez Mame', 'Gargote Chez Fatou': 'Chez Fatou', 'Dibiterie Chez Pathé': 'Chez Pathé', 'Dibiterie de la Médina': 'Dibiterie',
  'Maïga du marché': 'Maïga', 'Garage Modou': 'Garage', 'Boutique Diallo': 'Boutique', 'Banque Teranga': 'Banque', 'Étal de Sandaga': 'Étal',
  'Atelier Ndeye': 'Atelier Ndeye', 'Dakar Réparation': 'Réparation', 'Place de la Médina': 'Place', 'Grand-place de Pikine': 'Grand-place',
};
const shortName = (n: string) => { const base = n.split(' · ')[0]; return SHORT[base] ?? base; };
const stopSpot = (st: TourStop): Spot => ({ icon: iconOf(st.place.frag), name: shortName(st.place.name) });
const TOURS_BY = (id: string) => TOURS.find(t => t.id === id);
const clock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class Economy {
  private world: HubWorld | null = null;
  /** The shop the furniture catalogue was last opened from (its title). */
  private shopAt: string | undefined;
  private marker = new THREE.Group();
  private ringMat = new THREE.MeshBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: false });
  private beamMat = new THREE.MeshBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  private arrow: THREE.Mesh;
  private line: HTMLElement;
  private t = 0;
  private lineT = 0;
  /** What the delivery line shows now (rebuilt only when it changes). */
  private lineSig = '';
  /** Last player position seen (street position at the door when indoors), for distances in the jobs app. */
  private here = { x: 0, z: 0 };
  /** Run and stage the city walking marker was last set for (so it follows pick-up → drop-off once each). */
  private markedFor: string | null = null;
  /** Counter signature of the activities other modules record (bouts, beats, chats…), read on the previous check. */
  private sig: number[] | null = null;
  private bizT = 0;
  /** The first payout of a session gets a toast; the next ones only tint the wallet. */
  private paidOnce = false;

  constructor(private d: EconomyDeps) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.55, 40), this.ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), this.beamMat); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.05;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 14, 10, 1, true), this.beamMat); beam.position.y = 7;
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 4), this.ringMat); this.arrow.rotation.x = Math.PI; this.arrow.position.y = 3.2;
    this.marker.add(ring, disc, beam, this.arrow); this.marker.visible = false; this.marker.renderOrder = 2;
    d.scene.add(this.marker);
    this.line = document.createElement('div'); this.line.id = 'delivery'; this.line.className = 'card';
    (document.getElementById('ui') ?? document.body).appendChild(this.line);
    phoneHooks.ledger = () => [...d.state.data.ledger].reverse().map(e => ({ ...e }));   // newest first
    phoneHooks.openJobs = () => this.openJobs();
    phoneHooks.openHome = () => this.openShop(true);
    phoneHooks.openBusiness = () => this.openBusiness();
    phoneHooks.wealth = () => ({ assets: assetsValue(d.state), perHour: allIncome(d.state), charges: chargesPerHour(d.state), polyvalence: polyLine(d.state) });
  }

  private get s() { return this.d.state; }

  // ---------------------------------------------------------------- hub dressing
  /** Add the delivery action at pick-up points and, in Pikine, the furniture shop. Called after each hub build. */
  decorateHub(world: HubWorld, detail?: ShopDetail) {
    this.world = world;
    for (const frag of pickupFrags(world.id)) {
      const it = this.placeOf(frag);
      if (it && !it.actions.includes(JOBS_ACTION)) it.actions = [...it.actions, JOBS_ACTION];
    }
    for (const t of toursIn(world.id)) {                                 // a tour leaves from its own pick-up point too
      const it = this.placeOf(t.pickup.frag);
      if (it && !it.actions.includes(JOBS_ACTION)) it.actions = [...it.actions, JOBS_ACTION];
    }
    for (const it of world.interactables) if (it.id.startsWith(world.id + ':city:bank') && !it.actions.includes(BUSINESS_ACTION)) it.actions = [...it.actions, BUSINESS_ACTION];
    if (world.id === 'pikine') this.buildShop(world, detail);
  }

  private placeOf(frag: string): Interactable | undefined {
    const w = this.world;
    return w?.interactables.find(i => i.id.startsWith(w.id + ':') && i.id.includes(frag));
  }
  private distance(r: Route): number | null {
    if (r.toHub && r.toHub !== r.hub) return planTrip(r.hub, r.toHub)?.metres ?? 2000;     // between districts: the roads' length
    const a = this.placeOf(r.from.frag), b = this.placeOf(r.to.frag);
    return a && b && this.world?.id === r.hub ? Math.hypot(a.x - b.x, a.z - b.z) : null;
  }

  /**
   * "Quincaillerie · meubles": a small shop of the kit on the Maïga du marché's lot, beside it (src/economy/stall.ts);
   * its sheet at the counter opens the same furniture catalogue.
   */
  private buildShop(world: HubWorld, detail?: ShopDetail) {
    const m = this.placeOf(':maiga:'); if (!m) return;
    buildQuincaillerie(world, m, SHOP_ACTION, detail);
  }

  // ---------------------------------------------------------------- deliveries and the jobs app
  /**
   * Jobs. At a pick-up point (its "Livraisons Tiak Tiak" action): the deliveries leaving from there, parcel in hand.
   * From the phone / wallet: Tiak Tiak offers of the hub, then the city's existing paid services (any place action with
   * a `gain`: Soumbédioune, the mall, the bank, Boutique Diallo, the market, the garage…). Picking a service only sets the
   * city's walking marker; the work itself is done at the place, as before (no teleport).
   */
  openJobs(at?: Interactable) {
    const w = this.world; if (!w) return;
    const s = this.s, a = s.data.jobs.active, hub = w.id;
    const fromHere = at && at.id.startsWith(hub + ':') ? (r: Route) => at.id.includes(r.from.frag) : null;
    const items: MenuItem[] = [];                                   // plain rows: the city's paid services (phone app only)
    const deck = cards();
    const away = (x: number, z: number) => Math.round(Math.hypot(x - this.here.x, z - this.here.z));
    const spotOf = (p: Place): Spot => ({ icon: iconOf(p.frag), name: shortName(p.name) });
    const energy = `⚡ ${ECONOMY.tiak.fatigue.energie}`.replace('-', '−');
    const first = (s.data.counters.livraisons ?? 0) === 0;
    if (a?.tour) {
      const c = currentTour(s);
      if (c) {
        const left = tourRemainingMs(s);
        const live = routeCard({ from: { icon: '🏍️', name: `Tournée ${c.run.leg + 1}/2` }, to: [stopSpot(c.stop)], reward: '+' + fcfa(payNow(s, a.pay)), chips: [c.run.departed ? (left >= 0 ? `⏱ ${clock(left)}` : '⏰ En retard') : '⏱ Chrono au départ'], cta: '', live: true, tour: true, onPick: () => {} });
        deck.append(live);
      }
      deck.append(actionCard('🚪', 'Abandonner', () => { this.d.hud.closeModal(); this.openAbandon(); }));
    } else if (a) {
      const r = routeById(a.routeId);
      const left = remainingMs(s);
      deck.append(routeCard({ from: r ? spotOf(r.from) : { icon: '📦', name: '?' }, to: r ? [spotOf(r.to)] : [], reward: '+' + fcfa(payNow(s, a.pay)), chips: [a.stage === 'pickup' ? '📦 Colis à prendre' : left === Infinity ? '' : left >= 0 ? `⏱ ${clock(left)}` : '⏰ En retard'].filter(Boolean), cta: '', live: true, onPick: () => {} }));
      deck.append(actionCard('✖', 'Annuler', () => { this.cancel(); this.d.hud.closeModal(); }));
    } else {
      let badge = first;
      for (const r of offers(s, hub).filter(r => !fromHere || fromHere(r))) {
        const why = whyNot(s, r), dist = this.distance(r), start = this.placeOf(r.from.frag);
        const chips = [dist !== null ? `📏 ${Math.round(dist)} m` : '', energy, !fromHere && start ? `🚶 ${away(start.x, start.z)} m` : ''].filter(Boolean);
        deck.append(routeCard({
          from: spotOf(r.from), to: [spotOf(r.to)], reward: '+' + fcfa(payNow(s, routePay(r))), chips, cta: fromHere ? 'Livrer' : 'Y aller', blocked: why ?? undefined,
          badge: r.needFlag ? '★ Client fidèle' : badge && !why ? '👍 Pour débuter' : undefined,
          onPick: () => { this.d.hud.closeModal(); this.accept(r.id, !!fromHere); },
        }));
        if (!r.needFlag) badge = false;
      }
      // the optional tour: two clients, the courier picks who is served first (at its pick-up point, or as a marker from the phone)
      for (const t of fromHere ? toursAt(hub, at!.id) : toursIn(hub)) {
        const why = whyNotTour(s, t), pays = paysOf(s, t), start = this.placeOf(t.pickup.frag);
        deck.append(routeCard({
          from: spotOf(t.pickup), to: t.stops.map(st => stopSpot(st)), reward: '+' + fcfa(payNow(s, pays[0] + pays[1] + t.bonus)),
          chips: ['📍 2 arrêts', `🎁 Bonus +${fcfa(t.bonus)}`, !fromHere && start ? `🚶 ${away(start.x, start.z)} m` : ''].filter(Boolean), cta: fromHere ? 'Choisir' : 'Y aller', tour: true, blocked: why ?? undefined,
          onPick: () => {
            this.d.hud.closeModal();
            if (fromHere) this.openTourOrder(t);
            else if (start) { this.d.walkTo(start.id); this.d.hud.toast(`📍 ${t.pickup.name}`); }
          },
        }));
      }
    }
    if (!fromHere) {
      const services = w.interactables
        .filter(it => it.id.startsWith(hub + ':') && it.kind === 'actions')
        .flatMap(it => it.actions.filter(x => x.gain && !x.special && (!x.visible || x.visible(s))).map(x => ({ it, x })))
        .sort((p, q) => away(p.it.x, p.it.z) - away(q.it.x, q.it.z));
      for (const { it, x } of services) {
        const why = x.requires?.(s) ?? null, en = x.needs?.energie ?? 0;
        items.push({
          label: x.label, right: '+' + fcfa(this.workPreview(x, it)), disabled: !!why,
          detail: [it.name, en < 0 ? `−${-en} énergie` : '', `${away(it.x, it.z)} m`, why ?? ''].filter(Boolean).join(' · '),
          onPick: () => { this.d.hud.closeModal(); this.d.walkTo(it.id); this.d.hud.toast(`Repère : ${it.name} · ${x.label}`); },
        });
      }
    }
    if (!deck.children.length && !items.length) deck.append(tip('📵', 'Pas de Tiak Tiak ici (Pikine et Plateau).'));
    this.d.menu();
    const hint = fromHere && first && !a && toursAt(hub, at!.id).length ? '👍 1re fois ? Commence simple.' : '';
    this.d.hud.openMenu(fromHere ? 'Tiak Tiak' : 'Petits boulots', hint, items, '', panel => panel.insertBefore(deck, panel.querySelector('.list')));
  }

  accept(routeId: string, atPickup: boolean) {
    const r = routeById(routeId); if (!r) return null;
    const dist = this.distance(r) ?? 120;
    const job = acceptJob(this.s, routeId, atPickup, deliveryLimitMs(dist));
    if (!job) { this.d.hud.toast(whyNot(this.s, r) ?? 'Livraison indisponible'); return null; }
    this.d.hud.toast(atPickup ? `Colis en main → ${r.to.name} · ${clock(job.limitMs)} pour livrer` : `Va récupérer le colis : ${r.from.name}`);
    this.d.save();
    return job;
  }

  cancel() {
    if (this.s.data.jobs.active?.tour) return this.abandon();
    if (!cancelJob(this.s)) return false;
    this.unmark();
    this.d.hud.toast('Livraison annulée · aucun paiement'); this.d.save();
    return true;
  }

  // ---------------------------------------------------------------- the tour (src/economy/tour.ts)
  /** What a client remembers, as one line in the offer: « ★★ · 2 à l’heure, 0 en retard · patience +8 % · paie +8 % ». */
  private memoryLine(st: TourStop): string {
    const tr = trustOf(this.s, st.id), h = historyOf(this.s, st.id), pct = (f: number) => Math.round((f - 1) * 100);
    const seen = h.ok + h.late + h.dropped === 0 ? 'jamais servi' : `${h.ok} à l’heure, ${h.late} en retard${h.dropped ? `, ${h.dropped} abandonné${h.dropped > 1 ? 's' : ''}` : ''}`;
    const pat = pct(patienceFactor(tr)), pay = pct(payFactor(tr));
    return `${trustWord(tr)} · ${seen} · patience ${pat > 0 ? '+' : pat < 0 ? '−' : ''}${Math.abs(pat)} %${pay > 0 ? ` · paie +${pay} %` : ''}`;
  }

  /** The two orders of a tour as two cards: who is served first, each client's urgency, who will be on time. */
  openTourOrder(t: Tour) {
    const s = this.s, deck = cards();
    const urgency = (limitS: number): 1 | 2 | 3 => (limitS <= 12 ? 3 : limitS <= 20 ? 2 : 1);
    const mem = (st: TourStop) => { const tr = trustOf(s, st.id); return tr > 0 ? '★'.repeat(tr) : tr < 0 ? '😒' : ''; };
    for (const order of ORDERS) {
      const p = previewOrder(s, t, order);
      deck.append(orderCard({
        first: order[0], reward: '≈ +' + fcfa(payNow(s, p.pay)),
        stops: order.map((i, k) => ({ spot: stopSpot(t.stops[i]), urgency: urgency(p.limit[k]), limit: `${Math.round(p.limit[k])} s`, ok: p.onTime[k], memory: mem(t.stops[i]) })),
        onPick: () => { this.d.hud.closeModal(); this.acceptTourRun(t, order); },
      }));
    }
    deck.append(disclosure('Si j’abandonne ?', 'Avant de partir : gratuit. Après : les stops livrés sont payés, pas de bonus, −1 ★ pour chaque client non livré. La confiance se regagne en livrant à l’heure.'));
    this.d.menu();
    this.d.hud.openMenu('Qui en premier ?', '⏱ Le chrono part quand tu démarres.', [], '', panel => panel.insertBefore(deck, panel.querySelector('.list')));
  }

  acceptTourRun(t: Tour, order: Order) {
    const job = acceptTour(this.s, t.id, order);
    if (!job) { this.d.hud.toast(whyNotTour(this.s, t) ?? 'Tournée indisponible'); return null; }
    this.d.hud.toast(`📦 → ${t.stops[order[0]].place.name} · chrono au départ`);
    this.d.save();
    return job;
  }

  /** Confirmation before abandoning a tour: two big buttons and what it costs, in a line. */
  openAbandon() {
    const s = this.s, c = currentTour(s);
    if (!c) return;
    const deck = cards();
    const waiting = c.run.order.slice(c.run.leg).map(i => c.tour.stops[i]);
    if (c.run.departed) deck.append(tip('⚠️', `Pas de bonus · −1 ★ : ${waiting.map(st => iconOf(st.place.frag)).join(' ')}`));
    else deck.append(tip('👌', 'Pas encore parti : aucun coût.'));
    deck.append(actionCard('🚪', 'Oui, abandonner', () => { this.d.hud.closeModal(); this.abandon(); }, true), actionCard('🏍️', 'Continuer', () => this.d.hud.closeModal()));
    this.d.menu();
    this.d.hud.openMenu('Abandonner ?', '', [], '', panel => panel.insertBefore(deck, panel.querySelector('.list')));
  }

  abandon() {
    const r = abandonTour(this.s);
    if (!r) return false;
    this.unmark();
    this.d.hud.toast(r.free ? '🚪 Tournée annulée' : `🚪 Abandon · −1 ★ (${r.lost.length})`);
    this.d.save();
    return true;
  }

  /** Hand over the parcel of the stop being served (pays once per stop, the second pays the bonus too). */
  finishStop(runId: string): TourCompletion | null {
    const c = completeStop(this.s, runId);
    if (!c) return null;
    this.unmark();
    const msg = [`${c.late ? '⏰' : '✓'} ${c.stop.place.name} +${fcfa(c.paid)}`];
    if (c.finished) msg.push(`🎁 +${fcfa(c.bonus)}`);
    else { const next = currentTour(this.s); if (next) msg.push(`→ ${next.stop.place.name}`); }
    msg.push(c.trust > 0 ? '★'.repeat(c.trust) : c.trust < 0 ? '😒' : '');
    this.d.hud.toast(msg.filter(Boolean).join(' · '));
    this.d.save();
    return c;
  }

  /** Hand over the parcel for this run id (pays once; a second call with the same id pays nothing). */
  finish(runId: string): Completion | null {
    const c = completeJob(this.s, runId);
    if (!c) return null;
    this.unmark();
    const msg = [`${c.late ? 'Livré en retard' : 'Livraison réussie'} ✓ +${fcfa(c.paid)}`];
    if (c.newClient) msg.push(`Nouvelle cliente : ${c.newClient}. Elle te recommandera.`);
    this.d.hud.toast(msg.join(' · '));
    this.d.save();
    return c;
  }

  private unmark() { if (this.markedFor) { this.d.walkTo(null); this.markedFor = null; } }

  /** Per-frame: marker on the current target, HUD line, arrival at the pick-up / drop-off. `street` = position outdoors (the door when inside). */
  update(dt: number, pos: THREE.Vector3, inside: boolean, playing: boolean, street: { x: number; z: number } = pos) {
    this.t += dt;
    this.here = { x: street.x, z: street.z };
    this.bizT -= dt;
    if (this.bizT <= 0) { this.bizT = 0.25; this.tickBusiness(); }
    const s = this.s, a = s.data.jobs.active, w = this.world;
    const tc = currentTour(s);                                           // the tour in hand (null for a delivery, or a tour removed from the table)
    const r = a && !a.tour ? routeById(a.routeId) : undefined;
    if (a && !a.tour && !r) { cancelJob(s); this.d.save(); }             // a route removed from the design table: drop the run, pay nothing
    if (a?.tour && !tc) { abandonTour(s); this.d.save(); }               // a tour removed from the design table: same
    const tgtPlace = tc ? tc.stop.place : a && r ? (a.stage === 'pickup' ? r.from : r.to) : null;
    const tgtHub = a && r && a.stage === 'deliver' ? deliveryHub(r) : a?.hub;                // a parcel for another district is handed over there
    const tgt = a && tgtPlace && w && w.id === tgtHub ? this.placeOf(tgtPlace.frag) : undefined;
    this.marker.visible = !!tgt && !inside;
    if (!a && this.markedFor) this.unmark();
    const mark = a ? `${a.runId}:${tc ? 'tour' + tc.run.leg : a.stage}` : '';
    if (tgt && mark !== this.markedFor) { this.markedFor = mark; this.d.walkTo(tgt.id); }   // the city's arrow follows the parcel
    if (tc && !tc.run.departed) {                                        // the clock of a tour starts when the courier leaves the pick-up point (or the hub)
      const from = w && w.id === tc.tour.hub ? this.placeOf(tc.tour.pickup.frag) : undefined;
      if (!from || Math.hypot(this.here.x - from.x, this.here.z - from.z) > ECONOMY.tiak.tour.departRadius) { depart(s); this.d.save(); }
    }
    if (tgt && w) {
      const col = a!.stage === 'pickup' ? 0x4fd1ff : 0xffc83d;
      this.ringMat.color.setHex(col); this.beamMat.color.setHex(col);
      this.marker.position.set(tgt.x, w.heightAt(tgt.x, tgt.z) + 0.12, tgt.z);
      this.arrow.position.y = 3.2 + Math.sin(this.t * 3) * 0.25; this.arrow.rotation.y = this.t * 1.5;
      const d = Math.hypot(pos.x - tgt.x, pos.z - tgt.z);
      if (playing && !inside && d < ECONOMY.tiak.arriveRadius) {
        if (tc) { if (tc.run.departed) this.finishStop(a!.runId); }
        else if (a!.stage === 'pickup') {
          const dist = this.distance(r!) ?? 120;
          pickUp(s, deliveryLimitMs(dist));
          this.d.hud.toast(`Colis récupéré ✓ → ${r!.to.name} · ${clock(s.data.jobs.active!.limitMs)} pour livrer`);
          this.d.save();
        } else this.finish(a!.runId);
      }
    }
    this.lineT -= dt;
    if (this.lineT > 0) return;
    this.lineT = 0.25;
    const job = s.data.jobs.active, route = job && !job.tour ? routeById(job.routeId) : undefined, tour = job ? currentTour(s) : null;
    if (!job || (!route && !tour)) { this.line.classList.remove('on'); return; }
    const dist = tgt ? `${Math.round(Math.hypot(pos.x - tgt.x, pos.z - tgt.z))} m` : HUB_NAMES[(route && job.stage === 'deliver' ? deliveryHub(route) : job.hub) as HubId];
    // the ride: only the next place, the progress and the countdown
    let name: string, icon: string, progress = '', clockText: string, late = false, wait = false;
    if (tour) {
      const left = tourRemainingMs(s);
      name = shortName(tour.stop.place.name); icon = iconOf(tour.stop.place.frag);
      progress = tour.run.leg === 0 ? '●○' : '●●';
      late = left < 0; wait = !tour.run.departed;
      clockText = wait ? 'Va !' : late ? '⏰' : clock(left);
    } else {
      const left = remainingMs(s), stage = job.stage;
      const place = stage === 'pickup' ? route!.from : route!.to;
      name = shortName(place.name); icon = iconOf(place.frag);
      late = left < 0; wait = stage === 'pickup';
      clockText = stage === 'pickup' ? '📦' : left === Infinity ? '' : late ? '⏰' : clock(left);
    }
    const sig = `${name}|${inside ? 1 : 0}${dist}|${progress}|${clockText}|${late}|${wait}`;
    if (sig !== this.lineSig) {
      this.lineSig = sig;
      this.line.innerHTML = '';
      const ic = document.createElement('i'); ic.className = 'dv-ic'; ic.textContent = icon;
      const main = document.createElement('div'); main.className = 'dv-main';
      const b = document.createElement('b'); b.textContent = name;
      const small = document.createElement('small'); small.textContent = inside ? 'Sors d’abord' : dist;
      main.append(b, small);
      this.line.append(ic, main);
      if (progress) { const pr = document.createElement('span'); pr.className = 'dv-prog'; pr.textContent = progress; this.line.append(pr); }
      if (clockText) { const ck = document.createElement('span'); ck.className = 'dv-clock' + (wait ? ' wait' : ''); ck.textContent = clockText; this.line.append(ck); }
    }
    this.line.classList.toggle('late', late);
    this.line.classList.add('on');
    const goal = document.getElementById('goal');
    const top = goal && goal.classList.contains('on') ? goal.offsetTop + goal.offsetHeight + 6 : goal ? parseFloat(getComputedStyle(goal).top) || 160 : 160;
    this.line.style.top = top + 'px';
  }

  // ---------------------------------------------------------------- furniture and wallet
  /**
   * The six starter pieces: the quincaillerie stall (Pikine) or the debug home list. Purchases are delivered to the home
   * the player lives in and set up there (src/economy/assets.ts); the full catalogue is at Keur Meubles (estate.ts).
   */
  /** `where`: the shop it is opened from (« Maison Dakar » → « Maison Dakar · meubles »); the stall by the Maïga by default. */
  openShop(fromPhone = false, where?: string) {
    if (where !== undefined) this.shopAt = where;
    const s = this.s, home = specOfAsset(currentHome(s)).name;
    const items: MenuItem[] = FURNITURE.map(f => {
      const mine = owns(s, f.id), why = cannotBuy(s, f.id);
      return { label: f.name, detail: mine ? `Chez toi ✓ · ${f.effect}` : why && why !== 'Déjà chez toi' ? `${why} · ${f.effect}` : f.effect, right: mine ? '✓' : fcfa(priceOf(f.id)), disabled: !!why, onPick: () => this.confirmPiece(f.id, fromPhone) };
    });
    const owned = FURNITURE.filter(f => owns(s, f.id));
    const html = `<div class="kv">${owned.length ? 'Dans ta chambre : ' + owned.map(f => esc(f.name)).join(', ') : 'Ta chambre est encore vide.'}<br>${esc(homeGoalLine(s))}</div>
      <div class="draft">Livré chez toi (${esc(home)}). Plus de choix à Keur Meubles, Cité Jàmm. ${esc(LOCAL_NOTE)}</div>`;
    this.d.menu();
    const at = this.shopAt && !/meubles/i.test(this.shopAt) ? `${this.shopAt} · meubles` : 'Quincaillerie · meubles';
    this.d.hud.openMenu(fromPhone ? 'Ma chambre · meubles' : at, `${owned.length}/${FURNITURE.length} meubles · portefeuille ${fcfa(s.wallet)}`, items, html);
  }

  /** What a piece costs and brings, before the one confirmation (owner's rule: no surprise after paying). */
  private confirmPiece(id: string, fromPhone: boolean) {
    const s = this.s, f = furnitureById(id), price = priceOf(id), home = specOfAsset(currentHome(s)).name; if (!f) return;
    const rows: [string, string][] = [['Prix', fcfa(price)], ['Ce qu’il apporte', f.effect], ['Livré', id === 'matelas' ? `sur ton lit (${home})` : `chez toi (${home}), installé où il y a de la place`], ['Il te restera', fcfa(Math.max(0, s.wallet - price))]];
    const why = cannotBuy(s, id);
    this.d.menu();
    this.d.hud.openMenu(`Acheter : ${f.name}`, 'Vérifie avant de confirmer :', [
      { icon: '✅', label: 'Acheter', right: '−' + fcfa(price), detail: why ?? 'Une seule fois : pas de papiers, pas d’attente', disabled: !!why, onPick: () => { this.d.hud.closeModal(); this.buy(id); } },
      { icon: '↩️', label: 'Retour', onPick: () => this.openShop(fromPhone) },
    ], `<div class="est-rows">${rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`);
  }

  buy(id: string): boolean {
    const item = furnitureById(id), piece = item ? deliverFurniture(this.s, id) : null;
    if (!item || !piece) { this.d.hud.toast(cannotBuy(this.s, id) ?? 'Achat impossible'); return false; }
    // the « bon matelas » goes on the room's own bed (never placed): it is not « stored for lack of room »
    const where = id === 'matelas' ? 'sur ton lit' : `chez toi${piece.at === null ? ' (rangé : pas de place)' : ''}`;
    this.d.hud.toast(`Achat : ${item.name} ✓  −${fcfa(priceOf(id))} · livré ${where}`);
    this.d.save();
    return true;
  }

  /** Wallet history (the same data as phoneHooks.ledger), with shortcuts to deliveries and furniture. */
  openWallet() {
    const s = this.s, rows = [...s.data.ledger].reverse().slice(0, 40);
    const when = (at: number) => { const d = new Date(at); return `${d.toLocaleDateString('fr-FR')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    const value = assetsValue(s);
    const html = `<div class="kv">En poche : <b>${fcfa(s.wallet)}</b> · biens : ${fcfa(value)}<br>Fortune totale : <b>${fcfa(s.wallet + value)}</b><br>${esc(polyLine(s))}</div>
      <h3>Historique</h3><div class="rel ledger">${rows.length ? rows.map(e => `<span>${esc(e.label)}<small>${when(e.at)}</small></span><em class="${e.amount >= 0 ? 'plus' : 'minus'}">${e.amount >= 0 ? '+' : '−'}${fcfa(Math.abs(e.amount))}</em>`).join('') : '<span>Aucun mouvement pour l’instant.</span><em></em>'}</div>
      <div class="draft">${esc(LOCAL_NOTE)} Les 100 derniers mouvements sont gardés.</div>`;
    this.d.menu();
    this.d.hud.openMenu('Portefeuille', `${fcfa(s.wallet)} · ${homeGoalLine(s)}`, [
      { label: 'Petits boulots', detail: 'Tiak Tiak et services payés du quartier', onPick: () => this.openJobs() },
      { label: 'Affaires', detail: unitsOwned(s) ? `${unitsOwned(s)} affaire${unitsOwned(s) > 1 ? 's' : ''} · +${fcfa(incomePerHour(s))} par heure` : firstVentureHint(s) ?? '', onPick: () => this.openBusiness() },
      { label: 'Ma chambre · meubles', detail: `${furnitureCount(s)} meuble${furnitureCount(s) > 1 ? 's' : ''}`, onPick: () => this.openShop(true) },
    ], html);
  }

  // ---------------------------------------------------------------- polyvalence and ventures
  /** A finished city action (main.ts runAction): records its activity and returns its pay scaled by the variety bonus (0 if unpaid). */
  work(a: Action, it?: Interactable): number { return workPay(this.s, a.gain ?? 0, activityOf(a, it?.id)); }
  /** What `a` would pay if done now (menus). */
  workPreview(a: Action, it?: Interactable): number { return payPreview(this.s, a.gain ?? 0, activityOf(a, it?.id)); }
  /** Activity framework (src/activity/effects.ts): a category practised, then the pay it brings, scaled by the variety bonus. */
  practiseCategory(c: ActivityCategory) { const a = fromCategory(c); if (a) practise(this.s, a); }
  scalePay(money: number, c: ActivityCategory | null) { return fromCategory(c) ? Math.round(money * multiplier(this.s)) : money; }
  previewPay(money: number, c: ActivityCategory | null) { const a = fromCategory(c); return a ? payPreview(this.s, money, a) : money; }

  /** Activities recorded by other modules (counters) and the assets' hourly income and charges. A few times per second. */
  tickBusiness(): number {
    const s = this.s;
    this.sig = this.sig ? noticeActivities(s, this.sig) : signature(s.data);
    const paid = accrue(s);
    for (const n of takeNotices()) this.d.hud.toast(n);
    if (paid > 0) {
      const m = document.getElementById('money');
      if (m) { m.classList.remove('up'); void m.offsetWidth; m.classList.add('up'); m.title = `Revenus des affaires : +${fcfa(paid)}`; }
      if (!this.paidOnce) { this.paidOnce = true; this.d.hud.toast(`Tes affaires rapportent : +${fcfa(paid)} · chaque heure en ville`); }
    }
    return paid;
  }

  /** « Affaires »: owned ventures, income, next prices; picking one asks for confirmation. Open to whoever can pay. */
  openBusiness() {
    const s = this.s, value = venturesValue(s), units = unitsOwned(s);
    const items: MenuItem[] = VENTURES.map(v => {
      const n = ownedOf(s, v.id), why = lockedWhy(s, v.id), price = nextPrice(s, v.id), each = perHourOf(v.id);
      const missing = price - s.wallet;
      const detail = why ?? [n ? `+${fcfa(each)}/h chacune · +${fcfa(each * n)}/h en tout` : `${v.what} · +${fcfa(each)}/h`, missing > 0 ? `il manque ${fcfa(missing)}` : 'acheter'].join(' · ');
      return { label: `${v.name}${n ? ` ×${n}` : ''}`, detail, right: why ? 'Bloqué' : fcfa(price), disabled: !!why || missing > 0, onPick: () => this.confirmVenture(v.id) };
    });
    const chips = ACTIVITIES.map(a => {
      const on = isRecent(s, a), known = s.data.activities.known.includes(a), days = Math.ceil((timeLeft(s, a) / (WINDOW_MS / ECONOMY.polyvalence.windowDays)) * 10) / 10;
      return `<span class="${on ? 'on' : known ? 'old' : ''}" title="${esc(ACTIVITY_INFO[a].where)}">${on ? '✓ ' : ''}${esc(ACTIVITY_INFO[a].label)}${on ? `<small>encore ${String(days).replace('.', ',')} j</small>` : ''}</span>`;
    }).join('');
    const todo = ACTIVITIES.filter(a => !isRecent(s, a)).slice(0, 3).map(a => `${ACTIVITY_INFO[a].label} : ${ACTIVITY_INFO[a].where}`);
    const html = `<div class="biz-sum">
        <div><small>Revenus par heure</small><b>+${fcfa(incomePerHour(s))}</b></div>
        <div><small>Total gagné</small><b>${fcfa(s.data.assets.earned)}</b></div>
        <div><small>Valeur des affaires</small><b>${fcfa(value)}</b></div>
        <div><small>Fortune totale</small><b>${fcfa(s.wallet + value)}</b></div>
      </div>
      <div class="poly"><b>${esc(polyLine(s))}</b><div class="chips">${chips}</div>
        <small>Bonus facultatif : chaque activité différente pratiquée ces 3 derniers jours de jeu ajoute +5\u202f% à la paie (livraisons, petits boulots), jusqu’à +15\u202f%. Il ne change pas les revenus des affaires.${todo.length ? ' À essayer : ' + esc(todo.join(' · ')) + '.' : ''}</small></div>
      <div class="draft">${esc(INCOME_NOTE)} Chaque unité de plus coûte 15\u202f% plus cher. Aucune condition : une affaire s’achète dès que tu peux la payer.</div>`;
    this.d.menu();
    this.d.hud.openMenu('Affaires', `${units ? `${units} affaire${units > 1 ? 's' : ''}` : 'Aucune affaire pour l’instant'} · en poche ${fcfa(s.wallet)}`, items, html);
  }

  private confirmVenture(id: string) {
    const s = this.s, v = VENTURES.find(x => x.id === id); if (!v) return;
    const price = nextPrice(s, id), each = perHourOf(id);
    this.d.menu();
    this.d.hud.openMenu(`Acheter : ${v.name}`, `${v.what}.`, [
      { label: 'Confirmer l’achat', detail: `Rapporte +${fcfa(each)} par heure en ville`, right: '−' + fcfa(price), disabled: !!cannotBuyVenture(s, id), onPick: () => { this.buyVenture(id); this.openBusiness(); } },
      { label: 'Retour aux affaires', onPick: () => this.openBusiness() },
    ], `<div class="kv">Prix : ${fcfa(price)} · il te restera ${fcfa(Math.max(0, s.wallet - price))}.<br>Tu en as ${ownedOf(s, id)} ; la suivante coûtera ${fcfa(unitPrice(id, ownedOf(s, id) + 1))}.</div>`);
  }

  /** Buy one unit (after confirmation in the menus; directly from debug). */
  buyVenture(id: string): boolean {
    const s = this.s, v = VENTURES.find(x => x.id === id), price = nextPrice(s, id);
    if (!v || !buyVenture(s, id)) { this.d.hud.toast(cannotBuyVenture(s, id) ?? 'Achat impossible'); return false; }
    this.d.hud.toast(`${v.name} ✓  −${fcfa(price)} · +${fcfa(perHourOf(id))} par heure`);
    this.d.save();
    return true;
  }

  /** Debug hooks (window.__dakar, ?debug only). */
  debug() {
    const s = this.s;
    return {
      jobs: () => (this.world ? offers(s, this.world.id).map(r => ({ id: r.id, from: r.from.name, to: r.to.name, pay: ECONOMY.tiak.pay[r.id] ?? 0, payNow: payNow(s, routePay(r)), recommended: !!r.needFlag, blocked: whyNot(s, r) })) : []),
      /** What a place's action pays if done now (variety bonus included). */
      servicePay: (placeId: string, actionId: string) => { const it = this.world?.interactables.find(i => i.id === placeId), a = it?.actions.find(x => x.id === actionId); return it && a ? this.workPreview(a, it) : null; },
      acceptJob: (id: string, atPickup = true) => { const j = this.accept(id, atPickup); return j ? { ...j } : null; },
      activeJob: () => (s.data.jobs.active ? { ...s.data.jobs.active } : null),
      /** Simulate arrival (pick-up then drop-off); with a run id, hands over that run only. */
      completeJob: (runId?: string) => {
        const a = s.data.jobs.active;
        if (!runId && a && a.stage === 'pickup') { const r = routeById(a.routeId); pickUp(s, deliveryLimitMs(r ? this.distance(r) ?? 120 : 120)); }
        const id = runId ?? s.data.jobs.active?.runId;
        const c = id ? this.finish(id) : null;
        return c ? { runId: c.runId, paid: c.paid, late: c.late, newClient: c.newClient } : null;
      },
      cancelJob: () => this.cancel(),
      /** The tour(s) of this hub: what the order menu predicts, and what each client remembers (limits and pay are the ones an acceptance now would fix). */
      tourOffer: () => toursIn(this.world?.id ?? s.data.hub).map(t => ({
        id: t.id, pickup: t.pickup.name, why: whyNotTour(s, t), total: tourTotal(t), limits: limitsOf(s, t), pays: paysOf(s, t),
        orders: ORDERS.map(o => { const p = previewOrder(s, t, o); return { first: t.stops[o[0]].id, arrive: p.arrive.map(x => +x.toFixed(1)), limit: p.limit, onTime: p.onTime, pay: p.pay }; }),
        memory: t.stops.map(st => ({ id: st.id, client: st.client, trust: trustOf(s, st.id), history: historyOf(s, st.id), line: this.memoryLine(st) })),
      })),
      /** Accept the tour as the order menu would (first = index of the stop served first); null when refused. */
      acceptTour: (id: string, first: 0 | 1 = 0) => { const t = toursIn(this.world?.id ?? s.data.hub).find(x => x.id === id); const j = t ? this.acceptTourRun(t, first === 0 ? [0, 1] : [1, 0]) : null; return j ? { ...j } : null; },
      tourState: () => { const c = currentTour(s); return c ? { runId: c.job.runId, leg: c.run.leg, order: c.run.order, departed: c.run.departed, stop: c.stop.id, left: tourRemainingMs(s), leftOther: c.run.leg === 0 ? tourRemainingMs(s, 1) : null, clock: c.run.departed ? +((s.data.playedMs - c.job.startedMs) / 1000).toFixed(2) : null, late: [...c.run.late], limitS: c.run.limitS, pay: c.run.pay, parcel: c.job.stage } : null; },
      abandonTour: () => this.abandon(),
      /** The hub's solid boxes as built at run time (modules add theirs), for the bike's route planning (scripts/m1b-tour/legs.ts). */
      colliders: () => (this.world ? this.world.colliders.map(c => [c.x0, c.z0, c.x1, c.z1, c.h]) : []),
      tourMenu: (id?: string) => { const t = id ? TOURS_BY(id) : toursIn(this.world?.id ?? s.data.hub)[0]; if (t) this.openTourOrder(t); },
      jobsMenu: () => this.openJobs(),
      jobsApp: () => { this.openJobs(); return [...document.querySelectorAll('#modal.on .item:not(.close)')].map(e => e.textContent ?? ''); }, shop: () => this.openShop(false), homeApp: () => this.openShop(true), wallet: () => this.openWallet(),
      buy: (id: string) => this.buy(id),
      furniture: () => ({ owned: ownedFurnitureIds(s), items: FURNITURE.map(f => ({ id: f.id, name: f.name, price: priceOf(f.id), owned: owns(s, f.id) })) }),
      ledger: () => phoneHooks.ledger?.() ?? [],
      business: () => ({
        owned: ownedVentures(s), base: baseIncome(s), perHour: incomePerHour(s), mult: multiplier(s), poly: polyvalence(s), line: polyLine(s),
        value: venturesValue(s), earned: s.data.assets.earned, carry: s.data.assets.carryIn, played: s.data.playedMs, hourMs: HOUR_MS,
        known: [...s.data.activities.known], next: Object.fromEntries(VENTURES.map(v => [v.id, { price: nextPrice(s, v.id), locked: lockedWhy(s, v.id) }])),
      }),
      businessApp: () => { this.openBusiness(); return [...document.querySelectorAll('#modal.on .item:not(.close)')].map(e => e.textContent ?? ''); },
      buyVenture: (id: string) => this.buyVenture(id),
      giveMoney: (n: number) => s.addMoney(n, 'Argent de test (debug)'),
      /** Played time passes (no needs drain): the ventures' income is counted and paid. Returns what was paid. */
      advancePlayed: (ms: number) => { s.data.playedMs += ms; return this.tickBusiness(); },
      practise: (a: Activity | 'services') => { practise(s, a === 'services' ? 'service' : a); return polyLine(s); },
      compact: (n: number) => fcfaShort(n),
      /** Every Tiak Tiak pick-up / drop-off of the current hub, resolved against the city's existing places. */
      routeEnds: () => (this.world ? ROUTES.filter(r => r.hub === this.world!.id).flatMap(r => [r.from, r.to]).map(p => ({ name: p.name, place: this.placeOf(p.frag)?.name ?? null })) : []),
      marker: () => ({ visible: this.marker.visible, x: this.marker.position.x, z: this.marker.position.z }),
    };
  }
}

