import * as THREE from 'three';
import type { Batch } from '../batch';
import type { SitePalette, SiteDraw } from './contract';
import type { Face } from './parts';

/**
 * LD2.0-E lane E-R: the residences' own cheap pieces. The district's shared parts (parts.ts) draw every face of every box; an apartment block is
 * hundreds of openings, so these draw only the faces a street can see: a pane is one quad (2 triangles), a slat three faces (6), a balcony's slab
 * five (10). Everything is drawn in the site's plan coordinates (+z toward the street, y up) into the hub's own batches (`Batch.coloured`: one merged
 * geometry per batch and per `flush`, no draw call of its own), mirrored and turned by the site's frame like the shared parts.
 */
export type V3 = readonly [number, number, number];
const rgbs = new Map<number, [number, number, number]>();
/**
 * The vertex colour of a hex colour. The flagship's render and stone are drawn a little brighter than a vertex colour can say (src/housing/villaFacade.ts:
 * a white that stays white under the street's tone mapping); the light finishes here get the same lift, so the ivory of a residence is the villa's.
 */
const rgbOf = (c: number) => {
  let v = rgbs.get(c);
  if (!v) { const k = new THREE.Color(c), lum = (k.r + k.g + k.b) / 3, g = 1 + 0.36 * Math.min(1, Math.max(0, (lum - 0.3) / 0.5)); v = [k.r * g, k.g * g, k.b * g]; rgbs.set(c, v); }
  return v;
};
/** A colour between two others (hex), `t` 0…1. */
export function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
/** The clear glass of a guard or a skylight (light, over the palette's dark panes). */
export const GUARD = 0xcfe4ec;
/** The leaves the greenery wears (a hedge, a creeper, a planter's shrub). */
export const GREEN = { hedge: 0x3e6d2e, hedge2: 0x4b7d36, moss: 0x5d8a3a, lawn: 0x6e9e44, lawn2: 0x79aa4c, bloom: 0xc2307a, bloom2: 0xd94a8c };

const DIGITS: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg' };
/** A heap of triangles in plan coordinates (counter-clockwise from outside), flushed into one batch as one merged geometry. */
export class Mesh {
  private pos: number[] = [];
  private col: number[] = [];
  constructor(readonly d: SiteDraw, readonly b: Batch) {}
  get tris() { return this.pos.length / 9; }
  private tri(a: V3, b: V3, c: V3, k: [number, number, number]) {
    const f = this.d.f, vs = f.mirror ? [a, c, b] : [a, b, c];
    for (const v of vs) { const q = f.p(v[0], v[2]); this.pos.push(q.x, v[1], q.z); this.col.push(k[0], k[1], k[2]); }
  }
  quad(a: V3, b: V3, c: V3, e: V3, col: number) { const k = rgbOf(col); this.tri(a, b, c, k); this.tri(a, c, e, k); }
  /** A vertical quad in the plane x = c (`plane` 'x', spanning z a0…a1) or z = c ('z', spanning x), facing +1 or −1 along its normal. */
  vq(plane: 'x' | 'z', c: number, a0: number, a1: number, y0: number, y1: number, dir: 1 | -1, col: number) {
    if (plane === 'x') {
      if (dir > 0) this.quad([c, y0, a1], [c, y0, a0], [c, y1, a0], [c, y1, a1], col); else this.quad([c, y0, a0], [c, y0, a1], [c, y1, a1], [c, y1, a0], col);
    } else if (dir > 0) this.quad([a0, y0, c], [a1, y0, c], [a1, y1, c], [a0, y1, c], col); else this.quad([a1, y0, c], [a0, y0, c], [a0, y1, c], [a1, y1, c], col);
  }
  /** A horizontal quad at height y over a plan rectangle, facing up (`up`) or down. */
  hq(x0: number, z0: number, x1: number, z1: number, y: number, up: boolean, col: number) {
    if (up) this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], col); else this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], col);
  }
  /** A box; `skip` names the faces left out: S (street, +z), B (back, −z), R (+x), L (−x), T (top), U (under, the default). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: number, skip = 'U') {
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
    if (!skip.includes('S')) this.vq('z', z1, x0, x1, y0, y1, 1, col);
    if (!skip.includes('B')) this.vq('z', z0, x0, x1, y0, y1, -1, col);
    if (!skip.includes('R')) this.vq('x', x1, z0, z1, y0, y1, 1, col);
    if (!skip.includes('L')) this.vq('x', x0, z0, z1, y0, y1, -1, col);
    if (!skip.includes('T')) this.hq(x0, z0, x1, z1, y1, true, col);
    if (!skip.includes('U')) this.hq(x0, z0, x1, z1, y0, false, col);
  }
  /** Merges what was drawn into the batch (one geometry) and empties the heap. */
  flush() {
    if (!this.pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    this.b.coloured(g);
    this.pos = []; this.col = [];
  }
}

/** One face of the building: its plane (`at`: z for the street and back faces, x for the sides) and the coordinates along it (u), up (y) and out (n). */
export class Facade {
  readonly ax: 'x' | 'z'; readonly s: 1 | -1;
  private readonly inner: string; private readonly ends: string;
  constructor(readonly k: Kit, readonly face: Face, readonly at: number) {
    this.ax = face === 'street' || face === 'back' ? 'x' : 'z';
    this.s = face === 'street' || face === 'right' ? 1 : -1;
    this.inner = { street: 'B', back: 'S', right: 'L', left: 'R' }[face];
    this.ends = this.ax === 'x' ? 'LR' : 'SB';
  }
  /** A quad on the face's plane, `n` out of it (faces out). `m`: the heap it goes to (default the plain one). */
  quad(u0: number, u1: number, y0: number, y1: number, n: number, col: number, m: Mesh = this.k.plain) {
    m.vq(this.ax === 'x' ? 'z' : 'x', this.at + this.s * n, u0, u1, y0, y1, this.s, col);
  }
  /** A pane of glass (the glass batch). */
  pane(u0: number, u1: number, y0: number, y1: number, n: number, col = this.k.p.glass) { this.quad(u0, u1, y0, y1, n, col, this.k.glass); }
  /** A quad across the face (perpendicular), at u, from n0 to n1 out, facing +u (`dir` 1) or −u. */
  end(u: number, y0: number, y1: number, n0: number, n1: number, dir: 1 | -1, col: number, m: Mesh = this.k.plain) {
    const a = this.at + this.s * n0, b = this.at + this.s * n1;
    m.vq(this.ax === 'x' ? 'x' : 'z', u, Math.min(a, b), Math.max(a, b), y0, y1, dir, col);
  }
  /** A horizontal quad (a deck, a roof's finish) at height y between n0 and n1 out of the face, from u0 to u1 along it, facing up. */
  hq(u0: number, u1: number, n0: number, n1: number, y: number, col: number, m: Mesh = this.k.plain) {
    const a = this.at + this.s * n0, b = this.at + this.s * n1, lo = Math.min(a, b), hi = Math.max(a, b);
    if (this.ax === 'x') m.hq(u0, lo, u1, hi, y, true, col); else m.hq(lo, u0, hi, u1, y, true, col);
  }
  /** A box from n0 to n1 out of the face; `skip`: i (the inner face), e (the two ends), t (top), u (under), or a plan letter. Default: not its inner face nor its underside. */
  box(u0: number, u1: number, y0: number, y1: number, n0: number, n1: number, col: number, skip = 'iu', m: Mesh = this.k.plain) {
    const a = this.at + this.s * n0, b = this.at + this.s * n1, lo = Math.min(a, b), hi = Math.max(a, b);
    let sk = ''; for (const ch of skip) sk += ch === 'i' ? this.inner : ch === 'e' ? this.ends : ch === 't' ? 'T' : ch === 'u' ? 'U' : ch;
    if (this.ax === 'x') m.box(u0, y0, lo, u1, y1, hi, col, sk); else m.box(lo, y0, u0, hi, y1, u1, col, sk);
  }
  /**
   * A glazed opening: a pane in slim frames (jambs, head, sill, mullions) in the palette's bronze, a sill ledge and a head band proud of the wall (their
   * shadows are what shows from the street). `lean`: the pane and its sill only (a back or a side the street does not see close).
   */
  opening(o: { u0: number; u1: number; y0: number; y1: number; mull?: number; ledge?: boolean; head?: boolean; frame?: number; col?: number; n?: number; lean?: boolean }) {
    const { k } = this, n = o.n ?? 0, fr = o.frame ?? k.p.frame, w = o.u1 - o.u0, mull = o.mull ?? Math.max(0, Math.round(w / 1.7) - 1);
    this.pane(o.u0, o.u1, o.y0, o.y1, n + 0.03, o.col);
    if (o.lean || k.lite) {
      this.quad(o.u0, o.u1, o.y0 - 0.08, o.y0 + 0.02, n + 0.05, fr); this.quad(o.u0, o.u1, o.y1 - 0.08, o.y1 + 0.02, n + 0.05, fr);
      return;
    }
    this.quad(o.u0, o.u0 + 0.06, o.y0, o.y1, n + 0.045, fr); this.quad(o.u1 - 0.06, o.u1, o.y0, o.y1, n + 0.045, fr);
    this.quad(o.u0 + 0.06, o.u1 - 0.06, o.y1 - 0.07, o.y1, n + 0.045, fr); this.quad(o.u0 + 0.06, o.u1 - 0.06, o.y0, o.y0 + 0.06, n + 0.045, fr);
    for (let i = 1; i <= mull; i++) { const u = o.u0 + (w * i) / (mull + 1); this.quad(u - 0.025, u + 0.025, o.y0 + 0.06, o.y1 - 0.07, n + 0.045, fr); }
    if (o.head !== false) this.box(o.u0 - 0.06, o.u1 + 0.06, o.y1, o.y1 + 0.1, n, n + 0.16, k.p.slab, 'iute');
    if (o.ledge !== false) this.box(o.u0 - 0.06, o.u1 + 0.06, o.y0 - 0.06, o.y0, n, n + 0.12, k.p.slab, 'iue');
  }
  /** The house number: gilt seven-segment digits (2 triangles a segment) on a dark plaque, `u` its centre along the face, `y` its foot, `n` out of the face. */
  houseNumber(text: string, u: number, y: number, n: number, o: { h?: number; col?: number; plate?: number } = {}) {
    const { k } = this, h = o.h ?? 0.26, w = h * 0.52, t = h * 0.13, gap = h * 0.4, col = o.col ?? mix(k.p.accent, 0xffe9a8, 0.55), pitch = w + gap, len = text.length * pitch - gap, u0 = u - len / 2;
    const flip = k.d.f.mirror && this.ax === 'x';                                                         // a mirrored site mirrors its plan: draw the digits reversed so they read right
    this.quad(u0 - 0.1, u0 + len + 0.1, y - 0.1, y + h + 0.1, n, o.plate ?? 0x1c1a18);
    [...text].forEach((ch, i) => {
      const a = u0 + i * pitch, seg = DIGITS[ch] ?? '';
      const S: Record<string, [number, number, number, number]> = { a: [a, a + w, y + h - t, y + h], b: [a + w - t, a + w, y + h / 2, y + h], c: [a + w - t, a + w, y, y + h / 2], d: [a, a + w, y, y + t], e: [a, a + t, y, y + h / 2], f: [a, a + t, y + h / 2, y + h], g: [a, a + w, y + h / 2 - t / 2, y + h / 2 + t / 2] };
      for (const c of seg) { const [x0, x1, y0, y1] = S[c]; if (flip) this.quad(2 * u - x1, 2 * u - x0, y0, y1, n + 0.01, col); else this.quad(x0, x1, y0, y1, n + 0.01, col); }
    });
  }
  /**
   * Vertical slats (an oak claustra, a brise-soleil), `depth` deep from the face's plane at n0: three faces each (6 triangles); a dark backing behind
   * them so the gaps read. A slat every `pitch` m (twice as far apart on the low preset).
   */
  slats(o: { u0: number; u1: number; y0: number; y1: number; pitch?: number; w?: number; depth?: number; n0?: number; col?: number; back?: number | null; alt?: number }) {
    const { k } = this, pitch = (o.pitch ?? 0.2) * (k.lite ? 1.7 : 1), w = (o.w ?? 0.07) * (k.lite ? 1.4 : 1), dep = o.depth ?? 0.12, n0 = o.n0 ?? 0.04, col = o.col ?? k.p.wood;
    if (o.back !== null) this.quad(o.u0, o.u1, o.y0, o.y1, n0 > 0.02 ? 0.015 : n0 + 0.02, o.back ?? 0x2a211a);
    const n = Math.max(1, Math.floor((o.u1 - o.u0 - w) / pitch));
    for (let i = 0; i <= n; i++) {
      const u = o.u0 + w / 2 + ((o.u1 - o.u0 - w) * i) / n, c = o.alt !== undefined && i % 3 === 1 ? o.alt : col;
      this.box(u - w / 2, u + w / 2, o.y0, o.y1, n0, n0 + dep, c, 'iut');
    }
  }
  /**
   * A balcony: a slab `depth` out, its top at `y` (5 faces), a guard 1.05 m high on its outer edge and its two returns: 'glass' (light clear panes in a
   * slim steel rail), 'solid' (a low parapet of render, a planter's lip on top when `green`), 'bars' (a rail and a lower rail).
   */
  balcony(o: { u0: number; u1: number; y: number; depth?: number; guard?: 'glass' | 'solid' | 'bars' | 'none'; col?: number; guardCol?: number; green?: boolean; thick?: number; returns?: [boolean, boolean]; n0?: number }) {
    const { k } = this, dep = o.depth ?? 1.7, th = o.thick ?? 0.24, col = o.col ?? k.p.slab, n0 = o.n0 ?? 0, H = 1.05, gu = o.guard ?? 'glass', [ra, rb] = o.returns ?? [true, true];
    this.box(o.u0, o.u1, o.y - th, o.y, n0, n0 + dep, col, 'i');   // all of it but the inner face (the underside is seen from the street)
    if (!k.lite) this.hq(o.u0 + 0.08, o.u1 - 0.08, n0 + 0.06, n0 + dep - 0.1, o.y + 0.012, mix(k.p.wood, 0xffffff, 0.12));                    // its oak deck
    if (gu === 'none') return;
    const no = n0 + dep - 0.06;
    if (gu === 'glass') {
      this.quad(o.u0 + 0.03, o.u1 - 0.03, o.y + 0.06, o.y + H, no, o.guardCol ?? GUARD);
      this.box(o.u0, o.u1, o.y + H, o.y + H + 0.04, no - 0.03, no + 0.03, k.p.frame, 'iue');
      if (ra) this.end(o.u0 + 0.03, o.y + 0.06, o.y + H, n0 + 0.02, no, -1, o.guardCol ?? GUARD);
      if (rb) this.end(o.u1 - 0.03, o.y + 0.06, o.y + H, n0 + 0.02, no, 1, o.guardCol ?? GUARD);
    } else if (gu === 'solid') {
      this.box(o.u0, o.u1, o.y, o.y + H - 0.1, no - 0.07, no + 0.05, o.guardCol ?? k.p.render, 'iu');
      if (ra) this.end(o.u0, o.y, o.y + H - 0.1, n0 + 0.02, no - 0.07, -1, o.guardCol ?? k.p.render);
      if (rb) this.end(o.u1, o.y, o.y + H - 0.1, n0 + 0.02, no - 0.07, 1, o.guardCol ?? k.p.render);
      if (o.green) this.box(o.u0 + 0.1, o.u1 - 0.1, o.y + H - 0.1, o.y + H + 0.28, no - 0.08, no + 0.04, GREEN.hedge2, 'iu', k.leaves);
    } else {
      this.box(o.u0, o.u1, o.y + H - 0.05, o.y + H, no - 0.03, no + 0.03, k.p.frame, 'iue'); this.box(o.u0, o.u1, o.y + 0.14, o.y + 0.18, no - 0.02, no + 0.02, k.p.frame, 'iue');
      const nb = Math.max(2, Math.round((o.u1 - o.u0) / (k.lite ? 0.7 : 0.35)));
      for (let i = 0; i <= nb; i++) { const u = o.u0 + 0.04 + ((o.u1 - o.u0 - 0.08) * i) / nb; this.quad(u - 0.012, u + 0.012, o.y + 0.18, o.y + H - 0.05, no + 0.03, k.p.frame); }
    }
  }
}

/** The cost breakdown of the last design flushed (tests/almadiesResidences.test.ts prints it when a budget is missed). */
export let lastSections: [string, number][] = [];
/** What a design draws with: the site's draw, the palette, and one heap per batch it fills (flushed at the end). */
export class Kit {
  readonly plain: Mesh; readonly glass: Mesh; readonly leaves: Mesh; readonly bulbs: Mesh;
  readonly p: SitePalette; readonly lite: boolean;
  constructor(readonly d: SiteDraw) {
    this.plain = new Mesh(d, d.plain); this.glass = new Mesh(d, d.glass); this.leaves = new Mesh(d, d.leaves); this.bulbs = new Mesh(d, d.bulbs);
    this.p = d.p; this.lite = d.lite;
  }
  /** The triangles drawn since the last section, by name (the lanes' cost breakdown: the cost test prints it). */
  readonly sections: [string, number][] = [];
  private last = 0;
  sec(name: string) { const t = this.tris; this.sections.push([name, t - this.last]); this.last = t; }
  facade(face: Face, at: number) { return new Facade(this, face, at); }
  /** A slab (a floor's edge, a roof) over a plan rectangle, `thick` thick, its top at y, `over` m of overhang all round: all six faces (seen from below). */
  slab(r: { x0: number; z0: number; x1: number; z1: number }, y: number, o: { thick?: number; over?: number; col?: number; overS?: number } = {}) {
    const th = o.thick ?? 0.26, ov = o.over ?? 0.35;
    this.plain.box(r.x0 - ov, y - th, r.z0 - ov, r.x1 + ov, y, r.z1 + (o.overS ?? ov), o.col ?? this.p.slab, '');
  }
  /** The roof's finish over a slab's top (a shade darker than the white slab, its edge left bare), `inset` m in from the slab's edge. */
  roofDeck(r: { x0: number; z0: number; x1: number; z1: number }, y: number, inset = 0.4) {
    this.plain.hq(r.x0 + inset, r.z0 + inset, r.x1 - inset, r.z1 - inset, y + 0.02, true, mix(this.p.roof, 0x000000, 0.1));
  }
  /** A row of solar panels on frames over the roof (tilted look: a dark slab and its lighter rim), `n` of them from (x, z) along x. */
  solar(x: number, z: number, y: number, n: number) {
    if (this.lite) return;
    for (let i = 0; i < n; i++) { this.plain.box(x + i * 1.9, y + 0.35, z, x + i * 1.9 + 1.7, y + 0.42, z + 1.0, 0x233044, 'U'); this.plain.box(x + i * 1.9 + 0.1, y, z + 0.1, x + i * 1.9 + 0.2, y + 0.35, z + 0.9, 0xbfc4c8, 'UT'); }
  }
  /** A post (a pilotis, a pergola's, a canopy's): a square column from y0 to y1, four faces. */
  post(x: number, z: number, w: number, y0: number, y1: number, col: number, skip = 'UT') { this.plain.box(x - w / 2, y0, z - w / 2, x + w / 2, y1, z + w / 2, col, skip); }
  flush() { this.plain.flush(); this.glass.flush(); this.leaves.flush(); this.bulbs.flush(); lastSections = this.sections; }
  get tris() { return this.plain.tris + this.glass.tris + this.leaves.tris + this.bulbs.tris; }
}
export const kitOf = (d: SiteDraw) => new Kit(d);
/**
 * A cluster of bougainvillea over a wall's top at plan (x, z), the wall's top at y: a cushion of leaves and three rounder clusters of flowers in the
 * palette's accent (as the shared perimeter's, which only draws them on a full-height street wall). Thinned out on the low preset.
 */
export function bougainvillea(d: SiteDraw, x: number, z: number, y: number, r = 0.7, k = 0) {
  if (d.lite && k % 2) return;
  d.blob(d.leaves, r, x, y - 0.12, z, d.c.hedge, 0.45, 0);
  for (const [t, dy] of [[-0.45, 0.1], [0.1, 0.2], [0.55, 0.08]] as const) d.blob(d.leaves, r * 0.5, x + t * r, y + dy, z, (k + Math.round(t * 4)) % 3 ? d.c.bloom : d.c.bloom2, 0.75, 0);
}
