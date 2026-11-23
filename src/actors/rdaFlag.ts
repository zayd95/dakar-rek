/**
 * The Roi des Arènes wrestler bodies (docs/wrestling/RDA-INTEGRATION.md): **the default** on the Medium and High qualities (the
 * owner's release of 23 Nov 2026, decision 1 (b)); Low keeps the v4 `Wrestler`, which is also the fallback while the file loads or if
 * it fails. Pure resolution, read once per page (like src/lamb/flag.ts).
 *
 * - by default (or `?rdabody`, or `localStorage['dakarrek.rdabody'] = '1'`): the RDA bodies on the medium and high qualities; low keeps v4.
 * - `?rdabody=force` (or the stored `'force'`): on every quality, low included (measurements only).
 * - `?rdabody=0` (or the stored `'0'`): off. The address wins over the stored choice.
 * - Accessory pieces (owner decision, off by default): `?rdaparts=arms,chest` (or `localStorage['dakarrek.rdaparts']`): `arms` the arm and
 *   waist sets (one switch: they replace the look's arm and waist placeholders), `chest` the chest X (its own switch).
 */
export type RdaMode = 'off' | 'on' | 'force';
/** The game's default: the RDA bodies on Medium and High. */
export const RDA_DEFAULT: RdaMode = 'on';
export type Build = 'athletic' | 'heavy';
export interface RdaPartsOn { armsWaist: boolean; chest: boolean }
export type RdaLevel = 'high' | 'medium';

export function resolveRdaBody(search: string, stored: string | null): RdaMode {
  const q = new URLSearchParams(search);
  const read = (v: string | null): RdaMode | null => v === null ? null : v === '0' || v === 'off' ? 'off' : v === 'force' ? 'force' : 'on';
  return read(q.has('rdabody') ? q.get('rdabody') : null) ?? read(stored) ?? RDA_DEFAULT;
}
export function resolveRdaParts(search: string, stored: string | null): RdaPartsOn {
  const q = new URLSearchParams(search), v = q.has('rdaparts') ? q.get('rdaparts') ?? '' : stored ?? '';
  const set = new Set(v.split(',').map(s => s.trim()));
  return { armsWaist: set.has('arms') || set.has('all'), chest: set.has('chest') || set.has('all') };
}

let mode: RdaMode | null = null, parts: RdaPartsOn | null = null;
function page(): { search: string; body: string | null; parts: string | null } {
  let search = '', body: string | null = null, p: string | null = null;
  try { search = location.search; } catch { /* no page (tests) */ }
  try { body = localStorage.getItem('dakarrek.rdabody'); p = localStorage.getItem('dakarrek.rdaparts'); } catch { /* storage blocked */ }
  return { search, body, parts: p };
}
export function rdaMode(): RdaMode { if (mode === null) { const p = page(); mode = resolveRdaBody(p.search, p.body); } return mode; }
export function rdaPartsDefault(): RdaPartsOn { if (parts === null) { const p = page(); parts = resolveRdaParts(p.search, p.parts); } return { ...parts }; }
/** Whether the RDA bodies are wanted at this quality (`low` keeps v4 unless forced). */
export const rdaWanted = (quality: string, m: RdaMode = rdaMode()) => m === 'force' || (m === 'on' && quality !== 'low');
/** The file for a quality: smaller textures (the same geometry) below high. */
export const rdaLevel = (quality: string): RdaLevel => (quality === 'high' ? 'high' : 'medium');
export const rdaUrl = (level: RdaLevel, base: string) => `${base}assets/wrestlers/${level === 'high' ? 'rda_wrestlers.glb' : 'rda_wrestlers_m.glb'}`;
/** Who wears which physique: the heavy one for the heavy style (« costaud »: Gora, Babacar, Daouda, Pathé…), the athletic one otherwise. */
export const buildOf = (style?: string | null): Build => (style === 'costaud' ? 'heavy' : 'athletic');
