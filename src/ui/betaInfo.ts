import { BUILD_ID } from '../core/build';

/**
 * « Signaler un problème » in Réglages (docs/beta/FEEDBACK_TEMPLATE.md): the lines a tester pastes at the top of a report, so every report names its build,
 * its screen and where it happened. Nothing is sent anywhere: the tester copies it into their own message.
 */
export interface BetaWhere { hub: string | null; x: number; z: number; quality: string; playedMin: number; online?: string }
export function reportHeader(w: BetaWhere, now = new Date()): string {
  const v = typeof window !== 'undefined' ? window : null;
  const screen = v ? `${v.innerWidth}×${v.innerHeight} @${v.devicePixelRatio || 1}x ${v.innerWidth > v.innerHeight ? 'paysage' : 'portrait'}` : '?';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent.replace(/\s+/g, ' ').slice(0, 160) : '?';
  return [
    `Dakar Rek bêta · build ${BUILD_ID}`,
    `Date : ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    `Écran : ${screen} · qualité ${w.quality}`,
    `Appareil : ${ua}`,
    `Lieu : ${w.hub ?? 'chargement'} (${Math.round(w.x)}, ${Math.round(w.z)}) · ${w.playedMin} min de jeu${w.online ? ` · ${w.online}` : ''}`,
  ].join('\n');
}
export const betaFooter = () => `Dakar Rek · bêta · build ${BUILD_ID}`;
/** The report to fill in: the header above, then three questions (the same as docs/beta/FEEDBACK_TEMPLATE.md). */
export const reportText = (w: BetaWhere) => `${reportHeader(w)}\n\nCe que je faisais :\nCe qui s’est passé :\nCe que j’attendais :\n(une capture d’écran ou une vidéo aide beaucoup)`;
