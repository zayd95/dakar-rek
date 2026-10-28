import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildHomeInterior } from '../src/economy/homeInterior';
import { HOMES } from '../src/economy/catalog';
import { IDENTITIES, IDENTITY_IDS, TEMPLATES, TEMPLATE_IDS, homeSpecFromTemplate, instantiate, mirrorPlan, type TemplateId } from '../src/housing/kit';
import { planFor, roomAt, type FloorPlan } from '../src/housing/plan';
import { layoutOf, roomsFor } from '../src/economy/placement';
import { furnitureSpec } from '../src/economy/catalog';
import { planProblems, livingArea } from './helpers/planChecks';

/**
 * The home kit (src/housing/kit, docs/kits/HOMES.md): « no home is one open room but Ma chambre », every template valid under every identity and both ways round, built
 * by the shell within its draw calls, and listed as a catalogue home a hub can use.
 */
const ctx2d: object = new Proxy(function () { /* stub */ }, { get: () => ctx2d, apply: () => ctx2d, set: () => true });
beforeAll(() => {
  const canvas = () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d, addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal('document', { createElement: canvas, createElementNS: canvas });
});
afterAll(() => { vi.unstubAllGlobals(); });

describe('every home of the catalogue but « Ma chambre » is a floor plan', () => {
  it('has a plan with a room to live in, a bathroom and a kitchen or a kitchenette', () => {
    const homes = HOMES.filter(h => h.home.level !== 'room');
    expect(homes.map(h => h.id)).toEqual(['appart_jamm', 'maison_cite', 'villa_almadies', 'residence_ngor']);
    for (const h of homes) {
      const p = planFor(h.id)!; expect(p, h.id).toBeTruthy();
      const kinds = new Set(p.rooms.map(r => r.kind));
      expect(kinds.has('sejour') || kinds.has('chambre'), `${h.id}: a room to live in`).toBe(true);
      expect(kinds.has('sdb'), `${h.id}: a bathroom`).toBe(true);
      expect(p.fixtures.some(f => f.kind === 'sink') && p.fixtures.some(f => f.kind === 'stove' || f.kind === 'counter'), `${h.id}: a kitchen or a kitchenette`).toBe(true);
      expect(layoutOf(h).plan, h.id).toBe(p);
    }
  });
  it('« Ma chambre » is the one home that keeps its single room', () => {
    expect(HOMES[0].home.level).toBe('room');
    expect(HOMES.filter(h => !planFor(h.id)).map(h => h.id)).toEqual([HOMES[0].id]);
  });
});

describe('the Ngor residence', () => {
  const p = planFor('residence_ngor')!;
  it('is a whole floor: reception, kitchen, dining room, a master suite with its dressing and bathroom, a second bedroom and bathroom, the sea terrace', () => {
    expect(new Set(p.rooms.map(r => r.id))).toEqual(new Set(['suite', 'dressing', 'bain', 'salon', 'chambre2', 'galerie', 'cuisine', 'manger', 'entree', 'bain2', 'terrasse']));
    expect(livingArea(p)).toBeCloseTo(22 * 15, 6);
    expect(p.rooms.find(r => r.id === 'terrasse')!.outdoor).toBe(true);
    expect(p.noLot).toBe(true);
  });
  it('passes the plan checks', () => { expect(planProblems(p)).toEqual([]); });
});

const MIN_BY_TEMPLATE: Partial<Record<TemplateId, Record<string, number>>> = {};
describe('the templates', () => {
  for (const t of TEMPLATE_IDS) for (const identity of [undefined, ...IDENTITY_IDS]) for (const mirror of [false, true]) {
    it(`${t}${identity ? ` · ${identity}` : ''}${mirror ? ' · mirrored' : ''}: a valid plan`, () => {
      const p = instantiate(t, { id: `kit_${t}`, identity, mirror });
      expect(planProblems(p, MIN_BY_TEMPLATE[t]), `${t}`).toEqual([]);
      expect(p.id).toBe(`kit_${t}`);
      expect(Math.abs(livingArea(p) - TEMPLATES[t].area)).toBeLessThan(1e-6);
    });
  }
  it('are the ladder: mini-studio, studio, F2, F3, house, villa, residence, each bigger than the last', () => {
    expect(TEMPLATE_IDS).toEqual(['mini_studio', 'studio', 'f2', 'f3', 'house', 'villa', 'residence']);
    const areas = TEMPLATE_IDS.map(t => TEMPLATES[t].area);
    for (let i = 1; i < areas.length; i++) expect(areas[i], TEMPLATE_IDS[i]).toBeGreaterThan(areas[i - 1]);
    const prices = TEMPLATE_IDS.map(t => TEMPLATES[t].price); for (let i = 1; i < prices.length; i++) expect(prices[i]).toBeGreaterThan(prices[i - 1]);
  });
  it('the small ones have what a studio has: a room to live and sleep in, a bathroom, a kitchenette', () => {
    for (const t of ['mini_studio', 'studio'] as const) {
      const p = instantiate(t, { id: 'x' });
      expect(p.rooms.some(r => r.kind === 'sejour'), t).toBe(true); expect(p.rooms.some(r => r.kind === 'sdb'), t).toBe(true);
      expect(p.fixtures.map(f => f.kind)).toEqual(expect.arrayContaining(['sink', 'stove', 'fridge', 'counter', 'shower', 'wc', 'basin']));
      expect(livingArea(p), t).toBeLessThan(40);
    }
    expect(TEMPLATES.mini_studio.area).toBeLessThan(TEMPLATES.studio.area);
  });
  it('a bed, a sofa and a table all find a place in the mini-studio (the séjour takes what a bedroom would)', () => {
    const p = instantiate('mini_studio', { id: 'x' });
    for (const id of ['lit_bois', 'canape_cuir', 'table_basse', 'armoire_bois']) { const f = furnitureSpec(id)!; expect(roomsFor(p, f).length, id).toBeGreaterThan(0); expect(roomsFor(p, f)[0].kind, id).toBe('sejour'); }
  });
});

describe('the mirror', () => {
  it('turns a plan the other way round: the street door and the rooms change sides, the areas and the checks do not', () => {
    for (const t of TEMPLATE_IDS) {
      const p = instantiate(t, { id: 'a' }), q = mirrorPlan(p, 'b'), door = (x: FloorPlan) => x.openings.find(o => o.kind === 'front')!;
      expect(Math.sign(door(q).x - ((q.levels?.find(l => l.id === q.rooms.find(r => r.id === door(q).a)!.level)?.dx) ?? 0))).toBe(-Math.sign(door(p).x - ((p.levels?.find(l => l.id === p.rooms.find(r => r.id === door(p).a)!.level)?.dx) ?? 0)) || 0);
      expect(livingArea(q)).toBeCloseTo(livingArea(p), 6);
      expect(q.rooms.map(r => r.id)).toEqual(p.rooms.map(r => r.id));
    }
    const twice = mirrorPlan(mirrorPlan(instantiate('f3', { id: 'a' }), 'b'), 'a'), once = instantiate('f3', { id: 'a' });
    expect(twice.rooms.map(r => r.box)).toEqual(once.rooms.map(r => r.box));
  });
});

describe('identities', () => {
  it('give the same plan different colours and leave the plan alone', () => {
    const base = instantiate('f3', { id: 'a' }), mz = instantiate('f3', { id: 'a', identity: 'mermoz' }), pl = instantiate('f3', { id: 'a', identity: 'plateau' });
    expect(base.look).toBeUndefined();
    expect(mz.look!.door).not.toBe(pl.look!.door);
    expect(mz.rooms).toEqual(base.rooms);
    expect(IDENTITY_IDS).toEqual(['pikine', 'mermoz', 'plateau', 'corniche', 'almadies']);
    for (const id of IDENTITY_IDS) { expect(IDENTITIES[id].id).toBe(id); expect(IDENTITIES[id].about.length).toBeGreaterThan(10); }
  });
});

describe('listed in a hub', () => {
  it('a template becomes a catalogue home whose plan the game finds by its id', () => {
    const spec = homeSpecFromTemplate('studio', { id: 'studio_mermoz_1', identity: 'mermoz', name: 'Studio · Résidence Les Filaos', hub: 'mermoz', place: 'filaos', where: 'Mermoz', door: 'mermoz:home:filaos', mirror: true });
    expect(spec.kind).toBe('home'); expect(spec.home.level).toBe('apartment'); expect(spec.price).toBe(TEMPLATES.studio.price); expect(spec.size).toBe(Math.round(TEMPLATES.studio.area));
    const p = planFor('studio_mermoz_1')!; expect(p.look).toEqual(IDENTITIES.mermoz.look); expect(roomAt(p, p.spawn.x, p.spawn.z)).toBeTruthy();
    expect(layoutOf(spec).plan).toBe(p);
  });
});

describe('built by the shell', () => {
  for (const t of TEMPLATE_IDS) for (const identity of ['pikine', 'mermoz'] as const) it(`${t} · ${identity}: builds, a handful of draw calls, the street door and « Sortir »`, () => {
    const spec = homeSpecFromTemplate(t, { id: `built_${t}_${identity}`, identity, name: 'Essai', hub: 'pikine', place: 'x', where: 'x', door: 'pikine:home:x' });
    const h = buildHomeInterior(spec, 1800, 0, 'pikine');
    let meshes = 0; h.int.group.traverse(o => { if ((o as { isMesh?: boolean }).isMesh) meshes++; });
    expect(meshes, `${t} meshes`).toBeLessThanOrEqual(t === 'villa' || t === 'residence' || t === 'house' ? 60 : 24);
    expect(h.int.interactables.some(i => i.actions.some(a => a.special === 'exit'))).toBe(true);
    expect(h.int.colliders.length).toBeGreaterThan(5);
    expect(h.spots.kitchen).toBeTruthy(); expect(h.spots.shower).toBeTruthy();
  });
});
