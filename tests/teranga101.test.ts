import { describe, expect, it } from 'vitest';
import { OUTBOX_KEEP_MS, OUTBOX_PARK_MS, OUTBOX_PARK_TRIES, OUTBOX_TRIES, deliveryOf, outboxRetry, payItemOf, refusalText } from '../src/online/accountRules';
import { applyMoney, memoryLedger, openAccount, opView } from '../src/online/ledgerRules';
import type { MoneyLimits, PayItem } from '../src/online/protocol';
import { cardOf, cashable, outcomeHead, previewOf, receivedNotice } from '../src/ui/phone/apps/messagesText';
import { PLATES_MAX, stackPlates, type Plate } from '../src/multiplayer/avatars';
import { DEFAULT_NAMES, defaultName, isDefaultName, loadProfile } from '../src/multiplayer/client';
import { EMOTES, type Peer } from '../src/multiplayer/protocol';
import { PlayerSocial, playerActionsFor, registerPlayerAction, shortName } from '../src/multiplayer/social';
import type { Target } from '../src/interact/types';

/**
 * Dakar Rek 1.0.1, stage A1 — Teranga Money, messaging and identity: the pure rules behind what scripts/check-teranga-transfer.mjs plays with two
 * browsers. (The account client's side — a send waiting for the server — is in tests/onlineClient.test.ts.)
 */
const L: MoneyLimits = { opMax: 250_000, fundDayMax: 500_000, sendDayMax: 500_000, receiveDayMax: 1_000_000, balanceMax: 5_000_000 };
const A = '1111111111111111', B = '2222222222222222';
const NB = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');
const now = 1_800_000_000_000;

describe('the card of a send comes from the ledger', () => {
  it('payItemOf: the ledger’s row as the conversation item both accounts keep (same id), and only for a send', () => {
    const ledger = memoryLedger(); openAccount(ledger, A, now); openAccount(ledger, B, now);
    const r = ledger.transaction(() => applyMoney(ledger, { kind: 'pay', id: 'op-00000001', tag: A, to: B, amount: 1_000, fund: 1_000, note: 'Taxi' }, now, L));
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(payItemOf(r.op)).toEqual({ id: 'op-00000001', k: 'pay', from: A, at: now, amount: 1_000, op: 'op-00000001', note: 'Taxi' });
    expect(payItemOf(opView(ledger.op('op-00000001')!))).toEqual(payItemOf(r.op));      // what the recipient's account rebuilds at its next connection is the same item
    const f = ledger.transaction(() => applyMoney(ledger, { kind: 'cashout', id: 'op-00000002', tag: B, amount: 400 }, now, L));
    expect(f.ok && payItemOf(f.op)).toBeNull();
  });
  it('a rebuilt money item is kept even from a blocked player (the ledger moved the money), and the same op id never makes a second one', () => {
    const item = payItemOf({ id: 'op-00000001', kind: 'pay', at: now, amount: 1_000, from: A, to: B })!;
    expect(deliveryOf(item, { blocked: true, known: false })).toBe('store');
    const ledger = memoryLedger(); openAccount(ledger, A, now); openAccount(ledger, B, now);
    const pay = () => ledger.transaction(() => applyMoney(ledger, { kind: 'pay', id: 'op-00000001', tag: A, to: B, amount: 1_000, fund: 1_000 }, now, L));
    const first = pay(), again = pay();
    expect(first).toMatchObject({ ok: true }); expect(again).toMatchObject({ ok: true, duplicate: true });
    expect(ledger.account(B)?.balance).toBe(1_000);
  });
});

describe('the outbox never drops an item silently', () => {
  it('backs off as before for the first tries', () => {
    expect(outboxRetry(1, now, { kind: 'deliver', at: now })).toEqual({ next: now + 10_000, parked: false });
    expect(outboxRetry(OUTBOX_TRIES - 1, now, { kind: 'deliver', at: now })).toEqual({ next: now + 600_000, parked: false });
  });
  it('past the tries an item for another account is parked (tried every few hours), not dropped, until it is a month old', () => {
    expect(outboxRetry(OUTBOX_TRIES, now, { kind: 'deliver', at: now - 86_400_000 })).toEqual({ next: now + OUTBOX_PARK_MS, parked: true });
    expect(outboxRetry(OUTBOX_TRIES + 500, now, { kind: 'deliver', at: now - OUTBOX_KEEP_MS + 1000 })).toMatchObject({ parked: true });
    expect(outboxRetry(OUTBOX_TRIES, now, { kind: 'deliver', at: now - OUTBOX_KEEP_MS - 1 })).toBeNull();
  });
  it('a block’s effects are parked too (for a bounded number of tries); « the visit ended » is only worth saying soon', () => {
    expect(outboxRetry(OUTBOX_TRIES, now, { kind: 'blockedBy' })).toMatchObject({ parked: true });
    expect(outboxRetry(OUTBOX_TRIES + OUTBOX_PARK_TRIES, now, { kind: 'blockedBy' })).toBeNull();
    expect(outboxRetry(OUTBOX_TRIES, now, { kind: 'visitEnd' })).toBeNull();
  });
});

describe('money in the conversation, in words', () => {
  const pay: PayItem = { id: 'op-00000001', k: 'pay', from: A, at: now, amount: 1_000, op: 'op-00000001' };
  const card = (me: string, hooks = {}) => { const c = cardOf(pay, me, 'Awa', now, hooks); return { ...c, title: NB(c.title), actions: c.actions.map(a => ({ ...a, label: NB(a.label) })) }; };
  it('received: where the money is, and « Retirer » for it while Teranga Money holds it', () => {
    expect(card(B, { balance: 1_000 })).toMatchObject({ title: '1 000 F reçus', state: 'Sur ton Teranga Money', actions: [{ act: 'cashout', label: 'Retirer 1 000 F', kind: 'primary' }] });
    expect(card(B, { balance: 400 }).actions).toMatchObject([{ act: 'cashout', label: 'Retirer 400 F' }]);       // part of it was spent: what is left
    expect(card(B, { balance: 0 }).actions).toEqual([]); expect(card(B, { balance: null }).actions).toEqual([]); // nothing to withdraw, or not known (offline)
    expect(card(B, { balance: 5_000, cashed: true })).toMatchObject({ state: 'Retiré dans ton portefeuille ✓', actions: [] });
    expect(cashable(1_000, 400)).toBe(400); expect(cashable(1_000, 9_000)).toBe(1_000); expect(cashable(1_000, null)).toBe(0);
  });
  it('sent: « envoyés » only once the server said so; waiting and refused are their own states', () => {
    expect(card(A)).toMatchObject({ title: '1 000 F envoyés', actions: [] });
    expect(card(A, { status: 'sending' })).toMatchObject({ title: 'Envoi de 1 000 F', state: 'En attente de confirmation…', tone: 'sun', actions: [] });
    expect(card(A, { status: 'failed', reason: 'unavailable' })).toMatchObject({ title: '1 000 F non envoyés', state: 'Refusé : rien n’est parti', tone: 'warn' });
    expect(card(A, { status: 'sending' }).title).not.toMatch(/envoyés/);
  });
  it('the sheet’s answer: « pending » is never « Rien n’est parti »; a refusal is', () => {
    expect(outcomeHead('pending')).toMatchObject({ title: 'En attente de confirmation…', tone: 'wait', again: false });
    expect(outcomeHead('timeout').title).not.toMatch(/Rien/);
    expect(outcomeHead('insufficient')).toMatchObject({ title: 'Rien n’est parti', tone: 'bad', again: true });
    expect(refusalText('pending', L)).not.toMatch(/Rien n’est parti/); expect(refusalText('pending', L)).toMatch(/jamais compté deux fois/);
  });
  it('the notice and the list', () => {
    expect(NB(receivedNotice(1_000, 'Awa'))).toBe('💸 1 000 F reçus de Awa');
    expect(NB(previewOf(pay, B))).toBe('1 000 F reçus');
  });
});

describe('nameplates of players standing together', () => {
  const plate = (x: number, y = 300, w = 90, h = 28): Plate => ({ x, y, w, h });
  it('plates apart are all on their own row', () => { expect(stackPlates([plate(100), plate(300), plate(500)])).toEqual([0, 0, 0]); });
  it('a plate over a nearer one is raised a row, then two; a fourth on the same spot is not shown', () => {
    expect(stackPlates([plate(200), plate(210), plate(190), plate(205)])).toEqual([0, 1, 2, null]);
  });
  it('never more than the cap, nearest first', () => {
    const rows = stackPlates(Array.from({ length: 14 }, (_, i) => plate(60 + i * 120)));
    expect(rows.filter(r => r !== null)).toHaveLength(PLATES_MAX); expect(rows.slice(PLATES_MAX).every(r => r === null)).toBe(true);
  });
  it('costs microseconds: 14 plates (the most bodies drawn), all piled up, 2 000 frames', () => {
    const crowd = Array.from({ length: 14 }, (_, i) => plate(200 + (i % 5) * 9, 300 + (i % 3) * 4));
    const t0 = performance.now(); for (let i = 0; i < 2000; i++) stackPlates(crowd);
    const perFrame = (performance.now() - t0) / 2000;
    console.log(`stackPlates: ${(perFrame * 1000).toFixed(1)} µs per frame for 14 piled plates`);
    expect(perFrame).toBeLessThan(0.25);                                    // ms: far under a frame, whatever the machine
  });
  it('a long name shows short: whole when it fits, else its first word, else cut', () => {
    expect(shortName('Awa')).toBe('Awa'); expect(shortName('Mame Diarra')).toBe('Mame Diarra');
    expect(shortName('Cheikh Ahmadou Bamba Mbacké', 16)).toBe('Cheikh');
    expect(shortName('Abdoulayeibrahimasory', 14)).toBe('Abdoulayeibra…'); expect([...shortName('Abdoulayeibrahimasory', 14)]).toHaveLength(14);
  });
});

describe('a player who never chose a name', () => {
  const store = (v: string | null) => ({ getItem: () => v } as unknown as Storage);
  it('gets a first name of the city, the same for the same save, never a fragment of an id', () => {
    const n = defaultName('g-4f2a9c1e');
    expect(DEFAULT_NAMES).toContain(n); expect(defaultName('g-4f2a9c1e')).toBe(n);
    expect(loadProfile(null, 'g-4f2a9c1e').name).toBe(n); expect(loadProfile(null, 'g-4f2a9c1e').name).not.toMatch(/4F2A|Dakarois/);
    expect(new Set(Array.from({ length: 200 }, (_, i) => defaultName(`guest-${i}`))).size).toBeGreaterThan(12);
  });
  it('the 1.0 default kept in a profile is replaced; a chosen name is kept; the studio knows a default from a choice', () => {
    expect(loadProfile(store(JSON.stringify({ name: 'Dakarois 4F2A', look: 3 })), 'g-1')).toEqual({ name: defaultName('g-1'), look: 3 });
    expect(loadProfile(store(JSON.stringify({ name: 'Mame Diarra', look: 1 })), 'g-1')).toEqual({ name: 'Mame Diarra', look: 1 });
    expect(isDefaultName('Dakarois 4F2A', 'g-1')).toBe(true); expect(isDefaultName(defaultName('g-1'), 'g-1')).toBe(true); expect(isDefaultName('Mame Diarra', 'g-1')).toBe(false);
  });
});

describe('the one player menu', () => {
  const peer = (o: Partial<Peer> = {}): Peer => ({ id: 'p1', name: 'Cheikh Ahmadou Bamba', look: 1, x: 1, y: 0, z: 1, yaw: 0, speed: 0, space: 'street', clip: 'Idle', updatedAt: 0, ...o } as Peer);
  const target = (p: Peer) => { const out: Target[] = []; new PlayerSocial(() => [p], () => false, () => {}).collect('street', 0, 0, out); return out[0]; };
  it('« Saluer » first, the registered actions in their order, then the other gestures; the button opens the menu, under a short name', () => {
    const ran: string[] = [];
    const off = [
      registerPlayerAction({ id: 'pay', label: 'Envoyer de l’argent', icon: '💸', order: 20, show: p => !!p.tag, run: p => ran.push(`pay:${p.id}`) }),
      registerPlayerAction({ id: 'message', label: 'Message', icon: '💬', order: 10, show: p => !!p.tag, run: p => ran.push(`msg:${p.id}`) }),
      registerPlayerAction({ id: 'invite', label: 'Inviter chez moi', icon: '🏠', order: 30, disabled: () => 'Tu n’as pas encore de logement où recevoir', run: () => {} }),
    ];
    const t = target(peer({ tag: B }));
    expect(t.menu).toEqual({ label: 'Cheikh', icon: '👋' });
    const aff = t.affordances();
    expect(aff.map(a => a.id)).toEqual(['salut', 'message', 'pay', 'invite', ...EMOTES.slice(1)]);
    expect(aff[3].disabled).toBe('Tu n’as pas encore de logement où recevoir');
    aff[1].run(); aff[2].run(); expect(ran).toEqual(['msg:p1', 'pay:p1']);
    // a player without an account tag (an older server): the lines that need one are not there
    expect(target(peer()).affordances().map(a => a.id)).toEqual(['salut', 'invite', ...EMOTES.slice(1)]);
    // a later feature is one more call (« Inviter au Grand Camp »), and registering an id again replaces its line
    off.push(registerPlayerAction({ id: 'camp', label: 'Inviter au Grand Camp', icon: '⛺', order: 50, run: () => {} }));
    off.push(registerPlayerAction({ id: 'camp', label: 'Inviter au Grand Camp', icon: '⛺', order: 50, run: p => ran.push(`camp:${p.id}`) }));
    expect(playerActionsFor(peer({ tag: B })).map(a => a.id)).toEqual(['message', 'pay', 'invite', 'camp']);
    for (const f of off) f();
    expect(playerActionsFor(peer({ tag: B }))).toEqual([]);
  });
});
