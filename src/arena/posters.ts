import * as THREE from 'three';
import type { GameModule } from '../game/modules';
import type { Collider, HubWorld, RoadEdge } from '../world/types';
import { rng } from '../core/rng';
import { WALL_R, inGate, inTunnel } from '../world/geew';
import { BILL, GALA, TICKET_PRICE } from './program';
import { eveningSize } from './exterior';

/**
 * Fight posters (« a big fight is visible in Dakar before you even reach the arena »): tonight's card pasted on street
 * walls in the four hubs, more of them in Pikine on the way to the arena and on its outer wall. One canvas texture per hub,
 * redrawn when the card changes (each city day; « Grand gala » Friday–Sunday, « Combat de quartier » on weekdays) or when
 * a result comes in, and all the posters of a hub in one merged mesh (one draw call). They glow a little at night like the
 * shop signs. The career lane prints the last winner through `posters.setResult(day, text)`; its own big poster by the
 * gate is kept clear (POSTER_KEEP_CLEAR).
 *
 * Wrestlers and écuries are the game's fictional cast (src/arena/program.ts BILL); no real promoter, sponsor or brand.
 */

/** Posters per hub: Pikine gets the most, with a share of them on the way to the arena (within NEAR_ARENA m). */
export const POSTER_COUNT: Record<string, number> = { pikine: 16, plateau: 8, corniche: 7, almadies: 6 };
export const NEAR_ARENA = 160;
const ARENA_WALL_POSTERS = 6;
/** Angle (as atan2(x, z) from the arena centre) of the career lane's big poster on the outer wall, kept clear. */
export const POSTER_KEEP_CLEAR = Math.atan2(Math.sin(-0.5), -Math.cos(-0.5));
const W = 1.0, H = 1.4, Y = 1.95;

let result: { day: number; text: string } | null = null;
let revision = 0;
/** API for the career lane: the last bout's result, printed on every poster for two city days. */
export const posters = {
  setResult(day: number, text: string) { result = { day, text }; revision++; },
  clearResult() { result = null; revision++; },
};

export interface PosterLines { tag: string; title: string; ecuries: string; when: string; price: string; result: string | null; big: boolean }
/** What tonight's poster says (pure, unit-tested). */
export function posterLines(day: number, hour: number, last: { day: number; text: string } | null = result): PosterLines {
  const tonight = hour < GALA.close, d = tonight ? day : day + 1, big = eveningSize(d, GALA.doors) === 'gala';
  return {
    tag: big ? 'GRAND GALA DE LUTTE' : 'COMBAT DE QUARTIER',
    title: `${BILL.left.name} – ${BILL.right.name}`.toUpperCase(),
    ecuries: `Écurie ${BILL.left.ecurie} · Écurie ${BILL.right.ecurie}`,
    when: `${tonight ? 'Ce soir' : 'Demain'} ${GALA.doors} h · Arène de Pikine`,
    price: `Entrée ${TICKET_PRICE.toLocaleString('fr-FR')} F`,
    result: last && day - last.day <= 2 ? `Dernier combat : ${last.text}` : null,
    big,
  };
}

export interface PosterSpot { x: number; y: number; z: number; yaw: number }
/**
 * Street walls facing a road: from a point of a road edge, look across the sidewalk for the first wall (a collider at
 * least 2.5 m high) with room for a poster, away from doors and places (interactables) and from the other posters.
 * Deterministic for a hub (seeded).
 */
export function wallSpots(w: Pick<HubWorld, 'id' | 'edges' | 'colliders' | 'interactables' | 'arena'>, count: number, seed = 1): PosterSpot[] {
  const R = rng(0xa11e + seed + w.id.length * 131), out: PosterSpot[] = [];
  if (!w.edges.length || count <= 0) return out;
  const walls = w.colliders.filter(c => c.h >= 2.5);
  const inWall = (x: number, z: number) => walls.find(c => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) ?? null;
  const arena = w.arena, nearArena = (x: number, z: number) => !!arena && Math.hypot(x - arena.cx, z - arena.cz) < NEAR_ARENA;
  const insideArena = (x: number, z: number) => !!arena && Math.hypot(x - arena.cx, z - arena.cz) < WALL_R + 3;
  const wantNear = arena ? Math.ceil(count * 0.6) : 0;
  for (let tries = 0; out.length < count && tries < count * 60; tries++) {
    const e: RoadEdge = w.edges[Math.floor(R() * w.edges.length)];
    const len = Math.hypot(e.bx - e.ax, e.bz - e.az); if (len < 20) continue;
    const dx = (e.bx - e.ax) / len, dz = (e.bz - e.az) / len, side = R() < 0.5 ? 1 : -1, nx = -dz * side, nz = dx * side;
    const t = 0.15 + R() * 0.7, px = e.ax + (e.bx - e.ax) * t, pz = e.az + (e.bz - e.az) * t;
    if (out.filter(s => nearArena(s.x, s.z)).length < wantNear && !nearArena(px, pz) && tries < count * 40) continue;
    // across the sidewalk to the first wall
    let hit: Collider | null = null, s = 5.5;
    while (s < 13) { hit = inWall(px + nx * s, pz + nz * s); if (hit) break; s += 0.1; }
    if (!hit) continue;
    let lo = s - 0.1, hi = s;                                                 // the face, to a few millimetres
    for (let k = 0; k < 8; k++) { const m = (lo + hi) / 2; if (inWall(px + nx * m, pz + nz * m)) hi = m; else lo = m; }
    const fx = px + nx * (lo - 0.03), fz = pz + nz * (lo - 0.03);            // just in front of the face
    if (insideArena(fx, fz)) continue;
    // the wall carries the whole poster
    const ok = [-W / 2 - 0.1, W / 2 + 0.1].every(o => inWall(fx + dx * o + nx * 0.25, fz + dz * o + nz * 0.25));
    if (!ok) continue;
    if (w.interactables.some(i => Math.hypot(i.x - fx, i.z - fz) < 3)) continue;   // not over a door or a counter
    if (out.some(p => Math.hypot(p.x - fx, p.z - fz) < 9)) continue;
    out.push({ x: fx, y: Y, z: fz, yaw: Math.atan2(-nx, -nz) });
  }
  return out;
}
/** Posters on the arena's outer wall, on the street side, clear of the gates, the wall's banners and the career poster. */
export function arenaWallSpots(cx: number, cz: number, n = ARENA_WALL_POSTERS): PosterSpot[] {
  const out: PosterSpot[] = [], r = WALL_R + 0.27;
  for (let s = 0; s < 40 && out.length < n; s++) {
    if (s % 3 !== 2) continue;                                                 // the builder paints a banner on s % 3 === 0
    const a = ((s + 0.5) / 40) * Math.PI * 2;
    if (inGate(a, 0.5) || inTunnel(a, 0.5)) continue;
    if (Math.abs(Math.atan2(Math.sin(a - POSTER_KEEP_CLEAR), Math.cos(a - POSTER_KEEP_CLEAR))) < 0.3) continue;
    out.push({ x: cx + Math.sin(a) * r, y: 1.7, z: cz + Math.cos(a) * r, yaw: a });
  }
  // the gate side first: sort by closeness to the public gate (−z)
  return out.sort((p, q) => (p.z - q.z));
}

function drawPoster(l: PosterLines): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = 360; cv.height = 504;
  const c = cv.getContext('2d')!, wd = cv.width;
  const fit = (text: string, max: number, size: number, weight = 900) => { c.font = `${weight} ${size}px system-ui, sans-serif`; while (c.measureText(text).width > max && size > 12) { size -= 1; c.font = `${weight} ${size}px system-ui, sans-serif`; } };
  c.fillStyle = l.big ? '#f4dfae' : '#e6eef0'; c.fillRect(0, 0, wd, 504);
  c.fillStyle = l.big ? '#a3231a' : '#0f5e6e'; c.fillRect(0, 0, wd, 96);
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff3d0';
  fit(l.tag, wd - 24, 34); c.fillText(l.tag, wd / 2, 50);
  // the two wrestlers' colours (écuries Baobab green, Teranga red) as two bands
  c.fillStyle = '#1a7a44'; c.fillRect(18, 116, wd / 2 - 24, 120);
  c.fillStyle = '#c8322a'; c.fillRect(wd / 2 + 6, 116, wd / 2 - 24, 120);
  c.fillStyle = '#ffffff'; fit('VS', 60, 40); c.fillText('VS', wd / 2, 176);
  const [a, b] = l.title.split(' – ');
  fit(a, wd / 2 - 40, 34); c.fillText(a, wd / 4 + 2, 176);
  fit(b, wd / 2 - 40, 34); c.fillText(b, (3 * wd) / 4 - 2, 176);
  c.fillStyle = '#3a2a14'; fit(l.ecuries, wd - 30, 21, 700); c.fillText(l.ecuries, wd / 2, 264);
  c.fillStyle = l.big ? '#a3231a' : '#0f5e6e'; fit(l.when, wd - 24, 26); c.fillText(l.when, wd / 2, 316);
  c.fillStyle = '#3a2a14'; fit(l.price, wd - 30, 22, 700); c.fillText(l.price, wd / 2, 356);
  if (l.result) {
    c.fillStyle = '#1b2a7a'; c.fillRect(0, 392, wd, 70);
    c.fillStyle = '#fff3d0'; fit(l.result, wd - 24, 22, 800); c.fillText(l.result, wd / 2, 427);
  }
  c.fillStyle = l.big ? '#a3231a' : '#0f5e6e'; c.fillRect(0, 476, wd, 28);
  c.fillStyle = '#fff3d0'; fit('LÀMB · LUTTE SÉNÉGALAISE', wd - 30, 16, 800); c.fillText('LÀMB · LUTTE SÉNÉGALAISE', wd / 2, 490);
  return cv;
}

/** One merged mesh for all the posters of a hub (each quad shows the whole texture). */
function posterMesh(spots: PosterSpot[], mat: THREE.Material): THREE.Mesh {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  spots.forEach((s, i) => {
    const q = new THREE.PlaneGeometry(W, H); q.rotateZ((((i * 7919) % 9) - 4) * 0.008);   // pasted by hand: never quite straight
    q.rotateY(s.yaw); q.translate(s.x, s.y, s.z);
    const P = q.attributes.position, N = q.attributes.normal, U = q.attributes.uv, base = i * P.count;
    for (let v = 0; v < P.count; v++) { pos.push(P.getX(v), P.getY(v), P.getZ(v)); nor.push(N.getX(v), N.getY(v), N.getZ(v)); uv.push(U.getX(v), U.getY(v)); }
    for (const k of Array.from(q.index!.array)) idx.push(base + k);
    q.dispose();
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat); m.name = 'fight_posters';
  return m;
}

let mesh: THREE.Mesh | null = null, tex: THREE.CanvasTexture | null = null, spots: PosterSpot[] = [];
let key = '', t = 0, hubId = '';

export const postersModule: GameModule = {
  name: 'posters',
  hubLoaded(ctx, hub) {
    if (mesh) { mesh.removeFromParent(); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
    tex?.dispose(); mesh = null; tex = null; key = ''; hubId = hub.id;
    if (typeof document === 'undefined') return;
    spots = [...(hub.arena ? arenaWallSpots(hub.arena.cx, hub.arena.cz) : []), ...wallSpots(hub, POSTER_COUNT[hub.id] ?? 6)];
    if (!spots.length) return;
    tex = new THREE.CanvasTexture(document.createElement('canvas')); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0, side: THREE.DoubleSide });
    for (const s of spots) s.y += hub.heightAt(s.x, s.z);
    mesh = posterMesh(spots, mat);
    ctx.extra.add(mesh);
    hub.signs.push(mesh);                                                     // night glow with the shop signs (main.ts)
  },
  update(ctx, dt) {
    if (!tex) return;
    t -= dt; if (t > 0) return; t = 2;
    const l = posterLines(ctx.day(), ctx.hour()), k = `${revision}|${l.tag}|${l.when}|${l.result}`;
    if (k !== key) { key = k; tex.image = drawPoster(l); tex.needsUpdate = true; }
  },
  debug: ctx => ({
    /** The posters of this hub and what they say. */
    posters: () => ({ hub: hubId, count: spots.length, spots: spots.map(s => ({ x: +s.x.toFixed(2), z: +s.z.toFixed(2), yaw: +s.yaw.toFixed(2) })), lines: posterLines(ctx.day(), ctx.hour()) }),
    postersResult: (day: number, text: string) => posters.setResult(day, text),
  }),
};
