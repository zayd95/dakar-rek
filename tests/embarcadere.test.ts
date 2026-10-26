import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// bodies without assets: the venue's customers are records first, a body only shows them (src/venues/embarcadere.ts)
vi.mock('../src/actors/humanoid', async orig => ({
  ...(await orig<typeof import('../src/actors/humanoid')>()),
  humanoidReady: () => true,
  Humanoid: class { group = new THREE.Group(); hold: string | null = 'Idle'; play() {} animate() {} setLook() {} dispose() { this.group.removeFromParent(); } },
}));

const { GameState } = await import('../src/core/state');
const { newSave } = await import('../src/core/save');
const { Seats, sitOriginY } = await import('../src/interact/seats');
const { ActivityRunner } = await import('../src/activity/runner');
const { Places } = await import('../src/activity/places');
const { CROSSING_STEPS } = await import('../src/activity/templates');
const { buildEmbarcadere, wayOut, wayBack } = await import('../src/venues/embarcadere');
const { TRAVERSEE_SITE: S } = await import('../src/sea/traverseeSite');
const R = await import('../src/sea/traverseeRules');
type Seat = import('../src/interact/seats').Seat;
type MenuItem = import('../src/ui/hud').MenuItem;
type Target = import('../src/interact/types').Target;

/** The game around one venue: the runner, the places, the seats and the player as src/main.ts gives them. */
function rig(hour = 10) {
  const state = new GameState(newSave()); state.data.wallet = 0; state.data.needs.energie = 100;
  const seats = new Seats(), extra = new THREE.Group(), camera = new THREE.PerspectiveCamera(60, 390 / 844, 0.1, 2000);
  const pos = new THREE.Vector3(S.anchor.x, 0.6, S.anchor.z);
  let seated: Seat | null = null, menu: { title: string; items: MenuItem[] } | null = null, fade = false, h = hour;
  const toasts: string[] = [], placed: { x: number; z: number; yaw: number }[] = [];
  const activities = new ActivityRunner({
    state, seats, space: () => 'street', player: () => ({ x: pos.x, z: pos.z }), seated: () => seated,
    sit: s => { if (!seats.occupy(s.id, 'player')) return false; seated = s; return true; },        // a boat's seat is boarded, not walked to
    clip: () => {}, busy: () => {}, progress: () => {}, toast: m => toasts.push(m), save: () => {},
  });
  const places = new Places(activities, () => h);
  const ctx = {
    world: () => ({ id: 'almadies', heightAt: () => 0 }), extra, seats, places, activities, state, camera,
    hour: () => h, day: () => 3, quality: () => 'low',
    player: { pos, seated: () => seated, standUp: () => { if (seated) seats.release(seated.id, 'player'); seated = null; }, place: (x: number, z: number, yaw: number) => { pos.set(x, 0.6, z); placed.push({ x, z, yaw }); } },
    hud: { fade: (on: boolean) => { fade = on; }, closeModal: () => { menu = null; } },
    menu: (title: string, _sub: string, items: MenuItem[]) => { menu = { title, items }; },
    setMode: () => {}, toast: (m: string) => toasts.push(m),
  };
  const env = { ctx, mats: { m: { plain: new THREE.MeshBasicMaterial() } }, lite: true, addPeople: () => {} };
  const venue = buildEmbarcadere(env as never);
  /** One frame: the runner first, then the venue (src/main.ts), then the camera hook; the body on its seat. */
  const tick = (dt = 0.1) => { activities.update(dt); venue.update(dt); venue.camera?.(dt, { yaw: 0, pitch: 0 }); if (seated) pos.set(seated.x, sitOriginY(seated), seated.z); };
  const info = () => venue.traversee() as {
    phase: string; boat: string; pose: { x: number; z: number; yaw: number; y: number; roll: number; v: number; wake: number }; moored: Record<string, { x: number; z: number; yaw: number }>;
    customers: { state: string; seated: boolean; side: string; x: number; z: number; leg: string | null }[]; paid: { leg: string; amount: number; passengers: number; fares: number; share: number; ledger: number | null }[];
    counters: Record<string, number>; closed: Record<string, string | null>; helm: { locked: boolean; seated: boolean }; plan: { out: { passengers: number; net: number }; back: { passengers: number; net: number } };
  };
  /** The place's target at the pier's end, as the action button sees it. */
  const target = (): Target | null => { const out: Target[] = []; places.collect('street', S.anchor.x, S.anchor.z, out); return out.find(t => t.id.endsWith(':quai')) ?? null; };
  const choose = () => { target()!.affordances()[0].run(); for (let i = 0; i < 3 && !menu; i++) tick(); return menu as { title: string; items: MenuItem[] } | null; };
  return { state, seats, venue, tick, info, target, choose, toasts, placed, pos, get seated() { return seated; }, get fade() { return fade; }, setHour: (v: number) => { h = v; }, activities };
}

/** Runs frames until `done` or `seconds` of game time; returns the frames' count. */
const until = (r: ReturnType<typeof rig>, done: () => boolean, seconds = 400) => { let n = 0; while (!done() && n * 0.1 < seconds) { r.tick(); n++; } return n; };

describe('la traversée: the way on the water', () => {
  it('out leaves the pontoon bow first and lies at the island\'s mooring; back turns round and lies at the quay\'s mooring the same way', () => {
    const o = wayOut(5.5), b = wayBack(5.5), M = S.quayMooring, I = S.island.mooring;
    expect(o.at(0).x).toBeCloseTo(M.x, 3); expect(o.at(0).z).toBeCloseTo(M.z, 3); expect(o.at(o.len).x).toBeCloseTo(I.x, 1); expect(o.at(o.len).z).toBeCloseTo(I.z, 1);
    expect(o.at(0).hz).toBeLessThan(-0.95); expect(o.at(o.len - 0.1).hz).toBeLessThan(-0.95);          // heading −z at both ends: the moorings' yaw 0
    expect(b.at(0).x).toBeCloseTo(I.x, 1); expect(b.at(b.len).x).toBeCloseTo(M.x, 1); expect(b.at(b.len).z).toBeCloseTo(M.z, 1);
    expect(b.at(0.05).hz).toBeLessThan(-0.95); expect(b.at(b.len - 0.05).hz).toBeLessThan(-0.95);    // turned round at either end
    expect(o.len).toBeGreaterThan(115); expect(o.len).toBeLessThan(140);
    // open water only: never over the pontoon or the jetty, never on the beach (z > −163) or the island (z < −300)
    for (const w of [o, b]) for (let s = 0; s <= w.len; s += 0.5) {
      const p = w.at(s);
      expect(p.z).toBeLessThan(-164); expect(p.z).toBeGreaterThan(-296);
      expect(p.x >= S.pontoon.x0 - 1 && p.x <= S.pontoon.x1 + 1.2 && p.z > S.pontoon.z0 && p.z < S.pontoon.z1).toBe(false);
      expect(p.x >= S.island.jetty.x0 - 1 && p.x <= S.island.jetty.x1 + 1.2 && p.z > S.island.jetty.z0 && p.z < S.island.jetty.z1).toBe(false);
    }
  });
});

describe('la traversée: a pirogue round trip at the Embarcadère de Ngor', () => {
  it('the choice at the pier\'s end: the pirogue with its fare, passengers and share; the chaloupe closed with the crossings left', () => {
    const r = rig(10); r.tick();
    const t = r.target()!;
    expect(t.name).toBe('Embarcadère de Ngor'); expect(t.affordances()[0].label).toBe('Traversées vers Ngor'); expect(t.affordances()[0].disabled).toBeNull();
    const m = r.choose()!;
    expect(m.title).toBe('Embarcadère de Ngor');
    const [p, c] = m.items;
    expect(p.label).toBe('Traversée en pirogue'); expect(p.disabled).toBe(false); expect(p.detail).toMatch(/^4 passagers attendent · 1.000.F la place · Ousmane prend 40/);
    expect(c.label).toBe('Traversée en chaloupe'); expect(c.disabled).toBe(true); expect(c.detail).toMatch(/après 3 traversées en pirogue · encore 3/);
    expect(r.info().customers.filter(x => x.state === 'wait')).toHaveLength(4);       // waiting on the pier
  });

  it('the player at the helm, the customers aboard, across, off and paid once, back, paid once: the counters move by one round trip', () => {
    const r = rig(10); r.tick();
    const plan = r.info().plan, start = r.info().pose;
    r.choose()!.items[0].onPick();
    const stages: string[] = [];
    let minZ = 0, maxRoll = 0, maxWake = 0, lockedAtSea = true, seenSeated = 0, l0 = r.state.data.ledger.length;
    const n = until(r, () => {
      const i = r.info(), a = r.activities.current;
      if (a && stages.at(-1) !== a.step.label) stages.push(a.step.label);
      minZ = Math.min(minZ, i.pose.z); maxRoll = Math.max(maxRoll, Math.abs(i.pose.roll)); maxWake = Math.max(maxWake, i.pose.wake);
      if (i.pose.z < -200 && !(i.helm.locked && i.helm.seated)) lockedAtSea = false;
      seenSeated = Math.max(seenSeated, i.customers.filter(x => x.seated).length);
      return !r.activities.running && i.phase === 'idle';
    });
    expect(n * 0.1).toBeLessThan(200);
    expect(stages).toEqual(Object.values(CROSSING_STEPS));
    expect(minZ).toBeLessThan(S.island.mooring.z + 1);                                 // it went to the island's jetty
    expect(maxRoll).toBeGreaterThan(0.03); expect(maxWake).toBeGreaterThan(0.3); expect(lockedAtSea).toBe(true);
    expect(seenSeated).toBe(plan.out.passengers);
    // paid once per leg, the exact amounts of the rules: fares − Ousmane's share, one wallet line each
    const lines = r.state.data.ledger.slice(l0);
    expect(lines.map(l => [l.label, l.amount])).toEqual([[R.legLabel('aller', R.legPay('pirogue', plan.out.passengers, false)), plan.out.net], [R.legLabel('retour', R.legPay('pirogue', plan.back.passengers, false)), plan.back.net]]);
    expect(plan.out.net).toBe(plan.out.passengers * 600);
    expect(r.state.wallet).toBe(plan.out.net + plan.back.net);
    expect(r.info().paid.map(p => p.amount)).toEqual([plan.out.net, plan.back.net]);
    expect(r.info().counters).toEqual({ traversees: 1, traversees_pirogue: 1, traversees_chaloupe: 0, passagers_ngor: plan.out.passengers + plan.back.passengers });
    expect(r.state.data.needs.energie).toBe(92);
    // set down on the pier, the boat back at its mooring as it left
    expect(r.seated).toBeNull(); expect(r.placed.at(-1)).toMatchObject({ yaw: Math.PI }); expect(Math.hypot(r.pos.x - S.anchor.x, r.pos.z - S.anchor.z)).toBeLessThan(2);
    expect(r.info().pose).toMatchObject({ x: start.x, z: start.z, yaw: 0 });
    expect(r.info().helm.locked).toBe(false);
  });

  it('stopped mid-crossing: back on the pier, both boats at their moorings, nothing paid for that leg, nothing twice', () => {
    const r = rig(10); r.tick();
    r.choose()!.items[0].onPick();
    until(r, () => r.info().pose.z < -230);
    expect(r.venue.safePlace?.()).toMatchObject({ yaw: Math.PI });                     // a save now resumes on the pier
    const w = r.state.wallet;
    r.activities.cancel('Arrêté');
    until(r, () => r.info().phase === 'idle', 5);
    const i = r.info();
    expect(r.state.wallet).toBe(w); expect(i.paid).toEqual([]); expect(i.counters.traversees).toBe(0);
    expect(i.moored.pirogue).toMatchObject({ x: S.quayMooring.x, z: S.quayMooring.z, yaw: 0 });
    expect(i.moored.chaloupe.x).toBeLessThan(S.pontoon.x0);
    expect(r.seated).toBeNull(); expect(Math.hypot(r.pos.x - S.anchor.x, r.pos.z - S.anchor.z)).toBeLessThan(2);
    expect(i.customers.every(c => c.side === 'quai' && c.state === 'wait')).toBe(true);
    expect(r.venue.safePlace?.()).toBeNull();
    // a stop after the island's leg was paid keeps that leg, and the return pays nothing
    r.choose()!.items[0].onPick();
    until(r, () => r.info().phase === 'back' && r.info().pose.z > -250);
    const paid = r.info().paid.length, w2 = r.state.wallet;
    expect(paid).toBe(1);
    r.activities.cancel('Arrêté'); until(r, () => r.info().phase === 'idle', 5);
    expect(r.state.wallet).toBe(w2); expect(r.info().paid.length).toBe(1);
  });

  it('at night the choice is closed and says when the crossings start again; the boats stay moored, nobody waits', () => {
    const r = rig(21); r.tick();
    const a = r.target()!.affordances()[0];
    expect(a.disabled).toBe('Plus de traversée ce soir · reprise demain à 7 h');
    expect(r.info().closed.pirogue).toBe('Plus de traversée ce soir · reprise demain à 7 h');
    expect(r.info().customers).toEqual([]);
    expect(r.activities.start(r.venue.places[0].offers.barre[0])).toBe(false);
  });

  it('the chaloupe opens after three pirogue round trips: fewer customers who pay better, a smoother and faster crossing', () => {
    const r = rig(13); r.tick();
    expect(r.info().closed.chaloupe).toMatch(/encore 3/);
    (r.venue as unknown as { setPirogueTrips(n: number): number }).setPirogueTrips(3);
    const m = r.choose()!;
    expect(m.items[1].disabled).toBe(false); expect(m.items[1].detail).toMatch(/^2 passagers attendent · 2.500.F la place/);
    m.items[1].onPick();
    let maxRoll = 0, frames = 0, outAt = 0;
    until(r, () => { const i = r.info(); if (i.phase === 'out') { maxRoll = Math.max(maxRoll, Math.abs(i.pose.roll)); frames++; } if (i.phase === 'land' && !outAt) outAt = frames; return i.phase === 'idle' && !r.activities.running; });
    const i = r.info();
    expect(i.boat).toBe('chaloupe'); expect(i.paid.map(p => p.amount)).toEqual([2 * 1500, i.paid[1].passengers * 1500]);
    expect(i.counters).toMatchObject({ traversees: 1, traversees_chaloupe: 1, traversees_pirogue: 3 });
    expect(maxRoll).toBeLessThan(0.05); expect(frames * 0.1).toBeLessThan(24);
    expect(i.moored.chaloupe).toMatchObject({ x: S.quayMooring.x, z: S.quayMooring.z });   // the boat in use lies alongside, the other on the west side
    expect(i.moored.pirogue.x).toBeLessThan(S.pontoon.x0);
  });

  it('Ousmane\'s trust lowers his share to 30 %', () => {
    const r = rig(10); r.state.data.flags.push('ousmane_trust'); r.tick();
    expect(r.choose()!.items[0].detail).toMatch(/Ousmane prend 30/);
    r.choose()!.items[0].onPick();
    until(r, () => r.info().paid.length === 1);
    expect(r.info().paid[0]).toMatchObject({ passengers: 4, fares: 4000, share: 1200, amount: 2800 });
  });
});
