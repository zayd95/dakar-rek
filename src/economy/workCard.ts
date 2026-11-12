import type { Credit } from './streak';
import { runLabel } from './streak';

/**
 * The card after a piece of work is done (pure, unit-tested; shown by src/economy/streakModule.ts through the HUD's moment card, tap to dismiss, clear of
 * the controls): what was done, from where to where, what it paid (paid once, before the card: the card only says it), how long it really took and how
 * far it really went, where the run of days stands, and ONE line about how it went, read from what happened (late or not, bumps on the way). No stars.
 */
export interface WorkDone {
  kind: 'tiak' | 'vtc' | 'tour';
  /** « Livraison Tiak Tiak », « Course VTC ». */
  title: string;
  /** Where it started and ended (place names). */
  from?: string; to: string;
  paid: number;
  /** Played time and distance travelled since the job was taken (0 when unknown, e.g. after a reload). */
  ms: number; metres: number;
  /** Past the time it should have taken; contacts with the vehicle on the way. */
  late: boolean; bumps: number;
}

const fmt = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} F`;
export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60), r = s % 60;
  return m ? `${m} min${r ? ` ${String(r).padStart(2, '0')} s` : ''}` : `${r} s`;
}
export function distance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km` : `${Math.round(m / 10) * 10} m`;
}
/** The one line about how it went, from what happened. */
export function feedbackLine(w: WorkDone): string {
  if (w.late) return w.kind === 'vtc' ? 'Un peu en retard : le client l’a remarqué.' : 'Un peu en retard : le client a payé moins.';
  if (w.bumps === 0 && w.metres > 150) return w.kind === 'vtc' ? 'Trajet sans accroc : le client était à l’aise.' : 'Livré à l’heure, sans accroc.';
  return w.kind === 'vtc' ? 'À l’heure.' : 'Livré à l’heure.';
}
/** The run of days, as the card says it. */
export function streakNote(c: Credit | null, run: number): { v: string; note?: string } {
  if (!c) return { v: runLabel(run) };
  if (c.counted) return { v: runLabel(c.run), note: c.graceUsed ? 'Jour actif compté (un jour manqué pardonné)' : c.fresh && c.run === 1 ? 'Premier jour actif' : 'Jour actif compté' };
  return { v: runLabel(run), note: c.why === 'already' ? 'Aujourd’hui est déjà compté' : 'Compté pour aujourd’hui un peu plus tard' };
}
export interface Card { icon: string; title: string; sub: string; rows: { k: string; v: string; d?: string; tone?: string; note?: string }[]; next: string[] }
export function workCard(w: WorkDone, c: Credit | null, run: number, extra: Card['rows'] = []): Card {
  const st = streakNote(c, run), rows: Card['rows'] = [{ k: 'Payé', v: fmt(w.paid), d: `+${fmt(w.paid)}`, tone: 'up' }, ...extra];
  if (w.ms > 0) rows.push({ k: 'Durée', v: duration(w.ms) });
  if (w.metres > 0) rows.push({ k: 'Distance', v: distance(w.metres) });
  rows.push({ k: 'Série', v: st.v, ...(st.note ? { note: st.note } : {}) });
  return { icon: w.kind === 'vtc' ? '🚗' : '🛵', title: w.title, sub: w.from ? `${w.from} → ${w.to}` : w.to, rows, next: [feedbackLine(w)] };
}
