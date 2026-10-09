import { Humanoid, humanoidReady, randomLook } from './humanoid';
import type { HubWorld } from '../world/types';

/** Local ambient residents, including short work routes on the fishing beach. */
export class PlacedPeople {
  private entries: { h: Humanoid; p: HubWorld['people'][number]; phase: number }[] = [];

  constructor(world: HubWorld, rand: () => number, add: (h: Humanoid) => void) {
    if (!humanoidReady()) return;
    for (const p of world.people) {
      const h = new Humanoid(p.look ?? randomLook(rand)); h.hold = p.clip;
      h.group.position.set(p.x, 0.1 + (p.y ?? 0), p.z); h.group.rotation.y = p.yaw;
      add(h); this.entries.push({ h, p, phase: rand() * 2 });
    }
  }

  update(dt: number, viewer: { x: number; z: number }, distanceLimit: number) {
    for (const e of this.entries) {
      e.h.group.visible = Math.hypot(e.h.group.position.x - viewer.x, e.h.group.position.z - viewer.z) <= distanceLimit;
      if (!e.h.group.visible) continue;
      if (e.p.walkTo) {
        const dx = e.p.walkTo.x - e.p.x, dz = e.p.walkTo.z - e.p.z;
        const distance = Math.hypot(dx, dz), travel = Math.max(0.1, distance / 1.1);
        const cycle = (travel + 2) * 2;
        e.phase = (e.phase + dt) % cycle;
        const returning = e.phase >= travel + 2;
        const t = returning ? e.phase - travel - 2 : e.phase;
        const walking = t < travel;
        const f = Math.min(1, t / travel), offset = returning ? 1 - f : f;
        e.h.group.position.set(e.p.x + dx * offset, 0.1 + (e.p.y ?? 0), e.p.z + dz * offset);
        e.h.group.rotation.y = Math.atan2(dx, dz) + (returning ? Math.PI : 0);
        e.h.hold = walking ? null : 'Talk';
        e.h.animate(dt, walking ? 1.1 : 0);
      } else e.h.animate(dt, 0);
    }
  }

  /** Bodies for the interaction system (greet, ask a name…). */
  bodies() { return this.entries.map((e, i) => ({ id: 'placed:' + i, h: e.h, seated: e.p.clip === 'Sit', female: !!e.p.look?.female })); }

  dispose() { for (const e of this.entries) e.h.dispose(); this.entries = []; }
}
