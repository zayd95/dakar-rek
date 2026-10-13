import type { HubId } from '../core/types';

/**
 * Sites of a hub composed by a gameplay module (src/venues) instead of the hub builder. The builder keeps the place's
 * identity — its interactable id and name, used by deliveries, routines and the directory — leaves the ground free (no
 * building, no collider, no people) and records the site in `HubWorld.sites`; the module builds the venue there.
 * Random street dressing never depends on these sites, so the rest of the hub keeps exactly the same layout.
 */
export interface Site {
  /** `${kind}:${i}${j}`: the same suffix the builder gives the place's interactable id (`pikine:dibiterie:11`). */
  key: string;
  kind: 'dibiterie' | 'mosque';
  name: string;
  /** Ground rectangle left free. */
  x0: number; z0: number; x1: number; z1: number;
  /** Outward normal of the main street front, and of the second street when the site is on a corner. */
  front: { x: number; z: number };
  side?: { x: number; z: number };
  /** Id of the place's interactable in `world.interactables` (kept for jobs, routines and the directory). */
  interactable?: string;
}

/** Which sites the venues module composes in each hub. */
export const COMPOSED_SITES: Partial<Record<HubId, readonly string[]>> = {
  pikine: ['dibiterie:11'],
  plateau: ['dibiterie:12', 'mosque:11'],
};
export const isComposed = (hub: HubId, key: string) => !!COMPOSED_SITES[hub]?.includes(key);
