import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { HubWorld } from '../world/types';
import type { PlaceSpec } from '../activity/places';
import type { ActivitySpec } from '../activity/types';
import * as P from '../activity/primitives';
import { Humanoid, humanoidReady, type PersonLook } from '../actors/humanoid';
import { tasteLine, waitLine } from '../i18n/lines';
import { GRID, LINES, roadCentre, stopOnLeg } from '../transport/lines';
import { rng } from '../core/rng';
import { curve } from './rules';
import { weatherNow } from './weather';

/**
 * Street vendors (spec §27): at the crossroads and by the car rapide stops, at the hours people pass by — Touba coffee
 * at dawn and in the evening, cold water and bissap in the heat, roasted peanuts in the afternoon, phone credit all day.
 * Each one is a place of the shared registry (« Acheter » / « Commander »: the price shown, paid once, quick), with a
 * seller and a tray or a cart. More of them at the busy hours, fewer under the rain. Prices are the game's own.
 */
export interface VendorKind {
  key: string; name: string; seller: string; look: PersonLook;
  /** Hours (city clock) the vendor works, as [from, to] spans. */
  hours: readonly (readonly [number, number])[];
  offers: () => ActivitySpec[];
  prop: 'tray' | 'cart' | 'box';
}
export const VENDOR_KINDS: readonly VendorKind[] = [
  { key: 'touba', name: 'Café Touba', seller: 'Cheikh', prop: 'cart', hours: [[6, 11], [16.5, 23]],
    look: { skin: 0x4e2e1c, style: 'boubou', top: 0x2d5a3a, pattern: 'uni', hat: 'kufi', hatColor: 0xf2f2ec, shoes: 0x3a2a1e },
    offers: () => [P.order({ id: 'touba', label: 'Café Touba', detail: 'Épicé au djar, servi chaud dans un gobelet', price: 100, prep: 1, eat: 2, drink: true, seat: false, needs: { energie: 8, moral: 2 }, line: waitLine('Cheikh') })] },
  { key: 'eau', name: 'Eau fraîche et bissap', seller: 'Awa', prop: 'tray', hours: [[9.5, 20]],
    look: { skin: 0x6b3f25, female: true, style: 'dress', top: 0xd66532, pattern: 'wax', accent: 0xeee1b0, hat: 'headwrap', hatColor: 0xe8b734 },
    offers: () => [
      P.order({ id: 'sachet', label: 'Sachet d’eau fraîche', price: 50, prep: 0.5, eat: 1.5, drink: true, seat: false, needs: { moral: 1, faim: 1 } }),
      P.order({ id: 'bissap', label: 'Bissap glacé', detail: 'Un sachet bien froid', price: 150, prep: 0.8, eat: 2, drink: true, seat: false, needs: { moral: 4, faim: 2 }, line: waitLine('Awa') }),
    ] },
  { key: 'arachides', name: 'Arachides grillées', seller: 'Fatou', prop: 'tray', hours: [[14, 22.5]],
    look: { skin: 0x5b3420, female: true, style: 'dress', top: 0x7a3d8c, pattern: 'wax', accent: 0xf2d27a, hat: 'headwrap', hatColor: 0x7a3d8c },
    offers: () => [P.order({ id: 'arachides', label: 'Cornet d’arachides', detail: 'Grillées ce matin, encore tièdes', price: 100, prep: 0.6, eat: 3, seat: false, needs: { faim: 8, moral: 2 }, eatLine: tasteLine })] },
  { key: 'credit', name: 'Recharges de crédit', seller: 'Ibrahima', prop: 'box', hours: [[8, 22]],
    look: { skin: 0x3b2216, style: 'tee', top: 0xf2c200, bottom: 0x2b2f3a, accent: 0xffffff, shoes: 0xf2f2ec },
    offers: () => [
      P.buy({ id: 'credit500', label: 'Crédit de téléphone · 500 F', detail: 'Pour appeler et envoyer des messages', price: 500, items: { credit: 500 } }),
      P.buy({ id: 'credit1000', label: 'Crédit de téléphone · 1 000 F', price: 1000, items: { credit: 1000 } }),
    ] },
];

/** How many of the hub's vendor spots are busy at this hour (0–1): mornings and the evening rush, a few at night. */
const BUSY: readonly (readonly [number, number])[] = [[0, 0.1], [5.5, 0.1], [7, 0.8], [9, 0.6], [12, 0.75], [16, 0.7], [18, 1], [21, 0.8], [23, 0.35], [24, 0.1]];
export const vendorShare = (hour: number, rain: number) => curve(BUSY, hour) * (1 - 0.7 * rain);
export const vendorWorks = (k: VendorKind, hour: number) => { const h = ((hour % 24) + 24) % 24; return k.hours.some(([a, b]) => h >= a && h < b); };

export interface VendorSpot { x: number; z: number; yaw: number; kind: VendorKind; where: string }

/**
 * Where vendors stand in a hub: on the pavement corners of crossroads and beside the car rapide stops, away from walls,
 * places and the spawn; the same spots on every client (the hub id seeds the choice).
 */
export function vendorSpots(hub: HubWorld, count: number): VendorSpot[] {
  const R = rng(1234 + hub.id.length * 97 + hub.id.charCodeAt(0));
  const cand: { x: number; z: number; yaw: number; where: string }[] = [];
  for (let a = 1; a < GRID.nb; a++) for (let b = 1; b < GRID.nb; b++) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = roadCentre(a) + sx * 6.3, z = roadCentre(b) + sz * 6.3;
    cand.push({ x, z, yaw: Math.atan2(-sx, -sz), where: 'carrefour' });             // facing the crossroads
  }
  for (const l of LINES.filter(l => l.hub === hub.id)) for (const s of l.stops) {
    const c = stopOnLeg(l, s), rx = -c.dz, rz = c.dx;                               // the stop's pavement is on the right
    cand.push({ x: c.x + rx * 6.0 - c.dx * 4.5, z: c.z + rz * 6.0 - c.dz * 4.5, yaw: Math.atan2(-rx, -rz), where: `arrêt ${s.name}` });
  }
  const clear = (x: number, z: number) =>
    !hub.colliders.some(c => x > c.x0 - 0.8 && x < c.x1 + 0.8 && z > c.z0 - 0.8 && z < c.z1 + 0.8) &&
    !hub.interactables.some(i => Math.hypot(i.x - x, i.z - z) < 4) && Math.hypot(hub.spawn.x - x, hub.spawn.z - z) > 10 &&
    x > hub.bounds.x0 + 3 && x < hub.bounds.x1 - 3 && z > hub.bounds.z0 + 3 && z < hub.bounds.z1 - 3;
  const ok = cand.filter(c => clear(c.x, c.z));
  for (let i = ok.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [ok[i], ok[j]] = [ok[j], ok[i]]; }
  const picked: VendorSpot[] = [];
  for (const c of ok) {
    if (picked.length >= count) break;
    if (picked.some(p => Math.hypot(p.x - c.x, p.z - c.z) < 25)) continue;      // spread out over the hub
    picked.push({ ...c, kind: VENDOR_KINDS[picked.length % VENDOR_KINDS.length] });
  }
  return picked;
}

interface Vendor { spot: VendorSpot; h: Humanoid | null; prop: THREE.Object3D; on: boolean; place: PlaceSpec }
const COUNT = { low: 4, medium: 6, high: 8 } as const;
const FAR = 45;

class Vendors {
  readonly group = new THREE.Group();
  readonly list: Vendor[] = [];
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  constructor(private ctx: GameCtx, hub: HubWorld) {
    this.group.name = 'street_vendors';
    const spots = vendorSpots(hub, COUNT[ctx.quality()]);
    spots.forEach((s, i) => {
      const h = humanoidReady() ? new Humanoid(s.kind.look) : null;
      if (h) { h.group.position.set(s.x, 0.1, s.z); h.group.rotation.y = s.yaw; h.hold = i % 2 ? 'Talk' : 'Idle'; h.group.visible = false; this.group.add(h.group); }
      const prop = this.propOf(s);
      prop.visible = false; this.group.add(prop);
      const place: PlaceSpec = {
        id: `${hub.id}:vendor:${i}`, type: 'stall', name: `${s.kind.name} · ${s.kind.seller}`, space: 'street', chat: true,
        anchors: [{ id: 'stall', name: `${s.kind.name} · ${s.kind.seller}`, kind: 'shop', x: s.x + Math.sin(s.yaw) * 0.9, z: s.z + Math.cos(s.yaw) * 0.9, y: 2.0, radius: 1.8 }],
        offers: { stall: s.kind.offers() },
      };
      this.list.push({ spot: s, h, prop, on: false, place });
    });
  }

  private propOf(s: VendorSpot): THREE.Object3D {
    const g = new THREE.Group(), f = { x: Math.sin(s.yaw), z: Math.cos(s.yaw) };
    const mat = (c: number) => { const m = new THREE.MeshLambertMaterial({ color: c }); this.mats.push(m); return m; };
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => { const geo = new THREE.BoxGeometry(w, h, d); this.geos.push(geo); const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
    if (s.kind.prop === 'cart') {                                                       // a little cart with the thermos
      box(0.9, 0.08, 0.55, f.x * 0.9, 0.78, f.z * 0.9, mat(0x6b4a2e)); box(0.06, 0.7, 0.06, f.x * 0.9 - 0.4, 0.43, f.z * 0.9, mat(0x2b2b2b));
      box(0.06, 0.7, 0.06, f.x * 0.9 + 0.4, 0.43, f.z * 0.9, mat(0x2b2b2b));
      const t = new THREE.CylinderGeometry(0.13, 0.13, 0.4, 10); this.geos.push(t); const th = new THREE.Mesh(t, mat(0xc0392b)); th.position.set(f.x * 0.9, 1.02, f.z * 0.9); g.add(th);
    } else if (s.kind.prop === 'tray') {                                               // a basin of sachets / peanuts on a stool
      box(0.4, 0.45, 0.4, f.x * 0.75, 0.33, f.z * 0.75, mat(0x2d6e9e));
      const b = new THREE.CylinderGeometry(0.34, 0.26, 0.16, 12); this.geos.push(b); const ba = new THREE.Mesh(b, mat(0xd8d2c4)); ba.position.set(f.x * 0.75, 0.64, f.z * 0.75); g.add(ba);
    } else {                                                                            // a small table and a parasol
      box(0.7, 0.06, 0.45, f.x * 0.8, 0.75, f.z * 0.8, mat(0xf2c200)); box(0.06, 0.72, 0.06, f.x * 0.8, 0.39, f.z * 0.8, mat(0x2b2b2b));
      const p = new THREE.ConeGeometry(0.9, 0.35, 8); this.geos.push(p); const pa = new THREE.Mesh(p, mat(0x1f7a3a)); pa.position.set(f.x * 0.4, 2.3, f.z * 0.4); g.add(pa);
      box(0.04, 1.9, 0.04, f.x * 0.4, 1.3, f.z * 0.4, mat(0x2b2b2b));
    }
    g.position.set(s.x, 0.08, s.z);
    return g;
  }

  update(dt: number, hour: number, cam: THREE.Vector3) {
    const share = vendorShare(hour, weatherNow.rain), n = Math.round(this.list.length * share);
    this.list.forEach((v, i) => {
      const want = i < n && vendorWorks(v.spot.kind, hour);
      if (want !== v.on && Math.hypot(v.spot.x - cam.x, v.spot.z - cam.z) > FAR) this.set(v, want);   // they arrive and leave out of sight
      if (v.on && v.h) v.h.animate(dt, 0);
    });
  }

  private set(v: Vendor, on: boolean) {
    v.on = on;
    if (v.h) v.h.group.visible = on;
    v.prop.visible = on;
    if (on) this.ctx.places.add(v.place); else this.ctx.places.remove(v.place.id);
  }

  dispose() {
    for (const v of this.list) { v.h?.dispose(); if (v.on) this.ctx.places.remove(v.place.id); }
    for (const g of this.geos) g.dispose(); for (const m of this.mats) m.dispose();
    this.group.removeFromParent();
  }
}

let vendors: Vendors | null = null;

export const streetVendorsModule: GameModule = {
  name: 'streetVendors',
  hubLoaded(ctx, hub) {
    vendors?.dispose();
    vendors = new Vendors(ctx, hub);
    ctx.extra.add(vendors.group);
  },
  update(ctx, dt) {
    if (!vendors || ctx.inside()) return;
    vendors.update(dt, ctx.hour(), ctx.camera.position);
  },
  debug: () => ({
    vendors: () => vendors?.list.map(v => ({ id: v.place.id, kind: v.spot.kind.key, name: v.place.name, where: v.spot.where, x: v.spot.x, z: v.spot.z, yaw: v.spot.yaw, on: v.on })) ?? [],
  }),
};
