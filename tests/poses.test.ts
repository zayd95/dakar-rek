import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPoseClips, POSES, type PoseClip } from '../src/actors/humanoid';
import { floorSeatTop, seatClip, sitOriginY, SIT_HIPS, Seats, standSpots, type Seat } from '../src/interact/seats';
import { FURNITURE_SPECS } from '../src/economy/catalog';
import { installFurnitureKit } from '../src/economy/furnitureKitAdapter';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import { ActivityRunner, type ActivityServices } from '../src/activity/runner';
import * as P from '../src/activity/primitives';
import { buildFurniture, furnitureSeats } from '../src/world/furnitureKit';
import { buildVehicle, vehicleSeats, vehicleSpec } from '../src/actors/vehicleKit';
import { loadRig, posed } from './rig';

/** Joint positions of a pose built from the shipped rig (character space: origin on the surface under the hips). */
function pose(name: PoseClip) {
  const { root, clips } = loadRig();
  const clip = buildPoseClips(root, clips).find(c => c.name === name)!;
  const p = posed(root, clip);
  const tip = (bone: string, len: number) => p.pos(bone).add(p.dir(bone).multiplyScalar(len));
  return { ...p, tip };
}
const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'upper_armL', 'forearmL', 'handL', 'upper_armR', 'forearmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];

describe('procedural poses', () => {
  it('builds one clip per pose covering every animated track of the rig', () => {
    const { root, clips } = loadRig();
    const built = buildPoseClips(root, clips);
    expect(built.map(c => c.name)).toEqual(Object.keys(POSES));
    const idle = clips.find(c => c.name === 'Idle')!;
    for (const c of built) expect(c.tracks.map(t => t.name)).toEqual(idle.tracks.map(t => t.name));
    expect(idle.tracks.some(t => t.name.endsWith('.scale'))).toBe(true);   // the shipped clips carry scale tracks…
  });

  it('keeps every bone at its rest scale (no collapsed body)', () => {
    for (const name of Object.keys(POSES) as PoseClip[]) {
      const p = pose(name), root = p.mixer.getRoot() as THREE.Object3D;
      root.traverse(o => { if (o.name) expect(o.scale.toArray().map(v => +v.toFixed(3)), `${name} ${o.name}`).toEqual([1, 1, 1]); });
    }
  });

  for (const name of ['Lie', 'SitFloor'] as PoseClip[]) {
    it(`${name}: nothing below the surface, bones keep their lengths`, () => {
      const p = pose(name);
      for (const j of JOINTS) expect(p.pos(j).y, `${name} ${j}`).toBeGreaterThan(0.03);
      for (const s of ['L', 'R']) expect(p.tip(`foot${s}`, 0.14).y, `${name} toes ${s}`).toBeGreaterThan(0.01);
      expect(p.pos('shinL').distanceTo(p.pos('thighL'))).toBeCloseTo(0.43, 2);
      expect(p.pos('footL').distanceTo(p.pos('shinL'))).toBeCloseTo(0.43, 2);
    });
  }

  it('Lie: on the back, hips on the mattress, head raised on the pillow towards −z, feet towards +z', () => {
    const p = pose('Lie');
    expect(p.pos('hips').y).toBeCloseTo(POSES.Lie.hipsY, 3);
    expect(p.dir('spine').z).toBeLessThan(-0.95);                       // body along −z
    const head = p.pos('head');
    expect(head.z).toBeLessThan(-0.55); expect(head.z).toBeGreaterThan(-0.9);
    expect(head.y).toBeGreaterThan(0.18); expect(head.y).toBeLessThan(0.32);   // on a 8–16 cm pillow, not floating
    for (const s of ['L', 'R']) { expect(p.pos(`foot${s}`).z).toBeGreaterThan(0.7); expect(p.pos(`foot${s}`).y).toBeLessThan(0.3); }
    // the chest faces the ceiling: the head's forward axis (+z at rest) points up
    const q = new THREE.Quaternion(); p.mixer.getRoot(); (p.mixer.getRoot() as THREE.Object3D).getObjectByName('head')!.getWorldQuaternion(q);
    expect(new THREE.Vector3(0, 0, 1).applyQuaternion(q).y).toBeGreaterThan(0.85);
    // hands rest on the belly, inside the body's width
    for (const s of ['L', 'R']) { const h = p.pos(`hand${s}`); expect(Math.abs(h.x)).toBeLessThan(0.22); expect(h.y).toBeGreaterThan(0.15); }
  });

  it('SitFloor: cross-legged, knees out to the sides near the floor, back upright, hands on the knees', () => {
    const p = pose('SitFloor');
    expect(p.pos('hips').y).toBeCloseTo(POSES.SitFloor.hipsY, 3);
    for (const s of ['L', 'R']) {
      const knee = p.pos(`shin${s}`);
      expect(knee.y).toBeLessThan(0.2); expect(Math.abs(knee.x)).toBeGreaterThan(0.3); expect(knee.z).toBeGreaterThan(0.15);
      expect(p.pos(`hand${s}`).distanceTo(knee)).toBeLessThan(0.15);
    }
    expect(p.pos('shinL').x * p.pos('footL').x).toBeLessThan(0.01);   // each foot ends under the other leg
    expect(p.pos('head').y).toBeGreaterThan(0.75);
    // the shins cross at different heights (no interpenetration at the ankles)
    expect(Math.abs(p.pos('footL').y - p.pos('footR').y)).toBeGreaterThan(0.025);
  });

  it('Ride: astride the kit motorbike, hands on its grips, feet on its pegs, the saddle under the hips', () => {
    let seed = 1; while (vehicleSpec('moto', { seed }).controls.pegs![0][2] > 0) seed++;   // the 125 cc (not the scooter)
    const spec = vehicleSpec('moto', { seed }), drv = spec.seats.find(x => x.kind === 'driver')!;
    expect(drv.clip).toBe('Ride');
    // character space of the rider: origin SIT_HIPS under the saddle, like Sit
    const toChar = (p: readonly number[]) => new THREE.Vector3(p[0] - drv.x, p[1] - (drv.top - SIT_HIPS), p[2] - drv.z);
    const p = pose('Ride');
    expect(p.pos('hips').y).toBeCloseTo(SIT_HIPS + 0.02, 2);                     // just above the saddle
    for (const [i, s] of (['L', 'R'] as const).entries()) {
      const palm = p.tip(`hand${s}`, 0.07), grip = toChar(spec.controls.grips[i]);
      expect(palm.distanceTo(grip), `hand ${s}`).toBeLessThan(0.1);
      expect(p.pos(`foot${s}`).distanceTo(toChar(spec.controls.pegs![i])), `foot ${s}`).toBeLessThan(0.12);
      expect(Math.abs(p.pos(`shin${s}`).x)).toBeLessThan(0.26);                // knees against the tank, not splayed
    }
    expect(p.pos('head').z).toBeGreaterThan(0.1);                                // leaning forward over the bars
    // the interaction seats of a placed moto carry the pose
    const v = buildVehicle('moto', { seed }); v.group.updateMatrixWorld(true);
    expect(vehicleSeats(v.group, v.spec, 'moto:1').map(x => x.clip)).toEqual(['Ride', 'Ride']);
  });

  it('furniture seats carry their pose and stand the body on the surface (Seat.clip, floorSeatTop)', () => {
    const at = (id: Parameters<typeof buildFurniture>[0], floorY = 0.1) => {
      const f = buildFurniture(id); f.group.position.set(1000, floorY, 0); f.group.updateMatrixWorld(true);
      return { local: f.spec.seats[0], seat: furnitureSeats(f.group, f.spec, 'home', 'home')[0] };
    };
    const bed = at('bed:better');
    expect(seatClip(bed.seat)).toBe('Lie');
    expect(sitOriginY(bed.seat)).toBeCloseTo(0.1 + bed.local.top);          // origin on the mattress: nobody sinks into it
    const rug = at('rug:premium');
    expect(seatClip(rug.seat)).toBe('SitFloor'); expect(sitOriginY(rug.seat)).toBeCloseTo(0.1 + rug.local.top);
    const cushion = at('attaya:better');
    expect(seatClip(cushion.seat)).toBe('SitFloor'); expect(sitOriginY(cushion.seat)).toBeCloseTo(0.1 + cushion.local.top);
    const chair = at('plasticChair:basic');
    expect(seatClip(chair.seat)).toBe('Sit'); expect(sitOriginY(chair.seat)).toBeCloseTo(0.1 + chair.local.top - SIT_HIPS);
  });

});

describe('sleeping at home: lying along the bed, up beside it afterwards', () => {
  installFurnitureKit();                                             // the catalogue's seat heights follow the kit models
  const beds = FURNITURE_SPECS.filter(f => f.type === 'bed');
  it('every catalogue bed is a lying place along it, hips at the middle, head toward the pillow (−z)', () => {
    expect(beds.map(b => b.id)).toEqual(['matelas_sol', 'lit_bois', 'lit_king']);
    for (const b of beds) {
      expect(b.seats).toHaveLength(1);
      const st = b.seats![0];
      expect(st).toMatchObject({ x: 0, yaw: 0, kind: 'bed', clip: 'Lie' }); expect(Math.abs(st.z)).toBeLessThan(0.1);
    }
  });
  it('the lying body stays on the mattress of each bed: head on the pillow side, feet before the foot of the bed', () => {
    const p = pose('Lie');
    for (const b of beds) {
      const st = b.seats![0], surface = st.top;                      // a home seat: top = surface + SIT_HIPS (src/economy/estate.ts)
      const seat = { top: floorSeatTop(surface) };
      expect(sitOriginY(seat)).toBeCloseTo(surface);
      for (const j of JOINTS) {
        const v = p.pos(j);
        expect(Math.abs(v.x + st.x), `${b.id} ${j} x`).toBeLessThan(b.w / 2);
        expect(v.z + st.z, `${b.id} ${j} z`).toBeGreaterThan(-b.d / 2); expect(v.z + st.z, `${b.id} ${j} z`).toBeLessThan(b.d / 2);
      }
      expect(p.pos('head').z + st.z).toBeLessThan(-b.d / 2 + 0.6);   // the pillows lie in the first 0.6 m
    }
  });
  it('getting up: in front of a chair, out of a bed by either side, else past its foot', () => {
    const chair = standSpots({ x: 0, z: 0, yaw: 0 });
    expect(chair).toHaveLength(1); expect(chair[0].z).toBeCloseTo(0.7);
    const bed = standSpots({ x: 2, z: 3, yaw: Math.PI / 2, clip: 'Lie' });          // lying with the feet toward +x
    expect(bed).toHaveLength(3);
    expect(bed[0].x).toBeCloseTo(2); expect(Math.abs(bed[0].z - 3)).toBeCloseTo(1.25);   // beside the hips
    expect(bed[1].x).toBeCloseTo(2); expect(bed[0].z + bed[1].z).toBeCloseTo(6);          // the other side
    expect(bed[2].x).toBeCloseTo(3.7); expect(bed[2].z).toBeCloseTo(3);                   // past the foot
  });
  it('a night in bed lies the body down, and ends up beside the bed — finished or stopped', () => {
    const rig = () => {
      const state = new GameState(newSave()), seats = new Seats(); let seated: Seat | null = null; const clips: (string | null)[] = []; let stood = 0;
      const bed: Seat = { id: 'lit', x: 0, z: 0, top: floorSeatTop(0.58), yaw: 0, kind: 'bed', space: 'home', occupant: null, clip: 'Lie' };
      seats.add(bed);
      const s: ActivityServices = { state, seats, space: () => 'home', player: () => ({ x: 1, z: 0 }), seated: () => seated,
        sit: x => { if (!seats.occupy(x.id, 'player')) return false; seated = x; clips.push(seatClip(x)); return true; },
        stand: () => { if (seated) seats.release(seated.id, 'player'); seated = null; stood++; },
        clip: c => clips.push(c), busy: () => {}, progress: () => {}, toast: () => {}, save: () => {} };
      return { runner: new ActivityRunner(s), state, clips, seated: () => seated, stood: () => stood };
    };
    const night = P.sleep({ id: 'dormir', label: 'Dormir', seat: 'lit', seconds: 6, energy: 60 });
    const a = rig(); a.state.data.needs.energie = 20;
    a.runner.start(night); a.runner.update(1);
    expect(a.seated()?.id).toBe('lit'); expect(a.clips).toContain('Lie');                  // lying while asleep
    for (let t = 0; t < 8; t += 0.25) a.runner.update(0.25);
    expect(a.state.data.needs.energie).toBeGreaterThan(70); expect(a.seated()).toBeNull(); expect(a.stood()).toBe(1);
    expect(a.clips.at(-1)).toBeNull();                                                      // back to normal, standing
    const b = rig(); b.runner.start(night); b.runner.update(1); b.runner.cancel();
    expect(b.seated()).toBeNull(); expect(b.stood()).toBe(1); expect(b.clips.at(-1)).toBeNull();
    // other activities on a seat keep you there (a meal at a table)
    const c = rig(); c.runner.start(P.use({ id: 'repos', label: 'Se reposer', seconds: 1, seat: 'lit' })); for (let t = 0; t < 2; t += 0.25) c.runner.update(0.25);
    expect(c.seated()?.id).toBe('lit'); expect(c.stood()).toBe(0);
  });
});
