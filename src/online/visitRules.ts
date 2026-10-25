import { HUB_IDS, type HubId, type Placement } from '../core/types';
import type { GuestPerms, HomeRef, HomeSnapshot, InviteItem, Item, Tag } from './protocol';

/**
 * LD2.0-B « Belong Online »: the pure rules of a home visit (docs/ld2/LD2_B_CONTRACT.md, « The world »). The game uses them (src/online/visit.ts,
 * src/economy/estate.ts) and the server's account may too: `validSnapshot` checks a snapshot's shape and size with nothing of the game, the DOM or the
 * network (only `HUB_IDS`, a constant).
 *
 * A snapshot is the host's home as the host's client draws it: the catalogue id and street door, the upgrades that show in the shell, and each placed
 * piece with its spot in the home's own frame (src/economy/placement.ts: metres from the interior's centre, quarter turns). A guest's client draws it at
 * the same off-grid origin (`homeOrigin`, the catalogue's order), so both see every piece in the same place.
 */
export const SNAPSHOT_MAX_CHARS = 12_000;
/** Pieces a snapshot carries at most: a piece is at most ~64 characters as JSON, so 160 of them stay well under SNAPSHOT_MAX_CHARS. */
export const SNAPSHOT_MAX_PIECES = 160;
export const SNAPSHOT_MAX_UPGRADES = 12;
/** A placement stays within this many metres of the home's centre (the largest home is 18 × 12 m). */
const REACH = 30;
const ID = /^[a-z][a-z0-9_]{0,31}$/;
const DOOR = /^([a-z]+):home:[a-z0-9_]{1,24}$/;
const round = (v: number) => Math.round(v * 100) / 100;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const only = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).every(k => keys.includes(k)) && keys.every(k => k in o);
const num = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** The host's home as their client sends it: the placed pieces (a fixed one, the « bon matelas », is in `upgrades` as 'matelas'), at most SNAPSHOT_MAX_PIECES. */
export function buildSnapshot(home: HomeRef, upgrades: readonly string[], pieces: readonly { spec: string; at?: Placement | null; fixed?: boolean }[], at: number): HomeSnapshot {
  const furniture = pieces.filter(p => p.at && !p.fixed).slice(0, SNAPSHOT_MAX_PIECES)
    .map(p => ({ spec: p.spec, at: { x: round(p.at!.x), z: round(p.at!.z), rot: (((Math.round(p.at!.rot) % 4) + 4) % 4) } }));
  return { home: { spec: home.spec, hub: home.hub, door: home.door, name: home.name }, upgrades: [...new Set(upgrades)].slice(0, SNAPSHOT_MAX_UPGRADES), furniture, at: Math.max(0, Math.round(at)) };
}
export const snapshotChars = (s: HomeSnapshot) => JSON.stringify(s).length;

/** What the game's catalogue knows (the client's check; the server leaves it out): the home with this door, a piece of furniture. */
export interface SnapshotCatalogue { home?: (spec: string, door: string) => boolean; piece?: (spec: string) => boolean }

/**
 * A snapshot from the wire, or null. Strict: exactly the known fields, ids of the catalogue's form, a district of the game, the door in that district,
 * placements within the home and on quarter turns, at most SNAPSHOT_MAX_PIECES pieces and SNAPSHOT_MAX_CHARS characters as JSON. Returns a fresh copy
 * (the caller never keeps the wire's object).
 */
export function validSnapshot(v: unknown, known?: SnapshotCatalogue): HomeSnapshot | null {
  if (!isObj(v) || !only(v, ['home', 'upgrades', 'furniture', 'at'])) return null;
  const h = v.home;
  if (!isObj(h) || !only(h, ['spec', 'hub', 'door', 'name'])) return null;
  if (typeof h.spec !== 'string' || !ID.test(h.spec) || typeof h.hub !== 'string' || !(HUB_IDS as readonly string[]).includes(h.hub)) return null;
  const door = typeof h.door === 'string' ? DOOR.exec(h.door) : null;
  if (!door || door[1] !== h.hub || typeof h.name !== 'string' || h.name.length < 1 || h.name.length > 80) return null;
  if (!num(v.at, 0, 1e15)) return null;
  const ups = v.upgrades;
  if (!Array.isArray(ups) || ups.length > SNAPSHOT_MAX_UPGRADES || !ups.every(u => typeof u === 'string' && ID.test(u))) return null;
  const list = v.furniture;
  if (!Array.isArray(list) || list.length > SNAPSHOT_MAX_PIECES) return null;
  const furniture: { spec: string; at: Placement }[] = [];
  for (const f of list) {
    if (!isObj(f) || !only(f, ['spec', 'at']) || typeof f.spec !== 'string' || !ID.test(f.spec)) return null;
    const a = f.at;
    if (!isObj(a) || !only(a, ['x', 'z', 'rot']) || !num(a.x, -REACH, REACH) || !num(a.z, -REACH, REACH) || !num(a.rot, 0, 3) || !Number.isInteger(a.rot)) return null;
    if (known?.piece && !known.piece(f.spec)) return null;
    furniture.push({ spec: f.spec, at: { x: a.x, z: a.z, rot: a.rot } });
  }
  if (known?.home && !known.home(h.spec, h.door as string)) return null;
  const out: HomeSnapshot = { home: { spec: h.spec, hub: h.hub as HubId, door: h.door as string, name: h.name }, upgrades: [...ups as string[]], furniture, at: v.at };
  return snapshotChars(out) <= SNAPSHOT_MAX_CHARS ? out : null;
}

// ------------------------------------------------------------------ the guest's side: read-only

/** Kinds of furniture a guest may use with « use » on: the TV and the radio. Never the kitchen, the desk's paid work, the wardrobe, the mirror… */
export const GUEST_USES: readonly string[] = ['tv', 'radio'];
export const guestMayUse = (type: string, use: boolean) => use && GUEST_USES.includes(type);
/** What a guest may sit on: chairs and sofas, with « use » on. Never a bed (no « Dormir ici », no lying on the host's bed). */
export const guestMaySit = (kind: string, clip: string | undefined, use: boolean) => use && kind !== 'bed' && clip !== 'Lie';
/** What a guest is never offered in a host's home, whatever the permissions: the home's own actions and the host's things. */
export const GUEST_NEVER: readonly string[] = ['amenager', 'commander', 'annonce', 'dormir', 'cuisiner', 'douche', 'laver', 'bureau', 'acheter', 'vendre', 'domicile'];

/** What a guest is offered by a host's furniture (the checks compare it with what the game shows): seats to sit on and uses (activity ids). */
export function guestOffers(pieces: readonly { type: string; seats?: readonly { kind: string; clip?: string }[]; use?: { id: string }; sleep?: number }[], perms: GuestPerms): { seats: number; uses: string[] } {
  let seats = 0; const uses: string[] = [];
  for (const p of pieces) {
    seats += (p.seats ?? []).filter(s => guestMaySit(s.kind, s.clip, perms.use)).length;
    if (p.use && !p.sleep && guestMayUse(p.type, perms.use)) uses.push(p.use.id);
  }
  return { seats, uses };
}

// ------------------------------------------------------------------ invitations

/** The invitations that let this player into `host`'s home now: from the host, accepted, not expired. */
export function openInvites(items: readonly Item[], host: Tag, now: number): InviteItem[] {
  return items.filter((i): i is InviteItem => i.k === 'invite' && i.from === host && i.state === 'accepted' && i.until > now);
}
/** Whether a visit on this invitation must end now: revoked, declined, expired (by state or by time). */
export const inviteOver = (i: InviteItem, now: number) => i.state !== 'accepted' || i.until <= now;
