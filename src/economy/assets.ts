import type { GameState } from '../core/state';
import type { AssetState } from '../core/types';
import { STARTER_HOME } from '../core/save';
import { CITY_DAY_MS } from '../core/clock';
import { ECONOMY } from './config';
import { specOf, homeSpec, furnitureSpec, VENTURES, type AssetKind, type AssetSpec, type HomeSpec } from './catalog';
import { multiplier, practise } from './polyvalence';
import { autoPlace, layoutOf, type Placed } from './placement';

/**
 * One generic ownership model (docs/LIVING_DAKAR.md, « one property model for every property »): homes, land,
 * billboards, ventures, furniture — vehicles and aircraft later — are assets of the catalogue (src/economy/catalog.ts)
 * held in the save (`data.assets`). Pure logic, unit-tested; the world, the sheets and the phone are in estate.ts.
 *
 * - Buy at the listed price, or rent a home per in-game day. No approval, no paperwork, no waiting: the game's rule.
 * - Income and charges accrue per in-game hour of PLAY (1 city hour = 1 real minute), counted on `playedMs` only:
 *   nothing offline, the device clock changes nothing, at most a city day is counted at once. They are settled each
 *   in-game hour in one batch (one ledger line for the income, one for the charges).
 * - Ventures produce (× polyvalence, + the ad boost); land, billboards and homes bring rent once let; rented homes cost
 *   their rent, big homes their upkeep. Unpaid rent piles up; after three days of it the landlord takes the keys back.
 * - Selling pays most of the current value at once. Wear (billboards) lowers rent and value; a repair restores it.
 */
export const HOUR_MS = CITY_DAY_MS / 24;
export const DAY_MS = CITY_DAY_MS;
const P = ECONOMY.property;

/** Bumped on every change of the assets, so the world and the menus know when to refresh (not saved). */
let rev = 0;
export const assetsRevision = () => rev;
const bump = () => { rev++; };

// ------------------------------------------------------------------ reading
/** Assets of known catalogue entries (a save may hold ids a newer catalogue removed: they are ignored). */
export function assetsOf(s: GameState, kind?: AssetKind): AssetState[] {
  return s.data.assets.list.filter(a => { const sp = specOf(a.spec); return !!sp && (!kind || sp.kind === kind); });
}
/** Units owned per catalogue id (ventures: several of each), cached until the assets change. */
let counts: { rev: number; list: AssetState[]; by: Map<string, number> } | null = null;
export function ownedCount(s: GameState, specId: string): number {
  const list = s.data.assets.list;
  if (!counts || counts.rev !== rev || counts.list !== list) {
    const by = new Map<string, number>();
    for (const a of list) if (a.how === 'owned') by.set(a.spec, (by.get(a.spec) ?? 0) + 1);
    counts = { rev, list, by };
  }
  return counts.by.get(specId) ?? 0;
}
export const assetByUid = (s: GameState, uid: string | null | undefined) => (uid ? s.data.assets.list.find(a => a.uid === uid) : undefined);
export const specOfAsset = (a: AssetState) => specOf(a.spec)!;
/** The asset held for this catalogue entry (homes, land, billboards: one each), if any. */
export const holding = (s: GameState, specId: string) => s.data.assets.list.find(a => a.spec === specId && !a.home);
export const holds = (s: GameState, specId: string) => !!holding(s, specId);
/** The home the player lives in (the starter room when nothing else). */
export function currentHome(s: GameState): AssetState {
  const st = s.data.assets;
  const h = assetByUid(s, st.home);
  if (h && homeSpec(h.spec)) return h;
  const starter = st.list.find(a => a.spec === STARTER_HOME)!;
  st.home = starter.uid;
  return starter;
}
/** Furniture of a home (placed or stored). */
export const furnitureIn = (s: GameState, homeUid: string) => s.data.assets.list.filter(a => a.home === homeUid && !!furnitureSpec(a.spec));
/** Placed pieces of a home, for the placement checks. */
export const placedIn = (s: GameState, homeUid: string, except?: string): Placed[] =>
  furnitureIn(s, homeUid).filter(a => a.at && a.uid !== except && !furnitureSpec(a.spec)!.fixed).map(a => ({ uid: a.uid, spec: furnitureSpec(a.spec)!, at: a.at! }));

const label = (sp: AssetSpec) => sp.name;
function addAsset(s: GameState, spec: string, how: AssetState['how'], paid: number, extra: Partial<AssetState> = {}): AssetState {
  const st = s.data.assets;
  const a: AssetState = { uid: 'a' + ++st.seq, spec, how, since: s.data.playedMs, paid, condition: 100, upgrades: [], leased: false, ...extra };
  st.list.push(a); bump();
  return a;
}
function removeAsset(s: GameState, uid: string) { const st = s.data.assets; st.list = st.list.filter(a => a.uid !== uid); bump(); }

// ------------------------------------------------------------------ value, income, charges
const condFactor = (a: AssetState, floor: number) => floor + (1 - floor) * (a.condition / 100);
const upgradeCost = (sp: AssetSpec, a: AssetState) => a.upgrades.reduce((t, u) => t + (sp.upgrades?.find(x => x.id === u)?.price ?? 0), 0);
/** What an asset is worth now (net worth): owned property by its price, upgrades and condition; furniture at resale. */
export function valueOf(a: AssetState): number {
  const sp = specOf(a.spec); if (!sp || a.how !== 'owned') return 0;
  if (sp.kind === 'furniture') return Math.round((a.paid || sp.price || 0) * P.furnitureResale);
  if (sp.kind === 'business') return a.paid || sp.price || 0;
  return Math.round(((sp.price ?? 0) + upgradeCost(sp, a)) * condFactor(a, P.valueFloor));
}
/** Paid at once when selling. */
export const saleValue = (a: AssetState) => { const sp = specOf(a.spec); return sp?.kind === 'furniture' ? valueOf(a) : Math.round(valueOf(a) * P.saleShare); };
export const assetsValue = (s: GameState) => s.data.assets.list.reduce((t, a) => t + valueOf(a), 0);
export const netWorth = (s: GameState) => s.wallet + assetsValue(s);

/** Ad running for the player's ventures: own billboard showing their ad, or ad space rented on one. */
export const adRunning = (s: GameState) => s.data.assets.adUntil > s.data.playedMs || s.data.assets.list.some(a => a.ownAd && specOf(a.spec)?.kind === 'billboard');
const rentMult = (sp: AssetSpec, a: AssetState) => a.upgrades.reduce((m, u) => m * (sp.upgrades?.find(x => x.id === u)?.rentMult ?? 1), 1);
/** Income of one asset per in-game hour, given the polyvalence multiplier and whether an ad runs. */
function incomeWith(a: AssetState, mult: number, ad: boolean): number {
  const sp = specOf(a.spec); if (!sp || a.how !== 'owned') return 0;
  if (sp.kind === 'business') return (sp.income ?? 0) * mult * (ad ? 1 + P.adSpace.boost : 1);
  if (a.leased) return (sp.income ?? 0) * rentMult(sp, a) * condFactor(a, P.rentFloor);
  return 0;
}
/** Income of one asset per in-game hour now. */
export const incomeOf = (s: GameState, a: AssetState) => incomeWith(a, multiplier(s), adRunning(s));
/** Charges of one asset per in-game hour: the rent of a rented home, the upkeep of an owned one. */
export function chargeOf(a: AssetState): number {
  const sp = specOf(a.spec); if (!sp) return 0;
  if (a.how === 'rented') return (sp.rent ?? 0) / 24;
  if (a.how === 'owned') return sp.upkeep ?? 0;
  return 0;
}
export function rates(s: GameState): { income: number; charges: number } {
  let income = 0, charges = 0;
  const mult = multiplier(s), ad = adRunning(s);
  for (const a of s.data.assets.list) { income += incomeWith(a, mult, ad); charges += chargeOf(a); }
  return { income, charges };
}
/** Income per in-game hour, rounded (the sheets and the phone). */
export const incomePerHour = (s: GameState) => Math.round(rates(s).income);
export const chargesPerHour = (s: GameState) => Math.round(rates(s).charges);

/** « Revenus · Kiosque et 1 autre affaire », « Revenus · Panneau 4 × 3… et 2 autres biens ». */
export function incomeLabel(s: GameState): string {
  const mult = multiplier(s), ad = adRunning(s);
  const earning = s.data.assets.list.filter(a => incomeWith(a, mult, ad) > 0).map(a => specOf(a.spec)!);
  const ventures = [...VENTURES].reverse().filter(v => earning.some(x => x.id === v.id)).map(v => v.name);
  const others = [...new Set(earning.filter(x => x.kind !== 'business').sort((a, b) => (b.income ?? 0) - (a.income ?? 0)).map(x => x.name))];
  const names = [...ventures, ...others], n = names.length, word = others.length ? 'bien' : 'affaire';
  return `Revenus · ${names[0] ?? 'biens'}${n > 1 ? ` et ${n - 1} autre${n > 2 ? 's' : ''} ${word}${n > 2 ? 's' : ''}` : ''}`;
}
function chargeLabel(s: GameState): string {
  const paying = s.data.assets.list.filter(a => chargeOf(a) > 0);
  const rented = paying.filter(a => a.how === 'rented');
  const first = specOf((rented[0] ?? paying[0])?.spec ?? '')?.name ?? 'logement';
  if (paying.length > 1) return `Loyers et charges · ${paying.length} logements`;
  return `${rented.length ? 'Loyer' : 'Charges'} · ${first}`;
}

/** Messages for the player from the last settlements (a lease that ended…), taken once by the UI. */
const notices: string[] = [];
export const takeNotices = () => notices.splice(0, notices.length);

/**
 * Count income and charges up to now (played time) and settle every full in-game hour since the last settlement, in one
 * batch. Wear is applied as time passes. Returns the net amount settled (0 between settlements).
 */
export function accrue(s: GameState): number {
  const st = s.data.assets, now = s.data.playedMs;
  if (st.clockMs > now) st.clockMs = now;                  // never count time that was not played
  if (st.payMs > now) st.payMs = now;
  const { income, charges } = rates(s);
  const wearing = st.list.filter(a => a.how === 'owned' && (specOf(a.spec)?.wear ?? 0) > 0);
  if (income <= 0 && charges <= 0 && !wearing.length && st.arrears <= 0) { st.clockMs = st.payMs = now; return 0; }
  const dt = Math.min(now - st.clockMs, ECONOMY.business.maxCatchUpHours * HOUR_MS);
  st.carryIn += income * (dt / HOUR_MS); st.carryOut += charges * (dt / HOUR_MS);
  for (const a of wearing) a.condition = Math.max(0, a.condition - specOf(a.spec)!.wear! * (dt / DAY_MS));
  st.clockMs = now;
  const hours = Math.floor((now - st.payMs) / HOUR_MS);
  if (hours < 1) return 0;
  st.payMs += hours * HOUR_MS;
  const dueIn = Math.floor(st.carryIn + 1e-6), dueOut = Math.floor(st.carryOut + 1e-6);   // float dust never costs a franc
  st.carryIn = Math.max(0, st.carryIn - dueIn); st.carryOut = Math.max(0, st.carryOut - dueOut);
  let net = 0;
  if (dueIn > 0) { const paid = s.addMoney(dueIn, incomeLabel(s)); st.earned += paid; net += paid; }
  const owe = dueOut + st.arrears;
  if (owe > 0) {
    const taken = -s.addMoney(-owe, st.arrears > 0 ? `${chargeLabel(s)} (avec l’arriéré)` : chargeLabel(s));
    st.spent += taken; net -= taken; st.arrears = owe - taken;
  }
  const rentDay = st.list.filter(a => a.how === 'rented').reduce((t, a) => t + (specOf(a.spec)?.rent ?? 0), 0);
  if (st.arrears > 0 && (rentDay <= 0 || st.arrears >= rentDay * P.evictDays)) {
    for (const a of st.list.filter(x => x.how === 'rented')) { endLease(s, a.uid, false); notices.push(`Loyer impayé : le propriétaire a repris les clés · ${specOf(a.spec)?.name ?? ''}`); }
    st.arrears = 0;
  }
  bump();
  return net;
}

// ------------------------------------------------------------------ buying, renting, selling
export function cannotBuy(s: GameState, specId: string): string | null {
  const sp = specOf(specId);
  if (!sp) return 'Inconnu';
  if (sp.soon) return sp.soon;
  if (!sp.price) return 'Pas à vendre';
  const h = holding(s, specId);
  if (h && sp.kind !== 'business' && sp.kind !== 'furniture' && h.how !== 'rented') return 'Déjà à toi';
  if (!s.canAfford(sp.price)) return 'Pas assez d’argent';
  return null;
}
/**
 * Buy a home, a plot or a billboard at its price (a rented home becomes the player's: the lease ends). One tap, no
 * paperwork. Ventures and furniture have their own purchase (business.ts, furniture.ts) on top of `addOwned`.
 */
export function buyAsset(s: GameState, specId: string): AssetState | null {
  if (cannotBuy(s, specId)) return null;
  const sp = specOf(specId)!;
  if (sp.kind === 'business' || sp.kind === 'furniture') return null;
  accrue(s);
  s.addMoney(-sp.price!, `Achat : ${label(sp)}`);
  const lease = holding(s, specId);
  let a: AssetState;
  if (lease) { lease.how = 'owned'; lease.paid = sp.price!; lease.since = s.data.playedMs; lease.condition = 100; a = lease; bump(); }
  else a = addAsset(s, specId, 'owned', sp.price!);
  practise(s, 'commerce'); s.count('biens');
  return a;
}
/** A unit of a venture or a piece of furniture, already paid by the caller. */
export function addOwned(s: GameState, specId: string, paid: number, extra: Partial<AssetState> = {}) { return addAsset(s, specId, 'owned', paid, extra); }

export function cannotRent(s: GameState, specId: string): string | null {
  const sp = specOf(specId);
  if (!sp) return 'Inconnu';
  if (sp.soon) return sp.soon;
  if (!sp.rent) return 'Pas à louer';
  if (holds(s, specId)) return holding(s, specId)!.how === 'rented' ? 'Tu le loues déjà' : 'Déjà à toi';
  if (!s.canAfford(sp.rent)) return `Il te faut de quoi payer un jour de loyer (${sp.rent.toLocaleString('fr-FR')} F)`;
  return null;
}
/** Rent a home: its rent is taken each in-game hour (rent / 24) from now on. */
export function rentAsset(s: GameState, specId: string): AssetState | null {
  if (cannotRent(s, specId)) return null;
  accrue(s);
  const a = addAsset(s, specId, 'rented', 0);
  s.count('locations');
  return a;
}
/** End a lease (« Rendre les clés »): the home's furniture goes back to the player's home. */
export function endLease(s: GameState, uid: string, settle = true): boolean {
  const a = assetByUid(s, uid); if (!a || a.how !== 'rented') return false;
  if (settle) accrue(s);
  leaveHome(s, a);
  removeAsset(s, uid);
  return true;
}
/** Furniture of a home that is left (lease ended, sold): it moves to the home the player lives in, stored. */
function leaveHome(s: GameState, home: AssetState) {
  const st = s.data.assets;
  if (st.home === home.uid) st.home = st.list.find(a => a.spec === STARTER_HOME)!.uid;
  const to = currentHome(s);
  for (const f of furnitureIn(s, home.uid)) { f.home = to.uid; f.at = null; }
  settleFurniture(s, to.uid);
}

export function cannotSell(s: GameState, uid: string): string | null {
  const a = assetByUid(s, uid);
  if (!a) return 'Inconnu';
  if (a.how !== 'owned') return a.how === 'rented' ? 'Tu le loues : rends les clés plutôt' : 'Ce n’est pas à toi de le vendre';
  return null;
}
/** Sell at once for most of the current value. Returns what was paid. */
export function sellAsset(s: GameState, uid: string): number {
  if (cannotSell(s, uid)) return 0;
  const a = assetByUid(s, uid)!, sp = specOfAsset(a), price = saleValue(a);
  accrue(s);
  if (sp.kind === 'home') leaveHome(s, a);
  removeAsset(s, uid);
  const paid = s.addMoney(price, `Vente : ${sp.name}`);
  practise(s, 'commerce');
  return paid;
}

// ------------------------------------------------------------------ living, letting, upgrading
export function cannotMoveIn(s: GameState, uid: string): string | null {
  const a = assetByUid(s, uid), sp = a && homeSpec(a.spec);
  if (!a || !sp) return 'Inconnu';
  if (s.data.assets.home === uid) return 'Tu y habites déjà';
  if (a.leased) return 'Il est loué à quelqu’un : arrête la location d’abord';
  return null;
}
/** Live in this home from now on; with `bring`, the furniture of the previous home comes along (stored, then set up). */
export function moveIn(s: GameState, uid: string, bring = true): boolean {
  if (cannotMoveIn(s, uid)) return false;
  const st = s.data.assets, from = currentHome(s);
  st.home = uid;
  if (bring) { for (const f of furnitureIn(s, from.uid)) { if (!furnitureSpec(f.spec)!.fixed) { f.home = uid; f.at = null; } } settleFurniture(s, uid); }
  bump();
  return true;
}
export function cannotLet(s: GameState, uid: string): string | null {
  const a = assetByUid(s, uid), sp = a && specOf(a.spec);
  if (!a || !sp) return 'Inconnu';
  if (a.how !== 'owned') return 'Seul un bien à toi peut être loué';
  if (!sp.income || (sp.kind !== 'land' && sp.kind !== 'billboard' && sp.kind !== 'home')) return 'Ne se loue pas';
  if (sp.kind === 'home' && s.data.assets.home === uid) return 'Tu y habites : emménage ailleurs d’abord';
  return null;
}
/** Let (or stop letting) a plot, a billboard or a home the player does not live in. */
export function setLeased(s: GameState, uid: string, on: boolean): boolean {
  if (on && cannotLet(s, uid)) return false;
  const a = assetByUid(s, uid); if (!a || a.how !== 'owned') return false;
  accrue(s);
  a.leased = on; if (on) delete a.ownAd;
  bump();
  return true;
}
/** Show the player's own ad on a billboard they own (instead of letting it). */
export function setOwnAd(s: GameState, uid: string, on: boolean): boolean {
  const a = assetByUid(s, uid); if (!a || a.how !== 'owned' || specOf(a.spec)?.kind !== 'billboard') return false;
  accrue(s);
  if (on) { a.ownAd = true; a.leased = false; } else delete a.ownAd;
  bump();
  return true;
}
export function cannotRentAd(s: GameState): string | null {
  return s.canAfford(P.adSpace.perDay) ? null : 'Pas assez d’argent';
}
/** Rent ad space on a billboard for one in-game day (they add up): the ventures' income gets the ad boost. */
export function rentAdSpace(s: GameState, boardName = 'panneau'): boolean {
  if (cannotRentAd(s)) return false;
  accrue(s);
  const st = s.data.assets;
  s.addMoney(-P.adSpace.perDay, `Espace pub · ${boardName}`);
  st.adUntil = Math.max(st.adUntil, s.data.playedMs) + DAY_MS;
  practise(s, 'commerce');
  bump();
  return true;
}
export function cannotUpgrade(s: GameState, uid: string, upId: string): string | null {
  const a = assetByUid(s, uid), sp = a && specOf(a.spec), up = sp?.upgrades?.find(u => u.id === upId);
  if (!a || !sp || !up) return 'Inconnu';
  if (a.how !== 'owned' && !(a.how === 'given' && up.comfort)) return 'Seul un bien à toi s’améliore';
  if (a.upgrades.includes(upId)) return 'Déjà fait';
  if (!s.canAfford(up.price)) return 'Pas assez d’argent';
  return null;
}
export function upgradeAsset(s: GameState, uid: string, upId: string): boolean {
  if (cannotUpgrade(s, uid, upId)) return false;
  const a = assetByUid(s, uid)!, sp = specOfAsset(a), up = sp.upgrades!.find(u => u.id === upId)!;
  accrue(s);
  s.addMoney(-up.price, `${up.name} · ${sp.name}`);
  a.upgrades.push(upId);
  bump();
  return true;
}
/** Energy a night brings in this home on top of the bed (comfort upgrades). */
export const comfortOf = (a: AssetState) => { const sp = specOf(a.spec); return a.upgrades.reduce((t, u) => t + (sp?.upgrades?.find(x => x.id === u)?.comfort ?? 0), 0); };
export const repairCost = (a: AssetState) => Math.round((specOf(a.spec)?.price ?? 0) * P.repairPerPoint * (100 - a.condition));
export function repairAsset(s: GameState, uid: string): boolean {
  const a = assetByUid(s, uid); if (!a || a.how !== 'owned' || a.condition >= 100) return false;
  const cost = repairCost(a); if (!s.canAfford(cost)) return false;
  accrue(s);
  s.addMoney(-cost, `Réparation · ${specOfAsset(a).name}`);
  a.condition = 100;
  bump();
  return true;
}

// ------------------------------------------------------------------ furniture in homes
/**
 * Stored pieces of a home are set up where they fit (their usual spot first); what does not fit stays stored.
 * Run after a purchase, a move and on load (pieces migrated from an older save are stored until then).
 */
export function settleFurniture(s: GameState, homeUid: string): number {
  const home = assetByUid(s, homeUid), hs = home && homeSpec(home.spec); if (!hs) return 0;
  const layout = layoutOf(hs as HomeSpec);
  let placed = 0;
  for (const f of furnitureIn(s, homeUid)) {
    const fs = furnitureSpec(f.spec)!;
    if (f.at || fs.fixed) continue;
    const at = autoPlace(layout, fs, placedIn(s, homeUid));
    if (at) { f.at = at; placed++; }
  }
  if (placed) bump();
  return placed;
}
/** Placement mode: store a piece, or put it at `at` (already checked by the caller). */
export function setPlacement(s: GameState, uid: string, at: AssetState['at']) {
  const f = assetByUid(s, uid); if (!f || !f.home) return false;
  f.at = at ? { ...at } : null; bump();
  return true;
}
/** Mark a change made outside these functions (debug tools). */
export const touchAssets = () => bump();

// ------------------------------------------------------------------ multi-unit prices and loading
/** Three significant digits (prices read like prices: 66 100 F, not 66 125 F). */
export function nice(n: number): number {
  if (n < 1000) return Math.round(n);
  const p = 10 ** (Math.floor(Math.log10(n)) - 2);
  return Math.round(n / p) * p;
}
/** Price of the next unit of a venture when `owned` units are already owned: each one makes the next ×1.15 dearer. */
export const unitPrice = (id: string, owned: number) => { const sp = specOf(id); return sp?.kind === 'business' && sp.price ? nice(sp.price * ECONOMY.business.growth ** owned) : Infinity; };

/**
 * After loading a save: units migrated from an older save get the price they cost; furniture migrated stored is set up
 * at its usual spot; a current home that is not a home any more falls back to the starter room.
 */
export function normalize(s: GameState) {
  const rank = new Map<string, number>();
  for (const a of s.data.assets.list) {
    if (specOf(a.spec)?.kind !== 'business') continue;
    const k = rank.get(a.spec) ?? 0; rank.set(a.spec, k + 1);
    if (!a.paid) a.paid = unitPrice(a.spec, k);
  }
  currentHome(s);
  for (const h of s.data.assets.list) if (homeSpec(h.spec)) settleFurniture(s, h.uid);
  bump();
}
