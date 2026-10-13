import type * as THREE from 'three';
import type { Humanoid } from '../actors/humanoid';

/**
 * The look a salon gives: a haircut and the beard, kept in the save (counters `coiffure` and `barbe`) and applied to the
 * player's body in every hub. 0 = as the profile chose. Pure data + one function that toggles the body's hair meshes.
 */
export const HAIR = { profil: 0, courte: 1, rase: 2, afro: 3 } as const;
export const BEARD = { profil: 0, taillee: 1, rasee: 2 } as const;

export interface SalonService { id: string; label: string; detail: string; price: number; seconds: number; hair?: number; beard?: number }
export const SALON_SERVICES: readonly SalonService[] = [
  { id: 'coupe', label: 'Coupe courte', detail: 'Dégradé net sur les côtés', price: 1500, seconds: 8, hair: HAIR.courte },
  { id: 'afro', label: 'Coiffure afro', detail: 'Volume et forme, au peigne', price: 2500, seconds: 10, hair: HAIR.afro },
  { id: 'rase', label: 'Crâne rasé', detail: 'À la tondeuse, propre', price: 1000, seconds: 6, hair: HAIR.rase },
  { id: 'barbe', label: 'Barbe taillée', detail: 'Contours à la lame', price: 800, seconds: 5, beard: BEARD.taillee },
  { id: 'rasage', label: 'Rasage', detail: 'Joues lisses', price: 700, seconds: 5, beard: BEARD.rasee },
];

/** Which hair meshes show for a haircut (null: keep the profile's). */
export function hairParts(hair: number): { short: boolean; puff: boolean } | null {
  return hair === HAIR.courte ? { short: true, puff: false } : hair === HAIR.rase ? { short: false, puff: false } : hair === HAIR.afro ? { short: false, puff: true } : null;
}

const meshes = new WeakMap<Humanoid, Record<string, THREE.Object3D[]>>();
function parts(body: Humanoid) {
  let m = meshes.get(body);
  if (!m) {
    m = { Hair_Short: [], Hair_Puff: [], Beard: [], Cloth_Kufi: [], Cloth_Headwrap: [] };
    body.group.traverse(o => { for (const k of Object.keys(m!)) if ((o as THREE.Mesh).isMesh && o.name.startsWith(k)) m![k].push(o); });
    meshes.set(body, m);
  }
  return m;
}

/** Apply the saved haircut and beard to the body (a hat keeps covering the hair). Returns true when something changed. */
export function applyStyle(body: Humanoid, counters: Record<string, number>): boolean {
  const p = parts(body), hair = hairParts(counters.coiffure ?? 0), beard = counters.barbe ?? 0;
  let changed = false;
  const set = (list: THREE.Object3D[], on: boolean) => { for (const o of list) if (o.visible !== on) { o.visible = on; changed = true; } };
  const hat = [...p.Cloth_Kufi, ...p.Cloth_Headwrap].some(o => o.visible);
  if (hair && !hat) { set(p.Hair_Short, hair.short); set(p.Hair_Puff, hair.puff); }
  if (beard) set(p.Beard, beard === BEARD.taillee);
  return changed;
}
