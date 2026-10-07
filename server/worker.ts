import { DurableObject } from 'cloudflare:workers';
import { isHub, nickname, lookIndex, parseMove, PROTOCOL_VERSION, ROOM_CAPACITY, MAX_ROOMS_PER_HUB, type Peer, type ServerMessage } from '../src/multiplayer/protocol';
import type { HubId } from '../src/core/types';

interface Env { ASSETS: Fetcher; ROOMS: DurableObjectNamespace<CityRoom>; LOBBIES: DurableObjectNamespace<HubLobby>; ALLOWED_ORIGINS?: string }
interface Session { id: string; name: string; look: number; hub: HubId; room: number; peer: Peer | null; windowAt: number; messages: number }

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
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    for (const ws of ctx.getWebSockets()) { const session = ws.deserializeAttachment() as Session | null; if (session) this.sessions.set(ws, session); }
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  fetch(request: Request): Response {
    if (this.sessions.size >= ROOM_CAPACITY) return new Response('Room full', { status: 409 });
    const url = new URL(request.url), hub = url.searchParams.get('hub'), room = Number(url.searchParams.get('room'));
    if (!isHub(hub) || room < 1 || room > MAX_ROOMS_PER_HUB || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Invalid room', { status: 400 });
    const [client, server] = Object.values(new WebSocketPair());
    const session: Session = { id: crypto.randomUUID(), name: nickname(url.searchParams.get('name')), look: lookIndex(url.searchParams.get('look')), hub, room, peer: null, windowAt: Date.now(), messages: 0 };
    this.ctx.acceptWebSocket(server); server.serializeAttachment(session); this.sessions.set(server, session);
    this.send(server, { type: 'welcome', version: PROTOCOL_VERSION, id: session.id, hub, room, time: Date.now(), count: this.sessions.size, peers: [...this.sessions.values()].flatMap(s => s.peer ? [s.peer] : []) });
    this.broadcast({ type: 'count', count: this.sessions.size }, server);
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const s = this.sessions.get(ws); if (!s) return;
    if (typeof message !== 'string' || message.length > 1024) { this.reject(ws, 1009); return; }
    const now = Date.now();
    if (now - s.windowAt >= 1000) { s.windowAt = now; s.messages = 0; }
    if (++s.messages > 20) { this.reject(ws, 1008); return; }
    let data: unknown; try { data = JSON.parse(message); } catch { this.reject(ws, 1008); return; }
    const move = parseMove(data, s.hub); if (!move) { this.reject(ws, 1008); return; }
    s.peer = { ...move, id: s.id, name: s.name, look: s.look, updatedAt: now };
    ws.serializeAttachment(s);
    this.broadcast({ type: 'peer', peer: s.peer }, ws);
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
