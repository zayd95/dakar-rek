import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PresenceClient } from '../src/multiplayer/client';
import type { Move } from '../src/multiplayer/protocol';

class FakeSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSED = 3;
  static instances: FakeSocket[] = [];
  readyState = FakeSocket.CONNECTING;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  close = vi.fn(() => { this.readyState = FakeSocket.CLOSED; this.onclose?.(); });
  constructor(readonly url: URL) { FakeSocket.instances.push(this); }
  open() { this.readyState = FakeSocket.OPEN; }
  send(message: string) { this.sent.push(message); }
  message(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
}
const move: Move = { type: 'move', x: 1, y: 0, z: 2, yaw: 0, speed: 1, space: 'street', clip: 'Walk' };
let listeners: Map<string, Array<(event: { persisted?: boolean }) => void>>;
let network: { onLine: boolean };
function event(name: string, data = {}) { for (const listener of listeners.get(name) ?? []) listener(data); }
function welcome(socket: FakeSocket, id = 'new-session', hub = 'pikine') {
  socket.open();
  socket.message({ type: 'welcome', version: 1, id, hub, room: 3, count: 1, time: Date.now(), peers: [] });
}
function join() {
  const client = new PresenceClient({ name: 'Awa', look: 2 }, true);
  client.join('pikine', 3);
  return client;
}

describe('presence connection lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.spyOn(Math, 'random').mockReturnValue(0);
    listeners = new Map(); network = { onLine: true }; FakeSocket.instances = [];
    vi.stubGlobal('window', globalThis); vi.stubGlobal('navigator', network);
    vi.stubGlobal('location', { href: 'https://game.example/' }); vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('addEventListener', (name: string, listener: (event: { persisted?: boolean }) => void) => {
      listeners.set(name, [...(listeners.get(name) ?? []), listener]);
    });
  });
  afterEach(() => {
    event('pagehide'); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  });

  it('retries when the transport never opens', () => {
    const client = join(); const first = FakeSocket.instances[0];
    vi.advanceTimersByTime(7999);
    expect(client.status).toBe('connecting'); expect(first.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(client.status).toBe('reconnecting'); expect(first.close).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(600);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.instances[1].url.searchParams.get('room')).toBe('3');
  });

  it('retries an open transport which never delivers welcome', () => {
    const client = join(); const first = FakeSocket.instances[0]; first.open();
    vi.advanceTimersByTime(8600);
    expect(first.close).toHaveBeenCalledOnce(); expect(FakeSocket.instances).toHaveLength(2);
    expect(client.status).toBe('reconnecting');
  });

  it('a welcome arriving before the deadline keeps the established connection', () => {
    const client = join(); const first = FakeSocket.instances[0];
    vi.advanceTimersByTime(7999); welcome(first);
    vi.advanceTimersByTime(9000);
    expect(client.status).toBe('online'); expect(client.id).toBe('new-session');
    expect(first.close).not.toHaveBeenCalled(); expect(FakeSocket.instances).toHaveLength(1);
  });

  it('offline cancels the deadline and retries only after the online event', () => {
    const client = join(); vi.advanceTimersByTime(4000);
    network.onLine = false; event('offline'); vi.advanceTimersByTime(10000);
    expect(client.status).toBe('offline'); expect(FakeSocket.instances).toHaveLength(1);
    network.onLine = true; event('online');
    expect(FakeSocket.instances).toHaveLength(2);
    welcome(FakeSocket.instances[1]); expect(client.status).toBe('online');
  });

  it('pagehide cancels a pending attempt until a persisted pageshow', () => {
    const client = join(); vi.advanceTimersByTime(4000); event('pagehide');
    vi.advanceTimersByTime(10000); expect(FakeSocket.instances).toHaveLength(1);
    event('pageshow', { persisted: true }); welcome(FakeSocket.instances[1]);
    expect(client.status).toBe('online'); expect(FakeSocket.instances).toHaveLength(2);
  });

  it.each(['hub', 'profile'] as const)('changing %s cancels the replaced attempt deadline', change => {
    const client = join(); const old = FakeSocket.instances[0]; vi.advanceTimersByTime(4000);
    if (change === 'hub') client.join('plateau', 3); else client.setProfile({ name: 'Binta', look: 4 });
    const current = FakeSocket.instances[1]; welcome(current, 'replacement', change === 'hub' ? 'plateau' : 'pikine');
    vi.advanceTimersByTime(10000);
    expect(old.close).toHaveBeenCalledOnce(); expect(current.close).not.toHaveBeenCalled();
    expect(client.id).toBe('replacement'); expect(FakeSocket.instances).toHaveLength(2);
  });

  it('late callbacks from an expired attempt cannot replace a fresh session or start another retry', () => {
    const client = join(); const old = FakeSocket.instances[0];
    const lateMessage = old.onmessage!; const lateClose = old.onclose!;
    vi.advanceTimersByTime(8600); const current = FakeSocket.instances[1]; welcome(current, 'current');
    lateMessage({ data: JSON.stringify({ type: 'welcome', version: 1, id: 'stale', hub: 'pikine', room: 3, count: 1, time: Date.now(), peers: [] }) });
    lateClose(); vi.advanceTimersByTime(9000);
    expect(client.id).toBe('current'); expect(client.status).toBe('online');
    expect(FakeSocket.instances).toHaveLength(2); expect(current.close).not.toHaveBeenCalled();
  });

  it('a retry republishes the latest movement and replaces the old peer list', () => {
    const client = join(); const first = FakeSocket.instances[0]; welcome(first);
    first.message({ type: 'peer', peer: { ...move, id: 'old-peer', name: 'Guest', look: 0, updatedAt: Date.now() } });
    expect(client.peers.size).toBe(1); client.publish(move);
    first.onclose?.(); expect(client.peers.size).toBe(0);
    vi.advanceTimersByTime(600); const retry = FakeSocket.instances[1];
    client.publish({ ...move, x: 7 }); retry.open();
    vi.advanceTimersByTime(8000); expect(client.status).toBe('reconnecting');
    vi.advanceTimersByTime(1200); const recovered = FakeSocket.instances[2]; welcome(recovered, 'recovered');
    expect(client.id).toBe('recovered'); expect(client.peers.size).toBe(0);
    expect(recovered.sent).toHaveLength(1); expect(JSON.parse(recovered.sent[0])).toMatchObject({ type: 'move', x: 7 });
  });

  it('an incompatible welcome closes cleanly without leaving a handshake timer', () => {
    const client = join(); const first = FakeSocket.instances[0]; first.open();
    first.message({ type: 'welcome', version: 99, hub: 'pikine', peers: [] });
    vi.advanceTimersByTime(10000);
    expect(client.status).toBe('offline'); expect(first.close).toHaveBeenCalledOnce();
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
