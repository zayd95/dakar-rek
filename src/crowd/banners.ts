import * as THREE from 'three';

/**
 * The supporters' banners hung on the parapet in front of their side (docs/CROWD.md): cloth in the écurie's colour
 * with an invented slogan in Wolof (CLAD) and its French. The écuries are the game's own (Baobab, Teranga); no real
 * wrestler, club or brand. One texture atlas (2 × 4 cells) for every banner of every crowd: the figures' shader picks
 * the cell (src/crowd/rig.ts), so banners cost no draw call of their own.
 * Reviewed (CLAD orthography and the French): « du daanu » is the negative (« ne tombe pas »), « ndam » is the victory
 * (« victoire »), « jàpp te daan » saisir et terrasser, « làmb ji » la lutte, « aada » la tradition; Baobab and Teranga
 * are the écuries' names, kept as written.
 */
export interface Banner { side: 'left' | 'right' | 'ends'; wo: string; fr: string; bg: number; fg: number; band: number }
export const BANNERS: readonly Banner[] = [
  { side: 'left', wo: 'BAOBAB DU DAANU !', fr: 'Le Baobab ne tombe pas !', bg: 0x1a7a44, fg: 0xffffff, band: 0xf4c20d },
  { side: 'left', wo: 'SUNU MBËR, SUNU NDAM', fr: 'Notre lutteur, notre victoire', bg: 0x15633a, fg: 0xf4c20d, band: 0xffffff },
  { side: 'left', wo: 'BAOBAB, JÀMM AK NDAM', fr: 'Baobab : la paix et la victoire', bg: 0x1f9d55, fg: 0xffffff, band: 0xf4c20d },
  { side: 'right', wo: 'TERANGA, SUNU KËR', fr: 'Teranga, notre maison', bg: 0xc8322a, fg: 0xffffff, band: 0x1c1c1f },
  { side: 'right', wo: 'JÀPP TE DAAN !', fr: 'Saisis et terrasse !', bg: 0xa82820, fg: 0xffffff, band: 0xf2f2ec },
  { side: 'right', wo: 'TERANGA, BUL TIIT !', fr: 'Teranga, n’aie pas peur !', bg: 0xd9322b, fg: 0x1c1c1f, band: 0xffffff },
  { side: 'ends', wo: 'LÀMB JI, SUNU AADA', fr: 'La lutte, notre tradition', bg: 0xf2ead8, fg: 0x1f3f8a, band: 0xd9322b },
  { side: 'ends', wo: 'DALAL AK JÀMM CI GÉEW GI', fr: 'Bienvenue dans l’arène', bg: 0xf4c20d, fg: 0x1c1c1f, band: 0x1a7a44 },
];
export const BANNER_COLS = 2, BANNER_ROWS = 4;
/** A banner in its holder's figure frame (the seat's surface, facing the ring): over the parapet in front of tier 0. */
export const BANNER = { w: 2.3, h: 0.66, top: -0.06, z: 0.6 } as const;

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
let atlas: THREE.Texture | null = null;
/** The banners' atlas (made once, shared; a plain texture where there is no canvas, as in the unit tests). */
export function bannerAtlas(): THREE.Texture {
  if (atlas) return atlas;
  const W = 1024, H = 512, cw = W / BANNER_COLS, ch = H / BANNER_ROWS;
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const g = canvas?.getContext('2d') ?? null;
  if (!canvas || !g) {
    atlas = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1);
    atlas.needsUpdate = true;
    return atlas;
  }
  canvas.width = W; canvas.height = H;
  BANNERS.forEach((b, i) => {
    const x = (i % BANNER_COLS) * cw, y = Math.floor(i / BANNER_COLS) * ch;
    g.fillStyle = hex(b.bg); g.fillRect(x, y, cw, ch);
    g.fillStyle = hex(b.band); g.fillRect(x, y + 6, cw, 9); g.fillRect(x, y + ch - 15, cw, 9);
    g.fillStyle = hex(b.fg); g.textAlign = 'center'; g.textBaseline = 'middle';
    const fit = (text: string, size: number, weight: string, max: number) => {
      let s = size;
      do { g.font = `${weight} ${s}px sans-serif`; s -= 2; } while (g.measureText(text).width > max && s > 12);
    };
    fit(b.wo, 46, 'bold', cw - 36); g.fillText(b.wo, x + cw / 2, y + ch * 0.43);
    fit(b.fr, 24, 'italic', cw - 60); g.fillText(b.fr, x + cw / 2, y + ch * 0.76);
  });
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  atlas = t;
  return t;
}
