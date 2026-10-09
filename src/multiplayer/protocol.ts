import { HUB_IDS, type HubId } from '../core/types';
import type { ChatChannel, ChatFailure } from './chatRules';

export const PROTOCOL_VERSION = 1;
export const ROOM_CAPACITY = 24;
export const MAX_ROOMS_PER_HUB = 128;
export const SEND_INTERVAL_MS = 200;
export const PRESENCE_CLIPS = ['Idle', 'Walk', 'Run', 'Talk', 'Sit', 'Stance', 'Dance_A', 'Dance_B', 'Celebrate', 'Prep', 'Entrance_Walk', 'Kneel'] as const;
export type PresenceClip = typeof PRESENCE_CLIPS[number];
export interface Move {
  type: 'move'; x: number; y: number; z: number; yaw: number; speed: number;
  space: string; clip: PresenceClip;
}
/** `tag` is a stable public key derived server-side from a private device key: mute/block survive reconnects without revealing the key. */
export interface Peer extends Move { id: string; name: string; look: number; tag?: string; updatedAt: number }
export interface ChatMessage { type: 'chat'; id: string; from: string; name: string; tag?: string; channel: ChatChannel; text: string; at: number }
export interface ChatAck { type: 'chat-ack'; id: string; ok: boolean; reason?: ChatFailure; delivered?: number; duplicate?: boolean; at?: number }
export type ServerMessage =
  | { type: 'welcome'; version: number; id: string; hub: HubId; room: number; count: number; time: number; peers: Peer[] }
  | { type: 'peer'; peer: Peer }
  | { type: 'leave'; id: string; count: number }
  | { type: 'count'; count: number }
  | ChatMessage
  | ChatAck
  | { type: 'report-ack'; target: string; ok: boolean };

export function isHub(value: unknown): value is HubId { return HUB_IDS.includes(value as HubId); }
export function nickname(value: unknown): string {
  return typeof value === 'string' ? value.normalize('NFC').replace(/[^\p{L}\p{N} '\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Dakarois' : 'Dakarois';
}
/** Private per-device key (random hex) sent on connect; only its hash is ever shared. */
export function deviceKey(value: unknown): string | null { return typeof value === 'string' && /^[a-f0-9]{32}$/.test(value) ? value : null; }
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
  // spaces: the street, the own room, a scene, a public interior of this hub, a vehicle of one of its lines
  // (src/transport), a mosque's prayer hall (src/venues/mosque.ts) or a club's terrace (src/venues/club.ts)
  if (typeof v.space !== 'string' || !(v.space === 'street' || v.space === 'home' || v.space === 'scene'
    || new RegExp(`^${hub}:(?:(?:gargote|maiga):[0-9]{2}|rapide:[0-9a-z]{1,6}:[0-9])$`).test(v.space)
    || new RegExp(`^${hub}:venue:mosque:[0-9]{2}:salle$`).test(v.space)
    || v.space === `${hub}:venue:club`)) return null;
  if (!PRESENCE_CLIPS.includes(v.clip as PresenceClip)) return null;
  return { type: 'move', x, y, z, speed, yaw: Math.atan2(Math.sin(v.yaw as number), Math.cos(v.yaw as number)), space: v.space, clip: v.clip as PresenceClip };
}
