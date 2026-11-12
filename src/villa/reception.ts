import * as THREE from 'three';
import type { GameCtx } from '../game/modules';
import type { Affordance, Target } from '../interact/types';
import * as P from '../activity/primitives';
import { Batch } from '../world/batch';
import { Crowd, type CrowdSlot } from '../crowd/crowd';
import { VagueMusic } from '../venues/vagueMusic';
import { isMuted } from '../core/audioSettings';
import { fcfa } from '../ui/hud';
import type { VillaHold } from './gate';

/**
 * LD2.0-D lane V-E: « Organiser une petite réception » at the villa (docs/ld2/LD2_D.md, decision 9).
 *
 *  - For the villa's owner (or its renter: whoever lives there), in their own villa: in the salon or on the pool terrace.
 *  - The price first (150 000 F of food and drinks: ceebu jën, bissap, thiakry), paid once through the activity runner like any purchase, so it is
 *    written in the wallet's history (src/core/state.ts addMoney, LD2.0-A's accounts); once per city day.
 *  - About eight guests, neighbours and friends: the reusable instanced crowd (src/crowd/crowd.ts), some chatting in small groups, some dancing to
 *    the music; a buffet with the dishes. On the pool terrace when the villa's interior has its garden (lane V-S's three levels), in the salon of
 *    the open-plan house otherwise.
 *  - It lasts two city hours (two real minutes) and ends by itself, wherever the player is then. Moral and social go up when the guests arrive and
 *    again when the evening ends. It survives a reload: the save's counters hold its day and its start (city hours).
 * The rules are pure (unit-tested); `VillaReception` plays them in the game (src/villa/module.ts).
 */
export const RECEPTION = {
  price: 150_000, hours: 2, guests: 8,
  menu: ['ceebu jën', 'bissap', 'thiakry'] as const,
  /** When the guests arrive, and when the evening ends. */
  arrive: { moral: 10, social: 15 }, close: { moral: 10, social: 12 },
} as const;
/** The save's counters: the city day of the last reception, and when the one running started (city hours; −1: none running). */
export const RECEPTION_DAY = 'villa:reception:jour', RECEPTION_AT = 'villa:reception:debut';
/** City time in hours since day 0. */
export const cityHours = (day: number, hour: number) => day * 24 + hour;

export interface HostFacts { hold: VillaHold; own: boolean; wallet: number; day: number; lastDay: number | undefined; running: boolean }
/** Why the reception cannot be given now (greyed with it), null when it can; undefined: not offered (not the player's own villa). */
export function receptionWhy(f: HostFacts): string | null | undefined {
  if (!f.own || (f.hold !== 'owned' && f.hold !== 'rented')) return undefined;
  if (f.running) return 'La réception bat son plein';
  if (f.lastDay === f.day) return 'Une réception par jour · reviens demain';
  if (f.wallet < RECEPTION.price) return 'Pas assez d’argent';
  return null;
}
/** City hours left of a reception started at `at` (city hours), now `now`; ≤ 0 when it is over. */
export const receptionLeft = (at: number, now: number) => (at < 0 ? 0 : at + RECEPTION.hours - now);
/** A reception is running at `now`. */
export const receptionOn = (at: number | undefined, now: number) => at !== undefined && at >= 0 && receptionLeft(at, now) > 0;

export type ReceptionPlace = 'terrasse' | 'salon';
const PLACES: readonly ReceptionPlace[] = ['salon', 'terrasse'];
/** The anchors where it is offered (plan coordinates of the ground floor): the salon and the pool terrace. */
export const RECEPTION_ANCHORS: Record<ReceptionPlace, { x: number; z: number; name: string }> = {
  salon: { x: 0, z: -1, name: 'Le salon' },
  terrasse: { x: 7, z: -7.5, name: 'La terrasse de la piscine' },
};
/**
 * The guests' places (plan coordinates): two groups of three chatting, facing each other, and two dancing by the music. On the terrace they stand on
 * the deck east of the pool (x 5…10.5); in the salon round its middle. Ids are stable (their looks follow).
 */
export function guestSpots(where: ReceptionPlace): { id: string; x: number; z: number; yaw: number; mood: 'chat' | 'dance' }[] {
  const g = (cx: number, cz: number, r: number, a0: number, n: number, tag: string) => Array.from({ length: n }, (_, k) => {
    const a = a0 + (k / n) * Math.PI * 2, x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
    return { id: `${tag}${k}`, x, z, yaw: Math.atan2(cx - x, cz - z), mood: 'chat' as const };
  });
  const [A, B, D] = where === 'terrasse' ? [[6.4, -6.25], [9.5, -6.4], [8.0, -10.0]] : [[-2.6, -1.6], [2.4, -2.4], [0.2, 1.6]];
  const dance = [{ id: 'd0', x: D[0] - 0.6, z: D[1], yaw: Math.PI / 2, mood: 'dance' as const }, { id: 'd1', x: D[0] + 0.6, z: D[1], yaw: -Math.PI / 2, mood: 'dance' as const }];
  return [...g(A[0], A[1], 0.75, 0.3, 3, 'a'), ...g(B[0], B[1], 0.75, 1.1, 3, 'b'), ...dance];
}
/** Where the buffet stands (plan coordinates, its long side along x). */
export const BUFFET: Record<ReceptionPlace, { x: number; z: number }> = { terrasse: { x: 9.6, z: -8.9 }, salon: { x: -4.6, z: 2.6 } };

// ------------------------------------------------------------------------------------------------ in the game
export class VillaReception {
  private crowd: Crowd | null = null;
  private buffet: THREE.Mesh | null = null;
  private music: VagueMusic | null = null;
  private where: ReceptionPlace = 'salon';
  private readonly targets: Record<ReceptionPlace, Target>;
  private readonly aff: Affordance[];
  /** For the checks: receptions given and ended, the guests shown, where. */
  readonly log = { given: 0, ended: 0, guests: 0, where: '' as string, level: 0 };

  constructor(private ctx: GameCtx, private room: THREE.Group, private hold: () => VillaHold, private origin: () => { x: number; z: number } | null, private tiered: () => boolean) {
    this.aff = [{ id: 'reception', verb: 'invite', label: 'Organiser une petite réception', icon: '🎉', run: () => this.ask() }];
    // right at its anchor it wins over a piece of furniture standing there; a step away the furniture's own actions come first
    const t = (k: ReceptionPlace): Target => ({ id: `villa:reception:${k}`, name: RECEPTION_ANCHORS[k].name, kind: 'spot', space: 'home', x: 0, z: 0, y: 1.2, radius: 1.6, bias: -0.6, affordances: () => this.affordances() });
    this.targets = { salon: t('salon'), terrasse: t('terrasse') };
  }
  private get c() { return this.ctx.state.data.counters; }
  private now() { return cityHours(this.ctx.day(), this.ctx.hour()); }
  get running() { return receptionOn(this.c[RECEPTION_AT], this.now()); }
  private why() {
    const s = this.ctx.state;
    return receptionWhy({ hold: this.hold(), own: !!this.origin(), wallet: s.wallet, day: this.ctx.day(), lastDay: this.c[RECEPTION_DAY], running: this.running });
  }
  private affordances(): Affordance[] {
    const a = this.aff[0], why = this.why();
    a.disabled = why ?? null;
    a.cost = RECEPTION.price;
    a.detail = why ? undefined : `${RECEPTION.guests} invités, deux heures · ceebu jën, bissap, thiakry`;
    return this.aff;
  }

  collect(space: string, x: number, z: number, out: Target[]) {
    const o = this.origin(); if (space !== 'home' || !o || this.running || this.ctx.player.pos.y > 1.2 || this.ctx.player.seated() || this.why() === undefined) return;   // (while it runs, the room is the guests')
    for (const k of PLACES) {
      if (k === 'terrasse' && !this.tiered()) continue;
      const a = RECEPTION_ANCHORS[k], t = this.targets[k];
      t.x = o.x + a.x; t.z = o.z + a.z;
      if (Math.hypot(t.x - x, t.z - z) <= t.radius + 1) out.push(t);
    }
  }

  /** The price first, then the one confirmation. */
  ask() {
    const ctx = this.ctx, why = this.why(); if (why !== null) { if (why) ctx.toast(why); return; }
    const price = RECEPTION.price, left = ctx.state.wallet - price;
    const rows = [['Au menu', 'ceebu jën, bissap, thiakry'], ['Invités', `${RECEPTION.guests} voisins et amis, deux heures`], ['Il te restera', fcfa(left)]];
    const html = `<div class="est-rows">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;   // (the estate's compact rows)
    ctx.menu('Petite réception', 'Chez toi, à la villa · vérifie avant de confirmer :', [
      { icon: '🎉', label: 'Payer la réception', right: '−' + fcfa(price), detail: 'Moral et vie sociale en hausse · une par jour', onPick: () => {
        ctx.hud.closeModal(); ctx.setMode('play');
        ctx.activities.start(P.buy({ id: 'villa_reception', label: 'Petite réception', price, seconds: 0.5, then: () => this.begin() }), { place: 'Villa · Almadies' });
      } },
      { icon: '↩️', label: 'Annuler', onPick: () => { ctx.hud.closeModal(); ctx.setMode('play'); } },
    ], html);
  }

  /** Paid: the evening begins now. */
  begin() {
    const ctx = this.ctx;
    this.c[RECEPTION_DAY] = ctx.day(); this.c[RECEPTION_AT] = this.now();
    ctx.state.adjust(RECEPTION.arrive);
    ctx.state.count('receptions');
    this.log.given++;
    this.show();
    ctx.toast('Les invités arrivent : ceebu jën, bissap et thiakry sur la table. Bonne soirée !');
    ctx.save();
  }

  private end() {
    const ctx = this.ctx;
    this.c[RECEPTION_AT] = -1;
    ctx.state.adjust(RECEPTION.close);
    this.hide();
    this.log.ended++;
    ctx.toast(`La réception est finie : tes invités te remercient. Moral +${RECEPTION.close.moral}, vie sociale +${RECEPTION.close.social}.`);
    ctx.save();
  }

  /** Every frame, in any district: the evening ends by itself; in the villa the guests are drawn and the music plays. */
  update(dt: number, inVilla: boolean) {
    const at = this.c[RECEPTION_AT];
    if (at === undefined || at < 0) { if (this.music) this.music.update(dt, 0); return; }
    if (receptionLeft(at, this.now()) <= 0) { this.end(); return; }
    if (inVilla && !this.crowd) this.show();
    if (this.crowd) {
      this.crowd.group.visible = inVilla;
      if (this.buffet) this.buffet.visible = inVilla;
      if (inVilla) { this.crowd.setCamera(this.ctx.camera); this.crowd.update(dt, true); }
    }
    const level = inVilla && !isMuted() ? 0.55 : 0;
    this.log.level = level;
    if (level > 0 && !this.music) { this.music = new VagueMusic(); this.music.prefetch(); }
    this.music?.update(dt, level, 0.15, 0);
  }

  /** The guests and the buffet where the reception is (the terrace in a three-level villa, else the salon). */
  private show() {
    const o = this.origin(); if (!o) return;
    this.hide();
    const where: ReceptionPlace = this.tiered() ? 'terrasse' : 'salon';
    this.where = where; this.log.where = where;
    const spots = guestSpots(where);
    const slots: CrowdSlot[] = spots.map(p => ({ id: p.id, x: o.x + p.x, y: 0.1, z: o.z + p.z, yaw: p.yaw, seated: false, tags: [p.mood] }));
    // two full bodies at most near the camera (about ten draw calls each), the others the crowd's instanced figures (two draw calls for all of them)
    const q = this.ctx.quality(), c = this.crowd = new Crowd(slots, { quality: q, near: q === 'low' ? 0 : 2, name: 'villa-reception', seed: 400 + (this.ctx.day() % 50), fidget: 0.06, nearRadius: 14 });
    c.group.name = 'villa_reception_crowd';
    c.fill(slots.length);
    c.setMood('chat', 'chat'); c.setMood('dance', 'dance', 112);
    this.room.add(c.group);
    this.log.guests = c.present;
    // the buffet: a long table, its white cloth, the ceebu jën's big platter, bissap jugs, thiakry bowls, glasses
    const b = new Batch(), B = BUFFET[where], x = o.x + B.x, z = o.z + B.z, top = 0.1 + 0.76;
    b.box(2.2, 0.72, 0.8, x, 0.1, z, 0x6b4a2e);
    b.box(2.3, 0.05, 0.9, x, top - 0.05, z, 0xf6f3ec);
    b.cyl(0.36, 0.3, 0.06, x - 0.55, top, z, 0xd9d2c4, 16); b.cyl(0.31, 0.31, 0.05, x - 0.55, top + 0.04, z, 0xd4632e, 16);   // the platter of ceebu jën
    for (const [dx, dz] of [[-0.62, -0.08], [-0.45, 0.1]]) b.box(0.18, 0.05, 0.08, x + dx, top + 0.08, z + dz, 0x8a5a3c);          // the fish
    for (const dx of [0.1, 0.32]) { b.cyl(0.07, 0.08, 0.24, x + dx, top, z - 0.18, 0xe9e4da, 10); b.cyl(0.062, 0.062, 0.18, x + dx, top + 0.01, z - 0.18, 0x8e1630, 10); }   // bissap
    for (const dx of [0.62, 0.86]) b.sphere(0.11, x + dx, top + 0.03, z + 0.08, 0xf7f2e4, true);                                // thiakry
    for (let k = 0; k < 6; k++) b.cyl(0.035, 0.03, 0.1, x + 0.05 + k * 0.13, top, z + 0.26, k % 2 ? 0x8e1630 : 0xf1ede4, 8);   // glasses
    this.buffet = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }), true, true);
    if (this.buffet) { this.buffet.name = 'villa_reception_buffet'; this.room.add(this.buffet); }
  }
  private hide() {
    if (this.crowd) { this.crowd.dispose(); this.crowd.group.removeFromParent(); this.crowd = null; }
    if (this.buffet) { this.buffet.geometry.dispose(); (this.buffet.material as THREE.Material).dispose(); this.buffet.removeFromParent(); this.buffet = null; }
  }
  /** The hub is being rebuilt: drawn again when the player is back in the villa. */
  reset() { this.hide(); }
  info() {
    const at = this.c[RECEPTION_AT];
    return { running: this.running, at: at ?? null, day: this.c[RECEPTION_DAY] ?? null, left: at !== undefined && at >= 0 ? Math.round(receptionLeft(at, this.now()) * 100) / 100 : 0, where: this.where, drawn: !!this.crowd, draws: this.crowd?.drawCalls() ?? 0, log: { ...this.log } };
  }
}
