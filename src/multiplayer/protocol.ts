import { HUB_IDS, type HubId } from '../core/types';

export const PROTOCOL_VERSION = 1;
export const ROOM_CAPACITY = 24;
export const MAX_ROOMS_PER_HUB = 128;
export const SEND_INTERVAL_MS = 200;
export const PRESENCE_CLIPS = ['Idle', 'Walk', 'Run', 'Talk', 'Sit', 'Stance', 'Dance_A', 'Dance_B', 'Celebrate', 'Prep', 'Entrance_Walk'] as const;
export type PresenceClip = typeof PRESENCE_CLIPS[number];
export interface Move {
  type: 'move'; x: number; y: number; z: number; yaw: number; speed: number;
  space: string; clip: PresenceClip;
}
export interface Peer extends Move { id: string; name: string; look: number; updatedAt: number }
export type ServerMessage =
  | { type: 'welcome'; version: number; id: string; hub: HubId; room: number; count: number; time: number; peers: Peer[] }
  | { type: 'peer'; peer: Peer }
  | { type: 'leave'; id: string; count: number }
  | { type: 'count'; count: number };

export function isHub(value: unknown): value is HubId { return HUB_IDS.includes(value as HubId); }
export function nickname(value: unknown): string {
  return typeof value === 'string' ? value.normalize('NFC').replace(/[^\p{L}\p{N} '\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Dakarois' : 'Dakarois';
}
export function lookIndex(value: unknown): number {
  const n = Number(value); return Number.isInteger(n) && n >= 0 && n < 6 ? n : 0;
}
/** Presence accepts positions and poses only. Money, inventory and saves never cross this protocol. */
export function parseMove(value: unknown, hub: HubId): Move | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.type !== 'move' || !['x', 'y', 'z', 'yaw', 'speed'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k]))) return null;
  const x = v.x as number, y = v.y as number, z = v.z as number, speed = v.speed as number;
  if (Math.abs(x) > 4096 || Math.abs(z) > 4096 || y < -20 || y > 100 || speed < 0 || speed > 6) return null;
  if (typeof v.space !== 'string' || !(v.space === 'street' || v.space === 'home' || v.space === 'scene'
    || (hub === 'plateau' && v.space === 'plateau:mosque:door')
    || new RegExp(`^${hub}:(?:gargote|maiga):[0-9]{2}$`).test(v.space))) return null;
  if (!PRESENCE_CLIPS.includes(v.clip as PresenceClip)) return null;
  return { type: 'move', x, y, z, speed, yaw: Math.atan2(Math.sin(v.yaw as number), Math.cos(v.yaw as number)), space: v.space, clip: v.clip as PresenceClip };
}
