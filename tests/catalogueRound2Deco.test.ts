import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FURNITURE_SPECS, TYPE_LABEL, furnitureSpec } from '../src/economy/catalog';
import { KIT_PIECES, installFurnitureKit } from '../src/economy/furnitureKitAdapter';
import { furnitureModel } from '../src/economy/furnitureModels';
import { buildFurniture, type FurnitureId } from '../src/world/furnitureKit';
import { FUV, FW, FH, type FurnKey } from '../src/world/furnitureAtlas';

/**
 * The catalogue's second round, lane K-D (docs/ld2/LD2_C.md « Catalogue, round 2 »): floor vases, sculptures, wall decoration, folding screens,
 * lanterns and aquariums, each in three grades, sold under the ids, names, grades and prices of the doc's table, each a kit model of its own.
 */
const TABLE: [string, FurnitureId, string, string, number, 'decor' | 'lamp'][] = [
  ['jarre_herbes', 'floorVase:basic', 'Jarre en terre et herbes sèches', 'basic', 6_000, 'decor'],
  ['vase_bouquet', 'floorVase:better', 'Vase en céramique et bouquet', 'better', 45_000, 'decor'],
  ['vase_orchidees', 'floorVase:premium', 'Grand vase doré et orchidées', 'premium', 260_000, 'decor'],
  ['statuette_bois', 'sculpture:basic', 'Statuette en bois sculpté', 'basic', 15_000, 'decor'],
  ['sculpture_ebene', 'sculpture:better', 'Sculpture en ébène sur socle', 'better', 120_000, 'decor'],
  ['bronze_marbre', 'sculpture:premium', 'Bronze sur socle de marbre', 'premium', 950_000, 'decor'],
  ['paniers_muraux', 'wallDecor:basic', 'Paniers tressés au mur', 'basic', 8_000, 'decor'],
  ['masques_sculptes', 'wallDecor:better', 'Masques sculptés', 'better', 65_000, 'decor'],
  ['miroir_soleil', 'wallDecor:premium', 'Miroir soleil doré', 'premium', 380_000, 'decor'],
  ['paravent_raphia', 'screen:basic', 'Paravent en raphia', 'basic', 14_000, 'decor'],
  ['paravent_bois', 'screen:better', 'Paravent en bois sculpté', 'better', 110_000, 'decor'],
  ['paravent_laque', 'screen:premium', 'Paravent laqué et doré', 'premium', 560_000, 'decor'],
  ['lanterne_tempete', 'lantern:basic', 'Lanterne tempête', 'basic', 4_500, 'lamp'],
  ['lanternes_fer', 'lantern:better', 'Lanternes en fer ajouré', 'better', 38_000, 'lamp'],
  ['candelabre_cristal', 'lantern:premium', 'Candélabre en cristal', 'premium', 450_000, 'lamp'],
  ['bocal_poissons', 'aquarium:basic', 'Bocal et poissons rouges', 'basic', 9_000, 'decor'],
  ['aquarium_meuble', 'aquarium:better', 'Aquarium sur meuble', 'better', 190_000, 'decor'],
  ['aquarium_mer', 'aquarium:premium', 'Grand aquarium d’eau de mer', 'premium', 1_900_000, 'decor'],
];
const meshes = (o: THREE.Object3D) => { const out: THREE.Mesh[] = []; o.traverse(x => { if ((x as THREE.Mesh).isMesh) out.push(x as THREE.Mesh); }); return out; };

describe('catalogue round 2, decoration and luxury accents (lane K-D)', () => {
  installFurnitureKit();

  it('sells the doc\'s eighteen pieces: ids, names, grades, prices, types, each on its kit model with the same footprint', () => {
    for (const [id, kid, name, grade, price, type] of TABLE) {
      const f = furnitureSpec(id)!;
      expect(f, id).toBeDefined();
      expect([f.name, f.grade, f.price, f.type, f.shop], id).toEqual([name, grade, price, type, 'keur_meubles']);
      expect(f.what.length, id).toBeGreaterThan(10); expect(f.what.length, id).toBeLessThan(80);
      expect(f.emoji.length, id).toBeGreaterThan(0);
      expect(KIT_PIECES[id], id).toBe(kid);
      const k = buildFurniture(kid).spec;
      expect(k.name, id).toBe(name);
      expect([f.w, f.d], id).toEqual([k.footprint.w, k.footprint.d]);
      expect(f.seats ?? [], id).toEqual([]);
    }
    expect(new Set(FURNITURE_SPECS.map(f => f.id)).size).toBe(FURNITURE_SPECS.length);
  });

  it('each grade steps up: one draw call (two with the aquariums\' glass), under 1 500 triangles, Confort and Prestige richer than Simple', () => {
    for (const t of ['floorVase', 'sculpture', 'wallDecor', 'screen', 'lantern', 'aquarium']) {
      const [a, b, c] = (['basic', 'better', 'premium'] as const).map(r => buildFurniture(`${t}:${r}` as FurnitureId).spec);
      for (const s of [a, b, c]) { expect(s.budget.tris, s.id).toBeLessThan(1500); expect(s.budget.drawCalls, s.id).toBe(t === 'aquarium' ? 2 : 1); }
      expect(b.budget.tris, t).toBeGreaterThan(a.budget.tris); expect(c.budget.tris, t).toBeGreaterThan(a.budget.tris);
    }
  });

  it('hangs the wall decoration on a wall, at eye height, across its whole width', () => {
    for (const id of ['paniers_muraux', 'masques_sculptes', 'miroir_soleil']) {
      const f = furnitureSpec(id)!;
      expect(f.mount, id).toBe('wall');
      const box = new THREE.Box3().setFromObject(furnitureModel(f));
      expect(box.min.y, id).toBeGreaterThan(1.0); expect(box.max.y, id).toBeLessThan(2.0);
      expect((box.max.x - box.min.x) / f.w, id).toBeGreaterThan(0.95);
      expect(box.min.z, id).toBeGreaterThanOrEqual(-f.d / 2 - 0.005);                    // its back on the wall, nothing through it
    }
    for (const [id] of TABLE) if (!['paniers_muraux', 'masques_sculptes', 'miroir_soleil'].includes(id)) expect(furnitureSpec(id)!.mount, id).toBeUndefined();
  });

  it('gives the aquariums « Regarder les poissons », the screens « Se changer » (the bedroom first), the sunburst mirror « Se préparer »', () => {
    for (const id of ['bocal_poissons', 'aquarium_meuble', 'aquarium_mer']) {
      const u = furnitureSpec(id)!.use!;
      expect(u.label, id).toBe('Regarder les poissons'); expect(u.needs.moral, id).toBeGreaterThan(0); expect(u.seconds, id).toBeLessThanOrEqual(5);
      expect(buildFurniture(KIT_PIECES[id] as FurnitureId).spec.use.label, id).toBe('Regarder les poissons');
    }
    for (const id of ['paravent_raphia', 'paravent_bois', 'paravent_laque']) { expect(furnitureSpec(id)!.use?.label, id).toBe('Se changer'); expect(furnitureSpec(id)!.room, id).toBe('chambre'); }
    expect(furnitureSpec('miroir_soleil')!.use?.label).toBe('Se préparer');
    // the more expensive tank is the better watch
    const moral = (id: string) => furnitureSpec(id)!.use!.needs.moral!;
    expect(moral('aquarium_mer')).toBeGreaterThan(moral('aquarium_meuble')); expect(moral('aquarium_meuble')).toBeGreaterThan(moral('bocal_poissons'));
  });

  it('lights the lanterns with the glow layer, and paints only in the lane\'s part of the atlas', () => {
    const inRect = (g: THREE.BufferGeometry, k: FurnKey) => { const r = FUV[k], uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); if (u >= r[0] - 1e-6 && u <= r[2] + 1e-6 && v >= r[1] - 1e-6 && v <= r[3] + 1e-6) return true; } return false; };
    const body = (kid: FurnitureId) => meshes(buildFurniture(kid).group)[0].geometry;
    expect(inRect(body('lantern:basic'), 'lampGlass')).toBe(true);
    expect(inRect(body('lantern:better'), 'pierced')).toBe(true);
    expect(inRect(body('lantern:premium'), 'flame')).toBe(true);
    expect(inRect(body('aquarium:premium'), 'aquaSea')).toBe(true);
    for (const k of ['basket0', 'basket1', 'basket2', 'pierced', 'lampGlass', 'flame', 'crystal', 'glaze', 'clayBand', 'raffia', 'carvedPanel', 'lacquer', 'aquaFresh', 'aquaSea'] as FurnKey[]) {
      const [u0, v0, u1, v1] = FUV[k];
      expect(u0 * FW, k).toBeGreaterThanOrEqual(256); expect(u1 * FW, k).toBeLessThanOrEqual(512);
      expect((1 - v1) * FH, k).toBeGreaterThanOrEqual(480); expect((1 - v0) * FH, k).toBeLessThanOrEqual(768);
    }
  });

  it('names the catalogue\'s decoration type for what it holds now', () => {
    expect(TYPE_LABEL.decor).toBe('Déco et objets');
  });
});
