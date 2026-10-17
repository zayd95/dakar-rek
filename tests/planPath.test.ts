import { describe, expect, it } from 'vitest';
import { collidersClear, laneGraph, planPath, warmPaths, type ClearFn } from '../src/social/routines';

/**
 * The route between two spots over the sidewalk graph: the graph's open stretches are made once per clear test and the
 * search takes the nearest node from a heap. The routes are the very ones the first implementation found — a scan of every
 * node for the nearest — which is rewritten below, step by step, as the reference.
 */
type Pt = { x: number; z: number };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);
const proj = (p: Pt, a: Pt, b: Pt): Pt => {
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
  return { x: a.x + dx * t, z: a.z + dz * t };
};
function simplify(pts: Pt[]): Pt[] {
  const r: Pt[] = [];
  for (const p of pts) {
    if (r.length && dist(r[r.length - 1], p) < 0.05) continue;
    if (r.length >= 2) {
      const a = r[r.length - 2], b = r[r.length - 1];
      const cross = (b.x - a.x) * (p.z - b.z) - (b.z - a.z) * (p.x - b.x), dot = (b.x - a.x) * (p.x - b.x) + (b.z - a.z) * (p.z - b.z);
      if (Math.abs(cross) < 1e-6 && dot > 0) { r[r.length - 1] = p; continue; }
    }
    r.push(p);
  }
  return r;
}
function reference(from: Pt & { approach?: [number, number][] }, to: Pt & { approach?: [number, number][] }, clear: ClearFn): Pt[] {
  const fa = from.approach ?? [], ta = to.approach ?? [];
  const out: Pt[] = [{ x: from.x, z: from.z }, ...[...fa].reverse().map(([x, z]) => ({ x, z }))];
  const inn: Pt[] = [...ta.map(([x, z]) => ({ x, z })), { x: to.x, z: to.z }];
  const s = out[out.length - 1], t = inn[0];
  let mid: Pt[] = [];
  if (!(dist(s, t) < 14 && clear(s, t))) {
    const g = laneGraph();
    const open = new Map<string, boolean>();
    const ok = (i: number, j: number) => { const k = i < j ? `${i}-${j}` : `${j}-${i}`; let v = open.get(k); if (v === undefined) { v = clear(g.nodes[i], g.nodes[j]); open.set(k, v); } return v; };
    const pts: Pt[] = [...g.nodes], adj: { j: number; w: number }[][] = g.adj.map((js, i) => js.filter(j => ok(i, j)).map(j => ({ j, w: dist(g.nodes[i], g.nodes[j]) })));
    const add = (p: Pt) => { pts.push(p); adj.push([]); return pts.length - 1; };
    const edge = (i: number, j: number) => { const w = dist(pts[i], pts[j]); adj[i].push({ j, w }); adj[j].push({ j: i, w }); };
    const entries = (p: Pt, max = 3) => {
      const all = g.segs.map(([i, j]) => { const q = proj(p, g.nodes[i], g.nodes[j]); return { i, j, q, d: dist(p, q) }; }).sort((u, v) => u.d - v.d);
      const o: typeof all = [];
      for (const e of all) { if (e.d > 60 || o.length >= max) break; if (clear(p, e.q) && clear(g.nodes[e.i], e.q) && clear(e.q, g.nodes[e.j])) o.push(e); }
      return o;
    };
    const S0 = add(s), T0 = add(t);
    const es = entries(s).map(e => ({ ...e, k: add(e.q) })), et = entries(t).map(e => ({ ...e, k: add(e.q) }));
    for (const e of es) { edge(S0, e.k); edge(e.k, e.i); edge(e.k, e.j); }
    for (const e of et) { edge(T0, e.k); edge(e.k, e.i); edge(e.k, e.j); }
    for (const a of es) for (const b of et) if ((a.i === b.i && a.j === b.j) || (a.i === b.j && a.j === b.i)) edge(a.k, b.k);
    const D = new Array(pts.length).fill(Infinity), prev = new Array(pts.length).fill(-1), done = new Array(pts.length).fill(false);
    D[S0] = 0;
    for (;;) {
      let u = -1; for (let k = 0; k < pts.length; k++) if (!done[k] && D[k] < Infinity && (u < 0 || D[k] < D[u])) u = k;
      if (u < 0 || u === T0) break;
      done[u] = true;
      for (const { j, w } of adj[u]) if (D[u] + w < D[j]) { D[j] = D[u] + w; prev[j] = u; }
    }
    if (D[T0] < Infinity) { const chain: Pt[] = []; for (let k = prev[T0]; k >= 0 && k !== S0; k = prev[k]) chain.unshift(pts[k]); mid = chain; }
  }
  return simplify([...out, ...mid, ...inn]);
}

describe('planPath', () => {
  const g = laneGraph();
  const xs = g.nodes.map(n => n.x), zs = g.nodes.map(n => n.z);
  const lo = { x: Math.min(...xs) - 12, z: Math.min(...zs) - 12 }, span = { x: Math.max(...xs) - Math.min(...xs) + 24, z: Math.max(...zs) - Math.min(...zs) + 24 };
  let seed = 12345; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const point = () => ({ x: lo.x + r() * span.x, z: lo.z + r() * span.z });
  const spot = () => { const p = point(); return r() < 0.3 ? { ...p, approach: [[p.x + 1.5, p.z - 1], [p.x + 2.5, p.z - 2.5]] as [number, number][] } : p; };

  it('finds the very routes of the first implementation, with open sidewalks and with stalls and fences in the way', () => {
    const open: ClearFn = () => true;
    // some blocks of solid things standing on the sidewalks and across the corners (the same test for all the pairs, as in a hub)
    const cols = Array.from({ length: 40 }, () => { const p = point(); return { x0: p.x, z0: p.z, x1: p.x + 1 + r() * 7, z1: p.z + 1 + r() * 5, h: 2 }; });
    const blocked = collidersClear(cols);
    let longer = 0, n = 0;
    for (const clear of [open, blocked]) {
      for (let k = 0; k < 160; k++) {
        const a = spot(), b = spot();
        const want = reference(a, b, clear), got = planPath(a, b, clear);
        expect(got, `pair ${k}`).toEqual(want);
        n++; if (want.length > 4) longer++;
      }
    }
    expect(longer).toBeGreaterThan(n / 3);                                  // (many of them really went round the blocks)
  });

  it('the same route again, and from a spot to itself', () => {
    const clear = collidersClear([]);
    const a = { x: -36, z: -54.5 }, b = { x: 78, z: 54.5 };
    expect(planPath(a, b, clear)).toEqual(planPath(a, b, clear));
    expect(planPath(a, a, clear)).toEqual(reference(a, a, clear));
  });

  it('does not change the graph it searches (a route adds nodes and edges of its own)', () => {
    const clear = collidersClear([]);
    const before = JSON.stringify(laneGraph().adj);
    for (let k = 0; k < 30; k++) planPath(spot(), spot(), clear);
    expect(JSON.stringify(laneGraph().adj)).toBe(before);
    // and a route found after others is the same as the first time
    const a = { x: -20, z: 40 }, b = { x: 70, z: -45 };
    const first = planPath(a, b, clear);
    for (let k = 0; k < 20; k++) planPath(spot(), spot(), clear);
    expect(planPath(a, b, clear)).toEqual(first);
  });
});

/** The straight-segment test as it was written first (a filter, then a `some` at each step): the allocation-free one answers alike. */
function firstClear(cols: readonly { x0: number; z0: number; x1: number; z1: number; h: number }[]): ClearFn {
  return (a, b) => {
    const m = 0.25;
    const len = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(1, Math.ceil(len / 0.3));
    const near = cols.filter(c => c.h > 0.3 && Math.max(a.x, b.x) > c.x0 - m && Math.min(a.x, b.x) < c.x1 + m && Math.max(a.z, b.z) > c.z0 - m && Math.min(a.z, b.z) < c.z1 + m
      && !(a.x > c.x0 - 0.45 && a.x < c.x1 + 0.45 && a.z > c.z0 - 0.45 && a.z < c.z1 + 0.45)
      && !(b.x > c.x0 - 0.45 && b.x < c.x1 + 0.45 && b.z > c.z0 - 0.45 && b.z < c.z1 + 0.45));
    if (!near.length) return true;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      if (near.some(c => x > c.x0 - m && x < c.x1 + m && z > c.z0 - m && z < c.z1 + m)) return false;
    }
    return true;
  };
}

describe('collidersClear', () => {
  let seed = 777; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

  it('answers as the first implementation did, for segments of every length among boxes of every height', () => {
    const cols = Array.from({ length: 300 }, () => { const x = -90 + r() * 180, z = -90 + r() * 180; return { x0: x, z0: z, x1: x + 0.2 + r() * 6, z1: z + 0.2 + r() * 6, h: r() < 0.2 ? 0.2 : 0.4 + r() * 2.5 }; });
    const was = firstClear(cols), now = collidersClear(cols);
    let blocked = 0, free = 0;
    for (let k = 0; k < 4000; k++) {
      const a = { x: -90 + r() * 180, z: -90 + r() * 180 }, len = r() < 0.5 ? r() * 4 : r() * 60, yaw = r() * Math.PI * 2;
      const b = { x: a.x + Math.sin(yaw) * len, z: a.z + Math.cos(yaw) * len };
      const want = was(a, b);
      expect(now(a, b), `segment ${k}`).toBe(want);
      if (want) free++; else blocked++;
    }
    expect(blocked).toBeGreaterThan(300); expect(free).toBeGreaterThan(300);        // (both answers were given a good many times)
  });

  it('reads the list it was given at each call (colliders come and go during an evening)', () => {
    const cols: { x0: number; z0: number; x1: number; z1: number; h: number }[] = [];
    const clear = collidersClear(cols), a = { x: 0, z: 0 }, b = { x: 10, z: 0 };
    expect(clear(a, b)).toBe(true);
    cols.push({ x0: 4, z0: -1, x1: 6, z1: 1, h: 1.5 });
    expect(clear(a, b)).toBe(false);
    cols.pop();
    expect(clear(a, b)).toBe(true);
  });
});

describe('the open sidewalk graph, made as the searches reach it', () => {
  it('the first route tests the stretches it comes to, not the whole city', () => {
    const g = laneGraph();
    let calls = 0;
    const clear: ClearFn = () => { calls++; return true; };
    // two spots on neighbouring blocks: the search stops at the target, long before it has seen every node
    const a = { x: g.nodes[0].x + 1, z: g.nodes[0].z + 1 }, b = { x: g.nodes[5].x - 1, z: g.nodes[5].z + 1 };
    planPath(a, b, clear);
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThan(g.segs.length / 2);
    // and a second route over the same ground tests nothing already tested (the answer of each stretch is kept per test)
    const first = calls;
    planPath(a, b, clear);
    expect(calls).toBeLessThanOrEqual(first + 8);                                    // (only the entries of its own end points, if new)
  });

  it('warmPaths plans a few routes and keeps nothing for the hub', () => {
    const cols = [{ x0: -30, z0: -40, x1: -20, z1: -38, h: 2 }];
    expect(() => warmPaths(cols)).not.toThrow();
    expect(() => warmPaths([])).not.toThrow();
    const clear = collidersClear(cols);
    let calls = 0;
    const counted: ClearFn = (p, q) => { calls++; return clear(p, q); };
    planPath({ x: -50, z: 30 }, { x: 60, z: -30 }, counted);
    expect(calls).toBeGreaterThan(5);                                                // (the hub's own test still did its work)
  });
});
