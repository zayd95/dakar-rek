import { describe, expect, it } from 'vitest';
import { entrySide, exitSide, kerbSpot, nodeAhead, routeIn, routeOut, taxiFare, EDGE } from '../src/transport/taxiRules';
import { openLanePath, lanePath, Path } from '../src/transport/route';
import { LINES, arenaEvening, loopNodes, roadCentre } from '../src/transport/lines';
import { gateOf, crossesQueue, queueDistance } from '../src/arena/exteriorRules';
import { travelLeg } from '../src/world/content';

const ON_GRID = roadCentre(4) + 0.5;
/** Every point of a route lies on a road centre line (x or z on the grid) or beyond the map's edge. */
const onRoads = (pts: { x: number; z: number }[]) => pts.every(p => [0, 1, 2, 3, 4].some(k => Math.abs(p.x - roadCentre(k)) < 1e-6 || Math.abs(p.z - roadCentre(k)) < 1e-6));

describe('taxis between neighbourhoods (rules)', () => {
  it('leaves by the side that faces the destination and comes in by the side that faces the origin', () => {
    expect(exitSide('pikine', 'almadies')).toBe('x-');                   // Pikine is east of Ngor
    expect(entrySide('pikine', 'almadies')).toBe('x+');                  // a taxi from Pikine comes into Almadies from the east
    expect(exitSide('almadies', 'pikine')).toBe('x+');
    for (const a of ['plateau', 'corniche', 'almadies', 'pikine'] as const) for (const b of ['plateau', 'corniche', 'almadies', 'pikine'] as const) {
      if (a === b) continue;
      expect(entrySide(a, b)).toBe(exitSide(b, a));
    }
  });

  it('costs more than the car rapide, shown in hundreds', () => {
    const f = taxiFare('pikine', 'almadies');
    expect(f).toBeGreaterThan(travelLeg('pikine', 'almadies').cost); expect(f % 100).toBe(0); expect(f).toBeGreaterThanOrEqual(1500);
    expect(taxiFare('almadies', 'pikine')).toBe(f);
  });

  it('a kerb spot sits 4.3 m off the nearest road, heading with the traffic of that side (driving on the right)', () => {
    const s = kerbSpot(-6, -45);                                          // Pikine, west of the road x = 0
    expect(s.x).toBeCloseTo(-4.3); expect(s.z).toBeCloseTo(-45); expect(s.yaw).toBeCloseTo(0);
    const right = { x: -Math.cos(s.yaw), z: Math.sin(s.yaw) };            // the kerb is on the right
    expect(right.x).toBeCloseTo(-1);
    const n = kerbSpot(-36, -138);                                        // Ngor: La Vague is north of the road z = −120
    expect(n.z).toBeCloseTo(-124.3); expect(n.yaw).toBeCloseTo(-Math.PI / 2);
    expect(nodeAhead(s.x, s.z, s.yaw)).toEqual({ x: 0, z: 0 });
    expect(nodeAhead(n.x, n.z, n.yaw)).toEqual({ x: -60, z: -120 });
  });

  it('routes out of a hub along roads: straight on, one turn, or round the block when the exit is behind', () => {
    const pik = kerbSpot(-6, -45);
    const out = routeOut(pik, 'x-');
    expect(out).toEqual([{ x: 0, z: -45 }, { x: 0, z: 0 }, { x: -EDGE, z: 0 }]);                    // north, then left to the west edge
    const ngor = kerbSpot(-36, -138), back = routeOut(ngor, 'x+');
    expect(back[0]).toEqual({ x: -36, z: -120 }); expect(back.at(-1)!.x).toBe(EDGE);               // round the block to go east
    expect(back.length).toBe(4);
    for (const r of [out, back]) expect(onRoads(r)).toBe(true);
    for (const p of [...out, ...back].slice(0, -1)) expect(Math.abs(p.x) <= ON_GRID || Math.abs(p.z) <= ON_GRID).toBe(true);
  });

  it('routes in from the edge to the kerb spot, arriving with the spot\'s heading, and drives on past it', () => {
    const drop = kerbSpot(-6, -33);
    const r = routeIn(drop, 'x-');
    expect(r[0].x).toBe(-EDGE);
    const i = r.findIndex(p => Math.abs(p.z - drop.z) < 1e-6 && Math.abs(p.x) < 1e-6);
    expect(i).toBeGreaterThan(0);
    const last = r.at(-1)!, before = r[i];
    expect(Math.sign(last.z - before.z)).toBe(Math.sign(Math.cos(drop.yaw)));                     // on in the drop's heading
    // the lane of the route keeps to the right: at the drop the lane is between the centre line and the kerb spot
    const lane = openLanePath(r, 2, 9), path = new Path(lane), s = path.project(drop.x + 2.3, drop.z), p = { x: 0, z: 0, yaw: 0 };
    path.sample(s, p);
    expect(p.x).toBeCloseTo(-2, 1);
  });

  it('an open lane path keeps its ends and turns corners on the right lane', () => {
    const pts = openLanePath([{ x: 0, z: -45 }, { x: 0, z: 0 }, { x: -136, z: 0 }], 2, 9);
    expect(pts[0]).toEqual({ x: -2, z: -45 });                             // heading +z: the right is −x
    expect(pts.at(-1)!.z).toBeCloseTo(-2);                                 // heading −x (west): the right is −z (north)
    const path = new Path(pts), end = path.at(pts.length - 1);
    expect(end).toBeGreaterThan(45 + 136 - 20); expect(end).toBeLessThan(45 + 136 + 5);
  });
});

describe('Ligne 23 on fight evenings', () => {
  const day = LINES.find(l => l.id === '23')!, night = LINES.find(l => l.id === '23s')!;
  const gate = gateOf({ cx: (roadCentre(2) + roadCentre(3)) / 2, cz: (roadCentre(1) + roadCentre(2)) / 2 });

  it('one of the two routes runs at any hour: the day route, then the evening route from 16 h to midnight', () => {
    for (let h = 0; h < 24; h += 0.5) expect(!!day.runs!(1, h) !== !!night.runs!(1, h)).toBe(true);
    expect(arenaEvening(15.9)).toBe(false); expect(arenaEvening(16)).toBe(true); expect(arenaEvening(23.9)).toBe(true); expect(arenaEvening(0.5)).toBe(false);
    expect(night.number).toBe(day.number);
  });

  it('neither the day route nor the evening route crosses the queue in front of the gate; both stop near it', () => {
    const lane = (l: typeof day) => lanePath(loopNodes(l), 2.0, 4.5);
    const crosses = (pts: { x: number; z: number }[]) => pts.some((p, i) => { const q = pts[(i + 1) % pts.length]; return crossesQueue(gate, p.x, p.z, q.x, q.z, 2); });
    expect(crosses(lane(day))).toBe(false);                                     // the barriers stand there by day too (tests/gatePlaza.test.ts)
    expect(crosses(lane(night))).toBe(false);
    for (const l of [day, night]) {
      const arene = l.stops.find(s => s.id === 'arene')!, nodes = loopNodes(l);
      const a = nodes[arene.leg], b = nodes[(arene.leg + 1) % nodes.length], len = Math.hypot(b.x - a.x, b.z - a.z);
      const at = { x: a.x + ((b.x - a.x) / len) * arene.at, z: a.z + ((b.z - a.z) / len) * arene.at };
      expect(Math.hypot(at.x - gate.x, at.z - gate.z)).toBeLessThan(35);
      expect(queueDistance(gate, at.x, at.z)).toBeGreaterThan(10);
    }
  });
});
