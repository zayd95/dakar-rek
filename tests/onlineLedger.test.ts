import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/economy/config';
import { applyMoney, closeAsk, createAsk, memoryLedger, openAccount, serverDay, type LedgerStore, type MoneyRequest } from '../src/online/ledgerRules';
import { rng } from '../src/core/rng';
import type { MoneyLimits } from '../src/online/protocol';

/**
 * LD2.0-B Teranga Money (docs/ld2/LD2_B_CONTRACT.md « The ledger »): the pure rules the `ledger` Durable Object runs inside one transaction.
 * Conservation, never negative, exactly once by op id, the limits, a request paid at most once, and all-or-nothing.
 */
const L: MoneyLimits = { opMax: ECONOMY.online.opMax, fundDayMax: ECONOMY.online.fundDayMax, sendDayMax: ECONOMY.online.sendDayMax, receiveDayMax: ECONOMY.online.receiveDayMax, balanceMax: ECONOMY.online.balanceMax };
const A = 'aaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbb', C = 'cccccccccccccccc';
const T0 = Date.UTC(2026, 9, 25, 10);
const setup = () => { const s = memoryLedger(); for (const t of [A, B, C]) openAccount(s, t, T0); return s; };
const run = (s: ReturnType<typeof memoryLedger>, r: MoneyRequest, now = T0) => s.transaction(() => applyMoney(s, r, now, L));
const bal = (s: LedgerStore, t: string) => s.account(t)!.balance;
const fund = (id: string, tag: string, amount: number): MoneyRequest => ({ kind: 'fund', id, tag, amount });
const pay = (id: string, tag: string, to: string, amount: number, extra: { fund?: number; req?: string; note?: string } = {}): MoneyRequest => ({ kind: 'pay', id, tag, to, amount, fund: extra.fund ?? 0, ...(extra.req ? { req: extra.req } : {}), ...(extra.note ? { note: extra.note } : {}) });
const reason = (r: { ok: boolean; reason?: string }) => (r.ok ? 'ok' : r.reason);

describe('Teranga Money ledger rules', () => {
  it('the limits are the contract’s', () => {
    expect(L).toEqual({ opMax: 250_000, fundDayMax: 500_000, sendDayMax: 500_000, receiveDayMax: 1_000_000, balanceMax: 5_000_000 });
  });

  it('a top-up, a send of 5 000 F and a withdrawal: one debit, one credit, nothing created', () => {
    const s = setup();
    expect(run(s, fund('op-fund-1', A, 20_000))).toMatchObject({ ok: true, duplicate: false, balance: 20_000, op: { kind: 'fund', to: A, amount: 20_000 } });
    const p = run(s, pay('op-pay-001', A, B, 5_000, { note: 'Pour le taxi' }));
    expect(p).toMatchObject({ ok: true, balance: 15_000, op: { kind: 'pay', from: A, to: B, amount: 5_000, note: 'Pour le taxi' }, to: { balance: 5_000 } });
    expect([bal(s, A), bal(s, B)]).toEqual([15_000, 5_000]);
    expect(run(s, { kind: 'cashout', id: 'op-cash-01', tag: B, amount: 2_000 })).toMatchObject({ ok: true, balance: 3_000, op: { kind: 'cashout', from: B } });
    expect(s.account(A)!.sent).toBe(5_000); expect(s.account(B)!.received).toBe(5_000); expect(s.account(A)!.funded).toBe(20_000);
  });

  it('the same op id twice (a double tap, a resend after a reconnect) is applied once and answers the first result', () => {
    const s = setup(); run(s, fund('op-fund-1', A, 20_000));
    const first = run(s, pay('op-pay-002', A, B, 5_000));
    const again = run(s, pay('op-pay-002', A, B, 5_000));
    const changed = run(s, pay('op-pay-002', A, B, 9_999));             // the same id with other numbers: still the first one
    expect(first.ok && !first.duplicate).toBe(true);
    expect(again).toMatchObject({ ok: true, duplicate: true, op: { id: 'op-pay-002', amount: 5_000 }, balance: 15_000 });
    expect(changed).toMatchObject({ ok: true, duplicate: true, op: { amount: 5_000 } });
    expect([bal(s, A), bal(s, B)]).toEqual([15_000, 5_000]);
    expect(reason(run(s, pay('op-pay-002', B, A, 1_000)))).toBe('invalid');   // another account's id: refused, nothing said about it
    expect(reason(run(s, fund('op-fund-1', A, 20_000))) === 'ok' && bal(s, A)).toBe(15_000);
  });

  it('a send may carry a top-up from the wallet in the same operation', () => {
    const s = setup(); run(s, fund('op-fund-1', A, 3_000));
    expect(reason(run(s, pay('op-pay-003', A, B, 5_000)))).toBe('insufficient');
    const r = run(s, pay('op-pay-004', A, B, 5_000, { fund: 2_000 }));
    expect(r).toMatchObject({ ok: true, balance: 0, op: { fund: 2_000 }, today: { funded: 5_000, sent: 5_000 } });
    expect(bal(s, B)).toBe(5_000);
    expect(reason(run(s, pay('op-pay-005', A, B, 5_000, { fund: 6_000 })))).toBe('amount');   // never more top-up than the send
    expect(reason(run(s, pay('op-pay-006', A, B, 5_000, { fund: -1 })))).toBe('amount');
  });

  it('refuses with the reason and changes nothing', () => {
    const s = setup(); run(s, fund('op-fund-1', A, 100_000));
    const before = JSON.stringify([...s.accounts()]);
    for (const [r, why] of [
      [pay('op-r-00001', A, B, 0), 'amount'], [pay('op-r-00002', A, B, -5), 'amount'], [pay('op-r-00003', A, B, 2.5), 'amount'],
      [pay('op-r-00004', A, B, 250_001, { fund: 200_000 }), 'limit-op'], [pay('op-r-00005', A, A, 100), 'self'],
      [pay('op-r-00006', A, 'dddddddddddddddd', 100), 'unknown-recipient'], [pay('op-r-00007', A, B, 100_001), 'insufficient'],
      [{ kind: 'cashout', id: 'op-r-00008', tag: A, amount: 100_001 } as MoneyRequest, 'insufficient'],
      [fund('op-r-00009', A, 250_001), 'limit-op'], [fund('op-r-00010', 'eeeeeeeeeeeeeeee', 10), 'invalid'],
    ] as const) expect(reason(run(s, r)), r.id).toBe(why);
    expect(JSON.stringify([...s.accounts()])).toBe(before);
    expect(s.ops().size).toBe(1);                                         // refusals are never stored
  });

  it('daily limits: top-ups, sends, receipts; they start again at the next UTC day', () => {
    const s = setup();
    expect(run(s, fund('f-day-0001', A, 250_000)).ok && run(s, fund('f-day-0002', A, 250_000)).ok).toBe(true);
    expect(reason(run(s, fund('f-day-0003', A, 1)))).toBe('limit-fund');
    expect(reason(run(s, pay('p-day-0001', A, B, 10, { fund: 10 })))).toBe('limit-fund');
    expect(run(s, pay('p-day-0002', A, B, 250_000)).ok && run(s, pay('p-day-0003', A, B, 250_000)).ok).toBe(true);
    expect(reason(run(s, pay('p-day-0004', B, A, 1)))).toBe('ok');        // B may still send
    expect(reason(run(s, pay('p-day-0005', A, B, 1)))).toBe('limit-send');   // (it has 1 F from B: the day's sends are spent)
    const next = T0 + 86_400_000;
    expect(serverDay(next)).toBe(serverDay(T0) + 1);
    expect(run(s, fund('f-day-0004', A, 250_000), next)).toMatchObject({ ok: true, today: { funded: 250_000, sent: 0, received: 0 } });
    expect(run(s, pay('p-day-0006', A, B, 200_000), next).ok).toBe(true);
    expect(run(s, fund('f-day-0005', A, 250_000), next).ok && run(s, pay('p-day-0007', A, B, 250_000), next).ok).toBe(true);
    expect(reason(run(s, pay('p-day-0008', A, B, 60_000), next))).toBe('limit-send');
    // receiving: C gets 1 000 000 F in a day at most
    const r = setup(); for (const t of [A, B]) openAccount(r, t, T0);
    let n = 0; const give = (from: string, amount: number) => run(r, pay(`p-rcv-${String(++n).padStart(4, '0')}`, from, C, amount, { fund: amount }));
    expect([give(A, 250_000), give(A, 250_000), give(B, 250_000), give(B, 250_000)].every(x => x.ok)).toBe(true);
    expect(reason(run(r, fund('f-rcv-0001', B, 100), T0))).toBe('limit-fund');
    const D = 'dddddddddddddddd'; openAccount(r, D, T0);
    expect(reason(run(r, pay('p-rcv-9999', D, C, 1, { fund: 1 }), T0))).toBe('limit-receive');   // a fresh sender: C has received its day's 1 000 000 F
    expect(r.account(C)!.balance).toBe(1_000_000);
  });

  it('the balance never goes above its limit', () => {
    const s = setup(); s.putAccount({ ...s.account(B)!, balance: 4_999_000 });
    expect(reason(run(s, fund('f-max-0001', B, 1_001)))).toBe('limit-balance');
    expect(reason(run(s, pay('p-max-0001', A, B, 1_001, { fund: 1_001 })))).toBe('limit-balance');
    expect(reason(run(s, pay('p-max-0002', A, B, 1_000, { fund: 1_000 })))).toBe('ok');
    expect(bal(s, B)).toBe(5_000_000);
  });

  it('someone who blocked you cannot be paid or asked (unavailable); the block lifts', () => {
    const s = setup(); run(s, fund('op-fund-1', A, 10_000));
    s.putBlock(B, A, true);
    expect(reason(run(s, pay('p-blk-0001', A, B, 100)))).toBe('unavailable');
    expect(reason(createAsk(s, { id: 'ask-blk-01', payee: A, payer: B, amount: 100 }, T0, L))).toBe('unavailable');
    expect(reason(run(s, pay('p-blk-0002', B, A, 0)))).toBe('amount');   // B may still pay A (B blocked, not A)
    s.putBlock(B, A, false);
    expect(reason(run(s, pay('p-blk-0003', A, B, 100)))).toBe('ok');
  });

  it('a request is paid at most once, by the right payer, to the right payee, for its amount', () => {
    const s = setup(); run(s, fund('op-fund-1', A, 50_000));
    const ask = createAsk(s, { id: 'ask-0000001', payee: B, payer: A, amount: 5_000, note: 'Le ndogou' }, T0, L);
    expect(ask).toMatchObject({ ok: true, duplicate: false, ask: { state: 'open', payee: B, payer: A } });
    expect(createAsk(s, { id: 'ask-0000001', payee: B, payer: A, amount: 5_000 }, T0, L)).toMatchObject({ ok: true, duplicate: true });
    expect(reason(run(s, pay('p-ask-0001', A, B, 4_000, { req: 'ask-0000001' })))).toBe('request-mismatch');
    expect(reason(run(s, pay('p-ask-0002', C, B, 5_000, { req: 'ask-0000001', fund: 5_000 })))).toBe('request-mismatch');
    expect(reason(run(s, pay('p-ask-0003', A, C, 5_000, { req: 'ask-0000001' })))).toBe('request-mismatch');
    expect(reason(run(s, pay('p-ask-0004', A, B, 5_000, { req: 'nope-nope-1' })))).toBe('request-mismatch');
    const paid = run(s, pay('p-ask-0005', A, B, 5_000, { req: 'ask-0000001' }));
    expect(paid).toMatchObject({ ok: true, ask: { state: 'paid', paidBy: 'p-ask-0005' }, op: { req: 'ask-0000001' } });
    expect(reason(run(s, pay('p-ask-0006', A, B, 5_000, { req: 'ask-0000001' })))).toBe('request-closed');   // a second id: refused
    expect(run(s, pay('p-ask-0005', A, B, 5_000, { req: 'ask-0000001' }))).toMatchObject({ ok: true, duplicate: true, ask: { state: 'paid' } });
    expect([bal(s, A), bal(s, B)]).toEqual([45_000, 5_000]);
    expect(reason(closeAsk(s, { ref: 'ask-0000001', how: 'declined', by: A }))).toBe('request-closed');
  });

  it('a request is declined by its payer or cancelled by its payee, once', () => {
    const s = setup();
    createAsk(s, { id: 'ask-0000002', payee: B, payer: A, amount: 1_000 }, T0, L);
    expect(reason(closeAsk(s, { ref: 'ask-0000002', how: 'cancelled', by: A }))).toBe('invalid');
    expect(reason(closeAsk(s, { ref: 'ask-0000002', how: 'declined', by: B }))).toBe('invalid');
    expect(reason(closeAsk(s, { ref: 'ask-0000002', how: 'declined', by: C }))).toBe('not-found');
    expect(closeAsk(s, { ref: 'ask-0000002', how: 'declined', by: A })).toMatchObject({ ok: true, duplicate: false, ask: { state: 'declined' } });
    expect(closeAsk(s, { ref: 'ask-0000002', how: 'declined', by: A })).toMatchObject({ ok: true, duplicate: true });
    expect(reason(closeAsk(s, { ref: 'ask-0000002', how: 'cancelled', by: B }))).toBe('request-closed');
    expect(reason(run(s, pay('p-ask-0010', A, B, 1_000, { fund: 1_000, req: 'ask-0000002' })))).toBe('request-closed');
    expect(reason(createAsk(s, { id: 'ask-0000003', payee: B, payer: B, amount: 1_000 }, T0, L))).toBe('self');
    expect(reason(createAsk(s, { id: 'ask-0000004', payee: B, payer: A, amount: 250_001 }, T0, L))).toBe('limit-op');
    expect(reason(createAsk(s, { id: 'ask-0000005', payee: B, payer: 'dddddddddddddddd', amount: 10 }, T0, L))).toBe('unknown-recipient');
  });

  it('all or nothing: a write that fails half-way leaves every row as it was', () => {
    for (let failAt = 1; failAt <= 4; failAt++) {
      const s = setup(); run(s, fund('op-fund-1', A, 50_000));
      createAsk(s, { id: 'ask-atom-01', payee: B, payer: A, amount: 5_000 }, T0, L);
      const before = JSON.stringify([[...s.accounts()], [...s.ops()], [...s.asks()]]);
      let writes = 0;
      const tick = () => { if (++writes === failAt) throw new Error('disk full'); };
      const flaky: LedgerStore = { ...s, putAccount: a => { tick(); s.putAccount(a); }, putOp: o => { tick(); s.putOp(o); }, putAsk: r => { tick(); s.putAsk(r); } };
      expect(() => s.transaction(() => applyMoney(flaky, pay('p-atom-001', A, B, 5_000, { req: 'ask-atom-01' }), T0, L))).toThrow('disk full');
      expect(JSON.stringify([[...s.accounts()], [...s.ops()], [...s.asks()]]), `fail at write ${failAt}`).toBe(before);
      expect(run(s, pay('p-atom-001', A, B, 5_000, { req: 'ask-atom-01' })).ok).toBe(true);   // and the same id goes through afterwards
    }
  });

  it('a thousand random operations: conservation, never negative, never above the limits, each id once, each request paid once', () => {
    const s = memoryLedger(), R = rng(7), tags = [A, B, C, 'dddddddddddddddd'];
    for (const t of tags) openAccount(s, t, T0);
    let fundedIn = 0, cashedOut = 0, now = T0;
    const ids: string[] = [], asks: string[] = [];
    const pick = <T>(xs: T[]) => xs[Math.floor(R() * xs.length)];
    for (let i = 0; i < 1000; i++) {
      now += Math.floor(R() * 600_000);                                   // about two days of operations
      const reuse = ids.length && R() < 0.15, id = reuse ? pick(ids) : `op-${i.toString().padStart(6, '0')}`;
      const who = pick(tags), other = pick(tags), amount = R() < 0.05 ? Math.floor(R() * 400_000) - 1000 : 1 + Math.floor(R() * 120_000);
      const roll = R();
      if (roll < 0.1) { const a = createAsk(s, { id: `ask-${i.toString().padStart(6, '0')}`, payee: who, payer: other, amount }, now, L); if (a.ok) asks.push(a.ask.id); continue; }
      if (roll < 0.15 && asks.length) { const ref = pick(asks), row = s.ask(ref)!; s.transaction(() => closeAsk(s, { ref, how: R() < 0.5 ? 'declined' : 'cancelled', by: R() < 0.5 ? row.payer : row.payee })); continue; }
      let r: MoneyRequest;
      if (roll < 0.4) r = fund(id, who, amount);
      else if (roll < 0.55) r = { kind: 'cashout', id, tag: who, amount };
      else {
        const req = asks.length && R() < 0.3 ? pick(asks) : undefined, row = req ? s.ask(req)! : null;
        r = row && R() < 0.7 ? pay(id, row.payer, row.payee, row.amount, { req, fund: R() < 0.5 ? Math.floor(row.amount / 2) : 0 }) : pay(id, who, other, amount, { fund: R() < 0.3 ? Math.floor(amount * R()) : 0, ...(req ? { req } : {}) });
      }
      const before = s.ops().size, res = run(s, r, now);
      if (res.ok && !res.duplicate) {
        expect(s.ops().size).toBe(before + 1);
        ids.push(r.id);
        if (r.kind === 'fund') fundedIn += r.amount; else if (r.kind === 'cashout') cashedOut += r.amount; else fundedIn += r.fund;
      } else expect(s.ops().size).toBe(before);
      const accts = [...s.accounts().values()];
      expect(accts.reduce((n, a) => n + a.balance, 0)).toBe(fundedIn - cashedOut);   // conservation
      for (const a of accts) {
        expect(a.balance).toBeGreaterThanOrEqual(0); expect(a.balance).toBeLessThanOrEqual(L.balanceMax);
        expect(a.funded).toBeLessThanOrEqual(L.fundDayMax); expect(a.sent).toBeLessThanOrEqual(L.sendDayMax); expect(a.received).toBeLessThanOrEqual(L.receiveDayMax);
      }
    }
    // each request paid at most once, and only by the op it names
    for (const ask of s.asks().values()) {
      const payers = [...s.ops().values()].filter(o => o.req === ask.id);
      expect(payers.length).toBeLessThanOrEqual(1);
      if (ask.state === 'paid') expect(payers.map(o => o.id)).toEqual([ask.paidBy]); else expect(payers).toEqual([]);
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(s.ops().size).toBeGreaterThan(200);
  });
});
