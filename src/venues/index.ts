import type { GameCtx, GameModule } from '../game/modules';
import { People, type Body } from '../interact/people';
import { VenueMaterials } from './kit';
import { buildDibi } from './dibi';
import { buildMosque } from './mosque';
import { nightOf, type Venue, type VenueEnv } from './venue';
import { PRAYER_TIMES, nextPrayer, prayerAt } from './prayer';

export { PRAYER_TIMES, prayerAt, nextPrayer, prayerPeaks } from './prayer';

/**
 * Venues (docs/LIVING_DAKAR.md): real places composed from the shared framework on the sites the hub builder leaves
 * free (src/world/sites.ts) — the Dibi of Pikine and of the Médina, the Grande Mosquée. Each venue = procedural geometry
 * in a few merged draw calls + a place (anchors, offers, hours, peaks, chat) built by a recipe of
 * src/activity/templates.ts + seats of the shared registry + the people who hold it. Everything is rebuilt per hub.
 */
let venues: Venue[] = [];
let mats: VenueMaterials | null = null;
let bodies: (() => Body[])[] = [];
let people: People | null = null;

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
    // jobs played in the world (the grill's « Retourner la brochette ») are targets too
    ctx.interactions.add({ name: 'venue-jobs', collect: (space, x, z, out) => { for (const v of venues) v.collect?.(space, x, z, out); } });
  },
  hubLoaded(ctx, hub) {
    clear();
    const sites = hub.sites ?? [];
    if (!sites.length) return;
    mats = new VenueMaterials();
    const env: VenueEnv = { ctx, mats, lite: ctx.quality() === 'low', addPeople: f => bodies.push(f) };
    for (const s of sites) venues.push(s.kind === 'mosque' ? buildMosque(env, s) : buildDibi(env, s));
  },
  update(ctx, dt) {
    if (!venues.length) return;
    mats?.setNight(nightOf(ctx.hour()));
    for (const v of venues) v.update(dt);
  },
  spaceChanged(_ctx, space) { for (const v of venues) v.spaceChanged?.(space); },
  debug: () => ({
    venues: () => venues.map(v => v.debug()),
    prayer: (h: number) => ({ now: prayerAt(h)?.name ?? null, next: nextPrayer(h).name, times: PRAYER_TIMES.map(p => [p.name, p.hour]) }),
  }),
};
