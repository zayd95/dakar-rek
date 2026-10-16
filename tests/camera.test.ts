import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CAM_CLEAR, FollowCamera, TIGHT_M, VIEW_TRIES, bestView, blocked, clearFraction, crowded, nearOccluders, pullClear, underLeaves, viewPoint } from '../src/actors/camera';
import type { Canopy, Collider } from '../src/world/types';

const head = { x: 0, y: 1.5, z: 0 };
const feet = new THREE.Vector3(0, 0, 0);
/** The ticket window's booth right at the player's back (the player faces +z, the camera looks from −z). */
const booth: Collider = { x0: -0.85, x1: 0.85, z0: -2.0, z1: -0.7, h: 2.3 };
/** A shade tree's top over the place the camera would take behind the player. */
const tree: Canopy = { x: 0, z: -6.5, r: 3, y0: 2.1, y1: 5.8 };

describe('follow camera: walls and leaves', () => {
  it('a point is blocked inside a wall (with its margin) or inside a canopy, not above or beside them', () => {
    expect(blocked(0, 1, -1.2, [booth], [])).toBe(true);
    expect(blocked(0, 3.0, -1.2, [booth], [])).toBe(false);                 // over the booth's roof (+ margin)
    expect(blocked(2, 1, -1.2, [booth], [])).toBe(false);                   // beside it
    expect(blocked(0, 4, -6.5, [], [tree])).toBe(true);
    expect(blocked(0, 1.8, -6.5, [], [tree])).toBe(false);                  // under the leaves
    expect(blocked(0, 6.2, -6.5, [], [tree])).toBe(false);                  // above them
    expect(blocked(3.5, 4, -6.5, [], [tree])).toBe(false);                  // beside them
  });

  it('the free share of the way back: all of it in the open, cut short by a wall, stopped before the leaves', () => {
    const behind = viewPoint(feet, 0, 0.36, 8);                               // yaw 0: the camera sits at −z
    expect(behind.z).toBeLessThan(-7); expect(behind.y).toBeGreaterThan(3);
    expect(clearFraction(head, behind, [], [])).toBe(1);
    expect(clearFraction(head, behind, [booth], [])).toBeLessThan(0.2);       // the booth at the back: against the head
    const k = clearFraction(head, behind, [], [tree]);
    expect(k).toBeLessThan(1);
    const f = k, p = { x: head.x + (behind.x - head.x) * f, y: head.y + (behind.y - head.y) * f, z: head.z + (behind.z - head.z) * f };
    expect(blocked(p.x, p.y, p.z, [], [tree])).toBe(false);                  // never parked inside the leaves
  });

  it('a better view is taken only when it frees real room; a smaller turn wins a tie', () => {
    expect(bestView(8, VIEW_TRIES.map(() => 8))).toBe(-1);                   // nothing better
    expect(bestView(1, VIEW_TRIES.map(() => 1.5))).toBe(-1);                 // not a metre more
    const frees = VIEW_TRIES.map(() => 1); frees[1] = 9; frees[3] = 9;
    expect(bestView(1, frees)).toBe(1);                                      // the three-quarter angle before the side
    const lift = VIEW_TRIES.findIndex(([dy, dp]) => dy === 0 && dp > 0);
    const f2 = VIEW_TRIES.map(() => 1); f2[lift] = 6;
    expect(bestView(1, f2)).toBe(lift);                                      // over the shoulder
  });

  it('the short occluder list keeps what is near the player only', () => {
    const far: Collider = { x0: 100, x1: 102, z0: 100, z1: 102, h: 6 };
    const o = nearOccluders(0, 0, 12, [booth, far], [tree, { ...tree, x: 80 }]);
    expect(o.c).toEqual([booth]); expect(o.t).toHaveLength(1);
  });
});

describe('follow camera: it moves away from a tight spot', () => {
  const run = (cam: FollowCamera, frames: number, colliders: Collider[], canopies: Canopy[] = [], walking = false) => {
    for (let i = 0; i < frames; i++) cam.update(1 / 30, feet, 0, { yaw: 0, pitch: 0 }, colliders, false, walking, undefined, undefined, canopies);
  };
  it('at a window with the booth at the back, standing: it swings to a side angle and the head no longer fills the view', () => {
    const cam = new FollowCamera(new THREE.PerspectiveCamera());
    cam.snapBehind(0);
    run(cam, 1, [booth]);
    expect(cam.info.tight).toBe(true);
    expect(cam.info.free).toBeLessThan(TIGHT_M);
    run(cam, 90, [booth]);
    expect(cam.info.tight).toBe(false);
    expect(Math.abs(cam.yaw)).toBeGreaterThan(0.5);                          // turned to the side
    const p = cam.camera.position;
    expect(Math.hypot(p.x, p.z)).toBeGreaterThan(TIGHT_M * 0.8);
    expect(blocked(p.x, p.y, p.z, [booth], [])).toBe(false);
  });
  it('walking, the view never turns by itself (only tilts)', () => {
    const cam = new FollowCamera(new THREE.PerspectiveCamera());
    cam.snapBehind(0);
    run(cam, 60, [booth], [], true);
    expect(Math.abs(cam.yaw)).toBeLessThan(1e-6);
  });
  it('the player’s own drag wins: no swing right after it', () => {
    const cam = new FollowCamera(new THREE.PerspectiveCamera());
    cam.snapBehind(0);
    cam.update(1 / 30, feet, 0, { yaw: 0.01, pitch: 0 }, [booth], false, false);
    run(cam, 10, [booth]);                                                   // a third of a second later
    expect(Math.abs(cam.yaw - 0.01)).toBeLessThan(1e-6);
  });
  it('a view set on purpose (pin) is kept until the player walks', () => {
    const cam = new FollowCamera(new THREE.PerspectiveCamera());
    cam.snapBehind(0); cam.pin();
    run(cam, 60, [booth]);
    expect(cam.yaw).toBe(0);
    run(cam, 1, [booth], [], true);                                         // walking again: the camera is free to help
    expect(cam.info.tight).toBe(true);
  });
  it('under a tree: the camera never sits inside the leaves', () => {
    const cam = new FollowCamera(new THREE.PerspectiveCamera());
    cam.snapBehind(0);
    for (let i = 0; i < 120; i++) {
      cam.update(1 / 30, feet, 0, { yaw: 0, pitch: 0 }, [], false, false, undefined, undefined, [tree]);
      const p = cam.camera.position;
      if (i > 20) expect(blocked(p.x, p.y, p.z, [], [tree])).toBe(false);
    }
  });
  it('standing under a tree: the camera goes low under the leaves rather than against the head', () => {
    const over: Canopy = { x: 0, z: -1, r: 3, y0: 2.2, y1: 5.6 };              // the player by the trunk, under the top
    const behind = viewPoint(feet, 0, 0.36, 8);
    const u = underLeaves(head, behind, [over])!;
    expect(u.y).toBeLessThan(over.y0); expect(u.y).toBeGreaterThan(head.y);
    expect(clearFraction(head, u, [], [over])).toBe(1);
    expect(underLeaves(head, behind, [{ ...over, y0: 1.55 }])).toBeNull();   // leaves at head height: no way under
    expect(underLeaves(head, behind, [{ ...over, x: 20 }])).toBeNull();      // no tree on the way
    const cam = new FollowCamera(new THREE.PerspectiveCamera());
    cam.snapBehind(0);
    for (let i = 0; i < 60; i++) cam.update(1 / 30, feet, 0, { yaw: 0, pitch: 0 }, [], false, false, undefined, undefined, [over]);
    const p = cam.camera.position;
    expect(blocked(p.x, p.y, p.z, [], [over])).toBe(false);
    expect(Math.hypot(p.x, p.z)).toBeGreaterThan(TIGHT_M);
  });
  it('in the open nothing changes: straight behind, no lift', () => {
    const cam = new FollowCamera(new THREE.PerspectiveCamera());
    cam.snapBehind(0.4);
    run(cam, 30, []);
    expect(cam.yaw).toBeCloseTo(0.4, 6);
    expect(cam.info).toMatchObject({ tight: false, lift: 0, swinging: false });
    expect(cam.info.free).toBeCloseTo(8, 1);
  });
});

describe('follow camera: nothing right at the lens (a trunk, an awning, a parasol)', () => {
  it('room around the lens: walls within CAM_CLEAR, leaves or an awning around or just above', () => {
    const wall: Collider = { x0: 2, x1: 3, z0: -1, z1: 1, h: 4 };
    expect(crowded(2 - CAM_CLEAR + 0.1, 3, 0, [wall], [])).toBe(true);
    expect(crowded(2 - CAM_CLEAR - 0.1, 3, 0, [wall], [])).toBe(false);
    const awning: Canopy = { x: 0, z: 0, r: 1.4, y0: 2.3, y1: 3.0 };
    expect(crowded(1.4 + CAM_CLEAR - 0.1, 2.5, 0, [], [awning])).toBe(true);
    expect(crowded(0, 1.6, 0, [], [awning])).toBe(false);                     // well under it
    expect(crowded(0, 3.5, 0, [], [awning])).toBe(false);                     // well above it
  });
  it('the camera comes in front of what would fill the view', () => {
    const behind = viewPoint(feet, 0, 0.36, 8);
    const parasol: Canopy = { x: 0.5, z: -7.6, r: 1.4, y0: 3.4, y1: 4.0 };   // an awning right at the wanted spot, at the lens' height
    const k = pullClear(head, behind, clearFraction(head, behind, [], [parasol]), [], [parasol]);
    expect(k).toBeLessThan(1);
    const p = { x: head.x + (behind.x - head.x) * k, y: head.y + (behind.y - head.y) * k, z: head.z + (behind.z - head.z) * k };
    expect(crowded(p.x, p.y, p.z, [], [parasol])).toBe(false);
    expect(pullClear(head, behind, 1, [], [])).toBe(1);                      // in the open: nothing changes
  });
  it('after the gala by a tree: the lens never sits against its trunk or in its leaves', () => {
    const trunk: Collider = { x0: -1.6, x1: -1.0, z0: -6.3, z1: -5.7, h: 2.4 };
    const top: Canopy = { x: -1.3, z: -6, r: 2.8, y0: 2.1, y1: 5.6 };
    const cam = new FollowCamera(new THREE.PerspectiveCamera());
    cam.snapBehind(0);
    for (let i = 0; i < 90; i++) cam.update(1 / 30, feet, 0, { yaw: 0, pitch: 0 }, [trunk], false, false, undefined, undefined, [top]);
    const p = cam.camera.position;
    expect(crowded(p.x, p.y, p.z, [trunk], [top], CAM_CLEAR * 0.8)).toBe(false);
    expect(blocked(p.x, p.y, p.z, [trunk], [top])).toBe(false);
  });
});
