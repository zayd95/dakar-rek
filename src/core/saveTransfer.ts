import type { SaveData } from './types';
import { migrate, SAVE_KEY, SCHEMA_VERSION, type KV } from './save';

/**
 * A guest save moved by hand (docs/SAVES.md § « Copy and import »): the player copies a code from the settings and pastes it into another browser,
 * another device or the same one after its storage was cleared. Nothing synchronises a save by itself.
 *
 * The code is `DAKARREK6:` + the save as base64 UTF-8 JSON + `.` + an 8-digit checksum (a code cut short by a paste is refused, never half-read). A
 * bare JSON save is accepted too. Whatever comes in goes through `migrate` like any stored save: a save of a newer client is refused, never read
 * blindly. Importing keeps the game it replaces under `BACKUP_KEY`, so « Revenir à la partie d’avant » undoes it once.
 */
export const EXPORT_PREFIX = 'DAKARREK6:';
export const BACKUP_KEY = 'dakarrek.guest.save.v6.before-import';
/** The player's name and colour online live beside the save (src/multiplayer/client.ts): the code carries them too, so a restored game keeps its name. */
export const PROFILE_KEY = 'dakarrek.presence.profile';
export interface CodeProfile { name: string; look: number }
/**
 * LD2.0-B: the device key of the online account (src/multiplayer/client.ts, src/online/client.ts: `dakarrek.chat.key`). The code carries it (an additive
 * field, `deviceKey`) so a player who changes phone keeps their Messages and their Teranga Money: the code is then also the key to that account, and
 * the settings say it must not be shared. Older codes have none and still import (the device keeps its own key). Importing a code with a key installs
 * it only once the player has confirmed the import (`importSave`); the key it replaces is kept beside the game kept aside, so « Revenir à la partie
 * d’avant » gives both back.
 */
export const DEVICE_KEY = 'dakarrek.chat.key';
export const KEY_BACKUP = 'dakarrek.chat.key.before-import';
const KEY_RE = /^[a-f0-9]{32}$/;
const isKey = (v: unknown): v is string => typeof v === 'string' && KEY_RE.test(v);
/** This browser's device key, if it has one (null in a test or where the storage is blocked). */
function currentKey(): string | null {
  try { const k = (globalThis as { localStorage?: Storage }).localStorage?.getItem(DEVICE_KEY); return isKey(k) ? k : null; } catch { return null; }
}

/** FNV-1a, 32 bits, as 8 hex digits: enough to catch a code cut or altered by a paste. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromBase64(b64: string): string {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** The game as a code: the save, the name online, and this device's key of the online account (read from the storage when not given). */
export function exportCode(data: SaveData, profile?: CodeProfile | null, key: string | null = currentKey()): string {
  const json = JSON.stringify({ ...data, ...(profile ? { presenceProfile: profile } : {}), ...(isKey(key) ? { deviceKey: key } : {}) });
  return `${EXPORT_PREFIX}${toBase64(json)}.${checksum(json)}`;
}

export type ReadResult = { data: SaveData; profile: CodeProfile | null; key: string | null } | { error: string };
/** A pasted code (or JSON) → a current save, or why not. Spaces and line breaks a messenger may add are ignored. */
export function readCode(text: string, now = Date.now()): ReadResult {
  const t = text.trim();
  if (!t) return { error: 'Colle d’abord le code de ta sauvegarde.' };
  let raw: unknown;
  try {
    if (t.startsWith('{')) raw = JSON.parse(t);
    else {
      const body = t.replace(/\s+/g, '');
      if (!body.startsWith(EXPORT_PREFIX)) return { error: 'Ce n’est pas un code de sauvegarde Dakar Rek (il commence par DAKARREK6:).' };
      const [b64, sum] = body.slice(EXPORT_PREFIX.length).split('.');
      if (!b64 || !sum) return { error: 'Le code est incomplet : copie-le en entier.' };
      const json = fromBase64(b64);
      if (checksum(json) !== sum) return { error: 'Le code est incomplet ou modifié : copie-le à nouveau, en entier.' };
      raw = JSON.parse(json);
    }
  } catch { return { error: 'Le code est illisible : copie-le à nouveau, en entier.' }; }
  const v = (raw as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof v === 'number' && v > SCHEMA_VERSION) return { error: 'Cette sauvegarde vient d’une version plus récente du jeu : mets le jeu à jour pour l’importer.' };
  const data = migrate(raw, now);
  if (!data) return { error: 'Ce code ne contient pas de partie.' };
  const p = (raw as { presenceProfile?: { name?: unknown; look?: unknown } }).presenceProfile;
  const profile = p && typeof p.name === 'string' && p.name.trim() ? { name: p.name.slice(0, 24), look: typeof p.look === 'number' && Number.isInteger(p.look) ? p.look : 0 } : null;
  const key = (raw as { deviceKey?: unknown }).deviceKey;
  return { data, profile, key: isKey(key) ? key : null };
}

/**
 * Replace the stored game by `data`, keeping the one it replaces under BACKUP_KEY (one slot: the game right before the last import). The caller
 * reloads the page with saves held (src/core/saveHealth.ts), so the running game does not write itself back. False when the storage refuses.
 */
export function importSave(store: KV | null, data: SaveData, profile: CodeProfile | null = null, now = Date.now(), key: string | null = null): boolean {
  if (!store) return false;
  try {
    const cur = store.getItem(SAVE_KEY);
    if (cur) store.setItem(BACKUP_KEY, cur);
    store.setItem(SAVE_KEY, JSON.stringify({ ...data, savedAt: now }));
  } catch { return false; }
  if (profile) { try { store.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* the game keeps its name for this visit */ } }
  // the online account: the key of the game kept aside goes with it; the code's key (if any) is this device's from now on
  try {
    const was = store.getItem(DEVICE_KEY);
    if (isKey(was)) store.setItem(KEY_BACKUP, was); else store.removeItem(KEY_BACKUP);
    if (isKey(key)) store.setItem(DEVICE_KEY, key);
  } catch { /* blocked storage: the device keeps its key */ }
  return true;
}
/** The game kept by the last import, if any (to offer going back to it). */
export function backupOf(store: KV | null): SaveData | null {
  try { const b = store?.getItem(BACKUP_KEY); return b ? migrate(JSON.parse(b)) : null; } catch { return null; }
}
/** Go back to the game the last import replaced: the two swap, so this too can be undone. */
export function undoImport(store: KV | null): boolean {
  if (!store) return false;
  try {
    const b = store.getItem(BACKUP_KEY); if (!b || !migrate(JSON.parse(b))) return false;
    const cur = store.getItem(SAVE_KEY);
    store.setItem(SAVE_KEY, b);
    if (cur) store.setItem(BACKUP_KEY, cur); else store.removeItem(BACKUP_KEY);
    const key = store.getItem(KEY_BACKUP), was = store.getItem(DEVICE_KEY);   // the keys swap with the games (an import made before LD2.0-B kept none)
    if (isKey(key)) { store.setItem(DEVICE_KEY, key); if (isKey(was)) store.setItem(KEY_BACKUP, was); else store.removeItem(KEY_BACKUP); }
    return true;
  } catch { return false; }
}

/** What a save holds, for the line shown before importing it: « 3 h 12 de jeu · 12 450 000 F · Maison familiale · 2 véhicules ». */
export interface SaveSummary { playedMin: number; wallet: number; home: string; vehicles: number; furniture: number; savedAt: number }
export function summarize(data: SaveData, nameOf: (spec: string) => { name: string; kind: string } | undefined): SaveSummary {
  const home = data.assets.list.find(a => a.uid === data.assets.home);
  const kinds = data.assets.list.map(a => nameOf(a.spec)?.kind);
  return {
    playedMin: Math.floor(data.playedMs / 60000), wallet: data.wallet, home: (home && nameOf(home.spec)?.name.split(' · ')[0]) ?? 'Ta chambre',
    vehicles: kinds.filter(k => k === 'vehicle').length, furniture: kinds.filter(k => k === 'furniture').length, savedAt: data.savedAt,
  };
}
