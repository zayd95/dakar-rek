import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { HubId } from '../core/types';
import { fcfa, type Hud, type MenuItem } from '../ui/hud';
import { phoneHooks } from '../ui/phoneHooks';
import type { Action, HubWorld, Interactable } from '../world/types';
import { Batch, signTexture } from '../world/batch';
import { HUB_NAMES } from '../world/content';
import { ECONOMY } from './config';
import { ROUTES, acceptJob, cancelJob, completeJob, deliveryLimitMs, offers, payNow, pickUp, pickupFrags, remainingMs, routeById, routePay, whyNot, type Completion, type Route } from './jobs';
import { FURNITURE, cannotBuy, deliverFurniture, furnitureCount, furnitureById, ownedFurnitureIds, owns, priceOf } from './furniture';
import { assetsValue, chargesPerHour, currentHome, incomePerHour as allIncome, specOfAsset, takeNotices } from './assets';
import { homeGoalLine } from './progress';
import { ACTIVITIES, ACTIVITY_INFO, WINDOW_MS, activityOf, fromCategory, isRecent, multiplier, noticeActivities, payPreview, polyLine, polyvalence, practise, signature, timeLeft, workPay, type Activity } from './polyvalence';
import type { ActivityCategory } from '../activity/types';
import { HOUR_MS, VENTURES, accrue, baseIncome, buyVenture, cannotBuy as cannotBuyVenture, firstVentureHint, incomePerHour, lockedWhy, nextPrice, ownedOf, ownedVentures, perHourOf, unitPrice, unitsOwned, venturesValue } from './business';
import { fcfaShort, times } from './format';
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
const clock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class Economy {
  private world: HubWorld | null = null;
  private marker = new THREE.Group();
  private ringMat = new THREE.MeshBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: false });
  private beamMat = new THREE.MeshBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  private arrow: THREE.Mesh;
  private line: HTMLElement;
  private t = 0;
  private lineT = 0;
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
  /** Add the delivery action at pick-up points and, in Pikine, the furniture stall. Called after each hub build. */
  decorateHub(world: HubWorld) {
    this.world = world;
    for (const frag of pickupFrags(world.id)) {
      const it = this.placeOf(frag);
      if (it && !it.actions.includes(JOBS_ACTION)) it.actions = [...it.actions, JOBS_ACTION];
    }
    for (const it of world.interactables) if (it.id.startsWith(world.id + ':city:bank') && !it.actions.includes(BUSINESS_ACTION)) it.actions = [...it.actions, BUSINESS_ACTION];
    if (world.id === 'pikine') this.buildShop(world);
  }

  private placeOf(frag: string): Interactable | undefined {
    const w = this.world;
    return w?.interactables.find(i => i.id.startsWith(w.id + ':') && i.id.includes(frag));
  }
  private distance(r: Route): number | null {
    const a = this.placeOf(r.from.frag), b = this.placeOf(r.to.frag);
    return a && b && this.world?.id === r.hub ? Math.hypot(a.x - b.x, a.z - b.z) : null;
  }

  /** "Quincaillerie · meubles": a covered stall beside the Maïga du marché, facing the street. */
  private buildShop(world: HubWorld) {
    const m = this.placeOf(':maiga:'); if (!m) return;
    const sx = m.x + 8.5, sz = m.z - 2.9, G = 0.12;
    const b = new Batch();
    for (const [dx, dz] of [[-1.7, -0.75], [1.7, -0.75], [-1.7, 0.75], [1.7, 0.75]]) b.box(0.08, 2.4, 0.08, sx + dx, G, sz + dz, 0x6b5a4a);
    b.box(3.8, 0.06, 2.0, sx, G + 2.4, sz, 0x1e6fd9); b.box(3.8, 0.25, 0.04, sx, G + 2.2, sz + 1.0, 0x1e6fd9);
    b.box(2.6, 0.8, 0.7, sx, G, sz - 0.25, 0x8b6a47); b.box(2.7, 0.05, 0.8, sx, G + 0.8, sz - 0.25, 0x6b4a2e);
    b.cyl(0.2, 0.2, 1.0, sx - 0.6, G + 0.85, sz - 0.3, 0x2f6fb3, 10, [0, 0, Math.PI / 2]);            // rolled mattress
    b.box(0.5, 0.06, 0.35, sx + 0.35, G + 0.85, sz - 0.35, 0xb5452b); b.box(0.5, 0.05, 0.35, sx + 0.35, G + 0.91, sz - 0.35, 0xf2d16b); // folded rugs
    b.box(0.34, 0.2, 0.14, sx + 0.95, G + 0.85, sz - 0.3, 0x2b2b33);                                    // radio
    b.box(0.06, 1.2, 0.55, sx - 1.5, G, sz + 0.25, 0x6e4426); b.box(0.02, 1.05, 0.44, sx - 1.46, G + 0.08, sz + 0.25, 0xc8dce6); // mirror
    const cols = [0x2a8fd1, 0xf2f2ee, 0x1a9d54, 0xd9322b];
    for (let k = 0; k < 4; k++) {                                                                         // stacked monobloc chairs
      b.box(0.46, 0.05, 0.44, sx + 1.25, G + 0.45 + k * 0.08, sz + 0.3, cols[k]); b.box(0.46, 0.42, 0.04, sx + 1.25, G + 0.5 + k * 0.08, sz + 0.1 - k * 0.02, cols[k]);
    }
    b.box(0.46, 0.45, 0.4, sx + 1.25, G, sz + 0.3, 0xe8e8e8);
    const mesh = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }), true, true); if (mesh) world.group.add(mesh);
    const tex = signTexture('QUINCAILLERIE · MEUBLES', '#1f2937', '#fde68a', 768, 112);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.55), new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 }));
    sign.position.set(sx, G + 2.75, sz + 1.03); world.group.add(sign); world.signs.push(sign);
    world.colliders.push({ x0: sx - 1.8, z0: sz - 0.85, x1: sx + 1.8, z1: sz + 0.55, h: 1.2 });
    world.interactables.push({ id: `${world.id}:shop:meubles`, name: 'Quincaillerie · meubles', kind: 'actions', x: sx, z: sz + 2.4, radius: 2.6, actions: [SHOP_ACTION] });
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
    const items: MenuItem[] = [];
    const away = (x: number, z: number) => Math.round(Math.hypot(x - this.here.x, z - this.here.z));
    const tiakEnergy = `${ECONOMY.tiak.fatigue.energie} énergie`.replace('-', '−');
    if (a) {
      const r = routeById(a.routeId);
      items.push({ label: `Tiak Tiak en cours : ${r?.from.name ?? '?'} → ${r?.to.name ?? '?'}`, detail: a.stage === 'pickup' ? 'Colis à récupérer' : this.limitText(), right: '+' + fcfa(payNow(s, a.pay)), disabled: true, onPick: () => {} });
      items.push({ label: 'Annuler la livraison', detail: 'Aucun paiement', onPick: () => { this.cancel(); this.d.hud.closeModal(); } });
    } else {
      for (const r of offers(s, hub).filter(r => !fromHere || fromHere(r))) {
        const why = whyNot(s, r), dist = this.distance(r), start = this.placeOf(r.from.frag);
        const parts = [r.what, tiakEnergy, dist !== null ? `trajet ≈ ${Math.round(dist)} m` : '', !fromHere && start ? `départ à ${away(start.x, start.z)} m` : ''].filter(Boolean);
        items.push({ label: `${r.needFlag ? '★ ' : ''}Tiak Tiak · ${r.from.name} → ${r.to.name}`, detail: why ?? parts.join(' · '), right: '+' + fcfa(payNow(s, routePay(r))), disabled: !!why, onPick: () => { this.d.hud.closeModal(); this.accept(r.id, !!fromHere); } });
      }
    }
    if (!fromHere) {
      const services = w.interactables
        .filter(it => it.id.startsWith(hub + ':') && it.kind === 'actions')
        .flatMap(it => it.actions.filter(x => x.gain && !x.special && (!x.visible || x.visible(s))).map(x => ({ it, x })))
        .sort((p, q) => away(p.it.x, p.it.z) - away(q.it.x, q.it.z));
      for (const { it, x } of services) {
        const why = x.requires?.(s) ?? null, energy = x.needs?.energie ?? 0;
        items.push({
          label: x.label, right: '+' + fcfa(this.workPreview(x, it)), disabled: !!why,
          detail: [it.name, energy < 0 ? `−${-energy} énergie` : '', `${away(it.x, it.z)} m`, why ?? ''].filter(Boolean).join(' · '),
          onPick: () => { this.d.hud.closeModal(); this.d.walkTo(it.id); this.d.hud.toast(`Repère : ${it.name} · ${x.label}`); },
        });
      }
    }
    const none = pickupFrags(hub).length === 0;
    const sub = fromHere ? 'Commandes à livrer depuis ici. Temps large ; en retard, la course paie moins.'
      : `${HUB_NAMES[hub]} · ${a ? 'une livraison à la fois' : none ? 'pas encore de Tiak Tiak ici (Pikine et Plateau)' : 'le colis se récupère au point de départ'}. Choisir un service pose un repère à suivre à pied.`;
    const done = s.data.counters.livraisons ?? 0, hint = firstVentureHint(s);
    this.d.menu();
    this.d.hud.openMenu(fromHere ? 'Tiak Tiak · livraisons' : 'Petits boulots', sub, items, `<div class="kv">Livraisons faites : ${done}. ${esc(polyLine(s))} (paies affichées avec ce bonus).${hint ? '<br>' + esc(hint) : ''}</div><div class="draft">Trajets et clients Tiak Tiak : textes à relire. À pied pour l’instant : pas encore de conduite.</div>`);
  }

  private limitText() {
    const left = remainingMs(this.s);
    return left === Infinity ? '' : left >= 0 ? `Temps restant ${clock(left)}` : 'En retard : la course paiera moins';
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
    if (!cancelJob(this.s)) return false;
    this.unmark();
    this.d.hud.toast('Livraison annulée · aucun paiement'); this.d.save();
    return true;
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
    const r = a ? routeById(a.routeId) : undefined;
    if (a && !r) { cancelJob(s); this.d.save(); }        // a route removed from the design table: drop the run, pay nothing
    const tgt = a && r && w && w.id === a.hub ? this.placeOf(a.stage === 'pickup' ? r.from.frag : r.to.frag) : undefined;
    this.marker.visible = !!tgt && !inside;
    if (!a && this.markedFor) this.unmark();
    if (tgt && `${a!.runId}:${a!.stage}` !== this.markedFor) { this.markedFor = `${a!.runId}:${a!.stage}`; this.d.walkTo(tgt.id); }   // the city's arrow follows the parcel
    if (tgt && w) {
      const col = a!.stage === 'pickup' ? 0x4fd1ff : 0xffc83d;
      this.ringMat.color.setHex(col); this.beamMat.color.setHex(col);
      this.marker.position.set(tgt.x, w.heightAt(tgt.x, tgt.z) + 0.12, tgt.z);
      this.arrow.position.y = 3.2 + Math.sin(this.t * 3) * 0.25; this.arrow.rotation.y = this.t * 1.5;
      const d = Math.hypot(pos.x - tgt.x, pos.z - tgt.z);
      if (playing && !inside && d < ECONOMY.tiak.arriveRadius) {
        if (a!.stage === 'pickup') {
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
    const job = s.data.jobs.active, route = job ? routeById(job.routeId) : undefined;
    if (!job || !route) { this.line.classList.remove('on'); return; }
    const place = job.stage === 'pickup' ? route.from.name : route.to.name;
    const dist = tgt ? `${Math.round(Math.hypot(pos.x - tgt.x, pos.z - tgt.z))} m` : HUB_NAMES[job.hub as HubId];
    const left = remainingMs(s);
    this.line.innerHTML = '';
    const b = document.createElement('b'); b.textContent = `${job.stage === 'pickup' ? 'Colis à récupérer' : 'Livraison'} → ${place}, ${inside ? 'sors d’abord' : dist}`;
    const small = document.createElement('small'); small.textContent = job.stage === 'pickup' ? `  +${fcfa(payNow(s, job.pay))}` : left >= 0 ? `  · ${clock(left)}` : '  · en retard';
    this.line.append(b, small);
    this.line.classList.toggle('late', left < 0);
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
  openShop(fromPhone = false) {
    const s = this.s, home = specOfAsset(currentHome(s)).name;
    const items: MenuItem[] = FURNITURE.map(f => {
      const mine = owns(s, f.id), why = cannotBuy(s, f.id);
      return { label: f.name, detail: mine ? `Chez toi ✓ · ${f.effect}` : why && why !== 'Déjà chez toi' ? `${why} · ${f.effect}` : f.effect, right: mine ? '✓' : fcfa(priceOf(f.id)), disabled: !!why, onPick: () => this.confirmPiece(f.id, fromPhone) };
    });
    const owned = FURNITURE.filter(f => owns(s, f.id));
    const html = `<div class="kv">${owned.length ? 'Dans ta chambre : ' + owned.map(f => esc(f.name)).join(', ') : 'Ta chambre est encore vide.'}<br>${esc(homeGoalLine(s))}</div>
      <div class="draft">Livré chez toi (${esc(home)}). Plus de choix à Keur Meubles, Cité Jàmm. ${esc(LOCAL_NOTE)}</div>`;
    this.d.menu();
    this.d.hud.openMenu(fromPhone ? 'Ma chambre · meubles' : 'Quincaillerie · meubles', `${owned.length}/${FURNITURE.length} meubles · portefeuille ${fcfa(s.wallet)}`, items, html);
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
    this.d.hud.toast(`Achat : ${item.name} ✓  −${fcfa(priceOf(id))} · livré chez toi${piece.at === null ? ' (rangé : pas de place)' : ''}`);
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
  /** A finished city action (main.ts runAction): records its activity and returns its pay scaled by polyvalence (0 if unpaid). */
  work(a: Action, it?: Interactable): number { return workPay(this.s, a.gain ?? 0, activityOf(a, it?.id)); }
  /** What `a` would pay if done now (menus). */
  workPreview(a: Action, it?: Interactable): number { return payPreview(this.s, a.gain ?? 0, activityOf(a, it?.id)); }
  /** Activity framework (src/activity/effects.ts): a category practised, then the pay it brings, scaled by polyvalence. */
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

  /** « Affaires »: owned ventures, income, polyvalence, next prices; picking one asks for confirmation. */
  openBusiness() {
    const s = this.s, m = multiplier(s), value = venturesValue(s), units = unitsOwned(s);
    const items: MenuItem[] = VENTURES.map(v => {
      const n = ownedOf(s, v.id), why = lockedWhy(s, v.id), price = nextPrice(s, v.id), each = Math.round(perHourOf(v.id) * m);
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
        <small>Chaque activité différente pratiquée ces 3 derniers jours de jeu : +20\u202f% sur la paie (livraisons, petits boulots) et sur les revenus des affaires, jusqu’à ×2.${todo.length ? ' À essayer : ' + esc(todo.join(' · ')) + '.' : ''}</small></div>
      <div class="draft">${esc(INCOME_NOTE)} Chaque unité de plus coûte 15\u202f% plus cher. Pour monter d’échelon : des activités variées et une affaire de l’échelon d’avant.</div>`;
    this.d.menu();
    this.d.hud.openMenu('Affaires', `${units ? `${units} affaire${units > 1 ? 's' : ''}` : 'Aucune affaire pour l’instant'} · en poche ${fcfa(s.wallet)}`, items, html);
  }

  private confirmVenture(id: string) {
    const s = this.s, v = VENTURES.find(x => x.id === id); if (!v) return;
    const price = nextPrice(s, id), m = multiplier(s, 'commerce'), each = Math.round(perHourOf(id) * m);   // the purchase itself is commerce
    this.d.menu();
    this.d.hud.openMenu(`Acheter : ${v.name}`, `${v.what}.`, [
      { label: 'Confirmer l’achat', detail: `Rapporte +${fcfa(each)} par heure en ville (polyvalence ${times(m)})`, right: '−' + fcfa(price), disabled: !!cannotBuyVenture(s, id), onPick: () => { this.buyVenture(id); this.openBusiness(); } },
      { label: 'Retour aux affaires', onPick: () => this.openBusiness() },
    ], `<div class="kv">Prix : ${fcfa(price)} · il te restera ${fcfa(Math.max(0, s.wallet - price))}.<br>Tu en as ${ownedOf(s, id)} ; la suivante coûtera ${fcfa(unitPrice(id, ownedOf(s, id) + 1))}.</div>`);
  }

  /** Buy one unit (after confirmation in the menus; directly from debug). */
  buyVenture(id: string): boolean {
    const s = this.s, v = VENTURES.find(x => x.id === id), price = nextPrice(s, id);
    if (!v || !buyVenture(s, id)) { this.d.hud.toast(cannotBuyVenture(s, id) ?? 'Achat impossible'); return false; }
    this.d.hud.toast(`${v.name} ✓  −${fcfa(price)} · +${fcfa(Math.round(perHourOf(id) * multiplier(s)))} par heure`);
    this.d.save();
    return true;
  }

  /** Debug hooks (window.__dakar, ?debug only). */
  debug() {
    const s = this.s;
    return {
      jobs: () => (this.world ? offers(s, this.world.id).map(r => ({ id: r.id, from: r.from.name, to: r.to.name, pay: ECONOMY.tiak.pay[r.id] ?? 0, payNow: payNow(s, routePay(r)), recommended: !!r.needFlag, blocked: whyNot(s, r) })) : []),
      /** What a place's action pays if done now (polyvalence included). */
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

