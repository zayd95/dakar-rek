import { describe, expect, it } from 'vitest';
import { loadSave, newSave, writeSave, type KV } from '../src/core/save';
import { GameState } from '../src/core/state';
import { rng } from '../src/core/rng';
import { ECONOMY } from '../src/economy/config';
import { consistent } from '../src/economy/money';
import { addOwned } from '../src/economy/assets';
import { nextPrice } from '../src/economy/business';
import { dealerOffer, openLoan, standing } from '../src/economy/credit';
import { specOf } from '../src/economy/catalog';
import { fcfaText } from '../src/economy/format';
import { Relations } from '../src/social/relations';
import {
  BANK, MILESTONES, bankAdvice, chipsFor, deposit, goalPresets, goalView, interestFor, levelOf, nextLevelOf, openAccount, parseAmount, payInterest, rateText,
  reachMilestones, sarrCredit, setGoal, withdraw,
} from '../src/economy/bank';
import { CITY_ACTIONS } from '../src/world/cityContent';

/**
 * Banque Teranga v1 (src/economy/bank.ts): the account at the counter, deposits and withdrawals on the money contract, interest once per player day
 * (capped, never offline, never for days away), the levels celebrated once, the goal from the ventures' real prices, and the conseillère's advice that
 * never promises a credit Pape Sarr's rules would refuse, nor a venture the player cannot pay.
 */
const mem = (m = new Map<string, string>()): KV => ({ getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } });
const player = (wallet = 60_000, day = 4) => { const s = new GameState(newSave(1000)); s.data.wallet = wallet; s.data.play.day = day; return s; };
const opened = (wallet = 60_000, day = 4) => { const s = player(wallet, day); openAccount(s); return s; };
const F = fcfaText;
const trustOf = (s: GameState) => new Relations(s.data).level('sarr');
const setTrust = (s: GameState, v: number) => { new Relations(s.data).change('sarr', 'player', v - trustOf(s)); };
const teranga = () => specOf('teranga')!.price!;
const sarrLoan = (s: GameState, o: Partial<{ paid: number; missed: number; day: number }> = {}) => {
  const l = openLoan(s.data.loans.list, ++s.data.loans.seq, { lender: 'sarr', kind: 'vehicle', label: 'Teranga blanche · crédit Sarr Auto', principal: 3_400_000, installment: 10_000, every: 1, day: o.day ?? 1 });
  l.paid = o.paid ?? 0; l.missed = o.missed ?? 0; return l;
};

describe('the account at the counter', () => {
  it('is opened once, for free, on the player’s day; nothing moves before it is open', () => {
    const s = player();
    const r = deposit(s, 5_000, { ref: 'a' });
    expect(r.ok ? 'ok' : r.why).toBe('closed');
    expect(s.data.wallet).toBe(60_000);
    expect(openAccount(s)).toBe(true); expect(openAccount(s)).toBe(false);
    expect(s.data.bank.opened).toBe(4); expect(s.data.wallet).toBe(60_000);
  });

  it('a deposit and a withdrawal move the exact amount, write where they were made, and a confirmation’s ref is applied once (double tap)', () => {
    const s = opened();
    const r = deposit(s, 25_000, { ref: 'dep-1', where: 'agence de Pikine' });
    expect(r.ok).toBe(true);
    expect([s.data.wallet, s.data.bank.savings]).toEqual([35_000, 25_000]);
    expect(s.data.ledger.at(-1)).toMatchObject({ amount: -25_000, label: 'Épargne Teranga · dépôt (agence de Pikine)' });
    expect(s.data.bank.tx.at(-1)).toMatchObject({ kind: 'deposit', amount: 25_000, ref: 'dep-1' });
    const again = deposit(s, 25_000, { ref: 'dep-1', where: 'agence de Pikine' });
    expect(again.ok ? 'ok' : again.why).toBe('duplicate');
    expect([s.data.wallet, s.data.bank.savings, s.data.bank.tx.length]).toEqual([35_000, 25_000, 1]);
    expect(withdraw(s, 10_000, { ref: 'ret-1', where: 'téléphone' }).ok).toBe(true);
    expect([s.data.wallet, s.data.bank.savings]).toEqual([45_000, 15_000]);
    expect(s.data.bank.tx.at(-1)!.label).toBe('Épargne Teranga · retrait (téléphone)');
    expect(consistent(s)).toBe(true);
  });

  it('no overdraft, on either side; a refused operation changes nothing', () => {
    const s = opened(10_000), before = JSON.stringify(s.data);
    expect(deposit(s, 10_001, { ref: 'x1' }).ok).toBe(false);
    expect(withdraw(s, 1, { ref: 'x2' }).ok).toBe(false);
    expect(JSON.stringify(s.data)).toBe(before);
  });

  it('quick amounts: only those the source covers, and « Tout » is the whole source', () => {
    const s = opened(30_000);
    expect(chipsFor(s, 'deposit')).toEqual({ amounts: [5_000, 10_000, 25_000], all: 30_000 });
    expect(chipsFor(s, 'withdraw')).toEqual({ amounts: [], all: 0 });
    deposit(s, 30_000, { ref: 'all' });
    expect(chipsFor(s, 'withdraw')).toEqual({ amounts: [5_000, 10_000, 25_000], all: 30_000 });
  });

  it('a typed amount: whole francs, thousands separated by spaces or dots, an optional F; nothing else', () => {
    expect(parseAmount('15000')).toBe(15_000); expect(parseAmount('15 000')).toBe(15_000); expect(parseAmount('15.000 F')).toBe(15_000);
    expect(parseAmount('1 500 000')).toBe(1_500_000);
    for (const bad of ['', '0', '-5', '2,5', 'abc', '12e3', '99999999999999999']) expect(parseAmount(bad), bad).toBeNull();
  });
});

describe('interest: once per player day played, small, capped', () => {
  it('the levels are small next to work (a Tiak delivery pays 1 000–2 400 F) and shown plainly', () => {
    for (const l of BANK.levels) { expect(l.rate).toBeLessThanOrEqual(0.01); expect(l.cap).toBeLessThanOrEqual(1_000); }
    expect(rateText(levelOf(30_000))).toBe('+1 % par jour de jeu, 250 F max');
    expect(rateText(levelOf(0))).toBe('+0,5 % par jour de jeu, 100 F max');
    expect([interestFor(10_000), interestFor(24_999), interestFor(25_000), interestFor(80_000), interestFor(400_000), interestFor(5_000_000)]).toEqual([50, 100, 250, 250, 500, 1_000]);
    expect(nextLevelOf(30_000)!.from).toBe(100_000); expect(nextLevelOf(10_000_000)).toBeNull();
  });

  it('paid once on a new player day, on the savings carried into it; never on the day the account was opened; never twice the same day', () => {
    const s = opened(60_000, 4);
    deposit(s, 20_000, { ref: 'd' });
    expect(payInterest(s)).toMatchObject({ day: 4, amount: 0 });          // opened today: from tomorrow
    expect(payInterest(s)).toBeNull();
    s.data.play.day = 5;
    const r = payInterest(s)!;
    expect(r.amount).toBe(100);                                             // 0,5 % of 20 000 F, at the cap
    expect(s.data.bank.savings).toBe(20_100); expect(s.data.bank.tx.at(-1)).toMatchObject({ kind: 'interest', amount: 100, day: 5 });
    expect(payInterest(s)).toBeNull();                                      // the same day again (a reload, another frame)
    expect(s.data.wallet).toBe(40_000);                                     // interest goes to the savings, never the wallet
    expect(consistent(s)).toBe(true);
  });

  it('days away are not paid: coming back several city days later is one more player day, one interest', () => {
    const s = opened(200_000, 2); deposit(s, 150_000, { ref: 'd' }); payInterest(s);
    s.data.play.day = 3;                                                    // the player's day only moves by one when they come back (streak.ts advancePlay)
    expect(payInterest(s)!.amount).toBe(500);
    // even a save whose day jumped (an old one, a hand edit) is paid one day, not the gap
    s.data.play.day = 40;
    expect(payInterest(s)!.amount).toBe(500);
    expect(s.data.bank.tx.filter(t => t.kind === 'interest')).toHaveLength(2);
  });

  it('a thousand player days stay within the cap of each day, and the account agrees with its history', () => {
    const s = opened(3_000_000, 1), R = rng(7);
    deposit(s, 1_000_000, { ref: 'big' });
    for (let day = 2; day < 1_002; day++) {
      s.data.play.day = day;
      const before = s.data.bank.savings, r = payInterest(s);
      expect(r).not.toBeNull();
      expect(r!.amount).toBe(interestFor(before)); expect(r!.amount).toBeLessThanOrEqual(levelOf(before).cap);
      if (R() < 0.3) withdraw(s, Math.min(s.data.bank.savings, 1 + Math.floor(R() * 200_000)), { ref: `w${day}` });
    }
    expect(consistent(s)).toBe(true);
  });

  it('no account, or no day played yet: nothing', () => {
    const s = player(); expect(payInterest(s)).toBeNull();
    const t = opened(50_000, 0); deposit(t, 30_000, { ref: 'd' }); expect(payInterest(t)).toBeNull();
  });
});

describe('levels reached are celebrated once each', () => {
  it('a deposit reaching a level celebrates it; going down and back up does not again; interest crossing one does', () => {
    expect(MILESTONES).toEqual(ECONOMY.bank.levels.slice(1).map(l => l.from));
    const s = opened(500_000, 1);
    expect(deposit(s, 30_000, { ref: 'a' })).toMatchObject({ ok: true, milestones: [25_000] });
    expect(withdraw(s, 20_000, { ref: 'b' }).ok).toBe(true);
    expect(deposit(s, 20_000, { ref: 'c' })).toMatchObject({ ok: true, milestones: [] });
    expect(deposit(s, 400_000, { ref: 'd' })).toMatchObject({ ok: true, milestones: [100_000] });
    expect(deposit(s, 69_950, { ref: 'e' })).toMatchObject({ ok: true, milestones: [] });         // 499 950 F
    expect(s.data.bank.savings).toBe(499_950);
    s.data.play.day = 2;
    expect(payInterest(s)).toMatchObject({ amount: 500, milestones: [500_000] });
    expect(s.data.bank.milestones).toEqual([25_000, 100_000, 500_000]);
    expect(reachMilestones(s)).toEqual([]);
  });
});

describe('the goal', () => {
  it('the ventures offered are read from ECONOMY.business at the price the next unit costs', () => {
    const s = opened();
    const tiers = Object.fromEntries(ECONOMY.business.tiers.map(t => [t.id, t.price]));
    expect(goalPresets(s).map(p => [p.label, p.amount])).toEqual([['Bana-bana', tiers.bana], ['Kiosque', tiers.kiosque], ['Boutique', tiers.boutique]]);
    addOwned(s, 'bana', tiers.bana);
    expect(goalPresets(s)[0].amount).toBe(nextPrice(s, 'bana')); expect(goalPresets(s)[0].amount).toBeGreaterThan(tiers.bana);
  });

  it('progress, what is left, reached; a free amount; a wrong amount is refused', () => {
    const s = opened(100_000);
    expect(setGoal(s, 50_000, 'Bana-bana')).toBe(true);
    deposit(s, 20_000, { ref: 'a' });
    expect(goalView(s)).toMatchObject({ label: 'Bana-bana', amount: 50_000, saved: 20_000, left: 30_000, pct: 40, reached: false });
    expect(goalView(s)!.venture?.id).toBe('bana');
    deposit(s, 30_000, { ref: 'b' });
    expect(goalView(s)).toMatchObject({ left: 0, pct: 100, reached: true });
    expect(setGoal(s, 0, 'x')).toBe(false); expect(setGoal(s, 2.5, 'x')).toBe(false);
    expect(setGoal(s, 80_000, 'Mon projet')).toBe(true); expect(goalView(s)!.venture).toBeNull();
  });

  it('the goal, the history and the balances survive a reload exactly', () => {
    const store = mem(), s = opened(90_000);
    setGoal(s, 50_000, 'Bana-bana'); deposit(s, 25_000, { ref: 'a' }); withdraw(s, 5_000, { ref: 'b' });
    s.data.play.day = 5; payInterest(s);
    writeSave(store, s.data);
    const back = loadSave(store)!;
    expect(back.bank).toEqual(s.data.bank); expect(back.wallet).toBe(s.data.wallet);
    // the day already paid stays paid after the reload
    const again = new GameState(back); expect(payInterest(again)).toBeNull();
  });
});

describe('the conseillère’s advice', () => {
  it('1 to 3 short lines, from the real state', () => {
    const s = opened(50_000);
    const lines = bankAdvice(s);
    expect(lines.length).toBeGreaterThanOrEqual(1); expect(lines.length).toBeLessThanOrEqual(3);
    for (const l of lines) expect(l.length).toBeLessThan(170);
  });

  it('a player reaching 50 000 F: a first business within reach, and Pape Sarr only as his rules would answer (a stranger: get to know him first)', () => {
    const s = opened(50_000);
    expect(trustOf(s)).toBeLessThan(20);
    const lines = bankAdvice(s).join(' | ');
    expect(lines).toContain(`Table de bana-bana (${F(50_000)}, environ ${F(400)} par heure en ville) est à ta portée`);
    expect(lines).not.toContain('étudiera');
    expect(lines).toContain('Pape Sarr veut d’abord mieux te connaître');
  });

  it('with enough trust, Pape Sarr « étudiera ta demande », never more than that', () => {
    const s = opened(50_000); setTrust(s, 30);
    expect(dealerOffer({ trust: 30, price: teranga(), wallet: 50_000, loans: [] }).verdict).not.toBe('refuse');
    const lines = bankAdvice(s).join(' | ');
    expect(lines).toContain('Pape Sarr (Sarr Auto, Pikine) étudiera ta demande de crédit pour une Teranga');
    expect(lines).not.toMatch(/t’accordera|accordé|garanti|il te fera crédit/);
  });

  it('a car already owned, or a credit already running with him: no car credit suggested', () => {
    const s = opened(50_000); setTrust(s, 60); addOwned(s, 'teranga', teranga());
    expect(bankAdvice(s).join(' ')).not.toContain('Pape Sarr');
    const t = opened(80_000, 3); setTrust(t, 60); sarrLoan(t, { day: 3 });
    expect(sarrCredit(t).why).toBe('loan');
    expect(bankAdvice(t).join(' ')).not.toContain('étudiera');
  });

  it('a late debt comes first, with the real amount, and no purchase is suggested while it lasts', () => {
    const s = opened(400_000, 10); setTrust(s, 60);
    const l = sarrLoan(s, { day: 1, paid: 10_000 });
    const st = standing(l, 10);
    expect(st.late).toBeGreaterThan(0);
    const lines = bankAdvice(s);
    expect(lines[0]).toContain(`Pape Sarr attend ${F(st.late)} en retard`);
    expect(lines.join(' ')).not.toContain('à ta portée');
    expect(lines.join(' ')).not.toContain('étudiera');
  });

  it('too many missed dates with him: says he only sells for cash now (his own rule), never that he would study a credit', () => {
    const s = opened(100_000, 30); setTrust(s, 80);
    const l = sarrLoan(s, { missed: 3, day: 1 }); l.paid = l.principal; l.status = 'closed';
    expect(sarrCredit(s).why).toBe('missed');
    const lines = bankAdvice(s).join(' ');
    expect(lines).toContain('Pape Sarr ne fait plus crédit');
    expect(lines).not.toContain('étudiera');
  });

  it('the goal reached: buy it now if the money is there, from the wallet or by withdrawing exactly what is missing', () => {
    const s = opened(60_000); setGoal(s, 50_000, 'Bana-bana'); deposit(s, 50_000, { ref: 'g' });
    expect(bankAdvice(s)[0]).toBe(`Objectif atteint : ${F(50_000)} de côté. Retire ${F(40_000)} et achète une Table de bana-bana (${F(50_000)}) dans l’appli Affaires.`);
    // a bana bought since the goal was set: the next one is dearer and beyond the cash, so it is never called affordable
    addOwned(s, 'bana', 50_000); s.data.wallet = 0;
    const line = bankAdvice(s)[0];
    expect(line).toContain(`le prix est maintenant de ${F(nextPrice(s, 'bana'))}`);
    expect(line).not.toContain('achète');
  });

  it('a stranger to the bank is told to open an account, for free, with the real rate', () => {
    const s = player(20_000);
    expect(bankAdvice(s).join(' ')).toContain(`Ouvre ton compte Épargne Teranga : c’est gratuit, ton argent est à l’abri et il rapporte ${rateText(levelOf(0))}`);
  });

  it('over a thousand random lives: never a credit his rules refuse, never a venture beyond the cash, never an unknown name', () => {
    const R = rng(2026), pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)];
    let studied = 0, reach = 0;
    for (let i = 0; i < 1500; i++) {
      const day = 1 + Math.floor(R() * 40), s = R() < 0.85 ? opened(0, day) : player(0, day);
      s.data.wallet = pick([0, 3_000, 20_000, 49_999, 50_000, 120_000, 300_000, 900_000, 2_000_000, 7_000_000]);
      if (s.data.bank.opened >= 0 && s.data.wallet > 0) deposit(s, Math.floor(s.data.wallet * R()), { ref: `r${i}` });
      setTrust(s, Math.floor(R() * 120) - 30);
      if (R() < 0.3) { const l = sarrLoan(s, { day: Math.max(1, day - Math.floor(R() * 20)), paid: Math.floor(R() * 30) * 10_000, missed: Math.floor(R() * 4) }); if (R() < 0.4) { l.paid = l.principal; l.status = 'closed'; } }
      if (R() < 0.2) addOwned(s, 'teranga', teranga());
      if (R() < 0.3) addOwned(s, 'bana', 50_000);
      if (R() < 0.4) setGoal(s, pick([50_000, 300_000, 1_500_000, 75_000]), pick(['Bana-bana', 'Kiosque', 'Boutique', 'Mon projet']));
      const lines = bankAdvice(s), all = lines.join(' | '), cash = s.data.wallet + s.data.bank.savings;
      expect(lines.length).toBeGreaterThanOrEqual(1); expect(lines.length).toBeLessThanOrEqual(3);
      const offer = dealerOffer({ trust: trustOf(s), price: teranga(), wallet: s.data.wallet, loans: s.data.loans.list });
      if (all.includes('étudiera')) { studied++; expect(offer.verdict).not.toBe('refuse'); }
      expect(sarrCredit(s).verdict === 'refuse').toBe(offer.verdict === 'refuse');
      if (offer.verdict === 'refuse') expect(sarrCredit(s).why).not.toBeNull();
      for (const l of lines) {
        if (/à ta portée|achète|de quoi acheter/.test(l)) {
          reach++;
          const p = goalPresets(s).find(x => l.includes(x.name));
          expect(p, l).toBeDefined(); expect(p!.amount).toBeLessThanOrEqual(cash);
        }
        expect(l).not.toMatch(/undefined|NaN|Infinity/);
      }
    }
    expect(studied).toBeGreaterThan(20); expect(reach).toBeGreaterThan(20);           // both kinds of line did occur
  });
});

describe('the counter', () => {
  it('both agencies offer the account and the conseillère (one place content for Pikine and Plateau); the old conversation’s social effect is kept', () => {
    const ids = CITY_ACTIONS.bank.map(a => a.id);
    expect(ids).toEqual(['compte-ouvrir', 'epargne', 'courrier', 'conseiller']);
    const s = player(), open = CITY_ACTIONS.bank[0], mine = CITY_ACTIONS.bank[1];
    expect([open.visible!(s), mine.visible!(s)]).toEqual([true, false]);
    openAccount(s);
    expect([open.visible!(s), mine.visible!(s)]).toEqual([false, true]);
    const advice = CITY_ACTIONS.bank[3];
    expect(advice).toMatchObject({ special: 'bankAdvice', needs: { social: 10, moral: 5 }, counter: 'chats' });
    expect(advice.label).not.toContain('Parler de son projet');
  });
});
