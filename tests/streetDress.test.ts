import { describe, expect, it } from 'vitest';
import { stubCanvas } from './hubstub';
import { buildHub } from '../src/world/builder';
import { DRESS_COUNT, dressHub } from '../src/game/streetDress';
import { placeParked, PARKED_COUNT } from '../src/game/parkedVehicles';
import { HUB_STREETS, pavementLanes } from '../src/crowd/streetPlan';
import { linesOf, stopOnLeg } from '../src/transport/lines';
import type { HubId } from '../src/core/types';

stubCanvas();

describe('street dress: stalls, cantines, billboards and plates on the main roads', () => {
  for (const id of ['plateau', 'pikine', 'mermoz'] as HubId[]) {
    it(`${id}: placed from the seed, off the stops and the crossings, solid pieces leave the pavement lanes of the busy streets`, () => {
      const hub = buildHub(id, true);
      const lanesBefore = pavementLanes(hub.edges, hub.colliders, HUB_STREETS[id].busy);
      const colsBefore = hub.colliders.length;
      const r = dressHub(hub, 'medium');
      const N = DRESS_COUNT.medium;
      const by = (k: string) => r.items.filter(i => i.kind === k).length;
      expect(by('stall')).toBeGreaterThanOrEqual(Math.floor(N.stalls * 0.6));
      expect(by('cantine')).toBeGreaterThanOrEqual(1);
      expect(by('board')).toBeGreaterThanOrEqual(1);
      expect(by('plate')).toBeGreaterThanOrEqual(2);
      expect(r.mesh).not.toBeNull();
      expect(hub.colliders.length).toBeGreaterThan(colsBefore);
      // not on a stop's pavement
      for (const line of linesOf(id)) for (const def of line.stops) {
        const s = stopOnLeg(line, def);
        for (const i of r.items) if (i.kind !== 'plate') expect(Math.hypot(i.x - s.x, i.z - s.z)).toBeGreaterThan(8);
      }
      // the busy streets keep their pavement lanes
      const lanesAfter = pavementLanes(hub.edges, hub.colliders, HUB_STREETS[id].busy);
      expect(lanesAfter.filter(l => l.w > 1).length).toBeGreaterThanOrEqual(Math.floor(lanesBefore.filter(l => l.w > 1).length * 0.7));
      // the same hub, the same street
      const again = dressHub(buildHub(id, true), 'medium').items.map(i => `${i.kind}${Math.round(i.x)},${Math.round(i.z)}`);
      expect(again).toEqual(r.items.map(i => `${i.kind}${Math.round(i.x)},${Math.round(i.z)}`));
    });
  }

  it('Mermoz: Rue de Sacré-Cœur lined with Jakarta motorbikes and taxis, the villa streets keep cars along their walls', () => {
    const hub = buildHub('mermoz', true), g = placeParked(hub, PARKED_COUNT.medium);
    const onSC = g.children.filter(o => Math.abs(o.position.x + 60) < 8), elsewhere = g.children.length - onSC.length;
    expect(onSC.length).toBeGreaterThanOrEqual(g.children.length * 0.5);                 // the shopping street first
    expect(onSC.filter(o => o.name === 'kit_moto').length).toBeGreaterThanOrEqual(6);   // rows of motorbikes nose to the kerb
    expect(elsewhere).toBeGreaterThanOrEqual(g.children.length * 0.25);                  // and the quiet streets are not emptied
  });

  it('the parked cars of a busy street: most along the busy streets, the pavement lanes stay', () => {
    const hub = buildHub('plateau', true);
    const before = pavementLanes(hub.edges, hub.colliders, HUB_STREETS.plateau.busy).filter(l => l.w > 1).length;
    const g = placeParked(hub, PARKED_COUNT.low);
    expect(g.children.length).toBeGreaterThanOrEqual(PARKED_COUNT.low - 3);
    const onBusy = g.children.filter(c => c.position.x > -8 && c.position.x < 68 && c.position.z > -68 && c.position.z < 8 && (Math.abs(c.position.x - 60) < 8 || Math.abs(c.position.x) < 8 || Math.abs(c.position.z) < 8 || Math.abs(c.position.z + 60) < 8)).length;
    expect(onBusy).toBeGreaterThanOrEqual(Math.floor(PARKED_COUNT.low * 0.4));
    const after = pavementLanes(hub.edges, hub.colliders, HUB_STREETS.plateau.busy).filter(l => l.w > 1).length;
    expect(after).toBeGreaterThanOrEqual(Math.floor(before * 0.7));
  });
});
