import type { GameCtx, GameModule } from '../game/modules';
import type { HubId } from '../core/types';
import type { HubWorld } from '../world/types';
import { CITY_DAY_MS } from '../core/clock';
import { ECONOMY } from '../economy/config';
import { online, onlineHooks, type OnlineApi } from './api';
import type { LocationItem, MeetItem, MeetState, PlaceRef, Tag } from './protocol';
import { currentHome } from '../economy/assets';
import { homeByDoor } from '../economy/catalog';
import { hubLayout } from '../world/builder';
import { HUB_NAMES } from '../world/content';
import { phoneHooks } from '../ui/phoneHooks';
import { doorName, followInto, guideTo, homeRefOf, pinPlace } from './visit';

/**
 * LD2.0-B « Belong Online »: meeting at a real place of the city at a city time (docs/ld2/LD2_B_CONTRACT.md, « Meetings »). One module on the shared seam.
 *
 * - The places: existing destinations by their real ids (`MEET_PLACES`: the Corniche's football pitch, the arena, gargotes, La Vague, the squares…), and
 *   « Chez moi » (the home's street door) when the player has a home. Each resolves where the walking marker resolves ids (main.ts `guidePlace`: an
 *   interactable of the district, or a place of `ctx.places`); the pitch, which had none, gets a directory entry of radius −1 here.
 * - « Y aller »: the marker, directions from another district, and the other player's presence room (the one who did not propose joins the proposer's).
 *   A shared position is a pin (src/online/visit.ts) at its very point.
 * - Being there: every second, each accepted meeting whose window is open (ECONOMY.online: 5 real minutes before its time to 10 after; `when` = 0 is the moment
 *   it was made) sends `here` once when the player is within the place's radius (inside the home, for a meeting « chez moi »). When the meeting turns
 *   'met': one moment card and a small social lift, at most once a city day.
 */
export const CITY_MINUTE_MS = CITY_DAY_MS / (24 * 60);
/** The window the account keeps too (ECONOMY.online): one source, so a `here` sent is a `here` counted. */
export const MEET_EARLY_MS = ECONOMY.online.meetEarlyMs;
export const MEET_LATE_MS = ECONOMY.online.meetLateMs;
/** The social lift of a meeting kept (the needs' social), at most once a city day. */
export const MEET_SOCIAL = 12;

/** A meeting's time (server ms): its `when`, or « maintenant » (0): when it was made. */
export const meetTime = (m: Pick<MeetItem, 'when' | 'at'>) => m.when || m.at;
export function meetWindow(m: Pick<MeetItem, 'when' | 'at'>): { from: number; to: number } { const t = meetTime(m); return { from: t - MEET_EARLY_MS, to: t + MEET_LATE_MS }; }
export const inWindow = (m: Pick<MeetItem, 'when' | 'at'>, now: number) => { const w = meetWindow(m); return now >= w.from && now <= w.to; };
/** `here` is due for this meeting: accepted, in its window, this player there and not yet counted, not sent before. */
export const hereDue = (m: Pick<MeetItem, 'when' | 'at' | 'state' | 'here'>, me: Tag | null, now: number, there: boolean, sent: boolean) =>
  m.state === 'accepted' && there && !sent && !(me && m.here.includes(me)) && inWindow(m, now);
/** The social lift is due: not yet given this city day. */
export const liftDue = (lastDay: number | undefined, day: number) => lastDay !== day;
/** A meeting « chez moi » is at its proposer's home (a home's street door): the host whose home the other is invited into, or null. */
export const homeMeetHost = (m: Pick<MeetItem, 'place' | 'from'>): Tag | null => (m.place.id.includes(':home:') ? m.from : null);
/** Who goes to whose presence room: the one who did not propose joins the proposer's (never both at once). */
export const joinsOther = (m: Pick<MeetItem, 'from'>, me: Tag | null) => !!me && m.from !== me;
/** The card's moment: a meeting seen 'met' that this client saw before in another state, or was there for. */
export const metNow = (prev: MeetState | undefined, state: MeetState, sentHere: boolean) => state === 'met' && prev !== 'met' && (prev !== undefined || sentHere);

/** A destination of the catalogue: the id the marker resolves, its district, its name and how near counts as « there » (m). */
export interface MeetPlace extends PlaceRef { radius: number }
const P = (id: string, hub: HubId, name: string, icon: string, radius: number): MeetPlace => ({ id, hub, name, icon, radius });
/** The pitch of the Corniche (world/builder.ts special 'pitch'): a directory entry of its own, at the centre spot. */
export const PITCH_ID = 'corniche:meet:pitch';
export const MEET_PLACES: readonly MeetPlace[] = [
  P(PITCH_ID, 'corniche', 'Terrain de foot · Corniche', '⚽', 26),
  P('corniche:city:soumbedioune', 'corniche', 'Soumbédioune · débarquement', '🛶', 14),
  P('corniche:city:square', 'corniche', 'Place des étudiants · Fann', '🫖', 12),
  P('corniche:gargote:21', 'corniche', 'Gargote des étudiants', '🍲', 10),
  P('pikine:arena:guichet', 'pikine', 'Arène de Pikine · guichet', '🤼', 18),
  P('pikine:city:square', 'pikine', 'Grand-place de Pikine', '🫖', 12),
  P('pikine:gargote:32', 'pikine', 'Gargote Mame Diarra', '🍲', 10),
  P('pikine:dibiterie:11', 'pikine', 'Dibiterie Chez Pathé', '🍢', 10),
  P('plateau:city:square', 'plateau', 'Place de la Médina', '🫖', 12),
  P('plateau:gargote:12', 'plateau', 'Gargote Chez Fatou', '🍲', 10),
  P('plateau:market', 'plateau', 'Étal de Sandaga', '🧺', 12),
  P('almadies:city:club', 'almadies', 'La Vague · terrasse dansante', '🎶', 14),
  P('almadies:restaurant:01', 'almadies', 'Restaurant Le Pointe', '🍽️', 10),
  P('almadies:city:mall', 'almadies', 'Dakar Life Mall', '🛍️', 14),
  P('almadies:city:square', 'almadies', 'Place des voisins · Ngor', '🫖', 12),
];
/** How near counts as « there » for any place (a catalogue entry, a home's door: 6 m, anything else: 12 m). */
export const placeRadius = (p: Pick<PlaceRef, 'id'>) => MEET_PLACES.find(m => m.id === p.id)?.radius ?? (p.id.includes(':home:') ? 6 : 12);
/** Interactables a position is named after (« Partager ma position »): the city's places, eateries, the station, the arena…; never a home, a pin, a person. */
const NAMED = /:(city|gargote|maiga|cafe|dibiterie|restaurant|station|market|port|gym|arena|ecurie|garage|meet|bana)(:|$)|:rooftop:dir$/;

/** Where an id resolves now, as the walking marker resolves it (main.ts `guidePlace`): an interactable of the district, or a place's first anchor. */
export function resolvePlace(ctx: GameCtx, id: string): { name: string; x: number; z: number } | null {
  const it = ctx.world()?.interactables.find(i => i.id === id); if (it) return { name: it.name, x: it.x, z: it.z };
  const pl = ctx.places.all().find(p => p.id === id), a = pl?.anchors[0];
  return pl && a ? { name: pl.name, x: a.x, z: a.z } : null;
}

class Meetups implements GameModule {
  readonly name = 'meetups';
  private ctx: GameCtx | null = null;
  private t = 0;
  /** Meetings this client has said `here` for (once each), the states last seen, the cards shown. */
  private sent = new Set<string>();
  private seen = new Map<string, MeetState>();
  private cards = new Set<string>();
  private bound: OnlineApi | null = null; private unsub: (() => void) | null = null;
  readonly log = { here: [] as string[], cards: [] as string[], lifts: 0 };

  init(ctx: GameCtx) {
    this.ctx = ctx;
    onlineHooks.meetupPlaces = () => this.places(ctx);
    onlineHooks.goToPlace = place => this.goToPlace(ctx, place);
    onlineHooks.goToLocation = loc => this.goToLocation(ctx, loc);
    onlineHooks.hereNow = () => this.hereNow(ctx);
  }
  hubLoaded(_ctx: GameCtx, hub: HubWorld) {
    const pitch = hub.id === 'corniche' ? hubLayout('corniche').specials.find(s => s.kind === 'pitch') : null;
    if (pitch && !hub.interactables.some(i => i.id === PITCH_ID)) hub.interactables.push({ id: PITCH_ID, name: 'Terrain de foot · Corniche', kind: 'actions', x: pitch.x, z: pitch.z, radius: -1, actions: [] });
  }
  update(ctx: GameCtx, dt: number) {
    if (online !== this.bound) { this.unsub?.(); this.bound = online; this.unsub = online ? online.onChange(() => { this.t = Math.min(this.t, 0.15); }) : null; }
    this.t -= dt; if (this.t > 0) return;
    this.t = 1; this.attend(ctx);
  }

  // ---------------------------------------------------------------- places
  places(ctx: GameCtx): PlaceRef[] {
    const here = ctx.world()?.id, list: PlaceRef[] = [];
    const home = homeRefOf(currentHome(ctx.state).spec);
    if (home) list.push({ id: home.door, hub: home.hub, name: `Chez moi · ${home.name.split(' · ')[0]}`, icon: '🏠' });
    const rank = (p: MeetPlace) => (p.hub === here ? 0 : 1);
    for (const p of [...MEET_PLACES].sort((a, b) => rank(a) - rank(b))) list.push({ id: p.id, hub: p.hub, name: p.name, icon: p.icon });
    return list;
  }
  /** « Y aller » to a meeting's place: the marker, directions, and the proposer's presence room. */
  goToPlace(ctx: GameCtx, place: PlaceRef) {
    const api = online, me = api?.me?.tag ?? null;
    const meet = api ? this.meetings(api).find(m => m.item.place.id === place.id && (m.item.state === 'accepted' || m.item.state === 'open')) : undefined;
    const host = meet ? homeMeetHost(meet.item) : null;
    if (host && host !== me) {                                           // someone else's « chez moi »: their door, under their name
      const name = `Chez ${meet!.name}`;
      guideTo(ctx, pinPlace({ kind: 'visit', hub: place.hub, name, door: place.id }, ctx.world()), place.hub, name, doorName(homeByDoor(place.id)?.id ?? ''));
    } else guideTo(ctx, place.id, place.hub, place.name, this.navName(place));
    if (meet && joinsOther(meet.item, me)) followInto(meet.with, place.hub);
  }
  /** The directions find a place of another district by its interactable's name: the catalogue's names are those. */
  private navName(place: PlaceRef) { return MEET_PLACES.find(p => p.id === place.id)?.name ?? place.name; }
  goToLocation(ctx: GameCtx, loc: LocationItem) {
    const who = online?.convs().find(c => c.with === loc.from)?.name;
    const name = who ? `Position de ${who}` : `Position partagée · ${loc.name}`;
    guideTo(ctx, pinPlace({ kind: 'pos', hub: loc.hub, name, x: loc.x, z: loc.z }, ctx.world()), loc.hub, name, loc.name);
  }
  hereNow(ctx: GameCtx): Omit<LocationItem, 'id' | 'from' | 'at' | 'k'> | null {
    const w = ctx.world(); if (!w) return null;
    const inside = ctx.inside(), p = inside ? inside.door : ctx.player.pos;
    let best: { name: string; d: number } | null = null;
    for (const it of w.interactables) {
      if (it.npc || !NAMED.test(it.id)) continue;
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      if (!best || d < best.d) best = { name: it.name, d };
    }
    return { hub: w.id, x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, name: best?.name ?? HUB_NAMES[w.id].split(' · ')[0] };
  }

  // ---------------------------------------------------------------- being there
  private meetings(api: OnlineApi): { item: MeetItem; with: Tag; name: string }[] {
    const out: { item: MeetItem; with: Tag; name: string }[] = [];
    for (const c of api.convs()) for (const it of api.items(c.with)) if (it.k === 'meet') out.push({ item: it, with: c.with, name: c.name });
    return out;
  }
  /** At the place now: in its district within its radius (an interior counts at its door), or inside the home a meeting « chez moi » is at. */
  atPlace(ctx: GameCtx, place: PlaceRef): boolean {
    const w = ctx.world(); if (!w || w.id !== place.hub) return false;
    const inside = ctx.inside();
    if (inside && inside.door.id === place.id) return true;
    const at = resolvePlace(ctx, place.id); if (!at) return false;
    const p = inside ? inside.door : ctx.player.pos;
    return Math.hypot(at.x - p.x, at.z - p.z) <= placeRadius(place);
  }
  attend(ctx: GameCtx) {
    const api = online; if (!api) return;
    const me = api.me?.tag ?? null, now = ctx.now();
    for (const m of this.meetings(api)) {
      const it = m.item, prev = this.seen.get(it.id);
      this.seen.set(it.id, it.state);
      if (metNow(prev, it.state, this.sent.has(it.id)) && !this.cards.has(it.id)) { this.cards.add(it.id); this.met(ctx, it, m.name); }
      if (it.state !== 'accepted' || this.sent.has(it.id) || !inWindow(it, now)) continue;
      if (!hereDue(it, me, now, this.atPlace(ctx, it.place), false)) continue;
      this.sent.add(it.id); this.log.here.push(it.id);
      api.here(it.id);
    }
  }
  /** Both were there: one moment card, and the social lift once a city day. */
  private met(ctx: GameCtx, it: MeetItem, name: string) {
    const c = ctx.state.data.counters, day = ctx.day(), lift = liftDue(c.rdv_social_day, day);
    if (lift) { ctx.state.adjust({ social: MEET_SOCIAL }); c.rdv_social_day = day; this.log.lifts++; ctx.save(); }
    this.log.cards.push(it.id);
    ctx.hud.moment({ icon: '🤝', title: 'Vous êtes au rendez-vous ✓', lines: [`Avec ${name} · ${it.place.name}`, ...(lift ? [`Social +${MEET_SOCIAL}`] : [])] });
  }

  debug() {
    const self = this, ctx = () => self.ctx!;
    return {
      meet: {
        places: () => self.ctx ? self.places(ctx()) : [],
        catalogue: () => MEET_PLACES.map(p => ({ ...p })),
        /** Each catalogue place of the loaded district: where it resolves (as the marker does), and what the marker's guide gives once it is marked. */
        resolve: () => {
          const c = ctx(), hub = c.world()?.id, out: { id: string; at: { x: number; z: number } | null; guide: { name: string; x: number; z: number } | null }[] = [];
          for (const p of MEET_PLACES.filter(q => q.hub === hub)) {
            phoneHooks.markPlace?.(p.id, p.hub, p.name);
            out.push({ id: p.id, at: resolvePlace(c, p.id), guide: c.guide() });
          }
          phoneHooks.markPlace?.(null);
          return out;
        },
        here: () => onlineHooks.hereNow?.() ?? null,
        atPlace: (place: PlaceRef) => self.atPlace(ctx(), place),
        tick: () => self.attend(ctx()),
        info: () => ({ sent: [...self.sent], cards: [...self.cards], seen: Object.fromEntries(self.seen), log: { here: [...self.log.here], cards: [...self.log.cards], lifts: self.log.lifts } }),
        goToPlace: (p: PlaceRef) => self.goToPlace(ctx(), p),
        goToLocation: (l: LocationItem) => self.goToLocation(ctx(), l),
      },
    };
  }
}

const meetups = new Meetups();
/** Meetings at real places (registered in src/game/modules.ts MODULES). */
export const MEETUPS_MODULE: GameModule = {
  name: 'meetups',
  init: ctx => meetups.init(ctx),
  hubLoaded: (ctx, hub) => meetups.hubLoaded(ctx, hub),
  update: (ctx, dt) => meetups.update(ctx, dt),
  debug: () => meetups.debug(),
};
