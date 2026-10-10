import type { HubId } from '../core/types';
import { nickname, lookIndex, PROTOCOL_VERSION, SEND_INTERVAL_MS, type Move, type Peer, type ServerMessage, type ChatMessage, type ChatAck } from './protocol';
import type { ChatRequest, ReportRequest } from './chatRules';

export type ConnectionState = 'solo' | 'connecting' | 'online' | 'reconnecting' | 'offline';
export interface Profile { name: string; look: number }
export class PresenceClient {
  readonly peers = new Map<string, Peer>();
  id = ''; room = 0; count = 0; status: ConnectionState = 'solo';
  onChange: () => void = () => {};
  /** Chat traffic (chat module). Presence keeps working when nobody listens. */
  onChat: (message: ChatMessage) => void = () => {};
  onChatAck: (ack: ChatAck) => void = () => {};
  onReportAck: (target: string, ok: boolean) => void = () => {};
  private socket: WebSocket | null = null;
  private hub: HubId | null = null;
  private requestedRoom: number | null = null;
  private retry = 0; private heartbeat = 0; private retryAttempt = 0; private generation = 0;
  private lastSentAt = 0; private lastMove = ''; private latest: Move | null = null; private clockOffset = 0;
  private lastPong = 0;
  constructor(public profile: Profile, private enabled: boolean, private endpoint?: string) {
    addEventListener('online', () => { if (this.hub && this.enabled && this.status !== 'online') this.open(); });
    addEventListener('offline', () => { if (this.enabled) { this.stopSocket(); this.setStatus('offline'); } });
    addEventListener('pagehide', () => this.stopSocket());
    addEventListener('pageshow', e => { if (e.persisted && this.hub && this.enabled) this.open(); });
  }
  join(hub: HubId, room: number | null = null) {
    if (hub === this.hub && room === this.requestedRoom && this.socket) return;
    this.hub = hub; this.requestedRoom = room; this.latest = null; this.lastMove = '';
    this.retryAttempt = 0;
    if (this.enabled) this.open(); else this.setStatus('solo');
  }
  setProfile(profile: Profile) {
    this.profile = { name: nickname(profile.name), look: lookIndex(profile.look) };
    if (this.hub && this.enabled) this.open();
  }
  publish(move: Move, now = performance.now()) {
    this.latest = move;
    if (this.status !== 'online' || this.socket?.readyState !== WebSocket.OPEN || now - this.lastSentAt < SEND_INTERVAL_MS) return;
    const encoded = JSON.stringify({ ...move, x: +move.x.toFixed(3), y: +move.y.toFixed(3), z: +move.z.toFixed(3), yaw: +move.yaw.toFixed(3), speed: +move.speed.toFixed(2) });
    if (encoded === this.lastMove) return;
    this.socket.send(encoded); this.lastMove = encoded; this.lastSentAt = now;
  }
  /** Sends a chat request on the open socket; false when offline (the caller keeps it pending and resends with the same id). */
  sendChat(request: ChatRequest): boolean { return this.sendRaw(request); }
  sendReport(request: ReportRequest): boolean { return this.sendRaw(request); }
  private sendRaw(payload: ChatRequest | ReportRequest) {
    if (this.status !== 'online' || this.socket?.readyState !== WebSocket.OPEN) return false;
    try { this.socket.send(JSON.stringify(payload)); return true; } catch { return false; }
  }
  serverNow() { return Date.now() + (this.status === 'online' ? this.clockOffset : 0); }
  private open() {
    this.stopSocket();
    if (!this.hub || !navigator.onLine) { this.setStatus('offline'); return; }
    const generation = this.generation;
    this.setStatus(this.retryAttempt ? 'reconnecting' : 'connecting');
    const url = new URL(this.endpoint || '/api/presence', location.href);
    url.protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';
    url.searchParams.set('hub', this.hub); url.searchParams.set('name', this.profile.name); url.searchParams.set('look', String(this.profile.look));
    const key = deviceChatKey(); if (key) url.searchParams.set('key', key);
    if (this.requestedRoom) url.searchParams.set('room', String(this.requestedRoom));
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch { this.scheduleRetry(); return; }
    this.socket = ws;
    ws.onmessage = event => {
      if (generation !== this.generation) return;
      if (event.data === 'pong') { this.lastPong = Date.now(); return; }
      let message: ServerMessage; try { message = JSON.parse(event.data as string) as ServerMessage; } catch { return; }
      if (message.type === 'welcome') {
        if (message.version !== PROTOCOL_VERSION || message.hub !== this.hub) { this.stopSocket(); this.setStatus('offline'); return; }
        this.id = message.id; this.room = message.room; this.count = message.count; this.clockOffset = message.time - Date.now();
        this.retryAttempt = 0; this.lastMove = ''; this.lastSentAt = -Infinity; this.lastPong = Date.now();
        for (const peer of message.peers) if (peer.id !== this.id) this.peers.set(peer.id, peer);
        this.setStatus('online');
        if (this.latest) this.publish(this.latest);
        this.heartbeat = window.setInterval(() => {
          if (Date.now() - this.lastPong > 65000) { ws.close(); return; }
          if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, 20000);
      } else if (message.type === 'peer') {
        if (message.peer.id !== this.id) this.peers.set(message.peer.id, message.peer);
      } else if (message.type === 'leave') {
        this.peers.delete(message.id); this.count = message.count; this.onChange();
      } else if (message.type === 'count') { this.count = message.count; this.onChange(); }
      else if (message.type === 'chat') { if (message.from !== this.id) this.onChat(message); }
      else if (message.type === 'chat-ack') this.onChatAck(message);
      else if (message.type === 'report-ack') this.onReportAck(message.target, message.ok);
    };
    ws.onclose = () => { if (generation === this.generation) this.scheduleRetry(); };
    ws.onerror = () => { /* close drives the retry; no effect on local saves or gameplay */ };
  }
  private scheduleRetry() {
    this.stopSocket(); this.setStatus(navigator.onLine ? 'reconnecting' : 'offline');
    if (!navigator.onLine || !this.hub) return;
    const delay = Math.min(15000, 600 * 2 ** Math.min(this.retryAttempt++, 5)) + Math.random() * 300;
    this.retry = window.setTimeout(() => this.open(), delay);
  }
  private stopSocket() {
    this.generation++; clearTimeout(this.retry); clearInterval(this.heartbeat); this.retry = this.heartbeat = 0;
    if (this.socket) { this.socket.onclose = null; this.socket.close(); this.socket = null; }
    this.peers.clear(); this.id = ''; this.count = 0; this.room = 0; this.lastMove = ''; this.onChange();
  }
  private setStatus(status: ConnectionState) { this.status = status; this.onChange(); }
}

let chatKey: string | null | undefined;
/** Private random key for this device; the server only shares a hash of it, so mute/block survive reconnects. */
function deviceChatKey(): string | null {
  if (chatKey !== undefined) return chatKey;
  const fresh = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
  try {
    const saved = localStorage.getItem('dakarrek.chat.key');
    if (saved && /^[a-f0-9]{32}$/.test(saved)) return (chatKey = saved);
    chatKey = fresh(); localStorage.setItem('dakarrek.chat.key', chatKey);
  } catch { chatKey ??= typeof crypto?.getRandomValues === 'function' ? fresh() : null; }
  return chatKey;
}

export function loadProfile(storage: Storage | null, guestId: string): Profile {
  try { const saved = JSON.parse(storage?.getItem('dakarrek.presence.profile') ?? 'null') as Profile | null;
    if (saved) return { name: nickname(saved.name), look: lookIndex(saved.look) };
  } catch { /* private browsing or corrupt profile */ }
  const hash = [...guestId].reduce((n, c) => n + c.charCodeAt(0), 0);
  return { name: `Dakarois ${guestId.slice(0, 4).toUpperCase()}`, look: hash % 6 };
}
