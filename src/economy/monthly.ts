import type { GameState } from '../core/state';
import type { AssetState, MonthlyLease } from '../core/types';
import { ECONOMY } from './config';
import { ECON_MONTH_MS, contractMonthAt, econMonthAt, econNow } from './calendar';
import { furnitureSpec, specOf, type AssetSpec } from './catalog';
import { accrue, addLease, addOwned, assetByUid, endLease, holding, pushNotice, settleFurniture, touchAssets } from './assets';

/**
 * Monthly contracts (1.0.1): the F2 of the Résidence Jàmm is rented by the ECONOMIC month (seven real days, src/economy/calendar.ts), and its
 * tenant (the player) may sublet it to a tenant of the city, empty or furnished. Pure logic, unit-tested (tests/monthly.test.ts); the sheets and
 * the phone are in src/economy/estate.ts. The other homes' per-day leases (src/economy/assets.ts) are untouched.
 *
 * - Rent and charges are paid IN ADVANCE: the first month at the signature, then once per month at the settlement. A settlement closes the month
 *   in hand (what the tenant paid comes in), then pays the next one. Months are counted from the signature, so `k` months settled can never be
 *   settled again, whatever the clock does; each settlement also leaves its key (`rent:<uid>:<month>`) in the save.
 * - A tenant of the city (never another player in this release) takes the home for part of each month: `occupancy` draws it from a seed, 80 % on
 *   average, a month in ten empty. What comes in is the potential × the occupancy × the share of the month the home was on offer.
 * - Exclusive: a home on offer is not the player's to live in (and the other way round), has one tenant at most, and a tenant of the city cannot
 *   sublet in turn. A tenant in place stays to the end of the month. At most `maxSublets` homes on offer per player.
 * - Arrears are never dropped: unpaid rent stays on the contract, and on the player (`assets.owed`) once the contract ends, by the landlord
 *   (two months unpaid) or by the player. No new monthly contract while something is owed.
 */
const M = ECONOMY.monthly;
export type OfferMode = 'sublet' | 'furnished';
type Held = AssetState & { lease: MonthlyLease };

export const termsOf = (specId: string) => specOf(specId)?.monthly ?? null;
export const monthlyCost = (L: Pick<MonthlyLease, 'rent' | 'charges'>) => L.rent + L.charges;
export const contractOf = (s: GameState, uid: string | null | undefined): Held | null => { const a = assetByUid(s, uid); return a?.lease ? a as Held : null; };
export const contracts = (s: GameState): Held[] => s.data.assets.list.filter((a): a is Held => !!a.lease && a.how === 'rented');
export const settlementKey = (uid: string, month: number) => `rent:${uid}:${month}`;
export const owed = (s: GameState) => s.data.assets.owed ?? 0;
const name = (a: AssetState) => (specOf(a.spec)?.name ?? '').split(' · ')[0];

// ------------------------------------------------------------------ tenant demand
/** FNV-1a, then a mixer: two uniform draws in [0, 1) from a string. */
function draws(key: string): [number, number] {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  const next = () => { h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return [next(), next()];
}
/**
 * The share of a month (0–100, whole per cent) a home finds a tenant of the city: a month in ten none at all, the others `occMin`–`occMax`.
 * Drawn from the seed and the global month, so asking again, reloading or signing again in the same month gives the same answer.
 */
export function occupancy(seed: string, month: number): number {
  const [vacant, level] = draws(`${seed}:${month}`);
  if (vacant < M.vacancy) return 0;
  return M.occMin + Math.floor(level * (M.occMax - M.occMin + 1));
}
const seedOf = (s: GameState, a: AssetState) => `${s.data.guestId}:${a.spec}`;
/** Occupancy (0–100) of the contract's month `k`: the demand of the global month that contract month begins in. */
export const occupancyOf = (s: GameState, a: Held, k = a.lease.k) => occupancy(seedOf(s, a), econMonthAt(a.lease.start + k * ECON_MONTH_MS));

// ------------------------------------------------------------------ furnished or not
/** Furnished: the pieces of its pack are all still in the home (placed or stored). */
export function furnished(s: GameState, a: AssetState): boolean {
  const pack = a.lease?.pack;
  return !!pack?.length && pack.every(uid => assetByUid(s, uid)?.home === a.uid);
}
/** What a tenant pays for the home per month at full occupancy, as it is on offer now. */
export function potential(s: GameState, a: Held): number {
  const t = termsOf(a.spec); if (!t || a.lease.mode === 'live') return 0;
  return a.lease.mode === 'furnished' && furnished(s, a) ? t.furnished : t.sublet;
}
/** A tenant of the city lives there this month. */
export const tenantIn = (s: GameState, a: Held) => a.lease.mode !== 'live' && occupancyOf(s, a) > 0;

/** Counts what the tenant pays up to `now` (within the month in hand): time on offer only, never before the last count, never past the month's end. */
function count(s: GameState, a: Held, now: number) {
  const L = a.lease, end = L.start + (L.k + 1) * ECON_MONTH_MS, to = Math.min(now, end);
  if (to <= L.accAt) return;
  L.acc += potential(s, a) * (occupancyOf(s, a) / 100) * ((to - L.accAt) / ECON_MONTH_MS);
  L.accAt = to;
}

// ------------------------------------------------------------------ signing
export function cannotSign(s: GameState, specId: string): string | null {
  const sp = specOf(specId), t = sp?.monthly;
  if (!sp || !t) return 'Pas de bail au mois ici';
  const h = holding(s, specId);
  if (h?.lease) return 'Tu le loues déjà';
  if (h && h.how !== 'rented') return 'Déjà à toi';
  if (owed(s) > 0) return `Loyers impayés : règle d’abord ${owed(s).toLocaleString('fr-FR')} F`;
  if (!s.canAfford(t.rent + t.charges)) return `Il te faut le premier mois : ${(t.rent + t.charges).toLocaleString('fr-FR')} F`;
  return null;
}
const newLease = (s: GameState, t: NonNullable<AssetSpec['monthly']>, now: number): MonthlyLease =>
  ({ start: now, k: 0, rent: t.rent, charges: t.charges, mode: 'live', acc: 0, accAt: now, debt: 0, playAt: s.data.playedMs });
function remember(s: GameState, key: string) { const st = s.data.assets; st.settled = [...(st.settled ?? []), key].slice(-32); }
/**
 * Sign the monthly lease: the first month (rent and charges) is paid now, the next ones at each settlement. A per-day lease of the same home signed
 * before 1.0.1 becomes the monthly one (its hours are settled first).
 */
export function signLease(s: GameState, specId: string, now = econNow()): AssetState | null {
  if (cannotSign(s, specId)) return null;
  const sp = specOf(specId)!, t = sp.monthly!, day = holding(s, specId);
  accrue(s);
  s.addMoney(-(t.rent + t.charges), `Loyer et charges · ${name({ spec: specId } as AssetState)} · 1er mois`);
  let a: AssetState;
  if (day) { delete day.rate; day.lease = newLease(s, t, now); a = day; touchAssets(); }
  else { a = addLease(s, specId, { lease: newLease(s, t, now) }); s.count('locations'); }
  remember(s, settlementKey(a.uid, 0));
  return a;
}

// ------------------------------------------------------------------ furnishing
export function cannotFurnish(s: GameState, uid: string): string | null {
  const a = contractOf(s, uid), t = a && termsOf(a.spec);
  if (!a || !t) return 'Inconnu';
  if (furnished(s, a)) return 'Déjà meublé';
  if (a.lease.mode !== 'live') return 'Il est en location : arrête-la d’abord';
  if (!s.canAfford(t.pack)) return 'Pas assez d’argent';
  return null;
}
/** Buy the furnishing pack: its pieces are delivered to THIS home and set up room by room; they are the player's furniture, tied to the home while it is let furnished. */
export function furnish(s: GameState, uid: string): AssetState[] | null {
  if (cannotFurnish(s, uid)) return null;
  const a = contractOf(s, uid)!, t = termsOf(a.spec)!;
  s.addMoney(-t.pack, `Pack meublé · ${name(a)}`);
  const pieces = M.pack.filter(id => furnitureSpec(id)).map(id => addOwned(s, id, furnitureSpec(id)!.price ?? 0, { home: a.uid, at: null }));
  settleFurniture(s, a.uid);
  a.lease.pack = pieces.map(p => p.uid);
  touchAssets();
  return pieces;
}

// ------------------------------------------------------------------ offering, stopping
export const onOffer = (s: GameState) => contracts(s).filter(a => a.lease.mode !== 'live').length;
export function cannotOffer(s: GameState, uid: string, mode: OfferMode, now = econNow()): string | null {
  const a = contractOf(s, uid), t = a && termsOf(a.spec);
  if (!a || !t || a.how !== 'rented') return 'Seul un logement que tu loues au mois se sous-loue';
  if (a.lease.mode !== 'live') return 'Déjà en location : un seul locataire à la fois';             // one tenancy per home, and a tenant never sublets in turn
  if (s.data.assets.home === uid) return 'Tu y habites : définis d’abord un autre domicile principal';
  if (a.lease.notice) return 'Tu as donné congé : le bail s’arrête à l’échéance';
  if (a.lease.debt > 0) return 'Loyer impayé : règle-le d’abord';
  if (contractMonthAt(a.lease.start, now) > a.lease.k) return 'L’échéance du mois est en cours : reviens dans un moment';   // never back-pay for months not yet settled
  if (mode === 'furnished' && !furnished(s, a)) return 'Pas encore meublé';
  if (onOffer(s) >= M.maxSublets) return `Pas plus de ${M.maxSublets} logements en sous-location`;
  return null;
}
/** Put the home on offer from now: what the month's tenant pays is counted from now to the end of the month. */
export function offer(s: GameState, uid: string, mode: OfferMode, now = econNow()): boolean {
  if (cannotOffer(s, uid, mode, now)) return false;
  const a = contractOf(s, uid)!, L = a.lease;
  L.accAt = Math.max(L.accAt, Math.min(now, L.start + (L.k + 1) * ECON_MONTH_MS));
  L.mode = mode; delete L.next;
  touchAssets();
  return true;
}
/**
 * Stop the letting. With a tenant in place it stops at the end of the month (the tenant has paid for it): 'later'. With none this month it stops at
 * once: 'now'. Null: nothing to stop.
 */
export function stopOffer(s: GameState, uid: string, now = econNow()): 'now' | 'later' | null {
  const a = contractOf(s, uid); if (!a || a.lease.mode === 'live') return null;
  count(s, a, now);
  if (tenantIn(s, a)) { a.lease.next = 'live'; touchAssets(); return 'later'; }
  a.lease.mode = 'live'; delete a.lease.next; touchAssets();
  return 'now';
}
/** Keep the tenant after all (a stop asked for the end of the month is withdrawn). */
export function keepOffer(s: GameState, uid: string): boolean {
  const a = contractOf(s, uid); if (!a?.lease.next) return false;
  delete a.lease.next; touchAssets();
  return true;
}

// ------------------------------------------------------------------ ending, renewing
/** Give notice (the contract ends at the next settlement instead of being renewed), or withdraw it (« Renouveler »). */
export function setNotice(s: GameState, uid: string, on: boolean): boolean {
  const a = contractOf(s, uid); if (!a) return false;
  if (on) a.lease.notice = true; else delete a.lease.notice;
  touchAssets();
  return true;
}
export function cannotEndNow(s: GameState, uid: string): string | null {
  const a = contractOf(s, uid); if (!a) return 'Inconnu';
  if (tenantIn(s, a)) return 'Un locataire est en place jusqu’à la fin du mois : donne congé pour l’échéance';
  return null;
}
/** The contract is over: the keys go back, the furniture (the pack's too) to the player's home, and what was unpaid stays owed. */
function close(s: GameState, a: Held) { endLease(s, a.uid, false); }                // `endLease` moves the arrears to `assets.owed`
/** Hand the keys back now (no tenant in place). The month paid is not refunded; what is unpaid stays owed. */
export function endNow(s: GameState, uid: string): boolean {
  if (cannotEndNow(s, uid)) return false;
  close(s, contractOf(s, uid)!);
  return true;
}

// ------------------------------------------------------------------ settlement
export interface Settlement { uid: string; spec: string; month: number; occ: number; revenue: number; cost: number; paid: number; ended?: 'notice' | 'unpaid'; skipped?: number }

/** Takes what is owed from the wallet as money comes in (a contract's arrears first, then what ended contracts left). */
function collect(s: GameState) {
  if (s.wallet <= 0) return;
  for (const a of contracts(s)) {
    if (a.lease.debt <= 0 || s.wallet <= 0) continue;
    a.lease.debt += s.addMoney(-a.lease.debt, `Loyer en retard · ${name(a)}`);
    touchAssets();
  }
  const st = s.data.assets;
  if (owed(s) > 0 && s.wallet > 0) { st.owed = owed(s) + s.addMoney(-owed(s), 'Loyers impayés · ancien bail'); touchAssets(); }
}

/** One settlement: closes the month in hand (the tenant's payment comes in) and pays the next (rent and charges), or ends the contract. */
function settleOne(s: GameState, a: Held): Settlement {
  const L = a.lease, st = s.data.assets, boundary = L.start + (L.k + 1) * ECON_MONTH_MS, occ = L.mode === 'live' ? 0 : occupancyOf(s, a);
  count(s, a, boundary);
  const revenue = Math.floor(L.acc + 1e-6), cost = monthlyCost(L), month = L.k + 1;
  L.acc = 0; L.accAt = boundary;
  const out: Settlement = { uid: a.uid, spec: a.spec, month, occ, revenue, cost: 0, paid: 0 };
  if (revenue > 0) st.earned += s.addMoney(revenue, `Loyer perçu · ${name(a)}${L.mode === 'furnished' ? ' meublé' : ''} · occupé à ${occ} %`);
  remember(s, settlementKey(a.uid, month));
  if (L.next) { L.mode = L.next; delete L.next; }
  if (L.notice) {
    L.last = { k: L.k, occ, revenue, cost: 0 }; L.k = month;
    close(s, a); out.ended = 'notice';
    pushNotice(`Bail terminé à l’échéance · ${name(a)} : les clés sont rendues`);
    return out;
  }
  const due = cost + L.debt, paid = Math.abs(s.addMoney(-due, L.debt > 0 ? `Loyer et charges · ${name(a)} (avec le retard)` : `Loyer et charges · ${name(a)} · mois ${month + 1}`));
  st.spent += paid; L.debt = due - paid;
  L.last = { k: L.k, occ, revenue, cost }; L.k = month;
  out.cost = cost; out.paid = paid;
  if (L.debt >= cost * M.evictMonths) {
    const debt = L.debt;
    close(s, a); out.ended = 'unpaid';
    pushNotice(`${M.evictMonths} mois impayés : le propriétaire a repris les clés · ${name(a)}. Tu dois encore ${debt.toLocaleString('fr-FR')} F`);
  }
  return out;
}

/**
 * Settle every monthly contract up to `now` (economic time). Called a few times per second by the economy's tick: it does nothing until a contract's
 * month has turned. After an absence at most `catchUpMonths` months are settled, oldest first; the months beyond are skipped whole (the contract
 * slept: no rent, no revenue) and the month paid last covers the one in hand. A batch needs half an hour of play since the previous one.
 */
export function settleMonthly(s: GameState, now = econNow()): Settlement[] {
  const out: Settlement[] = [];
  collect(s);
  for (const a of contracts(s)) {
    const L = a.lease, turned = contractMonthAt(L.start, now) - L.k;
    if (turned <= 0) continue;
    if (s.data.playedMs - L.playAt < M.minPlayMs) continue;                  // not lost: settled once the player has played a little
    for (let i = 0; i < Math.min(turned, M.catchUpMonths) && assetByUid(s, a.uid); i++) {
      if (s.data.assets.settled?.includes(settlementKey(a.uid, L.k + 1))) { L.k++; L.acc = 0; L.accAt = L.start + L.k * ECON_MONTH_MS; continue; }   // already settled (a key without its month: never twice)
      out.push(settleOne(s, a));
    }
    if (!assetByUid(s, a.uid)) continue;                                      // ended at this settlement (notice, or unpaid)
    const left = contractMonthAt(L.start, now) - L.k;
    if (left > 0) {
      L.k += left; L.acc = 0; L.accAt = Math.max(now, L.start + L.k * ECON_MONTH_MS);
      if (out.length) out[out.length - 1].skipped = left;
      pushNotice(`${name(a)} : ton bail a dormi pendant ton absence (${left} mois sans loyer ni revenu)`);
    }
    L.playAt = s.data.playedMs;
    touchAssets();
  }
  return out;
}

// ------------------------------------------------------------------ the phone's view
export interface ContractView {
  uid: string; spec: string; mode: MonthlyLease['mode']; furnished: boolean; next: boolean; notice: boolean;
  /** This month: occupancy (0–100), what the tenant will have paid at the settlement, what the month costs (paid in advance), the profit. */
  occ: number; revenue: number; cost: number; profit: number;
  /** The next settlement (economic time, ms), and whether it only waits for a little play. */
  nextAt: number; waiting: boolean;
  debt: number; month: number; last: MonthlyLease['last'] | null;
}
export function viewOf(s: GameState, a: Held, now = econNow()): ContractView {
  const L = a.lease, end = L.start + (L.k + 1) * ECON_MONTH_MS, occ = L.mode === 'live' ? 0 : occupancyOf(s, a);
  const from = Math.min(L.accAt, end);                                        // counted so far, plus the rest of the month as it is on offer now
  const revenue = Math.floor(L.acc + potential(s, a) * (occ / 100) * (Math.max(0, end - from) / ECON_MONTH_MS) + 1e-6), cost = monthlyCost(L);
  return {
    uid: a.uid, spec: a.spec, mode: L.mode, furnished: furnished(s, a), next: !!L.next, notice: !!L.notice, occ, revenue, cost, profit: revenue - cost,
    nextAt: end, waiting: now >= end && s.data.playedMs - L.playAt < M.minPlayMs, debt: L.debt, month: L.k + 1, last: L.last ?? null,
  };
}
