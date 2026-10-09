import { Batch } from '../world/batch';
import type { Collider, Interactable } from '../world/types';
import type { PersonLook } from '../actors/humanoid';
import { buildVehicle } from '../actors/vehicleKit';
import { isOpen } from '../activity/places';
import { arrivage, dock, dockCounters, nextTruck, truckHere } from '../activity/templates';
import { Cast, type Role } from './cast';
import { conversation, counter, relate, type Venue, type VenueEnv } from './venue';
import { DRIVER_BYE, driverGreeting, driverLadder, driverRoute } from './talk';

/**
 * Port de pêche de Ngor (Almadies): the mareyeur's truck comes to the quay twice a day (6 h–11 h after the morning boats,
 * 15 h–19 h after the afternoon ones) to take the catch to the markets. Load it: Babacar calls the crates (yaboy, thiof,
 * capitaine, seiches, crevettes, ice), you hand up the right one before he loses patience; from the eighth load you lead
 * the loading and tie the tarp. The crates you loaded ride in the truck's bed until it leaves. The legacy « Aider les
 * pêcheurs » (pulling the pirogues) stays on the port's own sheet; this is a different job, with its own hours and rungs.
 *
 * Placed from the port's interactable (its sign at the block's edge): the truck stands in the yard behind it, rear
 * toward the pier, the crates waiting on the ground behind the tailgate.
 */
const DRIVER: PersonLook = { skin: 0x4e2e1c, style: 'tee', top: 0x2f6fb3, bottom: 0x2b2f3a, hat: 'kufi', hatColor: 0xf2f2ec, beard: 0x1a1414, heavy: 0.4, shoes: 0x3a2a1e };
const LOADER: PersonLook = { skin: 0x633a24, style: 'tee', top: 0xe2b234, bottom: 0x31404d, muscular: 0.6, shoes: 0x242b27 };
const PORTER: PersonLook = { skin: 0x3b2216, style: 'tee', top: 0x1a9d54, bottom: 0x222428, muscular: 0.5, shoes: 0x242b27 };
const CRATE = [0x1e6fd9, 0x2f8f4e, 0xe7b82f, 0xd9482b];

export function buildPort(env: VenueEnv, sheet: Interactable): Venue {
  const { ctx, mats, lite } = env;
  const world = ctx.world()!;
  const id = `${world.id}:venue:port`;
  const keys = dockCounters(id);
  // the truck in the yard behind the sign, facing east (+x), its tailgate toward the pier
  const tx = sheet.x + 12, tz = sheet.z + 3, yaw = Math.PI / 2;
  const truck = buildVehicle('truck', { seed: 30, color: 0xf2f2f0, driver: false, passengers: false, lite });
  truck.group.position.set(tx, 0.06, tz); truck.group.rotation.y = yaw; ctx.extra.add(truck.group);
  const L = truck.spec.length / 2, H = truck.spec.width / 2;
  /** Truck-local (x, z) → world (front = +z local = +x world). */
  const T = (lx: number, lz: number) => ({ x: tx + lz * Math.sin(yaw) + lx * Math.cos(yaw), z: tz + lz * Math.cos(yaw) - lx * Math.sin(yaw) });
  const truckBox: Collider = { x0: tx - L - 0.2, x1: tx + L + 0.2, z0: tz - H - 0.15, z1: tz + H + 0.15, h: 2.6 };
  // the load in the bed (shown once the player has loaded it, until the truck leaves)
  const cargo = truck.spec.cargo!;
  const loadB = new Batch();
  for (let k = 0; k < 18; k++) {
    const row = Math.floor(k / 3) % 3, col = k % 3, layer = Math.floor(k / 9);
    loadB.box(0.62, 0.3, 0.44, (col - 1) * 0.7, cargo.y + layer * 0.31, cargo.z - 1.6 + row * 0.5 + layer * 0.2, CRATE[k % 4]);
    loadB.box(0.56, 0.02, 0.38, (col - 1) * 0.7, cargo.y + layer * 0.31 + 0.3, cargo.z - 1.6 + row * 0.5 + layer * 0.2, 0xeef6fa);   // ice
  }
  loadB.slab(2.2, 0.04, 2.2, 0, cargo.y + 0.66, cargo.z - 1.1, 0x2f6f4f, 0, 0.12);                                                     // the tarp
  const load = loadB.build(mats.m.plain, true, true)!; load.visible = false; truck.group.add(load);
  // crates waiting behind the tailgate, a hand trolley, ice sacks
  const yard = new Batch();
  const sx = tx - L - 2.0, sz = tz - 1.8;
  for (let k = 0; k < 12; k++) {
    const c = k % 3, r = Math.floor(k / 3) % 2, l = Math.floor(k / 6);
    yard.box(0.62, 0.3, 0.44, sx + (c - 1) * 0.66, 0.06 + l * 0.31, sz + (r - 0.5) * 0.5, CRATE[(k + 1) % 4]);
    yard.box(0.56, 0.02, 0.38, sx + (c - 1) * 0.66, 0.06 + l * 0.31 + 0.3, sz + (r - 0.5) * 0.5, 0xeef6fa);
  }
  for (let k = 0; k < 3; k++) yard.blob(0.32, sx + 1.6, 0.25, sz - 0.5 + k * 0.55, 0xf4f6f2, 0.7, 0);                           // ice sacks
  yard.box(0.06, 1.1, 0.06, sx - 1.5, 0.06, sz + 0.9, 0x555555); yard.box(0.5, 0.04, 0.4, sx - 1.5, 0.06, sz + 1.1, 0x555555);   // trolley
  const yardMesh = yard.build(mats.m.plain, true, true)!; ctx.extra.add(yardMesh);
  const stack: Collider = { x0: sx - 1.1, x1: sx + 2.0, z0: sz - 0.9, z1: sz + 0.6, h: 0.7 };
  world.colliders.push(stack);

  // ---------------------------------------------------------------- the place: loading the truck, Babacar
  const talk = () => {
    const loads = counter(ctx, keys.loads), h = ctx.hour();
    ctx.state.adjust({ social: 3 }); relate(ctx, 'babacar_port', 1);
    conversation(ctx, 'Babacar · camion du mareyeur', driverGreeting(loads, truckHere(h), nextTruck(h)), [
      { label: 'Où va le poisson ?', icon: '🚚', pick: () => driverRoute(arrivage(ctx.day())) },
      { label: 'Et pour moi, la suite ?', icon: '📦', pick: () => driverLadder(counter(ctx, keys.loads)) },
      { label: 'Jërëjëf', icon: '👋', pick: () => { ctx.toast(`Babacar : ${DRIVER_BYE}`); return null; } },
    ]);
  };
  const back = T(0, -L - 1.3);
  const place = dock({
    id, name: 'Port de Ngor · camion du mareyeur', space: 'street', driver: 'Babacar',
    anchors: [{ id: 'camion', name: 'Camion du mareyeur', kind: 'vehicle', x: back.x, z: back.z + 1.0, y: 2.2, radius: 2.4, bias: -1 }],   // wins over greeting the porter
  }, {
    count: c => counter(ctx, c), hour: () => ctx.hour(), day: () => ctx.day(), converse: talk,
    tired: e => (ctx.state.data.needs.energie < e ? 'Repose-toi avant de charger' : null),
  });
  ctx.places.add(place);

  // ---------------------------------------------------------------- the people: the driver, a loader in the bed, a porter
  const dr = T(1.75, 2.4), bed = T(0, -L + 0.8), por = { x: sx + 0.2, z: sz + 1.1 };
  const roles: Role[] = [
    { id: 'chauffeur', look: DRIVER, ...dr, yaw: yaw + Math.PI, clip: 'Talk', when: m => m === 'truck' },
    { id: 'chargeur', look: LOADER, ...bed, y: cargo.y + 0.06, yaw: yaw + Math.PI, clip: 'Grab', when: m => m === 'truck' },
    { id: 'porteur', look: PORTER, ...por, yaw: Math.PI / 2, clip: 'Grab', when: m => m === 'truck' && !lite },
  ];
  const cast = new Cast(roles, ctx.seats, ctx.extra, id);
  env.addPeople(() => cast.bodies());

  let moment = '', atArrival = 0;
  const update = (dt: number) => {
    const h = ctx.hour(), here = truckHere(h);
    const m = !isOpen(place.hours, h) ? 'closed' : here ? 'truck' : 'empty';
    if (m !== moment) {
      moment = m; cast.setMoment(m);
      truck.group.visible = here;
      const i = world.colliders.indexOf(truckBox);
      if (here && i < 0) world.colliders.push(truckBox); else if (!here && i >= 0) world.colliders.splice(i, 1);
      atArrival = counter(ctx, keys.loads);
    }
    load.visible = here && counter(ctx, keys.loads) > atArrival;                  // the player's load rides in the bed until the truck leaves
    cast.update(dt, ctx.camera.position, lite ? 45 : 70, ctx.space() === 'street');
  };
  return {
    id, type: 'port', name: place.name, places: [place], update,
    dispose() { cast.dispose(); truck.group.removeFromParent(); yardMesh.removeFromParent(); yardMesh.geometry.dispose(); load.geometry.dispose(); },
    debug: () => ({
      id, type: 'port', name: place.name, moment, truck: truck.group.visible, loaded: load.visible, origin: { x: tx, z: tz }, yaw,
      anchors: place.anchors.map(a => ({ id: a.id, x: a.x, z: a.z, space: place.space })), npcs: cast.presentCount,
      loads: counter(ctx, keys.loads), arrivage: arrivage(ctx.day()),
    }),
  };
}
