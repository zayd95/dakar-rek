import * as THREE from 'three';
import data from './quran.json';

/**
 * Quranic text of the Grande Mosquée: a few whole verses copied verbatim from Tanzil's verified text (Simple edition)
 * by `scripts/quran-extract.mjs` into quran.json, with Tanzil's copyright block. Habib's rules (9 Oct 2026): no invented
 * religious text, no reward for practice. The text is shown only inside the prayer hall — calligraphy on the walls and
 * a mushaf on its stand — never on floors, goods, vehicles or other venues, and is never edited, re-shaped or split
 * inside a verse (lines break only between words). The source is credited with a link to tanzil.net wherever the text
 * can be read.
 */
export interface Verse { sura: number; aya: number; text: string }
export interface Passage { id: string; label: string; sura: number; suraName: string; verses: Verse[] }
export type PassageId = 'bismillah' | 'fatiha' | 'kursi' | 'ikhlas';

export const QURAN_SOURCE = { name: 'Tanzil Project', url: 'https://tanzil.net', edition: data.edition, notice: data.notice } as const;
/** Short credit line shown under any readable Quranic text. */
export const QURAN_CREDIT = 'Texte coranique : Tanzil Project — tanzil.net';

export function passage(id: PassageId): Passage {
  const p = (data.passages as Passage[]).find(x => x.id === id);
  if (!p) throw new Error(`unknown passage ${id}`);
  return p;
}

/** Arabic-Indic digits for verse numbers (١٢٣). */
export const arabicDigits = (n: number) => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[+d]);

/** Fonts with Arabic: a Quranic or Naskh face when the device has one, then common system faces. */
export const ARABIC_FONTS = "'Amiri Quran', 'Amiri', 'Scheherazade New', 'Noto Naskh Arabic', 'Traditional Arabic', 'Geeza Pro', 'Segoe UI', 'FreeSerif', 'DejaVu Sans', serif";

/** End-of-verse sign between verses on the wall panels (standard in written mushafs; never inside a verse). */
const AYAH_END = '\u06DD';
/** Small Quranic pause marks (ۖ ۗ ۘ ۙ ۚ ۛ ۜ): they belong with the word before them when lines wrap. */
const PAUSE = /^[\u06D6-\u06DC]+$/;

/** Words of the passage ready to wrap: pause marks stay with the previous word; verses are separated by ۝. */
export function wrapUnits(p: Passage, separate = true): string[] {
  const units: string[] = [];
  p.verses.forEach((v, i) => {
    for (const w of v.text.split(' ')) {
      if (PAUSE.test(w) && units.length) units[units.length - 1] += ' ' + w;
      else units.push(w);
    }
    if (separate && i < p.verses.length - 1) units[units.length - 1] += ' ' + AYAH_END;
  });
  return units;
}

/** Greedy line breaking between words, measured with `measure`. */
export function wrapLines(units: string[], maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const u of units) {
    const next = line ? line + ' ' + u : u;
    if (line && measure(next) > maxWidth) { lines.push(line); line = u; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export interface Calligraphy { texture: THREE.CanvasTexture; lines: number; drawn: boolean }

/**
 * A calligraphy panel: gold Naskh on deep green inside a gold frame, the passage centred right-to-left on as few lines
 * as fit. Size in metres (the canvas keeps the same proportions). `drawn` is false when the device has no font able to
 * draw Arabic (nothing is shown rather than broken glyphs: the panel stays a plain frame).
 */
export function calligraphy(p: Passage, wM: number, hM: number, opts: { px?: number; maxLines?: number } = {}): Calligraphy {
  const W = opts.px ?? 1024, H = Math.round((W * hM) / wM);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#163f30'; c.fillRect(0, 0, W, H);
  const b = Math.max(6, Math.round(H * 0.045));
  c.strokeStyle = '#d4b24a'; c.lineWidth = b; c.strokeRect(b, b, W - 2 * b, H - 2 * b);
  c.lineWidth = Math.max(2, b / 3); c.strokeRect(b * 2.4, b * 2.4, W - 4.8 * b, H - 4.8 * b);
  const innerW = W - 9 * b, innerH = H - 8 * b;
  c.direction = 'rtl'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const units = wrapUnits(p);
  // largest size whose wrapped lines fit the frame (Arabic with vowel marks wants ~1.9 line height)
  let size = Math.floor(innerH / 1.9), lines: string[] = [];
  for (; size > 10; size -= 2) {
    c.font = `${size}px ${ARABIC_FONTS}`;
    lines = wrapLines(units, innerW, s => c.measureText(s).width);
    if (lines.length * size * 1.9 <= innerH && (!opts.maxLines || lines.length <= opts.maxLines)) break;
  }
  const drawn = canDrawArabic(c, size);
  if (drawn) {
    c.fillStyle = '#e8cf7a';
    const lh = size * 1.9, y0 = H / 2 - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, i) => c.fillText(l, W / 2, y0 + i * lh));
  }
  const texture = new THREE.CanvasTexture(cv); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return { texture, lines: lines.length, drawn };
}

/**
 * Whether the canvas can draw Arabic letters: a joined word is narrower than its letters drawn apart only when the
 * font shapes Arabic (without one, every letter becomes the same box).
 */
function canDrawArabic(c: CanvasRenderingContext2D, size: number): boolean {
  c.font = `${size}px ${ARABIC_FONTS}`;
  const joined = c.measureText('بسم').width, apart = c.measureText('ب س م').width - 2 * c.measureText(' ').width;
  return joined > 0 && joined < apart * 0.98;
}
