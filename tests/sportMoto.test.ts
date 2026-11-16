import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SABAR_ASSET, SABAR_BODY, SABAR_PAINTS, SABAR_RIDER, sabarKit, sabarPaintOf, sabarSeedOf, sabarSpec } from '../src/transport/sportMoto';
import { sabar, sabarModou, sabarNdiaye, NDIAYE_SABAR } from '../src/transport/sportMotoModule';
import { motoSpec } from '../src/transport/moto';
import { cardLines, footprint } from '../src/transport/ownedModule';
import { animateGlbRig, rigOf } from '../src/actors/glbVehicle';
import { animateVehicle } from '../src/actors/vehicleKit';
import { buildPoseClips } from '../src/actors/humanoid';
import { driveStep, newDriveState } from '../src/transport/drive';
import { VEHICLE_ASSETS, isMotoAsset, ownsVehicle, paintSeed, park, parked, setPaintSeed, unpark } from '../src/transport/owned';
import { ALL_VEHICLES, OWNED_VEHICLES, VEHICLE_LABELS } from '../src/transport/fleet';
import { VEHICLE_ICON } from '../src/transport/whereabouts';
import { PROFILES, HORNS, profileFor } from '../src/transport/vehicleAudio';
import { buyAsset, cannotBuy, holding, sellAsset } from '../src/economy/assets';
import { specOf } from '../src/economy/catalog';
import { fcfa } from '../src/ui/hud';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import type { DriveSpec } from '../src/transport/spec';
import type { HubWorld, Interactable } from '../src/world/types';
import { loadRig, posed } from './rig';
import side from '../public/assets/vehicles/sabar.json';

const speedAfter = (d: DriveSpec, seconds: number) => { const s = newDriveState(0, 0, 0); for (let i = 0; i < seconds * 30; i++) driveStep(s, { throttle: 1, steer: 0 }, d, 1 / 30, () => false); return s.speed; };

/** The shipped GLB's node tree (names and TRS only, from its JSON chunk): what the game's loader rigs. */
function glbNodes() {
  const glb = readFileSync(new URL('../public/assets/vehicles/sabar.glb', import.meta.url));
  const len = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true), gltf = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + len)));
  const nodes: THREE.Object3D[] = gltf.nodes.map((n: { name?: string; translation?: number[]; rotation?: number[]; scale?: number[]; extras?: Record<string, unknown> }) => {
    const o = new THREE.Object3D(); o.name = n.name ?? '';
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    if (n.extras) o.userData = { ...n.extras };
    return o;
  });
  gltf.nodes.forEach((n: { children?: number[] }, i: number) => n.children?.forEach(c => nodes[i].add(nodes[c])));
  const root = new THREE.Group(); nodes.forEach(o => { if (!o.parent) root.add(o); });
  return { root, gltf };
}

describe('the Sabar 600: the sport motorbike, its price and its two dealers', () => {
  it('is the catalogue\'s « Sabar 600 » at 2 000 000 F, a vehicle of its own (a new asset id: the save format is unchanged)', () => {
    expect(specOf(SABAR_ASSET)).toMatchObject({ kind: 'vehicle', name: 'Sabar 600', price: 2_000_000 });
    expect(specOf(SABAR_ASSET)?.soon).toBeUndefined();
    expect(specOf(SABAR_ASSET)?.where).toMatch(/Garage Modou · Pikine/); expect(specOf(SABAR_ASSET)?.where).toMatch(/Ndiaye Auto · Plateau/);
    expect(VEHICLE_ASSETS.indexOf('sabar')).toBe(VEHICLE_ASSETS.indexOf('jakarta') + 1);                // the vehicles cheapest first: 150 000, 2 000 000, 4 000 000…
    expect(ALL_VEHICLES.filter(m => m.def.asset === 'sabar')).toEqual([sabar]); expect(OWNED_VEHICLES).toContain(sabar);
    expect(VEHICLE_LABELS.find(v => v.asset === 'sabar')).toMatchObject({ key: 'sabar', label: 'Ta Sabar 600', f: true });
    expect(VEHICLE_ICON.sabar).toBe('🏍️'); expect(isMotoAsset('sabar')).toBe(true); expect(isMotoAsset('teranga')).toBe(false);
  });

  it('is sold at two dealers in two districts, each in its own colourway, named in French', () => {
    const d = sabar.def.dealer!, b = sabar.def.branches!;
    expect(b).toHaveLength(1);
    expect([d.hub, b[0].hub]).toEqual(['pikine', 'plateau']);
    expect([d.name, b[0].name]).toEqual(['Garage Modou · Motos sportives', 'Ndiaye Auto · Motos sportives']);
    expect([d.paint, b[0].paint]).toEqual([{ seed: sabarSeedOf(0), colour: 'rouge et blanc' }, { seed: sabarSeedOf(1), colour: 'jaune et noir' }]);
    expect(SABAR_PAINTS.map(p => p.name)).toEqual(['rouge et blanc', 'jaune et noir']);
    expect(sabarPaintOf(sabarSeedOf(1)).name).toBe('jaune et noir'); expect(sabarPaintOf(7).name).toBe('rouge et blanc');   // any other seed: the first
    // each colourway is a texture of the same body (the GLB's own, then a JPEG next to it)
    expect(side.paints.map(p => p.name)).toEqual(['rouge et blanc', 'jaune et noir']);
    expect(side.paints[0].texture).toBe('embedded');
    expect(readFileSync(new URL(`../public/assets/vehicles/${side.paints[1].texture}`, import.meta.url)).length).toBeGreaterThan(50_000);   // a real 1024-px JPEG
    expect(sabar.def.sound).toBe('sport'); expect(sabar.def.kit).toBe('moto');
  });

  it('its price card names the bike, the price and the colourway; a car\'s card is unchanged', () => {
    expect(cardLines('Sabar 600', fcfa(2_000_000), 'rouge et blanc', 'MOTO')).toEqual({ head: 'MOTO', name: 'Sabar 600', price: fcfa(2_000_000), foot: 'ROUGE ET BLANC · PRIX FIXE' });
    expect(cardLines('Sabar 600', fcfa(2_000_000), 'jaune et noir', 'MOTO').foot).toBe('JAUNE ET NOIR · PRIX FIXE');
    expect(cardLines('Teranga', fcfa(4_000_000))).toEqual({ head: 'VOITURE', name: 'Teranga', price: fcfa(4_000_000), foot: 'À VENDRE · PRIX FIXE' });
    expect(fcfa(2_000_000).replace(/\D/g, '')).toBe('2000000');
  });

  it('the stands: on the pavement by the road, the bike for sale with its card, delivered at the kerb in front, out of the garage\'s repair bay and the Jakarta\'s corner', () => {
    const garage = { id: 'pikine:garage:31', x: 102, z: -5.5 } as Interactable;
    const modou = sabarModou({ id: 'pikine', interactables: [garage] } as unknown as HubWorld)!;
    expect(modou.forSale).toBe(0); expect(modou.displays[0].seed).toBe(sabarSeedOf(0)); expect(modou.card).toBeTruthy();
    expect(modou.delivery).toMatchObject({ z: -4.3 }); expect(Math.abs(modou.delivery.yaw + Math.PI / 2)).toBeLessThan(1e-9);    // the kerb lane, heading with that side's traffic
    expect(modou.displays[0].z).toBeLessThan(-5.2); expect(modou.displays[0].z).toBeGreaterThan(-7.5);                              // on the pavement
    expect(modou.displays[0].x).toBeLessThan(garage.x - 1.5 - 2.7 - 1);                                                              // west of the repair bay (x 97.8–103.2) and the Jakarta's delivery
    const nd = sabarNdiaye({ id: 'plateau', interactables: [] } as unknown as HubWorld)!;
    expect(nd.displays[0].seed).toBe(sabarSeedOf(1));
    expect(nd.delivery).toMatchObject({ x: NDIAYE_SABAR.road - 4.3, z: NDIAYE_SABAR.z });
    for (const p of [nd.counter, nd.displays[0], nd.sign]) expect(p.z > 101 || p.x > 112, JSON.stringify(p)).toBe(true);           // outside Ndiaye Auto's hall (x 103–112, z 87–101)
    expect(sabarNdiaye({ id: 'pikine', interactables: [] } as unknown as HubWorld)).toBeNull();
  });
});

describe('the Sabar 600 rides like a sport bike', () => {
  const s = sabarSpec(), j = motoSpec();
  it('a two-wheeler ridden tucked on its own seat, with the chase, the bars and the top views, each framed for a phone held upright', () => {
    expect(s.kind).toBe('moto'); expect(s.cabin).toBe('open'); expect(s.drive!.lean).toBe(true);
    expect(s.driver).toMatchObject({ id: 'driver', clip: 'RideSport', y: SABAR_BODY.seat.top, z: SABAR_BODY.seat.z });
    expect(s.cameras.map(c => c.id)).toEqual(['chase', 'guidon', 'haut']); expect(s.cameras.every(c => c.portrait)).toBe(true);
    expect(s.cameras.every(c => !c.inside)).toBe(true);                                         // the bike is never hidden from the rider's own views
    expect(s.length).toBe(SABAR_BODY.length); expect(s.length).toBeGreaterThan(j.length);
  });
  it('is faster than the Jakarta (top speed, pick-up, brakes) but within what the cars reach, and its solid boxes cover its length', () => {
    const d = s.drive!, m = j.drive!;
    expect(d.maxSpeed).toBeGreaterThan(m.maxSpeed); expect(d.boostSpeed!).toBeGreaterThan(m.boostSpeed!);
    expect(d.accel).toBeGreaterThan(m.accel * 1.25); expect(d.brake).toBeGreaterThan(m.brake);
    expect(speedAfter(d, 3)).toBeGreaterThan(speedAfter(m, 3) + 3);
    expect(d.boostSpeed!).toBeLessThanOrEqual(56);                                                // the berline's boosted top speed: the roads already carry it
    expect(d.turnRadius).toBeLessThan(4.2);                                                        // still turns inside a street, tighter than any car
    const boxes = footprint(d, 0, 0, 0, 1.2);
    expect(Math.min(...boxes.map(b => b.z0))).toBeCloseTo(-SABAR_BODY.length / 2); expect(Math.max(...boxes.map(b => b.z1))).toBeCloseTo(SABAR_BODY.length / 2);
  });
  it('sounds like a bigger engine than the Jakarta: a lower idle, revs higher, six gears; still quieter than a car; its own horn pitch', () => {
    expect(profileFor('sport')).toBe(PROFILES.sport);
    expect(PROFILES.sport.idleRate[0]).toBeLessThan(PROFILES.moto.idleRate[0]); expect(PROFILES.sport.revRate[1]).toBeGreaterThan(PROFILES.moto.revRate[1]);
    expect(PROFILES.sport.gears).toBe(6); expect(PROFILES.sport.idle).toBe(PROFILES.moto.idle);
    expect(PROFILES.sport.drive * PROFILES.sport.level).toBeLessThan(PROFILES.sedan.drive * PROFILES.sedan.level);
    expect(HORNS.sport.sample).toBe('horn-moto'); expect(HORNS.sport.rate).toBeLessThan(HORNS.moto.rate);
  });
});

describe('the Sabar 600\'s body: the front end steers about its raked axis, both wheels spin', () => {
  const { root, gltf } = glbNodes(), named = (n: string) => root.getObjectByName(n)!;
  it('the shipped GLB and its sidecar are the numbers the game uses (wheels, axis, size), within a centimetre', () => {
    const fr = side.wheels.find(w => w.id === 'fr')!, rr = side.wheels.find(w => w.id === 'rr')!;
    expect(Math.abs(fr.z - SABAR_BODY.wheels.front.z)).toBeLessThan(0.01); expect(Math.abs(fr.r - SABAR_BODY.wheels.front.r)).toBeLessThan(0.01);
    expect(Math.abs(rr.z - SABAR_BODY.wheels.rear.z)).toBeLessThan(0.01); expect(Math.abs(rr.r - SABAR_BODY.wheels.rear.r)).toBeLessThan(0.01);
    expect(Math.abs(side.steer.rake - SABAR_BODY.steer.rake)).toBeLessThan(0.01);
    side.steer.pivot.forEach((v, k) => expect(Math.abs(v - SABAR_BODY.steer.pivot[k])).toBeLessThan(0.01));
    expect(Math.abs(side.length - SABAR_BODY.length)).toBeLessThan(0.01); expect(Math.abs(side.height - SABAR_BODY.height)).toBeLessThan(0.01);
    expect(side.checks.every(c => c.ok)).toBe(true);
    // in line with the shipped vehicles: one material, four meshes (body, front end, two wheels), the GLB about a megabyte at most
    expect(gltf.materials).toHaveLength(1); expect(gltf.materials[0].name).toBe('paint');
    expect(gltf.meshes).toHaveLength(4); expect(side.tris).toBeLessThanOrEqual(16500); expect(side.bytes).toBeLessThan(1_100_000);
    expect(SABAR_BODY.grips[0][1]).toBeGreaterThan(SABAR_BODY.seat.top); expect(SABAR_BODY.grips[0][2]).toBeGreaterThan(SABAR_BODY.seat.z + 0.5);   // low clip-ons, well forward
    expect(SABAR_BODY.pegs[0][2]).toBeGreaterThan(SABAR_BODY.seat.z); expect(SABAR_BODY.pegs[0][2]).toBeLessThan(SABAR_BODY.seat.z + 0.25);         // rear-set pegs
  });
  it('the rig: the rear wheel and the front wheel spin with the distance ridden; the fork turns, the rear axle never does', () => {
    const rig = rigOf(root, sabarKit().drive.steerMax);
    expect(rig.fork?.name).toBe('fork');
    expect(rig.wheels.map(w => w.spin.name).sort()).toEqual(['wheel_fr', 'wheel_rr']);
    expect(rig.wheels.every(w => !w.steer)).toBe(true);                                             // the front axle does not steer by itself: the fork carries it
    animateGlbRig(rig, 10, 0.3, 0.1);
    for (const w of rig.wheels) expect(w.spin.rotation.x).toBeCloseTo(((10 * 0.1) / (w.spin.parent!.userData.r as number)) % (Math.PI * 2), 5);
    expect(rig.fork!.rotation.y).toBeCloseTo(0.3);
    animateGlbRig(rig, 10, 5, 0.1); expect(rig.fork!.rotation.y).toBeCloseTo(0.6);                  // clamped to the steering limit
    expect(named('axle_rr').rotation.y).toBe(0);
    animateGlbRig(rig, 0, 0, 0.1);
  });
  it('steering turns the whole front end about the raked axis: the axis stays put, the front wheel turns with the bars, the rear does not move', () => {
    const rig = rigOf(root, 0.6), pivot = new THREE.Vector3(...SABAR_BODY.steer.pivot);
    const at = (o: THREE.Object3D, p = new THREE.Vector3()) => { root.updateMatrixWorld(true); return o.localToWorld(p.clone()); };
    const axisOf = () => { root.updateMatrixWorld(true); return new THREE.Vector3(0, 1, 0).transformDirection(named('steer').matrixWorld); };
    const axleDir = (o: THREE.Object3D) => { root.updateMatrixWorld(true); return new THREE.Vector3(1, 0, 0).transformDirection(o.matrixWorld); };
    // the axis is raked back from the vertical, through the top clamp
    const a = axisOf(); expect(a.y).toBeCloseTo(Math.cos(SABAR_BODY.steer.rake), 3); expect(a.z).toBeCloseTo(-Math.sin(SABAR_BODY.steer.rake), 3);
    expect(at(named('steer')).distanceTo(pivot)).toBeLessThan(0.01);
    const grip0 = at(named('fork'), new THREE.Vector3(0.31, 0, 0)), rear0 = at(named('axle_rr')), hub0 = at(named('axle_fr'));
    animateGlbRig(rig, 0, 0.4, 0);                                                                 // + = to the left
    const d = axleDir(named('wheel_fr')), grip1 = at(named('fork'), new THREE.Vector3(0.31, 0, 0));
    expect(Math.acos(Math.abs(d.x))).toBeGreaterThan(0.3);                                         // the front wheel's axle has turned (0.4 rad about a 28° raked axis)
    expect(d.z).toBeLessThan(-0.3);                                                                // its left end swung back: the wheel points left
    expect(grip1.z).toBeLessThan(grip0.z - 0.08);                                                  // the left clip-on comes back towards the rider
    expect(at(named('axle_rr')).distanceTo(rear0)).toBeLessThan(1e-9); expect(Math.abs(axleDir(named('wheel_rr')).x)).toBeCloseTo(1, 9);
    expect(at(named('axle_fr')).distanceTo(hub0)).toBeLessThan(0.05);                             // the front hub stays (almost) where it was: it is near the axis
    animateGlbRig(rig, 0, 0, 0);
  });
  it('leans into a corner like the kit\'s motorbikes, and reports the lean the rider follows', () => {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    g.userData.vehicleSpec = sabarKit(); g.userData.glbRig = rigOf(glbNodes().root, 0.6);
    for (let i = 0; i < 60; i++) animateVehicle(g, 15, -0.4, 1 / 30);                              // a right-hand corner at 54 km/h
    const lean = (g.userData.kitAnim as { lean: number }).lean;
    expect(lean).toBeGreaterThan(0.3); expect(lean).toBeLessThanOrEqual(sabarKit().drive.lean + 1e-9);
    expect(body.rotation.z).toBeCloseTo(lean);
  });
});

describe('the rider on the Sabar 600 (the tucked RideSport pose)', () => {
  const char = (p: readonly number[]) => new THREE.Vector3(p[0], p[1], p[2]);
  it('v4: hands on the clip-ons, feet on the rear-set pegs, the saddle under the hips, tucked lower and further forward than on the Jakarta', () => {
    const { root, clips } = loadRig();
    const built = buildPoseClips(root, clips), p = posed(root, built.find(c => c.name === 'RideSport')!);
    const tip = (b: string, l: number) => p.pos(b).add(p.dir(b).multiplyScalar(l));
    expect(p.pos('hips').y).toBeCloseTo(0.5, 2);
    for (const [i, s] of (['L', 'R'] as const).entries()) {
      expect(tip(`hand${s}`, 0.085).distanceTo(char(SABAR_RIDER.grips[i])), `hand ${s}`).toBeLessThan(0.08);
      expect(p.pos(`foot${s}`).distanceTo(char(SABAR_RIDER.pegs[i])), `foot ${s}`).toBeLessThan(0.08);
      expect(Math.abs(p.pos(`shin${s}`).x)).toBeLessThan(0.26);                                   // knees against the tank
    }
    const { root: r2, clips: c2 } = loadRig(), j = posed(r2, buildPoseClips(r2, c2).find(c => c.name === 'Ride')!);
    expect(p.pos('head').y).toBeLessThan(j.pos('head').y - 0.04); expect(p.pos('head').z).toBeGreaterThan(j.pos('head').z + 0.1);
    expect(p.dir('spine').z).toBeGreaterThan(j.dir('spine').z + 0.1);                               // the back leans further forward
  });
  it('a body whose hand has a palm (the Meshy bodies): the palm is on the grip, for each scale', () => {
    for (const k of [1, 0.93]) {
      const { root, clips } = loadRig(), p = posed(root, buildPoseClips(root, clips, { scale: k }).find(c => c.name === 'RideSport')!);
      for (const [i, s] of (['L', 'R'] as const).entries()) {
        const palm = p.pos(`hand${s}`).add(p.dir(`hand${s}`).multiplyScalar(0.085)).add(new THREE.Vector3(0, -0.03, 0));
        const g = char(SABAR_RIDER.grips[i]); g.y -= 0.02; g.divideScalar(k);
        expect(palm.distanceTo(g), `scale ${k} hand ${s}`).toBeLessThan(0.03);
      }
    }
  });
});

describe('owning the Sabar 600: once, in the colour of the dealer, saved', () => {
  it('paid once at its price, the dealer\'s paint kept with it across a save, listed and sold like any vehicle', () => {
    const s = new GameState(newSave(0)); s.data.wallet = 2_500_000;
    expect(ownsVehicle(s, 'sabar')).toBe(false);
    park(s.data, { asset: 'sabar', hub: 'plateau', x: 115.7, z: 105, yaw: 0 }); setPaintSeed(s.data, 'sabar', sabarSeedOf(1));
    const l0 = s.data.ledger.length;
    expect(buyAsset(s, 'sabar')).toBeTruthy();
    expect(s.wallet).toBe(500_000); expect(s.data.ledger.length - l0).toBe(1); expect(holding(s, 'sabar')?.paid).toBe(2_000_000);
    expect(buyAsset(s, 'sabar')).toBeNull(); expect(cannotBuy(s, 'sabar')).toBeTruthy();          // one bike: the other dealer cannot sell a second one
    const back = new GameState(JSON.parse(JSON.stringify(s.data)));
    expect(ownsVehicle(back, 'sabar')).toBe(true); expect(paintSeed(back.data, 'sabar')).toBe(sabarSeedOf(1));
    expect(parked(back.data, 'sabar')).toMatchObject({ hub: 'plateau', x: 115.7, z: 105 });
    // the Jakarta is untouched and can still be owned beside it
    expect(ownsVehicle(back, 'jakarta')).toBe(false); back.data.wallet = 200_000; expect(buyAsset(back, 'jakarta')).toBeTruthy();
    sellAsset(back, holding(back, 'sabar')!.uid); unpark(back.data, 'sabar');
    expect(ownsVehicle(back, 'sabar')).toBe(false); expect(paintSeed(back.data, 'sabar')).toBeNull(); expect(ownsVehicle(back, 'jakarta')).toBe(true);
  });
});
