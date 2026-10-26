import type { GameCtx, GameModule } from '../game/modules';
import { People, type Body } from '../interact/people';
import { VenueMaterials } from './kit';
import { buildDibi } from './dibi';
import { buildMosque } from './mosque';
import { buildBeach } from './beach';
import { buildEmbarcadere, type EmbarcadereVenue } from './embarcadere';
import { buildIslandRooftop, islandRooftopInfo } from './islandRooftop';
import { TRAVERSEE_HUB } from '../sea/traverseeSite';
import { buildSalon } from './salon';
import { buildClub, CLUB_SITE, setVagueVirtual, shiftClubDay } from './club';
import { applyStyle } from './style';
import { nightOf, type Venue, type VenueEnv } from './venue';
import { PRAYER_TIMES, nextPrayer, prayerAt } from './prayer';
import { insideWalls } from '../game/pace';

export { PRAYER_TIMES, prayerAt, nextPrayer, prayerPeaks } from './prayer';

/**
 * Venues (docs/LIVING_DAKAR.md): real places composed from the shared framework on the sites the hub builder leaves
 * free (src/world/sites.ts) — the Dibi of Pikine and of the Médina, the Grande Mosquée — and on city blocks that
 * already exist (Soumbédioune's pirogue and mareyeuses, Salon Awa's chairs), and on open ground (La Vague, the dance
 * terrace on Ngor's beach). Each venue = procedural geometry
 * in a few merged draw calls + a place (anchors, offers, hours, peaks, chat) built by a recipe of
 * src/activity/templates.ts + seats of the shared registry + the people who hold it. Everything is rebuilt per hub.
 */
let venues: Venue[] = [];
/** The Embarcadère de Ngor of this hub (la traversée), for its debug hook. */
let embarcadere: EmbarcadereVenue | null = null;
/**
 * A venue farther than this from the camera (m), the player out in the street, is updated FAR_EVERY seconds with the
 * time gone by (its people, embers, smoke, board and TV), not every frame: its people are not drawn beyond 45–70 m
 * (src/venues/cast.ts), and nobody sees its embers flicker from there. Near it, or inside, every frame as before.
 */
export const VENUE_NEAR = 90, FAR_EVERY = 0.2;
/** This frame's update for a venue owed `owed` seconds: the time to update it with (null: not yet), and what it is owed after. */
export function venueStep(owed: number, dt: number, far: boolean): [number | null, number] {
  const t = owed + dt;
  return far && t < FAR_EVERY ? [null, t] : [t, 0];
}
/** Each venue's centre (its places' anchors) and the time it is owed while far. */
const lag = new Map<Venue, { x: number; z: number; owed: number } | null>();
function centreOf(v: Venue) {
  let c = lag.get(v);
  if (c === undefined) {
    const pts = v.places.flatMap(p => p.anchors);
    c = pts.length ? { x: pts.reduce((t, a) => t + a.x, 0) / pts.length, z: pts.reduce((t, a) => t + a.z, 0) / pts.length, owed: 0 } : null;
    lag.set(v, c);
  }
  return c;
}
let mats: VenueMaterials | null = null;
let bodies: (() => Body[])[] = [];
let people: People | null = null;
let styleT = 0;

function clear() {
  for (const v of venues) v.dispose();
  venues = []; embarcadere = null; bodies = []; mats?.dispose(); mats = null; people?.clear(); lag.clear();
}

export const VenuesModule: GameModule = {
  name: 'venues',
  init(ctx: GameCtx) {
    // clients at the tables and elders in the courtyard can be greeted like anyone in the street
    people = new People(() => bodies.flatMap(f => f()), ctx.activities, line => ctx.toast(line), () => ({ x: ctx.player.pos.x, z: ctx.player.pos.z }));
    ctx.interactions.add({ name: 'venue-people', collect: (space, x, z, out) => people?.collect(space, x, z, out) });
  },
  hubLoaded(ctx, hub) { for (const _ of this.hubLoadedSteps!(ctx, hub)) { /* all at once */ } },
  /** Each venue is built in its own step (a district swapped in along a road, src/main.ts): the mosques and dibiteries are tens of ms apiece. */
  *hubLoadedSteps(ctx, hub) {
    clear();
    const sites = hub.sites ?? [];
    // Soumbédioune's beach is a city block of the hub: the venue joins it through the places it already has
    const landing = hub.interactables.find(i => i.id === `${hub.id}:city:soumbedioune`), market = hub.interactables.find(i => i.id === `${hub.id}:city:fish-market`);
    const salon = hub.interactables.find(i => i.id === `${hub.id}:city:salon-tech` && i.name === 'Salon Awa');
    const club = !!CLUB_SITE[hub.id];
    // the Almadies' old fishing quay is the Embarcadère de Ngor (docs/TRAVERSEE.md): the venue at its pier's end, found through the quay's own place
    const port = hub.id === TRAVERSEE_HUB ? hub.interactables.find(i => i.id === `${hub.id}:port`) : undefined;
    if (!sites.length && !(landing && market) && !salon && !club && !port) return;
    mats = new VenueMaterials();
    const env: VenueEnv = { ctx, mats, lite: ctx.quality() === 'low', addPeople: f => bodies.push(f) };
    for (const s of sites) { venues.push(s.kind === 'mosque' ? buildMosque(env, s) : buildDibi(env, s)); yield; }
    if (landing && market) { venues.push(buildBeach(env, landing, market)); yield; }
    if (salon) { venues.push(buildSalon(env, salon)); yield; }
    if (club) { venues.push(buildClub(env)); yield; }
    if (port) { embarcadere = buildEmbarcadere(env); venues.push(embarcadere); }
    if (port) venues.push(buildIslandRooftop(env));                      // the island's rooftop restaurant and lounge bar: its people and its music
  },
  update(ctx, dt) {
    styleT -= dt;                                                            // the salon's cut and beard stay on the player in every hub
    if (styleT <= 0) { styleT = 0.5; const body = ctx.player.body(); if (body) applyStyle(body, ctx.state.data.counters); }
    if (!venues.length) return;
    mats?.setNight(nightOf(ctx.hour()));
    const cam = ctx.camera.position, street = !ctx.inside();
    const walled = insideWalls(ctx.world()?.arena, cam);                    // inside the arena's walls every venue is out of sight
    for (const v of venues) {
      const c = centreOf(v);
      if (!c) { v.update(dt); continue; }
      const [run, owed] = venueStep(c.owed, dt, street && !v.space?.() && !v.active?.() && (walled || Math.hypot(cam.x - c.x, cam.z - c.z) > VENUE_NEAR));
      c.owed = owed;
      if (run !== null) v.update(run);
    }
  },
  spaceChanged(_ctx, space) { for (const v of venues) v.spaceChanged?.(space); },
  /** An in-world activity (the grill of a Dibi, La Vague's floor, a crossing to Ngor) frames the view while it runs. */
  camera(_ctx, dt, drag) { for (const v of venues) if (v.camera?.(dt, drag)) return true; return false; },
  /** A crossing out at sea saves the player on the pier (src/venues/embarcadere.ts). */
  safePlace() { for (const v of venues) { const p = v.safePlace?.(); if (p) return p; } return null; },
  /** A venue the player is in that has its own space (La Vague's terrace): targets, seats, presence and chat. */
  space() { for (const v of venues) { const s = v.space?.(); if (s) return s; } return null; },
  debug: () => ({
    venues: () => venues.map(v => v.debug()),
    clubShift: (n: number) => shiftClubDay(n),
    /** Frame-by-frame films: La Vague's music clock follows the game's frames from `t` s (null: the audio context's). */
    vagueVirtual: (t: number | null) => setVagueVirtual(t),
    prayer: (h: number) => ({ now: prayerAt(h)?.name ?? null, next: nextPrayer(h).name, times: PRAYER_TIMES.map(p => [p.name, p.hour]) }),
    /** La traversée: the phase, the boat in use and its pose, the customers, the legs paid, the counters, why each choice is closed (null outside the Almadies). */
    traversee: () => embarcadere?.traversee() ?? null,
    /** Checks: set the pirogue round trips Ousmane has seen (the chaloupe opens at 3). */
    traverseeSet: (n: number) => embarcadere?.setPirogueTrips(n) ?? null,
    /** The island's rooftop: open or not, who is there by role, whether its people are drawn, its music (null outside the Almadies). */
    islandRooftop: () => islandRooftopInfo(),
  }),
};
