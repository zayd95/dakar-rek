// Waypoints along a district's street grid (the streets are the lines x = c and z = c, c in STREETS: src/transport/lines.ts roadCentre), for the pilot of realTouch.mjs: from where the car
// is, heading the way it faces, to a kerb spot (src/transport/taxiRules.ts kerbSpot: x, z and the heading of the traffic there), arriving along that heading in the right-hand lane.
// A breadth-first search over the junctions; the car never turns round in the street (it goes on to the next junction first).
export const STREETS = [-120, -60, 0, 60, 120];
const near = v => STREETS.reduce((b, c) => (Math.abs(c - v) < Math.abs(b - v) ? c : b));
const LANE = 2.1;
/** The lane a car keeps, driving from junction a to junction b (right-hand traffic: heading +z the right side is −x; heading +x it is +z). */
const lanePt = (a, b, p) => (a.x === b.x ? { x: a.x - Math.sign(b.z - a.z) * LANE, z: p.z } : { x: p.x, z: a.z + Math.sign(b.x - a.x) * LANE });

/** Junctions next to (x, z) on its street, the one ahead first (heading yaw). */
function ahead(x, z, yaw) {
  const f = { x: Math.sin(yaw), z: Math.cos(yaw) }, cx = near(x), cz = near(z), ns = Math.abs(x - cx) <= Math.abs(z - cz);
  if (ns) { const s = Math.sign(f.z) || 1, next = STREETS.filter(c => (c - z) * s > 2).sort((a, b) => (a - b) * s)[0]; return next === undefined ? null : { x: cx, z: next }; }
  const s = Math.sign(f.x) || 1, next = STREETS.filter(c => (c - x) * s > 2).sort((a, b) => (a - b) * s)[0]; return next === undefined ? null : { x: next, z: cz };
}
/** The junction behind a kerb spot (arriving there, the car runs along the kerb's heading). */
function behind(k) {
  const f = { x: Math.sin(k.yaw), z: Math.cos(k.yaw) }, ns = Math.abs(f.z) > 0.5, cx = near(k.x), cz = near(k.z);
  if (ns) { const s = Math.sign(f.z), prev = STREETS.filter(c => (k.z - c) * s > 8).sort((a, b) => (b - a) * s)[0]; return prev === undefined ? null : { x: cx, z: prev }; }
  const s = Math.sign(f.x), prev = STREETS.filter(c => (k.x - c) * s > 8).sort((a, b) => (b - a) * s)[0]; return prev === undefined ? null : { x: prev, z: cz };
}
/** Does the street between junctions p and q cross one of the rectangles ({ x0, x1, z0, z1 }: a zone closed to cars, the arena's pedestrian street)? */
const crosses = (p, q, rects) => rects.some(r => Math.min(p.x, q.x) < r.x1 && Math.max(p.x, q.x) > r.x0 && Math.min(p.z, q.z) < r.z1 && Math.max(p.z, q.z) > r.z0);
/** Shortest junction path from `a` (reached from `from`) to `b`, never turning back the way it came, and not arriving at `b` from `notFrom`; never through `avoid`. */
function bfs(a, from, b, notFrom, avoid = []) {
  const key = (p, q) => `${p.x},${p.z}|${q ? `${q.x},${q.z}` : '-'}`, same = (p, q) => p && q && p.x === q.x && p.z === q.z;
  const start = { p: a, q: from }, prev = new Map([[key(a, from), null]]), queue = [start];
  let goal = null;
  while (queue.length) {
    const s = queue.shift();
    if (same(s.p, b) && !same(s.q, notFrom)) { goal = s; break; }
    const i = STREETS.indexOf(s.p.x), j = STREETS.indexOf(s.p.z);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= STREETS.length || nj >= STREETS.length) continue;
      const n = { x: STREETS[ni], z: STREETS[nj] }; if (same(n, s.q) || crosses(s.p, n, avoid)) continue;          // no turning back, no closed street
      const k = key(n, s.p); if (prev.has(k)) continue;
      prev.set(k, s); queue.push({ p: n, q: s.p });
    }
  }
  const out = []; for (let s = goal; s; s = prev.get(key(s.p, s.q))) out.unshift(s.p);
  return out;
}

/**
 * From the car (x, z, yaw) to a kerb spot k ({ x, z, yaw }): the pilot's waypoints (lane points at each junction, then a slow run-in along the kerb).
 * `end` instead of a kerb: a junction or a point straight on from one (a road's mouth): the route ends there. `avoid`: rectangles closed to cars (never crossed).
 */
export function route(from, k, { cruise = 6, slow = 2.2, avoid = [] } = {}) {
  const j0 = ahead(from.x, from.z, from.yaw), jEnd = k.yaw === undefined ? { x: near(k.x), z: near(k.z) } : behind(k);
  if (!j0 || !jEnd) return null;
  const back = ahead(from.x, from.z, from.yaw + Math.PI), beyond = k.yaw === undefined ? null : ahead(k.x, k.z, k.yaw);
  const js = bfs(j0, back, jEnd, beyond, avoid), pts = [];
  if (!js.length) return null;
  // the junctions, each crossed in the lane of the leg that reaches it
  js.forEach((b, i) => { const p = i === 0 ? b : lanePt(js[i - 1], b, b); pts.push({ x: p.x, z: p.z, tol: 4, speed: cruise }); });
  if (k.yaw === undefined) { pts.push({ x: k.x, z: k.z, tol: 4, speed: cruise }); return pts; }
  const f = { x: Math.sin(k.yaw), z: Math.cos(k.yaw) };
  pts.push({ x: k.x - f.x * 14, z: k.z - f.z * 14, tol: 3, speed: 4 });
  pts.push({ x: k.x - f.x * 5, z: k.z - f.z * 5, tol: 2.2, speed: slow });
  pts.push({ x: k.x + f.x * 1.5, z: k.z + f.z * 1.5, tol: 2, speed: slow });
  return pts;
}

/** The kerb spot for a place (the same rule as src/transport/taxiRules.ts kerbSpot): on the nearest street, in its parking lane, heading the way the traffic goes there. */
export function kerbOf(p) {
  const rx = near(p.x), rz = near(p.z), alongZ = Math.abs(p.x - rx) <= Math.abs(p.z - rz), side = Math.sign(alongZ ? p.x - rx : p.z - rz) || -1;
  const yaw = alongZ ? (side < 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
  return alongZ ? { x: rx + side * 4.3, z: p.z, yaw } : { x: p.x, z: rz + side * 4.3, yaw };
}
