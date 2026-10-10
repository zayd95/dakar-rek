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

/** Small Quranic pause marks (ۖ ۗ ۘ ۙ ۚ ۛ ۜ): they belong with the word before them when lines wrap. */
const PAUSE = /^[\u06D6-\u06DC]+$/;

/** What a panel lays out: a word of the text (pause marks kept with it), or the medallion closing a verse. */
export type Unit = string | { aya: number };

/**
 * Words of the passage ready to wrap: pause marks stay with the previous word. `numbered` closes each verse with its
 * medallion (drawn, never inserted into the text), as written mushafs do.
 */
export function wrapUnits(p: Passage, numbered = false): Unit[] {
  const units: Unit[] = [];
  for (const v of p.verses) {
    for (const w of v.text.split(' ')) {
      const last = units[units.length - 1];
      if (PAUSE.test(w) && typeof last === 'string') units[units.length - 1] = last + ' ' + w;
      else units.push(w);
    }
    if (numbered) units.push({ aya: v.aya });
  }
  return units;
}

/** Greedy line breaking between units, `width` of each and `gap` between them. */
export function wrapLines<U>(units: U[], maxWidth: number, width: (u: U) => number, gap: number): U[][] {
  const lines: U[][] = [];
  let line: U[] = [], w = 0;
  for (const u of units) {
    const uw = width(u), next = line.length ? w + gap + uw : uw;
    if (line.length && next > maxWidth) { lines.push(line); line = [u]; w = uw; } else { line.push(u); w = next; }
  }
  if (line.length) lines.push(line);
  return lines;
}

export interface Calligraphy { texture: THREE.CanvasTexture; lines: number; drawn: boolean }

/**
 * A calligraphy panel: gold Naskh on deep green inside a gold frame, the passage centred right-to-left on as few lines
 * as fit. Size in metres (the canvas keeps the same proportions). `drawn` is false when the device has no font able to
 * draw Arabic (nothing is shown rather than broken glyphs: the panel stays a plain frame).
 */
export function calligraphy(p: Passage, wM: number, hM: number, opts: { px?: number; maxLines?: number; numbered?: boolean } = {}): Calligraphy {
  const W = opts.px ?? 1024, H = Math.round((W * hM) / wM);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#163f30'; c.fillRect(0, 0, W, H);
  const b = Math.max(6, Math.round(H * 0.045));
  c.strokeStyle = '#d4b24a'; c.lineWidth = b; c.strokeRect(b, b, W - 2 * b, H - 2 * b);
  c.lineWidth = Math.max(2, b / 3); c.strokeRect(b * 2.4, b * 2.4, W - 4.8 * b, H - 4.8 * b);
  const innerW = W - 9 * b, innerH = H - 8 * b;
  c.direction = 'rtl'; c.textBaseline = 'middle';
  const units = wrapUnits(p, opts.numbered);
  const mark = (size: number) => size * 1.05;
  const width = (size: number) => (u: Unit) => (typeof u === 'string' ? c.measureText(u).width : mark(size));
  // largest size whose wrapped lines fit the frame (Arabic with vowel marks wants ~1.9 line height)
  let size = Math.floor(innerH / 1.9), lines: Unit[][] = [], gap = 0;
  for (; size > 10; size -= 2) {
    c.font = `${size}px ${ARABIC_FONTS}`; gap = c.measureText(' ').width * 1.4;
    lines = wrapLines(units, innerW, width(size), gap);
    if (lines.length * size * 1.9 <= innerH && (!opts.maxLines || lines.length <= opts.maxLines)) break;
  }
  const drawn = canDrawArabic(c, size);
  if (drawn) {
    const lh = size * 1.9, y0 = H / 2 - ((lines.length - 1) * lh) / 2, w = width(size);
    lines.forEach((line, i) => {
      const y = y0 + i * lh;
      let x = W / 2 + (line.reduce((t, u) => t + w(u), 0) + gap * (line.length - 1)) / 2;   // right to left from the right edge
      for (const u of line) {
        const uw = w(u);
        if (typeof u === 'string') {
          c.font = `${size}px ${ARABIC_FONTS}`; c.fillStyle = '#f0d98a'; c.textAlign = 'right'; c.fillText(u, x, y);
        } else {                                                         // verse medallion: a gold ring with its number
          const cx = x - uw / 2, r = uw * 0.42;
          c.strokeStyle = '#d4b24a'; c.lineWidth = Math.max(2, size * 0.07);
          c.beginPath(); c.arc(cx, y, r, 0, Math.PI * 2); c.stroke();
          c.font = `${Math.round(size * 0.5)}px ${ARABIC_FONTS}`; c.fillStyle = '#f0d98a'; c.textAlign = 'center'; c.fillText(arabicDigits(u.aya), cx, y);
        }
        x -= uw + gap;
      }
    });
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
