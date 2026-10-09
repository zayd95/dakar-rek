import * as THREE from 'three';
import { Batch } from '../world/batch';
import { pirogue } from '../world/city';
import type { Interactable } from '../world/types';
import type { PersonLook } from '../actors/humanoid';
import { isOpen } from '../activity/places';
import { fishingBeach, FISH_PRICE, TRIP_STEPS } from '../activity/templates';
import { sitOriginY, type Seat } from '../interact/seats';
import { Cast, type Role } from './cast';
import { conversation, counter, relate, type Venue, type VenueEnv } from './venue';
import { MAREYEUSE_BYE, mareyeuseGreeting, mareyeusePrices, mareyeuseSea } from './talk';

/**
 * Soumbédioune (Corniche): the fishing beach of the city block already in the hub (src/world/city.ts) gets a pirogue
 * ready to leave and the mareyeuses' trade. Go out with the fishermen: you board the pirogue's thwart, it pushes out to
 * sea with you aboard, you pull the net (the catch goes to your inventory, more in the morning), it comes back to the
 * sand; then walk to the fish market and sell your fish to the mareyeuses (or buy one). The unloading, net repairs and
 * the market's own services stay as they were (legacy places). Open 6 h–20 h.
 */
const FISHER: PersonLook = { skin: 0x633a24, style: 'tee', top: 0xe2b234, bottom: 0x31404d, hat: 'kufi', hatColor: 0xf4c443, shoes: 0x242b27, muscular: 0.4 };
const CAPTAIN: PersonLook = { skin: 0x4e2e1c, style: 'tee', top: 0xcf5936, bottom: 0x2b2f3a, beard: 0x8a8580, shoes: 0x242b27, heavy: 0.3 };
/** How far out the trip goes (metres toward the open sea, −x). */
const OUT = 38;

export function buildBeach(env: VenueEnv, landing: Interactable, market: Interactable): Venue {
  const { ctx, mats, lite } = env;
  const world = ctx.world()!;
  const id = `${world.id}:venue:soumbedioune`;
  // the pirogue waits on the wet sand south of the others, bow toward the sea (−x); its +z end (the motor) faces the beach
  const dock = { x: landing.x - 11.5, z: landing.z + 17.5 }, yaw = Math.PI / 2;          // clear of the hub's own pirogues (z ≤ 110.75)
  const boat = new THREE.Group(); boat.position.set(dock.x, 0, dock.z); boat.rotation.y = yaw; ctx.extra.add(boat);
  const hullB = new Batch();
  pirogue(hullB, 0, 0, 10, 0, 1, 0.08);
  for (let n = 0; n < 6; n++) hullB.blob(0.32, -0.3 + (n % 3) * 0.3, 0.32, -3.4 + Math.floor(n / 3) * 0.35, n % 2 ? 0x2f6f4e : 0x3d7f5a, 0.45, 0);   // the net, piled at the bow
  for (let n = 0; n < 5; n++) hullB.sphere(0.07, -0.4 + n * 0.2, 0.62, -3.0, n % 2 ? 0xe9bc37 : 0xd54e2d);                                   // floats
  hullB.box(0.7, 0.35, 0.5, 0.35, 0.18, 1.9, 0x248b8f);                                                                               // fish crate
  const hull = hullB.build(mats.m.plain, true, true)!; boat.add(hull);
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xf4f6f2, transparent: true, opacity: 0, depthWrite: false });
  const foamG = new THREE.PlaneGeometry(2.6, 5); foamG.rotateX(-Math.PI / 2);
  const foam = new THREE.Mesh(foamG, foamMat); foam.position.set(0, 0.07, 6.6); boat.add(foam);                                      // wake behind the motor
  const toWorld = (lx: number, lz: number) => new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(boat.position);
  // the thwart where the player sits, facing the bow; it rides with the boat
  const seatLocal = { x: 0, z: 0.25 };
  const p0 = toWorld(seatLocal.x, seatLocal.z);
  const seat: Seat = { id: `${id}:pirogue`, x: p0.x, z: p0.z, top: 0.76, yaw: yaw + Math.PI, kind: 'vehicle', space: 'street', occupant: null };
  ctx.seats.add(seat);
  const collider = { x0: dock.x - 5.2, x1: dock.x + 5.2, z0: dock.z - 1.0, z1: dock.z + 1.0, h: 1.1 };
  world.colliders.push(collider);

  // ---------------------------------------------------------------- the place: the pirogue and the mareyeuses
  const talkMareyeuse = () => {
    const fish = () => ctx.inventory.count('poisson');
    ctx.state.count(`talks:${id}`); relate(ctx, 'coumba', 1); ctx.state.adjust({ social: 4 });
    conversation(ctx, 'Coumba · mareyeuse', mareyeuseGreeting(counter(ctx, `talks:${id}`), fish()), [
      { label: 'Les prix du jour', icon: '💰', pick: () => mareyeusePrices(FISH_PRICE.sell, FISH_PRICE.buy) },
      { label: 'La mer aujourd’hui ?', icon: '🌊', pick: () => mareyeuseSea(ctx.hour()) },
      { label: 'Jërëjëf', icon: '👋', pick: () => { ctx.toast(`Coumba : ${MAREYEUSE_BYE}`); return null; } },
    ]);
  };
  const side = toWorld(0, -0.2).add(new THREE.Vector3(0, 0, -1.9));                       // on the sand beside the hull, toward the market
  const place = fishingBeach({
    id, name: 'Soumbédioune · pirogue', space: 'street', boat: seat.id,
    anchors: [
      { id: 'pirogue', name: 'Pirogue des pêcheurs', kind: 'vehicle', x: side.x, z: side.z, y: 1.8, radius: 2.4 },
      { id: 'mareyeuses', name: 'Mareyeuses', kind: 'counter', x: market.x - 1, z: market.z - 4, y: 1.8, radius: 2.2 },
    ],
  }, { hour: () => ctx.hour(), converse: () => talkMareyeuse() });
  // what you carry shows on the market's sheet
  for (const o of place.offers.mareyeuses) if (o.primitive === 'sell') Object.defineProperty(o, 'detail', { get: () => `Tu portes ${ctx.inventory.count('poisson')} poisson${ctx.inventory.count('poisson') > 1 ? 's' : ''} · ${FISH_PRICE.sell} F pièce`, enumerable: true, configurable: true });
  ctx.places.add(place);

  // ---------------------------------------------------------------- the crew rides with the boat
  const crew: Role[] = [
    { id: 'capitaine', look: CAPTAIN, x: 0.2, z: 4.0, y: 0.18, yaw: Math.PI, clip: 'Idle', when: m => m !== 'night' },
    { id: 'filet', look: FISHER, x: -0.3, z: -2.4, y: 0.18, yaw: Math.PI / 2, clip: 'Grab', when: m => m !== 'night' && !lite },
  ];
  const cast = new Cast(crew, ctx.seats, boat, id);

  // ---------------------------------------------------------------- the trip: the boat follows the activity's steps
  let off = 0, t = 0, moment = '';
  const target = (): number => {
    const cur = ctx.activities.current;
    if (!cur || cur.spec.primitive !== 'fish' || !cur.spec.id.startsWith('sortie_') || ctx.player.seated()?.id !== seat.id) return 0;
    const p = Math.min(1, cur.t / (cur.step.seconds || 1)), ease = p * p * (3 - 2 * p);
    return cur.step.label === TRIP_STEPS.out ? OUT * ease : cur.step.label === TRIP_STEPS.net ? OUT : cur.step.label === TRIP_STEPS.back ? OUT * (1 - ease) : 0;
  };
  const update = (dt: number) => {
    t += dt;
    const h = ctx.hour(), m = isOpen(place.hours, h) ? 'day' : 'night';
    if (m !== moment) { moment = m; cast.setMoment(m); }
    const want = target(), moving = Math.abs(want - off) > 0.05;
    off += (want - off) * Math.min(1, dt * 3);
    const atSea = off > 2;
    boat.position.set(dock.x - off, atSea ? Math.sin(t * 1.7) * 0.05 - 0.05 : 0, dock.z + (atSea ? Math.sin(t * 0.6) * 0.4 : 0));
    boat.rotation.set(atSea ? Math.sin(t * 1.3) * 0.04 : 0, yaw, atSea ? Math.sin(t * 1.9) * 0.03 : 0);
    foamMat.opacity = moving && atSea ? 0.55 : 0;
    // the hull is solid only while it lies on the sand
    collider.x0 = off > 2 ? 9999 : dock.x - 5.2; collider.x1 = off > 2 ? 9999 : dock.x + 5.2;
    const w = toWorld(seatLocal.x, seatLocal.z); seat.x = w.x; seat.z = w.z;
    if (ctx.player.seated()?.id === seat.id) { ctx.player.pos.set(seat.x, sitOriginY(seat) + boat.position.y, seat.z); }
    cast.update(dt, ctx.camera.position, lite ? 45 : 70, ctx.space() === 'street');
  };

  return {
    id, type: 'beach', name: place.name, places: [place], update,
    dispose() { cast.dispose(); boat.removeFromParent(); hull.geometry.dispose(); foamG.dispose(); foamMat.dispose(); },
    debug: () => ({
      id, type: 'beach', name: place.name, moment, off, atSea: off > 2, seat: seat.id, dock, yaw,
      anchors: place.anchors.map(a => ({ id: a.id, x: a.x, z: a.z, space: place.space })), crew: cast.presentCount,
      fish: ctx.inventory.count('poisson'), trips: counter(ctx, 'sorties_peche'),
    }),
  };
}
