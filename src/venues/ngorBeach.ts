import * as THREE from 'three';
import type { PlaceSpec, Anchor } from '../activity/places';
import { isOpen } from '../activity/places';
import * as P from '../activity/primitives';
import type { ActivitySpec } from '../activity/types';
import { NGOR_BEACH, ngorBeachSeats } from '../world/ngorBeach';
import { Crowd, defaultLook, type CrowdLook, type CrowdSlot } from '../crowd/crowd';
import { conversation, counter, type Venue, type VenueEnv } from './venue';

/**
 * La plage de Ngor (docs/NGOR_BEACH.md; the world: src/world/ngorBeach.ts): the beach first, then the embarkation. What the player does there, with the activities that
 * already exist (no new money path, no schema change: `ng_` counters only):
 *  - walk the boardwalk and the sand, buy (sunglasses and a straw hat, wax print and a necklace at the stalls; coconut water, bissap, grilled corn, beignets; the lounge bar's
 *    drinks and grilled fish), a word with the ticket office;
 *  - rent a sun bed (500 F) and lie on it, the sea and the island ahead, for a real rest;
 *  - then the embarkation: the ticket hut, the waiting shelter, the plank path to the boarding beach (the crossing itself: src/venues/embarcadere.ts), and the lookout deck:
 *    « Regarder l'île de Ngor » through the telescope, the camera on the island.
 * A day card when the day had a purchase, a rest and the island. The people (the reusable crowd's instanced figures, never a full body): the stallholders, the barman, sunbathers on the beds, people on the bar's stools, the
 * waiting shelter and the lookout's benches, two strollers on the boardwalk.
 */
const KEYS = { buy: 'ng_achats', bed: 'ng_transat', look: 'ng_ile', dayBuy: 'ng_day_buy', dayBed: 'ng_day_bed', dayLook: 'ng_day_look', card: 'ng_card_day', days: 'ng_days' } as const;
const STALL_HOURS: [number, number] = [8, 20], BAR_HOURS: [number, number] = [10, 2];
const BED_PRICE = 500;
const C = (shirt: number, legs: number, skin: number, extra: Partial<CrowdLook> = {}): CrowdLook => ({ style: 'tee', shirt, legs, skin, wrap: null, head: 'hair', height: 0.97, build: 1, ...extra });
const DRESS = (shirt: number, skin: number, wrap: number, accent: number): CrowdLook => ({ style: 'dress', shirt, legs: shirt, skin, wrap, head: 'wrap', headColour: wrap, print: 2, accent, height: 0.94, build: 1 });
/** The stallholders, the barman, the guichetier (by slot id). */
const STAFF: Record<string, CrowdLook> = {
  v_souvenirs: C(0xf2c230, 0x1f4f8a, 0x4e2e1c), v_jus: DRESS(0x1a9d54, 0x5b3420, 0xe8742c, 0xf2d38a), v_grill: C(0xd9322b, 0x2b2f3a, 0x3b2216, { head: 'kufi', headColour: 0xf4f0e6 }),
  v_tissus: DRESS(0x6a4dff, 0x633a24, 0xf2c230, 0xf2c230), barman: C(0xf2f2ec, 0x1c1c1f, 0x45291a), guichetier: C(0x1d6f8a, 0x2b2f3a, 0x4e2e1c, { head: 'kufi', headColour: 0xf4f0e6 }),
};
const stage = (h: number) => (h >= 8 && h < 19 ? 'day' : h >= 19 || h < 2 ? 'eve' : 'night');

export function buildNgorBeach(env: VenueEnv): Venue {
  const { ctx, lite } = env, world = ctx.world()!, id = `${world.id}:venue:plage`;
  const N = NGOR_BEACH, group = new THREE.Group(); ctx.extra.add(group);
  const hour = () => ctx.hour(), day = () => Math.floor(ctx.day());
  const open = (hours: [number, number], what: string) => (): string | null => isOpen(hours, hour()) ? null : `${what} · ouvert de ${hours[0]} h à ${hours[1]} h`;
  const note = (line: string) => ctx.toast(line);

  // ---------------------------------------------------------------- what is sold
  const buy = (idn: string, label: string, price: number, needs: Partial<Record<'moral' | 'energie' | 'social', number>>, key: string, say: string, hours = STALL_HOURS, shop = 'Le stand'): ActivitySpec => {
    const a = P.use({ id: idn, label, price, seconds: 2.5, primitive: 'buy', line: say, effects: { needs, counters: { [KEYS.buy]: 1, [key]: 1 }, category: 'commerce' }, requires: open(hours, shop) });
    a.detail = `${price.toLocaleString('fr-FR').replace(/ /g, ' ')} F`; return a;
  };
  const drink = (idn: string, label: string, price: number, needs: Partial<Record<'moral' | 'energie' | 'faim' | 'social', number>>, hours = STALL_HOURS, shop = 'Le stand'): ActivitySpec =>
    ({ ...P.order({ id: idn, label, price, prep: 1.5, eat: 3, drink: true, seat: false, needs, requires: open(hours, shop) }), detail: `${price} F` });
  const food = (idn: string, label: string, price: number, faim: number, hours = STALL_HOURS, shop = 'Le stand', seat: boolean = false): ActivitySpec =>
    ({ ...P.order({ id: idn, label, price, prep: 2, eat: 4, seat: seat ? { near: N.bar.at, r: 6, kind: 'stool' } : false, needs: { faim, moral: 3 }, requires: open(hours, shop) }), detail: `${price.toLocaleString('fr-FR').replace(/ /g, ' ')} F` });
  const offers: Record<string, ActivitySpec[]> = {
    souvenirs: [
      buy('lunettes', 'Lunettes de soleil', 3000, { moral: 6 }, 'ng_lunettes', 'Vendeur : « Pour le soleil de Ngor, ces lunettes-là, c’est parfait ! »'),
      buy('chapeau', 'Chapeau de paille', 2500, { moral: 5 }, 'ng_chapeau', 'Vendeur : « Le chapeau des pêcheurs, il te va bien. »'),
    ],
    jus: [
      drink('coco', 'Eau de coco fraîche', 500, { moral: 3, energie: 4 }), drink('bissap', 'Bissap glacé', 300, { moral: 3, energie: 2 }), drink('gingembre', 'Jus de gingembre', 400, { energie: 5, moral: 2 }),
    ],
    grill: [food('mais', 'Maïs grillé', 300, 14), food('beignets', 'Beignets', 500, 20), food('arachides', 'Arachides grillées', 200, 8)],
    tissus: [
      buy('pagne', 'Pagne en wax', 8000, { moral: 10, social: 2 }, 'ng_pagne', 'Vendeuse : « Ce wax-là, il vient de Dakar même. Prends-le ! »'),
      buy('collier', 'Collier de perles', 1500, { moral: 6 }, 'ng_collier', 'Vendeuse : « Fait à la main, ici, sur la plage. »'),
      buy('tableau', 'Petit tableau de pirogues', 6000, { moral: 9 }, 'ng_tableau', 'Vendeuse : « Les pirogues de Ngor, peintes par mon cousin. »'),
    ],
    bar: [
      drink('citronnade', 'Citronnade glacée', 700, { moral: 4, energie: 4 }, BAR_HOURS, 'Le bar'), drink('the', 'Thé à la menthe', 300, { moral: 3 }, BAR_HOURS, 'Le bar'),
      drink('touba', 'Café Touba', 300, { energie: 6, moral: 2 }, BAR_HOURS, 'Le bar'),
      food('poisson', 'Poisson braisé, sauce et riz', 6000, 62, BAR_HOURS, 'Le bar', true), food('gambas', 'Brochettes de gambas', 4500, 45, BAR_HOURS, 'Le bar', true),
    ],
    guichet: [P.talk({ id: 'guichet', label: 'Demander pour l’île', icon: '🎫', then: () => guichetTalk() })],
    lunette: [{ ...P.use({ id: 'lunette_ile', label: 'Regarder l’île de Ngor', icon: '🔭', seconds: 8, primitive: 'inspect', line: 'Tu cales l’œil : le village de l’île, ses toits rouges et ocre, les parasols de la plage, un toit-terrasse où l’on dîne…',
      effects: { needs: { moral: 5 }, counters: { [KEYS.look]: 1 } } }), detail: 'La traversée dure une quinzaine de minutes' }],
  };
  for (const k of ['a', 'b'] as const) {
    const at = k === 'a' ? { x: -17.4, z: -142.3 } : { x: 0.6, z: -142.3 };
    offers['transats_' + k] = [{ ...P.use({ id: 'transat_' + k, label: 'Louer un transat', icon: '🏖️', price: BED_PRICE, seconds: 14, primitive: 'sleep', seat: { near: at, r: 8, kind: 'bed' },
      effects: { needs: { energie: 28, moral: 10 }, counters: { [KEYS.bed]: 1 } }, line: 'Le gérant : « Installe-toi, la mer est belle. »' }), detail: `${BED_PRICE} F · au soleil, face à la mer` }];
  }
  const guichetTalk = () => conversation(ctx, 'Guichet · Île de Ngor', 'Bonjour ! Pour l’île ? Les pirogues partent de la plage, juste là, quand elles sont pleines.', [
    { label: 'Les départs ?', icon: '🛶', pick: () => 'La pirogue part quand elle a ses passagers, la chaloupe un peu plus tard dans la journée. Le ponton est tout près : c’est là que Ousmane prend les clients.' },
    { label: 'Que voir sur l’île ?', icon: '🏝️', pick: () => 'Le village aux ruelles de sable, la plage, les restaurants sous les parasols, et « Sunu Toit » pour dîner sur un toit avec vue.' },
    { label: 'Je regarde d’abord la plage', icon: '🏖️', pick: () => 'Fais comme il te plaît : un transat, un coco frais, et la lunette au bout du ponton pour voir l’île avant d’y aller.' },
    { label: 'Jërëjëf', icon: '👋', pick: () => { note('Guichetier : « Bon voyage, et bon séjour à Ngor ! »'); return null; } },
  ]);

  // ---------------------------------------------------------------- the place
  const S = N.stalls;
  const A = (idn: string, name: string, kind: Anchor['kind'], x: number, z: number, radius = 1.9): Anchor => ({ id: idn, name, kind, x, z, y: 1.8, radius });
  const place: PlaceSpec = {
    id, type: 'beach', name: 'Plage de Ngor', space: 'street', chat: true, peaks: [[10, 17]],
    anchors: [
      A('souvenirs', 'Lunettes & chapeaux', 'counter', S.souvenirs.at.x, S.souvenirs.at.z), A('jus', 'Coco frais · jus', 'counter', S.jus.at.x, S.jus.at.z),
      A('grill', 'Maïs grillé · beignets', 'counter', S.grill.at.x, S.grill.at.z), A('tissus', 'Wax · colliers · art', 'counter', S.tissus.at.x, S.tissus.at.z),
      A('bar', 'Ngor Beach Lounge', 'counter', N.bar.at.x, N.bar.at.z, 2.8),
      A('transats_a', 'Transats', 'place', -17.4, -142.3, 5.5), A('transats_b', 'Transats', 'place', 0.6, -142.3, 5.5),
      A('guichet', 'Guichet · Île de Ngor', 'counter', N.hut.at.x, N.hut.at.z, 2.4), A('lunette', 'Lunette sur l’île', 'spot', N.lookout.at.x, N.lookout.at.z, 1.8),
    ],
    offers,
  };
  ctx.places.add(place);

  // ---------------------------------------------------------------- the people
  const seats = new Map(ngorBeachSeats().map(s => [s.id, s]));
  const bed = (n: number) => seats.get(`almadies:ngor:bed:${n}`)!, stool = (n: number) => seats.get(`almadies:ngor:stool:${n}`)!, wait = (n: number) => seats.get(`almadies:ngor:wait:${n}`)!, look = (n: number) => seats.get(`almadies:ngor:look:${n}`)!;
  // the beachgoers are the reusable crowd's instanced figures (src/crowd/crowd.ts): two draw calls for all of them, never a full body; they sit up on the beds, at the bar, in the
  // shelter and on the lookout's benches (the crowd has no lying pose: the player's own body lies on the beds)
  const stand = (idr: string, x: number, z: number): CrowdSlot => ({ id: idr, x, y: 0.12, z, yaw: 0, seated: false });
  const seatOf = new Map<string, string>();                                // the crowd figure's slot → the seat it holds (nobody else takes it while the figure is there)
  const at = (id: string, sid: string, up: number, back = 0): CrowdSlot => { const s0 = seats.get(sid)!; seatOf.set(id, sid); return { id, x: s0.x, y: up, z: s0.z + back, yaw: s0.yaw, seated: true }; };
  const slots: CrowdSlot[] = [
    stand('v_souvenirs', S.souvenirs.x, S.souvenirs.z + 0.3), stand('v_jus', S.jus.x, S.jus.z + 0.3), stand('v_grill', S.grill.x + 0.8, S.grill.z + 0.3), stand('v_tissus', S.tissus.x, S.tissus.z + 0.3),
    stand('barman', N.bar.x, N.bar.z - 3.55), stand('guichetier', N.hut.x - 0.4, N.hut.z + 0.9),
    at('bain1', bed(1).id, 0.5, 0.55), at('bain2', bed(4).id, 0.5, 0.55), at('bain3', bed(8).id, 0.5, 0.55), at('bain4', bed(10).id, 0.5, 0.55), at('bain5', bed(5).id, 0.5, 0.55),
    at('bar1', stool(1).id, 0.7), at('bar2', stool(3).id, 0.7), at('bar3', stool(4).id, 0.7), at('att1', wait(1).id, 0.52), at('att2', wait(2).id, 0.52), at('banc1', look(0).id, 0.52),
  ];
  const crowd = new Crowd(slots, { quality: ctx.quality(), near: 0, name: 'ngor-plage', seed: 211, fidget: 0.04, look: (slot, r) => STAFF[slot.id] ?? defaultLook(r) });
  crowd.group.name = 'ngor_plage_crowd'; ctx.extra.add(crowd.group);
  const present = (m: string) => ({ v_souvenirs: m === 'day', v_jus: m === 'day', v_grill: m === 'day', v_tissus: m === 'day', barman: true, guichetier: m === 'day', bain1: m === 'day', bain2: m === 'day', bain3: m === 'day' && !lite, bain4: m === 'day' && !lite, bain5: m === 'day', bar1: m !== 'night', bar2: m === 'eve' && !lite, bar3: m === 'day' && !lite,
    att1: m === 'day', att2: m === 'day' && !lite, banc1: m === 'day' });
  let moment = '';
  const showFigure = (k: string, on: boolean) => {
    const sid = seatOf.get(k), who = `${id}:${k}`;
    if (sid) { if (on && !ctx.seats.occupy(sid, who)) on = false; else if (!on) ctx.seats.release(sid, who); }   // the player (or someone) is on that seat: the figure is not there
    crowd.setPresent(k, on);
  };

  // ---------------------------------------------------------------- the day's card: a purchase, a rest and the island
  let seen = { buy: counter(ctx, KEYS.buy), bed: counter(ctx, KEYS.bed), look: counter(ctx, KEYS.look) }, pollT = 0, cards = 0;
  const pollDay = () => {
    const c = ctx.state.data.counters, d = day() + 1, cur = { buy: counter(ctx, KEYS.buy), bed: counter(ctx, KEYS.bed), look: counter(ctx, KEYS.look) };
    if (cur.buy > seen.buy) c[KEYS.dayBuy] = d;
    if (cur.bed > seen.bed) c[KEYS.dayBed] = d;
    if (cur.look > seen.look) c[KEYS.dayLook] = d;
    seen = cur;
    if (c[KEYS.dayBuy] === d && c[KEYS.dayBed] === d && c[KEYS.dayLook] === d && c[KEYS.card] !== d) {
      c[KEYS.card] = d; c[KEYS.days] = (c[KEYS.days] ?? 0) + 1; cards++;
      ctx.hud.moment({ icon: '🏖️', title: c[KEYS.days] === 1 ? 'Ta première journée à la plage de Ngor' : `Journée à la plage de Ngor · la ${c[KEYS.days]}ᵉ`,
        lines: ['🛍️ Tu as fait un achat sur la plage', '🏖️ Tu t’es reposé sur un transat', '🔭 Tu as regardé l’île', 'Il ne reste qu’à la traverser en pirogue.'] }, 9000);
      ctx.save();
    }
  };

  // ---------------------------------------------------------------- the camera: lying on a bed, or at the telescope, the view goes to the sea and the island
  const cam = { on: false, pos: new THREE.Vector3(), look: new THREE.Vector3() }, want = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const lying = () => { const s = ctx.player.seated(); return s && s.id.startsWith('almadies:ngor:bed:') ? s : null; };
  const scoping = () => ctx.activities.current?.spec.id === 'lunette_ile';
  const camera = (dt: number): boolean => {
    const s = lying(), sc = scoping();
    if (!s && !sc) { cam.on = false; return false; }
    if (s) { want.pos.set(s.x + 0.3, 1.15, s.z + 3.6); want.look.set(s.x, 1.7, s.z - 28); }                          // from behind the sunbather's feet, over them, to the sea
    else { want.pos.set(N.lookout.scope.x + 0.35, 1.7, N.lookout.scope.z + 1.0); want.look.set(N.island.x, 6.5, N.island.z); }
    if (!cam.on) { cam.pos.copy(ctx.camera.position); ctx.camera.getWorldDirection(cam.look); cam.look.multiplyScalar(10).add(cam.pos); cam.on = true; }
    const k = 1 - Math.exp(-dt * 2.4);
    cam.pos.lerp(want.pos, k); cam.look.lerp(want.look, k);
    ctx.camera.position.copy(cam.pos); ctx.camera.lookAt(cam.look);
    return true;
  };

  const update = (dt: number) => {
    const m = stage(hour());
    if (m !== moment) { moment = m; for (const [k, on] of Object.entries(present(m))) showFigure(k, on); }
    const near = Math.hypot(ctx.camera.position.x + 8, ctx.camera.position.z + 142) < 90;
    crowd.group.visible = near && ctx.space() === 'street'; if (crowd.group.visible) crowd.update(dt, true);
    if ((pollT -= dt) <= 0) { pollT = 0.5; pollDay(); }
  };

  return {
    id, type: 'beach', name: place.name, places: [place], update, camera,
    dispose() { for (const [k, sid] of seatOf) ctx.seats.release(sid, `${id}:${k}`); crowd.dispose(); group.removeFromParent(); },
    debug: () => ({
      id, moment, anchors: place.anchors.map(a => ({ id: a.id, x: a.x, z: a.z })), present: crowd.stats().present, lying: lying()?.id ?? null, scoping: scoping(), cards,
      counters: { achats: counter(ctx, KEYS.buy), transat: counter(ctx, KEYS.bed), ile: counter(ctx, KEYS.look), jours: counter(ctx, KEYS.days), carte: counter(ctx, KEYS.card) },
    }),
  };
}
