import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildInterior } from '../src/world/interiors';
import { LegacySource } from '../src/interact/legacy';
import { Seats } from '../src/interact/seats';
import { pickTarget, primaryOf } from '../src/interact/system';
import type { Target } from '../src/interact/types';

/**
 * The starter room's bed with the « bon matelas » (check-economy « bed now offers the better sleep »): built by the real
 * interior builder, found by the interaction system where the check stands (0.6 m from the bed's place, facing it), its
 * main button opens the bed's sheet and its only action is the better sleep. A canvas stub stands in for the browser's
 * (the wax print textures).
 */
// a 2D context where every call and property gives itself back (gradients, measures…): drawing does nothing
const ctx2d: object = new Proxy(function () { /* stub */ }, { get: () => ctx2d, apply: () => ctx2d, set: () => true });
beforeAll(() => {
  const canvas = () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d, addEventListener: () => {} });
  vi.stubGlobal('document', { createElement: canvas, createElementNS: canvas });
});
afterAll(() => { vi.unstubAllGlobals(); });

function focusAt(owned: string[], x: number, z: number, yaw: number) {
  const ox = 1000, int = buildInterior('home', ox, 0, 'Chambre', 'pikine', owned);
  let opened: string | null = null, ran: string | null = null;
  const legacy = new LegacySource({
    list: () => int.interactables, run: it => { opened = it.name; }, runAction: (_it, a) => { ran = a.label; },
    canAfford: () => true, visible: () => true, requires: () => null,
  });
  const seats = new Seats(); seats.addAll(int.seats.map(s => ({ ...s, space: 'home' })));
  const list: Target[] = [];
  legacy.collect('home', ox + x, z, list); seats.collect('home', ox + x, z, list);
  const t = pickTarget(list, 'home', ox + x, z, yaw);
  return { int, t, run: () => { primaryOf(t)?.run(); return { opened, ran }; } };
}

describe('the starter room’s bed with the « bon matelas »', () => {
  it('is named for it, and its one action is the better sleep', () => {
    const { int } = focusAt(['matelas'], -0.25, -0.6, -Math.PI / 2);
    const bed = int.interactables.find(i => i.id === 'pikine:in:bed')!;
    expect(bed.name).toBe('Lit · bon matelas');
    expect(bed.actions.map(a => a.label)).toEqual(['Dormir (bon matelas)']);
    const plain = focusAt([], -0.25, -0.6, -Math.PI / 2).int.interactables.find(i => i.id === 'pikine:in:bed')!;
    expect(plain.name).toBe('Lit');
  });
  it('where check-economy stands (0.6 m from it, facing it) it is the focus, and the main button opens its sheet', () => {
    const f = focusAt(['matelas'], -0.25, -0.6, -Math.PI / 2);
    expect(f.t?.name).toBe('Lit · bon matelas');
    expect(f.t?.affordances().map(a => a.label)).toContain('Dormir (bon matelas)');
    expect(f.run()).toEqual({ opened: 'Lit · bon matelas', ran: null });
  });
});
