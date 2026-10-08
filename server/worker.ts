import { DurableObject } from 'cloudflare:workers';
import { isHub, nickname, lookIndex, deviceKey, parseMove, PROTOCOL_VERSION, ROOM_CAPACITY, MAX_ROOMS_PER_HUB, type Peer, type ServerMessage, type ChatMessage } from '../src/multiplayer/protocol';
import { parseChatRequest, parseReport, rateLimit, nearRecipients, isPrivateSpace, DedupeMemory, type ChatFailure } from '../src/multiplayer/chatRules';
import type { HubId } from '../src/core/types';

interface Env { ASSETS: Fetcher; ROOMS: DurableObjectNamespace<CityRoom>; LOBBIES: DurableObjectNamespace<HubLobby>; ALLOWED_ORIGINS?: string }
interface Session {
  id: string; name: string; look: number; tag?: string; hub: HubId; room: number; peer: Peer | null; windowAt: number; messages: number;
  /** Accepted chat timestamps (sliding window) and players already reported by this connection. */
  chat?: number[]; reported?: string[];
}
const MAX_REPORTS_PER_CONNECTION = 20;
const CHAT_DEDUPE_TTL = 15 * 60_000;
/** Public tag = hash of the private device key. Lets players mute/block across reconnects; the key itself is never broadcast. */
async function publicTag(key: string | null): Promise<string | undefined> {
  if (!key) return undefined;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`dakar-rek:tag:${key}`)));
  return [...digest.slice(0, 8)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return Response.json({ ok: true, protocol: PROTOCOL_VERSION, roomCapacity: ROOM_CAPACITY }, { headers: { 'Cache-Control': 'no-store' } });
    if (url.pathname === '/api/presence') {
      if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin && !env.ALLOWED_ORIGINS?.split(',').map(x => x.trim()).includes(origin)) return new Response('Origin rejected', { status: 403 });
      const hub = url.searchParams.get('hub');
      if (!isHub(hub)) return new Response('Unknown hub', { status: 400 });
      const requestedRoom = url.searchParams.get('room');
      if (requestedRoom !== null && (!/^\d+$/.test(requestedRoom) || +requestedRoom < 1 || +requestedRoom > MAX_ROOMS_PER_HUB)) return new Response('Unknown room', { status: 400 });
      return env.LOBBIES.getByName(hub).fetch(request);
    }
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

/** One allocator per hub; room capacity is enforced atomically in CityRoom. */
export class HubLobby extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/vacancy') {
      const room = Number(url.searchParams.get('room'));
      if (room >= 1 && room <= MAX_ROOMS_PER_HUB) {
        const preferred = await this.ctx.storage.get<number>('preferred') ?? 1;
        if (room < preferred) await this.ctx.storage.put('preferred', room);
      }
      return new Response(null, { status: 204 });
    }
    const hub = url.searchParams.get('hub');
    if (!isHub(hub)) return new Response('Unknown hub', { status: 400 });
    const specific = Number(url.searchParams.get('room')) || null;
    let room = specific ?? (await this.ctx.storage.get<number>('preferred') ?? 1);
    // Bound work per join; a full city returns a retryable response instead of unbounded fanout.
    for (let tries = 0; tries < 8 && room <= MAX_ROOMS_PER_HUB; tries++, room++) {
      const forwarded = new URL(request.url); forwarded.searchParams.set('room', String(room));
      const response = await this.env.ROOMS.getByName(`${hub}:${room}`).fetch(new Request(forwarded, request));
      if (response.status !== 409 || specific) return response;
      await this.ctx.storage.put('preferred', Math.min(room + 1, MAX_ROOMS_PER_HUB));
    }
    return new Response('Rooms busy, retry shortly', { status: 503, headers: { 'Retry-After': '3' } });
  }
}

export class CityRoom extends DurableObject<Env> {
  private sessions = new Map<WebSocket, Session>();
  /**
   * Delivered chat ids: a bounded memory, backed by small `chat:<id>` storage entries so a resend after a reconnect is
   * still recognised when the room has hibernated in between. Entries older than CHAT_DEDUPE_TTL are pruned.
   * Clients also drop ids they already showed (a reconnect may land in another room).
   */
  private delivered = new DedupeMemory<{ delivered: number; at: number }>();
  private chatWrites = 0;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    for (const ws of ctx.getWebSockets()) { const session = ws.deserializeAttachment() as Session | null; if (session) this.sessions.set(ws, session); }
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  async fetch(request: Request): Promise<Response> {
    if (this.sessions.size >= ROOM_CAPACITY) return new Response('Room full', { status: 409 });
    const url = new URL(request.url), hub = url.searchParams.get('hub'), room = Number(url.searchParams.get('room'));
    if (!isHub(hub) || room < 1 || room > MAX_ROOMS_PER_HUB || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Invalid room', { status: 400 });
    const tag = await publicTag(deviceKey(url.searchParams.get('key')));
    if (this.sessions.size >= ROOM_CAPACITY) return new Response('Room full', { status: 409 });
    const [client, server] = Object.values(new WebSocketPair());
    const session: Session = { id: crypto.randomUUID(), name: nickname(url.searchParams.get('name')), look: lookIndex(url.searchParams.get('look')), tag, hub, room, peer: null, windowAt: Date.now(), messages: 0, chat: [], reported: [] };
    this.ctx.acceptWebSocket(server); server.serializeAttachment(session); this.sessions.set(server, session);
    this.send(server, { type: 'welcome', version: PROTOCOL_VERSION, id: session.id, hub, room, time: Date.now(), count: this.sessions.size, peers: [...this.sessions.values()].flatMap(s => s.peer ? [s.peer] : []) });
    this.broadcast({ type: 'count', count: this.sessions.size }, server);
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const s = this.sessions.get(ws); if (!s) return;
    if (typeof message !== 'string' || message.length > 1024) { this.reject(ws, 1009); return; }
    const now = Date.now();
    if (now - s.windowAt >= 1000) { s.windowAt = now; s.messages = 0; }
    if (++s.messages > 20) { this.reject(ws, 1008); return; }
    let data: unknown; try { data = JSON.parse(message); } catch { this.reject(ws, 1008); return; }
    const kind = (data as { type?: unknown } | null)?.type;
    if (kind === 'chat') { await this.chat(ws, s, data, now); return; }
    if (kind === 'report') { await this.report(ws, s, data); return; }
    const move = parseMove(data, s.hub); if (!move) { this.reject(ws, 1008); return; }
    s.peer = { ...move, id: s.id, name: s.name, look: s.look, ...(s.tag ? { tag: s.tag } : {}), updatedAt: now };
    ws.serializeAttachment(s);
    this.broadcast({ type: 'peer', peer: s.peer }, ws);
  }
  /** Proximity or private text. Validated, rate-limited and idempotent by message id; never an economic action. */
  private async chat(ws: WebSocket, s: Session, data: unknown, now: number) {
    const parsed = parseChatRequest(data);
    if (!parsed.ok) { if (parsed.id) this.send(ws, { type: 'chat-ack', id: parsed.id, ok: false, reason: parsed.reason }); else this.reject(ws, 1008); return; }
    const req = parsed.request;
    const fail = (reason: ChatFailure) => this.send(ws, { type: 'chat-ack', id: req.id, ok: false, reason });
    const seen = this.delivered.get(req.id) ?? await this.ctx.storage.get<{ delivered: number; at: number }>(`chat:${req.id}`);
    if (seen) { this.send(ws, { type: 'chat-ack', id: req.id, ok: true, duplicate: true, delivered: seen.delivered, at: seen.at }); return; }
    const rate = rateLimit(s.chat ?? [], now); s.chat = rate.times; ws.serializeAttachment(s);
    if (!rate.allowed) { fail('rate-limited'); return; }
    let targets: WebSocket[];
    if (req.channel === 'dm') {
      const target = [...this.sessions].find(([other, o]) => other !== ws && o.id === req.to);
      if (!target) { fail('offline'); return; }
      targets = [target[0]];
    } else {
      if (!s.peer) { fail('no-position'); return; }
      if (isPrivateSpace(s.peer.space)) { fail('private-space'); return; }
      const placed = [...this.sessions].flatMap(([other, o]) => o.peer && other !== ws ? [{ id: o.id, x: o.peer.x, z: o.peer.z, space: o.peer.space, ws: other }] : []);
      targets = nearRecipients({ id: s.id, x: s.peer.x, z: s.peer.z, space: s.peer.space }, placed).map(p => p.ws);
    }
    const out: ChatMessage = { type: 'chat', id: req.id, from: s.id, name: s.name, ...(s.tag ? { tag: s.tag } : {}), channel: req.channel, text: req.text, at: now };
    for (const target of targets) this.send(target, out);
    this.delivered.remember(req.id, { delivered: targets.length, at: now });
    await this.ctx.storage.put(`chat:${req.id}`, { delivered: targets.length, at: now });
    if (++this.chatWrites % 64 === 0) await this.pruneChat(now);
    this.send(ws, { type: 'chat-ack', id: req.id, ok: true, delivered: targets.length, at: now });
  }
  private async pruneChat(now: number) {
    const old = [...(await this.ctx.storage.list<{ at: number }>({ prefix: 'chat:', limit: 1000 }))].filter(([, v]) => now - v.at > CHAT_DEDUPE_TTL).map(([k]) => k);
    for (let i = 0; i < old.length; i += 128) await this.ctx.storage.delete(old.slice(i, i + 128));
  }
  /** Provisional moderation: a per-player counter in this room's storage plus a Workers log line. No moderator queue yet. */
  private async report(ws: WebSocket, s: Session, data: unknown) {
    const report = parseReport(data); if (!report) { this.reject(ws, 1008); return; }
    const target = [...this.sessions.values()].find(o => o.id === report.target && o !== s);
    if (!target) { this.send(ws, { type: 'report-ack', target: report.target, ok: false }); return; }
    const key = target.tag ?? `session:${target.id}`, reported = s.reported ?? [];
    if (reported.includes(key)) { this.send(ws, { type: 'report-ack', target: report.target, ok: true }); return; }
    if (reported.length >= MAX_REPORTS_PER_CONNECTION) { this.send(ws, { type: 'report-ack', target: report.target, ok: false }); return; }
    s.reported = [...reported, key]; ws.serializeAttachment(s);
    const count = (await this.ctx.storage.get<number>(`report:${key}`) ?? 0) + 1;
    await this.ctx.storage.put(`report:${key}`, count);
    console.log(JSON.stringify({ event: 'player-report', hub: s.hub, room: s.room, target: key, name: target.name, reason: report.reason, count }));
    this.send(ws, { type: 'report-ack', target: report.target, ok: true });
  }
  webSocketClose(ws: WebSocket): void { this.remove(ws); }
  webSocketError(ws: WebSocket): void { this.reject(ws, 1011); }
  private reject(ws: WebSocket, code: number) { try { ws.close(code, 'Session ended'); } catch { /* already closed */ } this.remove(ws); }
  private remove(ws: WebSocket) {
    const session = this.sessions.get(ws); if (!session) return;
    this.sessions.delete(ws);
    this.broadcast({ type: 'leave', id: session.id, count: this.sessions.size });
    this.ctx.waitUntil(this.env.LOBBIES.getByName(session.hub).fetch(`https://lobby/vacancy?room=${session.room}`).catch(() => new Response()));
  }
  private send(ws: WebSocket, message: ServerMessage) { try { ws.send(JSON.stringify(message)); } catch { this.reject(ws, 1011); } }
  private broadcast(message: ServerMessage, except?: WebSocket) {
    const encoded = JSON.stringify(message);
    for (const ws of [...this.sessions.keys()]) if (ws !== except) { try { ws.send(encoded); } catch { this.reject(ws, 1011); } }
  }
}
