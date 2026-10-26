import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { Affordance, Target, TargetSource } from '../interact/types';
import type { HubWorld } from '../world/types';
import type { MenuItem } from '../ui/sheet';
import { Humanoid, humanoidReady, type PersonLook } from '../actors/humanoid';
import { hourStamp, recordVisit } from '../social/memory';
import { Relations, PLAYER } from '../social/relations';
import { routePath, type Pt } from '../ui/minimapMath';
import { COMPTOIR, GROSSISTE, type TradePlace } from './tradePlaces';
import {
  BUYBACK, CAPACITY, GOODS, GOOD_IDS, LOTS_PER_DAY, MAX_LOT, PL, PORTER, STAGE, TRUST, buy, buyBack, cancel, demandLeft, fr, load, lotOf, lotsLeft, priceOf, quote, sell, spoiled, trusted,
  whyNotBuy, whyNotLoad, whyNotSell, type GoodId, type Lot, type Mode, type SaleResult,
} from './tradeRules';

/**
 * Plateau · Médina, M2 « Ma première affaire » (docs/districts/M2-PLATEAU-MEDINA.md). Oumar Diallo at his depot in the Médina sells lots of goods; Awa
 * Sall at the Comptoir Sall on the Plateau buys them. Between the two the player carries the lot: on their head, in their vehicle parked in the bay, or with
 * the porters' pousse-pousse, which walks the streets to the Comptoir. The rules (money, stock, the anti-exploit) are src/districts/tradeRules.ts; this module
 * stands the people there, shows the choices and the result, and lets Diallo remember the player.
 */
const DIALLO = { id: 'oumar_diallo', name: 'Oumar Diallo', role: 'grossiste' };
const SALL = { id: 'awa_sall', name: 'Awa Sall', role: 'Comptoir Sall' };
const LOOKS: Record<'diallo' | 'sall' | 'porter', PersonLook> = {
  diallo: { skin: 0x3b2314, style: 'boubou', top: 0x2f5d8a, bottom: 0x2f5d8a, hat: 'kufi', hatColor: 0xf2efe6, shoes: 0x3a2a1c, beard: 0x2c2620, heavy: 0.4 },
  sall: { skin: 0x5b3420, style: 'tee', top: 0x8a2f4e, bottom: 0x2b2f36, hat: 'headwrap', hatColor: 0xd98b1a, shoes: 0x2b2b33 },
  porter: { skin: 0x452a18, style: 'tee', top: 0xd98b1a, bottom: 0x4a4038, hat: null, hatColor: 0, shoes: 0x2a2018 },
};
const LINES = {
  first: 'Bienvenue chez Diallo & Frères. Thé, riz, mangues : tu achètes au prix de gros, tu revends où tu veux. Le Comptoir Sall, au Plateau, prend tout.',
  idle: 'Le riz est arrivé ce matin. Dis-moi ce que tu prends.',
  back: 'Ah, te revoilà ! Alors, le Comptoir Sall t’a bien payé ? Qu’est-ce qu’on charge aujourd’hui ?',
  trust: 'Toi, tu reviens et tu paies comptant : pour toi le sac de riz est à {riz}. Entre commerçants, on se fait confiance.',
  lot: 'Ta marchandise t’attend. Tu la portes, tu la charges, ou je t’appelle le pousse-pousse ?',
  away: 'Ton lot est parti : vends-le au Comptoir Sall. S’il ne te convient plus, je te le reprends à 70 %.',
  sallNone: 'Le Comptoir Sall achète en gros : thé, riz, mangues. Les grossistes de la Médina en ont, chez Diallo par exemple.',
  sallWait: 'Le pousse-pousse n’est pas encore arrivé. Il vient à pied de la Médina.',
};
/** The porter walks this far right of the street's centre line: the kerb strip, beside the cars' lane (m). */
const KERB = 5.2;
/** A vehicle parked in a bay may load or unload within this margin of it (m). */
const BAY_MARGIN = 2.5;

let ctxRef: GameCtx | null = null, here = false;
const people: { diallo: Humanoid | null; sall: Humanoid | null; porter: Humanoid | null } = { diallo: null, sall: null, porter: null };
let headLoad: THREE.Object3D | null = null, cart: THREE.Group | null = null;
let porterPath: { points: Pt[]; length: number } | null = null;
/** Where the player's vehicle was left, and what it is (a motorbike carries one unit, a car four). */
let parked: { x: number; z: number; moto: boolean } | null = null;
const log = { said: [] as string[], sold: [] as SaleResult[], cards: [] as { title: string; rows: string[]; next: string[] }[], bought: 0, recognised: 0 };

/** Close the sheet and give movement back (a pick that ends the exchange). */
const done = (ctx: GameCtx) => { ctx.hud.closeModal(); ctx.setMode('play'); };
const speak = (ctx: GameCtx, who: { name: string; role: string }, line: string) => { ctx.toast(`${who.name} · ${who.role} : « ${line} »`); log.said.push(line); };
const inBay = (p: TradePlace, x: number, z: number) => x > p.bay.x0 - BAY_MARGIN && x < p.bay.x1 + BAY_MARGIN && z > p.bay.z0 - BAY_MARGIN && z < p.bay.z1 + BAY_MARGIN;
const near = (p: TradePlace, x: number, z: number) => Math.hypot(x - p.dock.x, z - p.dock.z) <= p.dock.reach;
/** The units the player's vehicle in this bay can take (0: none there). */
const capAt = (ctx: GameCtx, p: TradePlace) => {
  const s = ctx.player.seated(), pos = ctx.player.pos;
  if (s?.kind === 'vehicle') return inBay(p, pos.x, pos.z) ? (/jakarta|moto/.test(s.space) ? 1 : CAPACITY.car) : 0;
  return parked && inBay(p, parked.x, parked.z) ? (parked.moto ? 1 : CAPACITY.car) : 0;
};
/** The goods are at the Comptoir: on the player's head at its arcade, or in their vehicle in its bay. */
function goodsThere(ctx: GameCtx, l: Lot) {
  const pos = ctx.player.pos;
  if (l.mode === 'hand') return near(COMPTOIR, pos.x, pos.z);
  if (l.mode === 'vehicle') return capAt(ctx, COMPTOIR) > 0;
  return true;
}

// ------------------------------------------------------------------ what the goods look like
function goodsMesh(g: GoodId, n: number): THREE.Group {
  const grp = new THREE.Group();
  const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c });
  const dims: Record<GoodId, [number, number, number, number]> = { the: [0.5, 0.36, 0.42, 0x2f8f4e], riz: [0.9, 0.3, 0.55, 0xece6d4], mangue: [0.56, 0.28, 0.4, 0xa77b4f] };
  const [w, h, d, c] = dims[g], m = mat(c), top = mat(g === 'mangue' ? 0xf2a23a : g === 'riz' ? 0x2f7d4a : 0xc0392b);
  for (let k = 0; k < n; k++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set((k % 2) * (w + 0.04) - (n > 1 ? w / 2 : 0), Math.floor(k / 2) * h + h / 2, 0); grp.add(b);
    const t = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.05, d * 0.9), top); t.position.copy(b.position); t.position.y += h / 2; grp.add(t);
  }
  return grp;
}
function showHeadLoad(ctx: GameCtx) {
  const l = lotOf(ctx.state), body = ctx.player.body();
  const want = here && l && l.stage === STAGE.carried && l.mode === 'hand' && body ? `${l.good}:${l.qty}` : '';
  if ((headLoad?.userData.key ?? '') === want) return;
  if (headLoad) { headLoad.removeFromParent(); headLoad = null; }
  if (!want || !l || !body) return;
  headLoad = goodsMesh(l.good, Math.min(l.qty, 3)); headLoad.userData.key = want; headLoad.position.set(0, 1.84, 0.02); headLoad.scale.setScalar(0.9);
  body.group.add(headLoad);
}

// ------------------------------------------------------------------ the porters' pousse-pousse
function buildCart(l: Lot): THREE.Group {
  const g = new THREE.Group(), wood = new THREE.MeshLambertMaterial({ color: 0x8a6a46 }), tyre = new THREE.MeshLambertMaterial({ color: 0x232323 });
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 2.2), wood); bed.position.y = 0.62; g.add(bed);
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 10), tyre); w.rotation.z = Math.PI / 2; w.position.set(s * 0.66, 0.36, 0.2); g.add(w); }
  const goods = goodsMesh(l.good, Math.min(l.qty, 6)); goods.position.set(0, 0.66, 0.1); goods.scale.setScalar(0.85); g.add(goods);
  return g;
}
/** Where the porter is now: along the streets from the depot to the Comptoir, at walking pace; waiting at the arcade once there. */
function porterPose(l: Lot, playedMs: number): { x: number; z: number; yaw: number; moving: boolean } | null {
  if (!porterPath || porterPath.points.length < 2) return null;
  const total = porterPath.length, gone = Math.max(0, total - Math.max(0, (l.eta - playedMs) / 1000) * PORTER.speed);
  if (gone >= total) { const e = porterPath.points[porterPath.points.length - 1]; return { x: e.x, z: e.z, yaw: -Math.PI / 2, moving: false }; }
  let left = gone;
  for (let i = 1; i < porterPath.points.length; i++) {
    const a = porterPath.points[i - 1], b = porterPath.points[i], seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= seg) {
      // along the kerb on his right, out of the cars' lane (the route is the streets' centre lines); the right of a heading is (−cos, sin)
      const t = seg ? left / seg : 0, yaw = Math.atan2(b.x - a.x, b.z - a.z), off = i === 1 || i === porterPath.points.length - 1 ? 0 : KERB;
      return { x: a.x + (b.x - a.x) * t - Math.cos(yaw) * off, z: a.z + (b.z - a.z) * t + Math.sin(yaw) * off, yaw, moving: true };
    }
    left -= seg;
  }
  return null;
}
function syncPorter(ctx: GameCtx) {
  const l = lotOf(ctx.state), want = here && l?.stage === STAGE.porter;
  if (!want) { if (people.porter) { people.porter.group.removeFromParent(); people.porter.dispose(); people.porter = null; } if (cart) { cart.removeFromParent(); cart = null; } return; }
  if (!people.porter && humanoidReady()) { people.porter = new Humanoid(LOOKS.porter); ctx.extra.add(people.porter.group); cart = buildCart(l!); ctx.extra.add(cart); }
}

// ------------------------------------------------------------------ Diallo's sheets
function talkDiallo(ctx: GameCtx) {
  const d = ctx.state.data, day = ctx.day(), stamp = hourStamp(day, ctx.hour());
  const met = (d.counters[PL.met] ?? 0) > 0, seenToday = d.counters[PL.seen] === day + 1;
  recordVisit(ctx.state, DIALLO.id, stamp);
  if (!met) { d.counters[PL.met] = stamp + 1; new Relations(d).change(PLAYER, DIALLO.id, 2); speak(ctx, DIALLO, LINES.first); }
  else if (!seenToday && (d.counters[PL.trades] ?? 0) > 0) {
    log.recognised++; new Relations(d).change(PLAYER, DIALLO.id, 1);
    speak(ctx, DIALLO, trusted(ctx.state) && !(d.counters[PL.trusted] ?? 0) ? LINES.trust.replace('{riz}', fr(priceOf(ctx.state, 'riz'))) : LINES.back);
    if (trusted(ctx.state)) d.counters[PL.trusted] = 1;
  }
  d.counters[PL.seen] = day + 1;
  ctx.save();
  dialloMenu(ctx);
}
function dialloMenu(ctx: GameCtx) {
  const s = ctx.state, l = lotOf(s), cash = s.data.wallet;
  if (!l) {
    const items: MenuItem[] = GOOD_IDS.map(g => {
      const G = GOODS[g], p = priceOf(s, g);
      const carry = G.hand ? `à la main : ${G.hand} au plus` : 'trop lourd à porter : un véhicule ou le pousse-pousse';
      return { icon: G.icon, label: `${G.name} · ${G.unit}`, right: `${fr(p)}`, detail: `Le Comptoir Sall paie ${fr(G.sell)} · ${carry}${G.perish ? ` · s’abîment en ${G.perish} jours` : ''}`, onPick: () => qtyMenu(ctx, g) };
    });
    const left = lotsLeft(s, ctx.day());
    ctx.menu('Diallo & Frères · grossiste', `Tu as ${fr(cash)} sur toi. ${left > 0 ? `Choisis une marchandise · encore ${left} lot${left > 1 ? 's' : ''} sur ${LOTS_PER_DAY} aujourd’hui.` : 'Diallo t’a servi tes lots du jour : reviens demain.'}`, items);
    return;
  }
  const G = GOODS[l.good], what = `${l.qty} ${l.qty > 1 ? G.units : G.unit} de ${G.name.toLowerCase()}`;
  if (l.stage === STAGE.bought) {
    const cap = capAt(ctx, GROSSISTE), opt = (m: Mode) => whyNotLoad(s, m, cap);
    const items: MenuItem[] = [
      { icon: '🧺', label: 'Porter sur la tête', detail: opt('hand') ?? 'Gratuit · à pied jusqu’au Comptoir Sall', disabled: !!opt('hand'), onPick: () => doLoad(ctx, 'hand') },
      { icon: '🚗', label: 'Charger dans ton véhicule', detail: opt('vehicle') ?? `Garé dans la baie · il en prend ${cap}`, disabled: !!opt('vehicle'), onPick: () => doLoad(ctx, 'vehicle') },
      { icon: '🛒', label: 'Le pousse-pousse', right: `−${fr(PORTER.fee)}`, detail: opt('porter') ?? `Il porte jusqu’à ${PORTER.max} unités au Comptoir, à pied`, disabled: !!opt('porter'), onPick: () => doLoad(ctx, 'porter') },
      { icon: '↩️', label: 'Annuler l’achat', right: `+${fr(l.cost)}`, detail: 'Remboursé entièrement tant que le lot n’est pas parti', onPick: () => { done(ctx); const r = cancel(s); if (r.ok) { ctx.toast(`Achat annulé · ${fr(r.refund)} rendus`); ctx.save(); } } },
    ];
    speak(ctx, DIALLO, LINES.lot);
    ctx.menu(`Lot ${l.seq} · ${what}`, `Payé ${fr(l.cost)}. Comment l’emportes-tu ?`, items);
    return;
  }
  speak(ctx, DIALLO, LINES.away);
  ctx.menu(`Lot ${l.seq} · ${what}`, `Payé ${fr(l.cost)}${l.fee ? ` + transport ${fr(l.fee)}` : ''}.`, [
    { icon: '↩️', label: 'Le revendre à Diallo', right: `+${fr(Math.round(l.cost * BUYBACK))}`, detail: l.stage === STAGE.porter ? 'Le lot est avec le pousse-pousse' : 'À 70 % de ce qu’il a coûté', disabled: l.stage === STAGE.porter, onPick: () => { done(ctx); const r = buyBack(s); if (r.ok) { ctx.toast(`Diallo reprend le lot · +${fr(r.paid)} (perte ${fr(r.lost)})`); ctx.save(); } } },
  ]);
}
function qtyMenu(ctx: GameCtx, g: GoodId) {
  const s = ctx.state, G = GOODS[g], p = priceOf(s, g);
  const items: MenuItem[] = [1, 2, 3, 4, 6, MAX_LOT].filter((q, i, a) => a.indexOf(q) === i).map(q => {
    const why = whyNotBuy(s, g, q, ctx.day()), margin = q * (G.sell - p);
    return { icon: G.icon, label: `${q} ${q > 1 ? G.units : G.unit}`, right: `−${fr(q * p)}`, detail: why ?? `Au Comptoir : ${fr(q * G.sell)} · marge possible +${fr(margin)}${q > G.hand && G.hand ? ' · à charger dans un véhicule ou sur le pousse-pousse' : ''}`,
      disabled: !!why, reason: why ?? undefined, onPick: () => doBuy(ctx, g, q) };
  });
  ctx.menu(`${G.name} · ${G.unit}`, `${fr(p)} l’unité${p < G.buy ? ` (prix d’ami, au lieu de ${fr(G.buy)})` : ''} · tu as ${fr(s.data.wallet)}`, items);
}
function doBuy(ctx: GameCtx, g: GoodId, q: number) {
  const r = buy(ctx.state, g, q, ctx.day());
  if (!r.ok) { ctx.toast(r.why); return; }
  log.bought++;
  ctx.save();
  ctx.toast(`Lot ${r.lot.seq} · ${q} ${q > 1 ? GOODS[g].units : GOODS[g].unit} · −${fr(r.lot.cost)}`);
  dialloMenu(ctx);
}
function doLoad(ctx: GameCtx, m: Mode) {
  done(ctx);
  const metres = porterRoute(ctx)?.length ?? 230;
  const r = load(ctx.state, m, { cap: capAt(ctx, GROSSISTE), playedMs: ctx.state.data.playedMs, metres });
  if (!r.ok) { ctx.toast(r.why); return; }
  ctx.save();
  const where = 'au Comptoir Sall, au Plateau (rue en face de la Banque Teranga)';
  ctx.toast(m === 'hand' ? `Sur la tête · direction ${where}` : m === 'vehicle' ? `Chargé · conduis-le ${where}` : `Le pousse-pousse part · retrouve-le ${where}`);
  showHeadLoad(ctx); syncPorter(ctx);
  ctx.walkTo(COMPTOIR.id);
}
function porterRoute(ctx: GameCtx) {
  const hub = ctx.world(); if (!hub || hub.id !== 'plateau') return null;
  return routePath(hub.edges, { x: GROSSISTE.bay.x1 - 1, z: (GROSSISTE.bay.z0 + GROSSISTE.bay.z1) / 2 }, { x: COMPTOIR.dock.x - 1.6, z: COMPTOIR.dock.z + 3 });
}

// ------------------------------------------------------------------ the Comptoir
function talkSall(ctx: GameCtx) {
  const s = ctx.state, l = lotOf(s), day = ctx.day();
  recordVisit(s, SALL.id, hourStamp(day, ctx.hour()));
  if (!l || l.stage === STAGE.bought) { speak(ctx, SALL, LINES.sallNone); return; }
  const why = whyNotSell(s, day, goodsThere(ctx, l), s.data.playedMs);
  if (why) { if (l.stage === STAGE.porter && /pas encore/.test(why)) speak(ctx, SALL, LINES.sallWait); else ctx.toast(why); return; }
  const q = quote(s, day)!, G = GOODS[l.good];
  const rows = [
    `Je te prends ${q.units} ${q.units > 1 ? G.units : G.unit} à ${fr(q.spoiled ? Math.round(G.sell * 0.3) : G.sell)}${q.spoiled ? ' (abîmées)' : ''} : ${fr(q.revenue)}`,
    q.left ? `Le reste (${q.left}), je n’en ai pas besoin aujourd’hui : reviens demain.` : '',
  ].filter(Boolean).join(' ');
  ctx.menu('Comptoir Sall · gros et demi-gros', rows, [
    { icon: '🤝', label: 'Vendre', right: `+${fr(q.revenue)}`, detail: `Ton lot ${l.seq} t’a coûté ${fr(q.cost + q.fee)} pour ces unités`, onPick: () => doSell(ctx) },
  ]);
}
function doSell(ctx: GameCtx) {
  done(ctx);
  const s = ctx.state, day = ctx.day(), l = lotOf(s);
  if (!l) return;
  const r = sell(s, day, goodsThere(ctx, l), s.data.playedMs);
  if (!r.ok) { ctx.toast(r.why); return; }
  ctx.save();
  log.sold.push(r.r);
  new Relations(s.data).change(PLAYER, SALL.id, 1);
  const G = GOODS[r.r.good], up = r.r.profit >= 0;
  const card = {
    icon: up ? '📈' : '📉', title: `Lot ${r.r.seq} · ${up ? '+' : '−'}${fr(Math.abs(r.r.profit))} de ${up ? 'bénéfice' : 'perte'}`,   // the result in the title: on a phone held upright the card shows its first rows only
    sub: `${r.r.units} ${r.r.units > 1 ? G.units : G.unit} de ${G.name.toLowerCase()} vendus · Diallo & Frères (Médina) → Comptoir Sall (Plateau)`,
    rows: [
      { k: 'Vente', v: `+${fr(r.r.revenue)}`, tone: 'up' },
      { k: 'Achat', v: `−${fr(r.r.cost)}` },
      ...(r.r.fee ? [{ k: 'Transport', v: `−${fr(r.r.fee)}` }] : []),
      { k: 'Bénéfice', v: `${up ? '+' : ''}${fr(r.r.profit)}`, tone: up ? 'up' : 'down', ...(r.r.spoiled ? { note: 'mangues abîmées' } : {}) },
      { k: 'Tes affaires', v: `${s.data.counters[PL.trades] ?? 0} lot${(s.data.counters[PL.trades] ?? 0) > 1 ? 's' : ''} · ${fr(s.data.counters[PL.profit] ?? 0)} de bénéfice` },
    ],
    next: [r.r.left ? `Il te reste ${r.r.left} ${G.units} : Sall les prend demain.` : 'L’argent est à toi : le garder, le placer à la Banque Teranga, ou racheter un lot chez Diallo.'],
  };
  ctx.hud.boutCard(card);
  log.cards.push({ title: card.title, rows: card.rows.map(x => `${x.k}: ${x.v}`), next: card.next });
  showHeadLoad(ctx); syncPorter(ctx);
}

// ------------------------------------------------------------------ targets
const targets: Record<'diallo' | 'sall', Target> = {
  diallo: { id: 'plateau:grossiste:diallo', name: `${DIALLO.name} · grossiste`, kind: 'person', space: 'street', x: GROSSISTE.keeper.x, y: 1.9, z: GROSSISTE.keeper.z, radius: 3.2, bias: 0.4, affordances: () => aff.diallo },
  sall: { id: 'plateau:comptoir:sall', name: `${SALL.name} · Comptoir Sall`, kind: 'person', space: 'street', x: COMPTOIR.keeper.x, y: 1.9, z: COMPTOIR.keeper.z, radius: 3.2, bias: 0.4, affordances: () => aff.sall },
};
const aff: Record<'diallo' | 'sall', Affordance[]> = { diallo: [], sall: [] };
const source = (): TargetSource => ({
  name: 'plateau:trade',
  collect(space, x, z, out) {
    if (!here || space !== 'street' || ctxRef?.player.seated()) return;
    for (const k of ['diallo', 'sall'] as const) if (people[k] && Math.hypot(targets[k].x - x, targets[k].z - z) < 7) out.push(targets[k]);
  },
});

export const tradeModule: GameModule = {
  name: 'trade',
  init(ctx) {
    ctxRef = ctx;
    ctx.interactions.add(source());
    aff.diallo = [{ id: 'parler', verb: 'talk', label: 'Parler à Oumar', icon: '🤝', run: () => talkDiallo(ctx) }];
    aff.sall = [{ id: 'parler', verb: 'talk', label: 'Parler à Awa', icon: '🤝', run: () => talkSall(ctx) }];
  },
  hubLoaded(ctx, hub: HubWorld) {
    for (const k of ['diallo', 'sall', 'porter'] as const) { const h = people[k]; if (h) { h.group.removeFromParent(); h.dispose(); people[k] = null; } }
    if (cart) { cart.removeFromParent(); cart = null; }
    if (headLoad) { headLoad.removeFromParent(); headLoad = null; }
    here = hub.id === 'plateau'; porterPath = null;
    if (!here || !humanoidReady()) return;
    for (const [k, p] of [['diallo', GROSSISTE], ['sall', COMPTOIR]] as const) {
      const h = new Humanoid(LOOKS[k]); h.hold = 'Idle';
      h.group.position.set(p.keeper.x, 0.1, p.keeper.z); h.group.rotation.y = p.keeper.yaw;
      ctx.extra.add(h.group); people[k] = h;
    }
    porterPath = porterRoute(ctx);
  },
  update(ctx, dt) {
    const seat = ctx.player.seated();
    if (seat?.kind === 'vehicle') parked = { x: ctx.player.pos.x, z: ctx.player.pos.z, moto: /jakarta|moto/.test(seat.space) };
    if (!here) return;
    const p = ctx.player.pos;
    for (const k of ['diallo', 'sall'] as const) { const h = people[k]; if (!h) continue; const seen = Math.hypot(p.x - h.group.position.x, p.z - h.group.position.z) < 90; h.group.visible = seen; if (seen) h.animate(dt, 0); }
    showHeadLoad(ctx); syncPorter(ctx);
    const l = lotOf(ctx.state);
    if (people.porter && cart && l) {
      const pose = porterPose(l, ctx.state.data.playedMs);
      if (pose) {
        const fx = Math.sin(pose.yaw), fz = Math.cos(pose.yaw);
        people.porter.group.position.set(pose.x - fx * 0.2, 0.1, pose.z - fz * 0.2); people.porter.group.rotation.y = pose.yaw;
        cart.position.set(pose.x + fx * 1.5, 0.1, pose.z + fz * 1.5); cart.rotation.y = pose.yaw;
        people.porter.hold = pose.moving ? null : 'Idle';
        people.porter.animate(dt, pose.moving ? PORTER.speed : 0);
      }
    }
  },
  debug: ctx => ({
    /** M2's trade: the lot in hand, what the traders said, the sales made, and the save's `pl_` counters (no other field). */
    trade: {
      info: () => ({
        lot: lotOf(ctx.state), wallet: ctx.state.data.wallet, inventory: Object.fromEntries(Object.entries(ctx.state.data.inventory).filter(([k]) => k.startsWith('pl_'))),
        counters: Object.fromEntries(Object.entries(ctx.state.data.counters).filter(([k]) => k.startsWith('pl_'))),
        said: [...log.said], sold: log.sold.map(r => ({ ...r })), cards: log.cards.map(k => ({ ...k })), bought: log.bought, recognised: log.recognised,
        people: { diallo: !!people.diallo, sall: !!people.sall, porter: people.porter ? { x: people.porter.group.position.x, z: people.porter.group.position.z } : null },
        parked, demand: Object.fromEntries(GOOD_IDS.map(g => [g, demandLeft(ctx.state, g, ctx.day())])), spoiled: lotOf(ctx.state) ? spoiled(lotOf(ctx.state)!, ctx.day()) : false,
        ledger: ctx.state.data.ledger.filter(e => /· lot \d+/.test(e.label)).slice(-12),
        trust: { trades: ctx.state.data.counters[PL.trades] ?? 0, needed: TRUST.trades, trusted: trusted(ctx.state) },
        lotsLeft: lotsLeft(ctx.state, ctx.day()),
      }),
      talkDiallo: () => talkDiallo(ctx), talkSall: () => talkSall(ctx),
    },
  }),
};
