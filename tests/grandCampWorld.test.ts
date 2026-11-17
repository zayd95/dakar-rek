import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { grandCamp } from '../src/game/grandCamp';
import { campSession } from '../src/online/campSession';
import { encodeSnap, type CampLobbyView, type CampSnapshot } from '../src/multiplayer/campProtocol';
import type { GameCtx } from '../src/game/modules';
import type { HubWorld } from '../src/world/types';

/**
 * 1.0.1 Grand Camp in the street (src/game/grandCamp.ts), what the frame-cost review found there: who the match draws (a player who quit is drawn
 * again by presence), the crown shown while a match is played, the ball freed when the Corniche unloads.
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
}
class Store { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem(k: string) { this.m.delete(k); } }
const ME = 'aaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbb', C = 'cccccccccccccccc', M = '0123456789abcdef';

beforeAll(() => { vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) }); });
afterAll(() => { vi.unstubAllGlobals(); campSession.reset(); });

describe('Grand Camp in the street', () => {
  it('the match draws only the players on its pitch now: one who quit is drawn by presence again; the crown shows while I play', () => {
    const store = new Store(); store.setItem('dakarrek.camp.match', M);
    campSession.configure({ key: () => 'f'.repeat(32), profile: () => ({ name: 'Moi', look: 2 }), endpoint: 'http://127.0.0.1:9/api/camp', storage: () => store as unknown as Storage,
      wallet: () => 0, account: () => null, WebSocketImpl: FakeWS as unknown as typeof WebSocket });
    campSession.restore();
    const ws = FakeWS.all[FakeWS.all.length - 1]; ws.open();
    const p = (tag: string, sid: number, team: 0 | 1, gone = false) => ({ tag, name: tag.slice(0, 3), look: 1, team, ready: true, hold: 'none' as const, on: !gone, at: sid, sid, ...(gone ? { gone: true } : {}) });
    const lobby: CampLobbyView = { match: M, state: 'play', terms: { fee: 0, size: 6, dist: 'team', open: true, hub: 'corniche' }, frozen: true, org: ME, teams: ['Rouge', 'Jaune'],
      players: [p(ME, 1, 0), p(B, 2, 1), p(C, 3, 1, true)], pool: 0, full: 0, created: 1, closes: 600_001 };
    ws.recv({ type: 'welcome', feature: 'camp', v: 1, match: M, you: ME, time: 1, hz: 20, lobby });
    ws.recv({ type: 'start', roster: [{ sid: 1, tag: ME, team: 0 }, { sid: 2, tag: B, team: 1 }, { sid: 3, tag: C, team: 1 }], kick: 0, seconds: 240, goals: 3, tick: 10 });
    const body = (sid: number) => ({ sid, x: sid, z: 0, vx: 0, vz: 0, f: 0, seq: 0 });
    const snap: CampSnapshot = { k: 11, clock: 0.5, half: 1, phase: 'play', score: [0, 0], ball: { x: 0, z: 0, h: 0.11, vx: 0, vz: 0, vh: 0 }, players: [body(1), body(2)], own: -1, ownTeam: -1, taker: -1 };
    ws.recv(encodeSnap(snap));                                                    // C left after kick-off: off the pitch, still on the roster
    expect(campSession.playing()).toBe(true);
    (grandCamp as unknown as { live: boolean }).live = true;
    expect(grandCamp.playing).toBe(true);                                        // main.ts shows the crown while a match is played
    expect(grandCamp.drawsTag(B)).toBe(true);
    expect(grandCamp.drawsTag(C)).toBe(false);                                   // the review's item 3: drawn by nobody until the end
    expect(grandCamp.drawsTag(ME)).toBe(false);
    (grandCamp as unknown as { live: boolean }).live = false;
    expect(grandCamp.playing).toBe(false);
    expect(grandCamp.drawsTag(B)).toBe(false);
  });
  it('the ball (its geometry, material and texture) is freed when the Corniche unloads, and built again for the next load', () => {
    const extra = new THREE.Group(), ctx = { extra, quality: () => 'high' } as unknown as GameCtx;
    const ball = () => extra.getObjectByName('grand_camp_ball') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
    const freed: string[] = [];
    const watch = (b: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>) => {
      b.geometry.addEventListener('dispose', () => freed.push('geometry')); b.material.addEventListener('dispose', () => freed.push('material'));
      b.material.map?.addEventListener('dispose', () => freed.push('texture'));
    };
    grandCamp.hubLoaded(ctx, { id: 'corniche' } as HubWorld);
    const first = ball(); expect(first).toBeDefined(); watch(first);
    extra.clear();                                                                 // main.ts: the district unloads (removed only)
    grandCamp.hubLoaded(ctx, { id: 'corniche' } as HubWorld);
    expect(freed.sort()).toEqual(['geometry', 'material', 'texture']);
    expect(ball()).not.toBe(first);
    watch(ball()); freed.length = 0;
    extra.clear();
    grandCamp.hubLoaded(ctx, { id: 'plateau' } as HubWorld);                       // another district: no pitch of Grand Camp, the ball freed too
    expect(freed.length).toBe(3);
    expect(ball()).toBeUndefined();
  });
});
