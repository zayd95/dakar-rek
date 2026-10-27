import type { GameState } from '../core/state';
import type { BankTx, LoanState } from '../core/types';
import { MONEY_MAX } from '../core/save';
import { Relations } from '../social/relations';
import { ECONOMY } from './config';
import { applied, move, postSavings, type MoveRefusal, type MoveResult } from './money';
import { fcfaText } from './format';
import { VENTURES, nextPrice, ownedOf, perHourOf } from './business';
import { C, dealerOffer, dueBy, missedWith, openLoans, standing } from './credit';
import { assetsOf } from './assets';
import { specOf } from './catalog';

/**
 * Banque Teranga v1 (pure rules on the money contract of src/economy/money.ts, unit-tested; the counter and the conseillère are
 * src/economy/bankModule.ts, the phone's « Banque » is src/ui/phone/apps/bank.ts):
 *   – the account is opened at an agency counter (Pikine or Plateau), for free; deposits and withdrawals are `move`s between the wallet and the savings,
 *     each confirmation carrying a fresh ref (a double tap is refused, never applied twice);
 *   – interest is paid once per player day played, on the savings carried into that day, at the rate and cap of the level reached (ECONOMY.bank);
 *   – each level above the first is celebrated once (SaveData.bank.milestones);
 *   – a savings goal: a venture at the price the player would pay for it (ECONOMY.business through business.ts `nextPrice`) or a free amount;
 *   – the conseillère's advice (`bankAdvice`): 1–3 short lines read from the player's real state only (wallet, savings, goal, ventures and their next
 *     prices, debts and where they stand, cars owned, Pape Sarr's real answer to a car credit). It never promises a credit: Pape Sarr « étudiera ta
 *     demande » only when his rules would not refuse; when they would, it says what is missing, from his rule that refuses.
 * Game money only (fictional francs), on this device; no online account here (LD2.0-B).
 */
export const BANK = ECONOMY.bank;
type Level = (typeof BANK.levels)[number];

const NNBSP = ' ';
const F = fcfaText;
/** « 1 % », « 0,5 % ». */
export const pct = (rate: number) => `${(Math.round(rate * 1000) / 10).toString().replace('.', ',')}${NNBSP}%`;

// ------------------------------------------------------------------------------------------------ the account
export const isOpen = (s: GameState) => s.data.bank.opened >= 0;
/** Opens the account (free, at an agency counter). False when it was already open. */
export function openAccount(s: GameState): boolean {
  const b = s.data.bank;
  if (b.opened >= 0) return false;
  b.opened = Math.max(0, s.data.play.day);
  return true;
}

// ------------------------------------------------------------------------------------------------ levels, interest, milestones
/** The level a balance reaches (the highest whose threshold it meets). */
export function levelIndex(savings: number): number {
  let i = 0;
  BANK.levels.forEach((l, k) => { if (savings >= l.from) i = k; });
  return i;
}
export const levelOf = (savings: number): Level => BANK.levels[levelIndex(savings)];
export const nextLevelOf = (savings: number): Level | null => BANK.levels[levelIndex(savings) + 1] ?? null;
/** « +1 % par jour de jeu, 250 F max ». */
export const rateText = (l: Level) => `+${pct(l.rate)} par jour de jeu, ${F(l.cap)} max`;
/** The interest of one player day on this balance: its level's rate, whole francs (rounded down), never above its cap. */
export const interestFor = (savings: number) => { const l = levelOf(savings); return Math.max(0, Math.min(l.cap, Math.floor(savings * l.rate))); };
/** The savings levels celebrated once each (every level above the first). */
export const MILESTONES: readonly number[] = BANK.levels.filter(l => l.from > 0).map(l => l.from);

/** Levels the balance reaches now and never celebrated: recorded (each once, ever) and returned. */
export function reachMilestones(s: GameState): number[] {
  const b = s.data.bank, out: number[] = [];
  for (const m of MILESTONES) if (b.savings >= m && !b.milestones.includes(m)) { b.milestones.push(m); out.push(m); }
  return out;
}
export const milestoneText = (m: number) => `Épargne Teranga : palier ${F(m)} atteint ! Désormais ${rateText(levelOf(m))}.`;

export interface Interest { day: number; amount: number; tx: BankTx | null; milestones: number[] }
/**
 * The bank looks at the account once per player day (SaveData.play.day), and pays that day's interest on the savings carried into it. Null when it already
 * looked today, no day was played yet, or there is no account. An account opened today earns from the next day. Never several days at once: the player's
 * day only moves while they play (src/economy/streak.ts), and a day once looked at is saved (`interestDay`).
 */
export function payInterest(s: GameState): Interest | null {
  const b = s.data.bank, day = s.data.play.day;
  if (b.opened < 0 || day <= 0 || b.interestDay >= day) return null;
  b.interestDay = day;
  const none: Interest = { day, amount: 0, tx: null, milestones: [] };
  const ref = `int-${day}`, amount = Math.min(interestFor(b.savings), MONEY_MAX - b.savings);
  if (b.opened >= day || amount <= 0 || applied(s, ref)) return none;
  const tx = postSavings(s, 'interest', amount, `Intérêts · jour ${day} (${pct(levelOf(b.savings).rate)})`, ref);
  return { day, amount, tx, milestones: reachMilestones(s) };
}

// ------------------------------------------------------------------------------------------------ deposits and withdrawals
export type BankResult = (Extract<MoveResult, { ok: true }> & { milestones: number[] }) | { ok: false; why: MoveRefusal | 'closed'; text: string };
/** A fresh idempotency key for one confirmation (created when the confirmation is shown, so its double tap is refused). */
export const newRef = (kind: 'dep' | 'ret') => `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
function op(s: GameState, kind: 'deposit' | 'withdraw', amount: number, o: { ref: string; where?: string }): BankResult {
  if (!isOpen(s)) return { ok: false, why: 'closed', text: 'Ouvre d’abord ton compte au guichet' };
  const deposit = kind === 'deposit', label = `Épargne Teranga · ${deposit ? 'dépôt' : 'retrait'}${o.where ? ` (${o.where})` : ''}`;
  const r = deposit ? move(s, 'wallet', 'savings', amount, { ref: o.ref, label }) : move(s, 'savings', 'wallet', amount, { ref: o.ref, label });
  return r.ok ? { ...r, milestones: reachMilestones(s) } : r;
}
/** Wallet → savings, all or nothing, once per ref. `where`: « agence de Pikine », « téléphone » (written in both histories). */
export const deposit = (s: GameState, amount: number, o: { ref: string; where?: string }) => op(s, 'deposit', amount, o);
/** Savings → wallet, all or nothing, once per ref. Never below zero. */
export const withdraw = (s: GameState, amount: number, o: { ref: string; where?: string }) => op(s, 'withdraw', amount, o);

/** What can be moved now: the quick amounts the source covers, and « Tout » (the whole source), for a deposit (from the wallet) or a withdrawal. */
export function chipsFor(s: GameState, kind: 'deposit' | 'withdraw'): { amounts: number[]; all: number } {
  const have = kind === 'deposit' ? s.data.wallet : s.data.bank.savings;
  return { amounts: BANK.chips.filter(c => c <= have), all: have };
}
/** A typed amount: digits, spaces and dots between thousands, an optional « F »; whole francs above 0. Null otherwise. */
export function parseAmount(text: string): number | null {
  const t = text.replace(/[\s  .]/g, '').replace(/(f|fcfa)$/i, '');
  if (!/^\d{1,16}$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n > 0 && n <= MONEY_MAX ? n : null;
}

// ------------------------------------------------------------------------------------------------ the goal
/** Short names of the goals offered (the venture's own name is said beside). */
const SHORT: Record<string, string> = { bana: 'Bana-bana', kiosque: 'Kiosque', boutique: 'Boutique' };
export interface GoalPreset { id: string; label: string; name: string; amount: number; perHour: number }
/** The goals offered: the ventures of ECONOMY.bank.goalTiers at the price the player would pay for the next unit (business.ts `nextPrice`). */
export function goalPresets(s: GameState): GoalPreset[] {
  return BANK.goalTiers.flatMap(id => {
    const v = VENTURES.find(x => x.id === id), amount = v ? nextPrice(s, id) : Infinity;
    return v && Number.isFinite(amount) ? [{ id, label: SHORT[id] ?? v.name, name: v.name, amount, perHour: perHourOf(id) }] : [];
  });
}
/** Sets the goal (a whole amount above 0; label at most 40 characters). False for a wrong amount. */
export function setGoal(s: GameState, amount: number, label: string): boolean {
  if (!Number.isSafeInteger(amount) || amount <= 0) return false;
  s.data.bank.goal = { amount, label: (label.trim() || 'Mon objectif').slice(0, 40) };
  return true;
}
export function clearGoal(s: GameState) { s.data.bank.goal = null; }
export interface GoalView { label: string; amount: number; saved: number; left: number; pct: number; reached: boolean; venture: GoalPreset | null }
export function goalView(s: GameState): GoalView | null {
  const g = s.data.bank.goal; if (!g) return null;
  const saved = s.data.bank.savings, venture = goalPresets(s).find(p => p.label === g.label) ?? null;
  return { label: g.label, amount: g.amount, saved, left: Math.max(0, g.amount - saved), pct: Math.floor(Math.min(1, saved / g.amount) * 100), reached: saved >= g.amount, venture };
}

// ------------------------------------------------------------------------------------------------ Pape Sarr's credit, as his rules would answer
export type SarrWhy = 'loan' | 'missed' | 'late' | 'price' | 'trust';
/**
 * What Pape Sarr (Sarr Auto) would answer to « Tu me fais crédit ? » for a Teranga now: his own rule (credit.ts `dealerOffer`) with the player's real trust
 * (the relationship store, as src/transport/sarrAuto.ts reads it), wallet and debts. When he would refuse, `why` is the rule that refuses (in his order).
 */
export function sarrCredit(s: GameState, trust = new Relations(s.data).level('sarr')): { verdict: 'accept' | 'counter' | 'refuse'; why: SarrWhy | null; price: number; trust: number } {
  const price = specOf('teranga')?.price ?? 0, loans = s.data.loans.list, D = C.dealer;
  const o = dealerOffer({ trust, price, wallet: s.data.wallet, loans });
  if (o.verdict !== 'refuse') return { verdict: o.verdict, why: null, price, trust };
  const why: SarrWhy | null = openLoans(loans, 'sarr').length ? 'loan' : missedWith(loans, 'sarr') >= D.missedLimit ? 'missed'
    : openLoans(loans).some(l => l.missed > 0 && l.paid < dueBy(l, l.checkedDay)) ? 'late' : price > D.maxPrice ? 'price' : D.tiers.some(t => trust >= t.trust) ? null : 'trust';
  return { verdict: 'refuse', why, price, trust };
}

// ------------------------------------------------------------------------------------------------ the conseillère's advice
const who = (l: LoanState) => (l.lender === 'sarr' ? 'Pape Sarr' : 'Modou');
/** « une Table de bana-bana », « un Kiosque », « une Boutique de quartier ». */
const withArticle = (id: string, name: string) => `${id === 'kiosque' || id === 'car_rapide' || id === 'restaurant' || id === 'immeuble' ? 'un' : 'une'} ${name}`;

/**
 * The conseillère's advice: 1–3 short lines, most urgent first, read from the real state only. Nothing here is invented: every price, amount and name is
 * the game's own (ECONOMY, the catalogue, the debts), and a credit is never promised.
 */
export function bankAdvice(s: GameState, o: { trust?: number } = {}): string[] {
  const d = s.data, b = d.bank, day = d.play.day, wallet = d.wallet, savings = b.savings, cash = wallet + savings;
  const lines: { p: number; t: string }[] = [], add = (p: number, t: string) => lines.push({ p, t });
  const open = openLoans(d.loans.list), stand = open.map(l => ({ l, st: standing(l, day) }));
  const late = stand.filter(x => x.st.late > 0);
  const first = goalPresets(s)[0] ?? null;

  // debts first: a late one, then the day's installment
  for (const { l, st } of late) add(100, `${who(l)} attend ${F(st.late)} en retard (${l.label}) : rembourse-le d’abord, chaque retard coûte de la confiance.${savings >= st.late ? ' Ton épargne peut le couvrir.' : ''}`);
  for (const { l, st } of stand) if (st.late <= 0 && st.next > 0 && st.nextDay <= day) add(80, `Versement du jour : ${F(st.next)} à ${who(l)} (${l.label}, reste ${F(st.left)}).`);

  if (!isOpen(s)) add(95, `Ouvre ton compte Épargne Teranga : c’est gratuit, ton argent est à l’abri et il rapporte ${rateText(levelOf(0))}.`);

  // the goal
  const g = goalView(s), v = g?.venture ?? null;
  if (g?.reached) {
    // the venture at the price it costs NOW (a unit bought since the goal was set makes the next one dearer): never « buy it » when it is beyond reach
    if (v && v.amount <= cash && !late.length) {
      const need = v.amount - wallet, it = withArticle(v.id, v.name);
      add(90, need > 0 ? `Objectif atteint : ${F(g.saved)} de côté. Retire ${F(need)} et achète ${it} (${F(v.amount)}) dans l’appli Affaires.` : `Objectif atteint ! Tu as de quoi acheter ${it} (${F(v.amount)}) dans l’appli Affaires.`);
    } else if (v && v.amount > cash) add(90, `Objectif ${g.label} atteint, mais le prix est maintenant de ${F(v.amount)} : encore ${F(v.amount - cash)}.`);
    else add(90, `Objectif « ${g.label} » atteint : ${F(g.saved)} de côté. Bravo !`);
  } else if (g) add(60, `Objectif ${g.label} : ${F(g.saved)} sur ${F(g.amount)}, encore ${F(g.left)} à mettre de côté.`);
  else if (isOpen(s) && first) add(40, `Fixe-toi un objectif : ${withArticle(first.id, first.name)} coûte ${F(first.amount)}${cash < first.amount ? `, il te manque ${F(first.amount - cash)}` : ''}.`);

  // a venture within reach (wallet + savings), never one beyond it; not while a debt is late
  const reach = [...goalPresets(s)].reverse().find(p => p.amount <= cash) ?? null;
  if (reach && !late.length && !(g?.reached && g.venture?.id === reach.id)) {
    add(70, `Avec ${F(cash)} entre portefeuille et épargne, ${withArticle(reach.id, reach.name)} (${F(reach.amount)}, environ ${F(reach.perHour)} par heure en ville) est à ta portée.`);
  } else if (!reach && first && ownedOf(s, first.id) === 0 && !isOpen(s)) {
    add(35, `Première affaire : ${withArticle(first.id, first.name)}, ${F(first.amount)}. Il te manque ${F(first.amount - cash)}.`);
  }

  // a car for the VTC rides: Pape Sarr's credit, as his rules would answer today (once the player has the price of a first venture)
  const cars = assetsOf(s, 'vehicle').filter(a => a.spec !== 'jakarta').length;
  if (!cars && first && cash >= first.amount) {
    const sc = sarrCredit(s, o.trust);
    if (sc.verdict !== 'refuse') add(50, `Une voiture pour les courses VTC ? Pape Sarr (Sarr Auto, Pikine) étudiera ta demande de crédit pour une Teranga.`);
    else if (sc.why === 'trust') add(45, `Pour un crédit voiture, Pape Sarr veut d’abord mieux te connaître : rends-lui quelques services à Sarr Auto (Pikine).`);
    else if (sc.why === 'missed') add(45, `Pape Sarr ne fait plus crédit après trop de retards : chez lui, une voiture se paie comptant.`);
    else if (sc.why === 'late' && !late.length) add(45, `Pape Sarr ne fera pas crédit tant qu’une dette est en retard : règle-la d’abord.`);
  }

  // saving itself
  if (isOpen(s)) {
    const next = nextLevelOf(savings);
    if (savings <= 0 && wallet >= BANK.chips[0]) add(42, `Mets de côté ce que tu ne dépenses pas tout de suite : ton épargne rapporte ${rateText(levelOf(0))}.`);
    else if (next && savings > 0) add(20, `Encore ${F(next.from - savings)} d’épargne pour passer à ${rateText(next)}.`);
    add(0, `Ton épargne : ${F(savings)}, ${rateText(levelOf(savings))}.`);
  }
  if (!lines.length) add(0, `Ton portefeuille : ${F(wallet)}.`);
  return lines.sort((a, z) => z.p - a.p).slice(0, 3).map(x => x.t);
}
