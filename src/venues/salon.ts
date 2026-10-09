import * as THREE from 'three';
import type { Interactable } from '../world/types';
import type { PersonLook } from '../actors/humanoid';
import { isOpen } from '../activity/places';
import { salon as salonRecipe } from '../activity/templates';
import { VenueKit } from './kit';
import { Cast, type Role } from './cast';
import { applyStyle, SALON_SERVICES } from './style';
import { conversation, counter, relate, type Venue, type VenueEnv } from './venue';

/**
 * Salon Awa (Pikine, the shops block of src/world/city.ts): two styling chairs facing mirrors on the side wall, a shelf of
 * products, a hood dryer, a poster of cuts. Sit in the free chair, the stylist works behind you, and the new cut or the
 * beard stays on your character (saved, every hub: src/venues/style.ts). The shop's sheet keeps its other services; its
 * old abstract « Se faire coiffer » becomes the chair. Open 9 h–21 h.
 *
 * Local frame: the shop's centre, its open front toward +z (the shop is 17 × 8 m).
 */
const STYLIST: PersonLook = { skin: 0x6b3f25, style: 'dress', top: 0x6b3fa0, pattern: 'wax', accent: 0xf6e7c1, female: true, hat: 'headwrap', hatColor: 0x6b3fa0, shoes: 0x3a2a1e };
const CLIENT: PersonLook = { skin: 0x4e2e1c, style: 'tee', top: 0x2f6fb3, bottom: 0x2b2f3a, shoes: 0xf2f2ec };
const G0 = 0.11;

function posterTexture() {
  const cv = document.createElement('canvas'); cv.width = 192; cv.height = 256;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#f2e6d2'; c.fillRect(0, 0, 192, 256); c.strokeStyle = '#6b3fa0'; c.lineWidth = 6; c.strokeRect(3, 3, 186, 250);
  const heads: [number, number, (x: number, y: number) => void][] = [
    [52, 70, (x, y) => { c.fillRect(x - 26, y - 34, 52, 18); }],                                          // short cut
    [140, 70, (x, y) => { c.beginPath(); c.arc(x, y - 18, 36, Math.PI, 0); c.fill(); }],                 // afro
    [52, 186, () => { /* shaved */ }],
    [140, 186, (x, y) => { c.beginPath(); c.arc(x, y + 14, 24, 0, Math.PI); c.fill(); c.fillRect(x - 26, y - 34, 52, 12); }],   // beard
  ];
  for (const [x, y, hair] of heads) {
    c.fillStyle = '#5b3420'; c.beginPath(); c.ellipse(x, y, 25, 32, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#1a1414'; hair(x, y);
    c.fillStyle = '#5b3420'; c.fillRect(x - 10, y + 28, 20, 18);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildSalon(env: VenueEnv, sheet: Interactable): Venue {
  const { ctx, mats, lite } = env;
  const world = ctx.world()!;
  const id = `${world.id}:venue:salon`;
  const sx = sheet.x, sz = sheet.z - 5.7;                                                // the shop's centre (its sheet stands at the open front)
  const k = new VenueKit({ x: sx, z: sz }, 0);
  const { plain: Pl, metal: Me, glow: Gl } = k.b;
  const at = (lx: number, lz: number) => k.w(lx, lz);
  const CH = [{ x: 5.4, z: -1.0 }, { x: 5.4, z: 1.7 }];
  // styling chairs facing the mirrors on the side wall
  const seats = CH.map((c, i) => {
    Pl.cyl(0.24, 0.3, 0.06, c.x, G0, c.z, 0x9aa0a6, 12); Me.cyl(0.05, 0.05, 0.36, c.x, G0 + 0.06, c.z, 0xc8ccd0, 8);   // chrome base and pump
    Pl.box(0.55, 0.12, 0.52, c.x, G0 + 0.42, c.z, 0x7a1f2b); Pl.box(0.1, 0.62, 0.52, c.x - 0.27, G0 + 0.52, c.z, 0x7a1f2b);   // seat, back
    for (const dz of [-0.28, 0.28]) Pl.box(0.46, 0.06, 0.08, c.x + 0.02, G0 + 0.68, c.z + dz, 0x2b2b33);                         // armrests
    Pl.box(0.3, 0.04, 0.4, c.x + 0.42, G0 + 0.12, c.z, 0x9aa0a6);                                                               // footrest
    k.solid(c.x, c.z, 0.55, 0.55, 0.9);
    // mirror, its frame, and the shelf of products below it
    const m = k.mesh(new THREE.PlaneGeometry(1.0, 1.25), k.keep(new THREE.MeshBasicMaterial({ color: 0x9fb6c2 })));
    m.position.set(8.35, G0 + 1.55, c.z); m.rotation.y = -Math.PI / 2;
    Pl.box(0.04, 1.37, 1.12, 8.37, G0 + 0.92, c.z, 0xd4b24a);
    Pl.box(0.3, 0.04, 1.1, 8.22, G0 + 0.86, c.z, 0xf2f2ee);
    for (let n = 0; n < 4; n++) Pl.cyl(0.04, 0.04, 0.12 + (n % 2) * 0.06, 8.22, G0 + 0.9, c.z - 0.36 + n * 0.24, [0xd9322b, 0x1a9d54, 0xf4c20d, 0x2f6fb3][n], 6);
    Gl.box(0.04, 0.06, 0.9, 8.33, G0 + 2.25, c.z, 0xfff1d8);                                                                    // light above the mirror
    return k.seat(`${id}:fauteuil:${i}`, c.x + 0.03, c.z, Math.PI / 2, 0.6, 'chair');
  });
  // hood dryer, cut hair on the floor, the poster of cuts
  Me.cyl(0.18, 0.22, 0.05, 7.5, G0, -2.05, 0x9aa0a6, 10); Me.cyl(0.03, 0.03, 1.3, 7.5, G0, -2.05, 0xc8ccd0, 6); Pl.sphere(0.32, 7.5, G0 + 1.45, -1.95, 0xe8e8ea, true);
  k.solid(7.5, -2.05, 0.5, 0.5, 1.5);
  for (let n = 0; n < 7; n++) Pl.flat(0.12 + (n % 3) * 0.05, 0.08, 5.9 + (n % 3) * 0.25, G0 + 0.01, -1.3 + n * 0.45, 0x1a1414, n);
  const poster = k.mesh(new THREE.PlaneGeometry(0.9, 1.2), new THREE.MeshLambertMaterial({ map: k.keep(posterTexture()) }));
  poster.position.set(8.35, G0 + 1.7, 3.2); poster.rotation.y = -Math.PI / 2;
  k.build(mats);
  ctx.extra.add(k.group);
  world.colliders.push(...k.colliders);
  for (const s of seats) ctx.seats.add(s);

  // the shop's sheet keeps its other services; the haircut is now the chair
  sheet.actions = sheet.actions.filter(a => a.id !== 'coiffure');
  const restyle = (sid: string) => {
    const s = SALON_SERVICES.find(x => x.id === sid); if (!s) return;
    const c = ctx.state.data.counters;
    if (s.hair !== undefined) c.coiffure = s.hair;
    if (s.beard !== undefined) c.barbe = s.beard;
    const body = ctx.player.body(); if (body) applyStyle(body, c);
    relate(ctx, 'awa_salon', 1);
  };
  const talk = () => {
    ctx.state.adjust({ social: 4 });
    conversation(ctx, 'Rokhaya · Salon Awa', counter(ctx, `salon:${id}`) > 0 ? 'Rokhaya : « Ah, ça te va bien ! Tu reviens quand tu veux, ma chaise t’attend. »' : 'Rokhaya : « Salaam aleekum ! Toogal, assieds-toi. On fait quoi aujourd’hui ? »', [
      { label: 'Les nouvelles du quartier', icon: '💬', pick: () => { ctx.state.adjust({ social: 3 }); return '« Tout le quartier parle de l’arène. Et la dibiterie de Pathé ne désemplit pas le soir ! »'; } },
      { label: 'Jërëjëf', icon: '👋', pick: () => { ctx.toast('Rokhaya : « Ba beneen yoon ! »'); return null; } },
    ]);
  };
  const centre = at((CH[0].x + CH[1].x) / 2, (CH[0].z + CH[1].z) / 2);
  const place = salonRecipe({
    id, name: 'Salon Awa · fauteuils', space: 'street', chairs: { ...centre, r: 2.5 },
    services: SALON_SERVICES.map(s => ({ id: s.id, label: s.label, detail: s.detail, price: s.price, seconds: s.seconds })),
    anchors: [{ id: 'chair', name: 'Fauteuils · Salon Awa', kind: 'furniture', ...at(4.1, 0.35), y: 1.8, radius: 2.2, bias: -1 }],   // wins over the stylist and Awa beside it
  }, { restyle, converse: talk });
  ctx.places.add(place);

  // the stylist stands behind the second chair; a client sits in the first while it is open
  const roles: Role[] = [
    { id: 'coiffeuse', look: STYLIST, ...at(CH[1].x - 0.8, CH[1].z), yaw: Math.PI / 2, clip: 'Idle', when: m => m === 'open' },
    { id: 'client', look: CLIENT, seat: seats[0], when: m => m === 'open' && !lite },
  ];
  const cast = new Cast(roles, ctx.seats, ctx.extra, id);
  env.addPeople(() => cast.bodies());
  let moment = '';
  const update = (dt: number) => {
    const m = isOpen(place.hours, ctx.hour()) ? 'open' : 'closed';
    if (m !== moment) { moment = m; cast.setMoment(m); }
    const cur = ctx.activities.current, seat = ctx.player.seated();
    cast.setClip('coiffeuse', cur && seat && seats.some(s => s.id === seat.id) && SALON_SERVICES.some(s => s.id === cur.spec.id) ? 'Grab' : 'Idle');
    cast.update(dt, ctx.camera.position, lite ? 40 : 60, ctx.space() === 'street');
  };
  return {
    id, type: 'salon', name: place.name, places: [place], update,
    dispose() { cast.dispose(); k.dispose(); },
    debug: () => ({
      id, type: 'salon', name: place.name, moment, origin: { x: sx, z: sz }, yaw: 0,
      anchors: place.anchors.map(a => ({ id: a.id, x: a.x, z: a.z, space: place.space })), seats: seats.map(s => s.id), npcs: cast.presentCount,
      style: { coiffure: counter(ctx, 'coiffure'), barbe: counter(ctx, 'barbe') },
    }),
  };
}
