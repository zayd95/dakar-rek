import * as THREE from 'three';
import type { Canopy, Collider, HubWorld, KeepClear } from '../types';
import type { Seat } from '../../interact/seats';
import { E, LIFE_CAP, siteDraw, sizeOf, type DistrictKit, type Rect, type Site, type SiteDraw, type SiteKind, type SiteLife, type SiteSize, type Variant } from './contract';
import { VARIANTS as HOTELS } from './hotels';
import { VARIANTS as HOUSES } from './houses';
import { VARIANTS as RESIDENCES } from './residences';
import { VARIANTS as VILLAS } from './villas';
import { SITES } from './plan';
import { massing } from './massing';
import { gateX, openingsOf } from './parts';

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
  /** The seats and the people the sites put on their ground floors, in the hub (`SiteResult.life`). */
  seats: Seat[]; people: HubWorld['people'];
  /** The sites' walk-in openings in the hub (the street's own dressing keeps off them). */
  openings: Rect[];
  /** The rooftop restaurant's sign, in the hub: each panel's centre, size and the horizontal normal it faces (`SiteResult.rooftopSign`). */
  rooftopSign?: NonNullable<HubWorld['rooftopSign']>;
  /** The stair door of the rooftop restaurant, in the hub (the spot in front of the face, the face's outward normal), when a design gave one (`SiteResult.rooftopDoor`). */
  rooftopDoor?: { x: number; z: number; nx: number; nz: number };
}
/** Draws every site; `only` limits the plan (the lanes' viewers and tests draw one site at a time). */
export function buildDistrict(kit: DistrictKit, only?: (s: Site) => boolean): District {
  const group = new THREE.Group(); group.name = 'almadies-district';
  const out: District = { group, colliders: [], canopies: [], keepClear: [], sites: [], seats: [], people: [], openings: [] };
  for (const site of SITES) {
    if (only && !only(site)) continue;
    const d = siteDraw(kit, site), v = variantOf(site), r = v.build(d) ?? {};
    out.colliders.push(...d.colliders); out.canopies.push(...d.canopies);
    // the street keeps the apron before the gate open (parked cars, stalls) and, with the site, its own lot
    const gx = gateX(d.w, site.gate);
    out.keepClear.push({ ...d.f.rect(gx - 3.2, E, gx + 3.2, E + 3.2), why: `district_gate:${site.id}` }, ...(r.keepClear ?? []));
    out.openings.push(...openingsOf(site).map(o => d.f.rect(o.x0, o.z0, o.x1, o.z1)));
    if (r.group) group.add(r.group);
    if (r.rooftopDoor && !out.rooftopDoor) {
      const o = d.f.p(0, 0), q = d.f.p(r.rooftopDoor.x, r.rooftopDoor.z), n = d.f.p(0, 1);
      out.rooftopDoor = { x: q.x, z: q.z, nx: Math.round(n.x - o.x), nz: Math.round(n.z - o.z) };
    }
    if (r.rooftopSign && !out.rooftopSign) out.rooftopSign = { panels: r.rooftopSign.panels.map(p => { const q = d.f.p(p.x, p.z), a = planYaw(d, p.yaw); return { x: q.x, y: p.y, z: q.z, w: p.w, h: p.h, nx: Math.round(Math.sin(a) * 1e9) / 1e9, nz: Math.round(Math.cos(a) * 1e9) / 1e9, kind: p.kind }; }) };
    if (r.life) { const l = lifeInHub(d, r.life); out.seats.push(...l.seats); out.people.push(...l.people); }
    out.sites.push({ id: site.id, kind: site.kind, variant: v.id, colliders: d.colliders.length });
  }
  return out;
}

/**
 * A site's life in the hub: the plan's points through the site's frame, the facing turned the same way (a plan yaw `a` looks along (sin a, cos a) in the plan), the seats named
 * by site (`<site id>:seat:<n>`, stable between sessions) on the street's space, over the site's cap (`LIFE_CAP`: the rest is dropped).
 */
/** A plan yaw `a` (looking along (sin a, cos a) in the plan) as the hub's yaw, through the site's frame. */
export function planYaw(d: SiteDraw, a: number): number { const o = d.f.p(0, 0), q = d.f.p(Math.sin(a), Math.cos(a)); return Math.atan2(q.x - o.x, q.z - o.z); }
export function lifeInHub(d: SiteDraw, life: SiteLife): { seats: Seat[]; people: HubWorld['people'] } {
  const at = (x: number, z: number) => d.f.p(x, z), yaw = (a: number) => planYaw(d, a), cap = LIFE_CAP[d.site.kind];
  const seats = (life.seats ?? []).slice(0, cap.seats).map((s, i): Seat => {
    const q = at(s.x, s.z), t = s.table ? at(s.table.x, s.table.z) : null;
    return { id: `${d.site.id}:seat:${i}`, x: q.x, z: q.z, top: s.top, yaw: yaw(s.yaw), kind: s.kind, space: 'street', occupant: null, ...(t ? { table: { x: t.x, y: s.table!.y, z: t.z } } : {}) };
  });
  const people = (life.people ?? []).slice(0, cap.people).map(p => { const q = at(p.x, p.z); return { x: q.x, z: q.z, yaw: yaw(p.yaw), clip: p.clip, ...(p.y !== undefined ? { y: p.y } : {}), ...(p.look ? { look: p.look } : {}) }; });
  return { seats, people };
}
