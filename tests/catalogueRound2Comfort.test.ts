import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildFurniture, TIERS, type FurnitureId } from '../src/world/furnitureKit';
import { FUV } from '../src/world/furnitureAtlas';
import { FURNITURE_SPECS, furnitureSpec, homeSpec } from '../src/economy/catalog';
import { KIT_PIECES, installFurnitureKit } from '../src/economy/furnitureKitAdapter';
import { autoPlace, footprint, layoutOf, roomOf, whyNot, type Placed } from '../src/economy/placement';
import { F2_JAMM, reachable } from '../src/housing/plan';
import { guestMaySit } from '../src/online/visitRules';

/**
 * The catalogue's second round, lane K-C (docs/ld2/LD2_C.md « Catalogue, round 2 »): poufs, corner sofas, canopy beds and entrance consoles in three
 * grades, the wax sofa and the leather armchair brought in line with their names, and eight kit models already drawn now sold.
 */
const kit = (id: string) => buildFurniture(id as FurnitureId).spec;
const ids = (t: string) => TIERS.map(r => `${t}:${r}`);
/** Share of a model's triangles whose texture coordinates fall inside an atlas rect (how much of it wears that paint). */
function share(id: string, r: readonly number[]) {
  const mesh = buildFurniture(id as FurnitureId).group.children[0] as THREE.Mesh, uv = mesh.geometry.attributes.uv;
  let n = 0; const tris = uv.count / 3;
  for (let t = 0; t < tris; t++) {
    let all = true;
    for (let k = 0; k < 3; k++) { const u = uv.getX(t * 3 + k), v = uv.getY(t * 3 + k); if (u < r[0] - 1e-6 || u > r[2] + 1e-6 || v < r[1] - 1e-6 || v > r[3] + 1e-6) all = false; }
    if (all) n++;
  }
  return n / tris;
}

describe('round 2, comfort lane: the kit models', () => {
  it('one draw call each (two for the net and the voiles, see-through), under 1 500 triangles, Prestige the richest', () => {
    for (const t of ['pouf', 'cornerSofa', 'canopyBed', 'console']) {
      const [a, b, c] = ids(t).map(kit);
      for (const s of [a, b, c]) { expect(s.budget.tris, s.id).toBeLessThan(1500); expect(s.budget.drawCalls, s.id).toBe(s.id === 'canopyBed:basic' || s.id === 'canopyBed:premium' ? 2 : 1); }
      expect(c.budget.tris, t).toBeGreaterThan(a.budget.tris); expect(c.budget.tris, t).toBeGreaterThan(b.budget.tris);
    }
  });

  it('a pouf is one low seat on its top', () => {
    for (const s of ids('pouf').map(kit)) {
      expect(s.placement).toBe('free'); expect(s.seats).toHaveLength(1);
      expect(s.seats[0]).toMatchObject({ x: 0, z: 0, kind: 'stool' });
      expect(s.seats[0].top).toBeGreaterThan(0.38); expect(s.seats[0].top).toBeLessThan(0.5); expect(s.footprint.h - s.seats[0].top).toBeLessThan(0.02);
      expect(s.use).toMatchObject({ verb: 'sit', seat: 's0', clip: 'Sit' });
    }
  });

  it('a corner sofa is an L: places along the back run facing the room, one in the corner, along the return facing across; it fits the F2 séjour', () => {
    const counts = ids('cornerSofa').map(id => kit(id).seats.length);
    expect(counts).toEqual([4, 4, 5]);
    for (const s of ids('cornerSofa').map(kit)) {
      expect(s.placement).toBe('wall');
      const main = s.seats.filter(x => x.yaw === 0), corner = s.seats.filter(x => Math.abs(x.yaw - Math.PI / 4) < 1e-9), ret = s.seats.filter(x => Math.abs(x.yaw - Math.PI / 2) < 1e-9);
      expect(main.length, s.id).toBeGreaterThanOrEqual(2); expect(corner).toHaveLength(1); expect(ret.length, s.id).toBeGreaterThanOrEqual(1);
      for (const x of main) expect(x.z).toBeLessThan(0);                              // along the back (−z)
      for (const x of ret) { expect(x.x).toBeLessThan(0); expect(x.z).toBeGreaterThan(corner[0].z); }   // along the return (−x), past the corner
      for (const a of s.seats) for (const b of s.seats) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z), s.id).toBeGreaterThan(0.55);
      expect(new Set(s.seats.map(x => x.top)).size).toBe(1);                          // one seat height (the catalogue's places follow the first)
      expect(s.footprint.w).toBeLessThanOrEqual(3.0); expect(s.footprint.d).toBeLessThanOrEqual(2.1);   // the séjour is 6.3 m × 3.5 m
    }
  });

  it('a canopy bed is slept in, lying along it with the head on the pillows, under its canopy', () => {
    for (const s of ids('canopyBed').map(kit)) {
      expect(s.use).toMatchObject({ verb: 'sleep', clip: 'Lie', seat: 'bed' });
      expect(s.seats).toHaveLength(1); expect(s.seats[0]).toMatchObject({ kind: 'bed', clip: 'Lie', x: 0 });
      expect(s.seats[0].z - 0.85).toBeGreaterThan(-s.footprint.d / 2); expect(s.seats[0].z + 0.9).toBeLessThan(s.footprint.d / 2);
      expect(s.footprint.h).toBeGreaterThan(2.1); expect(s.footprint.h).toBeLessThan(2.6);                  // under the F2's 2.8 m ceiling
    }
    // the net and the voiles are see-through (the glass mesh); the wooden four-poster has none
    const glass = (id: string) => buildFurniture(id as FurnitureId).group.children.filter(m => ((m as THREE.Mesh).material as THREE.Material).transparent).length;
    expect(ids('canopyBed').map(glass)).toEqual([1, 0, 1]);
  });

  it('a console stands against the wall; the better ones hang their mirror above it, and one gets ready in front', () => {
    const [a, b, c] = ids('console').map(kit);
    for (const s of [a, b, c]) { expect(s.placement).toBe('wall'); expect(s.use.z).toBeGreaterThan(s.footprint.d / 2); expect(s.use.yaw).toBeCloseTo(Math.PI); }
    expect(a.use.label).toBe('Vider ses poches');
    for (const s of [b, c]) { expect(s.use.label).toBe('Se préparer'); expect(s.footprint.h).toBeGreaterThan(1.7); expect(share(s.id, FUV.mirror), s.id).toBeGreaterThan(0); }
  });

  it('« Canapé en tissu wax » wears wax prints (three places still); « Fauteuil en cuir » is tan buttoned leather', () => {
    const sofa = kit('sofa:better');
    expect(sofa.seats).toHaveLength(3);
    const wax = [FUV.waxA, FUV.waxB, FUV.wax0, FUV.wax1, FUV.wax2].reduce((t, r) => t + share('sofa:better', r), 0);
    expect(wax).toBeGreaterThan(0.6);
    expect(share('sofa:better', FUV.fabric)).toBe(0);
    const arm = kit('armchair:better');
    expect(share('armchair:better', FUV.leatherTuft)).toBeGreaterThan(0); expect(share('armchair:better', FUV.nailFront)).toBeGreaterThan(0);
    expect([arm.footprint.w, arm.footprint.d]).toEqual([furnitureSpec('fauteuil_cuir')!.w, furnitureSpec('fauteuil_cuir')!.d]);   // no squeeze in the catalogue
    expect(arm.seats).toHaveLength(1);
  });
});

describe('round 2, comfort lane: the catalogue', () => {
  installFurnitureKit();
  const TABLE: [string, string, FurnitureId, string, number][] = [
    ['pouf_cuir', 'basic', 'pouf:basic', 'Pouf en cuir', 12_000], ['pouf_wax', 'better', 'pouf:better', 'Pouf en wax', 35_000],
    ['pouf_velours', 'premium', 'pouf:premium', 'Pouf capitonné en velours', 180_000],
    ['banquette_angle', 'basic', 'cornerSofa:basic', 'Banquette d’angle', 45_000], ['canape_angle', 'better', 'cornerSofa:better', 'Canapé d’angle en tissu', 260_000],
    ['canape_angle_velours', 'premium', 'cornerSofa:premium', 'Grand canapé d’angle en velours', 1_400_000],
    ['lit_moustiquaire', 'basic', 'canopyBed:basic', 'Lit et sa moustiquaire', 30_000], ['lit_baldaquin_bois', 'better', 'canopyBed:better', 'Lit à baldaquin en bois', 240_000],
    ['lit_baldaquin', 'premium', 'canopyBed:premium', 'Lit à baldaquin et voilages', 1_600_000],
    ['console_simple', 'basic', 'console:basic', 'Console et vide-poche', 9_000], ['console_bois', 'better', 'console:better', 'Console en bois et miroir', 85_000],
    ['console_marbre', 'premium', 'console:premium', 'Console en marbre et miroir doré', 520_000],
    ['fauteuil_velours', 'premium', 'armchair:premium', 'Fauteuil de salon en velours', 420_000], ['chaise_sculptee', 'premium', 'woodenChair:premium', 'Chaise sculptée', 95_000],
    ['table_basse_sculptee', 'premium', 'lowTable:premium', 'Table basse sculptée', 260_000], ['armoire_miroir', 'premium', 'wardrobe:premium', 'Grande armoire à miroir', 680_000],
    ['attaya_gaz', 'better', 'attaya:better', 'Attaya au gaz et ses coussins', 45_000], ['attaya_service', 'premium', 'attaya:premium', 'Grand service à attaya', 220_000],
    ['tapis_priere_tisse', 'better', 'prayerMat:better', 'Tapis de prière tissé', 18_000], ['tapis_priere_velours', 'premium', 'prayerMat:premium', 'Tapis de prière en velours', 95_000],
  ];

  it('sells the doc\'s pieces: ids, names, grades, prices, their kit models, footprints and seats', () => {
    for (const [id, grade, kid, name, price] of TABLE) {
      const f = furnitureSpec(id)!, k = kit(kid);
      expect(f, id).toBeDefined();
      expect([f.grade, f.name, f.price, KIT_PIECES[id]], id).toEqual([grade, name, price, kid]);
      expect(f.what.length, id).toBeGreaterThan(10); expect(f.emoji.length, id).toBeGreaterThan(0);
      expect([f.w, f.d], id).toEqual([k.footprint.w, k.footprint.d]);
      expect((f.seats ?? []).length, id).toBe(k.seats.length);
      (f.seats ?? []).forEach((st, i) => {
        const ks = k.seats[i];
        expect(Math.hypot(st.x - ks.x, st.z - ks.z), id).toBeLessThan(0.02); expect(st.top, id).toBeCloseTo(ks.top + 0.1, 2);
        expect(Math.abs(st.yaw - ks.yaw), id).toBeLessThan(0.01); expect([st.kind, st.clip], id).toEqual([ks.kind, ks.clip]);
      });
    }
    expect(FURNITURE_SPECS.filter(f => TABLE.some(t => t[0] === f.id))).toHaveLength(TABLE.length);
  });

  it('beds sleep, sofas rest, consoles go to the entrée, prayer mats lie flat, the coffee table makes the ataya', () => {
    for (const id of ['lit_moustiquaire', 'lit_baldaquin_bois', 'lit_baldaquin']) { const f = furnitureSpec(id)!; expect(f.type).toBe('bed'); expect(f.sleep).toBeGreaterThanOrEqual(60); }
    expect(['lit_moustiquaire', 'lit_baldaquin_bois', 'lit_baldaquin'].map(id => furnitureSpec(id)!.sleep)).toEqual([65, 85, 100]);
    for (const id of ['banquette_angle', 'canape_angle', 'canape_angle_velours']) expect(furnitureSpec(id)!.use).toMatchObject({ id: 'detente', sit: true });
    for (const id of ['console_simple', 'console_bois', 'console_marbre']) { const f = furnitureSpec(id)!; expect(f.room).toBe('entree'); expect(f.type).toBe('shelf'); expect(f.use).toBeDefined(); }
    for (const id of ['tapis_priere_tisse', 'tapis_priere_velours']) { const f = furnitureSpec(id)!; expect(f.flat).toBe(true); expect(f.type).toBe('rug'); }
    expect(furnitureSpec('table_basse_sculptee')!.use).toMatchObject({ id: 'ataya', label: 'Préparer l’ataya' });
  });

  it('prayer brings no reward (src/activity/primitives.ts): the mats only unroll', () => {
    for (const id of ['tapis_priere_tisse', 'tapis_priere_velours']) {
      const u = furnitureSpec(id)!.use!;
      expect(Object.keys(u.needs)).toHaveLength(0); expect(u.counter).toBeUndefined(); expect(u.price ?? 0).toBe(0); expect(u.pay ?? 0).toBe(0);
    }
  });

  it('the attaya sets seat the circle on their floor cushions: cross-legged, the tea made on the front one, guests welcome there', () => {
    for (const id of ['attaya_gaz', 'attaya_service']) {
      const f = furnitureSpec(id)!;
      expect(f.seats).toHaveLength(3);
      for (const st of f.seats!) { expect(st).toMatchObject({ kind: 'floor', clip: 'SitFloor' }); expect(st.top).toBeLessThan(0.25); expect(guestMaySit(st.kind, st.clip, true)).toBe(true); }
      expect(f.use).toMatchObject({ id: 'ataya', sit: true, counter: 'ataya' });
      expect(f.seats![0].z).toBeGreaterThan(0); expect(f.seats![0].yaw).toBeCloseTo(Math.PI);               // the front cushion, facing the stove
    }
  });
});

describe('round 2, comfort lane: in the F2', () => {
  const F2 = layoutOf(homeSpec('appart_jamm')!);
  const spec = (id: string) => furnitureSpec(id)!;

  it('each piece finds a valid spot in its room: corner sofas in the séjour, canopy beds in the bedroom, consoles in the entrée', () => {
    const rooms: [string, string][] = [['banquette_angle', 'sejour'], ['canape_angle', 'sejour'], ['canape_angle_velours', 'sejour'], ['lit_moustiquaire', 'chambre'],
      ['lit_baldaquin_bois', 'chambre'], ['lit_baldaquin', 'chambre'], ['console_simple', 'entree'], ['console_bois', 'entree'], ['console_marbre', 'entree'],
      ['pouf_velours', 'sejour'], ['attaya_service', 'sejour'], ['fauteuil_velours', 'sejour'], ['armoire_miroir', 'chambre']];
    for (const [id, room] of rooms) {
      const a = autoPlace(F2, spec(id), [])!;
      expect(a, id).not.toBeNull(); expect(roomOf(F2, a)?.id, id).toBe(room); expect(whyNot(F2, spec(id), a, []), id).toBeNull();
    }
  });

  it('a richly furnished F2 (the velvet corner sofa, the canopy bed, the marble console, the attaya service…) stays walkable to every room', () => {
    const placed: Placed[] = [];
    for (const id of ['canape_angle_velours', 'lit_baldaquin', 'console_marbre', 'attaya_service', 'pouf_velours', 'fauteuil_velours', 'table_basse_sculptee', 'armoire_miroir',
      'tele_plate', 'tapis_priere_velours', 'chevet_sculpte']) {
      const a = autoPlace(F2, spec(id), placed); expect(a, id).not.toBeNull(); placed.push({ spec: spec(id), at: a! });
    }
    for (const [k, p] of placed.entries()) expect(whyNot(F2, p.spec, p.at, placed.filter((_, j) => j !== k)), p.spec.id).toBeNull();
    expect(reachable(F2_JAMM, placed.filter(p => !p.spec.flat && !p.spec.mount).map(p => footprint(p.spec, p.at))).ok).toBe(true);
  });
});
