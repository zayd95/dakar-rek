import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { stubCanvas } from './hubstub';
import type { GameCtx } from '../src/game/modules';
import type { HubWorld } from '../src/world/types';
import type { Target } from '../src/interact/types';
import { GameState } from '../src/core/state';
import { buyAsset } from '../src/economy/assets';
import { parked } from '../src/transport/owned';

/**
 * « Essayer » at Modou's (the Jakarta, a kerb dealer): the dealer's motorbike waits at the kerb for a free test ride. It is not the player's: the target
 * says « Véhicule d’essai » (never « Ta moto Jakarta »: the name the collect step wrote over the trial's own every frame since the condition tags), nothing
 * is owned or parked in the save, and the systems that look for the player's own moto (the arena's moto parking and the evening's way-finding, which read
 * `parkedHere()`) do not take it for theirs. Bought, the real one is « Ta moto Jakarta ».
 */
stubCanvas();
const hub = (await import('../src/world/builder')).buildHub('pikine', true) as HubWorld;
const { moto } = await import('../src/transport/motoModule');

type Inner = { tryOut(): void; buy(): void; targets: { collect(space: string, x: number, z: number, out: Target[]): void } };
const inner = moto as unknown as Inner;

function ctxFor(state: GameState) {
  return {
    state, quality: () => 'low', hour: () => 10, day: () => 3, now: () => 0, extra: new THREE.Group(), camera: new THREE.PerspectiveCamera(), inside: () => null,
    player: { pos: new THREE.Vector3(), body: () => null, facing: () => 0, seated: () => null, standUp() {}, place() {} }, mode: () => 'play', setMode() {},
    seats: { add() {}, remove() {} }, places: { all: () => [], add() {}, remove() {}, get: () => undefined }, interactions: { add() {} },
    hud: { closeModal() {} }, menu() {}, toast() {}, save() {}, activities: { running: null }, world: () => hub,
  } as unknown as GameCtx;
}
/** The targets the moto module offers to a player standing beside its vehicle on the street. */
function targetsBeside(): Target[] {
  const i = (moto.debug(ctx) as { moto: { info(): { x: number; z: number; here: boolean } } }).moto.info(), out: Target[] = [];
  if (i.here) inner.targets.collect('street', i.x - 0.9, i.z, out);
  return out;
}

const state = new GameState(); state.data.wallet = 10_000_000;
const ctx = ctxFor(state);
moto.hubLoaded(ctx, hub);

describe('a test ride on the dealer’s Jakarta', () => {
  it('is the dealer’s vehicle: « Véhicule d’essai », not « Ta moto Jakarta »; nothing owned, nothing parked, not the player’s moto for the arena', () => {
    expect(moto.parkedHere()).toBeNull();                                                // nothing at the kerb before « Essayer »
    inner.tryOut();
    const info = (moto.debug(ctx) as { moto: { info(): { here: boolean; trial: boolean; owned: boolean; record: unknown } } }).moto.info();
    expect(info).toMatchObject({ here: true, trial: true, owned: false, record: null });
    const t = targetsBeside();
    expect(t.map(x => x.name)).toEqual(['Véhicule d’essai']);
    expect(t[0].name).not.toMatch(/^Ta /);
    expect(parked(state.data, 'jakarta')).toBeNull();
    expect(moto.parkedHere()).toBeNull();                                                // the arena's parking and the evening's « Ta moto Jakarta » target ignore it
  });
  it('bought after the test, the real one is the player’s: « Ta moto Jakarta », parked at the kerb and saved', () => {
    inner.buy();
    const t = targetsBeside();
    expect(t.map(x => x.name)).toEqual(['Ta moto Jakarta']);
    expect(parked(state.data, 'jakarta')).not.toBeNull();
    expect(moto.parkedHere()).not.toBeNull();
  });
  it('a moto owned from « Biens » is « Ta moto Jakarta » from the start', () => {
    const s2 = new GameState(); s2.data.wallet = 1_000_000; expect(buyAsset(s2, 'jakarta')).toBeTruthy();
    const c2 = ctxFor(s2); moto.hubLoaded(c2, hub);
    const i = (moto.debug(c2) as { moto: { info(): { x: number; z: number; here: boolean; trial: boolean } } }).moto.info(), out: Target[] = [];
    expect(i).toMatchObject({ here: true, trial: false });
    inner.targets.collect('street', i.x - 0.9, i.z, out);
    expect(out.map(x => x.name)).toEqual(['Ta moto Jakarta']);
  });
});
