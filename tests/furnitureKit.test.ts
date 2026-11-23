import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildFurniture, furnitureSeats, furnitureUseAt, FURNITURE_IDS, FURNITURE_TYPES, TIERS, LEGACY_FURNITURE, isFurnitureId, type FurnitureId } from '../src/world/furnitureKit';
import { FURNITURE } from '../src/economy/furniture';

const meshes = (o: THREE.Object3D) => { const out: THREE.Mesh[] = []; o.traverse(x => { if ((x as THREE.Mesh).isMesh) out.push(x as THREE.Mesh); }); return out; };

describe('furniture kit', () => {
  it('covers every type in basic, better and premium', () => {
    expect(FURNITURE_IDS).toHaveLength(FURNITURE_TYPES.length * 3);
    for (const t of ['bed', 'shower', 'kitchen', 'sofa', 'tv', 'desk', 'plasticChair', 'woodenChair', 'table', 'wardrobe', 'prayerMat', 'attaya'])
      for (const r of TIERS) expect(isFurnitureId(`${t}:${r}`)).toBe(true);
    expect(() => buildFurniture('sofa:gold' as FurnitureId)).toThrow();
  });

  for (const id of FURNITURE_IDS) {
    it(`${id}: one draw call (two with glass), geometry inside its footprint, sane anchors`, () => {
      const f = buildFurniture(id), s = f.spec;
      const m = meshes(f.group);
      expect(m.length).toBe(s.budget.drawCalls);
      expect(s.budget.drawCalls).toBeLessThanOrEqual(2);
      expect(s.budget.tris).toBeLessThan(1500);
      for (const x of m) expect(x.userData.shared).toBe(true);
      expect(s.name.length).toBeGreaterThan(3);
      // the geometry fits the declared footprint (2 cm tolerance), standing on the floor
      const box = new THREE.Box3();
      for (const x of m) { x.geometry.computeBoundingBox(); box.union(x.geometry.boundingBox!); }
      expect(box.min.y).toBeGreaterThanOrEqual(-0.006);
      expect(box.max.x).toBeLessThanOrEqual(s.footprint.w / 2 + 0.02); expect(box.min.x).toBeGreaterThanOrEqual(-s.footprint.w / 2 - 0.02);
      expect(box.max.z).toBeLessThanOrEqual(s.footprint.d / 2 + 0.02); expect(box.min.z).toBeGreaterThanOrEqual(-s.footprint.d / 2 - 0.02);
      expect(box.max.y).toBeLessThanOrEqual(s.footprint.h + 0.02);
      // seats inside the footprint, at a sitting height
      for (const seat of s.seats) {
        expect(Math.abs(seat.x)).toBeLessThan(s.footprint.w / 2); expect(Math.abs(seat.z)).toBeLessThan(s.footprint.d / 2);
        expect(seat.top).toBeGreaterThanOrEqual(0); expect(seat.top).toBeLessThan(0.8);
      }
      // the use anchor: on its seat when it has one, inside for showers/beds/mats, in front otherwise
      const u = s.use;
      if (u.seat) { const seat = s.seats.find(x => x.id === u.seat)!; expect(seat).toBeDefined(); expect(u.x).toBe(seat.x); expect(u.z).toBe(seat.z); expect(u.clip).toBe(seat.clip ?? 'Sit'); }
      else if (s.walkable || s.type === 'shower' || u.verb === 'sleep') expect(Math.abs(u.z)).toBeLessThan(s.footprint.d / 2);
      else { expect(u.z).toBeGreaterThan(s.footprint.d / 2); expect(Math.abs(Math.abs(u.yaw) - Math.PI)).toBeLessThan(1e-9); }
      expect(u.label.length).toBeGreaterThan(2);
    });
  }

  it('makes quality visible: premium is richer than basic for every type', () => {
    for (const t of FURNITURE_TYPES) {
      const [a, , c] = TIERS.map(r => buildFurniture(`${t}:${r}` as FurnitureId).spec);
      expect(c.budget.tris, t).toBeGreaterThan(a.budget.tris);
    }
  });

  it('gives the home its uses: sleep, wash, cook, work, watch, change, pray', () => {
    const verb = (id: FurnitureId) => buildFurniture(id).spec.use.verb;
    expect(verb('bed:basic')).toBe('sleep'); expect(verb('shower:better')).toBe('wash'); expect(verb('kitchen:premium')).toBe('use');
    expect(verb('desk:better')).toBe('work'); expect(verb('tv:premium')).toBe('use'); expect(verb('prayerMat:basic')).toBe('pray');
    expect(buildFurniture('sofa:better').seats).toHaveLength(3);
    expect(buildFurniture('desk:premium').seats[0].yaw).toBeCloseTo(Math.PI);   // the desk chair faces the desk
  });

  it('lies people on beds with the head on the pillow, and seats the attaya circle on the floor', () => {
    for (const r of TIERS) {
      const bed = buildFurniture(`bed:${r}` as FurnitureId).spec;
      expect(bed.use.clip).toBe('Lie'); expect(bed.seats[0].kind).toBe('bed'); expect(bed.seats[0].clip).toBe('Lie');
      // hips near the middle: the head (≈ 0.8 m towards −z) lands on the pillow, the feet (≈ 0.9 m) stay on the bed
      expect(bed.seats[0].z - 0.85).toBeGreaterThan(-bed.footprint.d / 2); expect(bed.seats[0].z + 0.9).toBeLessThan(bed.footprint.d / 2);
      const att = buildFurniture(`attaya:${r}` as FurnitureId).spec;
      expect(att.seats).toHaveLength(3); expect(att.use.clip).toBe('SitFloor');
      for (const s of att.seats) { expect(s.kind).toBe('floor'); expect(s.clip).toBe('SitFloor'); expect(s.top).toBeLessThan(0.12); }
      expect(buildFurniture(`rug:${r}` as FurnitureId).spec.use.clip).toBe('SitFloor');
    }
  });

  it('places seats and the use anchor in the world', () => {
    const f = buildFurniture('sofa:premium');
    f.group.position.set(1000, 0.1, 5); f.group.rotation.y = Math.PI; f.group.updateMatrixWorld(true);
    const seats = furnitureSeats(f.group, f.spec, 'home', 'home:sofa');
    expect(seats).toHaveLength(3);
    expect(seats[1].id).toBe('home:sofa:s1'); expect(seats[1].space).toBe('home'); expect(seats[1].kind).toBe('sofa');
    expect(seats[1].top).toBeCloseTo(0.1 + f.spec.seats[1].top); expect(seats[1].z).toBeCloseTo(5 - f.spec.seats[1].z);
    expect(Math.abs(Math.cos(seats[1].yaw) + 1)).toBeLessThan(1e-9);           // faces −z once turned around
    const u = furnitureUseAt(f.group, f.spec); expect(u.x).toBeCloseTo(1000 - f.spec.use.x);
  });

  it('maps the current starter-room catalogue onto kit pieces', () => {
    for (const item of FURNITURE) expect(item.id in LEGACY_FURNITURE).toBe(true);
  });
});
