import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CampSession, type CampSessionDeps } from '../src/online/campSession';
import { parseCampInvite } from '../src/ui/phone/apps/campText';
import type { CampLobbyView } from '../src/multiplayer/campProtocol';

/**
 * 1.0.1 Grand Camp: the device's one Grand Camp (src/online/campSession.ts) on a scripted socket: the place kept on the device and opened again at once
 * after a reload, one match at a time, the fee covered by Teranga Money then the wallet (the account's top-up, refused here when it cannot be), the
 * invitation as the server's list plus an ordinary text message, and the place forgotten when it is given up.
 */
class FakeWS {
  static all: FakeWS[] = [];
  readyState = 0; sent: string[] = [];
  private l: Record<string, ((e: unknown) => void)[]> = {};
  constructor(public url: string) { FakeWS.all.push(this); }
  addEventListener(t: string, fn: (e: unknown) => void) { (this.l[t] ??= []).push(fn); }
  send(s: string) { this.sent.push(s); }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.emit('close', {}); }
  emit(t: string, e: unknown) { for (const fn of this.l[t] ?? []) fn(e); }
  open() { this.readyState = 1; this.emit('open', {}); }
  recv(m: unknown) { this.emit('message', { data: JSON.stringify(m) }); }
  msgs() { return this.sent.filter(s => s !== 'ping').map(s => JSON.parse(s) as Record<string, unknown> & { id: string; type: string }); }
  static last() { return FakeWS.all[FakeWS.all.length - 1]; }
}
class Store { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem(k: string) { this.m.delete(k); } }
const ME = 'aaaaaaaaaaaaaaaa', ORG = 'bbbbbbbbbbbbbbbb', M = '0123456789abcdef', M2 = 'fedcba9876543210';
const lobby = (o: Partial<CampLobbyView> = {}, mine = true): CampLobbyView => ({
  match: M, state: 'lobby', terms: { fee: 1000, size: 6, dist: 'team', open: false, hub: 'corniche' }, frozen: true, org: ORG, teams: ['Rouge', 'Jaune'],
  players: [{ tag: ORG, name: 'Awa', look: 1, team: 0, ready: false, hold: 'none', on: true, at: 1, sid: 1 }, ...(mine ? [{ tag: ME, name: 'Moi', look: 2, team: 1 as const, ready: false, hold: 'none' as const, on: true, at: 2, sid: 2 }] : [])],
  pool: 0, full: 6000, created: 1, closes: 600_001, ...o,
});
let store: Store, account: { balance: number; wallet: number; said: [string, string][]; funded: number[] };
function session(): CampSession {
  const s = new CampSession();
  const deps: CampSessionDeps = {
    key: () => 'f'.repeat(32), profile: () => ({ name: 'Moi', look: 2 }), endpoint: 'http://127.0.0.1:9/api/camp', storage: () => store as unknown as Storage,
    wallet: () => account.wallet, WebSocketImpl: FakeWS as unknown as typeof WebSocket,
    account: () => ({
      status: 'online', balance: { amount: account.balance }, limits: { fundDayMax: 500_000 }, today: { funded: 0 }, newId: () => 'op-' + Math.random().toString(16).slice(2, 10),
      fund: async o => { account.funded.push(o.amount); account.wallet -= o.amount; account.balance += o.amount; return { ok: true }; },
      say: (to, text) => { account.said.push([to, text]); return { ok: true, id: 'x' }; },
    }),
  };
  s.configure(deps);
  return s;
}
const welcome = (ws: FakeWS, l: CampLobbyView | null) => { ws.open(); ws.recv({ type: 'welcome', feature: 'camp', v: 1, match: l?.match ?? M, you: ME, time: 1, hz: 20, lobby: l }); };
const ack = (ws: FakeWS, type: string, ok = true, extra: Record<string, unknown> = {}) => { const m = ws.msgs().filter(x => x.type === type).pop()!; ws.recv({ type: 'ack', id: m.id, ok, ...extra }); };

beforeEach(() => { FakeWS.all = []; store = new Store(); account = { balance: 0, wallet: 5000, said: [], funded: [] }; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('Grand Camp session: one match at a time, kept on the device', () => {
  it('joining keeps the match on the device; a reload (a new session) opens its socket again at once, to the same match', async () => {
    const s = session();
    expect(s.view(M)).toBe(true);
    const ws = FakeWS.last(); welcome(ws, lobby({}, false));
    expect(s.mine).toBeNull();
    const j = s.join(); await Promise.resolve();
    ws.recv({ type: 'lobby', lobby: lobby() }); ack(ws, 'join');
    expect((await j).ok).toBe(true);
    expect(s.mine).toBe(M); expect(store.getItem('dakarrek.camp.match')).toBe(M);
    const again = session();                                                     // the page reloaded
    expect(again.mine).toBe(M);
    const n = FakeWS.all.length;
    expect(again.restore()).toBe(true);
    expect(FakeWS.all.length).toBe(n + 1);
    expect(new URL(FakeWS.last().url).searchParams.get('match')).toBe(M);
  });
  it('with a place in one match, another match’s lobby is not opened (its socket would cost the place); a lobby only looked at is closed when left', async () => {
    const s = session();
    s.view(M); const ws = FakeWS.last(); welcome(ws, lobby());
    expect(s.mine).toBe(M);
    expect(s.view(M2)).toBe(false);
    expect(FakeWS.all.length).toBe(1);
    const t = session(); store.removeItem('dakarrek.camp.match'); t.mine = null;
    t.view(M2); const w2 = FakeWS.last(); welcome(w2, lobby({ match: M2 }, false));
    t.leaveView(M2);
    expect(w2.readyState).toBe(3);
    s.leaveView(M);                                                              // mine: kept open
    expect(ws.readyState).toBe(1);
  });
  it('« Quitter » before kick-off forgets the match; removed by the organizer forgets it too', async () => {
    const s = session();
    s.view(M); const ws = FakeWS.last(); welcome(ws, lobby());
    const l = s.leave(); await Promise.resolve();
    ws.recv({ type: 'lobby', lobby: lobby({}, false) }); ack(ws, 'leave');
    expect((await l).ok).toBe(true);
    expect(s.mine).toBeNull(); expect(store.getItem('dakarrek.camp.match')).toBeNull();
    const r = session();
    r.view(M); const w2 = FakeWS.last(); welcome(w2, lobby());
    expect(r.mine).toBe(M);
    w2.recv({ type: 'bye', reason: 'removed' });
    expect(r.mine).toBeNull();
  });
});

describe('Grand Camp session: « Prêt » and the money it takes', () => {
  it('a fee Teranga Money and the wallet cannot cover is refused here with the sentence, nothing sent', async () => {
    account.balance = 300; account.wallet = 200;
    const s = session(); s.view(M); const ws = FakeWS.last(); welcome(ws, lobby());
    const r = await s.ready();
    expect(r.ok).toBe(false);
    expect(!r.ok && r.text.replace(/[  ]/g, ' ')).toBe('Solde insuffisant : il te manque 500 F.');
    expect(ws.msgs().some(m => m.type === 'ready')).toBe(false);
    expect(account.funded).toEqual([]);
  });
  it('Teranga Money 400 F + 600 F from the wallet: the account’s top-up of 600 F first, then « ready » — and the hold is pending until the server answers', async () => {
    account.balance = 400; account.wallet = 5000;
    const s = session(); s.view(M); const ws = FakeWS.last(); welcome(ws, lobby());
    expect(s.quote()).toEqual({ fromOnline: 400, fromWallet: 600 });
    const r = s.ready();
    await vi.waitFor(() => expect(ws.msgs().some(m => m.type === 'ready')).toBe(true));
    expect(account.funded).toEqual([600]);
    expect(s.client!.state.money.find(m => m.step === 'hold')).toMatchObject({ state: 'pending', amount: 1000 });
    ws.recv({ type: 'money', step: 'hold', op: 'hold-00000001', amount: 1000, balance: 0 }); ack(ws, 'ready');
    expect((await r).ok).toBe(true);
    expect(s.client!.state.money.find(m => m.step === 'hold')).toMatchObject({ state: 'done', amount: 1000, balance: 0 });
  });
});

describe('Grand Camp session: invitations', () => {
  it('the server’s invitation list first, then one ordinary text message per friend, carrying the match for a 1.0.1 client', async () => {
    const s = session(); s.view(M); const ws = FakeWS.last(); welcome(ws, { ...lobby(), org: ME });
    const friends = ['cccccccccccccccc', 'dddddddddddddddd'];
    const r = s.invite(friends); await Promise.resolve();
    const inv = ws.msgs().find(m => m.type === 'invite')!;
    expect(inv.tags).toEqual(friends);
    expect(account.said).toEqual([]);                                             // nothing said before the server took the invitation
    ack(ws, 'invite');
    expect(await r).toEqual({ ok: true, said: 2 });
    expect(account.said.map(([to]) => to)).toEqual(friends);
    expect(parseCampInvite(account.said[0][1])?.match).toBe(M);
    const no = s.invite(['eeeeeeeeeeeeeeee']); await Promise.resolve();
    ack(ws, 'invite', false, { reason: 'not-org' });
    expect((await no).ok).toBe(false);
    expect(account.said.length).toBe(2);                                          // a refused invitation sends no message
  });
});
