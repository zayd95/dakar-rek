import type { GameCtx, GameModule } from '../game/modules';
import { People, type Body } from '../interact/people';
import { VenueMaterials } from './kit';
import { buildDibi } from './dibi';
import { buildMosque } from './mosque';
import { buildBeach } from './beach';
import { buildSalon } from './salon';
import { buildClub, CLUB_SITE, shiftClubDay } from './club';
import { buildPort } from './port';
import { applyStyle } from './style';
import { nightOf, type Venue, type VenueEnv } from './venue';
import { PRAYER_TIMES, nextPrayer, prayerAt } from './prayer';

export { PRAYER_TIMES, prayerAt, nextPrayer, prayerPeaks } from './prayer';

/**
 * Venues (docs/LIVING_DAKAR.md): real places composed from the shared framework on the sites the hub builder leaves
 * free (src/world/sites.ts) — the Dibi of Pikine and of the Médina, the Grande Mosquée — and on city blocks that
 * already exist (Soumbédioune's pirogue and mareyeuses, Salon Awa's chairs), and on open ground (La Vague, the dance
 * terrace on Ngor's beach, the fish truck at Ngor's port). Each venue = procedural geometry
 * in a few merged draw calls + a place (anchors, offers, hours, peaks, chat) built by a recipe of
 * src/activity/templates.ts + seats of the shared registry + the people who hold it. Everything is rebuilt per hub.
 */
let venues: Venue[] = [];
let mats: VenueMaterials | null = null;
let bodies: (() => Body[])[] = [];
let people: People | null = null;
let styleT = 0;

function clear() {
  for (const v of venues) v.dispose();
  venues = []; bodies = []; mats?.dispose(); mats = null; people?.clear();
}

export const VenuesModule: GameModule = {
  name: 'venues',
  init(ctx: GameCtx) {
    // clients at the tables and elders in the courtyard can be greeted like anyone in the street
    people = new People(() => bodies.flatMap(f => f()), ctx.activities, line => ctx.toast(line), () => ({ x: ctx.player.pos.x, z: ctx.player.pos.z }));
    ctx.interactions.add({ name: 'venue-people', collect: (space, x, z, out) => people?.collect(space, x, z, out) });
  },
  hubLoaded(ctx, hub) {
    clear();
    const sites = hub.sites ?? [];
    // Soumbédioune's beach is a city block of the hub: the venue joins it through the places it already has
    const landing = hub.interactables.find(i => i.id === `${hub.id}:city:soumbedioune`), market = hub.interactables.find(i => i.id === `${hub.id}:city:fish-market`);
    const salon = hub.interactables.find(i => i.id === `${hub.id}:city:salon-tech` && i.name === 'Salon Awa');
    const club = !!CLUB_SITE[hub.id], port = hub.interactables.find(i => i.id === `${hub.id}:port`);
    if (!sites.length && !(landing && market) && !salon && !club && !port) return;
    mats = new VenueMaterials();
    const env: VenueEnv = { ctx, mats, lite: ctx.quality() === 'low', addPeople: f => bodies.push(f) };
    for (const s of sites) venues.push(s.kind === 'mosque' ? buildMosque(env, s) : buildDibi(env, s));
    if (landing && market) venues.push(buildBeach(env, landing, market));
    if (salon) venues.push(buildSalon(env, salon));
    if (club) venues.push(buildClub(env));
    if (port) venues.push(buildPort(env, port));
  },
  update(ctx, dt) {
    styleT -= dt;                                                            // the salon's cut and beard stay on the player in every hub
    if (styleT <= 0) { styleT = 0.5; const body = ctx.player.body(); if (body) applyStyle(body, ctx.state.data.counters); }
    if (!venues.length) return;
    mats?.setNight(nightOf(ctx.hour()));
    for (const v of venues) v.update(dt);
  },
  spaceChanged(_ctx, space) { for (const v of venues) v.spaceChanged?.(space); },
  debug: () => ({
    venues: () => venues.map(v => v.debug()),
    clubShift: (n: number) => shiftClubDay(n),
    prayer: (h: number) => ({ now: prayerAt(h)?.name ?? null, next: nextPrayer(h).name, times: PRAYER_TIMES.map(p => [p.name, p.hour]) }),
  }),
};
