import * as THREE from 'three';
import type { GameModule, GameCtx } from './modules';
import { Humanoid, humanoidReady, randomLook } from '../actors/humanoid';
import { PRAYER_TIMES, PRAYER_WINDOW } from '../venues/prayer';
import { weatherNow } from '../city/weather';
import type { GameState } from '../core/state';
import type { Needs } from '../core/types';
import type { Action, Interactable } from '../world/types';
import { apprentiLine } from '../i18n/lines';

/**
 * Pikine's gare (the dense station built in src/world/builder.ts `pikineGare`): what you can do there, and its noise.
 * Plain data on the existing action runner: a line when the step starts, needs, counters, money, flags.
 * The apprentices at the cars and the queues at their doors come from the apprentice and ambient-life systems; the
 * gossip and the arguments are provisional texts (Unreviewed). Flags: met_apprenti, helped_gare, heard_gare_gossip.
 */
const DESTINATIONS = ['Parcelles', 'Guédiawaye', 'Plateau', 'Thiaroye'];
const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];
const has = (s: GameState, f: string) => s.data.flags.includes(f);
const say = (who: string, text: string) => `${who} : « ${text} »`;

export function gareActions(state: () => GameState, hour: () => number) {
  const apprenti: Action[] = [
    { id: 'parler_apprenti', label: 'Parler à l’apprenti', detail: 'Il crie les destinations, la main sur la barre', seconds: 3, steps: [{
      label: 'Discussion', primitive: 'talk', seconds: 3, clip: 'Talk',
      line: () => (has(state(), 'met_apprenti') ? apprentiLine(DESTINATIONS, Math.random()) : say('L’apprenti', 'Tu vas où, grand ? Monte, monte, on part tout de suite ! Parcelles, Guédiawaye, Plateau !')),
      effects: { needs: { social: 6, moral: 2 }, counters: { chats: 1 }, flags: ['met_apprenti'] } }] },
    { id: 'demander_prix', label: 'Demander le prix', detail: 'Le prix annoncé, puis le prix pour toi', seconds: 2.5, steps: [{
      label: 'Marchandage', primitive: 'talk', seconds: 2.5, clip: 'Talk',
      line: () => say('L’apprenti', pick(['Plateau, trois cents. Pour toi, deux cent cinquante, parce que c’est toi.', 'Guédiawaye, deux cents. Avec la valise, c’est cinquante de plus.', 'Parcelles, cent cinquante. Le car est presque plein, grand !'])),
      effects: { needs: { social: 3 } } }] },
    { id: 'attendre_car', label: 'Attendre un car', detail: 'Regarder les cars se remplir et partir', seconds: 8, steps: [{
      label: 'Tu attends', primitive: 'wait', seconds: 8,
      line: () => pick(['Un car se remplit, un autre part en klaxonnant. Il faut de la patience.', 'On dit qu’il part quand il est plein. Il n’est jamais plein.', 'Le soleil tape sur la tôle ; l’abri est bondé.']),
      effects: { needs: { energie: 3, moral: 1 } } }] },
  ];
  const SAC_NEEDS: Partial<Needs> = { energie: -10, hygiene: -4, faim: -3, social: 3 };
  const COLIS_NEEDS: Partial<Needs> = { energie: -22, hygiene: -8, faim: -7, moral: 3, social: 2 };
  const PLUIE_NEEDS: Partial<Needs> = { energie: -8, hygiene: -6, social: 4, moral: 2 };
  const bagages: Action[] = [
    { id: 'charger_sac', label: 'Aider à charger un sac', detail: '+500 F · un peu de fatigue', gain: 500, needs: SAC_NEEDS, seconds: 4,
      requires: s => (s.data.needs.energie < 15 ? 'Trop fatigué' : null), steps: [{
      label: 'Hisser le sac', primitive: 'work', seconds: 4, clip: 'Grab',
      line: () => say('Une cliente', pick(['Doucement avec ça, il y a des assiettes dedans !', 'Sur le toit, bien attaché, hein ?', 'Merci, mon fils. Tiens, pour ta peine.'])),
      effects: { money: 500, category: 'transport', needs: SAC_NEEDS, counters: { shifts: 1 }, flags: ['helped_gare'] } }] },
    { id: 'charger_colis', label: 'Charger un gros colis sur la galerie', detail: '+1 200 F · fatigant', gain: 1200, needs: COLIS_NEEDS, seconds: 6,
      requires: s => (s.data.needs.energie < 28 ? 'Trop fatigué' : null), steps: [{
      label: 'Monter le colis', primitive: 'work', seconds: 6, clip: 'Grab',
      line: () => say('L’apprenti', 'Un, deux, trois… hop ! Attache bien la corde, grand !'),
      effects: { money: 1200, category: 'transport', needs: COLIS_NEEDS, counters: { shifts: 1 }, flags: ['helped_gare'] } }] },
    { id: 'sacs_pluie', label: 'Aider quelqu’un avec ses sacs', detail: 'Sous la pluie, à l’abri : +300 F', gain: 300, needs: PLUIE_NEEDS, seconds: 4, visible: () => weatherNow.rain > 0.2 || weatherNow.wet > 0.5,
      requires: s => (s.data.needs.energie < 12 ? 'Trop fatigué' : null), steps: [{
      label: 'Porter les sacs', primitive: 'work', seconds: 4, clip: 'Grab',
      line: () => say('Une dame', pick(['Mes sacs sont trempés, tu peux les mettre sous l’abri ? Dieureudieuf !', 'Attention, ça glisse ! Tiens, pour ta peine.', 'Ils ne veulent pas monter avec ça, avec la boue… aide-moi !'])),
      effects: { money: 300, category: 'transport', needs: PLUIE_NEEDS, counters: { shifts: 1 }, flags: ['helped_gare'] } }] },
  ];
  const POUSSER_NEEDS: Partial<Needs> = { energie: -20, hygiene: -14, faim: -5, social: 5, moral: 2 };
  const embourbe: Action[] = [
    { id: 'pousser_car', label: 'Pousser le car', detail: 'Il est enlisé dans la boue : +400 F', gain: 400, needs: POUSSER_NEEDS, seconds: 6, visible: () => weatherNow.wet > 0.5,
      requires: s => (s.data.needs.energie < 22 ? 'Trop fatigué' : null), steps: [{
      label: 'Pousser', primitive: 'work', seconds: 6, clip: 'Grab',
      line: () => say('L’apprenti', pick(['Poussez ! Poussez ! Encore un coup, il sort !', 'Tous ensemble ! Un, deux, trois !', 'La boue, la boue… Merci, grand, tu as de la force !'])),
      effects: { money: 400, category: 'transport', needs: POUSSER_NEEDS, counters: { shifts: 1 }, flags: ['helped_gare', 'pushed_car'] } }] },
  ];
  const vendeur: Action[] = [
    { id: 'eau_gare', label: 'Acheter un sachet d’eau', detail: 'Frais, 50 F', cost: 50, seconds: 1.5, steps: [{
      label: 'Sachet d’eau', primitive: 'drink', seconds: 1.5, line: 'Vendeur : « De l’eau fraîche, de l’eau fraîche ! Cinquante francs ! »', effects: { needs: { energie: 2, moral: 1 } } }] },
    { id: 'cacahuetes_gare', label: 'Acheter des cacahuètes', detail: 'Un cornet, 100 F', cost: 100, seconds: 1.5, steps: [{
      label: 'Cacahuètes', primitive: 'eat', seconds: 1.5, line: 'Vendeuse : « Cacahuètes grillées, chaudes, chaudes ! »', effects: { needs: { faim: 8, moral: 2 } } }] },
    { id: 'mouchoirs_gare', label: 'Acheter des mouchoirs', detail: 'Un paquet, 100 F', cost: 100, seconds: 1.2, steps: [{
      label: 'Mouchoirs', primitive: 'buy', seconds: 1.2, line: 'Vendeur : « Les mouchoirs, la poussière c’est pour tout le monde ! »', effects: { needs: { hygiene: 6 } } }] },
    { id: 'credit_gare', label: 'Acheter du crédit téléphone', detail: '500 F', cost: 500, seconds: 1.5, steps: [{
      label: 'Crédit', primitive: 'buy', seconds: 1.5, line: 'Vendeur : « Crédit, crédit ! Je te mets cinq cents, tu vas appeler ta mère ! »', effects: { needs: { social: 6, moral: 3 } } }] },
  ];
  const the: Action[] = [
    { id: 'attaya_gare', label: 'Boire un attaya', detail: 'Trois verres, 100 F', cost: 100, seconds: 3, steps: [{
      label: 'Attaya', primitive: 'drink', seconds: 3, prop: 'glass', line: 'Le faiseur d’attaya : « Le premier est fort comme la mort, le deuxième doux comme la vie, le troisième sucré comme l’amour. »',
      effects: { needs: { energie: 5, moral: 5, social: 3, faim: 1 }, counters: { cafes: 1 } } }] },
    { id: 'commerages_gare', label: 'Écouter les commérages', detail: 'On y apprend tout avant les journaux', seconds: 4, steps: [{
      label: 'Tu écoutes', primitive: 'wait', seconds: 4, clip: 'Talk',
      line: () => {
        const h = hour(), base = ['On dit que le loyer va encore monter à Parcelles.', 'Tu as vu le car de Guédiawaye ? Même l’apprenti n’a plus de voix.', 'Le chauffeur du 12 s’est disputé avec le receveur : trois cents francs pour une valise !', 'Ma cousine de Thiaroye dit que l’eau est montée jusqu’à la porte l’an dernier.'];
        const timed = h >= 5 && h < 11 ? ['Les premiers cars étaient pleins avant le lever du soleil.'] : h >= 16 && h < 20 ? ['Le combat de ce soir à l’arène : tout le monde en parle, personne n’a de billet.'] : ['La chaleur ! On attend le soir pour respirer.'];
        return say('Quelqu’un à la table', pick([...base, ...timed]));
      },
      effects: { needs: { social: 5, moral: 1 }, counters: { chats: 1 }, flags: ['heard_gare_gossip'] } }] },
  ];
  const dispute: Action[] = [
    { id: 'ecouter_dispute', label: 'Écouter la dispute', detail: 'Le prix, la route, le bagage de trop', seconds: 3, steps: [{
      label: 'Tu écoutes', primitive: 'wait', seconds: 3,
      line: () => pick(['« Deux cents, pas un franc de plus ! » — « Alors prends le suivant, grand-mère ! »', '« Tu as dit Guédiawaye, pas Thiaroye ! » — « C’est la même route ! »', '« Ta valise, elle prend trois places ! » — « C’est mon trousseau, un peu de respect ! »']),
      effects: { needs: { social: 3 } } }] },
  ];
  return { apprenti, bagages, vendeur, the, dispute, embourbe };
}

/** Where things stand, from the station's own interaction (« Car rapide · changer de quartier » at the centre − 3, + 3.2). */
function placesAt(cx: number, cz: number, A: ReturnType<typeof gareActions>): Interactable[] {
  return [
    { id: 'pikine:gare:apprenti', name: 'Apprenti du car', kind: 'actions', x: cx - 8.2, z: cz + 0.3, radius: 3.2, actions: A.apprenti, description: 'Un apprenti à la porte arrière, la main sur la barre : il crie les destinations.' },
    { id: 'pikine:gare:bagages', name: 'Bagages et colis', kind: 'actions', x: cx - 10.6, z: cz - 4.2, radius: 3.2, actions: A.bagages, description: 'Sacs, ballots et valises à hisser sur la galerie.' },
    { id: 'pikine:gare:vendeurs', name: 'Vendeurs ambulants', kind: 'actions', x: cx - 3, z: cz - 7, radius: 4.4, actions: A.vendeur, description: 'Eau, cacahuètes, mouchoirs, crédit : ils passent entre les cars.' },
    { id: 'pikine:gare:the', name: 'Attaya du gare', kind: 'actions', x: cx + 15, z: cz - 2, radius: 3.6, actions: A.the, description: 'Un coin à thé sous une tôle, où l’on sait tout ce qui se dit.' },
    { id: 'pikine:gare:dispute', name: 'Dispute au sujet du prix', kind: 'actions', x: cx - 9.5, z: cz - 9, radius: 3, actions: A.dispute },
  ];
}

const RAIN_NOISE = ['Le car est embourbé ! Encore ! Quelqu’un a une corde ?', 'Tout le monde se serre sous l’abri en grommelant : « Cette pluie, ça n’en finit pas ! »', 'Un chauffeur : « Pas question de partir avant que ça s’arrête ! »', 'L’apprenti crie dans la pluie : « Parcelles ! Ça passe encore ! »', 'On se plaint de la boue, de l’eau jusqu’aux chevilles, des cars qui n’arrivent pas.'];
const NOISE = ['Klaxons, moteurs et cris : le gare ne dort jamais.', 'L’apprenti : « Parcelles ! Guédiawaye ! Plateau ! »', 'Un car klaxonne pour se frayer un passage.', 'Quelqu’un hurle un prix, quelqu’un d’autre le conteste.', 'Une porte de car claque, un sac tombe : « Doucement ! »'];

/** How full the gare is at city hour h, 0…1: busiest in the early morning and the late afternoon (trapezoids with soft edges). */
export function gareLevel(h: number, rain = 0): number {
  const bump = (a: number, b: number, c: number, d: number) => (h <= a || h >= d ? 0 : h < b ? (h - a) / (b - a) : h <= c ? 1 : (d - h) / (d - c));
  return Math.max(bump(5.5, 6.5, 8.5, 9.5), bump(16.5, 17.5, 19, 20), Math.min(1, rain * 1.2));   // and in the rain, whatever the hour: everyone under the shelter
}
/** The morning commute: this long after the Fajar congregation has left (its window ends at 6 h + PRAYER_WINDOW[1]) people walk from the mosque to the cars. */
export const COMMUTE_FROM = PRAYER_TIMES[0].hour + PRAYER_WINDOW[1], COMMUTE_UNTIL = COMMUTE_FROM + 0.6;

const SPOTS: [number, number, number][] = [[-9.4, 1.3, 1.6], [-9.2, -1, 1.5], [-11.6, -4.2, 1.6], [-8.6, -6.2, 1.4], [-6.2, -11.4, 1.5], [-3.4, -11.6, 1.7],
  [-15.2, 5.2, 1.5], [-15, 7.4, 1.6], [-4, 7.6, 3.1], [-1.5, 7.4, 3.0]];                                       // [dx, dz, yaw]: at the rear doors, a queue under the shelter
class GareCrowd {
  readonly group = new THREE.Group();
  private extras: Humanoid[] = [];
  private commuters: { h: Humanoid; path: { x: number; z: number }[]; i: number; wait: number; t: number }[] = [];
  private doneDay = -1;
  constructor(private cx: number, private cz: number, private forecourt: { x: number; z: number } | null) { this.group.name = 'pikine-gare-crowd'; }
  private body(look = randomLook(Math.random)) { const h = new Humanoid(look); h.group.visible = false; this.group.add(h.group); return h; }
  update(ctx: GameCtx, dt: number) {
    if (!humanoidReady()) return;
    const hour = ctx.hour(), d = Math.hypot(ctx.player.pos.x - this.cx, ctx.player.pos.z - this.cz), level = gareLevel(hour, weatherNow.rain), near = d < 70;
    const nearMosque = !!this.forecourt && Math.hypot(ctx.player.pos.x - this.forecourt.x, ctx.player.pos.z - this.forecourt.z) < 70;
    // more people when the gare is busy: the spots fill with the level, and are only built while someone is there to see them
    if (level > 0 && near && !this.extras.length) {
      this.extras = SPOTS.map(([dx, dz, yaw], k) => { const h = this.body(); h.group.position.set(this.cx + dx, 0.1, this.cz + dz); h.group.rotation.y = yaw; h.hold = k % 3 === 0 ? 'Talk' : null; return h; });
    }
    const shown = Math.round(level * this.extras.length);
    this.extras.forEach((h, k) => { const on = near && k < shown; h.group.visible = on; if (on) h.animate(dt, 0); });
    // after the Fajar congregation, some of its people walk to the cars (once a day, only if the player is around)
    const day = ctx.day();
    if (this.forecourt && (near || nearMosque) && hour >= COMMUTE_FROM && hour < COMMUTE_UNTIL && day !== this.doneDay && !this.commuters.length) {
      this.doneDay = day;
      const F = this.forecourt, doors = SPOTS.slice(0, 6);
      this.commuters = doors.map(([dx, dz], k) => {
        const h = this.body(), fx = F.x + (k - 2.5) * 1.1, fz = F.z + (k % 2) * 1.2;
        h.group.position.set(fx, 0.1, fz); h.hold = null; h.group.visible = true;
        // out of the gate, along the road, across to the gare
        return { h, path: [{ x: F.x + (k - 2.5) * 0.4, z: F.z - 8 }, { x: F.x, z: 63.5 }, { x: 4, z: 63.5 }, { x: 4, z: this.cz - 12 + k }, { x: this.cx + 20, z: this.cz - 12 + k }, { x: this.cx + dx, z: this.cz + dz + 0.8 }], i: 0, wait: 14 + k * 3, t: -k * 1.4 };
      });
    }
    for (const c of this.commuters) {
      c.t += dt;
      if (c.t < 0) { c.h.animate(dt, 0); continue; }
      const p = c.h.group.position, tgt = c.path[c.i];
      if (tgt) {
        const dx = tgt.x - p.x, dz = tgt.z - p.z, len = Math.hypot(dx, dz), step = 1.6 * dt;
        if (len <= step) { p.x = tgt.x; p.z = tgt.z; c.i++; } else { p.x += dx / len * step; p.z += dz / len * step; c.h.group.rotation.y = Math.atan2(dx, dz); }
        c.h.animate(dt, 1.6);
      } else { c.wait -= dt; c.h.animate(dt, 0); if (c.wait <= 0) c.h.group.visible = false; }       // they climb aboard and are gone
    }
    if (this.commuters.length && this.commuters.every(c => !c.h.group.visible)) { for (const c of this.commuters) { c.h.group.removeFromParent(); c.h.dispose(); } this.commuters = []; }
  }
  info() { return { extras: this.extras.filter(h => h.group.visible).length, commuters: this.commuters.length, walking: this.commuters.filter(c => c.i < c.path.length && c.t >= 0).length }; }
  dispose() { for (const h of [...this.extras, ...this.commuters.map(c => c.h)]) h.dispose(); this.extras = []; this.commuters = []; this.group.removeFromParent(); }
}

/** The rain on the gare: mud over the dust, standing water in the dips, two cars sunk in it (they lean and settle), and the stuck car's own place. */
const STUCK = [2, 4], DIPS: [number, number, number][] = [[-12, -3, 2.9], [4, 12.5, 2.5], [-1, -17, 3.2], [14, 8, 2.2], [-15, 14, 2.6], [11, -9, 2.3], [-18, 3, 2.0], [8, -3, 1.8]];
class GareWeather {
  readonly group = new THREE.Group();
  private mud: THREE.MeshBasicMaterial; private pools: THREE.MeshBasicMaterial;
  private cars: { car: THREE.Object3D; y: number; rz: number; lean: number }[] = [];
  private placed: Interactable | null = null;
  constructor(cx: number, cz: number, private hub: { interactables: Interactable[]; rapides: THREE.Object3D[] }, private places: Interactable) {
    this.group.name = 'pikine-gare-rain';
    this.mud = new THREE.MeshBasicMaterial({ color: 0x4a3a2a, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.pools = new THREE.MeshBasicMaterial({ color: 0x8aa0ae, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const base = new THREE.PlaneGeometry(42, 38); base.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(base, this.mud); m.position.set(cx, 0.16, cz); m.renderOrder = 1; this.group.add(m);
    const parts = DIPS.map(([dx, dz, r]) => { const g = new THREE.CircleGeometry(r, 14); g.rotateX(-Math.PI / 2); g.scale(1, 1, 0.65); g.translate(cx + dx, 0.17, cz + dz); return g.toNonIndexed(); });
    const n = parts.reduce((t, g) => t + g.attributes.position.count, 0), pos = new Float32Array(n * 3); let o = 0;
    for (const g of parts) { pos.set(g.attributes.position.array as Float32Array, o); o += g.attributes.position.count * 3; g.dispose(); }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.Mesh(pg, this.pools); pm.renderOrder = 2; this.group.add(pm);
    this.cars = STUCK.filter(k => hub.rapides[k]).map((k, i) => ({ car: hub.rapides[k], y: hub.rapides[k].position.y, rz: hub.rapides[k].rotation.z, lean: i ? -0.06 : 0.055 }));
  }
  update(dt: number) {
    const wet = weatherNow.wet, sunk = Math.max(0, Math.min(1, (wet - 0.4) / 0.4));
    this.mud.opacity = 0.5 * wet; this.pools.opacity = 0.55 * wet; this.group.visible = wet > 0.02;
    for (const c of this.cars) { const f = Math.min(1, dt * 1.5); c.car.position.y += (c.y - 0.16 * sunk - c.car.position.y) * f; c.car.rotation.z += (c.rz + c.lean * sunk - c.car.rotation.z) * f; }
    const on = sunk > 0.5;                                                                  // the stuck car's place exists only while it is stuck
    if (on && !this.placed) { this.placed = this.places; this.hub.interactables.push(this.places); }
    else if (!on && this.placed) { const i = this.hub.interactables.indexOf(this.places); if (i >= 0) this.hub.interactables.splice(i, 1); this.placed = null; }
  }
  info() { return { wet: +this.mud.opacity.toFixed(2), sunk: this.cars.map(c => +(c.y - c.car.position.y).toFixed(2)), stuckPlace: !!this.placed }; }
  dispose() { const i = this.hub.interactables.indexOf(this.places); if (i >= 0) this.hub.interactables.splice(i, 1); this.mud.dispose(); this.pools.dispose(); this.group.traverse(o => { (o as THREE.Mesh).geometry?.dispose?.(); }); this.group.removeFromParent(); }
}
let rainView: GareWeather | null = null;
let crowd: GareCrowd | null = null;
let centre: { x: number; z: number } | null = null, nextNoise = 0, wasNear = false;
export const gareModule: GameModule = {
  name: 'pikine-gare',
  hubLoaded(ctx, hub) {
    rainView?.dispose(); rainView = null; crowd?.dispose(); crowd = null; centre = null; nextNoise = 0; wasNear = false;
    if (hub.id !== 'pikine') return;
    const st = hub.interactables.find(i => i.id === 'pikine:station'); if (!st) return;
    centre = { x: st.x + 3, z: st.z - 3.2 };
    const mosque = (hub.sites ?? []).find(x => x.key === 'mosque:33');
    crowd = new GareCrowd(centre.x, centre.z, mosque ? { x: (mosque.x0 + mosque.x1) / 2, z: mosque.z0 + 7 } : null); ctx.extra.add(crowd.group);
    const acts = gareActions(() => ctx.state, () => ctx.hour());
    hub.interactables.push(...placesAt(centre.x, centre.z, acts));
    rainView = new GareWeather(centre.x, centre.z, hub, { id: 'pikine:gare:embourbe', name: 'Car embourbé', kind: 'actions', x: centre.x - 5.4, z: centre.z - 9.8, radius: 3.4, actions: acts.embourbe, description: 'Un car enlisé dans la boue : tout le monde s’y met.' });
    ctx.extra.add(rainView.group);
  },
  debug: () => ({ gareCrowd: () => crowd?.info() ?? null, gareRain: () => rainView?.info() ?? null }),
  update(ctx, dt) {
    crowd?.update(ctx, dt); rainView?.update(dt);
    if (!centre || ctx.world()?.id !== 'pikine' || ctx.mode() !== 'play' || ctx.space() !== 'street') return;
    const d = Math.hypot(ctx.player.pos.x - centre.x, ctx.player.pos.z - centre.z), near = d < 13, t = ctx.now() / 1000;
    if (near && !wasNear) nextNoise = t + 1.5;                       // the din greets you on arrival, then comes and goes
    wasNear = near;
    if (near && t >= nextNoise) { ctx.toast(pick(weatherNow.rain > 0.2 || weatherNow.wet > 0.5 ? RAIN_NOISE : NOISE)); nextNoise = t + 30 + Math.random() * 25; }
  },
};
