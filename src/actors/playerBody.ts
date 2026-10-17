import type { Avatar } from '../core/types';
import { preloadBody, type BodyId } from './humanoid';

/**
 * The player's body: the identity chosen on New Game (SaveData.avatar) is a Meshy body on the shared rig (scripts/meshy/
 * transplant-to-v4-rig.mjs, docs/meshy/PROOF_REPORT.md). A save without one (null) keeps the shipped v4 body, and so does
 * a body that cannot be loaded: the game never waits on, or breaks over, these files.
 */
const BODY: Record<Avatar, Exclude<BodyId, 'v4'>> = { homme: 'meshy_m', femme: 'meshy_f' };
const FILE: Record<Avatar, { high: string; low: string }> = {
  homme: { high: 'body_m.glb', low: 'body_m_low.glb' },       // low: 6.2k triangles, 512 px (the phone preset)
  femme: { high: 'body_f.glb', low: 'body_f_low.glb' },       // low: same mesh, 512 px texture
};

export const bodyOf = (a: Avatar | null | undefined): BodyId => (a ? BODY[a] : 'v4');
export const bodyUrl = (a: Avatar, low: boolean, base = import.meta.env.BASE_URL) => `${base}assets/meshy/${low ? FILE[a].low : FILE[a].high}`;
/** The identity's picture on the New Game screen. */
export const previewUrl = (a: Avatar, base = import.meta.env.BASE_URL) => `${base}assets/meshy/preview_${a === 'homme' ? 'm' : 'f'}.jpg`;

/** Loads the body of an identity (the light files on the low preset). Resolves to the body to draw: v4 when there is none or it fails. */
export async function loadPlayerBody(a: Avatar | null, low: boolean, base?: string): Promise<BodyId> {
  if (!a) return 'v4';
  return (await preloadBody(BODY[a], bodyUrl(a, low, base))) ? BODY[a] : 'v4';
}
