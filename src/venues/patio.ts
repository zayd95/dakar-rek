import * as THREE from 'three';
import type { PersonLook } from '../actors/humanoid';
import { isOpen } from '../activity/places';
import { club as clubRecipe, clubCounters, clubNight, TABLE_SERVICE } from '../activity/templates';
import * as P from '../activity/primitives';
import type { TargetSource } from '../interact/types';
import { price } from '../i18n/lines';
import { quote } from '../i18n/wolof';
import type { Collider } from '../world/types';
import { PATIO_SITE } from '../world/nightStreet';
import { hourStamp, recordVisit } from '../social/memory';
import { VenueKit } from './kit';
import { Cast, type Role as CastRole } from './cast';
import { conversation, counter, nightOf, relate, type Venue, type VenueEnv } from './venue';
import { VagueMusic } from './vagueMusic';
import { VAGUE_TRACK } from './vagueTrack';
import { VenueLife } from './venueLife';
import { PATIO_KEEP, PATIO_LIFE, placed } from './lifePlans';
import { PATIO_TRACK } from './patioTrack';
import { DancePlay, type DanceStage } from './dancePlay';
import { registerInWorld } from '../activity/inWorld';
import { drawBoards, drawPatio, terraceHeight, type Box } from './patioBuild';
import {
  APPROACHERS, APPROACH_ZONE, BAR, BOOTH, CAST, PATIO_DANCE, DANCE_FLOOR, FLOOR_TOP as F, HW, PATIO_ENTRY, PATIO_NAME, PATIO_PALETTE, PATIO_REGULAR, PATIO_VARIANT, SALON, SEAT_IDS, WAITER_HOME, ZB, ZF,
  approachPoint, inZone, isOpenMoment, patioLook, patioMoment, type PatioMoment, type Presence,
} from './patioPlan';
import {
  DOOR_BYE, PLACE_DESCRIPTION, TALKERS, barmanBye, barmanGreeting, barmanHouse, barmanMenu, barmanSoft, djBye, djDrop, djRequest, djSongFor, djTalk, doormanAsk, doormanBye, doormanGreeting, doormanHours,
  doormanRegulars, doormanRules, doormanWelcome, nextNights, programme, theme as themeOf, type Moment, type PatioCtx, type Talker,
} from '../i18n/patioLines';

/**
 * Le Patio (Ngor, Almadies): the adult nightclub and bar of the night street, a walled courtyard club open 20 h – 4 h (docs/districts/PATIO.md). Built like La Vague — the same recipe
 * (src/activity/templates.ts `club`, with Le Patio's variant: its hours, its fee, its bar, its week), the same dance (src/venues/dancePlay.ts on its own track), the same Cast
 * (src/venues/cast.ts) — but a different place: an ochre courtyard behind an arched gate with a big lit sign, a covered bar of bottles, a dance floor of lit tiles under strings of lights, a
 * DJ booth against the back wall, a salon of sofas, a VIP corner behind a rope, a raised smoking terrace with its own door onto the promenade, and bougainvillea over the walls.
 *
 * The day is quiet (the gate shut, a delivery at it); at 18 h the staff set up; at 20 h the first guests come in, the doorman asks the age and the fee (shown before it is paid, once a
 * night, a regular after three nights comes in free), the bar serves beer, cocktails and spirits mixes and soft drinks, juices and water, paid once at the start; at the peak (midnight to
 * 2 h 30) the floor is lit and a queue forms at the rope. People who work the night there are among the people of the place, like anyone: they talk if you do, say no as easily as they say hello,
 * and none of it is for sale — you pay the door, the bar and the DJ's request, and nothing else (src/i18n/patioLines.ts). Inside, the courtyard is its own presence space
 * (`almadies:venue:patio`). The music is Le Patio's own track (src/venues/patioTrack.ts: 100 bpm, its dance on its own beat map and words) and never La Vague's file.
 *
 * Local frame (VenueKit): 28 × 20 m behind the front court, the gate toward +z (the road), the sea toward −z.
 */
export const PATIO_SITES: Record<string, { x: number; z: number; yaw: number }> = { almadies: { x: PATIO_SITE.x, z: PATIO_SITE.z, yaw: PATIO_SITE.yaw } };
/** The player is in the courtyard (its space while true): module-wide, a hub has one. */
let inPatio = false;
let musicNow: VagueMusic | null = null;
/** Debug only (`__dakar.patioVirtual(t)`): drive Le Patio's music clock by the game's frames from `t` seconds (null: the audio context's again). */
export const setPatioVirtual = (t: number | null) => { if (musicNow) musicNow.virtual = t; return !!musicNow; };
/** Debug only (`__dakar.patioShift(n)`): play the night as if the city were n days ahead. */
let dayShift = 0;
export const shiftPatioDay = (n: number) => { dayShift = n; };

const DOORMAN: PersonLook = { skin: 0x3b2216, style: 'tee', top: 0x1c1c1f, bottom: 0x1c1c1f, muscular: 0.8, heavy: 0.3, shoes: 0x1c1c1f };
const BARMAN: PersonLook = { skin: 0x5b3420, female: true, style: 'tee', top: 0x2a1030, bottom: 0x1c1c1f, accent: 0xd9a441, shoes: 0x3a2a1e };
const WAITER: PersonLook = { skin: 0x45291a, style: 'tee', top: 0x1c1c1f, bottom: 0x1c1c1f, accent: 0xf2f2ec, shoes: 0x1c1c1f };
const DJ: PersonLook = { skin: 0x4e2e1c, style: 'tee', top: 0xc0307a, bottom: 0x222428, shoes: 0xf2f2ec, beard: 0x1a1414 };
/** The staff's uniforms are authored; everyone else's look comes from patioLook (their id and gender, nothing else). */
const STAFF_LOOK: Record<string, PersonLook> = { videur: DOORMAN, barman: BARMAN, serveur: WAITER, dj: DJ };

export function buildPatio(env: VenueEnv): Venue {
  const { ctx, mats } = env;
  const world = ctx.world()!;
  const hub = world.id, site = PATIO_SITES[hub];
  const id = `${hub}:venue:patio`;
  const q = ctx.quality(), lite = q === 'low';
  const SPACE = id;
  const k = new VenueKit({ x: site.x, z: site.z }, site.yaw, SPACE);
  const at = (x: number, z: number) => k.w(x, z);
  const keys = clubCounters(id);
  const night0 = clubNight(ctx.day() + dayShift, ctx.hour());
  const parts = drawPatio(k, mats, { lite, id, night: night0 });
  k.group.name = 'patio_venue';                                                                 // the renderer's breakdown (__dakar.renderBreakdown) names it
  ctx.extra.add(k.group);
  world.colliders.push(...k.colliders);
  for (const s of k.seats) ctx.seats.add(s);
  // the terrace is a raised deck: the ground follows it (the player climbs its treads)
  const baseHeight = world.heightAt;
  world.heightAt = function (this: unknown, x: number, z: number) {
    const base = baseHeight.call(world, x, z), l = k.local(x, z), t = terraceHeight(l.x, l.z);
    return t > 0 ? Math.max(base, t + (F - 0.1)) : base;
  };
  const front = at(0, ZF + 2.6);
  world.interactables.push({ id: `${hub}:city:patio`, name: PATIO_NAME, kind: 'actions', x: front.x, z: front.z, radius: 0, actions: [], description: PLACE_DESCRIPTION });

  // ---------------------------------------------------------------- the gates: the arch and the rope, the smokers' door
  const toWorld = (b: Box): Collider => { const a = k.w(b.x0, b.z0), c = k.w(b.x1, b.z1); return { x0: Math.min(a.x, c.x), x1: Math.max(a.x, c.x), z0: Math.min(a.z, c.z), z1: Math.max(a.z, c.z), h: b.h }; };
  const mainGate = parts.gates.main.map(toWorld), smokeGate = parts.gates.smoke.map(toWorld);
  const ropeLine = mainGate[1];
  const setGate = (list: Collider[], on: boolean) => { for (const c of list) { const i = world.colliders.indexOf(c); if (on && i < 0) world.colliders.push(c); else if (!on && i >= 0) world.colliders.splice(i, 1); } };

  // ---------------------------------------------------------------- the place
  const day = () => ctx.day() + dayShift;
  const night = () => clubNight(day(), ctx.hour());
  const admitted = () => counter(ctx, keys.paid) === night() + 1;
  const pctx = (): PatioCtx => ({ night: night(), hour: ctx.hour(), nights: counter(ctx, keys.nights) });
  const later: { t: number; line: string }[] = [];
  const queue = (line: string, delay = 2.7) => later.push({ t: delay, line });                   // after the activity's own « ✓ » toast
  const scoreNow = () => { const s = ctx.activities.current?.scores ?? []; return s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0; };
  const talk = (role: string) => {
    ctx.state.adjust({ social: 3 });
    if (role === 'videur') {
      relate(ctx, 'boubacar_patio', 1);
      conversation(ctx, `Boubacar · ${PATIO_NAME}`, doormanGreeting(pctx()), [
        { label: 'Le programme de la semaine', icon: '📅', pick: () => `« ${programme(night()).join(' · ')}. »` },
        { label: 'La règle de la maison', icon: '🛡️', pick: () => doormanRules() },
        { label: 'Les horaires', icon: '🕗', pick: () => doormanHours() },
        { label: 'Et les habitués ?', icon: '🤝', pick: () => doormanRegulars(pctx()) },
        { label: 'Bonne soirée', icon: '👋', pick: () => { ctx.toast(DOOR_BYE); return null; } },
      ]);
    } else if (role === 'barman') {
      relate(ctx, 'coumba_patio', 1);
      conversation(ctx, `Coumba · bar du ${PATIO_NAME}`, barmanGreeting(counter(ctx, keys.nights)), [
        { label: 'Qu’est-ce qu’on boit ?', icon: '🍹', pick: () => barmanMenu() },
        { label: 'Et sans alcool ?', icon: '🥤', pick: () => barmanSoft() },
        { label: 'Le cocktail de la maison', icon: '🌅', pick: () => barmanHouse() },
        { label: 'Jërëjëf', icon: '👋', pick: () => { ctx.toast(barmanBye()); return null; } },
      ]);
    } else {
      relate(ctx, 'dj_sidy', 1);
      conversation(ctx, 'DJ Sidy', djTalk(pctx()), [
        { label: 'Les prochaines soirées', icon: '📅', pick: () => nextNights(night()) },
        { label: 'Un morceau pour la piste ?', icon: '🎵', pick: () => djRequest() },
        { label: 'Bonne soirée', icon: '👋', pick: () => { ctx.toast(djBye()); return null; } },
      ]);
    }
  };
  const cheer = (n: number) => stage.react(ctx.player.pos, n, 'celebrate');
  const done = (a: string) => {
    const s = scoreNow();
    if (a === 'entree') {
      ctx.state.data.counters[keys.paid] = night() + 1;
      relate(ctx, 'boubacar_patio', 1);
      queue(doormanWelcome(pctx()), 0.1);
    } else if (a === 'danse') {
      if (s >= 0.8) { cheer(3); queue(`La piste t’applaudit · ${quote('Rafet na')}`); }
      else if (s < 0.45) queue(`Une danseuse : ${quote('Ndank ndank')} · écoute la basse`);
    } else if (a === 'sortie') {
      const out = at(0, ZF + 2.5); ctx.player.place(out.x, out.z, site.yaw);
      queue(doormanBye(), 0.1);
    } else if (a === 'morceau') {
      cast.burst('dj', 'Celebrate', 2.2); cheer(4);
      queue(djSongFor(), 0.1);
    }
  };
  const barC = at(BAR.anchorX, BAR.anchorZ), loungeC = at(SALON.cx, SALON.cz);
  const place = clubRecipe({
    id, name: PATIO_NAME, space: SPACE, bar: { ...barC, r: 4.2 }, lounge: { ...loungeC, r: SALON.r },
    anchors: [
      { id: 'door', name: `Entrée · ${PATIO_NAME}`, kind: 'door', ...at(parts.at.door.x, parts.at.door.z), y: 2.4, radius: 2.0, space: 'street' },
      { id: 'floor', name: 'Piste de danse', kind: 'spot', ...at(DANCE_FLOOR.x, DANCE_FLOOR.z), y: 2.0, radius: 3.3 },
      { id: 'bar', name: `Bar · ${PATIO_NAME}`, kind: 'counter', ...at(BAR.anchorX - 0.4, BAR.anchorZ), y: 1.9, radius: 4.2, bias: -0.5 },
      { id: 'lounge', name: 'Salon · service à table', kind: 'furniture', ...at(SALON.cx, SALON.cz), y: 1.6, radius: 4.6, bias: 0.2 },
      { id: 'dj', name: 'DJ Sidy', kind: 'person', ...at(BOOTH.x, BOOTH.z + 1.9), y: 2.3, radius: 1.5, bias: -1 },
      { id: 'exit', name: 'Sortie', kind: 'door', ...at(0, ZF - 1.7), y: 2.2, radius: 1.4 },
    ],
  }, {
    count: c => counter(ctx, c), day, hour: () => ctx.hour(), converse: talk, done, enter: () => askEntry(),
    tired: e => (ctx.state.data.needs.energie < e ? 'Tu es trop fatigué pour danser · repose-toi' : null),
  }, PATIO_VARIANT);
  // « Entrer »: the age and the fee are said before anything is paid; « Payer » runs the place's own paying step
  const askEntry = () => {
    const pay = { ...place.offers.door.find(o => o.id === 'payer')!, visible: undefined }, short = ctx.state.wallet < PATIO_ENTRY;
    ctx.menu(`${PATIO_NAME} · ticket d’entrée`, doormanAsk(pctx()), [
      { label: `Payer le ticket ${price(PATIO_ENTRY)} et entrer`, icon: '🎟️', right: `−${price(PATIO_ENTRY)}`, disabled: short, detail: short ? 'Pas assez d’argent sur toi' : 'Une seule fois pour toute la nuit',
        onPick: () => { ctx.hud.closeModal(); ctx.activities.start(pay, { place: place.name }); } },
      { label: 'Pas ce soir', icon: '👋', onPick: () => { ctx.hud.closeModal(); ctx.toast(DOOR_BYE); } },
    ]);
  };
  ctx.places.add(place);

  // ---------------------------------------------------------------- the people
  const seatOf = (rel: string) => k.seats.find(s => s.id === `${id}:${rel}`);
  const roleOf = (p: Presence): CastRole | null => {
    const when = (lite ? p.lowWhen : p.when) as readonly PatioMoment[];
    if (!when.length) return null;
    const look = STAFF_LOOK[p.id] ?? patioLook(p.id, p.gender === 'f');
    const base = { id: p.id, look, when: (m: string) => when.includes(m as PatioMoment) };
    if (p.seat) { const seat = seatOf(p.seat); return seat ? { ...base, seat } : null; }
    const s = p.spot!, w = at(s.x, s.z);
    return { ...base, x: w.x, z: w.z, y: s.y, yaw: site.yaw + s.yaw, clip: s.clip };
  };
  const roles = CAST.map(roleOf).filter((r): r is CastRole => !!r);
  const cast = new Cast(roles, ctx.seats, ctx.extra, id);
  env.addPeople(() => cast.bodies().filter(b => /:(videur|livreur|file\d)$/.test(b.id)));        // in the street: the doorman, the delivery, the queue; inside, the guests below
  const music = musicNow = new VagueMusic(undefined, PATIO_TRACK);
  /** Le Patio plays its own piece or nothing: never La Vague's file (two clubs 70 m apart would play two copies of one song out of step). A missing file (404) keeps it silent. */
  const ownTrack = (PATIO_TRACK.file as string) !== (VAGUE_TRACK.file as string);
  if (ownTrack) music.prefetch();
  const stage: DanceStage = {
    stage: () => { /* the two friends dance on whoever dances */ },
    react: (a, n, kind) => {
      for (const who of ['fatou', 'seynabou', 'rokhaya'] as const) {
        const w = cast.where(who); if (!w?.shown || Math.hypot(w.x - a.x, w.z - a.z) > 7) continue;
        cast.burst(who, 'Celebrate', kind === 'shout' ? 1.6 : 2.2); if (--n <= 0) break;
      }
    },
  };
  // the courtyard's crowd (1.0.1): people who come in by the gate, meet, dance at the rim of the floor, talk, take a stool, and leave — on the night's hours, as figures within the body budget
  const corners = [at(-HW + 0.1, -ZB + 0.1), at(HW - 0.1, -ZB + 0.1), at(-HW + 0.1, ZF + 0.9), at(HW - 0.1, ZF + 0.9)];
  let lifeSeen = false;
  const lifePlan = placed(PATIO_LIFE, at, site.yaw);
  const life = new VenueLife({
    ctx, name: 'patio', parent: ctx.extra, plan: { ...lifePlan, spots: lifePlan.spots.map(sp => (sp.seat ? { ...sp, seat: `${id}:${sp.seat}` } : sp)) },
    // the gate's leaves and the rope stop the player who has not paid, never the guests
    colliders: () => world.colliders.filter(c => !mainGate.includes(c) && !smokeGate.includes(c)),
    area: { x0: Math.min(...corners.map(c => c.x)), x1: Math.max(...corners.map(c => c.x)), z0: Math.min(...corners.map(c => c.z)), z1: Math.max(...corners.map(c => c.z)) },
    y: () => F, active: () => lifeSeen,
    keep: PATIO_KEEP.map(c => ({ ...c, ...at(c.x, c.z) })),
  });
  const dance = new DancePlay({ ctx, music, crowd: stage, here: () => inPatio, spot: () => { const p = at(DANCE_FLOOR.x, DANCE_FLOOR.z); return { x: p.x, z: p.z, yaw: site.yaw }; }, track: PATIO_TRACK, words: PATIO_DANCE });
  const unregister = registerInWorld(dance);

  // ---------------------------------------------------------------- guests: a short exchange (French and everyday Wolof), never a price
  const met = new Set<string>();
  const asMoment = (m: PatioMoment): Moment => (isOpenMoment(m) ? (m as Moment) : 'early');
  const chatWith = (t: Talker) => {
    const first = !met.has(t.id); met.add(t.id);
    const m = asMoment(patioMoment(ctx.hour()));
    if (recordVisit(ctx.state, `patio_${t.id}`, hourStamp(day(), ctx.hour()))) ctx.state.adjust({ social: 4 });
    relate(ctx, `patio_${t.id}`, 1);
    conversation(ctx, `${t.name} · ${PATIO_NAME}`, t.hello(first, m), t.choices.map(c => ({
      label: c.label, icon: c.icon,
      pick: () => { if (c.kind !== 'bye') return c.reply; ctx.toast(c.reply); return null; },   // a no ends nothing: the answer is shown and the talk goes on, or closes with « Bonne soirée »
    })));
    if (approach?.id === t.id && approach.talkedAt === null) approach.talkedAt = approach.t;
  };
  const guests: TargetSource = {
    name: 'patio-people',
    collect: (space, x, z, out) => {
      if (space !== SPACE) return;
      for (const t of TALKERS) {
        const w = cast.where(t.id); if (!w?.shown || Math.abs(w.x - x) > 2.4 || Math.abs(w.z - z) > 2.4) continue;
        const pr = CAST.find(c => c.id === t.id), seated = !!pr?.seat;
        const known = met.has(t.id), spec = P.talk({ id: 'discuter', label: known ? `Parler à ${t.name}` : 'Parler', then: () => chatWith(t) });
        out.push({ id: `${id}:client:${t.id}`, name: known ? t.name : t.unknown, kind: 'person', space, x: w.x, z: w.z, y: seated ? 1.6 : 2.15, radius: 2.4, bias: 0.3,
          affordances: () => [{ id: spec.id, verb: spec.primitive, label: spec.label, icon: spec.icon, disabled: ctx.activities.blocked(spec), run: () => { ctx.activities.start(spec); } }] });
      }
    },
  };
  ctx.interactions.add(guests);

  // ---------------------------------------------------------------- the ones who walk over (once a night, to a player standing idle in the open walk)
  const approached = new Map<string, number>();                                                // person → the night they walked over
  const approachCount = new Map<string, number>();                                             // person → how many times they have walked over (the checks: never more than once a night)
  let approach: { id: string; t: number; talkedAt: number | null } | null = null;
  let idleFor = 0, lastPos = { x: 0, z: 0 };
  const localBoxes = parts.accounts.filter(a => a.h >= 0.45);
  const homeOf = (pid: string) => { const p = CAST.find(c => c.id === pid)!; return { x: p.spot!.x, z: p.spot!.z, yaw: p.spot!.yaw, clip: p.spot!.clip ?? 'Idle' }; };
  const sendBack = () => {
    if (!approach) return;
    const h = homeOf(approach.id), w = at(h.x, h.z);
    cast.walkTo(approach.id, [w], site.yaw + h.yaw, h.clip, 1.3);
    approach = null;
  };
  const approaches = (dt: number, open: boolean, m: PatioMoment) => {
    const P0 = ctx.player.pos, me = k.local(P0.x, P0.z);
    idleFor = Math.hypot(P0.x - lastPos.x, P0.z - lastPos.z) < 0.05 ? idleFor + dt : 0; lastPos = { x: P0.x, z: P0.z };
    if (approach) {
      approach.t += dt;
      const w = cast.where(approach.id), far = !w || Math.hypot(w.x - P0.x, w.z - P0.z) > 7.5;
      if (!inPatio || far || approach.t > 16 || (approach.talkedAt !== null && approach.t > approach.talkedAt + 8) || ctx.activities.current) sendBack();
      return;
    }
    if (!open || !inPatio || (m !== 'warm' && m !== 'peak') || idleFor < 3 || ctx.activities.current || ctx.player.seated() || ctx.mode() !== 'play' || !inZone(me)) return;
    for (const pid of APPROACHERS) {
      if (approached.get(pid) === night()) continue;
      const w = cast.where(pid); if (!w?.shown || !w.drawn || cast.walking(pid)) continue;
      const home = homeOf(pid), p = approachPoint(me, ctx.player.facing(), home, localBoxes);
      if (!p || Math.hypot(me.x - home.x, me.z - home.z) > 10) continue;
      const wp = at(p.x, p.z), t = TALKERS.find(x => x.id === pid);
      cast.walkTo(pid, [wp], Math.atan2(P0.x - wp.x, P0.z - wp.z), 'Talk', 1.4);
      approached.set(pid, night()); approachCount.set(pid, (approachCount.get(pid) ?? 0) + 1); approach = { id: pid, t: 0, talkedAt: null };
      if (t?.approach) ctx.toast(t.approach);
      break;
    }
  };

  // ---------------------------------------------------------------- the night: moments, gates, lights on the tempo
  let t = 0, moment: PatioMoment | '' = '', beat = -2, shut: boolean | null = null, ropeOn = false, boardKey = '', served: unknown = null, quiet = 0, drops = 0;
  const col = new THREE.Color();
  const tmp = new THREE.Color();
  const palOf = (n: number) => PATIO_PALETTE[themeOf(n).id] ?? PATIO_PALETTE.lounge;
  const { data: tiles, tex: tileTex, mat: tileMat, w: FW, d: FD } = parts.tiles;
  const paint = (pal: number[], b: number, open: boolean) => {
    for (let j = 0; j < FD; j++) for (let i = 0; i < FW; i++) {
      const o = (j * FW + i) * 4;
      if (!open) { const v = (i + j) % 2 ? 34 : 46; tiles[o] = v + 6; tiles[o + 1] = v; tiles[o + 2] = v + 8; tiles[o + 3] = 255; continue; }
      const ring = Math.max(Math.abs(i - (FW - 1) / 2), Math.abs(j - (FD - 1) / 2)), mode = Math.floor(b / 8) % 3;
      const phase = mode === 0 ? Math.floor(ring - b) : mode === 1 ? i + j - b : (i * 2 - j + b) >> 1;
      const pick = ((phase % 4) + 4) % 4;
      if (pick === 3) { tiles[o] = 22; tiles[o + 1] = 14; tiles[o + 2] = 28; } else { col.set(pal[pick % pal.length]); tiles[o] = col.r * 255; tiles[o + 1] = col.g * 255; tiles[o + 2] = col.b * 255; }
      tiles[o + 3] = 255;
    }
    tileTex.needsUpdate = true;
  };
  // the pools of light: one vertex colour per quad, written only when it changes
  const poolIdx = new Map<string, number[]>(), poolNow = new Map<string, string>();
  parts.pools.list.forEach((p, i) => { const l = poolIdx.get(p.group) ?? []; l.push(i); poolIdx.set(p.group, l); });
  const lightPool = (group: string, hex: number, level: number) => {
    const key = `${hex}:${Math.round(level * 40)}`; if (poolNow.get(group) === key) return;
    poolNow.set(group, key); tmp.set(hex).multiplyScalar(level);
    const colors = parts.pools.colors, attr = parts.pools.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (const i of poolIdx.get(group) ?? []) for (let v = 0; v < 4; v++) { const o = (i * 4 + v) * 3; colors[o] = tmp.r; colors[o + 1] = tmp.g; colors[o + 2] = tmp.b; }
    attr.needsUpdate = true;
  };
  let seenBefore = false;
  const update = (dt: number) => {
    t += dt;
    const h = ctx.hour(), open = isOpen(place.hours, h), n = nightOf(h), nt = night();
    const m = patioMoment(h), setup = m === 'setup';
    if (m !== moment) { moment = m; cast.setMoment(m); }
    // the gates: shut by day, the rope until you have paid tonight; never closes on someone inside the courtyard
    const me = k.local(ctx.player.pos.x, ctx.player.pos.z);
    const insideNow = Math.abs(me.x) < HW + 0.2 && me.z > -ZB && me.z < ZF + 0.55;                // in the courtyard or the doorway's thickness: the porch in front is outside, the shut gate stops anyone there
    inPatio = !ctx.inside() && me.x > -HW + 0.1 && me.x < HW - 0.1 && me.z > -ZB + 0.1 && me.z < ZF - 0.15;
    const want = !(open && admitted()) && !insideNow;
    if (want !== shut) { shut = want; setGate([mainGate[0], ...smokeGate], want); }
    const ropeWant = want && open;                                                               // the rope line stands only while the place is open and the guest has not paid (by day only the shut leaves do)
    if (ropeWant !== ropeOn) { ropeOn = ropeWant; setGate([ropeLine], ropeWant); }
    parts.pools.mesh.visible = open || setup;
    if (parts.day) parts.day.visible = !open && !insideNow;
    if (parts.night) parts.night.visible = open && !admitted();
    const sp = ctx.space();
    const camD = Math.hypot(ctx.camera.position.x - site.x, ctx.camera.position.z - site.z);
    const seen = (sp === 'street' || sp === SPACE) && camD < (lite ? 45 : 70) + 28;
    // the board at the gate, redrawn when the door opens or a night turns
    const key = `${open ? 1 : 0}:${nt}`;
    if (key !== boardKey && (seen || !boardKey)) { boardKey = key; drawBoards(parts.boards.cv, open, nt); parts.boards.tex.needsUpdate = true; }
    // the music: full in the courtyard, through the wall at the gate, fading and muffled down the street; nothing until its own file exists
    {
      const dx = Math.max(Math.abs(me.x) - HW, 0), dz = me.z < -ZB ? -ZB - me.z : Math.max(me.z - ZF, 0), out = Math.hypot(dx, dz);
      const busy = m === 'early' ? 0.75 : m === 'dawn' ? 0.6 : 1;
      let level = 0, muffle = 0, pan = 0;
      if (open && !ctx.inside() && out < 75 && ownTrack && music.available !== false) {
        if (out <= 0 && inPatio) { level = busy; muffle = 0; }
        else { level = busy * 0.7 / (1 + out / 7); muffle = Math.min(1, 0.55 + out / 60); }      // behind the walls: always muffled
        const cp = ctx.camera.position, cx = site.x - cp.x, cz = site.z - cp.z, cl = Math.hypot(cx, cz) || 1;
        const yawC = Math.atan2(ctx.camera.matrixWorld.elements[8] * -1, ctx.camera.matrixWorld.elements[10] * -1);
        pan = ((cx / cl) * -Math.cos(yawC) + (cz / cl) * Math.sin(yawC)) * Math.min(1, out / 6) * 0.6;
      }
      music.update(dt, level, muffle, pan);
    }
    dance.update(dt);
    // the lights: on the music's beat when it plays, else on the same tempo; dark by day, half lit while the staff set up
    const pal = palOf(nt);
    const beatSec = music.beatSec, b = Math.floor(music.beat() ?? t / beatSec);
    const lit = open ? 1 : setup ? 0.5 : 0;
    parts.neon.mat.color.setScalar(open ? 0.55 + 0.45 * n : 0.12 + 0.4 * lit * n);
    for (const mat of [parts.atlas.mat, parts.boards.mat]) mat.emissiveIntensity = open ? 0.3 + 0.6 * n : setup ? 0.15 + 0.35 * n : 0.1 * n;
    const wasSeen = seenBefore; seenBefore = seen;
    if (seen || !wasSeen) {
      const k2 = open ? b : -1;
      if (k2 !== beat) { beat = k2; paint(pal, b, open); }
      tileMat.color.setScalar(open ? 0.55 + 0.45 * n : 0.8);
      const L = open ? n : lit * n * 0.6;
      lightPool('sign', 0xffa040, 0.5 * L); lightPool('gate', 0xff9a4a, 0.55 * L); lightPool('porch', 0xffb060, 0.5 * L);
      lightPool('floor', pal[(b >> 1) % pal.length], open ? 0.5 * n : 0); lightPool('booth', pal[1 % pal.length], open ? 0.45 * n : 0);
      lightPool('bar', 0xffa850, open ? 0.5 * n : 0.1 * lit * n); lightPool('salon', 0xff9a5a, open ? 0.42 * n : 0); lightPool('vip', 0xe0309a, open ? 0.4 * n : 0);
      lightPool('terrace', 0xffb060, open ? 0.42 * n : 0); lightPool('wash', pal[(b >> 3) % pal.length], open ? 0.5 * n : 0);
      parts.beams.forEach((beam, i) => {
        beam.visible = open && n > 0.2;
        if (!beam.visible) return;
        const mat = beam.material as THREE.MeshBasicMaterial;
        beam.rotation.z = Math.sin(t * 0.7 + i * 1.9) * 0.5; beam.rotation.x = Math.cos(t * 0.55 + i * 1.3) * 0.38;
        mat.color.set(pal[(i + (b >> 2)) % pal.length]); mat.opacity = 0.15 * n;
      });
    }
    // table service: the waiter walks to the player's table while the drink is brought, then back to his spot
    const cur = ctx.activities.current, table = !!cur && cur.spec.id.startsWith('table_');
    if (table && cur!.step.label === TABLE_SERVICE && served !== cur!.spec) {
      served = cur!.spec; const seat = ctx.player.seated();
      if (seat) { const ls = k.local(seat.x, seat.z), f = seat.yaw - site.yaw; cast.walkTo('serveur', [at(ls.x + Math.sin(f) * 1.3, ls.z + Math.cos(f) * 1.3)], site.yaw + f + Math.PI, 'Talk', 2.4); }
    }
    if (!table && served) { served = null; cast.walkTo('serveur', [at(WAITER_HOME.x, WAITER_HOME.z)], site.yaw + Math.PI / 2, 'Idle', 1.6); }
    approaches(dt, open, m);
    lifeSeen = seen && open; life.update(dt);
    cast.update(dt, ctx.camera.position, lite ? 45 : 70, sp === 'street' || sp === SPACE, ctx.player.pos);
    quiet += dt;
    if (inPatio && open && (m === 'peak' || m === 'warm') && quiet > 40 && !later.length && !ctx.activities.current) { ctx.toast(djDrop(drops++)); quiet = 0; }   // a drop of the DJ's now and then
    for (let i = later.length - 1; i >= 0; i--) { later[i].t -= dt; if (later[i].t <= 0) { ctx.toast(later[i].line); later.splice(i, 1); quiet = 0; } }
  };

  const draw = () => {
    let meshes = 0, tris = 0;
    k.group.traverse(o => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return;
      meshes++; const g = m.geometry; tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    });
    return { meshes, tris: Math.round(tris) };
  };

  return {
    id, type: 'patio', name: place.name, places: [place], update,
    space: () => (inPatio ? SPACE : null),
    camera: dt => dance.camera(dt),
    dispose() {
      unregister(); life.dispose(); dance.dispose(); music.dispose(); if (musicNow === music) musicNow = null; ctx.interactions.remove('patio-people'); cast.dispose(); k.dispose();
      world.heightAt = baseHeight; setGate([...mainGate, ...smokeGate], false); later.length = 0; inPatio = false;
    },
    debug: () => {
      const people = CAST.map(p => ({ id: p.id, role: p.role, ...cast.where(p.id) })).filter(w => (w as { shown?: boolean }).shown);
      return {
        id, type: 'patio', name: place.name, origin: { x: site.x, z: site.z }, yaw: site.yaw, moment, open: isOpen(place.hours, ctx.hour()), space: inPatio ? SPACE : null,
        night: night(), theme: themeOf(night()).id, admitted: admitted(), gateShut: shut, rope: parts.night?.visible ?? false, leaves: parts.day?.visible ?? false, beams: parts.beams.filter(b => b.visible).length,
        anchors: place.anchors.map(a => ({ id: a.id, x: a.x, z: a.z, space: a.space ?? place.space })), seats: k.seats.map(s => s.id), stools: parts.seats.stools.map(s => s.id), lounge: parts.seats.salon.map(s => s.id), vip: parts.seats.vip.map(s => s.id),
        people, npcs: cast.presentCount, visibleNpcs: cast.shownCount, talkers: people.filter(p => TALKERS.some(t => t.id === p.id)),
        approach: approach ? { ...approach } : null, approached: Object.fromEntries(approached), approachCount: Object.fromEntries(approachCount), waiter: cast.where('serveur'),
        entrance: at(0, ZF + 2.2), inside: at(0, ZF - 2.5), floor: at(DANCE_FLOOR.x, DANCE_FLOOR.z), door: at(parts.at.door.x, parts.at.door.z), terrace: at(9.5, 6.4), zone: APPROACH_ZONE,
        counters: { paid: counter(ctx, keys.paid), nights: counter(ctx, keys.nights), dances: counter(ctx, keys.dances), requests: counter(ctx, keys.requests) },
        music: { ...music.info(), ownTrack, asked: music.want.level }, dance: dance.info(), draw: draw(), tris: parts.tris, regularAt: PATIO_REGULAR,
        life: life.info(), colliders: parts.accounts.length, tile: Array.from(tiles.slice(0, 4)), seatsFree: k.seats.filter(s => !s.occupant).length, talkersMet: [...met],
        heightOnTerrace: world.heightAt(at(9.9, 6.5).x, at(9.9, 6.5).z), seatIds: SEAT_IDS.salon,
      };
    },
  };
}
