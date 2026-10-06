import * as THREE from 'three';

/**
 * Wrestling look options — EDITABLE DRAFT, UNREVIEWED.
 * Colours and patterns are generic placeholders; accessories are neutral placeholders standing in for
 * items that will be chosen from validated references (gris-gris and related accessories) after review by
 * Habib and wrestling practitioners. No item carries any meaning or any gameplay effect.
 */
export const REVIEW_STATUS = 'Brouillon non validé';

export const NGEMB_COLORS: { id: string; label: string; hex: number }[] = [
  { id: 'blanc', label: 'Blanc', hex: 0xf2efe6 },
  { id: 'indigo', label: 'Indigo', hex: 0x27407a },
  { id: 'rouge', label: 'Rouge', hex: 0xb8322a },
  { id: 'vert', label: 'Vert', hex: 0x1f7a44 },
  { id: 'ocre', label: 'Ocre', hex: 0xc98a2e },
  { id: 'noir', label: 'Noir', hex: 0x1c1c1f },
];
export const NGEMB_PATTERNS: { id: string; label: string }[] = [
  { id: 'uni', label: 'Uni' },
  { id: 'rayures', label: 'Rayures' },
  { id: 'damier', label: 'Damier' },
  { id: 'bordure', label: 'Bordure' },
];

export type Socket = 'armL' | 'armR' | 'waist' | 'neck';
export const ACCESSORIES: { id: string; label: string; socket: Socket; color: number }[] = [
  { id: 'bras_g', label: 'Accessoire de bras gauche (placeholder)', socket: 'armL', color: 0x3b2a1e },
  { id: 'bras_d', label: 'Accessoire de bras droit (placeholder)', socket: 'armR', color: 0x3b2a1e },
  { id: 'taille', label: 'Accessoire de taille (placeholder)', socket: 'waist', color: 0x5a3d26 },
  { id: 'cou', label: 'Accessoire de cou (placeholder)', socket: 'neck', color: 0x6b4a2e },
];

const texCache = new Map<string, THREE.CanvasTexture>();
export function ngembTexture(colorId: string, patternId: string): THREE.Texture {
  const key = colorId + '/' + patternId;
  const hit = texCache.get(key); if (hit) return hit;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const base = NGEMB_COLORS.find(x => x.id === colorId)?.hex ?? 0xf2efe6;
  const col = '#' + base.toString(16).padStart(6, '0');
  const light = (base & 0xffffff) > 0x888888;
  const accent = light ? '#2a2a2e' : '#f2efe6';
  g.fillStyle = col; g.fillRect(0, 0, 64, 64);
  g.fillStyle = accent;
  if (patternId === 'rayures') for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 5, 64);
  if (patternId === 'damier') for (let y = 0; y < 64; y += 16) for (let x = (y / 16) % 2 ? 16 : 0; x < 64; x += 32) g.fillRect(x, y, 16, 16);
  if (patternId === 'bordure') { g.fillRect(0, 0, 64, 8); g.fillRect(0, 56, 64, 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  texCache.set(key, t); return t;
}
