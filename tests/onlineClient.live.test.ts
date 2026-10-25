import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { newSave, writeSave, type KV } from '../src/core/save';
import { GameState } from '../src/core/state';
import { OnlineAccount } from '../src/online/client';
import { onlineHooks } from '../src/online/api';
import type { HomeSnapshot, InviteItem, MeetItem } from '../src/online/protocol';

/**
 * LD2.0-B: two account clients (src/online/client.ts, the real OnlineApi) against the REAL server on the local Workers runtime. Skipped unless
 * ONLINE_URL points at one: start `wrangler dev --local` (for instance with the throwaway config scripts/check-online-account.mjs writes), then
 * `ONLINE_URL=http://127.0.0.1:8821/ npx vitest run tests/onlineClient.live.test.ts`.
 */
const URL_ = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.ONLINE_URL;
const mem = (m = new Map<string, string>()): KV & Storage => ({ getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, clear: () => m.clear(), key: () => null, get length() { return m.size; } });
const hex = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
function player(name: string, wallet: number) {
  const storage = mem(); storage.setItem('dakarrek.chat.key', hex());
  const state = new GameState(newSave(1)); state.data.wallet = wallet;
  const client = new OnlineAccount({ state, saveNow: () => writeSave(storage, state.data), profile: () => ({ name, look: 2 }), enabled: true, storage });
  return { client, state, storage };
}
const snap: HomeSnapshot = { home: { spec: 'appart_plateau', hub: 'plateau', door: 'door:residence-jamm', name: 'Résidence Jàmm · appartement' }, upgrades: [], furniture: [{ spec: 'canape', at: { x: 1, z: 1, rot: 0 } }], at: 1 };

describe.skipIf(!URL_)('two account clients on the real server', () => {
  const ps: ReturnType<typeof player>[] = [];
  beforeAll(() => {
    const g = globalThis as Record<string, unknown>;
    g.window = globalThis; g.addEventListener = () => {}; g.location = { href: URL_ };
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
    onlineHooks.homeSnapshot = () => snap;
  });
  afterAll(() => { for (const p of ps) (p.client as unknown as { stopSocket(): void }).stopSocket(); });

  it('messages, 5 000 F requested and paid exactly once, an invitation and a visit, a meeting', async () => {
    const A = player('Awa', 50_000), B = player('Moussa', 1_000); ps.push(A, B);
    await vi.waitFor(() => { expect(A.client.status).toBe('online'); expect(B.client.status).toBe('online'); }, { timeout: 10_000 });
    const a = A.client.me!.tag, b = B.client.me!.tag;
    // B finds A by code, writes; A sees it with B's name
    const found = await B.client.lookup(A.client.me!.code);
    expect(found).toMatchObject({ ok: true, tag: a, name: 'Awa', look: 2 });
    expect(B.client.say(a, 'Salut Awa, tu me prêtes 5 000 ?').ok).toBe(true);
    await vi.waitFor(() => expect(A.client.convs().find(c => c.with === b)).toMatchObject({ name: 'Moussa', unread: 1, last: { text: 'Salut Awa, tu me prêtes 5 000 ?' } }), { timeout: 5000 });
    await vi.waitFor(() => expect(B.client.items(a)[0].status).toBeUndefined(), { timeout: 5000 });
    // B asks 5 000 F, A pays it from the wallet (top-up in the same operation)
    const ask = await B.client.ask({ id: B.client.newId(), to: a, amount: 5_000, note: 'Le taxi' });
    expect(ask.ok).toBe(true);
    const askId = (ask as { item: { id: string } }).item.id;
    await vi.waitFor(() => expect(A.client.items(b).some(i => i.id === askId && i.k === 'ask' && i.state === 'open')).toBe(true), { timeout: 5000 });
    expect(A.client.payQuote(5_000)).toEqual({ amount: 5_000, fromOnline: 0, fromWallet: 5_000 });
    const payId = A.client.newId();
    const [p1, p2] = await Promise.all([A.client.pay({ id: payId, to: b, amount: 5_000, req: askId }), A.client.pay({ id: payId, to: b, amount: 5_000, req: askId })]);   // a double tap
    expect(p1).toMatchObject({ ok: true, op: { id: payId, amount: 5_000, fund: 5_000, req: askId } }); expect(p2).toEqual(p1);
    expect(A.state.data.wallet).toBe(45_000); expect(A.state.data.online.pending).toEqual([]);
    await vi.waitFor(() => expect(B.client.balance?.amount).toBe(5_000), { timeout: 5000 });
    await vi.waitFor(() => expect(B.client.items(a).find(i => i.id === askId)).toMatchObject({ state: 'paid', paidBy: payId }), { timeout: 5000 });
    const again = await A.client.pay({ id: A.client.newId(), to: b, amount: 5_000, req: askId });
    expect(again).toMatchObject({ ok: false, reason: 'request-closed' });
    expect(A.state.data.wallet).toBe(45_000);                             // its top-up came back
    const hist = await B.client.history();
    expect(hist.ok && hist.ops.filter(o => o.id === payId)).toHaveLength(1);
    // B withdraws 2 000 F to the wallet
    expect(await B.client.cashout({ id: B.client.newId(), amount: 2_000 })).toMatchObject({ ok: true });
    expect(B.state.data.wallet).toBe(3_000); expect(B.client.balance?.amount).toBe(3_000);
    // invitation → accepted → visit
    const inv = await A.client.invite({ id: A.client.newId(), to: b, perms: { use: true } });
    expect(inv).toMatchObject({ ok: true, item: { state: 'open' } });
    const invId = (inv as { item: InviteItem }).item.id;
    await vi.waitFor(() => expect(B.client.items(a).some(i => i.id === invId)).toBe(true), { timeout: 5000 });
    expect(await B.client.answerInvite({ id: B.client.newId(), ref: invId, accept: true })).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(A.client.items(b).find(i => i.id === invId)).toMatchObject({ state: 'accepted' }), { timeout: 5000 });
    expect(await B.client.visit(a)).toMatchObject({ ok: true, snapshot: snap, perms: { use: true }, invite: invId });
    A.client.setWhere('plateau', 3);
    await vi.waitFor(async () => expect(await B.client.find(a)).toEqual({ ok: true, hub: 'plateau', room: 3 }), { timeout: 5000 });
    // a meeting « maintenant »: accepted (it gets its time), both here → met
    const m = await A.client.meet({ id: A.client.newId(), to: b, place: { id: 'corniche:pitch', hub: 'corniche', name: 'Terrain' }, when: 0 });
    const mId = (m as { item: MeetItem }).item.id;
    await vi.waitFor(() => expect(B.client.items(a).some(i => i.id === mId)).toBe(true), { timeout: 5000 });
    expect(await B.client.answerMeet({ id: B.client.newId(), ref: mId, accept: true })).toMatchObject({ ok: true, item: { state: 'accepted' } });
    A.client.here(mId); B.client.here(mId);
    await vi.waitFor(() => { expect(A.client.items(b).find(i => i.id === mId)).toMatchObject({ state: 'met' }); expect(B.client.items(a).find(i => i.id === mId)).toMatchObject({ state: 'met' }); }, { timeout: 5000 });
    // revoked: the guest is taken out
    const ended: string[] = []; B.client.onVisitEnd((host, invite) => ended.push(`${host}:${invite}`));
    expect(await A.client.revokeInvite({ id: A.client.newId(), ref: invId })).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(ended).toEqual([`${a}:${invId}`]), { timeout: 5000 });
    expect(await B.client.visit(a)).toMatchObject({ ok: false, reason: 'revoked' });
    // blocked: B blocks A; A's money is refused, A's text accepted but never shown to B
    expect(await B.client.block(a, true)).toMatchObject({ ok: true });
    expect(await A.client.pay({ id: A.client.newId(), to: b, amount: 100 })).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(A.state.data.wallet).toBe(45_000);
    const quiet = A.client.say(b, 'Tu me reçois ?') as { id: string };
    await vi.waitFor(() => expect(A.client.items(b).find(i => i.id === quiet.id)?.status).toBeUndefined(), { timeout: 5000 });
    await new Promise(r => setTimeout(r, 500));
    expect(B.client.items(a).some(i => i.id === quiet.id)).toBe(false);
  }, 60_000);
});
