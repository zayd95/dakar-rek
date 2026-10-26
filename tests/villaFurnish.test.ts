import { describe, expect, it } from 'vitest';
import { furnitureSpec, homeSpec, type FurnitureSpec } from '../src/economy/catalog';
import {
  WHY, autoPlace, footprint, fromHome, homeLevels, inHome, layoutOf, levelFrame, levelOfAt, onWall, openPlan, planRooms, relayout, roomFrame, roomOf, whyNot, type Placed,
} from '../src/economy/placement';
import { VILLA_PLAN as V } from '../src/housing/villaPlan';
import { reachable } from '../src/housing/plan';
import { GameState } from '../src/core/state';
import { migrate, newSave } from '../src/core/save';
import { furnitureIn, normalize } from '../src/economy/assets';
import { installFurnitureKit } from '../src/economy/furnitureKitAdapter';
import type { Placement } from '../src/core/types';
import { STOREY } from '../src/housing/villa';
import { VILLA_ALMADIES_LAYOUT } from '../src/housing/villaLayout';

/**
 * LD2.0-D lane V-S: furnishing the villa on its three levels (src/economy/placement.ts on the villa's plan): the editor's rooms, the automatic
 * placement by kind across the levels, the plan's refusals on stairs, wells, the pool and the helipad, and an older save's villa (its one open room)
 * re-checked on load with every piece kept (src/economy/assets.ts settleFurniture).
 */
installFurnitureKit();
const L = layoutOf(homeSpec('villa_almadies')!);
const spec = (id: string) => furnitureSpec(id)!;
const at = (x: number, z: number, rot = 0): Placement => ({ x, z, rot });
const P = (id: string, x: number, z: number, rot = 0): Placed => ({ spec: spec(id), at: at(x, z, rot) });
const valid = (pieces: Placed[]) => pieces.every((p, k) => whyNot(L, p.spec, p.at, pieces.filter((_, j) => j !== k)) === null);
const obstaclesOf = (pieces: Placed[]) => pieces.filter(p => !p.spec.flat && !p.spec.mount).map(p => footprint(p.spec, p.at));
const levelOf = (a: Placement) => levelOfAt(L, a);

describe('the villa is furnished room by room, on its three levels', () => {
  it('its rooms are the editor\'s chips, level by level (the halls and the stairs left out)', () => {
    expect(L.plan).toBe(V);
    expect(homeLevels(L).map(l => l.id)).toEqual(['rdc', 'etage', 'toit']);
    const chips = planRooms(L).map(r => r.id);
    expect(chips).not.toContain('couloir'); expect(chips).not.toContain('hall'); expect(chips).not.toContain('palier'); expect(chips).not.toContain('edicule');
    expect(chips).toEqual(expect.arrayContaining(['salon', 'manger', 'cuisine', 'bureau', 'sde', 'jardin', 'suite', 'dressing', 'bain', 'chambre2', 'chambre3', 'salon_familial', 'sdb', 'balcon_rue', 'balcon_piscine', 'terrasse', 'terrasse_rue']));
    // a room's frame is in the home's frame, at its level's height
    expect(roomFrame(L, 'suite')).toMatchObject({ level: 'etage', y: STOREY });
    expect(roomFrame(L, 'suite')!.x).toBeLessThan(0);
    expect(levelFrame(L, 'toit')).toMatchObject({ y: 2 * STOREY, x: 0 });
  });

  it('a placement stands on its level: plan space and the home\'s frame, both ways', () => {
    expect(inHome(L, 21.5, -3)).toMatchObject({ x: 1.5, y: STOREY, z: -3, level: 'etage' });
    expect(inHome(L, -22, 1)).toMatchObject({ x: -2, y: 2 * STOREY, level: 'toit' });
    expect(fromHome(L, 1.5, -3, STOREY)).toEqual({ x: 21.5, z: -3 });
    expect(fromHome(L, 1.5, -3, 0.1)).toEqual({ x: 1.5, z: -3 });
    expect(inHome(layoutOf(homeSpec('appart_jamm')!), 1, 2)).toEqual({ x: 1, y: 0, z: 2, level: '' });
  });

  it('autoPlace chooses the room by the piece\'s kind across the levels: a bed upstairs, a sofa in the grand salon, loungers by the pool', () => {
    const kinds: [string, string][] = [
      ['lit_bois', 'suite'], ['armoire_bois', 'suite'], ['canape_wax', 'salon'], ['tele_plate', 'salon'], ['salle_manger_bois', 'manger'], ['bureau_bois', 'bureau'],
      ['transat', 'jardin'], ['parasol', 'jardin'], ['salon_jardin', 'jardin'], ['table_cuisine', 'cuisine'], ['meuble_vasque', 'sde'], ['console_bois', 'entree'],
    ];
    for (const [id, room] of kinds) {
      const a = autoPlace(L, spec(id), [])!;
      expect(a, id).not.toBeNull();
      expect(roomOf(L, a)?.id, id).toBe(room);
      expect(whyNot(L, spec(id), a, []), id).toBeNull();
      expect(Math.abs(a.x), id).toBeLessThanOrEqual(30); expect(Math.abs(a.z), id).toBeLessThanOrEqual(30);
    }
    expect(levelOf(autoPlace(L, spec('lit_bois'), [])!)).toBe('etage');
    // the level in view (the editor) comes first: a plant upstairs, a lounger on the roof
    expect(levelOf(autoPlace(L, spec('plante'), [], { level: 'etage' })!)).toBe('etage');
    expect(levelOf(autoPlace(L, spec('transat'), [], { level: 'toit' })!)).toBe('toit');
    // a second and a third bed go to the other bedrooms
    const placed: Placed[] = [];
    for (let k = 0; k < 3; k++) { const a = autoPlace(L, spec('lit_king'), placed)!; placed.push({ spec: spec('lit_king'), at: a }); }
    expect(new Set(placed.map(p => roomOf(L, p.at)?.id))).toEqual(new Set(['suite', 'chambre2', 'chambre3']));
  });

  it('refuses the stairs, the wells, the pool and the helipad, a hanging lamp outdoors, a picture on a railing, and says why', () => {
    expect(whyNot(L, spec('plante'), at(5.2, -1), [])).toBe(WHY.stair);
    expect(whyNot(L, spec('plante'), at(25.2, -1), [])).toBe(WHY.stair);
    expect(whyNot(L, spec('plante'), at(5.2, -3.3), [])).toBe(WHY.passage);                  // at the foot of the stairs
    expect(whyNot(L, spec('transat'), at(-1, -8), [])).toBe('Pas dans la piscine');
    expect(whyNot(L, spec('transat'), at(-25.5, 0.5), [])).toBe(WHY.helipad);
    expect(whyNot(L, spec('transat'), at(-23, 0), [])).toBe('Pas sur l’hélicoptère');
    expect(whyNot(L, spec('lustre'), at(-2, -8.8), [])).toBe(WHY.noCeiling);
    expect(whyNot(L, spec('lustre'), at(-4, -2.5), [])).toBeNull();
    // a picture against the house's wall on the balcony is fine; against its glass railing, never
    const onHouse = onWall(L, spec('affiche'), 14.9, 4.2);
    expect(whyNot(L, spec('affiche'), onWall(L, spec('affiche'), 17.5, 4.2), [])).toBe('Pas devant la porte');
    expect(whyNot(L, spec('affiche'), onHouse, [])).toBeNull();
    const onRail = { x: 15, z: Math.floor((5.4 - 0.125 - spec('affiche').d / 2) * 100) / 100, rot: 2 };
    expect(whyNot(L, spec('affiche'), onRail, [])).toBe(WHY.onWall);
    // a wardrobe across the foot of the stairs would cut off the first floor and the roof
    const why = whyNot(L, spec('armoire_bois'), at(6.6, -3.6), [P('armoire_bois', 5.0, -4.4)]);
    expect(why ?? '').toMatch(/^Ça bloquerait le passage vers /);
  });

  it('a whole villa furnished automatically is valid, every room of every level still reachable', () => {
    const ids = ['canape_cuir', 'table_basse', 'tele_plate', 'salle_manger_bois', 'table_cuisine', 'bureau_bois', 'lit_king', 'armoire_bois', 'lit_bois', 'lit_bois', 'coiffeuse',
      'canape_wax', 'fauteuil_cuir', 'meuble_vasque', 'miroir_sdb', 'transat', 'transat', 'parasol', 'salon_jardin', 'transat', 'plante', 'palmier', 'tapis_soie', 'lustre', 'affiche', 'console_bois'];
    const placed: Placed[] = [];
    for (const id of ids) { const a = autoPlace(L, spec(id), placed); if (a) placed.push({ spec: spec(id), at: a }); }
    for (const id of ['transat', 'parasol', 'transat']) { const a = autoPlace(L, spec(id), placed, { level: 'toit' }); if (a) placed.push({ spec: spec(id), at: a }); }   // the roof terrace, from the editor
    expect(placed.length).toBe(ids.length + 3);
    expect(valid(placed)).toBe(true);
    expect(reachable(V, obstaclesOf(placed)).ok).toBe(true);
    expect(new Set(placed.map(p => levelOf(p.at)))).toEqual(new Set(['rdc', 'etage', 'toit']));
    for (const p of placed) { expect(roomOf(L, p.at), p.spec.id).not.toBeNull(); expect(Math.abs(p.at.x)).toBeLessThanOrEqual(30); }
  });
});

describe('the villa takes the large pieces of the luxury line (lane K-L), at their sizes', () => {
  // stand-ins of their footprints (the line's own entries come with lane K-L): a curved sofa, a chaise sectional, a round table for four with its chairs,
  // a king bed, a tall wardrobe, a ring chandelier (made to hang from a 3 m ceiling: the villa's rooms are 3 m under the ceiling)
  const big = (id: string, type: FurnitureSpec['type'], w: number, d: number, more: Partial<FurnitureSpec> = {}): FurnitureSpec => ({ ...spec('canape_wax'), id, type, w, d, seats: [], use: undefined, room: undefined, ...more });
  const curved = big('kl_curved_sofa', 'sofa', 3.4, 1.3), sectional = big('kl_chaise_sectional', 'sofa', 2.8, 1.6), dining = big('kl_round_dining', 'dining', 2.3, 2.3);
  const king = big('kl_king_bed', 'bed', 2.0, 2.25), wardrobe = big('kl_wardrobe', 'wardrobe', 2.0, 0.6), ring = big('kl_ring_chandelier', 'lamp', 1.1, 1.1, { mount: 'ceiling' });
  it('the villa\'s ceiling is 3 m above every floor', () => {
    expect(V.wallH).toBe(3.0);
  });
  it('each goes to a room of its kind, valid, every room still reachable', () => {
    for (const [f, rooms] of [[curved, ['salon']], [sectional, ['salon']], [dining, ['manger']], [king, ['suite']], [wardrobe, ['suite']], [ring, ['salon']]] as const) {
      const a = autoPlace(L, f, [])!;
      expect(a, f.id).not.toBeNull();
      expect(rooms, f.id).toContain(roomOf(L, a)?.id);
      expect(whyNot(L, f, a, []), f.id).toBeNull();
    }
  });
  it('a whole luxury villa: the curved sofa and the sectional in the two lounges, the table in the dining room, a king bed and a wardrobe in each bedroom, a chandelier in each lounge', () => {
    const placed: Placed[] = [];
    const put = (f: FurnitureSpec, o: { room?: string; level?: string } = {}) => { const a = autoPlace(L, f, placed, o); expect(a, f.id).not.toBeNull(); placed.push({ spec: f, at: a! }); return roomOf(L, a!)?.id; };
    expect(put(curved)).toBe('salon');
    expect(put(sectional, { room: 'salon_familial' })).toBe('salon_familial');
    expect(put(dining)).toBe('manger');
    expect([put(king), put(king), put(king)].sort()).toEqual(['chambre2', 'chambre3', 'suite']);
    expect([put(wardrobe), put(wardrobe, { room: 'chambre2' }), put(wardrobe, { room: 'chambre3' })]).toEqual(['suite', 'chambre2', 'chambre3']);
    expect(put(ring)).toBe('salon');
    expect(put(ring, { room: 'salon_familial' })).toBe('salon_familial');
    expect(valid(placed)).toBe(true);
    expect(reachable(V, obstaclesOf(placed)).ok).toBe(true);
  });
});

describe('an older save\'s villa (its one open room): every piece kept, re-checked against the plan', () => {
  /** A villa furnished under the old rules (the open room of 14 × 10 m), as a save from before LD2.0-D held it. */
  function oldSave() {
    const old = openPlan('villa', 14, 10), placed: Placed[] = [], pieces: { spec: string; at: Placement }[] = [];
    for (const id of ['lit_king', 'canape_cuir', 'table_marbre', 'armoire_bois', 'tapis_soie', 'tele_plate', 'transat', 'bureau_direction', 'salle_manger_bois', 'plante']) {
      const a = autoPlace(old, spec(id), placed)!; placed.push({ spec: spec(id), at: a }); pieces.push({ spec: id, at: a });
    }
    const d = newSave();
    d.wallet = 1_234_000;
    d.assets.list.push({ uid: 'a80', spec: 'villa_almadies', how: 'owned', since: 0, paid: 400_000_000, condition: 100, upgrades: [], leased: false });
    pieces.forEach((p, k) => d.assets.list.push({ uid: `a${81 + k}`, spec: p.spec, how: 'owned', since: 0, paid: spec(p.spec).price!, condition: 100, upgrades: [], leased: false, home: 'a80', at: p.at }));
    d.assets.home = 'a80'; d.assets.seq = 95;
    return { json: JSON.parse(JSON.stringify(d)), pieces };
  }
  const load = (json: unknown) => { const s = new GameState(migrate(json)!); normalize(s); return s; };
  const layoutNow = (s: GameState) => furnitureIn(s, 'a80').map(f => ({ uid: f.uid, spec: f.spec, at: f.at }));

  it('loads with all its pieces kept, set up and valid, every room reachable, nothing charged; the bed goes upstairs', () => {
    const { json, pieces } = oldSave();
    expect(valid(pieces.map(p => ({ spec: spec(p.spec), at: p.at })))).toBe(false);                 // the old room had no walls inside
    const s = load(json), now = layoutNow(s);
    expect(now.map(f => f.spec)).toEqual(pieces.map(p => p.spec));
    expect(now.every(f => !!f.at)).toBe(true);
    const placed = now.map(f => ({ spec: spec(f.spec), at: f.at! }));
    expect(valid(placed)).toBe(true);
    expect(reachable(V, obstaclesOf(placed)).ok).toBe(true);
    expect(s.wallet).toBe(1_234_000);
    expect(s.data.assets.list.filter(a => a.home === 'a80')).toHaveLength(pieces.length);
    // the pieces the plan refused were moved to a room of their kind
    const moved = now.filter((f, k) => JSON.stringify(f.at) !== JSON.stringify(pieces[k].at));
    expect(moved.length).toBeGreaterThan(0);
    const roomOfSpec = (id: string) => roomOf(L, now.find(f => f.spec === id)!.at!)?.kind;
    if (moved.some(f => f.spec === 'lit_king')) expect(roomOfSpec('lit_king')).toBe('chambre');
    if (moved.some(f => f.spec === 'transat')) expect(['terrasse', 'balcon']).toContain(roomOfSpec('transat'));
    for (const f of now) expect(Math.abs(f.at!.x)).toBeLessThanOrEqual(30);
  });

  it('the same reload twice gives the same layout', () => {
    const { json } = oldSave();
    const a = load(json), first = layoutNow(a);
    const b = load(JSON.parse(JSON.stringify(a.data)));
    expect(layoutNow(b)).toEqual(first);
    expect(layoutNow(load(json))).toEqual(first);
  });

  it('relayout keeps a valid piece upstairs where it is', () => {
    const bed = autoPlace(L, spec('lit_bois'), [])!;
    const out = relayout(L, [{ spec: spec('lit_bois'), at: bed }, { spec: spec('canape_wax'), at: at(5.2, -1) }]);
    expect(out[0]).toEqual(bed);
    expect(roomOf(L, out[1]!)?.kind).toBe('sejour');
  });
});

describe('the villa furnished with the « Collection Almadies » (the look pass: src/housing/villaLayout.ts, the owner\'s showcase can reuse it)', () => {
  const laid = VILLA_ALMADIES_LAYOUT;
  it('each piece valid at its spot beside those before it, in the room the list says, every room still reachable', () => {
    const placed: Placed[] = [];
    for (const p of laid) {
      const f = spec(p.spec), a = at(p.x, p.z, p.rot);
      expect(whyNot(L, f, a, placed), `${p.spec} in ${p.room}`).toBeNull();
      expect(roomOf(L, a)?.id, p.spec).toBe(p.room);
      placed.push({ spec: f, at: a });
    }
    expect(valid(placed)).toBe(true);
    expect(reachable(V, obstaclesOf(placed)).ok).toBe(true);
    for (const p of laid) expect(Math.abs(p.x)).toBeLessThanOrEqual(30);
  });
  it('the line\'s pieces K-L suggested for each room, the ring chandeliers over the lounge and the dining table, the teak outside', () => {
    const inRoom = (room: string) => laid.filter(p => p.room === room).map(p => p.spec);
    expect(inRoom('salon')).toEqual(expect.arrayContaining(['canape_courbe', 'table_basse_marbre_noir', 'tapis_rond_jute', 'fauteuil_boucle', 'gueridon_marbre', 'lampadaire_champignon', 'lustre_couronne']));
    expect(inRoom('salon').filter(id => id === 'fauteuil_boucle')).toHaveLength(2);
    expect(inRoom('manger')).toEqual(expect.arrayContaining(['salle_manger_ronde', 'lustre_couronne', 'enfilade_bronze']));
    expect(inRoom('suite')).toEqual(expect.arrayContaining(['lit_capitonne_noir', 'chevet_greige', 'banc_lit', 'dressing_bronze', 'miroir_ovale']));
    expect(inRoom('suite').filter(id => id === 'chevet_greige')).toHaveLength(2);
    expect(inRoom('bureau')).toEqual(expect.arrayContaining(['bureau_caisson', 'bibliotheque_bronze']));
    expect(inRoom('chambre2')).toEqual(expect.arrayContaining(['lit_lin_greige', 'chevet_noyer', 'chiffonnier_noyer']));
    expect(inRoom('salon_familial')).toEqual(expect.arrayContaining(['meuble_tv_laque', 'bibliotheque_noyer', 'lampadaire_arc_plisse']));
    expect(laid.map(p => p.spec)).toEqual(expect.arrayContaining(['coiffeuse_ronde', 'commode_six', 'pot_cannele']));
    // indoors, every piece is of the line; outdoors, the premium teak
    for (const p of laid) expect(V.rooms.find(r => r.id === p.room)!.outdoor ? spec(p.spec).type : spec(p.spec).line, p.spec).toBe(V.rooms.find(r => r.id === p.room)!.outdoor ? 'outdoor' : 'almadies');
  });
});
