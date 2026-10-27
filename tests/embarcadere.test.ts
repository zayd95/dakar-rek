import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// bodies without assets: the venue's customers are records first, a body only shows them (src/venues/embarcadere.ts)
vi.mock('../src/actors/humanoid', async orig => ({
  ...(await orig<typeof import('../src/actors/humanoid')>()),
  humanoidReady: () => true,
  Humanoid: class { group = new THREE.Group(); hold: string | null = 'Idle'; vestOn = false; play() {} animate() {} setLook() {} setVest(on: boolean) { this.vestOn = on; return true; } dispose() { this.group.removeFromParent(); } },
}));

const { GameState } = await import('../src/core/state');
const { newSave } = await import('../src/core/save');
const { Seats, sitOriginY } = await import('../src/interact/seats');
const { ActivityRunner } = await import('../src/activity/runner');
const { Places } = await import('../src/activity/places');
const { CROSSING_STEPS } = await import('../src/activity/templates');
const { buildEmbarcadere, wayLeg, islandPose } = await import('../src/venues/embarcadere');
const { TRAVERSEE_SITE: S } = await import('../src/sea/traverseeSite');
const { buildBoat } = await import('../src/world/boats');
const R = await import('../src/sea/traverseeRules');
type Seat = import('../src/interact/seats').Seat;
type MenuItem = import('../src/ui/hud').MenuItem;
type Target = import('../src/interact/types').Target;
type P2 = import('../src/sea/traverseeSite').P2;
type Pose = import('../src/sea/traverseeSite').Pose;
type SaveData = InstanceType<typeof GameState>['data'];

/** The game around one venue: the runner, the places, the seats and the player as src/main.ts gives them; `data`: a save to start from (a reload). */
function rig(hour = 10, data?: SaveData) {
  const state = new GameState(data ?? newSave());
  if (!data) { state.data.wallet = 0; state.data.needs.energie = 100; }
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
  type BoatPose = { x: number; z: number; yaw: number; y: number; roll: number; pitch: number; ground: number; astern: boolean; v: number; wake: number };
  const info = () => venue.traversee() as {
    phase: string; boat: string; pose: BoatPose; boats: Record<string, BoatPose>; poses: Record<string, { home: Pose; isle: Pose; stand: P2 }>;
    customers: { id: number; state: string; seated: boolean; side: string; x: number; z: number; y: number; wading: boolean; vest: boolean; vestShown: boolean; leg: string | null }[];
    events: { t: number; id: number; what: string; y: number; vest: boolean; side: string; leg: string | null }[];
    paid: { leg: string; amount: number; passengers: number; fares: number; share: number; ledger: number | null }[];
    counters: Record<string, number>; closed: Record<string, string | null>; helm: { locked: boolean; seated: boolean }; plan: { out: { passengers: number; net: number }; back: { passengers: number; net: number } };
  };
  /** The place's target on the sand, as the action button sees it. */
  const target = (): Target | null => { const out: Target[] = []; places.collect('street', S.anchor.x, S.anchor.z, out); return out.find(t => t.id.endsWith(':quai')) ?? null; };
  const choose = () => { target()!.affordances()[0].run(); for (let i = 0; i < 3 && !menu; i++) tick(); return menu as { title: string; items: MenuItem[] } | null; };
  return { state, seats, venue, tick, info, target, choose, toasts, placed, pos, get seated() { return seated; }, get fade() { return fade; }, setHour: (v: number) => { h = v; }, activities };
}

/** Runs frames until `done` or `seconds` of game time; returns the frames' count. */
const until = (r: ReturnType<typeof rig>, done: () => boolean, seconds = 400) => { let n = 0; while (!done() && n * 0.1 < seconds) { r.tick(); n++; } return n; };
const near = (a: P2, b: P2, d: number) => Math.hypot(a.x - b.x, a.z - b.z) < d;
const inBox = (p: P2, b: { x0: number; x1: number; z0: number; z1: number }) => p.x >= b.x0 && p.x <= b.x1 && p.z >= b.z0 && p.z <= b.z1;
const bow = (p: Pose, len: number) => ({ x: p.x - Math.sin(p.yaw) * len / 2, z: p.z - Math.cos(p.yaw) * len / 2 });
/** The least distance between two hulls (their keel lines, less half of each beam): < 0 overlap. */
function gap(a: Pose, la: number, ba: number, b: Pose, lb: number, bb: number) {
  let d = Infinity;
  for (let u = -0.5; u <= 0.5; u += 0.05) for (let v = -0.5; v <= 0.5; v += 0.05) {
    const p = { x: a.x - Math.sin(a.yaw) * la * u, z: a.z - Math.cos(a.yaw) * la * u }, q = { x: b.x - Math.sin(b.yaw) * lb * v, z: b.z - Math.cos(b.yaw) * lb * v };
    d = Math.min(d, Math.hypot(p.x - q.x, p.z - q.z));
  }
  return d - ba / 2 - bb / 2;
}

describe('la traversée: the way on the water, beach to beach', () => {
  const model = { pirogue: buildBoat('pirogue', new THREE.MeshBasicMaterial(), true), chaloupe: buildBoat('chaloupe', new THREE.MeshBasicMaterial(), true) };
  for (const kind of ['pirogue', 'chaloupe'] as const) {
    it(`${kind}: pushed off stern first, turned round in open water, in bow first to the island's beach; and back to its own pose`, () => {
      const m = model[kind], home = S.beach[kind], isle = islandPose(m.length), cruise = R.boatSpeed(kind);
      const out = wayLeg(home, isle, S.beach.clear, cruise), back = wayLeg(isle, home, S.island.clear, cruise);
      // the island: the contract's pose, the chaloupe run in as far as the pirogue's bow
      expect(isle.x).toBe(S.island.beached.x); expect(isle.yaw).toBe(0); expect(bow(isle, m.length).z).toBeCloseTo(S.island.beached.z - 5, 6);
      for (const [w, from, to] of [[out, home, isle], [back, isle, home]] as const) {
        expect(w.at(0).x).toBeCloseTo(from.x, 3); expect(w.at(0).z).toBeCloseTo(from.z, 3);
        expect(w.at(w.len).x).toBeCloseTo(to.x, 3); expect(w.at(w.len).z).toBeCloseTo(to.z, 3);
        // stern first: astern for its first metres, the bow still toward the beach it leaves, moving away from it
        expect(w.at(1).rev).toBe(true); expect(Math.abs(Math.sin(w.yawAt(1) - from.yaw))).toBeLessThan(1e-6); expect(Math.cos(w.yawAt(1) - from.yaw)).toBeGreaterThan(0.999);
        expect(w.at(13).rev).toBe(true); expect(Math.hypot(w.at(13).x - from.x, w.at(13).z - from.z)).toBeCloseTo(13, 1);
        expect(w.backLen).toBe(14); expect(w.at(15).rev).toBe(false);
        // turned round: heading away from that beach half-way, and in bow first at the other, at its pose's heading
        expect(Math.cos(w.yawAt(w.len / 2) - from.yaw)).toBeLessThan(-0.95);
        expect(Math.cos(w.yawAt(w.len - 0.1) - to.yaw)).toBeGreaterThan(0.999); expect(w.at(w.len - 0.1).rev).toBe(false);
        // slowing in: the speed allowed falls to nothing at the sand
        expect(w.at(w.len - 0.05).vmax).toBeLessThan(0.5); expect(w.at(w.len - 8).vmax).toBeLessThan(cruise * 0.9);
        expect(w.len).toBeGreaterThan(130); expect(w.len).toBeLessThan(165);
        // inside the clear zones and the corridor between them, bow and stern; never near the other boat on the sand
        const other = kind === 'pirogue' ? 'chaloupe' : 'pirogue', oPose = S.beach[other];
        for (let s = 0; s <= w.len; s += 0.25) {
          const p = w.at(s), pose = { x: p.x, z: p.z, yaw: w.yawAt(s) };
          for (const e of [bow(pose, m.length), bow({ ...pose, yaw: pose.yaw + Math.PI }, m.length)]) {
            const zone = e.z > -200 ? S.beach.clear : e.z < -268 ? S.island.clear : { x0: 30, x1: 60, z0: -268, z1: -200 };
            expect(inBox(e, zone), `${kind} ${s.toFixed(1)} m: ${e.x.toFixed(1)}, ${e.z.toFixed(1)}`).toBe(true);
          }
          if (p.z > -200) expect(gap(pose, m.length, m.beam, oPose, model[other].length, model[other].beam), `${kind} ${s} m`).toBeGreaterThan(1);
        }
      }
    });
  }
});

describe('la traversée: a pirogue round trip from the beach of the Embarcadère de Ngor', () => {
  it('the choice on the sand: the pirogue with its fare, passengers and share; the chaloupe closed with the crossings left; both boats on the beach', () => {
    const r = rig(10); r.tick();
    const t = r.target()!;
    expect(t.name).toBe('Embarcadère de Ngor'); expect(t.affordances()[0].label).toBe('Prendre le bateau'); expect(t.affordances()[0].disabled).toBeNull();
    const m = r.choose()!;
    expect(m.title).toBe('Embarcadère de Ngor');
    const [p, c] = m.items;
    expect(p.label).toBe('Traversée en pirogue'); expect(p.disabled).toBe(false); expect(p.detail).toMatch(/^4 passagers attendent · 1.000.F la place · Ousmane prend 40/);
    expect(c.label).toBe('Traversée en chaloupe'); expect(c.disabled).toBe(true); expect(c.detail).toMatch(/après 3 traversées en pirogue · encore 3/);
    const i = r.info();
    expect(i.customers.filter(x => x.state === 'wait')).toHaveLength(4);                // waiting on the sand, no life jackets yet
    for (const x of i.customers) { expect(S.beach.waiting.some(w => near(w, x, 0.01))).toBe(true); expect(x.vest).toBe(false); expect(x.y).toBeGreaterThan(S.seaY); }
    // pulled up on the beach, bows on the sand: grounded, the bow lifted, hardly rocking
    for (const k of ['pirogue', 'chaloupe'] as const) {
      expect(i.boats[k]).toMatchObject({ x: S.beach[k].x, z: S.beach[k].z, yaw: +Math.PI.toFixed(3), ground: 1 });
      expect(i.boats[k].pitch).toBeGreaterThan(0.03); expect(Math.abs(i.boats[k].roll)).toBeLessThan(0.01);
    }
  });

  it('life jackets on, across the sand, wading in, aboard; pushed off, across, run up the island\'s beach; off into the shallows, jackets off on the sand; paid once a leg', () => {
    const r = rig(10); r.tick();
    const plan = r.info().plan, start = r.info().boats;
    r.choose()!.items[0].onPick();
    const stages: string[] = [];
    let maxRoll = 0, maxWake = 0, lockedAtSea = true, seenSeated = 0, l0 = r.state.data.ledger.length, afloat = 0, otherMoved = false, astern = false, unvestedAboard = 0;
    const lowest = new Map<number, number>(), poses: Record<string, ReturnType<typeof r.info>['pose']> = {};
    const n = until(r, () => {
      const i = r.info(), a = r.activities.current;
      if (a && stages.at(-1) !== a.step.label) { stages.push(a.step.label); poses[i.phase] = i.pose; }
      maxRoll = Math.max(maxRoll, Math.abs(i.pose.roll)); maxWake = Math.max(maxWake, i.pose.wake);
      if (i.pose.z < -200 && i.pose.z > -260) { afloat = Math.max(afloat, 1 - i.pose.ground); if (!(i.helm.locked && i.helm.seated)) lockedAtSea = false; }
      if (i.phase === 'out' && i.pose.astern) astern = true;
      if (i.boats.chaloupe.x !== S.beach.chaloupe.x || i.boats.chaloupe.z !== S.beach.chaloupe.z) otherMoved = true;
      seenSeated = Math.max(seenSeated, i.customers.filter(x => x.seated && x.leg === 'aller').length);
      for (const x of i.customers) { if (x.leg && x.side !== 'bord') lowest.set(x.id, Math.min(lowest.get(x.id) ?? 9, x.y)); if (x.side === 'bord' && !x.vest) unvestedAboard++; }
      return !r.activities.running && i.phase === 'idle';
    });
    expect(n * 0.1).toBeLessThan(220);
    expect(stages).toEqual(Object.values(CROSSING_STEPS));
    expect(near(poses.out, S.beach.pirogue, 0.1)).toBe(true); expect(poses.out.ground).toBeGreaterThan(0.99);   // it leaves from the sand…
    expect(astern).toBe(true);                                                             // …pushed off stern first
    expect(poses.land).toMatchObject({ x: islandPose(10).x, z: islandPose(10).z, yaw: 0, ground: 1 });   // run up the island's beach, bow first
    expect(poses.land.pitch).toBeGreaterThan(0.03);
    expect(poses.landBack).toMatchObject({ x: S.beach.pirogue.x, z: S.beach.pirogue.z, ground: 1 });
    expect(afloat).toBe(1); expect(maxRoll).toBeGreaterThan(0.03); expect(maxWake).toBeGreaterThan(0.3); expect(lockedAtSea).toBe(true);
    expect(otherMoved).toBe(false);                                                        // the chaloupe stayed on the sand
    expect(seenSeated).toBe(plan.out.passengers);
    // every customer: the jacket on (on the sand), wading in (feet under the sea), aboard in it; out into the shallows, the jacket off on the sand
    const ev = r.info().events, ids = [...new Set(ev.filter(e => e.leg).map(e => e.id))];
    expect(ids).toHaveLength(plan.out.passengers + plan.back.passengers);
    for (const id of ids) {
      const mine = ev.filter(e => e.id === id), what = mine.map(e => e.what);
      expect(what).toEqual(['vest-on', 'board', 'seated', 'alight', 'vest-off']);
      const [on, board, seated, alight, off] = mine;
      expect(on.y).toBeGreaterThan(S.seaY); expect(on.vest).toBe(true);                    // put on on the sand
      expect(board.y).toBeLessThan(S.seaY - 0.02); expect(board.vest).toBe(true);           // climbing in from the shallows
      expect(seated.vest).toBe(true); expect(seated.side).toBe('bord');
      expect(alight.y).toBeLessThan(S.seaY - 0.02); expect(alight.vest).toBe(true);         // stepping down into the shallows
      expect(off.y).toBeGreaterThan(S.seaY); expect(off.vest).toBe(false);                  // taken off on the sand
      expect(lowest.get(id)!).toBeLessThan(S.seaY - 0.05);
      expect(alight.side).toBe(mine[0].leg === 'aller' ? 'ile' : 'quai');
    }
    expect(unvestedAboard).toBe(0);
    // paid once per leg, the exact amounts of the rules: fares − Ousmane's share, one wallet line each
    const lines = r.state.data.ledger.slice(l0);
    expect(lines.map(l => [l.label, l.amount])).toEqual([[R.legLabel('aller', R.legPay('pirogue', plan.out.passengers, false)), plan.out.net], [R.legLabel('retour', R.legPay('pirogue', plan.back.passengers, false)), plan.back.net]]);
    expect(plan.out.net).toBe(plan.out.passengers * 600);
    expect(r.state.wallet).toBe(plan.out.net + plan.back.net);
    expect(r.info().paid.map(p => p.amount)).toEqual([plan.out.net, plan.back.net]);
    expect(r.info().counters).toEqual({ traversees: 1, traversees_pirogue: 1, traversees_chaloupe: 0, passagers_ngor: plan.out.passengers + plan.back.passengers });
    expect(r.state.data.needs.energie).toBe(92);
    // set down on the sand at the anchor, the boat back on the beach as it was
    expect(r.seated).toBeNull(); expect(r.placed.at(-1)).toMatchObject({ yaw: Math.PI }); expect(Math.hypot(r.pos.x - S.anchor.x, r.pos.z - S.anchor.z)).toBeLessThan(2);
    expect(r.pos.z).toBeGreaterThan(-157);                                                  // inside the walkable bounds
    expect(r.info().boats.pirogue).toMatchObject({ x: start.pirogue.x, z: start.pirogue.z, yaw: start.pirogue.yaw, ground: 1 });
    expect(r.info().helm.locked).toBe(false);
  });

  it('stopped mid-crossing: back on the sand, both boats on the beach, nothing paid for that leg, nothing twice', () => {
    const r = rig(10); r.tick();
    r.choose()!.items[0].onPick();
    until(r, () => r.info().pose.z < -230);
    expect(r.venue.safePlace?.()).toMatchObject({ yaw: Math.PI });                     // a save now resumes on the sand
    const w = r.state.wallet;
    r.activities.cancel('Arrêté');
    until(r, () => r.info().phase === 'idle', 5);
    const i = r.info();
    expect(r.state.wallet).toBe(w); expect(i.paid).toEqual([]); expect(i.counters.traversees).toBe(0);
    for (const k of ['pirogue', 'chaloupe'] as const) expect(i.boats[k]).toMatchObject({ x: S.beach[k].x, z: S.beach[k].z, ground: 1 });
    expect(r.seated).toBeNull(); expect(Math.hypot(r.pos.x - S.anchor.x, r.pos.z - S.anchor.z)).toBeLessThan(2);
    expect(i.customers.every(c => c.side === 'quai' && c.state === 'wait' && !c.vest)).toBe(true);
    expect(r.venue.safePlace?.()).toBeNull();
    // a stop after the island's leg was paid keeps that leg, and the return pays nothing
    r.choose()!.items[0].onPick();
    until(r, () => r.info().phase === 'back' && r.info().pose.z > -250);
    const paid = r.info().paid.length, w2 = r.state.wallet;
    expect(paid).toBe(1);
    r.activities.cancel('Arrêté'); until(r, () => r.info().phase === 'idle', 5);
    expect(r.state.wallet).toBe(w2); expect(r.info().paid.length).toBe(1);
  });

  it('reloaded mid-leg: the save holds the player on the sand at the anchor; the game comes back with both boats on the beach and nothing paid', () => {
    const r = rig(10); r.tick();
    r.choose()!.items[0].onPick();
    until(r, () => r.info().phase === 'out' && r.info().pose.z < -215);
    const safe = r.venue.safePlace!()!, saved = JSON.parse(JSON.stringify(r.state.data)) as SaveData, w = r.state.wallet, lines = r.state.data.ledger.length;
    expect(Math.hypot(safe.x - S.anchor.x, safe.z - S.anchor.z)).toBeLessThan(2); expect(safe.z).toBeGreaterThan(-157);
    const again = rig(10, saved); again.tick();
    const i = again.info();
    expect(i.phase).toBe('idle'); expect(again.activities.running).toBe(false);
    for (const k of ['pirogue', 'chaloupe'] as const) expect(i.boats[k]).toMatchObject({ x: S.beach[k].x, z: S.beach[k].z, ground: 1 });
    expect(again.state.wallet).toBe(w); expect(again.state.data.ledger.length).toBe(lines); expect(i.paid).toEqual([]); expect(i.counters.traversees).toBe(0);
    // and a crossing from there pays each leg once
    again.choose()!.items[0].onPick();
    until(again, () => !again.activities.running && again.info().phase === 'idle');
    expect(again.info().paid.map(p => p.leg)).toEqual(['aller', 'retour']); expect(again.state.data.ledger.length).toBe(lines + 2);
  });

  it('at night the choice is closed and says when the crossings start again; the boats stay on the sand, nobody waits', () => {
    const r = rig(21); r.tick();
    const a = r.target()!.affordances()[0];
    expect(a.disabled).toBe('Plus de traversée ce soir · reprise demain à 7 h');
    expect(r.info().closed.pirogue).toBe('Plus de traversée ce soir · reprise demain à 7 h');
    expect(r.info().customers).toEqual([]);
    expect(r.activities.start(r.venue.places[0].offers.barre[0])).toBe(false);
  });

  it('the chaloupe opens after three pirogue round trips: fewer customers who pay better, a smoother and faster crossing; the pirogue stays on the sand', () => {
    const r = rig(13); r.tick();
    expect(r.info().closed.chaloupe).toMatch(/encore 3/);
    (r.venue as unknown as { setPirogueTrips(n: number): number }).setPirogueTrips(3);
    const m = r.choose()!;
    expect(m.items[1].disabled).toBe(false); expect(m.items[1].detail).toMatch(/^2 passagers attendent · 2.500.F la place/);
    m.items[1].onPick();
    let maxRoll = 0, frames = 0, pirogueMoved = false;
    until(r, () => {
      const i = r.info();
      if (i.phase === 'out') { if (!i.pose.astern && i.pose.ground === 0) maxRoll = Math.max(maxRoll, Math.abs(i.pose.roll)); frames++; }
      if (i.boats.pirogue.x !== S.beach.pirogue.x || i.boats.pirogue.z !== S.beach.pirogue.z) pirogueMoved = true;
      return i.phase === 'idle' && !r.activities.running;
    });
    const i = r.info();
    expect(i.boat).toBe('chaloupe'); expect(i.paid.map(p => p.amount)).toEqual([2 * 1500, i.paid[1].passengers * 1500]);
    expect(i.counters).toMatchObject({ traversees: 1, traversees_chaloupe: 1, traversees_pirogue: 3 });
    expect(maxRoll).toBeLessThan(0.05); expect(frames * 0.1).toBeLessThan(34);
    expect(i.boats.chaloupe).toMatchObject({ x: S.beach.chaloupe.x, z: S.beach.chaloupe.z, ground: 1 }); expect(pirogueMoved).toBe(false);
  });

  it('Ousmane\'s trust lowers his share to 30 %', () => {
    const r = rig(10); r.state.data.flags.push('ousmane_trust'); r.tick();
    expect(r.choose()!.items[0].detail).toMatch(/Ousmane prend 30/);
    r.choose()!.items[0].onPick();
    until(r, () => r.info().paid.length === 1);
    expect(r.info().paid[0]).toMatchObject({ passengers: 4, fares: 4000, share: 1200, amount: 2800 });
  });
});
