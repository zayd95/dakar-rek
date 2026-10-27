import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildFurniture, FURNITURE_NAME, HOME_TYPES, TIERS, type FurnitureId, type HomeType } from '../src/world/furnitureKit';
import { FUV, FW, FH, type FurnKey } from '../src/world/furnitureAtlas';
import { FURNITURE_SPECS, furnitureSpec, homeSpec, type FurnitureSpec } from '../src/economy/catalog';
import { KIT_PIECES, installFurnitureKit } from '../src/economy/furnitureKitAdapter';
import { autoPlace, footprint, layoutOf, roomKindOf, roomOf, whyNot, type Placed } from '../src/economy/placement';
import { F2_JAMM, reachable } from '../src/housing/plan';

/**
 * LD2.0-D « Collection Almadies » (lane K-L): the modern-luxury line modelled on the owner's three reference sheets (docs/ld2/LD2_D.md, the brief), all
 * Prestige, each piece on a kit model of its own (src/world/furnitureKit.ts « Collection Almadies »), its materials in the atlas band the atlas grew by.
 */
type Row = [id: string, name: string, price: number, type: FurnitureSpec['type'], room: string, kit: FurnitureId];
const TABLE: Row[] = [
  // the living room
  ['canape_courbe', 'Grand canapé courbe sur socle bronze', 7_500_000, 'sofa', 'sejour', 'lxSofa:premium'],
  ['canape_meridienne', 'Canapé d’angle méridienne en lin', 4_800_000, 'sofa', 'sejour', 'lxSofa:better'],
  ['canape_boucle', 'Canapé arrondi en bouclé, socle doré', 3_200_000, 'sofa', 'sejour', 'lxSofa:basic'],
  ['fauteuil_boucle', 'Fauteuil cocon en bouclé', 1_400_000, 'chair', 'sejour', 'lxArmchair:premium'],
  ['fauteuil_noyer', 'Fauteuil enveloppant, lin et noyer', 1_100_000, 'chair', 'sejour', 'lxArmchair:better'],
  ['table_basse_marbre_noir', 'Table basse en marbre noir', 2_400_000, 'table', 'sejour', 'lxLowTable:premium'],
  ['table_basse_noyer', 'Table basse en marbre blanc et noyer', 1_600_000, 'table', 'sejour', 'lxLowTable:better'],
  ['gueridon_marbre', 'Guéridon en marbre sur fût noir', 650_000, 'table', 'sejour', 'lxLowTable:basic'],
  ['meuble_tv_laque', 'Meuble télé bas laqué', 1_900_000, 'tv', 'sejour', 'lxCabinet:basic'],
  ['enfilade_bronze', 'Enfilade grège à filets bronze', 2_800_000, 'shelf', 'sejour', 'lxCabinet:better'],
  ['bibliotheque_noyer', 'Bibliothèque éclairée en noyer', 2_200_000, 'shelf', 'sejour', 'lxCabinet:premium'],
  ['bibliotheque_bronze', 'Étagère ouverte noir et bronze', 1_300_000, 'shelf', 'sejour', 'lxAccent:better'],
  // dining
  ['salle_manger_ronde', 'Table ronde en marbre et quatre chaises', 6_500_000, 'dining', 'manger', 'lxTableSet:premium'],
  ['salle_manger_noyer', 'Table en noyer et quatre chaises', 3_600_000, 'dining', 'manger', 'lxTableSet:better'],
  // the bedroom
  ['lit_capitonne_noir', 'Lit en cuir noir capitonné', 5_800_000, 'bed', 'chambre', 'lxBed:premium'],
  ['lit_lin_greige', 'Lit tapissier en lin grège', 4_900_000, 'bed', 'chambre', 'lxBed:better'],
  ['lit_noyer', 'Lit en noyer, tête tapissée', 3_400_000, 'bed', 'chambre', 'lxBed:basic'],
  ['chevet_greige', 'Chevet arrondi grège', 450_000, 'lamp', 'chambre', 'lxNightstand:better'],
  ['chevet_noyer', 'Chevet en noyer, deux tiroirs', 380_000, 'lamp', 'chambre', 'lxNightstand:basic'],
  ['banc_lit', 'Banc de lit tapissé', 900_000, 'chair', 'chambre', 'lxArmchair:basic'],
  ['commode_six', 'Commode six tiroirs', 1_800_000, 'wardrobe', 'chambre', 'lxChest:better'],
  ['chiffonnier_noyer', 'Chiffonnier en noyer', 1_200_000, 'wardrobe', 'chambre', 'lxChest:basic'],
  ['dressing_bronze', 'Dressing quatre portes, poignées bronze', 4_200_000, 'wardrobe', 'chambre', 'lxChest:premium'],
  ['coiffeuse_ronde', 'Coiffeuse, miroir rond et tabouret', 1_500_000, 'mirror', 'chambre', 'lxAccent:premium'],
  // the office
  ['bureau_caisson', 'Bureau à caisson et chaise tapissée', 2_600_000, 'desk', 'bureau', 'lxTableSet:basic'],
  // light and decoration
  ['lustre_couronne', 'Lustre couronne de cristal', 6_000_000, 'lamp', 'any', 'lxLight:premium'],
  ['lampadaire_champignon', 'Lampadaire champignon', 480_000, 'lamp', 'any', 'lxLight:basic'],
  ['lampadaire_arc_plisse', 'Lampadaire arc, abat-jour plissé', 520_000, 'lamp', 'any', 'lxLight:better'],
  ['tapis_rond_jute', 'Grand tapis rond en jute', 700_000, 'rug', 'any', 'lxDecor:basic'],
  ['miroir_ovale', 'Miroir ovale, cadre bronze', 850_000, 'mirror', 'chambre', 'lxDecor:premium'],
  ['pot_cannele', 'Ficus en pot cannelé', 350_000, 'plant', 'any', 'lxDecor:better'],
];
const LX: HomeType[] = ['lxSofa', 'lxArmchair', 'lxLowTable', 'lxTableSet', 'lxBed', 'lxNightstand', 'lxChest', 'lxCabinet', 'lxLight', 'lxDecor', 'lxAccent'];
const meshes = (o: THREE.Object3D) => { const out: THREE.Mesh[] = []; o.traverse(x => { if ((x as THREE.Mesh).isMesh) out.push(x as THREE.Mesh); }); return out; };
const kit = (id: FurnitureId) => buildFurniture(id).spec;
/** Whether a model's body samples the atlas rect `k` anywhere. */
function wears(kid: FurnitureId, k: FurnKey) {
  const r = FUV[k], uv = (meshes(buildFurniture(kid).group)[0].geometry as THREE.BufferGeometry).attributes.uv;
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); if (u >= r[0] - 1e-6 && u <= r[2] + 1e-6 && v >= r[1] - 1e-6 && v <= r[3] + 1e-6) return true; }
  return false;
}
/** An atlas rect back in pixels (atlasRect insets each rect by one texel): x, y from the top-left, w, h. */
const px = (k: FurnKey) => { const [u0, v0, u1, v1] = FUV[k]; return { x: Math.round(u0 * FW - 1), y: Math.round((1 - v1) * FH - 1), w: Math.round((u1 - u0) * FW + 2), h: Math.round((v1 - v0) * FH + 2) }; };

describe('Collection Almadies: the catalogue', () => {
  installFurnitureKit();

  it('sells the line\'s 31 pieces: ids, names, prices, Prestige, line « almadies », their type, room and kit model', () => {
    for (const [id, name, price, type, room, kid] of TABLE) {
      const f = furnitureSpec(id)!;
      expect(f, id).toBeDefined();
      expect([f.name, f.price, f.grade, f.line, f.type, f.shop, roomKindOf(f)], id).toEqual([name, price, 'premium', 'almadies', type, 'keur_meubles', room]);
      expect(KIT_PIECES[id], id).toBe(kid);
      expect(kit(kid).name, id).toBe(name);
      expect(f.what.length, id).toBeGreaterThan(10); expect(f.what.length, id).toBeLessThan(90); expect(f.emoji.length, id).toBeGreaterThan(0);
    }
    expect(FURNITURE_SPECS.filter(f => f.line === 'almadies').map(f => f.id).sort()).toEqual(TABLE.map(t => t[0]).sort());
    expect(new Set(FURNITURE_SPECS.map(f => f.id)).size).toBe(FURNITURE_SPECS.length);
  });

  it('new ids only: the marble dining set already sold keeps its id, name, price and model (the round one is salle_manger_ronde)', () => {
    const old = furnitureSpec('salle_manger_marbre')!;
    expect([old.name, old.price, old.grade, old.line, KIT_PIECES.salle_manger_marbre]).toEqual(['Salle à manger en marbre', 1_250_000, 'premium', undefined, 'dining:premium']);
    for (const [id] of TABLE) expect(KIT_PIECES[id], id).toMatch(/^lx/);
  });

  it('each piece is its kit model: footprint and seats (a seat top is the kit\'s + 0.1)', () => {
    for (const [id, , , , , kid] of TABLE) {
      const f = furnitureSpec(id)!, k = kit(kid);
      expect([f.w, f.d], id).toEqual([k.footprint.w, k.footprint.d]);
      expect((f.seats ?? []).length, id).toBe(k.seats.length);
      (f.seats ?? []).forEach((st, i) => {
        const ks = k.seats[i];
        expect(Math.hypot(st.x - ks.x, st.z - ks.z), id).toBeLessThan(0.02); expect(st.top, id).toBeCloseTo(ks.top + 0.1, 2);
        expect(Math.abs(st.yaw - ks.yaw), id).toBeLessThan(0.01); expect([st.kind, st.clip], id).toEqual([ks.kind, ks.clip]);
      });
    }
  });

  it('the uses: sofas and armchairs rest, beds sleep, the TV stand shows the TV, the desk works, the tables make the ataya, the lamps hang or stand', () => {
    for (const id of ['canape_courbe', 'canape_meridienne', 'canape_boucle', 'fauteuil_boucle', 'fauteuil_noyer']) expect(furnitureSpec(id)!.use, id).toMatchObject({ id: 'detente', label: 'Se détendre', sit: true });
    for (const id of ['canape_courbe', 'canape_meridienne', 'canape_boucle']) expect(furnitureSpec(id)!.what, id).toMatch(/« Se détendre »$/);
    expect(['lit_capitonne_noir', 'lit_lin_greige', 'lit_noyer'].map(id => furnitureSpec(id)!.sleep)).toEqual([100, 100, 100]);   // a dearer bed never rests worse (tests/assets.test.ts)
    for (const id of ['lit_capitonne_noir', 'lit_lin_greige', 'lit_noyer']) { const s = furnitureSpec(id)!.seats!; expect(s).toHaveLength(1); expect(s[0]).toMatchObject({ kind: 'bed', clip: 'Lie' }); }
    expect(furnitureSpec('meuble_tv_laque')!.use).toMatchObject({ id: 'tele', label: 'Regarder la télé', counter: 'tele' });
    expect(wears('lxCabinet:basic', 'flat')).toBe(true);                                                        // a flat TV on it, lit like the others
    expect(furnitureSpec('bureau_caisson')!.use).toMatchObject({ id: 'bureau', label: 'Travailler au bureau', sit: true, pay: 4_000 });
    expect(kit('lxTableSet:basic').use).toMatchObject({ verb: 'work', seat: 'chair' }); expect(kit('lxTableSet:basic').seats[0].yaw).toBeCloseTo(Math.PI);
    for (const id of ['salle_manger_ronde', 'salle_manger_noyer']) { const f = furnitureSpec(id)!; expect(f.seats, id).toHaveLength(4); expect(f.use, id).toMatchObject({ id: 'ataya' }); }
    for (const id of ['table_basse_marbre_noir', 'table_basse_noyer']) expect(furnitureSpec(id)!.use, id).toMatchObject({ id: 'ataya', label: 'Préparer l’ataya' });
    expect(furnitureSpec('coiffeuse_ronde')!.use).toMatchObject({ id: 'preparer', sit: true });
    expect(furnitureSpec('lustre_couronne')!.mount).toBe('ceiling'); expect(furnitureSpec('miroir_ovale')!.mount).toBe('wall');
    expect(furnitureSpec('tapis_rond_jute')!.flat).toBe(true); expect(kit('lxDecor:basic').walkable).toBe(true);
    for (const [id, , , , , kid] of TABLE) if (!['lustre_couronne', 'miroir_ovale'].includes(id)) expect(furnitureSpec(id)!.mount, id).toBeUndefined(); else expect(kid).toMatch(/^lx/);
  });

  it('the lamps light at night as the kit\'s others do: each wears a glowing paint (a bulb, a lit shade, a pleated shade)', () => {
    const lit = (kid: FurnitureId) => (['bulb', 'lxPleat', 'lxShade', 'lxGlow'] as FurnKey[]).some(k => wears(kid, k));
    for (const kid of ['lxLight:basic', 'lxLight:better', 'lxLight:premium', 'lxNightstand:basic', 'lxNightstand:better', 'lxCabinet:premium'] as FurnitureId[]) expect(lit(kid), kid).toBe(true);
  });
});

describe('Collection Almadies: the kit models', () => {
  it('eleven types lx…, three pieces each, named; one draw call each (two for the crystal), under 1 500 triangles, inside the footprint, on the floor', () => {
    expect(LX.every(t => HOME_TYPES.includes(t))).toBe(true);
    for (const t of LX) {
      expect(FURNITURE_NAME[t].every(n => n.length > 3), t).toBe(true);
      for (const r of TIERS) {
        const id = `${t}:${r}` as FurnitureId, f = buildFurniture(id), s = f.spec, m = meshes(f.group);
        expect(s.budget.tris, id).toBeLessThan(1500);
        expect(s.budget.drawCalls, id).toBe(id === 'lxLight:premium' ? 2 : 1); expect(m.length, id).toBe(s.budget.drawCalls);
        if (id === 'lxLight:premium') expect(m.filter(x => (x.material as THREE.Material).transparent)).toHaveLength(1);    // the crystal, on the glass
        const box = new THREE.Box3(); for (const x of m) { x.geometry.computeBoundingBox(); box.union(x.geometry.boundingBox!); }
        expect(box.min.y, id).toBeGreaterThanOrEqual(-0.006); expect(box.max.y, id).toBeLessThanOrEqual(s.footprint.h + 0.02);
        expect(Math.max(box.max.x, -box.min.x), id).toBeLessThanOrEqual(s.footprint.w / 2 + 0.02);
        expect(Math.max(box.max.z, -box.min.z), id).toBeLessThanOrEqual(s.footprint.d / 2 + 0.02);
      }
    }
  });

  it('the premium slot of each type is the richest of its pieces against the basic one (more triangles)', () => {
    for (const t of LX) { const [a, , c] = TIERS.map(r => kit(`${t}:${r}` as FurnitureId)); expect(c.budget.tris, t).toBeGreaterThan(a.budget.tris); }
  });

  it('real sizes: the reference sheets\' measured pieces at their sizes (w × d, metres)', () => {
    const size = (id: string) => { const f = furnitureSpec(id)!; return [f.w, f.d]; };
    expect(size('canape_meridienne')).toEqual([2.8, 1.6]); expect(size('table_basse_noyer')).toEqual([1.2, 0.6]); expect(size('bibliotheque_noyer')).toEqual([1.6, 0.3]);
    expect(size('dressing_bronze')[0]).toBe(2.0); expect(size('coiffeuse_ronde')[0]).toBe(1.0); expect(size('chiffonnier_noyer')[0]).toBe(0.8);
    expect(size('tapis_rond_jute')).toEqual([2.2, 2.2]); expect(kit('lxBed:basic').footprint).toMatchObject({ w: 1.8, h: 1.05 }); expect(kit('lxCabinet:premium').footprint.h).toBe(2.0);
    expect(kit('lxChest:premium').footprint.h).toBe(2.1); expect(kit('lxDecor:better').footprint.h).toBe(1.4); expect(size('canape_courbe')).toEqual([3.4, 1.3]);
  });
});

describe('Collection Almadies: the atlas', () => {
  const lxKeys = (Object.keys(FUV) as FurnKey[]).filter(k => k.startsWith('lx'));

  it('grew to 512 × 1024; the line paints only in its band (y 768…1023)', () => {
    expect([FW, FH]).toEqual([512, 1024]);
    expect(lxKeys.length).toBeGreaterThanOrEqual(20);
    for (const k of lxKeys) { const r = px(k); expect(r.x, k).toBeGreaterThanOrEqual(0); expect(r.x + r.w, k).toBeLessThanOrEqual(512); expect(r.y, k).toBeGreaterThanOrEqual(768); expect(r.y + r.h, k).toBeLessThanOrEqual(1024); }
  });

  it('no region overlaps another, and the regions drawn before keep their pixels (their UVs follow the new height)', () => {
    const all = (Object.keys(FUV) as FurnKey[]).map(k => ({ k, ...px(k) }));
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j], hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(hit, `${a.k} × ${b.k}`).toBe(false);
    }
    expect(px('wax0')).toEqual({ x: 16, y: 0, w: 64, h: 64 }); expect(px('marble')).toEqual({ x: 64, y: 288, w: 64, h: 64 });
    expect(px('velvetTuft')).toEqual({ x: 128, y: 480, w: 64, h: 64 }); expect(px('aquaSea')).toEqual({ x: 352, y: 624, w: 128, h: 48 });
  });

  it('the line wears its materials: bouclé, linen, walnut, marble, lacquer, leather, jute, bronze', () => {
    expect(wears('lxSofa:premium', 'lxBoucle')).toBe(true); expect(wears('lxSofa:premium', 'lxBronze')).toBe(true);
    expect(wears('lxSofa:better', 'lxLinenTop')).toBe(true); expect(wears('lxLowTable:premium', 'lxMarbleBlack')).toBe(true);
    expect(wears('lxLowTable:better', 'lxMarbleWhite')).toBe(true); expect(wears('lxBed:basic', 'lxWalnut')).toBe(true);
    expect(wears('lxBed:premium', 'lxLeatherTuft')).toBe(true); expect(wears('lxChest:premium', 'lxLacquer')).toBe(true);
    expect(wears('lxDecor:basic', 'lxJute')).toBe(true); expect(wears('lxTableSet:premium', 'lxFluted')).toBe(true);
    // no saturated wax print in this line
    for (const t of LX) for (const r of TIERS) for (const k of ['wax0', 'wax1', 'wax2', 'waxA', 'waxB'] as FurnKey[]) expect(wears(`${t}:${r}` as FurnitureId, k), `${t}:${r} ${k}`).toBe(false);
  });
});

describe('Collection Almadies: in the F2', () => {
  const F2 = layoutOf(homeSpec('appart_jamm')!);
  const spec = (id: string) => furnitureSpec(id)!;

  it('each piece finds a valid spot in a room of its kind in the empty F2', () => {
    for (const [id, , , , room] of TABLE) {
      const a = autoPlace(F2, spec(id), [])!;
      expect(a, id).not.toBeNull(); expect(whyNot(F2, spec(id), a, []), id).toBeNull();
      // a room of its kind, else the séjour (the F2 has no dining room or study: LD2.0-D's TYPE_ROOM falls back there)
      if (room !== 'any') expect(roomOf(F2, a)?.id, id).toBe(F2_JAMM.rooms.some(r => r.id === room) ? room : 'sejour');
    }
  });

  it('a séjour and a chambre furnished with the line, set out by the game, stay walkable to every room', () => {
    const placed: Placed[] = [];
    for (const id of ['canape_courbe', 'lampadaire_champignon', 'enfilade_bronze', 'meuble_tv_laque', 'tapis_rond_jute', 'table_basse_marbre_noir', 'fauteuil_boucle',
      'gueridon_marbre', 'pot_cannele', 'lustre_couronne', 'lit_capitonne_noir', 'banc_lit', 'chevet_greige', 'miroir_ovale']) {
      const a = autoPlace(F2, spec(id), placed); expect(a, id).not.toBeNull(); placed.push({ spec: spec(id), at: a! });
    }
    for (const [k, p] of placed.entries()) expect(whyNot(F2, p.spec, p.at, placed.filter((_, j) => j !== k)), p.spec.id).toBeNull();
    expect(roomOf(F2, placed[0].at)?.id).toBe('sejour'); expect(roomOf(F2, placed[10].at)?.id).toBe('chambre');
    expect(reachable(F2_JAMM, placed.filter(p => !p.spec.flat && !p.spec.mount).map(p => footprint(p.spec, p.at))).ok).toBe(true);
  });
});
