import * as THREE from 'three';
import { Batch } from '../world/batch';
import { PARAPET_R, ROOF_FRONT_R, ROOF_FRONT_Y, SECTIONS, TIER_DEPTH, tierRadius } from '../world/geew';
import type { Tribune } from './tickets';

/** What the ticket tiers look like in the arena (src/arena/tickets.ts): cushions, the couverte's awning, the honneur plate. */
/** A place of the stands, as src/arena/program.ts standSeats gives it. */
export interface TribuneSeat { a: number; tier: number; x: number; z: number; top: number; yaw: number; tribune: Tribune }
const COUSSIN: Record<Tribune, number | null> = { populaire: null, couverte: 0x27407a, honneur: 0xf2f2ec };
/**
 * Cushions on the couverte and honneur places (white with a back for the honneur rows), and the canvas awning of the
 * couverte stands hung under the roof's front edge (navy with a white stripe, a valance per section).
 */
export function tribuneDecor(cx: number, cz: number, seats: readonly TribuneSeat[]): Batch {
  const b = new Batch();
  for (const s of seats) {
    const c = COUSSIN[s.tribune]; if (c === null) continue;
    b.box(0.5, 0.05, 0.36, s.x, s.top, s.z, c, s.yaw);
    if (s.tribune === 'honneur') {                                          // a low back behind the cushion
      const back = 0.24, bx = s.x - Math.sin(s.yaw) * back, bz = s.z - Math.cos(s.yaw) * back;
      b.box(0.5, 0.42, 0.05, bx, s.top, bz, 0xf2f2ec, s.yaw);
      b.box(0.52, 0.05, 0.07, bx, s.top + 0.42, bz, 0xd9b44a, s.yaw);       // a gold edge
    }
  }
  const r = ROOF_FRONT_R - 0.15, top = ROOF_FRONT_Y - 0.55;
  for (const sec of SECTIONS) {
    if (!['C', 'F', 'G'].includes(sec.id)) continue;
    const n = Math.max(1, Math.ceil(((sec.a1 - sec.a0) * r) / 1.4)), step = (sec.a1 - sec.a0) / n;
    for (let i = 0; i < n; i++) {
      const a = sec.a0 + (i + 0.5) * step, x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r, w = step * r + 0.04;
      b.box(w, 0.75, 0.03, x, top - 0.75, z, 0x27407a, a + Math.PI);
      b.box(w, 0.1, 0.035, x, top - 0.5, z, 0xf2f2ec, a + Math.PI);
    }
  }
  return b;
}
/** Where the honneur rows' plate goes: on the parapet in front of section B, facing the ring. */
export function honneurPlate(cx: number, cz: number): { x: number; z: number; yaw: number } {
  const B = SECTIONS.find(s => s.id === 'B')!, a = (B.a0 + B.a1) / 2, r = PARAPET_R - 0.14;
  return { x: cx + Math.sin(a) * r, z: cz + Math.cos(a) * r, yaw: a + Math.PI };
}
/** The front edge of a row (for checks of what stands between a place and the ring). */
export const rowFront = (row: number) => tierRadius(row) - TIER_DEPTH / 2;
/** Material for the decor (vertex colours). */
export const decorMaterial = () => new THREE.MeshLambertMaterial({ vertexColors: true });
