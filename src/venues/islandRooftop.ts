import * as THREE from 'three';
import { Crowd, type CrowdSlot } from '../crowd/crowd';
import type { CrowdLook } from '../crowd/looks';
import { TRAVERSEE_SITE as S } from '../sea/traverseeSite';
import { ngorGroundY } from '../world/ngor';
import { isMuted } from '../core/audioSettings';
import { hasGestured } from '../arena/exteriorAudio';
import { rng } from '../core/rng';
import { VagueMusic } from './vagueMusic';
import {
  MUSIC_SILENT, ROOFTOP_BPM, ROOFTOP_ROLES, ROOFTOP_SEAT, ROOF_CENTRE, musicFalloff, musicLevel, rooftopId, rooftopLook, rooftopPlan, rooftopMusic, rooftopPoses,
  roofDistance, seatedRole,
  type RooftopPlan, type RooftopRole,
} from './rooftopPlan';
import type { Venue, VenueEnv } from './venue';

/**
 * The life of the island's rooftop restaurant and lounge bar (docs/TRAVERSEE.md; who is there when: src/venues/rooftopPlan.ts). The building and its
 * furniture are the world's (src/world/ngor.ts); this venue puts the people on their poses and plays the music. The player never walks there: it is
 * seen and heard from the boat (crossing, beached at the island's landing beach) and seen far off from the mainland's beach.
 *
 *  - The people: the reusable crowd (src/crowd/crowd.ts), instanced figures only (no full humanoid: the camera is never within 25 m), all at the mid
 *    level of detail (no camera fed to it: one instanced draw call for the seated, one for the standing — 2 draw calls at most). Diners and the
 *    lounge seated, chatting; the bar standing, chatting; the barman behind the counter; the DJ dancing at his booth on the music's tempo, the
 *    dancers in front of it; now and then a table applauds, and when the DJ drops a track the dancers throw their arms up, then dance harder.
 *  - Drawn only while the camera is within DRAW_FAR of the roof and the roof is in its view; while not drawn nothing of it is updated.
 *  - The music: La Vague's own track (src/venues/vagueMusic.ts), a second player of it here (La Vague is ~200 m away and heard within 75 m: never
 *    both), soft and low-passed by day (a lounge sound), louder and clear once the DJ plays; full within 40 m of the roof, silent from 110 m. None
 *    while closed, with the sound off, indoors, or before the player's first gesture.
 *  - Heights: ngorGroundY at the roof's box centre + roofY (the contract); the seated on a sitting surface ROOFTOP_SEAT above that floor.
 */
/** The crowd is drawn while the camera is within this distance of the roof (m, flat), the roof in view. */
export const DRAW_FAR = 200;
/** The music's bytes are fetched once the camera comes this close while it is open (m). */
const FETCH_NEAR = 160;

/** Silence: closed, or beyond the music's reach. */
const SILENT: ReturnType<typeof rooftopMusic> = { gain: 0, level: 0, falloff: 0, muffle: 0 };
/** A day's sitting (lunch's people are not dinner's). */
const sittingKey = (p: RooftopPlan) => p.day * 2 + (p.sitting === 'night' ? 1 : 0);

/** Debug only: `?debug&norooftop` builds the venue inert (nobody, no music), to measure what it costs. */
const disabled = () => { try { const q = new URLSearchParams(location.search); return q.has('debug') && q.has('norooftop'); } catch { return false; } };

let current: { info(): Record<string, unknown> } | null = null;
/** For `__dakar.islandRooftop()` (src/venues/index.ts): null outside the Almadies. */
export const islandRooftopInfo = () => current?.info() ?? null;

export function buildIslandRooftop(env: VenueEnv): Venue {
  const { ctx } = env, off = disabled();
  const floorY = ngorGroundY(ROOF_CENTRE.x, ROOF_CENTRE.z) + S.island.rooftop.roofY;
  const poses = rooftopPoses();
  const roleOf = new Map<string, { role: RooftopRole; i: number }>();
  for (const role of ROOFTOP_ROLES) poses[role].forEach((_, i) => roleOf.set(rooftopId(role, i), { role, i }));
  const slots = (): CrowdSlot[] => ROOFTOP_ROLES.flatMap(role => poses[role].map((p, i) => ({
    id: rooftopId(role, i), x: p.x, z: p.z, yaw: p.yaw, seated: seatedRole(role),
    y: floorY + (role === 'dining' || role === 'lounge' ? ROOFTOP_SEAT[role] : 0),
    tags: role === 'dining' ? [role, `table${Math.floor(i / 4)}`] : [role],
  })));

  /** The crowd and the sitting it was built for (day × 2 + 1 at night; NaN: none), the plan and its half hour (day × 48 + half hours). */
  let crowd: Crowd | null = null, built = Number.NaN, planKey = Number.NaN, plan: RooftopPlan | null = null;
  let toastT = 9, dropT = 14, harder = -1, wasDj = false;
  const life = rng(4721);
  const music = new VagueMusic();
  /** What the music is asked now (after the sound setting and indoors), at what distance from the roof; the camera's flat distance to the roof. */
  let heard = SILENT, sent = 0, heardAt = Infinity, far = Infinity, drawn = false;
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), sphere = new THREE.Sphere(new THREE.Vector3(ROOF_CENTRE.x, floorY + 1, ROOF_CENTRE.z), 10);

  /** The crowd of a day's sitting (each customer's look is the day's and the sitting's): rebuilt when that changes, which happens while it is closed or at 18 h. */
  const build = (p: RooftopPlan) => {
    crowd?.dispose();
    const looks = new Map<string, CrowdLook>();
    for (const [id, { role, i }] of roleOf) looks.set(id, rooftopLook(role, i, p.day, p.sitting!));
    const c = crowd = new Crowd(slots(), { quality: ctx.quality(), near: 0, name: 'ngor-rooftop', seed: 83 + (p.day % 97), fidget: 0.03, look: s => looks.get(s.id)! });
    c.group.name = 'ngor_rooftop_crowd';
    c.group.visible = false;
    ctx.extra.add(c.group);
    c.setMood('dining', 'chat'); c.setMood('lounge', 'chat'); c.setMood('bar', 'chat');
    c.setMood('dj', 'dance', ROOFTOP_BPM); c.setMood('dance', 'dance', ROOFTOP_BPM);
    built = sittingKey(p);
  };
  const drop = () => { crowd?.dispose(); crowd = null; built = Number.NaN; };
  /** Who is shown: the plan's people, nobody else. */
  const apply = (p: RooftopPlan) => {
    const c = crowd; if (!c) return;
    const on = new Set(p.people.map(q => q.id));
    for (const id of roleOf.keys()) c.setPresent(id, on.has(id));
    c.setMood('barman', p.counts.bar > 0 ? 'chat' : 'rest');                  // he talks with those at the counter
  };
  /** Now and then: a table applauds (a birthday, a toast); the DJ's drop: arms up on the floor, the lounge claps, then the dancers dance harder. */
  const liven = (dt: number, p: RooftopPlan) => {
    const c = crowd!;
    if ((toastT -= dt) <= 0) {
      toastT = 16 + life() * 26;
      const tables = [0, 1, 2].filter(t => p.people.some(q => q.role === 'dining' && Math.floor(q.i / 4) === t));
      if (tables.length) c.react(`table${tables[Math.floor(life() * tables.length)]}`, 'applause', { share: 1, seconds: 2.4 });
    }
    if (p.dj && !wasDj) dropT = 6;                                             // the first drop soon after he starts
    wasDj = p.dj;
    if (p.dj && (dropT -= dt) <= 0) {
      dropT = 30 + life() * 26;
      c.reactOne(rooftopId('dj', 0), 'celebrate', 2.6);
      c.react('dance', 'celebrate', { share: 0.85, seconds: 3.2 });
      c.react('lounge', 'applause', { share: 0.5, seconds: 2.2 });
      c.react('bar', 'applause', { share: 0.4, seconds: 1.8 });
      harder = 3.6;
    }
    if (harder >= 0 && (harder -= dt) < 0) c.react('dance', 'dance', { share: 0.75, seconds: 10 });
  };

  const update = (dt: number) => {
    if (off) return;
    const cam = ctx.camera, cp = cam.position, h = ctx.hour(), indoors = !!ctx.inside();
    // the plan: by the half hour (the day and the hour decide it)
    const key = Math.floor(ctx.day()) * 48 + Math.floor(h * 2);
    if (key !== planKey || !plan) { plan = rooftopPlan(ctx.day(), h); planKey = key; if (crowd) apply(plan); }
    const p = plan;
    // drawn: open, outdoors, the camera near and the roof in its view
    far = Math.hypot(cp.x - ROOF_CENTRE.x, cp.z - ROOF_CENTRE.z);
    let show = p.open && !indoors && far < DRAW_FAR;
    if (show) {
      cam.updateMatrixWorld();
      frustum.setFromProjectionMatrix(pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      show = frustum.intersectsSphere(sphere);
    }
    if (!p.open) { if (crowd) drop(); }
    else if (show && built !== sittingKey(p)) { build(p); apply(p); }
    drawn = show && !!crowd;
    if (crowd) crowd.group.visible = drawn;
    if (drawn) { liven(dt, p); crowd!.update(dt, true); }
    // the music, wherever the camera looks
    const d = heardAt = roofDistance(cp, floorY), m = heard = p.open && d < MUSIC_SILENT ? rooftopMusic(h, d) : SILENT, may = !indoors && !isMuted();
    if (may && p.open && d < FETCH_NEAR && hasGestured()) music.prefetch();
    sent = may ? m.gain : 0;
    let pan = 0;
    if (sent > 0) {
      const e = cam.matrixWorld.elements, rx = e[0], rz = e[2], rl = Math.hypot(rx, rz) || 1, dx = ROOF_CENTRE.x - cp.x, dz = ROOF_CENTRE.z - cp.z, dl = Math.hypot(dx, dz) || 1;
      pan = ((dx * rx + dz * rz) / (dl * rl)) * 0.6;                         // the roof to the right of the view: more in the right ear
    }
    music.update(dt, sent, m.muffle, pan);
  };

  const info = () => {
    if (off) return { off: true };
    const p = plan ?? rooftopPlan(ctx.day(), ctx.hour()), c = crowd;
    return {
      open: p.open, hour: +ctx.hour().toFixed(2), day: p.day, period: p.period, sitting: p.sitting,
      counts: { ...p.counts },
      drawn, near: c && drawn ? c.people().length : 0, drawCalls: c && drawn ? c.drawCalls() : 0, shown: c?.stats().present ?? 0,
      distance: +far.toFixed(1), floorY: +floorY.toFixed(3),
      people: p.people.map(q => ({ id: q.id, x: q.x, z: q.z, yaw: +q.yaw.toFixed(3), seated: q.seated, standing: c ? c.standingNow(q.id) : !q.seated, reaction: c?.reactionOf(q.id) ?? null })),
      // on: playing and asked for; gain: asked now (0 closed, beyond 110 m, indoors or with the sound off); the hour's level and the distance's falloff
      music: {
        on: music.playing && sent > 0.001, gain: +sent.toFixed(3), distance: +heardAt.toFixed(1),
        level: musicLevel(ctx.hour()), falloff: +musicFalloff(heardAt).toFixed(3), muffle: +heard.muffle.toFixed(3), gestured: hasGestured(), muted: isMuted(), playing: music.playing, failed: music.failed,
      },
    };
  };
  const me = { info };
  current = me;

  return {
    id: 'almadies:venue:ngor-rooftop', type: 'rooftop', name: 'Le rooftop de l’île de Ngor', places: [],
    update,
    dispose() { drop(); music.dispose(); if (current === me) current = null; },
    debug: () => ({ id: 'almadies:venue:ngor-rooftop', type: 'rooftop', ...info() }),
  };
}
