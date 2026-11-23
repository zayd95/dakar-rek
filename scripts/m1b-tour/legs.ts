// Drivable travel times of the Tiak motorbike between Pikine's existing places (docs/M1B-TIAK-TOUR.md).
// Real hub (colliders, height map, bounds), the real drive model (`driveStep`) and the real motorbike spec; a route is the shortest
// free path for the bike on a 0.5 m grid (so it follows the existing streets), then ridden by a simple rider that steers at the next
// point of the path and slows for tight turns. Two riders: « touch » (analog stick, gas held) and « clavier » (digital keys: the
// game's input normalises W + A/D to 0.707 each, so a key rider is slower in turns). Time = game seconds at 30 frames a second.
// Usage: npx vite-node scripts/m1b-tour/legs.ts [fromFrag toFrag]
import { stubDom } from '../m1a-sim/stub';
stubDom();
const { buildHub } = await import('../../src/world/builder');
const { driveStep, newDriveState } = await import('../../src/transport/drive');
const { motoSpec } = await import('../../src/transport/moto');
import type { HubWorld } from '../../src/world/types';

const world: HubWorld = buildHub('pikine', true);
// the game's own solid boxes at run time (street dress, stalls, parked vehicles… are added by modules, not by buildHub):
// COLLIDERS=scripts/m1b-tour/colliders.json (dumped from the browser by dump-colliders.mjs) replaces the built ones
if (process.env.COLLIDERS) world.colliders = (JSON.parse((await import('node:fs')).readFileSync(process.env.COLLIDERS, 'utf8')) as number[][]).map(([x0, z0, x1, z1, h]) => ({ x0, z0, x1, z1, h }));
const spec = motoSpec();
const D = spec.drive!;
const R_PLAN = 0.7, CELL = 0.5, ARRIVE = 2.8;     // clearance used to plan (the bike's half width is 0.42), grid cell, stop radius (the game's is 3.5; the rider is seated a little off the bike's centre, so the planner asks for 2.6)
const B = world.bounds;
// colliders bucketed on a 10 m grid (each in every bucket it touches, grown by 3 m) so a test only reads the few walls around it
const BK = 10, BN = Math.ceil((B.x1 - B.x0) / BK) + 1, buckets: (typeof world.colliders)[] = Array.from({ length: BN * BN }, () => []);
for (const c of world.colliders) for (let i = Math.floor((c.x0 - 3 - B.x0) / BK); i <= Math.floor((c.x1 + 3 - B.x0) / BK); i++) for (let j = Math.floor((c.z0 - 3 - B.z0) / BK); j <= Math.floor((c.z1 + 3 - B.z0) / BK); j++) if (i >= 0 && j >= 0 && i < BN && j < BN) buckets[j * BN + i].push(c);
const blocked = (x: number, z: number, r: number): boolean => {
  if (x < B.x0 + r || x > B.x1 - r || z < B.z0 + r || z > B.z1 - r) return true;
  const bi = Math.floor((x - B.x0) / BK), bj = Math.floor((z - B.z0) / BK);
  for (const c of buckets[bj * BN + bi] ?? []) if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return true;
  return world.heightAt(x, z) > 0.3;
};

const NX = Math.round((B.x1 - B.x0) / CELL), NZ = Math.round((B.z1 - B.z0) / CELL);
const cx = (i: number) => B.x0 + (i + 0.5) * CELL, cz = (j: number) => B.z0 + (j + 0.5) * CELL;
const free = new Uint8Array(NX * NZ), near = new Uint8Array(NX * NZ);
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { free[j * NX + i] = blocked(cx(i), cz(j), R_PLAN) ? 0 : 1; near[j * NX + i] = blocked(cx(i), cz(j), R_PLAN + 1.6) ? 1 : 0; }
// clearance (m) from the nearest blocked cell: chamfer distance transform, so paths prefer the middle of the street
const clr = new Float32Array(NX * NZ);
for (let k = 0; k < clr.length; k++) clr[k] = free[k] ? 99 : 0;
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const k = j * NX + i; let v = clr[k]; if (i) v = Math.min(v, clr[k - 1] + CELL); if (j) v = Math.min(v, clr[k - NX] + CELL); if (i && j) v = Math.min(v, clr[k - NX - 1] + CELL * 1.414); if (i < NX - 1 && j) v = Math.min(v, clr[k - NX + 1] + CELL * 1.414); clr[k] = v; }
for (let j = NZ - 1; j >= 0; j--) for (let i = NX - 1; i >= 0; i--) { const k = j * NX + i; let v = clr[k]; if (i < NX - 1) v = Math.min(v, clr[k + 1] + CELL); if (j < NZ - 1) v = Math.min(v, clr[k + NX] + CELL); if (i < NX - 1 && j < NZ - 1) v = Math.min(v, clr[k + NX + 1] + CELL * 1.414); if (i && j < NZ - 1) v = Math.min(v, clr[k + NX - 1] + CELL * 1.414); clr[k] = v; }
const cell = (x: number, z: number) => [Math.max(0, Math.min(NX - 1, Math.floor((x - B.x0) / CELL))), Math.max(0, Math.min(NZ - 1, Math.floor((z - B.z0) / CELL)))] as const;

export type Pt = { x: number; z: number };
/** The free cell nearest to a point (the places stand against their walls: the bike waits a little way off). */
function nearestFree(a: Pt): number {
  const [si, sj] = cell(a.x, a.z); let best = -1, bd = 1e9;
  for (let dj = -24; dj <= 24; dj++) for (let di = -24; di <= 24; di++) {
    const i = si + di, j = sj + dj; if (i < 0 || j < 0 || i >= NX || j >= NZ || !free[j * NX + i] || near[j * NX + i]) continue;   // in the open, off the wall
    const d = Math.hypot(cx(i) - a.x, cz(j) - a.z); if (d < bd) { bd = d; best = j * NX + i; }
  }
  return best;
}
/** Shortest free path from `a` to the first cell within ARRIVE − 0.4 m of `b` (Dijkstra, a small cost near walls so it stays in the open). */
function plan(a: Pt, b: Pt): Pt[] | null {
  const start = nearestFree(a);
  if (start < 0) return null;
  const dist = new Float64Array(NX * NZ).fill(Infinity), prev = new Int32Array(NX * NZ).fill(-1);
  const heap: [number, number][] = [[0, start]]; dist[start] = 0;
  const push = (d: number, n: number) => { heap.push([d, n]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  let goal = -1;
  while (heap.length) {
    const [d, n] = pop(); if (d > dist[n]) continue;
    const i = n % NX, j = (n / NX) | 0;
    if (Math.hypot(cx(i) - b.x, cz(j) - b.z) < ARRIVE - 0.2) { goal = n; break; }
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
      const m = nj * NX + ni; if (!free[m]) continue;
      const nd = d + (di && dj ? 1.414 : 1) * CELL * (1 + 4 * Math.max(0, (4.5 - clr[m]) / 4.5));
      if (nd < dist[m]) { dist[m] = nd; prev[m] = n; push(nd, m); }
    }
  }
  if (goal < 0) return null;
  const pts: Pt[] = [];
  for (let n = goal; n >= 0; n = prev[n]) pts.push({ x: cx(n % NX), z: cz((n / NX) | 0) });
  pts.reverse();
  // string-pull: keep only the points needed so that the straight lines between them are free
  const clear = (p: Pt, q: Pt) => { const L = Math.hypot(q.x - p.x, q.z - p.z), n = Math.ceil(L / 0.4); for (let k = 0; k <= n; k++) if (blocked(p.x + ((q.x - p.x) * k) / n, p.z + ((q.z - p.z) * k) / n, 1.6)) return false; return true; };
  const out: Pt[] = [pts[0]]; let anchor = 0;
  for (let k = 2; k < pts.length; k++) if (!clear(pts[anchor], pts[k])) { out.push(pts[k - 1]); anchor = k - 1; }
  out.push(pts[pts.length - 1]);
  return out;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export interface Ride { s: number; m: number; bumps: number; ok: boolean }
/** Rides `path` from rest (heading along its first segment) with the given rider; stops within ARRIVE of the end. */
export function ride(path: Pt[], style: 'touch' | 'clavier', v0 = 0): Ride {
  const first = path[1] ?? path[0];
  let stillT = 0;
  const st = newDriveState(path[0].x, path[0].z, Math.atan2(first.x - path[0].x, first.z - path[0].z)); st.speed = v0;
  const end = path[path.length - 1], dt = 1 / 30;
  let t = 0, seg = 1, bumps = 0, wasHit = false;
  while (t < 120) {
    while (seg < path.length - 1 && Math.hypot(path[seg].x - st.x, path[seg].z - st.z) < 4.5) seg++;
    // aim at the point 7 m ahead along the path (pure pursuit)
    let tgt = path[seg], acc = 0;
    for (let k = seg; k < path.length; k++) { const p = k === seg ? { x: st.x, z: st.z } : path[k - 1]; acc += Math.hypot(path[k].x - p.x, path[k].z - p.z); tgt = path[k]; if (acc > 7) break; }
    const err = wrap(Math.atan2(tgt.x - st.x, tgt.z - st.z) - st.yaw);          // > 0: the target is on the left (yaw rises to the left)
    // the corner ahead sets the speed: look at the heading change at the next path vertex
    const nxt = path[Math.min(seg + 1, path.length - 1)], cur = path[seg];
    const turn = Math.abs(wrap(Math.atan2(nxt.x - cur.x, nxt.z - cur.z) - Math.atan2(cur.x - st.x, cur.z - st.z)));
    const dCorner = Math.hypot(cur.x - st.x, cur.z - st.z), dEnd = Math.hypot(end.x - st.x, end.z - st.z);
    const want = Math.min(D.maxSpeed, turn > 1.0 && dCorner < 18 ? 3.5 : turn > 0.5 && dCorner < 14 ? 5.5 : D.maxSpeed, Math.abs(err) > 0.5 ? 4 : D.maxSpeed, Math.max(4, dEnd * 0.9));
    let throttle = st.speed < want - 0.3 ? 1 : st.speed > want + 1 ? -1 : 0;
    let steer = Math.max(-1, Math.min(1, -err * 2.2));                         // right = +steer
    if (style === 'clavier') {
      steer = Math.abs(err) < 0.06 ? 0 : err > 0 ? -1 : 1;
      const l = Math.hypot(steer, throttle); if (l > 1) { steer /= l; throttle /= l; }   // the game's Input.move() normalises two keys
    }
    const hit = driveStep(st, { throttle, steer }, D, dt, blocked);
    if (hit && !wasHit) bumps++; wasHit = hit;
    t += dt;
    stillT = Math.abs(st.speed) < 0.3 ? stillT + dt : 0; if (stillT > 4) return { s: 120, m: Math.round(st.odo), bumps, ok: false };
    if (Math.hypot(end.x - st.x, end.z - st.z) < ARRIVE) return { s: +t.toFixed(1), m: Math.round(st.odo), bumps, ok: true };
  }
  return { s: t, m: Math.round(st.odo), bumps, ok: false };
}

export const place = (frag: string) => world.interactables.find(i => i.id.startsWith('pikine:') && i.id.includes(frag))!;
export const legTime = (a: Pt, b: Pt, style: 'touch' | 'clavier', v0 = 0) => { const p = plan(a, b); return p ? ride(p, style, v0) : null; };
export { world, plan };

if (!process.env.LEGS_LIB) {
  const frags = ['gargote:32', 'maiga:31', 'garage:31', 'city:boutique', 'city:salon-tech', 'city:square', 'dibiterie:11', 'city:bank', 'cafe:02'];
  const pts = frags.map(f => ({ f, p: place(f) }));
  console.log('from → to : straight m | ride m | touch s | clavier s (bumps)');
  for (const a of pts) for (const b of pts) {
    if (a.f >= b.f) continue;
    const pa = { x: a.p.x, z: a.p.z }, pb = { x: b.p.x, z: b.p.z };
    const t = legTime(pa, pb, 'touch'), k = legTime(pa, pb, 'clavier');
    console.log(`${a.f.padEnd(16)} → ${b.f.padEnd(16)} ${String(Math.round(Math.hypot(pa.x - pb.x, pa.z - pb.z))).padStart(4)} m | ${t ? String(t.m).padStart(4) : ' n/a'} m | ${t ? t.s.toFixed(1).padStart(5) : '  n/a'} | ${k ? k.s.toFixed(1).padStart(5) : '  n/a'} (${t?.bumps ?? '-'}/${k?.bumps ?? '-'})`);
  }
}
