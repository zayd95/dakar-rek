import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { stubCanvas } from './hubstub';
import { FollowCamera } from '../src/actors/camera';
import { OPENING_SECONDS, PIKINE_KEYS, openingPose, type P3, type Pose } from '../src/game/openingPath';
import { openingWanted } from '../src/game/opening';
import type { HubWorld } from '../src/world/types';

/**
 * 1.0.1: the opening fly-in (src/game/opening.ts, src/game/openingPath.ts): when it plays, how long, how smoothly, that it lands exactly on the
 * play camera of the New Game spawn, and that it never passes through a wall, a roof or a tree of Pikine as the builder makes it.
 */
stubCanvas();
const { buildHub } = await import('../src/world/builder');

/** The play camera at the New Game spawn, as the follow camera frames it on a phone held upright (the end key the game gives each frame). */
function spawnCamera(w: HubWorld, portrait = true): Pose {
  const cam = new THREE.PerspectiveCamera(), follow = new FollowCamera(cam), at = new THREE.Vector3(w.spawn.x, 0.1 + w.heightAt(w.spawn.x, w.spawn.z), w.spawn.z);
  follow.snapBehind(w.spawn.yaw);
  for (let i = 0; i < 30; i++) follow.update(1 / 60, at, w.spawn.yaw, { yaw: 0, pitch: 0 }, w.colliders, portrait, false, undefined, (x, z) => w.heightAt(x, z), w.canopies, w.roofs ?? []);
  const d = cam.position.distanceTo(at), dir = cam.getWorldDirection(new THREE.Vector3());
  return { pos: { x: cam.position.x, y: cam.position.y, z: cam.position.z }, look: { x: cam.position.x + dir.x * d, y: cam.position.y + dir.y * d, z: cam.position.z + dir.z * d } };
}
const dirOf = (p: Pose) => { const dx = p.look.x - p.pos.x, dy = p.look.y - p.pos.y, dz = p.look.z - p.pos.z; return { yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }; };
const dist = (a: P3, b: P3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const angle = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

describe('when the opening plays', () => {
  it('a new game whose character was just made, on a device that never saw it, outside a ?debug run; ?intro forces it', () => {
    expect(openingWanted({ made: true, debug: false, forced: false, seen: false })).toBe(true);
    expect(openingWanted({ made: true, debug: false, forced: false, seen: true }), 'never again on this device').toBe(false);
    expect(openingWanted({ made: false, debug: false, forced: false, seen: false }), 'a saved game').toBe(false);
    expect(openingWanted({ made: true, debug: true, forced: false, seen: false }), 'a ?debug run keeps its timing').toBe(false);
    expect(openingWanted({ made: false, debug: true, forced: true, seen: true }), '?intro (test hosts)').toBe(true);
  });
});

describe('the flight over Pikine', () => {
  const w = buildHub('pikine', false) as HubWorld, end = spawnCamera(w);
  const samples = Array.from({ length: Math.round(OPENING_SECONDS * 60) + 1 }, (_, i) => openingPose(i / 60, end));

  it('lasts 12 to 18 s and lands exactly on the play camera behind the player', () => {
    expect(OPENING_SECONDS).toBeGreaterThanOrEqual(12); expect(OPENING_SECONDS).toBeLessThanOrEqual(18);
    const last = openingPose(OPENING_SECONDS, end);
    expect(dist(last.pos, end.pos)).toBeLessThan(1e-9); expect(dist(last.look, end.look)).toBeLessThan(1e-9);
    expect(dist(openingPose(0, end).pos, PIKINE_KEYS[0].pos)).toBeLessThan(1e-9);
    expect(Math.hypot(end.pos.x - w.spawn.x, end.pos.z - w.spawn.z), 'the end key is behind the spawn').toBeLessThan(12);
  });
  it('flies smoothly: at rest at both ends, never faster than 12 m/s, the view turning less than 40°/s', () => {
    let speed = 0, turn = 0;
    for (let i = 1; i < samples.length; i++) {
      speed = Math.max(speed, dist(samples[i].pos, samples[i - 1].pos) * 60);
      const a = dirOf(samples[i - 1]), b = dirOf(samples[i]);
      turn = Math.max(turn, Math.hypot(angle(a.yaw, b.yaw), angle(a.pitch, b.pitch)) * 60 * 180 / Math.PI);
    }
    expect(speed).toBeLessThan(12); expect(turn).toBeLessThan(40);
    expect(dist(samples[1].pos, samples[0].pos) * 60, 'starts at rest').toBeLessThan(0.2);
    expect(dist(samples[samples.length - 1].pos, samples[samples.length - 2].pos) * 60, 'lands at rest').toBeLessThan(0.2);
  });
  it('stays low (the fog closes at 240–320 m): under 20 m, inside the district', () => {
    for (const s of samples) {
      expect(s.pos.y).toBeLessThan(20); expect(s.pos.y).toBeGreaterThan(3);
      expect(Math.abs(s.pos.x)).toBeLessThan(w.bounds.x1); expect(Math.abs(s.pos.z)).toBeLessThan(w.bounds.z1);
    }
  });
  it('never passes through a building, a wall, a pole or a tree of Pikine (0.5 m kept around the lens)', () => {
    const m = 0.5, hits: string[] = [];
    for (const [i, s] of samples.entries()) {
      const { x, y, z } = s.pos;
      for (const c of w.colliders) if (x > c.x0 - m && x < c.x1 + m && z > c.z0 - m && z < c.z1 + m && y < c.h + m) hits.push(`${(i / 60).toFixed(2)} s in a ${c.h.toFixed(1)} m box at ${c.x0.toFixed(0)},${c.z0.toFixed(0)}`);
      for (const t of w.canopies ?? []) if (y > t.y0 - m && y < t.y1 + m && Math.hypot(x - t.x, z - t.z) < t.r + m) hits.push(`${(i / 60).toFixed(2)} s in a tree at ${t.x.toFixed(0)},${t.z.toFixed(0)}`);
    }
    expect(hits.slice(0, 6)).toEqual([]);
  });
  it('lands the same on a landscape screen (the follow camera frames it nearer)', () => {
    const land = spawnCamera(w, false);
    expect(dist(openingPose(OPENING_SECONDS, land).pos, land.pos)).toBeLessThan(1e-9);
    for (let t = 0; t <= OPENING_SECONDS; t += 0.25) expect(openingPose(t, land).pos.y).toBeGreaterThan(3);
  });
});
