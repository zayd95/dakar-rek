/**
 * A wrestler's small portrait for the phone: a styled silhouette drawn from his look (src/career/roster.ts rosterLook —
 * the same ngemb colour, pattern, skin and placeholder accessories the arena dresses him in). One inline SVG string,
 * no canvas and no 3D; pure (unit-tested).
 */
import { ACCESSORIES, NGEMB_COLORS } from '../lamb/look';
import type { WrestlerLook } from '../core/types';

const hex = (n: number) => '#' + (n & 0xffffff).toString(16).padStart(6, '0');
const shade = (n: number, k: number) => {
  const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
  return hex((Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b));
};

/** The portrait (an SVG string, 64 × 64 view box, sized by CSS). `id` keeps its pattern ids unique in a page. */
export function portraitSvg(id: string, skin: number, look: WrestlerLook, label = ''): string {
  const base = NGEMB_COLORS.find(c => c.id === look.ngembColor)?.hex ?? 0xf2efe6;
  const light = (base & 0xffffff) > 0x888888, accent = light ? '#2a2a2e' : '#f2efe6';
  const pid = `ng-${id.replace(/[^a-z0-9_-]/gi, '')}`;
  const pattern = look.ngembPattern === 'rayures' ? `<pattern id="${pid}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${hex(base)}"/><rect width="2.5" height="8" fill="${accent}"/></pattern>`
    : look.ngembPattern === 'damier' ? `<pattern id="${pid}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${hex(base)}"/><rect width="4" height="4" fill="${accent}"/><rect x="4" y="4" width="4" height="4" fill="${accent}"/></pattern>`
    : '';
  const fill = pattern ? `url(#${pid})` : hex(base);
  const acc = (s: string) => ACCESSORIES.find(a => a.id === s);
  const band = (s: string) => {
    const a = acc(s); if (!a) return '';
    const c = hex(a.color);
    if (a.socket === 'armR') return `<rect x="47" y="40" width="7" height="3" rx="1" fill="${c}"/>`;
    if (a.socket === 'armL') return `<rect x="10" y="40" width="7" height="3" rx="1" fill="${c}"/>`;
    if (a.socket === 'waist') return `<rect x="20" y="51" width="24" height="2.5" fill="${c}"/>`;
    return `<path d="M26 31q6 5 12 0" stroke="${c}" stroke-width="2" fill="none"/>`;
  };
  return `<svg viewBox="0 0 64 64" role="img" aria-label="${label.replace(/"/g, '')}"><defs>${pattern}</defs>`
    + `<rect width="64" height="64" rx="14" fill="${shade(base, 0.35)}" opacity=".18"/>`
    + `<path d="M12 64V46c0-9 6-15 14-16h12c8 1 14 7 14 16v18z" fill="${hex(skin)}"/>`                    // shoulders and arms
    + `<path d="M9 50c0-5 2-8 4-9l4 1v14H9zM55 50c0-5-2-8-4-9l-4 1v14h8z" fill="${shade(skin, 0.85)}"/>`
    + `<rect x="27" y="24" width="10" height="8" fill="${shade(skin, 0.9)}"/>`                                 // neck
    + `<ellipse cx="32" cy="17" rx="9.5" ry="11" fill="${hex(skin)}"/>`                                        // head
    + `<path d="M22.6 14c1-7 5-10 9.4-10s8.4 3 9.4 10c-2-3-5.5-4.5-9.4-4.5s-7.4 1.5-9.4 4.5z" fill="#1c1410"/>`   // close-cropped hair
    + `<path d="M18 52h28v12H18z" fill="${fill}"/>`                                                            // the ngemb
    + (look.ngembPattern === 'bordure' ? `<rect x="18" y="52" width="28" height="2.5" fill="${accent}"/>` : '')
    + look.accessories.map(band).join('')
    + `</svg>`;
}
