import type { GameCtx, GameModule } from './modules';
import type { HubId } from '../core/types';
import type { CampListing } from '../multiplayer/campProtocol';
import { online, type Outcome } from '../online/api';
import { phoneHooks } from '../ui/phoneHooks';
import { HUB_NAMES } from '../world/content';
import { anchorSpace, isOpen, isPeak, type Anchor, type PlaceSpec } from '../activity/places';
import type { ActivitySpec, Primitive } from '../activity/types';
import { payNow, routeById, whyNot, deliveryHub } from '../economy/jobs';
import { titleOf } from '../economy/tiakOffers';
import { currentTour } from '../economy/tour';
import { NGOR_LIFE, PATIO_LIFE, terraceLife } from '../venues/lifePlans';
import { shareAt } from '../venues/routine';
import { rooftopHere } from '../venues/rooftop';
import { nextPrayer, prayerAt } from '../venues/prayer';
import { GALA } from '../arena/program';
import { eveningSize } from '../arena/exterior';
import { followInto, guideTo, pinPlace } from '../online/visit';
import { AROUND_REFRESH_MS, aroundPage, crowdWord, hourText, type AroundAct, type AroundInput } from './aroundPage';

/**
 * « Autour de moi » (1.0.1): the live facts of the phone's screen (the page itself is the pure src/game/aroundPage.ts), and what its one action a row does.
 * Everything comes from the systems that already exist, read only:
 *  - Tiak Tiak: the board's offers of the district now (phoneHooks.tiakOffers, src/economy/tiakOffers.ts) at the pay the board shows, the run in hand;
 *    « Accepter » is the board's own accept (phoneHooks.takeTiak), « Y aller » leaves the marker to the parcel (the economy keeps it on its next place).
 *  - Grand Camp: the district's open lobbies (`aroundDeps.campList`: src/online/campClient.ts CampClient.list on this build's server), asked when the
 *    screen opens and every AROUND_REFRESH_MS while it is shown, never otherwise. « Voir » / « Organiser » open the Grand Camp app's routes
 *    (`grandcamp:<match>`, `grandcamp`) only when the phone has them (phoneHooks.canOpenPhone).
 *  - Friends: the account's conversations whose player is online now (src/online/api.ts); where they are only as far as it is shared: in sight in this
 *    presence room (their position), or their district as the account's `find` gives it (an accepted meeting or invitation between you). « Rejoindre »
 *    is the meetings' own way there (the walking marker on them, or their district's directions and their presence room: src/online/visit.ts
 *    followInto); no teleport. Else « Message ».
 *  - Places: the district's places open now (src/activity/places.ts hours), what is going on there from the living places' own hours of people
 *    (src/venues/lifePlans.ts), a mosque's prayers, a dibiterie's busy hours, tonight's card at the arena; « Y aller » is the walking marker.
 *  - Activities: what the places offer now in the activity framework (dancing, praying, fishing, a hand at work, a crossing) and the city places'
 *    free moments (« Partager l’attaya »…): « Commencer » where the player stands (the activity's own start), else « Y aller ».
 * Local to this device; the only network is the two server reads above.
 */
export const aroundDeps: {
  /** The district's open Grand Camp lobbies (main.ts: CampClient.list on this build's server); absent in a build without one. */
  campList?: (hub: HubId) => Promise<Outcome<{ matches: CampListing[] }>>;
  /** Runs a content action of a place of the district (main.ts runAction, as its sheet's row does); false when it cannot now. */
  runAction?: (placeId: string, actionId: string) => boolean;
} = {};

/** The verbs of the activity framework that are things to do (not buying, eating, sitting down or getting about), and their icons. */
const ACT_ICON: Partial<Record<Primitive, string>> = { dance: '💃', pray: '🤲', fish: '🎣', work: '🛠️', ride: '⛴️' };
/** The places worth going to, by their kind (src/activity/templates.ts), with their icon. */
const PLACE_ICON: Record<string, string> = {
  club: '🎶', beach: '🏖️', dibi: '🍢', mosque: '🕌', salon: '💈', restaurant: '🍽️', cafe: '☕', bar: '🍸', traversee: '⛴️', eatery: '🍲', shop: '🛍️', market: '🧺',
};
/** A friend's whereabouts as the account gave them (`find`), and when; asked again at most this often. */
const FIND_MS = 20_000, FIND_MAX = 6;
const found = new Map<string, { at: number; hub: HubId | null }>();
/** The district's lobbies as the server last gave them. */
let camp: { hub: HubId | null; at: number; busy: boolean; ok: boolean; matches: CampListing[] } = { hub: null, at: -Infinity, busy: false, ok: false, matches: [] };
const short = (h: HubId) => HUB_NAMES[h].split(' · ')[0];

/** What each row's « Y aller » / « Commencer » points at (rebuilt with the facts). */
interface Target { id: string; hub: HubId; name: string; x: number; z: number; spec?: { place: PlaceSpec; spec: ActivitySpec; at: Anchor }; action?: { it: string; id: string } }

/** Where a place is in the street: its first anchor, or, for a place with a space of its own (a club's courtyard), the street place of the same name or id. */
function streetPoint(ctx: GameCtx, p: PlaceSpec): { id: string; x: number; z: number } | null {
  const a = p.anchors[0];
  if (a && anchorSpace(p, a) === 'street') return { id: p.id, x: a.x, z: a.z };
  const it = ctx.world()?.interactables.find(i => i.id === p.id.replace(':venue:', ':city:') || (i.name === p.name && i.radius !== -1));
  return it ? { id: it.id, x: it.x, z: it.z } : null;
}

/** What is going on at a place at this hour, in a few words. */
function placeLine(p: PlaceSpec, h: number): string {
  const until = p.hours ? `jusqu’à ${hourText(p.hours[1])}` : '';
  const and = (...s: string[]) => s.filter(Boolean).join(' · ');
  if (p.id.endsWith(':patio')) return and(`Soirée · ${crowdWord(shareAt(PATIO_LIFE, h))}`, until);
  if (p.id.endsWith(':plage')) return and(`${h < 13 ? 'Matinée' : h < 18 ? 'Après-midi' : h < 20 ? 'Fin de journée' : 'Le soir'} · ${crowdWord(shareAt(NGOR_LIFE, h))}`, until);
  switch (p.type) {
    case 'mosque': { const now = prayerAt(h), next = nextPrayer(h); return now ? `Prière de ${now.name} en cours` : `Prochaine prière : ${next.name} à ${hourText(next.hour)}`; }
    case 'dibi': return and(isPeak(p, h) ? 'Grillades · du monde' : 'Grillades', until);
    case 'beach': return and(isPeak(p, h) ? 'Retour des pirogues' : 'Pêcheurs au travail', until);
    case 'club': return and(isPeak(p, h) ? 'Soirée · du monde' : 'Ouvert', until);
    case 'traversee': return and('Traversées vers l’île', until);
    default: return and(isPeak(p, h) ? 'Du monde' : 'Ouvert', until);
  }
}

/** The live facts (read only), and what each row's action points at. */
export function aroundFacts(ctx: GameCtx): AroundInput & { targets: Map<string, Target> } {
  const w = ctx.world(), s = ctx.state, h = ctx.hour(), targets = new Map<string, Target>();
  const empty: AroundInput = { net: null, job: null, tiak: [], camp: null, friends: [], places: [], activities: [] };
  if (!w) return { ...empty, targets };
  const hub = w.id, space = ctx.space(), me = ctx.inside()?.door ?? ctx.player.pos;
  const dist = (x: number, z: number) => Math.hypot(x - me.x, z - me.z);
  const placeOf = (frag: string) => w.interactables.find(i => i.id.startsWith(hub + ':') && i.id.includes(frag));
  // ---------------------------------------------------------------- Tiak Tiak
  let job: AroundInput['job'] = null;
  const a = s.data.jobs.active;
  if (a) {
    const tc = currentTour(s), r = a.tour ? undefined : routeById(a.routeId);
    const place = tc ? tc.stop.place : r ? (a.stage === 'pickup' ? r.from : r.to) : null;
    const where = (r && a.stage === 'deliver' ? deliveryHub(r) : a.hub) as HubId;
    const it = place && where === hub ? placeOf(place.frag) : undefined;
    if (place) job = { title: tc ? `Tournée ${tc.run.leg + 1}/2` : r ? titleOf(r) : 'Livraison', next: `${a.stage === 'pickup' && !tc ? 'Colis à prendre' : 'À livrer'} : ${place.name.split(' · ')[0]}${where !== hub ? ` · ${short(where)}` : ''}`, dist: it ? dist(it.x, it.z) : null };
  }
  const tiak: AroundInput['tiak'] = a ? [] : (phoneHooks.tiakOffers?.(hub) ?? []).map(o => {
    const r = routeById(o.id);
    return { id: o.id, title: o.title, type: o.typeLabel, pay: payNow(s, o.pay), dist: o.from.hub === hub ? dist(o.from.x, o.from.z) : null, why: r ? whyNot(s, r) : 'Livraison indisponible' };
  });
  // ---------------------------------------------------------------- online
  const o = online, net: AroundInput['net'] = !o || o.status === 'solo' ? null : o.status === 'online' ? 'online' : 'offline';
  const can = (app: string) => phoneHooks.canOpenPhone?.(app) ?? false;
  const campFacts: AroundInput['camp'] = net === 'online' && aroundDeps.campList ? {
    matches: camp.hub === hub && camp.ok ? camp.matches.map(m => ({ match: m.match, org: m.org.name, fee: m.terms.fee, left: Math.max(0, m.terms.size - m.count) })) : null,
    view: can('grandcamp:x'), organise: can('grandcamp'),
  } : null;
  const friends: AroundInput['friends'] = [];
  if (o && net === 'online') {
    const peers = ctx.peers();
    for (const c of o.convs()) {
      if (c.seen !== 'online' || c.blocked) continue;
      const p = peers.find(q => q.tag === c.with), f = found.get(c.with);
      const inSight = !!p && p.space === 'street' && space === 'street';
      friends.push({ tag: c.with, name: c.name, dist: inSight ? dist(p!.x, p!.z) : null, district: !p && f?.hub && f.hub !== hub ? short(f.hub) : null, sameDistrict: !!p || f?.hub === hub });
    }
  }
  // ---------------------------------------------------------------- places open now, and what is going on
  const places: AroundInput['places'] = [];
  for (const p of ctx.places.all()) {
    if (!PLACE_ICON[p.type] || p.id.endsWith(':dealer') || !isOpen(p.hours, h)) continue;
    const at = streetPoint(ctx, p); if (!at) continue;
    const key = `p:${p.id}`;
    targets.set(key, { id: at.id, hub, name: p.name, x: at.x, z: at.z });
    places.push({ key, icon: p.id.endsWith(':patio') ? '🪩' : p.type === 'beach' && !p.id.endsWith(':plage') ? '🛶' : PLACE_ICON[p.type], name: p.name, line: placeLine(p, h), dist: dist(at.x, at.z), here: p.space !== 'street' ? space === p.space : space === 'street' && dist(at.x, at.z) < 8 });
  }
  const roof = rooftopHere();
  if (roof) {
    const door = w.interactables.find(i => i.id === roof.doorId);
    if (door && (!roof.def.hours || isOpen(roof.def.hours, h))) {
      const meal = h >= 12 && h < 15 ? 'Déjeuner' : h >= 18.5 && h < 23.5 ? 'Dîner' : h >= 17 && h < 18.5 && roof.def.view === 'sea' ? 'Coucher du soleil' : 'Sur le toit';
      targets.set('roof', { id: door.id, hub, name: roof.def.name, x: door.x, z: door.z });
      places.push({ key: 'roof', icon: '🌇', name: roof.def.name, line: `${meal} · ${crowdWord(shareAt(terraceLife(roof.def, hub), h))}`, dist: dist(door.x, door.z), here: space === door.id });
    }
  }
  const gate = w.arena ? w.interactables.find(i => i.id === `${hub}:arena`) : undefined;
  if (gate && h >= 14 && h < GALA.close) {
    const card = eveningSize(ctx.day(), GALA.doors) === 'gala' ? 'Gala de lutte' : 'Combat de quartier';
    targets.set('arena', { id: gate.id, hub, name: gate.name, x: gate.x, z: gate.z });
    places.push({ key: 'arena', icon: '🤼', name: 'Arène de Pikine', line: h < GALA.doors ? `${card} ce soir · portes à ${GALA.doors} h` : `${card} · jusqu’à ${GALA.close} h`, dist: dist(gate.x, gate.z), here: false });
  }
  // ---------------------------------------------------------------- what the places offer now
  const activities: AroundInput['activities'] = [];
  for (const p of ctx.places.all()) {
    if (!isOpen(p.hours, h)) continue;
    let pick: { a: Anchor; spec: ActivitySpec } | null = null;
    for (const an of p.anchors) {
      const spec = (p.offers[an.id] ?? []).find(x => (!x.visible || x.visible()) && !!ACT_ICON[x.primitive] && (x.primitive !== 'ride' || p.type === 'traversee'));
      if (spec) { pick = { a: an, spec }; break; }
    }
    if (!pick) continue;
    const sp = anchorSpace(p, pick.a), street = sp === 'street' ? { id: p.id, x: pick.a.x, z: pick.a.z } : streetPoint(ctx, p);
    if (!street) continue;
    const here = space === sp && Math.hypot(pick.a.x - ctx.player.pos.x, pick.a.z - ctx.player.pos.z) <= (pick.a.radius ?? 2.2) + 0.3;
    const key = `a:${p.id}:${pick.spec.id}`;
    targets.set(key, { id: street.id, hub, name: p.name, x: street.x, z: street.z, spec: { place: p, spec: pick.spec, at: pick.a } });
    activities.push({ key, icon: pick.spec.icon ?? ACT_ICON[pick.spec.primitive]!, label: pick.spec.label, place: p.name, dist: here ? 0 : dist(street.x, street.z), here, start: true, why: here ? ctx.activities.blocked(pick.spec) : null });
  }
  // the city places' free moments (the attaya on the square, the gallery of the mall…): a place's sheet row, started as the sheet starts it
  for (const it of w.interactables) {
    if (!it.id.startsWith(hub + ':city:') || it.kind !== 'actions' || it.radius <= 0) continue;
    const act = it.actions.find(x => !x.cost && !x.gain && !x.special && (!x.visible || x.visible(s)) && !/Tiak Tiak/.test(x.label));
    if (!act) continue;
    const here = space === 'street' && dist(it.x, it.z) <= it.radius;
    const key = `c:${it.id}:${act.id}`;
    targets.set(key, { id: it.id, hub, name: it.name, x: it.x, z: it.z, action: { it: it.id, id: act.id } });
    activities.push({ key, icon: act.icon ?? '🤝', label: act.label, place: it.name.split(' · ')[0], dist: here ? 0 : dist(it.x, it.z), here, start: !!aroundDeps.runAction, why: here ? act.requires?.(s) ?? null : null });
  }
  return { net, job, tiak, camp: campFacts, friends, places, activities, targets };
}

/**
 * The server reads of the screen, on open and every AROUND_REFRESH_MS while it is shown (the screen's tick; nothing when it is not): the district's
 * lobbies, and where the online friends out of sight are (each at most every FIND_MS, the first FIND_MAX).
 */
export function aroundRefresh(ctx: GameCtx) {
  const hub = ctx.world()?.id, o = online, now = Date.now();
  if (!hub || !o || o.status !== 'online') return;
  if (aroundDeps.campList && !camp.busy && (camp.hub !== hub || now - camp.at >= AROUND_REFRESH_MS - 100)) {
    camp.busy = true;
    aroundDeps.campList(hub).then(r => { camp = { hub, at: Date.now(), busy: false, ok: r.ok, matches: r.ok ? r.matches : [] }; }, () => { camp = { ...camp, busy: false, at: Date.now() }; });
  }
  const peers = new Set(ctx.peers().map(p => p.tag));
  let asked = 0;
  for (const c of o.convs()) {
    if (c.seen !== 'online' || c.blocked || peers.has(c.with) || asked >= FIND_MAX) continue;
    const f = found.get(c.with); if (f && now - f.at < FIND_MS) continue;
    asked++;
    found.set(c.with, { at: now, hub: f?.hub ?? null });
    o.find(c.with).then(r => { found.set(c.with, { at: Date.now(), hub: r.ok ? r.hub : null }); }, () => { /* asked again later */ });
  }
}

/** What a row's action does (the screen closes the phone first for what happens in the street). Returns a line to say, or null. */
export function aroundDo(ctx: GameCtx, act: AroundAct): string | null {
  const w = ctx.world(); if (!w) return null;
  switch (act.kind) {
    case 'tiak': phoneHooks.takeTiak?.(act.id); return null;                // (a refusal is said by the board's own accept)
    case 'job': {
      phoneHooks.markPlace?.(null);                                     // the parcel's own marker leads (the economy keeps it on its next place)
      const a = ctx.state.data.jobs.active, r = a && !a.tour ? routeById(a.routeId) : undefined, where = (r && a?.stage === 'deliver' ? deliveryHub(r) : a?.hub) as HubId | undefined;
      if (where && where !== w.id) phoneHooks.driveTo?.(where);
      return null;
    }
    case 'camp': return phoneHooks.openPhone?.(`grandcamp:${act.match}`) ? null : 'Grand Camp n’est pas disponible ici';
    case 'organise': return phoneHooks.openPhone?.('grandcamp') ? null : 'Grand Camp n’est pas disponible ici';
    case 'message': return phoneHooks.openPhone?.(`messages:${act.tag}`) ? null : 'Messages indisponible';
    case 'join': {
      const c = online?.convs().find(x => x.with === act.tag); if (!c) return 'Plus en ligne';
      const p = ctx.peers().find(q => q.tag === act.tag);
      if (p && p.space === 'street') {                                  // in sight: the marker on where they stand now
        const name = `Position de ${c.name}`;
        guideTo(ctx, pinPlace({ kind: 'pos', hub: w.id, name, x: p.x, z: p.z }, w), w.id, name);
        return null;
      }
      const hub = p ? w.id : found.get(act.tag)?.hub ?? null;
      if (!hub) return `${c.name} ne partage pas où il est : écris-lui`;
      followInto(act.tag, hub);                                         // their presence room once in their district (src/online/visit.ts)
      if (hub !== w.id) { phoneHooks.driveTo?.(hub); ctx.toast(`Direction ${short(hub)} : ${c.name} y est`); }
      else ctx.toast(`${c.name} est dans le quartier`);
      return null;
    }
    case 'go': case 'start': {
      const t = aroundFacts(ctx).targets.get(act.key);
      if (!t) return 'Ce n’est plus possible ici';
      if (act.kind === 'start' && t.spec) return ctx.activities.start(t.spec.spec, { place: t.spec.place.name, at: { x: t.spec.at.x, z: t.spec.at.z } }) ? null : ctx.activities.blocked(t.spec.spec);
      if (act.kind === 'start' && t.action) return aroundDeps.runAction?.(t.action.it, t.action.id) ? null : 'Ce n’est plus possible ici';
      guideTo(ctx, t.id, t.hub, t.name);
      return null;
    }
  }
}

export const aroundModule: GameModule = {
  name: 'around',
  init(ctx) {
    phoneHooks.around = () => aroundPage(aroundFacts(ctx));
    phoneHooks.aroundRefresh = () => aroundRefresh(ctx);
    phoneHooks.aroundDo = act => aroundDo(ctx, act);
  },
  debug: ctx => ({
    /** « Autour de moi » as the phone shows it, the facts it is made of, and the server's lobbies as last read. */
    around: () => { const f = aroundFacts(ctx); return { page: aroundPage(f), facts: { ...f, targets: Object.fromEntries(f.targets) }, camp: { hub: camp.hub, ok: camp.ok, n: camp.matches.length } }; },
    aroundDo: (act: AroundAct) => aroundDo(ctx, act),
  }),
};

