import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CampClient } from '../src/online/campClient';

/**
 * 1.0.1 Grand Camp: a socket the client gives up itself (its silence watchdog) is let go at once. The match object does not answer a closing handshake
 * (a browser then fires `close` ~10 s later, longer on a dead network): a client that waited for it stayed « open » on a dead socket and, past the 60 s
 * return window, lost the pitch (found by scripts/check-grand-camp-ui.mjs: a page whose hub rebuild froze it 30 s+).
 */
class SilentWS {
  static all: SilentWS[] = [];
  readyState = 0; sent: string[] = []; closed: number | null = null;
  private l: Record<string, ((e: unknown) => void)[]> = {};
  constructor(public url: string) { SilentWS.all.push(this); }
  addEventListener(t: string, fn: (e: unknown) => void) { (this.l[t] ??= []).push(fn); }
  send(s: string) { this.sent.push(s); }
  /** The server never answers: no `close` event follows (CLOSING for good). */
  close(code: number) { this.closed = code; this.readyState = 2; }
  emit(t: string, e: unknown) { for (const fn of this.l[t] ?? []) fn(e); }
  open() { this.readyState = 1; this.emit('open', {}); }
  recv(m: unknown) { this.emit('message', { data: JSON.stringify(m) }); }
}
const M = '0123456789abcdef', ME = 'aaaaaaaaaaaaaaaa';
let clock = 1_000_000;
beforeEach(() => { SilentWS.all = []; vi.useFakeTimers(); clock = 1_000_000; });
afterEach(() => { vi.useRealTimers(); });

describe('Grand Camp client: a socket it gives up is let go at once', () => {
  it('silent too long: the socket is closed AND dropped, « Reconnexion… » at once, a new socket after the back-off — never stuck on the old one', async () => {
    const c = new CampClient({ key: () => 'f'.repeat(32), profile: () => ({ name: 'Moi', look: 1 }), endpoint: 'http://127.0.0.1:9/api/camp', WebSocketImpl: SilentWS as unknown as typeof WebSocket, now: () => clock });
    const opening = c.open(M);
    const ws = SilentWS.all[0]; ws.open(); ws.recv({ type: 'welcome', feature: 'camp', v: 1, match: M, you: ME, time: clock, hz: 20, lobby: null });
    await opening;
    expect(c.state.status).toBe('open');
    clock += 40_000; vi.advanceTimersByTime(20_000);                     // nothing heard for 40 s: the next ping finds it silent
    expect(ws.closed).toBe(4002);
    expect(c.state.status).toBe('reconnecting');                          // said at once, not when (if ever) the old socket fires `close`
    vi.advanceTimersByTime(1_000);                                        // the first back-off (≤ 0.6 s)
    expect(SilentWS.all.length).toBe(2);
    expect(new URL(SilentWS.all[1].url).searchParams.get('match')).toBe(M);
    // the old socket's late frames are not this client's any more (a « bye: replaced » there must not end the new connection)
    ws.recv({ type: 'bye', reason: 'replaced' });
    expect(c.state.bye).toBeNull();
    SilentWS.all[1].open(); SilentWS.all[1].recv({ type: 'welcome', feature: 'camp', v: 1, match: M, you: ME, time: clock, hz: 20, lobby: null });
    expect(c.state.status).toBe('open');
  });
});
