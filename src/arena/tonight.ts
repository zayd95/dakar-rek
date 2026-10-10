import type { GameCtx, GameModule } from '../game/modules';
import type { HubId } from '../core/types';
import { phoneHooks } from '../ui/phoneHooks';
import { fcfaText } from '../economy/format';
import { HUB_NAMES } from '../world/content';
import { WALL_R } from '../world/geew';
import { GALA, GALA_DONE_COUNTER, TICKET_PRICE, billFor, ecurieLabel, hasTicket } from './program';
import { eveningSize } from './exterior';
import { WEEKDAY_FR, weekday } from './exteriorRules';
import { afterPlace } from './eveningCall';
import { arenaFighter } from './fighter';
import { weatherAt } from '../city/rules';
import { EVENT_NAMES, busyEdges, roadEvents, type RoadEventKind } from '../city/roadEvents';
import { LINES } from '../transport/lines';
import { transport } from '../transport/module';
import { moto } from '../transport/motoModule';
import { car } from '../transport/carModule';
import { ownsVehicle, parked, type VehicleAsset } from '../transport/owned';
import { careerTonight } from '../career/module';

/**
 * « Ce soir » in the phone (Habib's evening): the evening plans itself from what the game already knows — tonight's card
 * at the Arène de Pikine (the career's ladder through `billFor`), the doors and the ticket, the player's own bout when
 * they are on the card; how to get there (on foot, Ligne 23 to the « Arène » stop, one's own moto or car), each with
 * « Y aller » (the way-finding pin and the goal line); a place still open after the bout (the evening call's
 * `afterPlace`); today's weather and road events in this hub (the city lane), one line each, only when there is one.
 * Nothing invented: the assembly is pure (`tonightPage`, unit-tested), the module only gathers the facts.
 */

/** A row of the page: an icon, a line, a detail, and « Y aller » (a target key) or an in-phone link. */
export interface TonightRow { icon: string; label: string; detail?: string; go?: string; open?: string }
export interface TonightSection { title: string; rows: TonightRow[] }
type Side = { name: string; ecurie: string };
export interface TonightInput {
  day: number; hour: number;
  size: 'gala' | 'card';
  bill: { left: Side; right: Side; title?: boolean };
  /** Tomorrow's card (shown once tonight's gala is over). */
  tomorrow: { left: Side; right: Side; title?: boolean; size: 'gala' | 'card' };
  ticket: boolean;
  /** Tonight's gala seen to the end. */
  galaDone: boolean;
  /** The player's own bout tonight (the fighter's path): the opponent, and a gala place or the title. */
  fighter: { opponent: string | null; kind: 'gala' | 'title' | null } | null;
  /** The hub the player is in, and in Pikine the distance to the gate (null elsewhere) and whether inside the walls. */
  hub: string; gate: { dist: number; inside: boolean } | null;
  /** Ligne 23 now: the nearest stop to board (name, distance) and the fare; null outside Pikine. */
  ride: { stop: string; dist: number; fare: number } | null;
  /** Owned vehicles: here (distance to where it is parked, or ridden now) or parked in another hub. */
  vehicles: { key: 'moto' | 'car'; label: string; dist: number | null; riding?: boolean; hub?: string }[];
  /** The place open after the bout (name, hours, distance from the arena gate). */
  after: { name: string; close?: number; dist: number | null } | null;
  weather: string | null;
  road: { kind: RoadEventKind; from: number; to: number; dist: number | null }[];
}

/** « 17 h », « 14 h 30 ». */
export const hourText = (h: number) => { const hh = Math.floor(((h % 24) + 24) % 24), mm = Math.round((h - Math.floor(h)) * 60); return mm ? `${hh} h ${String(mm).padStart(2, '0')}` : `${hh} h`; };
const metres = (d: number) => (d >= 1000 ? `${(d / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km` : `${Math.round(d / 10) * 10} m`);
const sides = (b: { left: Side; right: Side }) => `${ecurieLabel(b.left.ecurie)} contre ${ecurieLabel(b.right.ecurie)}`;
const SIZE = { gala: 'Grand gala de lutte', card: 'Combat de quartier' } as const;

/** The day's weather in one line, or null on a plain sunny day (city/rules weatherAt: the same sky for everyone). */
export function weatherLine(day: number, hour: number): string | null {
  let start = -1, end = -1, overcast = false;
  for (let h = 6; h < 24; h += 0.25) {
    const w = weatherAt(day, h);
    if (w.kind === 'rain') { if (start < 0) start = h; end = h + 0.25; }
    if (w.kind === 'overcast' && h >= hour) overcast = true;
  }
  if (start >= 0) {
    if (hour < start) return `Averse attendue vers ${hourText(start)}, jusqu’à ${hourText(end)} environ`;
    if (hour < end) return `Averse en cours, jusqu’à ${hourText(end)} environ`;
    if (weatherAt(day, hour).wet > 0.05) return 'Rues encore mouillées après l’averse';
    return null;
  }
  return overcast ? `Ciel couvert ${hour < 12 ? 'aujourd’hui' : hour < 17 ? 'cet après-midi' : 'ce soir'}` : null;
}

/** The page (pure): sections in order, empty sections left out. */
export function tonightPage(i: TonightInput): TonightSection[] {
  const out: TonightSection[] = [];
  const over = i.galaDone || i.hour >= GALA.close;
  // ---------------------------------------------------------------- tonight at the arena
  const arena: TonightRow[] = [];
  if (over) {
    arena.push({ icon: '🌙', label: 'Le gala de ce soir est fini', detail: i.galaDone ? 'Tu l’as vu jusqu’au bout' : `Fermeture à ${GALA.close} h` });
    const t = i.tomorrow, wd = WEEKDAY_FR[weekday(i.day + 1)];
    arena.push({ icon: '🤼', label: `Demain : ${t.left.name} – ${t.right.name}`, detail: `${SIZE[t.size]}${t.title ? ' · titre en jeu' : ''} · ${wd} ${GALA.doors} h` });
  } else {
    if (i.fighter) {
      const what = i.fighter.kind === 'title' ? 'Combat pour le titre' : i.fighter.kind === 'gala' ? 'Ta place au gala' : 'Ton combat du soir';
      arena.push({ icon: '🥊', label: `Tu combats ce soir${i.fighter.opponent ? ` contre ${i.fighter.opponent}` : ''}`, detail: `${what} · entrée des lutteurs, derrière l’arène (pas besoin de billet)` });
    }
    arena.push({ icon: '🤼', label: `${i.bill.left.name} – ${i.bill.right.name}`, detail: `${SIZE[i.size]}${i.bill.title ? ' · titre en jeu' : ''} · ${sides(i.bill)}` });
    arena.push({ icon: '🚪', label: i.hour < GALA.doors ? `Portes à ${GALA.doors} h` : 'Portes ouvertes', detail: `Arène de Pikine · jusqu’à ${GALA.close} h` });
    if (!i.fighter) arena.push(i.ticket ? { icon: '🎟️', label: 'Ton billet : en poche ✓', detail: 'Entrée par la porte de l’arène' }
      : { icon: '🎟️', label: `Billet ${fcfaText(TICKET_PRICE)} au guichet`, detail: i.hour < GALA.doors ? `Le guichet ouvre à ${GALA.doors} h, à gauche de la porte` : 'À gauche de la porte', ...(i.gate ? { go: 'guichet' } : {}) });
  }
  out.push({ title: 'Ce soir à l’arène', rows: arena });
  // ---------------------------------------------------------------- getting there
  if (!over) {
    const go: TonightRow[] = [];
    if (i.gate?.inside) go.push({ icon: '📍', label: 'Tu es à l’arène' });
    else if (i.gate) {
      go.push({ icon: '🚶', label: 'À pied', detail: `${metres(i.gate.dist)} jusqu’à la porte`, go: 'gate' });
      if (i.ride) go.push({ icon: '🚐', label: 'Car rapide · Ligne 23, arrêt « Arène »', detail: `${fcfaText(i.ride.fare)} · monte à l’arrêt ${i.ride.stop}, à ${metres(i.ride.dist)}`, go: 'stop' });
    } else go.push({ icon: '🗺️', label: 'Va à Pikine', detail: `Tu es à ${i.hub} : change de quartier par la Carte, puis ligne 23, arrêt « Arène »`, open: 'carte' });
    if (!i.gate?.inside) for (const v of i.vehicles) {
      if (v.riding) go.push({ icon: v.key === 'moto' ? '🏍️' : '🚗', label: `${v.label} : tu es dessus`, detail: v.key === 'moto' ? 'Parking motos gardé à côté de l’entrée' : 'Gare-la près de l’arène' });
      else if (v.dist !== null) go.push({ icon: v.key === 'moto' ? '🏍️' : '🚗', label: v.label, detail: `Garée à ${metres(v.dist)}`, go: v.key });
      else if (v.hub) go.push({ icon: v.key === 'moto' ? '🏍️' : '🚗', label: v.label, detail: `Garée à ${v.hub}` });
    }
    out.push({ title: 'Y aller', rows: go });
  }
  // ---------------------------------------------------------------- after
  if (i.after) out.push({ title: 'Après le combat', rows: [{ icon: '🍢', label: i.after.name, detail: [i.after.close !== undefined ? `ouvert jusqu’à ${i.after.close} h` : '', i.after.dist !== null ? `${metres(i.after.dist)} de l’arène` : ''].filter(Boolean).join(' · '), go: 'after' }] });
  // ---------------------------------------------------------------- today in the hub
  const city: TonightRow[] = [];
  if (i.weather) city.push({ icon: '🌦️', label: i.weather });
  for (const e of i.road) city.push({ icon: '🚧', label: EVENT_NAMES[e.kind], detail: `${i.hour >= e.from ? 'en ce moment' : `de ${hourText(e.from)}`} jusqu’à ${hourText(e.to)}${e.dist !== null ? ` · à ${metres(e.dist)}` : ''}` });
  if (city.length) out.push({ title: `Aujourd’hui à ${i.hub}`, rows: city });
  return out;
}

// ------------------------------------------------------------------ the live facts
const VEHICLES: { key: 'moto' | 'car'; asset: VehicleAsset; label: string; mod: typeof moto }[] = [
  { key: 'moto', asset: 'jakarta', label: 'Ta moto Jakarta', mod: moto },
  { key: 'car', asset: 'clando', label: 'Ta voiture', mod: car },
];
const hubShort = (h: HubId) => HUB_NAMES[h].split(' · ')[0];

/** The boarding stop of Ligne 23 nearest to (x, z) among the stops served now (not the « Arène » stop itself). */
function nearestStop(ctx: GameCtx, x: number, z: number) {
  let best: { id: string; name: string; x: number; z: number; d: number } | null = null;
  for (const l of LINES.filter(l => l.hub === 'pikine')) for (const s of l.stops) {
    const id = `stop:${l.id}:${s.id}`;
    if (s.id === 'arene' || !transport.served(id)) continue;
    const a = ctx.places.get(id)?.anchors[0]; if (!a) continue;
    const d = Math.hypot(a.x - x, a.z - z);
    if (!best || d < best.d) best = { id, name: s.name, x: a.x, z: a.z, d };
  }
  return best;
}

/** What the game knows tonight (read only). */
export function tonightFacts(ctx: GameCtx): TonightInput & { targets: Record<string, { name: string; x: number; z: number }> } {
  const day = ctx.day(), hour = ctx.hour(), w = ctx.world(), c = ctx.state.data.counters;
  const here = ctx.inside()?.door ?? ctx.player.pos, targets: Record<string, { name: string; x: number; z: number }> = {};
  const gateIt = w?.arena ? w.interactables.find(i => i.id === `${w.id}:arena`) : undefined;
  if (gateIt) targets.gate = { name: 'Arène · làmb', x: gateIt.x, z: gateIt.z };
  const gate = w?.arena && gateIt ? { dist: Math.hypot(gateIt.x - here.x, gateIt.z - here.z), inside: !ctx.inside() && Math.hypot(here.x - w.arena.cx, here.z - w.arena.cz) < WALL_R - 0.4 } : null;
  const win = w ? ctx.places.get(`${w.id}:arena:guichet`)?.anchors[0] : undefined;
  if (win) targets.guichet = { name: 'Guichet · billets', x: win.x, z: win.z };
  const stop = gate ? nearestStop(ctx, here.x, here.z) : null;
  if (stop) targets.stop = { name: `Arrêt ${stop.name} · ligne 23`, x: stop.x, z: stop.z };
  const vehicles: TonightInput['vehicles'] = [];
  for (const v of VEHICLES) {
    if (!ownsVehicle(ctx.state, v.asset)) continue;
    const p = v.mod.parkedHere();
    if (v.mod.ridden) vehicles.push({ key: v.key, label: v.label, dist: null, riding: true });
    else if (p) { vehicles.push({ key: v.key, label: v.label, dist: Math.hypot(p.x - here.x, p.z - here.z) }); targets[v.key] = { name: v.label, x: p.x, z: p.z }; }
    else { const elsewhere = parked(ctx.state.data, v.asset); vehicles.push({ key: v.key, label: v.label, dist: null, ...(elsewhere ? { hub: hubShort(elsewhere.hub) } : {}) }); }
  }
  // a place near the arena still open when the gala ends (Pikine only: the arena is there)
  const ap = w && gateIt ? afterPlace(ctx.places.all(), Math.max(hour, GALA.close - 2), gateIt) : null;
  if (ap?.anchors[0]) targets.after = { name: ap.name, x: ap.anchors[0].x, z: ap.anchors[0].z };
  const road = w ? roadEvents(w.id, day, w.edges, busyEdges(w), w.spawn).filter(e => e.to > hour).map(e => ({ kind: e.kind, from: e.from, to: e.to,
    dist: Math.hypot((e.edge.ax + e.edge.bx) / 2 - here.x, (e.edge.az + e.edge.bz) / 2 - here.z) })) : [];
  const ft = careerTonight(), pending = arenaFighter.pending();
  const b = billFor(day), t = billFor(day + 1);
  return {
    day, hour, size: eveningSize(day, GALA.doors), bill: b, tomorrow: { ...t, size: eveningSize(day + 1, GALA.doors) },
    ticket: hasTicket(c, day), galaDone: c[GALA_DONE_COUNTER] === day,
    fighter: pending ? { opponent: arenaFighter.opponent(), kind: ft?.kind ?? null } : null,
    hub: w ? hubShort(w.id) : 'Dakar', gate,
    ride: stop ? { stop: stop.name, dist: stop.d, fare: LINES.find(l => stop.id.startsWith(`stop:${l.id}:`))?.fare ?? 150 } : null,
    vehicles,
    after: ap ? { name: ap.name, close: ap.hours?.[1], dist: ap.anchors[0] && gateIt ? Math.hypot(ap.anchors[0].x - gateIt.x, ap.anchors[0].z - gateIt.z) : null } : null,
    weather: weatherLine(day, hour), road, targets,
  };
}

/** « Y aller »: the way-finding pin and the goal line toward a target of the page (an invisible marker of this hub). */
function goTo(ctx: GameCtx, key: string) {
  const w = ctx.world(), t = tonightFacts(ctx).targets[key];
  if (!w || !t) { ctx.toast('Ce lieu n’est pas dans ce quartier'); return; }
  const id = `cesoir:${key}`, old = w.interactables.findIndex(i => i.id === id);
  if (old >= 0) w.interactables.splice(old, 1);
  w.interactables.push({ id, name: t.name, kind: 'actions', x: t.x, z: t.z, radius: -1, actions: [] });   // never focused, never in the directory
  ctx.walkTo(id);
  ctx.toast(`Repère : ${t.name}`);
}

export const tonightModule: GameModule = {
  name: 'tonight',
  init(ctx) {
    phoneHooks.tonight = () => tonightPage(tonightFacts(ctx));
    phoneHooks.tonightGo = key => goTo(ctx, key);
  },
  debug: ctx => ({
    /** The « Ce soir » page as the phone shows it, and its targets. */
    tonight: () => ({ page: tonightPage(tonightFacts(ctx)), targets: tonightFacts(ctx).targets }),
    tonightGo: (key: string) => goTo(ctx, key),
  }),
};
