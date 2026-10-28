import * as THREE from 'three';
import type { Canopy, Collider, KeepClear } from '../types';
import { E, siteDraw, sizeOf, type DistrictKit, type Site, type SiteKind, type SiteSize, type Variant } from './contract';
import { VARIANTS as HOTELS } from './hotels';
import { VARIANTS as HOUSES } from './houses';
import { VARIANTS as RESIDENCES } from './residences';
import { VARIANTS as VILLAS } from './villas';
import { SITES } from './plan';
import { massing } from './massing';
import { gateX } from './parts';

/**
 * LD2.0-E « The Almadies district » (docs/ld2/LD2_E.md): draws the plan's sites (src/world/almadies/plan.ts) into the hub's merged batches, after the
 * street is dressed (src/world/builder.ts; every random number of the street is drawn by then, and the district draws none of the builder's).
 */
export const REGISTRY: Record<SiteKind, Variant[]> = { house: HOUSES, villa: VILLAS, hotel: HOTELS, residence: RESIDENCES };
/** The designs of a kind that fit a size of site, in their lane's order. */
export const variantsFor = (kind: SiteKind, size: SiteSize): Variant[] => REGISTRY[kind].filter(v => v.size === size);
/** The design a site wears: its `variant`, wrapped over the designs of its kind and size (a missing design falls back to the plain massing). */
export function variantOf(site: Site): Variant {
  const list = variantsFor(site.kind, sizeOf(site));
  return list.length ? list[site.variant % list.length] : { id: 'massing', name: 'massing', size: sizeOf(site), build: massing };
}

export interface District {
  group: THREE.Group;
  colliders: Collider[]; canopies: Canopy[]; keepClear: KeepClear[];
  /** Per site: what was drawn (for the checks and the catalogue). */
  sites: { id: string; kind: SiteKind; variant: string; colliders: number }[];
}
/** Draws every site; `only` limits the plan (the lanes' viewers and tests draw one site at a time). */
export function buildDistrict(kit: DistrictKit, only?: (s: Site) => boolean): District {
  const group = new THREE.Group(); group.name = 'almadies-district';
  const out: District = { group, colliders: [], canopies: [], keepClear: [], sites: [] };
  for (const site of SITES) {
    if (only && !only(site)) continue;
    const d = siteDraw(kit, site), v = variantOf(site), r = v.build(d) ?? {};
    out.colliders.push(...d.colliders); out.canopies.push(...d.canopies);
    // the street keeps the apron before the gate open (parked cars, stalls) and, with the site, its own lot
    const gx = gateX(d.w, site.gate);
    out.keepClear.push({ ...d.f.rect(gx - 3.2, E, gx + 3.2, E + 3.2), why: `district_gate:${site.id}` }, ...(r.keepClear ?? []));
    if (r.group) group.add(r.group);
    out.sites.push({ id: site.id, kind: site.kind, variant: v.id, colliders: d.colliders.length });
  }
  return out;
}
