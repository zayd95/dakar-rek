/**
 * A person's look (body, face, hair, outfit): shared by the player's avatars, the crowd and other players.
 * Three-free so the save, the tests and the presence protocol can use it.
 */
export type Style = 'boubou' | 'tee' | 'dress';
export type Pattern = 'uni' | 'wax' | 'bazin' | 'rayure';
export type HairStyle = 'short' | 'puff' | 'braids' | 'locs' | 'none';
export type Hat = 'kufi' | 'headwrap';
export type Legs = 'trousers' | 'shorts';
export const FACE_KEYS = ['FaceNose', 'FaceLips', 'FaceJaw', 'FaceEyes', 'FaceLong', 'FaceRound'] as const;
export type FaceKey = typeof FACE_KEYS[number];

export interface PersonLook {
  skin: number; style: Style; top: number; bottom?: number; pattern?: Pattern; accent?: number;
  hat?: Hat | null; hatColor?: number; shoes?: number; female?: boolean;
  /** Body shape (morph targets + joint offsets), 0–1 each. */
  heavy?: number; muscular?: number; old?: number;
  /** Height, -1 (shorter) … 1 (taller). */
  height?: number;
  /** Face shape sliders, -1 … 1. */
  face?: Partial<Record<FaceKey, number>>;
  hair?: HairStyle; hairColor?: number; beard?: number | null; // beard colour, null = none
  eyeColor?: number; legs?: Legs;
}

// ---------------------------------------------------------------- palettes used by the creator and the crowd
export const SKIN_TONES = [0x2a170f, 0x34200f, 0x3b2216, 0x45291a, 0x4e2e1c, 0x5b3420, 0x6b3f25, 0x7a4a2c, 0x8a5634, 0x9c6a43, 0xb07f55, 0xc89a72];
export const HAIR_COLORS = [0x1c1617, 0x2e2018, 0x4a3020, 0x6a3a22, 0x8a8580, 0xd8d4cc, 0x7a2a1a, 0xb08a4a];
export const EYE_COLORS = [0x9a8a80, 0x7a6a5a, 0x5a4a3a, 0x8a9078];
export const CLOTH_COLORS = [0xf2f2ec, 0xe8e2d0, 0xd9b44a, 0xf4c20d, 0xe8742c, 0xd9322b, 0x7a1f3d, 0xc2417f, 0x6b3fa0, 0x27407a, 0x2f6fb3, 0x7fb8d8, 0x1a9d54, 0x1f7a44, 0x6b5a45, 0x3d4a5c, 0x2b2f3a, 0x1c1c1f];

// ---------------------------------------------------------------- validation
const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const color = (v: unknown, d: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? v as T : d);

export const DEFAULT_LOOK: PersonLook = { skin: 0x5b3420, style: 'tee', top: 0x2f6fb3, bottom: 0x3d4a5c, pattern: 'uni', accent: 0xf4c20d, shoes: 0xf2f2ec, hair: 'short', hairColor: 0x1c1617, beard: null, hat: null, legs: 'trousers' };

/** Any stored or received object -> a complete, safe look. */
export function sanitizeLook(raw: unknown): PersonLook {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_LOOK;
  const face: Partial<Record<FaceKey, number>> = {};
  const rf = (r.face && typeof r.face === 'object' ? r.face : {}) as Record<string, unknown>;
  for (const k of FACE_KEYS) { const v = clamp(rf[k], -1, 1, 0); if (v) face[k] = v; }
  return {
    skin: color(r.skin, d.skin), style: oneOf(r.style, ['boubou', 'tee', 'dress'] as const, 'tee'),
    top: color(r.top, d.top), bottom: color(r.bottom, d.bottom!), pattern: oneOf(r.pattern, ['uni', 'wax', 'bazin', 'rayure'] as const, 'uni'),
    accent: color(r.accent, d.accent!), hat: r.hat === 'kufi' || r.hat === 'headwrap' ? r.hat : null, hatColor: color(r.hatColor, 0xf2f2ec),
    shoes: color(r.shoes, d.shoes!), female: r.female === true,
    heavy: clamp(r.heavy, 0, 1, 0), muscular: clamp(r.muscular, 0, 1, 0), old: clamp(r.old, 0, 1, 0), height: clamp(r.height, -1, 1, 0),
    face, hair: oneOf(r.hair, ['short', 'puff', 'braids', 'locs', 'none'] as const, 'short'), hairColor: color(r.hairColor, d.hairColor!),
    beard: r.beard === null || r.beard === undefined ? null : color(r.beard, 0x1a1414), eyeColor: color(r.eyeColor, EYE_COLORS[0]),
    legs: r.legs === 'shorts' ? 'shorts' : 'trousers',
  };
}

// ---------------------------------------------------------------- compact code (multiplayer, links)
// "a1" + 11 slider chars (0-9a-k = 21 steps) + 6 choice chars + 9 colours as 6 hex digits: 73 characters.
const STEPS = 20, DIG = '0123456789abcdefghijk';
const STYLES: Style[] = ['tee', 'boubou', 'dress'], PATTERNS: Pattern[] = ['uni', 'wax', 'bazin', 'rayure'];
const HAIRS: HairStyle[] = ['short', 'puff', 'braids', 'locs', 'none'], HATS: (Hat | null)[] = [null, 'kufi', 'headwrap'];
export const LOOK_CODE_RE = /^a1[0-9a-k]{11}[0-9]{6}[0-9a-f]{54}$/;
const q01 = (v: number) => DIG[Math.round(Math.min(1, Math.max(0, v)) * STEPS)];
const q11 = (v: number) => DIG[Math.round((Math.min(1, Math.max(-1, v)) + 1) / 2 * STEPS)];
const u01 = (c: string) => DIG.indexOf(c) / STEPS;
const u11 = (c: string) => DIG.indexOf(c) / STEPS * 2 - 1;
const hex = (n: number) => n.toString(16).padStart(6, '0');

export function encodeLook(look: PersonLook): string {
  const l = sanitizeLook(look), f = l.face ?? {};
  const sliders = q01(l.female ? 1 : 0) + q01(l.heavy ?? 0) + q01(l.muscular ?? 0) + q01(l.old ?? 0) + q11(l.height ?? 0)
    + FACE_KEYS.map(k => q11(f[k] ?? 0)).join('');
  const choices = [STYLES.indexOf(l.style), PATTERNS.indexOf(l.pattern ?? 'uni'), HAIRS.indexOf(l.hair ?? 'short'), HATS.indexOf(l.hat ?? null), l.legs === 'shorts' ? 1 : 0, l.beard == null ? 0 : 1].join('');
  const colors = [l.skin, l.top, l.bottom ?? 0, l.accent ?? 0, l.hatColor ?? 0, l.shoes ?? 0, l.hairColor ?? 0, l.beard ?? 0, l.eyeColor ?? 0].map(hex).join('');
  return 'a1' + sliders + choices + colors;
}

export function decodeLook(code: unknown): PersonLook | null {
  if (typeof code !== 'string' || !LOOK_CODE_RE.test(code)) return null;
  const s = code.slice(2), sl = s.slice(0, 11), ch = s.slice(11, 17).split('').map(Number), co = s.slice(17);
  const c = (i: number) => parseInt(co.slice(i * 6, i * 6 + 6), 16);
  const face: Partial<Record<FaceKey, number>> = {};
  FACE_KEYS.forEach((k, i) => { const v = Math.round(u11(sl[5 + i]) * 100) / 100; if (v) face[k] = v; });
  return sanitizeLook({
    female: u01(sl[0]) >= 0.5, heavy: u01(sl[1]), muscular: u01(sl[2]), old: u01(sl[3]), height: Math.round(u11(sl[4]) * 100) / 100, face,
    style: STYLES[ch[0]], pattern: PATTERNS[ch[1]], hair: HAIRS[ch[2]], hat: HATS[ch[3]] ?? null, legs: ch[4] ? 'shorts' : 'trousers',
    skin: c(0), top: c(1), bottom: c(2), accent: c(3), hatColor: c(4), shoes: c(5), hairColor: c(6), beard: ch[5] ? c(7) : null, eyeColor: c(8),
  });
}

// ---------------------------------------------------------------- the player's avatars (several, one active)
export interface Avatar { id: string; name: string; look: PersonLook; thumb?: string; createdAt: number; updatedAt: number }
export interface AvatarBook { active: string; list: Avatar[] }
export const AVATARS_KEY = 'dakarrek.avatars';
export const MAX_AVATARS = 8;

export function newAvatarId() { return 'av' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }
export function nameOf(v: unknown, d: string) {
  return typeof v === 'string' ? v.normalize('NFC').replace(/[^\p{L}\p{N} '\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24) || d : d;
}

export function readBook(raw: unknown): AvatarBook | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.list)) return null;
  const list: Avatar[] = [];
  for (const a of r.list.slice(0, MAX_AVATARS)) {
    if (!a || typeof a !== 'object') continue;
    const o = a as Record<string, unknown>;
    const id = typeof o.id === 'string' && /^[a-z0-9]{4,24}$/.test(o.id) ? o.id : newAvatarId();
    const thumb = typeof o.thumb === 'string' && o.thumb.startsWith('data:image/') && o.thumb.length < 60000 ? o.thumb : undefined;
    list.push({ id, name: nameOf(o.name, 'Dakarois'), look: sanitizeLook(o.look), thumb, createdAt: Number(o.createdAt) || Date.now(), updatedAt: Number(o.updatedAt) || Date.now() });
  }
  if (!list.length) return null;
  const active = list.some(a => a.id === r.active) ? r.active as string : list[0].id;
  return { active, list };
}

export function loadBook(storage: Storage | null): AvatarBook | null {
  try { return readBook(JSON.parse(storage?.getItem(AVATARS_KEY) ?? 'null')); } catch { return null; }
}
export function saveBook(storage: Storage | null, book: AvatarBook): boolean {
  try { storage?.setItem(AVATARS_KEY, JSON.stringify(book)); return !!storage; } catch {
    // quota: drop thumbnails and try again
    try { storage?.setItem(AVATARS_KEY, JSON.stringify({ ...book, list: book.list.map(a => ({ ...a, thumb: undefined })) })); return !!storage; } catch { return false; }
  }
}
export function activeAvatar(book: AvatarBook): Avatar { return book.list.find(a => a.id === book.active) ?? book.list[0]; }

// ---------------------------------------------------------------- random looks (crowd and the creator's dice)
const pick = <T,>(a: readonly T[], r: () => number) => a[Math.floor(r() * a.length)];
const BOUBOU = [0xf2f2ec, 0x9cc8e8, 0x27407a, 0x6b3fa0, 0x1f7a44, 0xd9b44a, 0xe8e2d4, 0x7a1f3d];
const TEES = [0xd9322b, 0x1a9d54, 0xf4c20d, 0x2f6fb3, 0xf2f2ec, 0x222428, 0xe8742c, 0x7fb8d8];
const DRESS = [0xe58a2f, 0xc2417f, 0x1f7a44, 0x2f6fb3, 0xd9322b, 0x6b3fa0, 0xf4c20d];
const ACC = [0xf6e7c1, 0x1c1c1f, 0xf4c20d, 0xffffff, 0x2a8f6a];
const faceRand = (r: () => number) => { const f: Partial<Record<FaceKey, number>> = {}; for (const k of FACE_KEYS) { const v = Math.round((r() * 2 - 1) * 0.8 * 100) / 100; if (Math.abs(v) > 0.15) f[k] = v; } return f; };

export function randomLook(r: () => number, female?: boolean): PersonLook {
  const skin = pick(SKIN_TONES.slice(0, 9), r), u = female === undefined ? r() : female ? 0 : 0.5;
  const heavy = r() < 0.25 ? 0.4 + r() * 0.6 : 0, height = Math.round((r() * 2 - 1) * 0.7 * 100) / 100, face = faceRand(r);
  if (u < 0.36) {
    const old = r() < 0.15 ? 0.4 + r() * 0.5 : 0;
    return { skin, female: true, heavy, old, height, face, hair: r() < 0.45 ? 'braids' : 'puff', hairColor: old > 0.6 ? 0x8a8580 : 0x1c1617, style: 'dress', top: pick(DRESS, r), pattern: r() < 0.75 ? 'wax' : 'uni', accent: pick(ACC, r), hat: r() < 0.65 ? 'headwrap' : null, hatColor: pick(DRESS, r), shoes: 0x6b4a2e, beard: null };
  }
  if (u < 0.62) {
    const beard = r() < 0.35 ? pick([0xd8d4cc, 0x8a8580, 0x1a1414], r) : null, old = beard !== null && beard !== 0x1a1414 ? 0.5 + r() * 0.5 : 0;
    return { skin, heavy, old, height, face, hair: 'short', hairColor: old > 0.6 ? 0x8a8580 : 0x1c1617, style: 'boubou', top: pick(BOUBOU, r), pattern: r() < 0.5 ? 'bazin' : 'uni', hat: r() < 0.5 ? 'kufi' : null, hatColor: r() < 0.6 ? 0xf2f2ec : 0x1c1c1f, shoes: 0x3a2a1e, beard };
  }
  return { skin, height, face, hair: r() < 0.18 ? 'locs' : 'short', hairColor: 0x1c1617, muscular: r() < 0.3 ? r() : 0, beard: r() < 0.15 ? 0x1a1414 : null, style: 'tee', top: pick(TEES, r), pattern: r() < 0.25 ? 'rayure' : 'uni', accent: 0xffffff, bottom: pick([0x2b2f3a, 0x3d4a5c, 0x1c1c1f, 0x6b5a45], r), legs: r() < 0.15 ? 'shorts' : 'trousers', shoes: pick([0xf2f2ec, 0x1c1c1f, 0x8a5a3a], r) };
}
