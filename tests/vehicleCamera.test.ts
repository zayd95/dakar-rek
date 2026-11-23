import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PassengerCamera } from '../src/transport/camera';
import type { CameraAnchor } from '../src/transport/spec';
import type { Collider } from '../src/world/types';

const chase: CameraAnchor = { id: 'chase', label: 'chase', pos: [0, 2.4, -7], look: [0, 1, 5] };
const inWall = (p: THREE.Vector3, cs: Collider[]) => cs.some(c => p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1 && p.y < c.h);
const run = (cs: Collider[], poses: { x: number; z: number; yaw: number }[]) => {
  const cam = new THREE.PerspectiveCamera(66, 390 / 844), pc = new PassengerCamera(); let clipped = 0;
  pc.begin(cam, { ...poses[0], y: 0 });
  for (const p of poses) for (let i = 0; i < 6; i++) { pc.update(1 / 30, cam, { ...p, y: 0 }, 0, chase, { yaw: 0, pitch: 0 }, cs); if (inWall(cam.position, cs)) clipped++; }
  return clipped;
};

describe('the chase camera of a car stays out of buildings', () => {
  const facade: Collider = { x0: -30, x1: 30, z0: -10, z1: -8, h: 15 };
  it('with a facade right behind the car', () => {
    expect(run([facade], [{ x: 0, z: 0, yaw: 0 }, { x: 0, z: 1, yaw: 0 }])).toBe(0);
  });
  it('through a corner: the heading swings and the smoothed camera sweeps past a building corner', () => {
    const corner: Collider = { x0: -40, x1: -6, z0: -14, z1: -2, h: 20 };
    const poses = Array.from({ length: 40 }, (_, i) => ({ x: 0, z: i * 0.3, yaw: Math.min(1.5, i * 0.08) }));
    expect(run([corner, facade], poses)).toBe(0);
  });
});

describe('the chase camera keeps up with a driven car (docs/DRIVING_FEEL.md)', () => {
  /** The view's heading lag (rad) behind a car turning at `rate` rad/s, once settled. */
  const lag = (rate: number, chaseK: number) => {
    const cam = new THREE.PerspectiveCamera(66, 390 / 844), pc = new PassengerCamera(); let yaw = 0;
    pc.begin(cam, { x: 0, y: 0, z: 0, yaw: 0 });
    for (let i = 0; i < 180; i++) { yaw += rate / 60; pc.update(1 / 60, cam, { x: 0, y: 0, z: 0, yaw }, 0, chase, { yaw: 0, pitch: 0 }, [], 0.3, chaseK); }
    // where the camera stands against where the anchor would put it with no lag: the angle between the two, seen from the car
    const behind = Math.atan2(-cam.position.x, -cam.position.z);
    return Math.abs(Math.atan2(Math.sin(yaw - behind), Math.cos(yaw - behind)));
  };
  it('in a tight corner (1.6 rad/s: full lock at 25 km/h) the view stays within 35° of straight behind the car; without the catch-up it fell a good 60° behind', () => {
    expect(lag(1.6, 6.5)).toBeLessThan(0.61); expect(lag(1.6, 0)).toBeGreaterThan(1);
  });
  it('a gentle bend is followed as calmly as before (the catch-up is in proportion to the lag)', () => {
    expect(lag(0.15, 6.5)).toBeGreaterThan(lag(0.15, 0) * 0.75);
  });
});
