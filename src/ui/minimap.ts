import './minimap.css';
import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { HubWorld } from '../world/types';
import type { HubId } from '../core/types';
import { HUB_NAMES } from '../world/content';
import { buildLayer, drawArrow, drawEdgeArrow, drawIcon, PALETTE, type Layer } from './minimapDraw';
import {
  approach, dedupePlaces, northAngle, nightness, onRing, placeKind, project, routePath, whereLabel, zoomRadius,
  type MapPlace, type Pt,
} from './minimapMath';
import { openEdges } from '../game/navRules';
import { closuresNow } from '../actors/npc';
import { JOB, drawJobBadge, jobOf } from './jobMarks';

/**
 * The minimap (top-left, Habib's reference): a round dark map of the hub that turns with the camera, the player's arrow at
 * the centre, the north marker on the ring, dots for the places the player can use (coloured by type), the objective
 * (pulsing), a waypoint with its dotted route along the roads, taxis and cars nearby, friends, and under it the
 * neighbourhood and the nearest named place. A 2D canvas over the game: no draw call in the 3D scene. The hub's static
 * layer is rendered once per hub load (src/ui/minimapDraw.ts buildLayer) from the hub's own roads, blocks and buildings;
 * every tick (10 Hz) blits it rotated and draws the dynamic layers. Tap: the full map in the phone (src/ui/fullmap.ts).
 * Hidden like the other HUD bits (menus, scenes, activities, interiors), and by the « Mini-carte » setting.
 */

const KEY = 'dakarrek.ui.minimap';
const store = () => { try { return localStorage; } catch { return null; } };

export interface MapVehicle { x: number; z: number; yaw: number; kind: string; moving: boolean }
export interface MapFriend { id: string; name: string; x: number; z: number }

/**
 * The meeting point between the map module, the full map in the phone and main.ts (which wires the three functions at
 * the top: the game's own waypoint, the phone, the contacts).
 */
export const mapBridge = {
  hub: null as HubWorld | null,
  hubName: '',
  layer: null as Layer | null,
  places: [] as MapPlace[],
  player: { x: 0, z: 0, yaw: 0, facing: 0, speed: 0, driving: false },
  guide: null as { name: string; x: number; z: number; job?: 'vtc' | 'delivery' } | null,
  friends: [] as MapFriend[],
  vehicles: [] as MapVehicle[],
  /** The vehicles the player owns, wherever they are parked (wired by main.ts): the city map (src/ui/geoMap.ts) shows them. */
  owned: (): { asset: string; name: string; hub: HubId; x: number; z: number; yaw: number }[] => [],
  hour: 12,
  /** The walking route to the current objective (along the roads), refreshed with the minimap. */
  route: null as { points: Pt[]; length: number } | null,
  version: 0,
  /** The open full map's world → page pixels (checks and tests tap places through it); null when it is closed. */
  screenOf: null as ((x: number, z: number) => { x: number; y: number }) | null,
  // wired by main.ts
  /** Sets (or clears) the game's walking marker (src/main.ts setDestination); the world markers and the goal line follow it. */
  walkTo: (_id: string | null) => {},
  /** The place the player marked, if it is in this hub. */
  destination: (): string | null => null,
  /** Opens the phone on its map. */
  openMap: () => {},
  friendsNow: (): MapFriend[] => [],
  /** Real players near, in the street (src/multiplayer/social.ts): a quiet dot on the map, no name, nothing on the 3D screen. */
  playersNow: (): MapFriend[] => [],
  get enabled() { return store()?.getItem(KEY) !== 'off'; },
  setEnabled(on: boolean) { try { if (on) store()?.removeItem(KEY); else store()?.setItem(KEY, 'off'); } catch { /* session only */ } document.body.classList.toggle('mm-off', !on); },
};

const TAU = Math.PI * 2;

export function minimapModule(): GameModule {
  let root!: HTMLElement, canvas!: HTMLCanvasElement, dEl!: HTMLElement, sEl!: HTMLElement, g!: CanvasRenderingContext2D;
  let size = 0, dpr = 1;
  let radius = 52, speedAvg = 0, tick = 0, labelT = 0, scanT = 0, routeT = 0, placesT = 0, shown = false, t = 0;
  let last = { x: NaN, z: NaN }, routeKey = '';
  const tracked = new Map<THREE.Object3D, { x: number; z: number; moving: boolean }>();
  const dir = new THREE.Vector3();
  let yaw = 0;

  const fit = () => {
    const s = root.querySelector<HTMLElement>('.mm-disc')!.clientWidth;
    if (!s || s === size) return;
    size = s; dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(s * dpr); canvas.height = Math.round(s * dpr);
  };
  /** The DOM is built when the game starts (the module list is also loaded where there is no document). */
  const mount = () => {
    root = document.createElement('div');
    root.id = 'minimap'; root.setAttribute('role', 'button'); root.setAttribute('aria-label', 'Mini-carte : ouvrir la carte'); root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '<div class="mm-disc"><canvas></canvas></div><div class="mm-name"><small></small><b></b></div>';
    canvas = root.querySelector('canvas')!; dEl = root.querySelector('small')!; sEl = root.querySelector('b')!;
    g = canvas.getContext('2d')!;
    new ResizeObserver(fit).observe(root.querySelector('.mm-disc')!);
    root.addEventListener('pointerdown', e => e.stopPropagation());          // a tap here never reaches the joystick or the camera drag
    root.addEventListener('click', () => mapBridge.openMap());
    (document.getElementById('ui') ?? document.body).appendChild(root);
  };

  /** The places of the hub that a player can use, with what to do there (kept fresh: modules add theirs after the load). */
  const refreshPlaces = (hub: HubWorld, ctx: GameCtx) => {
    const list: MapPlace[] = [];
    for (const i of hub.interactables) {
      if (i.npc || /:arena:/.test(i.id)) continue;
      list.push({ id: i.id, name: i.name, x: i.x, z: i.z, kind: placeKind(i.id, i.name), what: i.actions.map(a => a.label).slice(0, 4) });
    }
    // the vehicle dealers (src/transport/ownedModule.ts) are places the modules add: on the map too, to walk to them (« Marquer »)
    for (const pl of ctx.places.all()) {
      const a = pl.anchors[0];
      if (a && /:dealer$/.test(pl.id)) list.push({ id: pl.id, name: pl.name, x: a.x, z: a.z, kind: 'shop', what: ['Voir les articles', 'Essayer'] });
    }
    mapBridge.places = dedupePlaces(list);
  };

  const scanVehicles = (ctx: GameCtx) => {
    const seen = new Set<THREE.Object3D>();
    const walk = (o: THREE.Object3D) => {
      if (o.userData.vehicleSpec) { seen.add(o); if (!tracked.has(o)) tracked.set(o, { x: NaN, z: NaN, moving: false }); return; }
      if (o.name === 'humanoid_v2') return;
      for (const c of o.children) walk(c);
    };
    walk(ctx.extra);
    const w = ctx.world(); if (w) walk(w.group);
    for (const k of tracked.keys()) if (!seen.has(k)) tracked.delete(k);
  };
  const readVehicles = (px: number, pz: number) => {
    const out: MapVehicle[] = [];
    for (const [o, st] of tracked) {
      if (!o.visible) { st.x = NaN; continue; }
      const e = o.matrixWorld.elements, x = e[12], z = e[14];
      st.moving = Number.isFinite(st.x) && (x - st.x) ** 2 + (z - st.z) ** 2 > 0.04; st.x = x; st.z = z;
      if ((x - px) ** 2 + (z - pz) ** 2 < 4 || (x - px) ** 2 + (z - pz) ** 2 > 150 * 150) continue;   // the player's own vehicle, or far away
      const kind = (o.userData.vehicleSpec as { kind?: string }).kind ?? 'car';
      if (!st.moving && kind !== 'taxi') continue;
      out.push({ x, z, yaw: Math.atan2(e[8], e[10]), kind, moving: st.moving });
    }
    mapBridge.vehicles = out;
  };

  const draw = (ctx: GameCtx) => {
    const lay = mapBridge.layer, p = mapBridge.player;
    if (!size || !lay) return;
    const S = size, c = S / 2, R = c - 2;
    const scale = (S / 2) / radius;                                // px per metre
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(c, c, R, 0, TAU); g.clip();
    g.fillStyle = PALETTE.void; g.fillRect(0, 0, S, S);
    // the static layer, blitted rotated and translated (drawn in metres under this transform)
    const s = Math.sin(yaw), co = Math.cos(yaw);
    const a = -scale * co, b = -scale * s, cc = scale * s, d = -scale * co;
    g.save();
    g.transform(a, b, cc, d, c - (a * p.x + cc * p.z), c - (b * p.x + d * p.z));
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'medium';
    // only the square under the visible circle (its bounding square does not depend on the heading): the layer is far bigger than the view
    const rm = radius * 1.04, K = lay.K;
    const sx0 = Math.max(0, (p.x - rm - lay.x0) * K), sy0 = Math.max(0, (p.z - rm - lay.z0) * K), sx1 = Math.min(lay.w, (p.x + rm - lay.x0) * K), sy1 = Math.min(lay.h, (p.z + rm - lay.z0) * K);
    if (sx1 > sx0 && sy1 > sy0) g.drawImage(lay.canvas, sx0, sy0, sx1 - sx0, sy1 - sy0, lay.x0 + sx0 / K, lay.z0 + sy0 / K, (sx1 - sx0) / K, (sy1 - sy0) / K);
    g.restore();
    // the night tint follows the game hour
    const night = nightness(mapBridge.hour);
    if (night > 0.02) { g.fillStyle = `rgba(8,14,46,${(0.36 * night).toFixed(3)})`; g.fillRect(0, 0, S, S); }
    const P = (x: number, z: number) => project(x, z, p.x, p.z, yaw, scale, c, c);
    // route to the objective: dotted, along the roads
    const rt = mapBridge.route;
    if (rt && rt.points.length > 1) {
      g.beginPath();
      rt.points.forEach((q, i) => { const m = P(q.x, q.z); if (i) g.lineTo(m.x, m.y); else g.moveTo(m.x, m.y); });
      g.lineCap = 'round'; g.lineJoin = 'round'; g.setLineDash([0.5, 5]); g.lineDashOffset = -t * 6;
      g.lineWidth = 6; g.strokeStyle = 'rgba(10,14,18,.7)'; g.stroke();
      g.lineWidth = 3.4; g.strokeStyle = jobOf(mapBridge.guide) ? JOB[jobOf(mapBridge.guide)!].color : '#ffd23f'; g.stroke();
      g.setLineDash([]);
    }
    // places the player can use
    const rIcon = Math.max(6, Math.min(8.5, S * 0.066));
    for (const pl of mapBridge.places) {
      const m = P(pl.x, pl.z);
      if ((m.x - c) ** 2 + (m.y - c) ** 2 > (R + rIcon) ** 2) continue;
      drawIcon(g, pl.kind, m.x, m.y, pl.kind === 'spot' ? rIcon * 0.7 : rIcon, { glyph: pl.kind !== 'spot' });
    }
    // taxis and cars nearby
    for (const v of mapBridge.vehicles) {
      const m = P(v.x, v.z);
      if ((m.x - c) ** 2 + (m.y - c) ** 2 > R * R) continue;
      g.save(); g.translate(m.x, m.y); g.rotate(yaw - v.yaw);          // its heading on the turning map
      const w = v.kind === 'moto' ? 3 : v.kind === 'car_rapide' || v.kind === 'bus' ? 5 : 4, l = v.kind === 'moto' ? 6 : v.kind === 'car_rapide' || v.kind === 'bus' ? 11 : 8;
      g.fillStyle = v.kind === 'taxi' ? '#ffd23f' : v.kind === 'car_rapide' || v.kind === 'bus' ? '#ff9f1c' : '#dfe6ea';
      g.globalAlpha = v.moving ? 1 : 0.6; g.fillRect(-w / 2, -l / 2, w, l);
      g.lineWidth = 1; g.strokeStyle = '#0c1115'; g.strokeRect(-w / 2, -l / 2, w, l); g.restore();
    }
    // friends and contacts around
    for (const f of mapBridge.friends) {
      const m = P(f.x, f.z);
      if ((m.x - c) ** 2 + (m.y - c) ** 2 > R * R) continue;
      g.beginPath(); g.arc(m.x, m.y, 3.6, 0, TAU); g.fillStyle = '#7CFFB2'; g.fill(); g.lineWidth = 1.4; g.strokeStyle = '#0c1115'; g.stroke();
    }
    // real players nearby: a small cool dot, no label (the 3D view shows their names only when they are close)
    for (const f of mapBridge.playersNow()) {
      const m = P(f.x, f.z);
      if ((m.x - c) ** 2 + (m.y - c) ** 2 > R * R) continue;
      g.beginPath(); g.arc(m.x, m.y, 3, 0, TAU); g.fillStyle = '#6ee7ff'; g.fill(); g.lineWidth = 1.2; g.strokeStyle = '#0c1115'; g.stroke();
    }
    // the objective, pulsing, with an arrow on the ring when it is off the map
    const gd = mapBridge.guide;
    if (gd && !ctx.inside()) {
      const m = P(gd.x, gd.z), ring = onRing(m.x - c, c - m.y, R - 6);
      const pulse = 0.5 + 0.5 * Math.sin(t * 5), job = jobOf(gd);
      if (job) {                                                       // a job: its own badge (a car in a green square, a parcel in an orange circle)
        if (!ring.outside) drawJobBadge(g, job, m.x, m.y, Math.max(7, S * 0.06), pulse);
        else drawEdgeArrow(g, c + ring.x, c + ring.y, ring.angle, JOB[job].color, 7 + pulse * 1.5);
      } else if (!ring.outside) {
        g.beginPath(); g.arc(m.x, m.y, 7 + pulse * 6, 0, TAU); g.fillStyle = `rgba(255,210,63,${0.35 - pulse * 0.2})`; g.fill();
        g.beginPath(); g.arc(m.x, m.y, 5.2, 0, TAU); g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#0c1115'; g.stroke();
        g.beginPath(); g.arc(m.x, m.y, 1.8, 0, TAU); g.fillStyle = '#0c1115'; g.fill();
      } else drawEdgeArrow(g, c + ring.x, c + ring.y, ring.angle, '#ffd23f', 7 + pulse * 1.5);
    }
    // the player: a faint view cone and the arrow
    const ang = p.driving ? 0 : yaw - p.facing;
    g.save(); g.translate(c, c); g.rotate(ang);
    const cone = g.createRadialGradient(0, 0, 2, 0, 0, R * 0.7); cone.addColorStop(0, 'rgba(255,255,255,.28)'); cone.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = cone; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R * 0.7, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); g.closePath(); g.fill();
    g.restore();
    drawArrow(g, c, c, ang, Math.max(7, S * 0.07));
    g.restore();
    // ring and north marker
    g.beginPath(); g.arc(c, c, R, 0, TAU); g.lineWidth = 3; g.strokeStyle = 'rgba(236,240,243,.92)'; g.stroke();
    g.beginPath(); g.arc(c, c, R + 1.2, 0, TAU); g.lineWidth = 1; g.strokeStyle = 'rgba(8,12,16,.7)'; g.stroke();
    const na = northAngle(yaw), nr = Math.max(7, S * 0.075), nx = c + Math.sin(na) * (R - nr * 0.85), ny = c - Math.cos(na) * (R - nr * 0.85);
    g.beginPath(); g.arc(nx, ny, nr, 0, TAU); g.fillStyle = '#e8473f'; g.fill(); g.lineWidth = 1.6; g.strokeStyle = '#f4f6f8'; g.stroke();
    g.fillStyle = '#fff'; g.font = `800 ${Math.round(nr * 1.15)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', nx, ny + 0.5);
  };

  return {
    name: 'ui-minimap',
    init(ctx) {
      mount();
      mapBridge.setEnabled(mapBridge.enabled);
      void ctx;
    },
    hubLoaded(ctx, hub) {
      mapBridge.hub = hub; mapBridge.hubName = HUB_NAMES[hub.id];
      mapBridge.layer = buildLayer(hub);
      refreshPlaces(hub, ctx);
      tracked.clear(); mapBridge.vehicles = []; mapBridge.route = null; routeKey = ''; last = { x: NaN, z: NaN };
      mapBridge.version++;
    },
    update(ctx, dt) {
      t += dt; tick += dt;
      const free = ctx.mode() === 'play' && !ctx.activities.running && !document.body.classList.contains('inscene') && !ctx.inside() && !!mapBridge.layer && mapBridge.enabled;
      if (free !== shown) { shown = free; root.classList.toggle('on', free); root.setAttribute('aria-hidden', String(!free)); document.body.classList.toggle('mm-on', free); if (free) fit(); }
      if (tick < 0.1) return;                                              // 10 Hz: refresh the state, draw
      const step = tick; tick = 0;
      const hub = ctx.world();
      if (!hub || hub !== mapBridge.hub) return;
      const pos = ctx.player.pos;
      // speed from the movement itself (on foot, running, driving: whatever carries the player)
      if (Number.isFinite(last.x)) { const v = Math.hypot(pos.x - last.x, pos.z - last.z) / step; speedAvg += ((v < 40 ? v : 0) - speedAvg) * 0.35; }
      last = { x: pos.x, z: pos.z };
      ctx.camera.getWorldDirection(dir); if (Math.hypot(dir.x, dir.z) > 1e-3) yaw = Math.atan2(dir.x, dir.z);
      radius = approach(radius, zoomRadius(speedAvg), step);
      const p = mapBridge.player; p.x = pos.x; p.z = pos.z; p.yaw = yaw; p.facing = ctx.player.facing(); p.speed = speedAvg; p.driving = ctx.space() !== 'street';
      mapBridge.hour = ctx.hour();
      mapBridge.guide = ctx.guide();
      if ((placesT -= step) <= 0) { placesT = 2; refreshPlaces(hub, ctx); mapBridge.friends = mapBridge.friendsNow(); }
      if ((scanT -= step) <= 0) { scanT = 1.5; scanVehicles(ctx); }
      // the route to the objective, along the roads: when the objective or the player's block changes
      const gd = mapBridge.guide;
      if (!gd) { mapBridge.route = null; routeKey = ''; }
      else if ((routeT -= step) <= 0) {
        const shut = p.driving ? closuresNow() : [];   // at the wheel, as the goal line: off the streets closed to cars
        const k = `${gd.x | 0},${gd.z | 0},${Math.round(pos.x / 8)},${Math.round(pos.z / 8)},${shut.length}`;
        if (k !== routeKey) { routeKey = k; mapBridge.route = routePath(openEdges(hub.edges, shut), { x: pos.x, z: pos.z }, { x: gd.x, z: gd.z }); }
        routeT = 0.5;
      }
      if (!free) return;
      readVehicles(pos.x, pos.z);
      draw(ctx);
      if ((labelT -= step) <= 0) {
        labelT = 0.4;
        const w = whereLabel(mapBridge.hubName, mapBridge.places, pos.x, pos.z);
        if (dEl.textContent !== w.district) dEl.textContent = w.district;
        if (sEl.textContent !== w.street) sEl.textContent = w.street;
      }
    },
    debug: ctx => ({
      minimap: () => ({
        on: root.classList.contains('on'), size, radius: Math.round(radius * 10) / 10, yaw, speed: Math.round(speedAvg * 10) / 10,
        district: dEl.textContent, street: sEl.textContent, places: mapBridge.places.length, vehicles: mapBridge.vehicles.length,
        route: mapBridge.route ? { n: mapBridge.route.points.length, length: Math.round(mapBridge.route.length) } : null, guide: mapBridge.guide?.name ?? null, job: jobOf(mapBridge.guide),
        north: northAngle(yaw), enabled: mapBridge.enabled, hubOk: ctx.world() === mapBridge.hub,
      }),
      minimapPlaces: () => mapBridge.places,
      minimapRoute: () => (mapBridge.route?.points ?? []).map(q => ({ x: Math.round(q.x * 10) / 10, z: Math.round(q.z * 10) / 10 })),
      fullMapAt: (x: number, z: number) => mapBridge.screenOf?.(x, z) ?? null,
    }),
  };
}
