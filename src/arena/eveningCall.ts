import type { GameCtx, GameModule } from '../game/modules';
import { isOpen, type PlaceSpec } from '../activity/places';
import { WALL_R } from '../world/geew';
import { fcfaText } from '../economy/format';
import { GALA, GALA_DONE_COUNTER, TICKET_PRICE, hasTicket, streetAt } from './program';
import { eveningSize } from './exterior';
import { MOTO_FEE, motoLot } from './arrivalRules';
import { moto } from '../transport/motoModule';

/**
 * The evening's call to the arena (Habib's evening, 10 Oct): nothing used to tell a player that a bout is on tonight.
 * - Around the doors (half an hour before), one word: « Ce soir à l'arène de Pikine : … · portes … · billet … », once per
 *   evening, remembered in the save (counter `arena_call_day`), never repeated after a reload.
 * - From an hour before the doors to the end of the bout, the goal line points to the arena's gate (arrow, distance) for a
 *   player without a ticket who is not already there: right after the welcome beat, before the economy steps and the
 *   other beats. Far away (> 120 m) or in another hub it names the car rapide (ligne 23, arrêt « Arène »); a player
 *   whose own moto is in this hub is told to take it (the pin on the moto), and once riding, the guarded moto parking
 *   by the gate (src/arena/arrival.ts).
 * - Once the bout is over and the player has walked out, one place open at that hour to end the evening (the nearest
 *   Dibi or eatery), else nothing.
 * The window and the priority are pure (`eveningGoal`, unit-tested); main.ts only shows the result.
 */

/** Save counter: the city day the evening's call was given. */
export const CALL_COUNTER = 'arena_call_day';
/** The call comes half an hour before the doors; the goal line from an hour before. */
export const CALL_FROM = GALA.doors - 0.5;
export const GOAL_FROM = GALA.doors - 1;
/** Beyond this distance from the gate, the car rapide is suggested. */
export const FAR = 120;
/** The car rapide stop by the gate (src/transport/lines.ts, Ligne 23). */
export const ARENA_STOP = 'stop:23:arene';

/** A bout is on at the arena at this hour (every evening: setting up, then the doors), and tonight's is not over. */
export const boutTonight = (hour: number, galaDone: boolean) => { const s = streetAt(hour, galaDone); return s === 'setup' || s === 'doors'; };

/** What the call says (gala Friday–Sunday, a neighbourhood bout on weekdays). */
export function callText(size: 'gala' | 'card'): string {
  return `Ce soir à l’arène de Pikine : ${size === 'gala' ? 'grand gala de lutte' : 'combat de quartier'} · portes ${GALA.doors} h · billet ${fcfaText(TICKET_PRICE)} au guichet`;
}
/** Whether the call is due now (once per evening). */
export const callDue = (day: number, hour: number, galaDone: boolean, lastCall: number | undefined) =>
  hour >= CALL_FROM && boutTonight(hour, galaDone) && lastCall !== day;

export interface EveningInput {
  hour: number;
  /** Tonight's bout was seen to the end (src/arena/program.ts GALA_DONE_COUNTER). */
  galaDone: boolean;
  ticket: boolean;
  /** The welcome beat (Tonton Ibou) is still open: it stays first. */
  welcome: boolean;
  /** In Pikine: distance to the arena's gate, and whether the player is inside the walls. Null: another hub. */
  gate: { dist: number; inside: boolean } | null;
  /** The after-bout suggestion was reached (or dismissed) tonight. */
  afterDone: boolean;
  /** The player's own moto in this hub: standing parked, or ridden now (absent / null: none here). */
  moto?: 'parked' | 'riding' | null;
}
/** walk · ride (the car rapide) · travel (another hub) · moto (take your moto) · park (riding: to the moto parking). */
export type EveningGoal = { kind: 'arena'; how: 'walk' | 'ride' | 'travel' | 'moto' | 'park' } | { kind: 'after' } | null;
/** The goal of the evening, if any (pure). */
export function eveningGoal(i: EveningInput): EveningGoal {
  if (i.welcome) return null;
  if (i.hour >= GOAL_FROM && boutTonight(i.hour, i.galaDone) && !i.ticket) {
    if (!i.gate) return { kind: 'arena', how: 'travel' };
    if (i.gate.inside || i.gate.dist < 8) return null;                        // already there
    if (i.moto === 'riding') return { kind: 'arena', how: 'park' };          // on the moto: the guarded parking by the gate
    if (i.gate.dist > FAR) return { kind: 'arena', how: i.moto === 'parked' ? 'moto' : 'ride' };
    return { kind: 'arena', how: 'walk' };
  }
  if (i.galaDone && !i.afterDone && i.hour >= GALA.setup && i.hour < GALA.close + 1 && i.gate && !i.gate.inside) return { kind: 'after' };   // walked out
  return null;
}
/** The words of the goal line (the caller adds the arrow and the distance). */
export function goalText(g: NonNullable<EveningGoal>, place?: { name: string; close?: number }): string {
  if (g.kind === 'after') return place ? `Après le combat : ${place.name}${place.close !== undefined ? `, ouvert jusqu’à ${place.close} h` : ''}` : '';
  if (g.how === 'travel') return 'Combat ce soir à l’arène de Pikine : car rapide jusqu’à Pikine, puis ligne 23, arrêt « Arène »';
  if (g.how === 'ride') return 'Combat ce soir à l’arène (Pikine) : car rapide ligne 23, arrêt « Arène »';
  if (g.how === 'moto') return 'Combat ce soir à l’arène (Pikine) : prends ta moto, parking gardé à côté de l’entrée';
  if (g.how === 'park') return `Combat ce soir à l’arène : parking motos gardé à côté de l’entrée (${fcfaText(MOTO_FEE)})`;
  return 'Combat ce soir à l’arène (Pikine)';
}
/**
 * One place to end the evening, open now and for at least an hour: the nearest Dibi, else the nearest eatery (places
 * already in the hub). Null when nothing fits.
 */
export function afterPlace(places: readonly PlaceSpec[], hour: number, from: { x: number; z: number }): PlaceSpec | null {
  const still = (p: PlaceSpec) => isOpen(p.hours, hour) && isOpen(p.hours, (hour + 1) % 24);
  for (const type of ['dibi', 'eatery']) {
    const open = places.filter(p => p.type === type && p.space === 'street' && p.anchors[0] && still(p));
    open.sort((a, b) => Math.hypot(a.anchors[0].x - from.x, a.anchors[0].z - from.z) - Math.hypot(b.anchors[0].x - from.x, b.anchors[0].z - from.z));
    if (open[0]) return open[0];
  }
  return null;
}

let afterReached = -1;
/** The goal line and its way-finding target for main.ts (the HUD's goal, ctx.guide()). */
export function eveningLine(ctx: GameCtx, welcome: boolean): { text: string; target: { name: string; x: number; z: number } | null } | null {
  const w = ctx.world(); if (!w) return null;
  const day = ctx.day(), hour = ctx.hour(), counters = ctx.state.data.counters, here = ctx.inside()?.door ?? ctx.player.pos;
  const arena = w.arena, gateIt = arena ? w.interactables.find(i => i.id === `${w.id}:arena`) : undefined;
  const gate = arena && gateIt ? { dist: Math.hypot(gateIt.x - here.x, gateIt.z - here.z), inside: !ctx.inside() && Math.hypot(here.x - arena.cx, here.z - arena.cz) < WALL_R - 0.4 } : null;
  const mine = moto.ridden ? 'riding' : moto.parkedHere() ? 'parked' : null;
  const g = eveningGoal({ hour, galaDone: counters[GALA_DONE_COUNTER] === day, ticket: hasTicket(counters, day), welcome, gate, afterDone: afterReached === day, moto: mine });
  if (!g) return null;
  if (g.kind === 'after') {
    const p = afterPlace(ctx.places.all(), hour, here); if (!p) return null;
    const a = p.anchors[0];
    if (Math.hypot(a.x - here.x, a.z - here.z) < 4) { afterReached = day; return null; }
    return { text: goalText(g, { name: p.name, close: p.hours?.[1] }), target: { name: p.name, x: a.x, z: a.z } };
  }
  if (g.how === 'travel' || !gateIt) return { text: goalText(g), target: null };
  if (g.how === 'moto') { const p = moto.parkedHere(); return { text: goalText(g), target: p ? { name: 'Ta moto Jakarta', x: p.x, z: p.z } : null }; }
  if (g.how === 'park' && arena) { const lot = motoLot(arena); return { text: goalText(g), target: { name: 'Parking motos · Arène', x: lot.gardien.x, z: lot.gardien.z } }; }
  const stop = g.how === 'ride' ? ctx.places.get(ARENA_STOP)?.anchors[0] : undefined;
  return { text: goalText(g), target: stop ? { name: 'Arrêt Arène · ligne 23', x: stop.x, z: stop.z } : { name: 'Arène · làmb', x: gateIt.x, z: gateIt.z } };
}

export const eveningCallModule: GameModule = {
  name: 'eveningCall',
  update(ctx) {
    const day = ctx.day(), hour = ctx.hour(), counters = ctx.state.data.counters;
    if (!callDue(day, hour, counters[GALA_DONE_COUNTER] === day, counters[CALL_COUNTER])) return;
    if (ctx.mode() !== 'play') return;                                        // not over a menu or a scene
    counters[CALL_COUNTER] = day;
    ctx.toast(callText(eveningSize(day, GALA.doors)));
    ctx.save();
  },
  debug: ctx => ({
    /** The evening's goal line as main.ts shows it (null: none). */
    evening: () => eveningLine(ctx, false),
  }),
};
