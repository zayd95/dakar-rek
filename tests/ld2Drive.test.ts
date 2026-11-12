import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CHUNK, ChunkMats, buildChunk, frame } from '../src/road/chunks';
import { DIVIDED, MEDIAN_HALF, ROADS, ROAD_HALF } from '../src/road/routes';
import { roadCentre } from '../src/transport/lines';
import { busyEdges, clearWidth, edgeKey, eventPieces, pieceSolids, roadEvents, waysIn, type RoadEventKind } from '../src/city/roadEvents';
import { vehicleSpec, type VehicleKind } from '../src/actors/vehicleKit';
import type { HubId } from '../src/core/types';
import { CarInterior, HEADROOM, SEAT_VIEW, cabinOf, cockpitSight, designEye, driverEye, screenRows } from '../src/transport/carInterior';
import { CABINS, SITTERS, playerSeatTop, rowOf, scaleAt } from '../src/transport/cabinFit';
import { SIT_HIPS } from '../src/interact/seats';
import { fovFor } from '../src/core/view';
import { cabinInfo, cabinView, eyeInside, holdCabin } from '../src/transport/carCabin';
import { HEADLIGHT, beamStrength, headlightPool } from '../src/transport/headlightPool';
import { HEADLIGHT_UNIFORMS, addGrain } from '../src/world/grain';
import { LIGHT_BLEND } from '../src/world/lightBlend';

/**
 * The driving blockers of the owner's iPhone playtest of 24 Oct 2026 (LD2.0-A, docs/ld2/proof/drive/): the pure parts.
 *  1. the way into the Almadies from Pikine was closed by a villa wall standing across the carriageway (src/road/chunks.ts `frame` past the road's end);
 *     road events stood on the first streets in from a road or a border street, and a travaux barrier's box reached 1.3 m into the lane round its panel;
 *  2. at the wheel the body's own cabin (its driver's seat back) stood in front of the windscreen, and the eye did not follow the body in the seat;
 *  3. at night the road, its markings and its kerbs were too dark to read: the player's headlights now light the street's own materials.
 */

const mats = new ChunkMats(true);
/** Raised geometry of a chunk that stands on the carriageway: every vertex between 0.3 m and 4.4 m high (what a car would drive into) within the road's width. */
function onCarriageway(road: (typeof ROADS)[number], index: number) {
  const c = buildChunk({ road, mats, lite: false }, index), hits: [number, number, number][] = [];
  c.group.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh || m.geometry.type === 'PlaneGeometry') return;      // (the boards' faces: high on their posts, checked by the posts)
    const a = m.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i), y = a.getY(i), z = a.getZ(i); if (y < 0.3 || y > 4.4) continue;
      const p = road.spine.project(x, z);
      if (Math.abs(p.d) >= ROAD_HALF - 0.05 || p.s < 0.5 || p.s > road.length - 0.5) continue;
      // the Plateau checkpoint's island, its parasol and the cones on its splitters: on the centre line between the two lanes, by design (chunks.test.ts)
      if (road.checkpointS !== null && Math.abs(p.s - road.checkpointS) < 16 && Math.abs(p.d) < 2.5) continue;
      // M1's VDN median: a raised island on the centre line of a divided road, like the checkpoint's (CONTRACT.md row 6, agreed by LD2.0-A: kept exactly this tight)
      if (DIVIDED.has(road.profileAt(p.s)) && Math.abs(p.d) < MEDIAN_HALF + 0.05) continue;
      // M1's rond-point at the BRT crossing: its island and the splitters, on the centre line by design (CONTRACT.md row 7, agreed by LD2.0-A; chunks.test.ts guards it with the same condition)
      if (road.rounds.some(r => { const dx = x - r.x, dz = z - r.z; return Math.abs(dx * r.fx + dz * r.fz) < r.flare && (Math.hypot(dx, dz) < r.island + 0.3 || Math.abs(dx * r.lx + dz * r.lz) < 1.9); })) continue;
      hits.push([+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)]);
    }
  });
  return hits;
}

describe('the roads between districts: nothing stands on the carriageway', () => {
  for (const road of ROADS) it(`${road.id}: no wall, house, palm or post on the road's own width, from end to end`, () => {
    for (let i = 0; i < Math.ceil(road.length / CHUNK); i++) {
      const hits = onCarriageway(road, i);
      expect(hits.length, `${road.id} chunk ${i}: ${JSON.stringify(hits.slice(0, 6))}`).toBe(0);
    }
  });

  it('past the road\'s ends the frame keeps the road\'s heading (the Almadies mouth: west), and inside the road it is what it always was', () => {
    const road = ROADS.find(r => r.id === 'pikine-almadies')!, L = road.length;
    const end = frame(road, L - 0.5), past = frame(road, L + 5), far = frame(road, L + 40);
    expect(Math.abs(past.yaw - end.yaw)).toBeLessThan(1e-6); expect(Math.abs(far.yaw - end.yaw)).toBeLessThan(1e-6);
    expect(Math.abs(Math.abs(end.yaw) - Math.PI / 2)).toBeLessThan(0.05);                       // heading west (−x) into the Almadies
    expect(Math.hypot(past.x - (end.x + Math.sin(end.yaw) * 5.5), past.z - (end.z + Math.cos(end.yaw) * 5.5))).toBeLessThan(0.05);
    const before = frame(road, -6), start = frame(road, 0.5);
    expect(Math.abs(before.yaw - start.yaw)).toBeLessThan(1e-6);
    for (const s of [1, 2.5, 100, 777.7, L - 3, L - 1]) {                                        // within the road: the central difference of before
      const a = road.spine.at(s - 2), b = road.spine.at(s + 2), f = frame(road, s);
      expect(f.yaw).toBeCloseTo(Math.atan2(b.x - a.x, b.z - a.z), 9); expect(f.x).toBeCloseTo(road.spine.at(s).x, 9);
    }
  });
});

describe('road events never close the way in, and always leave a lane', () => {
  const edges: { ax: number; az: number; bx: number; bz: number }[] = [];
  for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) {
    if (a < 4) edges.push({ ax: roadCentre(a), az: roadCentre(b), bx: roadCentre(a + 1), bz: roadCentre(b) });
    if (b < 4) edges.push({ ax: roadCentre(a), az: roadCentre(b), bx: roadCentre(a), bz: roadCentre(b + 1) });
  }
  const HUBS: HubId[] = ['pikine', 'plateau', 'corniche', 'almadies'];

  it('the ways in are where the roads and the border street come in (the Almadies: from Pikine on its east side, from the Corniche on its south side)', () => {
    const w = waysIn('almadies');
    expect(w.nodes).toContainEqual({ x: 120, z: -60 });                      // the road from Pikine (src/road/routes.ts bMouth (127, −60))
    expect(w.nodes).toContainEqual({ x: -60, z: 120 });                      // the border street from the Corniche (src/transport/hubLink.ts)
    for (const e of [{ ax: 60, az: -60, bx: 120, bz: -60 }, { ax: 120, az: -120, bx: 120, bz: -60 }, { ax: 120, az: -60, bx: 120, bz: 0 }, { ax: -60, az: 60, bx: -60, bz: 120 }, { ax: -120, az: 120, bx: -60, bz: 120 }, { ax: -60, az: 120, bx: 0, bz: 120 }])
      expect(w.edges.has(edgeKey(e)), JSON.stringify(e)).toBe(true);
    expect(waysIn('corniche').nodes).toContainEqual({ x: -60, z: -120 });
    expect(waysIn('pikine').nodes.length).toBe(2); expect(waysIn('plateau').nodes.length).toBe(2);
  });

  it('no event of a year of city days stands on a street at a way in, in any district', () => {
    for (const hub of HUBS) {
      const spawn = { x: 10, z: 10 }, busy = busyEdges({ id: hub, spawn: { ...spawn, yaw: 0 } }), ways = waysIn(hub).edges;
      for (const k of ways) expect(busy.has(k)).toBe(true);
      let n = 0;
      for (let d = 1; d <= 365 * 4; d++) for (const ev of roadEvents(hub, d, edges, busy, spawn)) { n++; expect(ways.has(edgeKey(ev.edge)), `${hub} day ${d}: ${ev.kind} on ${edgeKey(ev.edge)}`).toBe(false); }
      expect(n).toBeGreaterThan(365);                                         // and there still are events, one or two a day
    }
  });

  const size = (k: VehicleKind) => { const s = vehicleSpec(k, { seed: 1, driver: false, passengers: false }); return { length: s.length, width: s.width, height: s.height }; };
  const KINDS: RoadEventKind[] = ['checkpoint', 'panne', 'accident', 'travaux', 'bouchon'];

  it('every kind leaves a whole lane clear: more than 3.5 m between its solid things and the far kerb (a car and its margin need 3 m)', () => {
    for (const kind of KINDS) {
      const solids = eventPieces(kind).flatMap(p => pieceSolids(p, size));
      expect(solids.length, kind).toBeGreaterThan(0);
      expect(clearWidth(solids), kind).toBeGreaterThan(3.5);
      // and the lane left is the other one (lat < 0): nothing solid crosses the centre line by more than a few centimetres
      for (const b of solids) expect(b.lat - b.hc, `${kind} ${JSON.stringify(b)}`).toBeGreaterThan(-0.25);
    }
  });

  it('what is solid is what is drawn: a travaux barrier is its 2.4 m panel, not a 2.6 m square round it; a car turned across the lane is three squares along it', () => {
    const t = eventPieces('travaux'), barriers = t.filter(p => p.what === 'barrier');
    expect(barriers.length).toBe(2);
    for (const b of barriers) { const [s] = pieceSolids(b, size); expect(s.ha).toBeCloseTo(1.2, 6); expect(s.hc).toBeLessThanOrEqual(0.15); }
    const taxi = eventPieces('accident').find(p => p.what === 'vehicle' && p.kind === 'taxi')!, sq = pieceSolids(taxi, size), v = size('taxi');
    expect(sq.length).toBe(3);
    // squares of the car's half width, centred on its own axis (the old axis-aligned box of the car turned 0.5 rad reached 0.8 m past its body across the lane)
    for (const b of sq) { expect(b.ha).toBeCloseTo(v.width / 2, 6); expect(b.hc).toBeCloseTo(v.width / 2, 6); expect(Math.hypot(b.along - taxi.along, b.lat - taxi.lat)).toBeLessThanOrEqual(v.length / 2 - v.width / 2 + 1e-9); }
    const lats = sq.map(b => b.lat); expect(Math.max(...lats) - Math.min(...lats)).toBeGreaterThan(0.5);   // turned: the squares follow its heading across the lane
  });
});

describe('at the wheel: the eye, the road over the bonnet, the wheel and the dash low in the frame', () => {
  /** The player's cars, by the CABINS row their module uses, with the kit spec their interior is built from. */
  const CARS: [string, string, ReturnType<typeof vehicleSpec>][] = [
    ['Teranga', 'teranga', vehicleSpec('sedan', { seed: 1000, driver: false, passengers: false, model: 'teranga' })],
    ['Rafet', 'rafet', vehicleSpec('sedan', { seed: 1000, driver: false, passengers: false, model: 'rafet' })],
    ['Lamane Sport', 'suv', vehicleSpec('suv', { seed: 1000, driver: false, passengers: false, model: 'lamane' })],
    ['Gaïndé', 'gainde', vehicleSpec('suv', { seed: 1000, driver: false, passengers: false, model: 'gainde' })],
    ['Berline moderne', 'car', vehicleSpec('sedan', { seed: 14, driver: false, passengers: false })],
    ['berline neuve', 'berline', vehicleSpec('luxury', { seed: 3, driver: false, passengers: false })],
  ];
  /** The eye of each player body (the studio's homme and femme, and the v4 body) in the driver's seat, as src/transport/ownedModule.ts seats it. */
  const eyes = (id: string, k: ReturnType<typeof vehicleSpec>) => {
    const c = cabinOf(k), drv = k.seats.find(s => s.kind === 'driver')!, row = rowOf(CABINS[id], 'driver'), origin = playerSeatTop(row, drv.top) - SIT_HIPS;
    return (['meshy_m', 'meshy_f', 'v4'] as const).map(b => { const p = scaleAt(row, origin, SITTERS[b]); return { body: b, head: p, eye: driverEye(c, { top: p.head, scale: p.scale }) }; });
  };

  it('the eye is the body\'s own, held in the seat\'s travel: inside the cabin, under the headliner, in front of the seat back, behind the wheel; homme and femme alike', () => {
    for (const [name, id, k] of CARS) {
      const c = cabinOf(k), d = designEye(c), all = eyes(id, k);
      for (const { body, head, eye } of all) {
        const at = `${name} ${body} ${JSON.stringify(eye)}`;
        expect(Math.abs(eye[0]), at).toBeLessThan(c.W / 2 - 0.25);
        expect(c.roof - 0.04 - eye[1], at).toBeGreaterThanOrEqual(HEADROOM - 1e-9);                // never into the roof lining (the near plane is 0.1 m)
        expect(eye[1], at).toBeLessThan(head.head);                                                 // under the top of the body's own head
        expect(eye[1] - d[1], at).toBeGreaterThanOrEqual(-1e-9); expect(eye[1] - d[1], at).toBeLessThanOrEqual(0.04 + 1e-9);
        expect(eye[2], at).toBeGreaterThan(c.frontZ - 0.3 + 0.08);                                 // in front of the seat back's face
        expect(eye[2], at).toBeLessThan(c.zWs - 0.5);
      }
      const ys = all.map(a => a.eye[1]); expect(Math.max(...ys) - Math.min(...ys), name).toBeLessThan(0.05);
    }
  });

  it('from every eye the road shows over the bonnet a few metres ahead, the rim of the wheel and the dash stay under that sightline, and no pillar, header or roof is within the near plane', () => {
    for (const [name, id, k] of CARS) {
      const c = cabinOf(k);
      for (const { body, eye } of [...eyes(id, k), { body: 'design', eye: designEye(c) }]) {
        const s = cockpitSight(c, eye), at = `${name} ${body} ${JSON.stringify(s)}`;
        expect(s.nearRoad, at).toBeGreaterThan(3); expect(s.nearRoad, at).toBeLessThan(9);
        expect(s.wheelTop - s.overNose, at).toBeGreaterThan(2);                                     // the wheel never hides the road
        expect(s.dashLip - s.overNose, at).toBeGreaterThan(2);                                      // nor the dash, nor the cluster's hood
        expect(s.pillar, at).toBeGreaterThan(SEAT_VIEW.near + 0.15); expect(s.header, at).toBeGreaterThan(SEAT_VIEW.near + 0.1); expect(s.headroom, at).toBeGreaterThan(SEAT_VIEW.near + 0.04);
        expect(s.wheel, at).toBeGreaterThan(0.42); expect(s.wheel, at).toBeLessThan(0.62);
      }
    }
  });

  it('on a phone held upright (390 × 844) and on its side (844 × 390): the horizon in the upper part of the screen, a band of road under it (a tenth of the screen upright, nearly a fifth on its side: the SUVs see the road from 8 m), the wheel and the dash below the road', () => {
    for (const [w, h, pitch, vfov, band] of [[390, 844, SEAT_VIEW.pitchPortrait, SEAT_VIEW.fovPortrait, 0.1], [844, 390, SEAT_VIEW.pitch, fovFor(844, 390), 0.18]] as const) {
      for (const [name, id, k] of CARS) for (const { body, eye } of eyes(id, k)) {
        const r = screenRows(cockpitSight(cabinOf(k), eye), pitch, vfov), at = `${name} ${body} ${w}×${h} ${JSON.stringify(r)}`;
        expect(r.horizon, at).toBeGreaterThan(0.25); expect(r.horizon, at).toBeLessThan(0.45);
        expect(r.nose - r.horizon, at).toBeGreaterThan(band);
        expect(r.wheel, at).toBeGreaterThan(r.nose + 0.03); expect(r.dash, at).toBeGreaterThan(r.nose + 0.02);
      }
    }
  });

  it('fitEye moves the camera\'s eye, never the wheel, the dash or the pillars', () => {
    const [, id, k] = CARS[2], ir = new CarInterior(cabinOf(k), 'premium'), before = ir.wheelAt.clone(), e = eyes(id, k)[0];
    ir.fitEye({ top: e.head.head, scale: e.head.scale });
    expect(ir.eye.toArray().map(v => +v.toFixed(4))).toEqual(e.eye); expect(ir.wheelAt.distanceTo(before)).toBe(0); expect(ir.design.toArray()).toEqual(designEye(cabinOf(k)));
    ir.fitEye(null); expect(ir.eye.distanceTo(ir.design)).toBeLessThan(1e-4);
  });

  it('the body\'s own cabin (its seats and lining) is not drawn while the camera is at the wheel, and comes back for the street\'s eyes after', () => {
    const body = new THREE.Group(), model = new THREE.Group(), cabin = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)), door = new THREE.Group();
    cabin.name = 'cabin'; model.add(cabin, door); model.name = 'glb_teranga'; model.userData.vehicleSpec = {}; model.userData.kitDoor = door; model.userData.kitCabin = cabin; body.add(model);
    cabin.visible = false; holdCabin(body, 'driver', true); cabinView(body, null);
    expect(cabin.visible).toBe(true);                                                                // seen from the street: the driver in his seat
    eyeInside(body, true); cabinView(body, null);
    expect(cabin.visible).toBe(false); expect(cabinInfo(body).eyeInside).toBe(true); expect(cabinInfo(body).glassOn).toBe(false);
    eyeInside(body, false); cabinView(body, null);
    expect(cabin.visible).toBe(true);
    holdCabin(body, 'driver', false); cabinView(body, null);
  });
});

describe('at night: the headlights light the street, the lamps\' pools light what is under them', () => {
  it('the beam is off by day, comes on at dusk, full at night; a motorbike\'s is weaker', () => {
    expect(beamStrength(0)).toBe(0); expect(beamStrength(0.3)).toBe(0);
    expect(beamStrength(0.5)).toBeGreaterThan(0); expect(beamStrength(0.5)).toBeLessThan(HEADLIGHT.strength);
    expect(beamStrength(1)).toBe(HEADLIGHT.strength); expect(beamStrength(1, true)).toBeLessThan(beamStrength(1));
  });

  it('the vehicle at the wheel sets the shared uniforms (its front bumper, its heading); another vehicle cannot switch them off; by day or on foot they are off', () => {
    const me = {}, other = {};
    headlightPool.place(me, 10, 0, -4, Math.PI / 2, 2, 1);
    expect(HEADLIGHT_UNIFORMS.uHlK.value).toBe(HEADLIGHT.strength);
    expect(HEADLIGHT_UNIFORMS.uHlPos.value.toArray().map(v => +v.toFixed(3))).toEqual([12, HEADLIGHT.height, -4]);
    expect(HEADLIGHT_UNIFORMS.uHlDir.value.toArray().map(v => +v.toFixed(3))).toEqual([1, 0]);
    headlightPool.release(other); expect(HEADLIGHT_UNIFORMS.uHlK.value).toBeGreaterThan(0);
    headlightPool.place(me, 10, 0, -4, 0, 2, 0.1); expect(HEADLIGHT_UNIFORMS.uHlK.value).toBe(0);             // daylight
    headlightPool.place(me, 10, 0, -4, 0, 2, 1); headlightPool.release(me); expect(HEADLIGHT_UNIFORMS.uHlK.value).toBe(0);   // on foot
  });

  it('every grain material (the road, its markings, the kerbs, the walls) takes the beam in its lighting, with the same uniform objects (one update a frame)', () => {
    const a = addGrain(new THREE.MeshLambertMaterial({ vertexColors: true }), 1, 1), b = addGrain(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.5, 1, false);
    for (const m of [a, b]) {
      const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
      m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer);
      expect(shader.fragmentShader).toContain('float hlBeam(');
      expect(shader.fragmentShader).toMatch(/#include <lights_fragment_end>\s*if \(uHlK > 0\.0\) reflectedLight\.directDiffuse \+= diffuseColor\.rgb/);
      for (const k of Object.keys(HEADLIGHT_UNIFORMS) as (keyof typeof HEADLIGHT_UNIFORMS)[]) expect(shader.uniforms[k]).toBe(HEADLIGHT_UNIFORMS[k]);
      expect(m.customProgramCacheKey()).toMatch(/^grain-hl-/);
    }
  });

  it('the lamps\' pools multiply what is under them (an additive glow washed the white markings into the asphalt)', () => {
    expect(LIGHT_BLEND.blending).toBe(THREE.CustomBlending); expect(LIGHT_BLEND.blendSrc).toBe(THREE.DstColorFactor); expect(LIGHT_BLEND.blendDst).toBe(THREE.OneFactor);
    const mats = new ChunkMats(true);
    expect(mats.glow.blending).toBe(THREE.CustomBlending); expect(mats.glow.premultipliedAlpha).toBe(true); expect(mats.glow.depthWrite).toBe(false);
  });
});
