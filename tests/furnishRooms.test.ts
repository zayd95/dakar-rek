import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FURNITURE_SPECS, furnitureSpec, homeSpec, type FurnitureSpec } from '../src/economy/catalog';
import { WHY, autoPlace, footprint, layoutOf, onWall, openPlan, planRooms, relayout, roomKindOf, roomOf, roomsFor, whyNot, type Placed } from '../src/economy/placement';
import { F2_JAMM, inner, reachable, roomAt } from '../src/housing/plan';
import { KIT_PIECES, installFurnitureKit } from '../src/economy/furnitureKitAdapter';
import { furnitureModel } from '../src/economy/furnitureModels';
import { buildFurniture, type FurnitureId } from '../src/world/furnitureKit';
import { GameState } from '../src/core/state';
import { migrate, newSave } from '../src/core/save';
const serialize = (d: unknown) => JSON.stringify(d);
import { currentHome, furnitureIn, moveIn, normalize, rentAsset, settleFurniture } from '../src/economy/assets';
import { deliverFurniture } from '../src/economy/furniture';
import type { Placement } from '../src/core/types';

/**
 * LD2.0-C « Walkable Homes », lane F (docs/ld2/LD2_C.md): furnishing the F2 by room. Its floor plan (src/housing/plan.ts) decides where a piece goes
 * (src/economy/placement.ts), a save from before the plan is re-checked when it loads (src/economy/assets.ts settleFurniture), and every piece of
 * the catalogue has a real model of one draw call (src/world/furnitureKit.ts, src/economy/furnitureKitAdapter.ts).
 */
const F2 = layoutOf(homeSpec('appart_jamm')!);
const spec = (id: string) => furnitureSpec(id)!;
const at = (x: number, z: number, rot = 0): Placement => ({ x, z, rot });
const P = (id: string, x: number, z: number, rot = 0): Placed => ({ spec: spec(id), at: at(x, z, rot) });
const valid = (L: typeof F2, pieces: Placed[]) => pieces.every((p, k) => whyNot(L, p.spec, p.at, pieces.filter((_, j) => j !== k)) === null);
const obstaclesOf = (pieces: Placed[]) => pieces.filter(p => !p.spec.flat && !p.spec.mount).map(p => footprint(p.spec, p.at));

describe('the F2 is furnished by room (its floor plan)', () => {
  it('the F2 is a plan home; its rooms are the editor\'s chips (the short hall left out)', () => {
    expect(F2.plan).toBe(F2_JAMM);
    expect(planRooms(F2).map(r => r.name)).toEqual(['Entrée', 'Séjour', 'Cuisine', 'Chambre', 'Salle de bain']);
    expect(planRooms(layoutOf(homeSpec('residence_ngor')!))).toEqual([]);
    expect(planRooms(layoutOf(homeSpec('maison_cite')!)).map(r => r.name)).toEqual(expect.arrayContaining(['Grand salon', 'Cuisine', 'Chambre 2']));   // the family house is a plan home too
  });

  it('a bed fits in the bedroom; refused spots say why, plainly, in French', () => {
    expect(whyNot(F2, spec('lit_bois'), at(-2.73, -2.3, 0), [])).toBeNull();
    expect(roomOf(F2, at(-2.73, -2.3))?.id).toBe('chambre');
    // through a wall, astride two rooms, out of the home
    expect(whyNot(F2, spec('lit_bois'), at(-1.0, -2.3, 0), [])).toBe('Ce meuble ne tient pas dans la pièce');
    expect(whyNot(F2, spec('canape_wax'), at(0.5, 0, 0), [])).toBe(WHY.room);                                  // across the séjour–dégagement arch
    expect(whyNot(F2, spec('canape_wax'), at(30, 0, 0), [])).toBe(WHY.room);
    // on a fitting, in front of one
    expect(whyNot(F2, spec('plante'), at(4.1, -2.0), [])).toBe('Pas sur le plan de travail');
    expect(whyNot(F2, spec('plante'), at(1.3, -2.9), [])).toBe('Pas dans la douche');
    expect(whyNot(F2, spec('plante'), at(3.4, -3.1), [])).toBe('Laisse la place devant le frigo');
    // a door's swing, an arch's step, the entry
    expect(whyNot(F2, spec('plante'), at(2.3, 0.7), [])).toBe('Il faut laisser la porte s’ouvrir');           // just inside the kitchen door
    expect(whyNot(F2, spec('plante'), at(-1.5, -0.6), [])).toBe(WHY.door);                                     // the bedroom door's swing
    expect(whyNot(F2, spec('table_basse'), at(0.5, 0.45), [])).toBe('Laisse le passage libre');                 // in front of the arch to the hall
    expect(whyNot(F2, spec('plante'), at(3.15, 2.9), [])).toBe(WHY.passage);                                    // inside the street door
    // a rug may lie in a passage, never in a door's swing
    expect(whyNot(F2, spec('tapis'), at(0.3, 1.0), [])).toBeNull();
    expect(whyNot(F2, spec('tapis'), at(2.45, 0.5, 1), [])).toBe(WHY.door);
    // other pieces: a sofa on another is refused, a rug under it is fine
    const sofa = P('canape_wax', -1.35, 0.6);
    expect(whyNot(F2, spec('table_basse'), at(-1.2, 0.7), [sofa])).toBe('Gêné par un autre meuble');
    expect(whyNot(F2, spec('tapis_tisse'), at(-1.35, 1.2), [sofa])).toBeNull();
  });

  it('refuses a move that would cut a room off from the street door, and names the room', () => {
    // two leather sofas across the séjour from its west wall, then a hi-fi closing the last gap by the east wall
    const wall = [P('canape_cuir', -3.09, 1.675), P('canape_cuir', -0.49, 1.675)];
    expect(valid(F2, wall)).toBe(true);
    expect(reachable(F2_JAMM, obstaclesOf(wall)).ok).toBe(true);
    expect(whyNot(F2, spec('chaine_hifi'), at(1.27, 1.5), wall)).toBe('Ça bloquerait le passage vers la chambre');
    expect(reachable(F2_JAMM, obstaclesOf([...wall, P('chaine_hifi', 1.27, 1.5)])).rooms).toEqual(expect.arrayContaining(['cuisine', 'chambre', 'sdb']));
    // a plant in the gap blocks it too (it leaves less than a body's width); elsewhere in the séjour the same pieces are fine
    expect(whyNot(F2, spec('plante'), at(1.45, 1.5), wall)).toMatch(/^Ça bloquerait le passage vers /);
    expect(whyNot(F2, spec('chaine_hifi'), at(-2.0, 2.9, 2), wall)).toBeNull();
    // what was cut off before a piece is not that piece's doing: a piece elsewhere is not refused for it
    const closed = [...wall, P('chaine_hifi', 1.27, 1.5)];
    expect(whyNot(F2, spec('plante'), at(-3.0, 2.9), closed)).toBeNull();
  });

  it('pictures and mirrors hang against a wall, never over an opening or a window; hanging lamps go anywhere in a room', () => {
    const sofa = P('canape_wax', -1.35, 0.5);
    expect(whyNot(F2, spec('toile_artiste'), at(-1.35, 0.15, 0), [sofa])).toBeNull();                          // above the sofa, on the séjour's north wall
    expect(whyNot(F2, spec('toile_artiste'), at(-1.35, 1.5, 0), [])).toBe('À accrocher contre un mur');
    expect(whyNot(F2, spec('affiche'), at(0.5, 0.09, 0), [])).toBe('Pas devant le passage');                    // over the arch to the hall
    expect(whyNot(F2, spec('affiche'), at(-3.0, 3.37, 2), [])).toBe('Pas devant la fenêtre');                   // the séjour's south window
    expect(whyNot(F2, spec('miroir_sdb'), at(0.2, -3.36, 0), [])).toBe(WHY.window);                             // the bathroom's small window is above the basin
    expect(whyNot(F2, spec('miroir_sdb'), at(-0.9, -2.0, 1), [])).toBeNull();                                   // on its west wall
    expect(whyNot(F2, spec('armoire_toilette'), at(1.3, -3.315, 0), [])).toBe('Pas dans la douche');
    expect(whyNot(F2, spec('lustre'), at(-1.35, 1.7), [sofa])).toBeNull();
    expect(whyNot(F2, spec('suspension_osier'), at(-1.2, 1.6), [P('lustre', -1.35, 1.7)])).toBe(WHY.other);
    expect(whyNot(F2, spec('lustre'), at(-1.0, -1.0), [])).toBe(WHY.room);                                     // astride the bedroom's wall
    // brought flush against the nearest wall of the room where it is dropped
    const w = onWall(F2, spec('affiche'), -2.0, 0.4);
    expect(w).toEqual({ x: -2, z: 0.09, rot: 0 });
    expect(whyNot(F2, spec('affiche'), w, [])).toBeNull();
    expect(onWall(F2, spec('affiche'), -4.2, 1.6).rot).toBe(1);
    // a hung piece is no obstacle: nothing stands in its way and it blocks no one
    expect(whyNot(F2, spec('canape_wax'), at(-1.35, 0.5), [P('toile_artiste', -1.35, 0.15)])).toBeNull();
  });

  it('a hung piece is never hidden behind a tall one: refused behind an aquarium or a wardrobe, fine above a sofa or a console', () => {
    installFurnitureKit();
    // the séjour's north wall, x −1.35: the sunburst mirror (it hangs from about 1 m) and the reef tank (1.6 m) in front of it, either way round
    const mirror = onWall(F2, spec('miroir_soleil'), -1.35, 0.4), tank = P('aquarium_mer', -1.35, 0.35);
    expect(whyNot(F2, spec('miroir_soleil'), mirror, [])).toBeNull();
    expect(whyNot(F2, spec('miroir_soleil'), mirror, [tank])).toBe(WHY.hidden);
    expect(whyNot(F2, tank.spec, tank.at, [{ spec: spec('miroir_soleil'), at: mirror }])).toBe(WHY.hides);
    // a low piece below it is fine (a sofa, a console's top), and a tall piece beside it too
    expect(whyNot(F2, spec('miroir_soleil'), mirror, [P('canape_wax', -1.35, 0.5)])).toBeNull();
    expect(whyNot(F2, spec('miroir_soleil'), mirror, [P('aquarium_mer', -3.4, 0.35)])).toBeNull();
    expect(whyNot(F2, spec('toile_artiste'), at(-1.35, 0.15, 0), [P('armoire_bois', -1.35, 0.4)])).toBe(WHY.hidden);
    // the automatic placement never puts one behind the other
    const placed: Placed[] = [tank];
    const spot = autoPlace(F2, spec('miroir_soleil'), placed, { room: 'sejour' })!;
    expect(spot).not.toBeNull();
    expect(whyNot(F2, spec('miroir_soleil'), spot, placed)).toBeNull();
  });

  it('autoPlace chooses the room by the piece\'s kind, a good spot against a wall facing into it, else any room, else storage', () => {
    const kinds: [string, string][] = [['lit_bois', 'chambre'], ['armoire_bois', 'chambre'], ['coiffeuse', 'chambre'], ['chevet_bois', 'chambre'], ['canape_wax', 'sejour'],
      ['fauteuil_cuir', 'sejour'], ['table_basse', 'sejour'], ['tele_plate', 'sejour'], ['salle_manger_bois', 'sejour'], ['bibliotheque', 'sejour'], ['table_cuisine', 'cuisine'],
      ['micro_ondes', 'cuisine'], ['fontaine_eau', 'cuisine'], ['meuble_vasque', 'sdb'], ['porte_serviettes', 'sdb'], ['plante', 'sejour'], ['tapis_tisse', 'sejour'], ['affiche', 'sejour'], ['transat', 'sejour']];
    for (const [id, room] of kinds) {
      const a = autoPlace(F2, spec(id), [])!;
      expect(a, id).not.toBeNull();
      expect(roomOf(F2, a)?.id, id).toBe(room);
      expect(whyNot(F2, spec(id), a, []), id).toBeNull();
    }
    // against a wall, facing into the room: a bed's head to the wall
    const bed = autoPlace(F2, spec('lit_bois'), [])!, r = footprint(spec('lit_bois'), bed), ch = inner(F2_JAMM, F2_JAMM.rooms.find(x => x.id === 'chambre')!);
    expect([r.z0 - ch.z0, r.x0 - ch.x0, ch.z1 - r.z1, ch.x1 - r.x1][bed.rot]).toBeLessThan(0.011);
    // outdoor furniture by the séjour's window (the south wall)
    const lounger = autoPlace(F2, spec('transat'), [])!;
    expect(lounger.rot).toBe(2);
    // the room the placement mode shows comes first
    expect(roomOf(F2, autoPlace(F2, spec('plante'), [], { room: 'chambre' })!)?.id).toBe('chambre');
    expect(roomsFor(F2_JAMM, spec('lit_bois')).map(x => x.id).slice(0, 2)).toEqual(['chambre', 'sejour']);
    expect(roomKindOf(spec('ventilateur'))).toBe('chambre');
    // a second big bed does not fit the bedroom: it goes to another room; when nothing fits anywhere, it stays stored
    const king = autoPlace(F2, spec('lit_king'), [{ spec: spec('lit_bois'), at: bed }])!;
    expect(king).not.toBeNull(); expect(roomOf(F2, king)?.id).not.toBe('chambre');
    const full: Placed[] = [];
    for (let k = 0; k < 40; k++) { const a = autoPlace(F2, spec('lit_king'), full); if (!a) break; full.push({ spec: spec('lit_king'), at: a }); }
    expect(full.length).toBeGreaterThan(1); expect(full.length).toBeLessThan(10);
    expect(autoPlace(F2, spec('lit_king'), full)).toBeNull();
    expect(valid(F2, full)).toBe(true);
    expect(reachable(F2_JAMM, obstaclesOf(full)).ok).toBe(true);
  });

  it('a whole flat furnished automatically is valid and every room stays reachable', () => {
    const ids = ['canape_wax', 'table_manger', 'tele_plate', 'lit_bois', 'armoire_bois', 'tapis_tisse', 'salle_manger_bois', 'meuble_vasque', 'micro_ondes', 'table_cuisine',
      'bureau_bois', 'affiche', 'suspension_calebasse', 'transat', 'chevet_bois', 'miroir_sdb', 'canari', 'plante', 'lampadaire_trepied'];
    const placed: Placed[] = [];
    for (const id of ids) { const a = autoPlace(F2, spec(id), placed); if (a) placed.push({ spec: spec(id), at: a }); }
    expect(placed.length).toBeGreaterThanOrEqual(ids.length - 1);
    expect(valid(F2, placed)).toBe(true);
    expect(reachable(F2_JAMM, obstaclesOf(placed)).ok).toBe(true);
    for (const p of placed) expect(roomAt(F2_JAMM, p.at.x, p.at.z), p.spec.id).not.toBeNull();
  });

  it('the other homes keep today\'s rules (LD2.0-D: the Almadies villa has its plan now, tests/villaFurnish.test.ts; the Ngor residence keeps its room)', () => {
    const open = openPlan('apartment', 8, 6.5), residence = layoutOf(homeSpec('residence_ngor')!);
    expect(whyNot(open, spec('canape_wax'), at(3.5, 0), [])).toBe('Contre le mur');
    expect(whyNot(open, spec('canape_wax'), at(0, 1), [])).toBeNull();
    expect(residence.plan).toBeUndefined();
    expect(autoPlace(residence, spec('canape_wax'), [])).toEqual({ x: 0, z: -5.57, rot: 0 });
    // a picture hangs on a wall of a one-room home too
    expect(whyNot(residence, spec('affiche'), at(2, -5.98, 0), [])).toBeNull();
    expect(whyNot(residence, spec('affiche'), at(2, 0, 0), [])).toBe('À accrocher contre un mur');
  });
});

describe('a save from before the plan: the F2\'s furniture is kept, and re-checked', () => {
  /** An F2 furnished under the old rules (the open room of 8 × 6.5 m), as a v6 save from before LD2.0-C held it. */
  function oldSave() {
    const old = openPlan('apartment', 8, 6.5), placed: Placed[] = [], pieces: { spec: string; at: Placement }[] = [];
    for (const id of ['lit_bois', 'canape_wax', 'table_manger', 'armoire_bois', 'tapis_tisse']) {
      const a = autoPlace(old, spec(id), placed)!; placed.push({ spec: spec(id), at: a }); pieces.push({ spec: id, at: a });
    }
    const d = newSave();
    d.wallet = 777_000;
    d.assets.list.push({ uid: 'a90', spec: 'appart_jamm', how: 'owned', since: 0, paid: 15_000_000, condition: 100, upgrades: [], leased: false });
    pieces.forEach((p, k) => d.assets.list.push({ uid: `a${91 + k}`, spec: p.spec, how: 'owned', since: 0, paid: spec(p.spec).price!, condition: 100, upgrades: [], leased: false, home: 'a90', at: p.at }));
    d.assets.home = 'a90'; d.assets.seq = 96;
    return { json: JSON.parse(serialize(d)), pieces };
  }
  const load = (json: unknown) => { const s = new GameState(migrate(json)!); normalize(s); return s; };
  const layoutNow = (s: GameState) => furnitureIn(s, 'a90').map(f => ({ uid: f.uid, spec: f.spec, at: f.at }));

  it('an old F2 with a bed, a sofa, a table, a wardrobe and a rug loads with all five kept and valid, nothing charged', () => {
    const { json, pieces } = oldSave();
    // under the plan, the old spots are not all valid (the old room had no inner walls)
    const asPlaced = pieces.map(p => ({ spec: spec(p.spec), at: p.at }));
    expect(valid(F2, asPlaced)).toBe(false);
    const s = load(json);
    const now = layoutNow(s);
    expect(now.map(f => f.spec)).toEqual(['lit_bois', 'canape_wax', 'table_manger', 'armoire_bois', 'tapis_tisse']);
    expect(now.every(f => !!f.at)).toBe(true);                                                     // all five set up, none stored
    const placed = now.map(f => ({ spec: spec(f.spec), at: f.at! }));
    expect(valid(F2, placed)).toBe(true);
    expect(reachable(F2_JAMM, obstaclesOf(placed)).ok).toBe(true);
    // the pieces the plan refuses are moved to a room of their kind; a piece still valid where it stood (the wardrobe, against the séjour's west wall) stays
    expect(roomOf(F2, now.find(f => f.spec === 'lit_bois')!.at!)?.id).toBe('chambre');
    expect(roomOf(F2, now.find(f => f.spec === 'canape_wax')!.at!)?.id).toBe('sejour');
    const wardrobe = pieces.find(p => p.spec === 'armoire_bois')!;
    expect(whyNot(F2, spec('armoire_bois'), wardrobe.at, [])).toBeNull();
    expect(now.find(f => f.spec === 'armoire_bois')!.at).toEqual(wardrobe.at);
    expect(s.wallet).toBe(777_000);                                                                // never charged
    expect(s.data.assets.list.filter(a => a.home === 'a90')).toHaveLength(5);                      // never lost
  });

  it('the same reload twice gives the same layout; a valid piece keeps its spot', () => {
    const { json } = oldSave();
    const a = load(json), first = layoutNow(a);
    const b = load(JSON.parse(serialize(a.data))), second = layoutNow(b);
    expect(second).toEqual(first);
    const c = load(json);
    expect(layoutNow(c)).toEqual(first);
    // a piece already valid under the plan is never moved
    const { json: j2 } = oldSave();
    const rug = (j2 as { assets: { list: { spec: string; at?: Placement }[] } }).assets.list.find(x => x.spec === 'tapis_tisse')!;
    rug.at = { x: -1.35, z: 1.73, rot: 0 };
    expect(layoutNow(load(j2)).find(f => f.spec === 'tapis_tisse')!.at).toEqual({ x: -1.35, z: 1.73, rot: 0 });
  });

  it('relayout keeps valid pieces, moves the others by kind, stores what fits nowhere', () => {
    const out = relayout(F2, [
      { spec: spec('lit_bois'), at: at(-2.73, -2.3, 0) },                                         // valid: kept
      { spec: spec('armoire_bois'), at: at(0.5, 0, 0) },                                          // across the arch: moved to the bedroom
      { spec: spec('canape_wax'), at: null },                                                     // stored: stays stored unless asked
    ]);
    expect(out[0]).toEqual(at(-2.73, -2.3, 0));
    expect(roomOf(F2, out[1]!)?.id).toBe('chambre');
    expect(out[2]).toBeNull();
    expect(roomOf(F2, relayout(F2, [{ spec: spec('canape_wax'), at: null }], { placeStored: true })[0]!)?.id).toBe('sejour');
  });

  it('a piece delivered to the F2 goes to the room of its kind; moving into the F2 brings the furniture along, set up by room', () => {
    const s = new GameState(newSave(0)); s.data.wallet = 50_000_000;
    rentAsset(s, 'appart_jamm');
    for (const id of ['canape_wax', 'lit_bois']) deliverFurniture(s, id);                           // still at the starter room
    const appart = s.data.assets.list.find(a => a.spec === 'appart_jamm')!;
    moveIn(s, appart.uid, true);
    expect(currentHome(s).spec).toBe('appart_jamm');
    const L = layoutOf(homeSpec('appart_jamm')!), here = furnitureIn(s, appart.uid);
    expect(roomOf(L, here.find(f => f.spec === 'lit_bois')!.at!)?.id).toBe('chambre');
    expect(roomOf(L, here.find(f => f.spec === 'canape_wax')!.at!)?.id).toBe('sejour');
    const tv = deliverFurniture(s, 'tele_plate')!;
    expect(roomOf(L, tv.at!)?.id).toBe('sejour');
    const before = JSON.stringify(furnitureIn(s, appart.uid));
    settleFurniture(s, appart.uid);
    expect(JSON.stringify(furnitureIn(s, appart.uid))).toBe(before);                               // settling again changes nothing
  });
});

describe('the furnishing upgrade: every piece has a real model', () => {
  installFurnitureKit();
  const meshes = (o: THREE.Object3D) => { const out: THREE.Mesh[] = []; o.traverse(x => { if ((x as THREE.Mesh).isMesh) out.push(x as THREE.Mesh); }); return out; };

  it('every FURNITURE_SPECS id has a kit model of one draw call (two with glass), its size matching the footprint', () => {
    for (const f of FURNITURE_SPECS) {
      expect(KIT_PIECES[f.id], f.id).toBeDefined();
      const g = furnitureModel(f); g.updateMatrixWorld(true);
      expect(g.name, f.id).toBe(`kit_${f.id}`);
      const m = meshes(g), kits = Array.isArray(KIT_PIECES[f.id]) ? (KIT_PIECES[f.id] as unknown[]).length : 1;
      expect(m.length, f.id).toBeLessThanOrEqual(2 * kits);
      expect(m.filter(x => !(x.material as THREE.Material).transparent).length, f.id).toBe(kits);   // one opaque mesh per kit piece; the other, glass
      const box = new THREE.Box3().setFromObject(g), w = box.max.x - box.min.x, d = box.max.z - box.min.z;
      // never bigger than its footprint (2 cm a side), and filling it: a floor piece covers most of it, a picture spans its width
      expect(box.max.x, f.id).toBeLessThanOrEqual(f.w / 2 + 0.02); expect(-box.min.x, f.id).toBeLessThanOrEqual(f.w / 2 + 0.02);
      expect(box.max.z, f.id).toBeLessThanOrEqual(f.d / 2 + 0.02); expect(-box.min.z, f.id).toBeLessThanOrEqual(f.d / 2 + 0.02);
      if (f.mount === 'wall') expect(w / f.w, f.id).toBeGreaterThan(0.9);
      else { expect(Math.max(w / f.w, d / f.d), f.id).toBeGreaterThan(0.75); expect((w * d) / (f.w * f.d), f.id).toBeGreaterThan(0.6); }
      expect(box.min.y, f.id).toBeGreaterThanOrEqual(-0.01);
      if (f.mount === 'ceiling') expect(box.max.y, f.id).toBeGreaterThan(2.7);
      if (f.mount === 'wall') expect(box.min.y, f.id).toBeGreaterThan(0.4);
    }
  });

  it('the premium pieces that were boxes are real models now: the speakers, the carved planter, the dressing', () => {
    for (const [id, kid] of [['enceintes', 'audio:premium'], ['jardiniere', 'plant:premium'], ['dressing', 'closet:premium']] as const) {
      expect(KIT_PIECES[id]).toBe(kid);
      const k = buildFurniture(kid).spec;
      expect(k.budget.drawCalls).toBe(1); expect(k.budget.tris, id).toBeGreaterThan(400);
    }
  });

  it('the new pieces: three grades of each kind, new ids, a room each, seats where the kit has them', () => {
    const added = FURNITURE_SPECS.slice(FURNITURE_SPECS.findIndex(f => f.id === 'salle_manger_simple'));
    expect(added.length).toBeGreaterThanOrEqual(50);
    const types = new Set(added.map(f => f.type));
    for (const t of ['dining', 'appliance', 'bath', 'decor', 'shelf', 'outdoor'] as const) {
      expect(types.has(t)).toBe(true);
      expect(new Set(FURNITURE_SPECS.filter(f => f.type === t).map(f => f.grade))).toEqual(new Set(['basic', 'better', 'premium']));
    }
    // the brief's list: a dining set, a bathroom cabinet with basin, a mirror and a towel rail, kitchen pieces, a floor and a hanging lamp, wall art, a TV wall unit, outdoor
    for (const id of ['salle_manger_bois', 'meuble_vasque', 'miroir_sdb', 'porte_serviettes', 'table_cuisine', 'micro_ondes', 'fontaine_eau', 'lampadaire_trepied', 'suspension_calebasse',
      'sous_verre', 'meuble_tv', 'transat', 'parasol', 'salon_jardin']) expect(furnitureSpec(id), id).toBeDefined();
    for (const f of added) {
      expect(f.id).toMatch(/^[a-z][a-z0-9_]{0,31}$/);
      expect(roomKindOf(f), f.id).toBeTruthy();
      expect(f.price!, f.id).toBeGreaterThan(0);
      const kid = KIT_PIECES[f.id] as FurnitureId, k = buildFurniture(kid).spec;
      // the footprint is the kit model's (no squeeze), and the seats are the kit's (the sitting pose matches the model)
      expect([f.w, f.d], f.id).toEqual([k.footprint.w, k.footprint.d]);
      expect((f.seats ?? []).length, f.id).toBe(k.seats.length);
      (f.seats ?? []).forEach((st, i) => { const ks = k.seats[i]; expect(Math.hypot(st.x - ks.x, st.z - ks.z), f.id).toBeLessThan(0.02); expect(st.top, f.id).toBeCloseTo(ks.top + 0.1, 2); expect(st.kind).toBe(ks.kind); });
    }
    // prices sit inside their grades
    const grade = (g: FurnitureSpec['grade']) => added.filter(f => f.grade === g).map(f => f.price!);
    expect(Math.max(...grade('basic'))).toBeLessThan(60_000);
    expect(Math.min(...grade('premium'))).toBeGreaterThan(80_000);
  });

  it('the ids already sold are all still there', () => {
    for (const id of ['miroir', 'tapis', 'chaises', 'radio', 'matelas', 'tele', 'chaise_plastique', 'chaise_bois', 'fauteuil_cuir', 'banquette', 'canape_wax', 'canape_cuir',
      'matelas_sol', 'lit_bois', 'lit_king', 'table_basse', 'table_manger', 'table_marbre', 'tele_plate', 'home_cinema', 'chaine_hifi', 'enceintes', 'tapis_tisse', 'tapis_soie',
      'coiffeuse', 'miroir_dore', 'plante', 'palmier', 'jardiniere', 'bureau_simple', 'bureau_bois', 'bureau_direction', 'rechaud', 'cuisiniere', 'cuisine_equipee', 'lampe',
      'lampadaire', 'lampadaire_laiton', 'armoire_metal', 'armoire_bois', 'dressing']) expect(furnitureSpec(id), id).toBeDefined();
    expect(new Set(FURNITURE_SPECS.map(f => f.id)).size).toBe(FURNITURE_SPECS.length);
  });
});
