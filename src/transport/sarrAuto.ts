import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GameCtx, GameModule } from '../game/modules';
import type { HubWorld, Collider } from '../world/types';
import type { Affordance, Target, TargetSource } from '../interact/types';
import type { ActivitySpec } from '../activity/types';
import type { LoanState } from '../core/types';
import { buildVehicle } from '../actors/vehicleKit';
import { relate, relLevel } from '../venues/venue';
import { Relations } from '../social/relations';
import { fcfa } from '../ui/hud';
import { say } from '../i18n/wolof';
import { C, dealerOffer, nextLoanSeq, openLoan, openLoans, standing } from '../economy/credit';
import { creditClock } from '../economy/creditModule';
import { specOf } from '../economy/catalog';
import { cannotSell } from '../economy/assets';
import { addMissionGuide } from '../game/missionGuide';
import { inBay } from './garage';
import { garage } from './garageModule';
import { SARR_HUB, sarrLot, sarrSales, teranga, PAINTS } from './modelCars';
import { footprint } from './ownedModule';
import { kitCarSpec, sedanSeed } from './car';

/**
 * « Sarr Auto » (fictional), Pikine: a used-car lot on the kerb across the road from Garage Modou, and its owner Pape Sarr — a real person with his hours
 * (8 h – 19 h), his trust (the relationship store, src/social/relations.ts, id `sarr`) and his memory (what the player did for him, their credit with him).
 *
 *   – The lot (this module dresses it; the cars are src/transport/modelCars.ts `teranga`, real floor cars): a tarp over his desk, a hand-painted board,
 *     bunting, a saloon already sold and a Jakarta from the garage next door, on display.
 *   – Errands (« Lui rendre service »), short and physical, each once per city day, paid a little and reported back to him: take a car into Modou's bay,
 *     park a customer's car at the kerb for collection, carry the papers to the bank, wash the car a customer collects. Trust grows with them, less for
 *     each one on the same day (ECONOMY.credit.trust.errands), never from a greeting alone.
 *   – Credit (« Tu me fais crédit ? »): his answer comes from src/economy/credit.ts `dealerOffer` (trust, down payment, the player's record); signed, the very
 *     Teranga chosen becomes the player's for the down payment (src/transport/ownedModule.ts `buyFinanced`) and the debt is recorded against its asset.
 *   – Repayments: to him (« Rembourser ») or from the phone (src/economy/creditModule.ts). Late is remembered, never punished by taking the car.
 */
type ErrandKind = 'garage' | 'client' | 'papers' | 'wash';
interface Errand { kind: ErrandKind; stage: 'go' | 'report'; pay: number; started: number }
const ERRANDS: Record<ErrandKind, { label: string; detail: string; pay: number }> = {
  garage: { label: 'Amener la Teranga grise chez Modou', detail: 'Elle a rendez-vous pour la vidange : gare-la dans la baie du garage, en face', pay: 2500 },
  client: { label: 'Garer la Teranga blanche pour un client', detail: 'Le client passe la prendre : gare-la à la place « client », au bout du parc', pay: 1500 },
  papers: { label: 'Porter le dossier à la banque', detail: 'Un dossier pour le guichet de la banque de Pikine, à pied', pay: 1500 },
  wash: { label: 'Laver la voiture vendue', detail: 'La berline vendue part ce soir : un bon coup d’éponge', pay: 2000 },
};
const ORDER: ErrandKind[] = ['client', 'garage', 'wash', 'papers'];
const day = (ctx: GameCtx) => ctx.day();
const key = { day: 'sarr:errands:day', n: 'sarr:errands:n', done: (k: ErrandKind) => `sarr:errand:${k}`, ask: 'sarr:credit:ask', met: 'sarr_met', count: 'sarr:errands:total' };

class SarrAuto implements GameModule, TargetSource {
  readonly name = 'sarr-auto';
  private ctx!: GameCtx;
  private hub: HubWorld | null = null;
  private group: THREE.Group | null = null;
  private cols: Collider[] = [];
  private disposables: { dispose(): void }[] = [];
  private errand: Errand | null = null;
  private targets: Target[] = [];
  private log = { errands: [] as string[], offers: [] as string[], repaid: 0 };

  init(ctx: GameCtx) {
    this.ctx = ctx; ctx.interactions.add(this);
    sarrSales.cfg.talkExtra = c => this.talkItems(c);
    sarrSales.cfg.talkIntro = (c, trial) => this.intro(c, trial);
    sarrSales.cfg.onGreet = c => { if (!c.state.data.flags.includes(key.met)) { c.state.data.flags.push(key.met); relate(c, 'sarr', C.trust.firstVisit); } };
    addMissionGuide(() => this.guide());
  }
  hubLoaded(ctx: GameCtx, hub: HubWorld) {
    this.ctx = ctx; this.clear(); this.hub = hub;
    if (this.errand?.stage === 'go' && (this.errand.kind === 'garage' || this.errand.kind === 'client')) this.dropErrand(false);   // the lent car stayed in the district left
    if (hub.id !== SARR_HUB) return;
    this.dress(ctx, hub);
  }

  // ---------------------------------------------------------------- the lot
  private dress(ctx: GameCtx, hub: HubWorld) {
    const L = sarrLot(), g = new THREE.Group(); g.name = 'sarr-auto';
    // every box of the lot carries its colour in its vertices and they are merged at the end: one draw call for all of them
    const parts: THREE.BufferGeometry[] = [];
    const mat = (c: number) => new THREE.Color(c);
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Color, ry = 0, rz = 0) => {
      const geo = new THREE.BoxGeometry(w, h, d); if (rz) geo.rotateZ(rz); if (ry) geo.rotateY(ry); geo.translate(x, y, z);
      const n = geo.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = m.r; col[i * 3 + 1] = m.g; col[i * 3 + 2] = m.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(geo);
    };
    const solid = (x: number, z: number, hx: number, hz: number, h: number) => { const c = { x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz, h }; this.cols.push(c); hub.colliders.push(c); };
    const f = { x: Math.sin(L.delivery.yaw), z: Math.cos(L.delivery.yaw) };                   // along the kerb
    const n = { x: L.counter.x - L.delivery.x - f.x * ((L.counter.x - L.delivery.x) * f.x + (L.counter.z - L.delivery.z) * f.z), z: 0 };
    n.z = L.counter.z - L.delivery.z - f.z * ((L.counter.x - L.delivery.x) * f.x + (L.counter.z - L.delivery.z) * f.z);
    const nl = Math.hypot(n.x, n.z) || 1; n.x /= nl; n.z /= nl;                                      // toward the houses
    const at = (along: number, lat: number) => ({ x: L.counter.x + f.x * along + n.x * (lat - 6.2), z: L.counter.z + f.z * along + n.z * (lat - 6.2) });
    const yaw = Math.atan2(f.x, f.z);
    // the pavement of the lot: packed red earth with a white kerb line, under the tarp and along the cars
    const earth = mat(0xa86b45), white = mat(0xf1ece0), blue = mat(0x2f6fa8), wood = mat(0x7a5233), steel = mat(0x4a4d52), red = mat(0xc4322c);
    { const c = at(1.5, 6.6); box(32, 0.025, 2.4, c.x, 0.13, c.z, earth, yaw + Math.PI / 2); }
    { const c = at(1.5, 5.3); box(32, 0.03, 0.12, c.x, 0.14, c.z, white, yaw + Math.PI / 2); }
    // the tarp over the desk: four poles, a blue sheet sloping toward the road
    const tc = at(0, 7.0);
    for (const [a, l] of [[-1.6, 5.6], [1.6, 5.6], [-1.6, 8.2], [1.6, 8.2]] as const) { const p = at(a, l); box(0.07, l < 6 ? 2.35 : 2.75, 0.07, p.x, 0.12 + (l < 6 ? 1.17 : 1.37), p.z, steel); solid(p.x, p.z, 0.08, 0.08, 2.5); }
    box(3.6, 0.04, 2.9, tc.x, 2.62, tc.z, blue, yaw + Math.PI / 2, 0.14);
    // the desk and two red plastic chairs
    if (L.desk) {
      box(1.4, 0.75, 0.7, L.desk.x, 0.5, L.desk.z, wood, L.desk.yaw); solid(L.desk.x, L.desk.z, 0.6, 0.6, 0.9);
      for (const a of [-0.55, 0.55]) { const p = at(a, 6.0); box(0.42, 0.42, 0.42, p.x, 0.33, p.z, red, yaw); const b = at(a, 5.82); box(0.42, 0.45, 0.06, b.x, 0.75, b.z, red, yaw); }
      box(0.3, 0.02, 0.22, L.desk.x, 0.89, L.desk.z, white, L.desk.yaw + 0.3);
    }
    // the board: hand-painted, on two posts facing the road
    { const s = at(-12.6, 7.4), tex = boardTexture(); this.disposables.push(tex);
      for (const a of [-1.45, 1.45]) { const p = at(-12.6 + a, 7.4); box(0.1, 3.1, 0.1, p.x, 0.12 + 1.55, p.z, wood); solid(p.x, p.z, 0.08, 0.08, 3); }
      const face = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.4), new THREE.MeshLambertMaterial({ map: tex })); this.disposables.push(face.geometry, face.material as THREE.Material);
      face.position.set(s.x - n.x * 0.06, 2.45, s.z - n.z * 0.06); face.rotation.y = Math.atan2(-n.x, -n.z); g.add(face);
      box(3.3, 1.5, 0.05, s.x, 2.45, s.z, white, Math.atan2(-n.x, -n.z)); }
    // bunting along the lot, pole to pole, in the colours of the board
    { const cols = [0xe23b2e, 0xf2c94c, 0x2f6fa8, 0x2e8b57, 0xf1ece0], tri = new THREE.BufferGeometry(), pos: number[] = [], colr: number[] = [];
      const a0 = -14, a1 = 21, poles = [a0, 3.5, a1];
      for (const a of poles) { const p = at(a, 7.9); box(0.06, 3.4, 0.06, p.x, 0.12 + 1.7, p.z, steel); }
      for (let i = 0; i < 46; i++) {
        const a = a0 + ((a1 - a0) * i) / 46, sag = 0.35 * Math.sin(((a - a0) / (a1 - a0)) * Math.PI * 2) ** 2, p0 = at(a, 7.9), p1 = at(a + 0.42, 7.9), pm = at(a + 0.21, 7.9), y = 3.35 - sag;
        pos.push(p0.x, y, p0.z, p1.x, y, p1.z, pm.x, y - 0.32, pm.z);
        const c = new THREE.Color(cols[i % cols.length]); for (let k = 0; k < 3; k++) colr.push(c.r, c.g, c.b);
      }
      tri.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tri.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); tri.computeVertexNormals();
      const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }); this.disposables.push(tri, m); g.add(new THREE.Mesh(tri, m)); }
    // on display, not for sale here: a saloon already sold, a Jakarta of Modou's
    { const s = L.slots[2], v = buildVehicle('sedan', { seed: sedanSeed(0x5d4a3a) || 7, driver: false, passengers: false }).group; v.position.set(s.x, 0.12, s.z); v.rotation.y = s.yaw; g.add(v);
      const drive = kitCarSpec({ id: 'sarr-sold', name: 'Vendue', kind: 'sedan', seed: 7, drive: { maxSpeed: 1, reverseSpeed: 1, accel: 1, brake: 1, turnRadius: 5, steer: 1 } }).drive!;
      for (const c of footprint(drive, s.x, s.z, s.yaw, 1.45)) { this.cols.push(c); hub.colliders.push(c); }
      const card = soldCard(); this.disposables.push(card); const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshBasicMaterial({ map: card })); this.disposables.push(pl.geometry, pl.material as THREE.Material);
      pl.position.set(s.x + Math.sin(s.yaw) * 0.9, 1.25, s.z + Math.cos(s.yaw) * 0.9); pl.rotation.y = s.yaw; pl.rotateX(-0.5); g.add(pl); this.wash = { x: s.x, z: s.z, yaw: s.yaw }; }
    { const s = L.slots[3], v = buildVehicle('moto', { seed: 3, driver: false, passengers: false }).group; v.position.set(s.x, 0.12, s.z); v.rotation.y = s.yaw; g.add(v); solid(s.x, s.z, 1.0, 1.0, 1.2); }
    { const merged = mergeGeometries(parts, false); for (const x of parts) x.dispose(); if (merged) { const m = new THREE.MeshLambertMaterial({ vertexColors: true }); this.disposables.push(merged, m); const mesh = new THREE.Mesh(merged, m); mesh.castShadow = true; g.add(mesh); } }
    ctx.extra.add(g); this.group = g;
  }
  /** The saloon sold (the wash errand's car). */
  private wash: { x: number; z: number; yaw: number } | null = null;

  private clear() {
    if (this.group) { this.group.removeFromParent(); this.group = null; }
    for (const d of this.disposables) d.dispose(); this.disposables = [];
    const cs = this.hub?.colliders; if (cs) for (const c of this.cols) { const i = cs.indexOf(c); if (i >= 0) cs.splice(i, 1); }
    this.cols = []; this.hub = null; this.wash = null;
  }

  // ---------------------------------------------------------------- the relationship
  trust(ctx = this.ctx) { return relLevel(ctx, 'sarr'); }
  private loans() { return this.ctx.state.data.loans.list; }
  private intro(ctx: GameCtx, trial: boolean): string {
    const t = this.trust(ctx), l = openLoans(this.loans(), 'sarr')[0];
    if (l) { const st = standing(l, day(ctx)); if (st.late > 0) return `Tu as ${fcfa(st.late)} de retard sur la Teranga. Je ne t’en veux pas, mais pense à moi.`; return `Alors, elle roule bien, la Teranga ? Il te reste ${fcfa(st.left)} à me rendre.`; }
    if (this.errand?.stage === 'report') return 'Alors, c’est fait ?';
    if (trial) return `Alors, elle te plaît ? Le prix est affiché. Et si tu n’as pas tout, on peut parler.`;
    const label = Relations.label(t);
    return t >= 45 ? `${say('Kaay fi')}, mon ami ! Toujours un plaisir. (${label} · confiance ${t})`
      : t >= 15 ? `Te revoilà ! Tu as un peu de temps pour moi ? (${label} · confiance ${t})`
      : `${say('Dalal ak jàmm')} chez Sarr Auto. On ne se connaît pas encore. (${label} · confiance ${t})`;
  }
  private talkItems(ctx: GameCtx): Parameters<GameCtx['menu']>[2] {
    const close = () => { ctx.hud.closeModal(); ctx.setMode('play'); };
    const items: Parameters<GameCtx['menu']>[2] = [];
    const e = this.errand;
    if (e?.stage === 'report') items.push({ icon: '✅', label: 'C’est fait', detail: `${ERRANDS[e.kind].label} · il te paie et s’en souvient`, right: fcfa(e.pay), onPick: () => { close(); this.report(); } });
    else items.push({ icon: '🤝', label: 'Lui rendre service', detail: e ? `En cours : ${ERRANDS[e.kind].label}` : 'De petites courses pour le parc, payées', onPick: () => this.errandMenu() });
    const loan = openLoans(this.loans(), 'sarr')[0];
    if (loan) items.push({ icon: '💵', label: 'Rembourser', detail: loan.label, right: fcfa(loan.principal - loan.paid), onPick: () => this.repayMenu(loan) });
    else items.push({ icon: '📝', label: 'Demander un crédit', detail: 'Pour une Teranga du parc · il décide selon la confiance', onPick: () => this.creditMenu() });
    return items;
  }

  // ---------------------------------------------------------------- errands
  private doneToday(k: ErrandKind) { return this.ctx.state.data.counters[key.done(k)] === day(this.ctx); }
  private errandMenu() {
    const ctx = this.ctx, close = () => { ctx.hud.closeModal(); ctx.setMode('play'); };
    if (this.errand) {
      ctx.menu('Sarr Auto · course en cours', ERRANDS[this.errand.kind].detail, [
        { icon: '↩️', label: 'Abandonner cette course', detail: 'Rien n’est payé, et il s’en souviendra un peu', onPick: () => { close(); this.dropErrand(true); } },
        { icon: '👍', label: 'Je m’en occupe', onPick: close },
      ]);
      return;
    }
    ctx.menu('Pape Sarr · un service', `${say('Na nga def ?')} Tu peux m’aider ? Chaque course une fois par jour, payée à ton retour.`, [
      ...ORDER.map(k => ({ icon: k === 'papers' ? '📄' : k === 'wash' ? '🧽' : '🔑', label: ERRANDS[k].label, detail: this.doneToday(k) ? 'Déjà fait aujourd’hui : reviens demain' : this.canStart(k) ? ERRANDS[k].detail : this.notNow(k), right: fcfa(ERRANDS[k].pay), disabled: this.doneToday(k) || !this.canStart(k), reason: this.canStart(k) ? undefined : this.notNow(k), onPick: () => { close(); this.start(k); } })),
      { icon: '↩️', label: 'Pas maintenant', onPick: close },
    ]);
  }
  /** Why an errand cannot start now (the menu says it). */
  private notNow(k: ErrandKind) {
    if (!sarrSales.open(this.ctx)) return 'Le parc est fermé';
    if ((k === 'garage' || k === 'client') && teranga.carOut) return 'Un de ses gars ramène d’abord l’autre voiture au parc';
    return 'Pas possible maintenant';
  }
  private canStart(k: ErrandKind) {
    if (!sarrSales.open(this.ctx)) return false;
    if ((k === 'garage' || k === 'client') && teranga.carOut) return false;          // one of the lot's cars still out (parked where the last errand left it)
    if (k === 'garage') return teranga.floorCars().some(c => c.slot === 1 && c.state === 'display') && !!garage.bayNow();
    if (k === 'client') return teranga.floorCars().some(c => c.slot === 0 && c.state === 'display');
    if (k === 'wash') return !!this.wash;
    return !!this.bank();
  }
  private bank() { return this.ctx.world()?.interactables.find(i => i.id === 'pikine:city:bank') ?? null; }
  start(k: ErrandKind) {
    const ctx = this.ctx; if (this.errand || this.doneToday(k) || !this.canStart(k)) return false;
    if (k === 'garage' || k === 'client') {
      const slot = k === 'garage' ? 1 : 0, L = sarrLot();
      const ok = teranga.lendFloor(slot, p => {
        if (k === 'garage') { const bay = garage.bayNow(); if (!bay || !inBay(bay, p)) return false; }
        else { const d = L.delivery, dy = Math.abs(Math.atan2(Math.sin(p.yaw - d.yaw), Math.cos(p.yaw - d.yaw))); if (Math.hypot(p.x - d.x, p.z - d.z) > 2.6 || (dy > 0.5 && dy < Math.PI - 0.5)) return false; }
        if (this.errand) { this.errand.stage = 'report'; ctx.toast(k === 'garage' ? 'Lamine prend les clés : « Merci, je préviens Sarr. » Retourne voir Pape Sarr.' : 'Garée à la place client. Retourne voir Pape Sarr.'); }
        return true;
      });
      if (!ok) { ctx.toast('La voiture n’est pas disponible maintenant.'); return false; }
      ctx.toast(`Pape Sarr te tend les clés : « ${k === 'garage' ? 'Doucement, hein. Dans la baie de Modou, en face.' : 'La place client, au bout du parc. Bien droite !'} »`);
    } else if (k === 'papers') ctx.toast('Pape Sarr te tend une enveloppe : « Pour le guichet de la banque. Merci ! »');
    else ctx.toast('Pape Sarr te tend un seau : « La berline vendue, là. Qu’elle brille ! »');
    this.errand = { kind: k, stage: 'go', pay: ERRANDS[k].pay, started: ctx.state.data.playedMs };
    this.log.errands.push(`start:${k}`);
    return true;
  }
  private dropErrand(say: boolean) {
    const e = this.errand; if (!e) return;
    if (e.kind === 'garage' || e.kind === 'client') teranga.endErrand();
    this.errand = null;
    if (say) { relate(this.ctx, 'sarr', -1); this.ctx.toast('Pape Sarr : « Pas grave, une autre fois. »'); }
    this.log.errands.push(`drop:${e.kind}`);
  }
  /** Back at Pape Sarr: paid, and trusted a little more (less for each errand of the same day). */
  report() {
    const ctx = this.ctx, e = this.errand; if (!e || e.stage !== 'report') return false;
    const d = day(ctx), c = ctx.state.data.counters;
    if (c[key.day] !== d) { c[key.day] = d; c[key.n] = 0; }
    const n = c[key.n] ?? 0, gain = C.trust.errands[n] ?? 0;
    c[key.n] = n + 1; c[key.done(e.kind)] = d; ctx.state.count(key.count);
    ctx.state.addMoney(e.pay, `Course pour Sarr Auto : ${ERRANDS[e.kind].label}`);
    if (gain) relate(ctx, 'sarr', gain);
    this.errand = null; this.log.errands.push(`done:${e.kind}`);
    ctx.toast(`Pape Sarr : « ${say('Jërëjëf')} ! » +${fcfa(e.pay)}${gain ? ' · il te fait un peu plus confiance' : ''}`);
    ctx.save();
    return true;
  }

  // the errands' places: the bank's counter (papers), the sold saloon (wash)
  collect(space: string, x: number, z: number, out: Target[]) {
    const e = this.errand; if (!e || e.stage !== 'go' || space !== 'street' || this.ctx.world()?.id !== SARR_HUB) return;
    if (e.kind === 'papers') { const b = this.bank(); if (b && Math.hypot(b.x - x, b.z - z) < 6) out.push(this.target('papers', b.x, b.z, 'Guichet de la banque', 'Remettre le dossier de Pape Sarr', () => this.papers())); }
    if (e.kind === 'wash' && this.wash && Math.hypot(this.wash.x - x, this.wash.z - z) < 4.5) out.push(this.target('wash', this.wash.x, this.wash.z, 'La berline vendue', 'Laver la voiture', () => this.washCar()));
  }
  private target(id: string, x: number, z: number, name: string, label: string, run: () => void): Target {
    let t = this.targets.find(t => t.id === `sarr:${id}`);
    if (!t) { const aff: Affordance[] = [{ id, verb: 'use', label, icon: id === 'wash' ? '🧽' : '📄', run }]; t = { id: `sarr:${id}`, name, kind: 'spot', space: 'street', x, z, y: 1.2, radius: 3, bias: -1, affordances: () => aff }; this.targets.push(t); }
    t.x = x; t.z = z; return t;
  }
  private papers() {
    const e = this.errand; if (e?.kind !== 'papers' || e.stage !== 'go') return;
    e.stage = 'report'; this.ctx.toast('Le guichetier prend l’enveloppe : « Bien reçu. Saluez M. Sarr. » Retourne voir Pape Sarr.');
  }
  private washCar() {
    const e = this.errand, w = this.wash; if (e?.kind !== 'wash' || e.stage !== 'go' || !w) return;
    const spec: ActivitySpec = { id: 'sarr:wash', primitive: 'work', label: 'Laver la voiture', icon: '🧽', quiet: true,
      steps: [{ label: 'Eau savonneuse sur la carrosserie…', primitive: 'work', seconds: 5 }, { label: 'Rinçage, les vitres, les jantes…', primitive: 'work', seconds: 5, then: () => { if (this.errand === e) { e.stage = 'report'; this.ctx.toast('Elle brille. Retourne voir Pape Sarr.'); } } }] };
    this.ctx.activities.start(spec, { place: 'Sarr Auto', at: { x: w.x + Math.cos(w.yaw) * 1.4, z: w.z - Math.sin(w.yaw) * 1.4 } });
  }
  /** Where the errand in hand leads (the way-finding pin and the goal line). */
  private guide() {
    const e = this.errand; if (!e) return null;
    if (e.stage === 'report') { const L = sarrLot(); return { name: 'Pape Sarr · Sarr Auto', hub: SARR_HUB, x: L.counter.x, z: L.counter.z, hint: '🤝 Retourne voir Pape Sarr : c’est fait' }; }
    if (e.kind === 'garage') { const b = garage.bayNow(); return b ? { name: 'Baie du Garage Modou', hub: SARR_HUB, x: b.x, z: b.z, hint: teranga.onErrand ? undefined : '🔑 Prends la Teranga grise (les clés de Pape Sarr) et gare-la dans la baie de Modou' } : null; }
    if (e.kind === 'client') { const d = sarrLot().delivery; return { name: 'Place client · Sarr Auto', hub: SARR_HUB, x: d.x, z: d.z }; }
    if (e.kind === 'papers') { const b = this.bank(); return b ? { name: 'Banque · guichet', hub: SARR_HUB, x: b.x, z: b.z } : null; }
    return this.wash ? { name: 'La berline vendue', hub: SARR_HUB, x: this.wash.x, z: this.wash.z } : null;
  }

  // ---------------------------------------------------------------- credit
  private creditMenu() {
    const ctx = this.ctx, close = () => { ctx.hud.closeModal(); ctx.setMode('play'); };
    const cars = teranga.floorCars().filter(c => c.state !== 'out' || teranga.trialCar()?.slot === c.slot), price = specOf('teranga')?.price ?? 0;
    if (ctx.state.data.counters[key.ask] === day(ctx) + 0.5) { ctx.toast('Pape Sarr : « Je t’ai répondu aujourd’hui. Reviens demain. »'); return; }
    const o = dealerOffer({ trust: this.trust(), price, wallet: ctx.state.wallet, loans: this.loans() });
    this.log.offers.push(`${o.verdict}:${this.trust()}:${o.down}`);
    if (o.verdict === 'refuse') {
      ctx.state.data.counters[key.ask] = day(ctx) + 0.5;                     // one answer a day: asking again and again (or reloading) changes nothing
      ctx.menu('Pape Sarr · crédit', `« ${o.line} »`, [{ icon: '↩️', label: 'D’accord', onPick: close }]);
      return;
    }
    const sched = `${o.installments} × ${fcfa(o.installment)}, tous les ${o.every} jours`;
    ctx.menu('Pape Sarr · crédit pour une Teranga', `« ${o.line} » · Prix ${fcfa(price)} · Avance ${fcfa(o.down)} · puis ${sched}`, [
      ...cars.map(c => ({ icon: '🚗', label: `Signer · Teranga ${c.colour}`, detail: o.verdict === 'accept' ? `Avance ${fcfa(o.down)} maintenant · cette voiture-là, tu repars avec` : `Il faut ${fcfa(o.down)} d’avance (tu as ${fcfa(ctx.state.wallet)})`, right: '−' + fcfa(o.down), disabled: o.verdict !== 'accept' || !!c.locked, reason: c.locked ?? undefined, onPick: () => { close(); this.sign(c.slot, o.down, o.installment, o.every, o.principal, c.colour); } })),
      { icon: '↩️', label: 'Pas maintenant', onPick: close },
    ]);
  }
  /** Signed: the car chosen is the player's for the down payment, the debt recorded against it (one credit at a time: checked again here). */
  sign(slot: number, down: number, installment: number, every: number, principal: number, colour: string) {
    const ctx = this.ctx, d = day(ctx);
    if (openLoans(this.loans(), 'sarr').length) return false;
    const fresh = dealerOffer({ trust: this.trust(), price: specOf('teranga')?.price ?? 0, wallet: ctx.state.wallet, loans: this.loans() });
    if (fresh.verdict !== 'accept' || fresh.down !== down) { ctx.toast('Pape Sarr : « Ce n’est plus possible aujourd’hui. »'); return false; }
    const ok = teranga.buyFinanced(slot, down, 'Sarr Auto', a => {
      openLoan(this.loans(), nextLoanSeq(ctx.state), { lender: 'sarr', kind: 'vehicle', label: `Teranga ${colour} · crédit Sarr Auto`, principal, installment, every, day: d, asset: a.uid, spec: 'teranga' });
    });
    if (ok) { relate(ctx, 'sarr', 3); ctx.toast(`Pape Sarr te donne les clés : « Elle est à toi. Rembourse-moi ${fcfa(installment)} tous les ${every} jours, avec tes courses. ${say('Jërëjëf')} ! »`); ctx.save(); }
    return ok;
  }
  repayMenu(l: LoanState) { creditClock.repayMenu(this.ctx, l); }
  pay(l: LoanState, amount: number) { const t = creditClock.pay(this.ctx, l, amount); if (t) this.log.repaid += t; return t; }

  debug(): Record<string, unknown> {
    return {
      sarr: {
        info: () => ({ trust: this.trust(), errand: this.errand ? { ...this.errand } : null, lot: sarrLot(), loans: this.loans().map(l => ({ ...l })), log: { ...this.log, errands: [...this.log.errands], offers: [...this.log.offers] }, open: sarrSales.open(this.ctx), wash: this.wash }),
        start: (k: ErrandKind) => this.start(k), report: () => this.report(), papers: () => this.papers(), washDone: () => { if (this.errand?.kind === 'wash') this.errand.stage = 'report'; },
        offer: () => dealerOffer({ trust: this.trust(), price: specOf('teranga')?.price ?? 0, wallet: this.ctx.state.wallet, loans: this.loans() }),
        sign: (slot: number) => { const o = dealerOffer({ trust: this.trust(), price: specOf('teranga')?.price ?? 0, wallet: this.ctx.state.wallet, loans: this.loans() }); return o.verdict === 'accept' ? this.sign(slot, o.down, o.installment, o.every, o.principal, PAINTS.teranga[slot]?.name ?? '') : o; },
        pay: (amount: number) => { const l = openLoans(this.loans(), 'sarr')[0]; return l ? this.pay(l, amount) : 0; },
        /** Checks: why the financed car cannot be sold now (null: it can). */
        whyNotSell: () => { const a = this.ctx.state.data.assets.list.find(x => x.spec === 'teranga'); return a ? cannotSell(this.ctx.state, a.uid) : 'none'; },
      },
    };
  }
}

function boardTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 640; c.height = 280;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f3ead2'; g.fillRect(0, 0, 640, 280);
  g.fillStyle = '#2f5f86'; g.fillRect(0, 0, 640, 26); g.fillRect(0, 254, 640, 26);
  g.fillStyle = '#c4322c'; g.font = 'bold 92px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.fillText('SARR AUTO', 320, 122);
  g.fillStyle = '#1f2b38'; g.font = 'bold 38px "Trebuchet MS", sans-serif'; g.fillText('VOITURES D’OCCASION', 320, 178);
  g.fillStyle = '#2e7d4f'; g.font = 'bold 34px "Trebuchet MS", sans-serif'; g.fillText('ACHAT · VENTE · CRÉDIT POSSIBLE', 320, 228);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function soldCard(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d')!; g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 128); g.strokeStyle = '#c4322c'; g.lineWidth = 8; g.strokeRect(6, 6, 244, 116);
  g.fillStyle = '#c4322c'; g.font = 'bold 64px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.fillText('VENDUE', 128, 86);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export const sarrAuto = new SarrAuto();
