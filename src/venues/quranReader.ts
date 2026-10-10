import './quranReader.css';
import type { GameCtx } from '../game/modules';
import { ARABIC_FONTS, QURAN_CREDIT, QURAN_SOURCE, arabicDigits, passage, type PassageId } from './quran';

const esc = (t: string) => t.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));

/**
 * The mushaf on its stand in the prayer hall: the passage in Arabic, verse by verse (each verse exactly as stored, its
 * number in a separate ring), the French reference, and the source with its link. Read only: it changes nothing in
 * the save (no need, money, counter or category). Closes like any sheet (Fermer, Échap, tapping outside).
 */
export function openQuranReader(ctx: GameCtx, id: PassageId = 'fatiha') {
  const p = passage(id);
  const verses = p.verses.map(v => `<span class="aya" data-aya="${v.sura}:${v.aya}">${esc(v.text)}</span><span class="aya-n" aria-label="verset ${v.aya}">${arabicDigits(v.aya)}</span>`).join(' ');
  const html = `<div class="mushaf"><div class="mushaf-text" dir="rtl" lang="ar" style="font-family:${ARABIC_FONTS.replace(/"/g, '')}">${verses}</div>`
    + `<div class="mushaf-ref">${esc(p.label)}</div>`
    + `<div class="mushaf-credit">${esc(QURAN_CREDIT.replace(' — tanzil.net', ''))} — <a href="${QURAN_SOURCE.url}" target="_blank" rel="noopener">tanzil.net</a></div></div>`;
  ctx.menu('Le Coran', 'Sur son support, près de l’étagère', [], html);
}
