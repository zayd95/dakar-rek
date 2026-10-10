import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { Action, HubWorld, Interactable } from '../world/types';
import { ACTIONS, HUB_NAMES } from '../world/content';
import { Character } from '../actors/character';
import { Humanoid, humanoidReady, type Clip, type PersonLook } from '../actors/humanoid';
import { fcfa, type Hud, type MenuItem } from '../ui/hud';
import { phoneHooks } from '../ui/phoneHooks';
import { CAST, castById, type CastMember } from './cast';
import { Relations } from './relations';
import { BEATS, type Beat } from './beats';
import { PROFILES, profileOf, type Perk, type Profile } from './profiles';
import { ROUTINES, currentPlan, planPath, poseFor, resolvePlace, slotAt, pathLength, collidersClear, type Activity, type ClearFn, type PlaceSpec, type Routine, type Spot } from './routines';
import { greeting, hourStamp, introduction, applyIntroduction, isRegular, lastMemory, recordService, recordVisit, updateRegular, familiarity, REGULAR_AT } from './memory';
import { SITUATIONS, choicesFor, favourFor, playSituation, sitCtx, situationFor, type Situation } from './situations';
import { pick, quote, wo } from '../i18n/wolof';

/**
 * Recurring cast in the street: daily routines, walking on the sidewalks, poses at their places, recognition and
 * situations. Runtime side of src/social/{profiles,routines,memory,situations}.ts. Local to this device, like the crowd.
 * Wolof in their lines comes from src/i18n/wolof.ts.
 */
export interface LifeCtx {
  hud: Hud; rel: Relations; state: GameState;
  /** Shared city clock, or the debug hour override. */
  clock(): { hour: number; day: number };
  /** Called before opening a menu (pauses the player). */
  menuMode(): void;
  save(): void;
  openBeat(b: Beat): void;
}
type Pt = { x: number; z: number };
interface Npc {
  id: string; m: CastMember; p: Profile; r: Routine;
  body: { group: THREE.Group; animate(dt: number, speed: number): void }; h?: Humanoid;
  it: Interactable;
  x: number; z: number; yaw: number;
  key: string; act: Activity; place: PlaceSpec; spot: Spot;
  path: Pt[]; seg: number; walking: boolean; paused: boolean;
  look: string; clip: Clip | 'Walk';
}

const CHAT: Action = { id: 'discuter', label: 'Discuter', detail: 'Prendre des nouvelles', needs: { social: 8, moral: 2 }, seconds: 2.5, counter: 'chats' };
/** Each person has their own way of asking for news (a seeded Wolof question: « Lu bees ? », « Ana waa kër gi ? »…). */
const chatWith = (id: string): Action[] => [{ ...CHAT, detail: `${quote(pick('news', id).wo)} · Prendre des nouvelles` }];
/** Height correction for the Sit clip on a 0.57 m seat (kiosk benches, city benches, stools): feet on the ground,
 * hips just above the seat. From the clip's bone heights (hips 0.50, ankle 0.03) and checked in captures. */
export const SIT_Y = 0.05;
const SPEED = 1.35, FAR = 45, TALK_R = 3.4, STOP_R = 2.2;
const stoolMat = new THREE.MeshLambertMaterial({ color: 0x8c6542 });
const stoolGeo = (() => {
  const seat = new THREE.BoxGeometry(0.42, 0.06, 0.42); seat.translate(0, 0.54, 0);
  const legs = [-0.16, 0.16].flatMap(x => [-0.16, 0.16].map(z => { const g = new THREE.BoxGeometry(0.05, 0.42, 0.05); g.translate(x, 0.33, z); return g; }));
  const merged = new THREE.BufferGeometry();
  const geos = [seat, ...legs], pos: number[] = [], nor: number[] = [], idx: number[] = [];
  let off = 0;
  for (const g of geos) {
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let k = 0; k < p.length; k++) { pos.push(p[k]); nor.push(n[k]); }
    for (const i of g.index!.array) idx.push(i + off);
    off += g.attributes.position.count;
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); merged.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); merged.setIndex(idx);
  return merged;
})();
const esc = (t: string) => t.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]!));

export class NpcLife {
  readonly group = new THREE.Group();
  private npcs: Npc[] = [];
  private world: HubWorld | null = null;
  private props = new THREE.Group();

  constructor(private ctx: LifeCtx) {
    phoneHooks.openPeople = () => this.openPeople();
    this.group.name = 'npc_life';
  }

  // ------------------------------------------------------------------ hub load
  load(world: HubWorld, parent: THREE.Object3D) {
    for (const n of this.npcs) n.h?.dispose();
    this.npcs = []; this.group.clear(); this.props.clear();
    this.world = world; this.clear = this.makeClear();          // new function: new sidewalk cache for this hub
    parent.add(this.group); this.group.add(this.props);
    const { hour } = this.ctx.clock();
    for (const m of CAST.filter(c => c.hub === world.id)) {
      const p = profileOf(m.id), r = ROUTINES.find(x => x.id === m.id);
      if (!p || !r) continue;
      const h = humanoidReady() ? new Humanoid(p.looks.base) : undefined;
      const body = h ?? new Character(m.outfit);
      this.group.add(body.group);
      const it: Interactable = { id: 'npc:' + m.id, name: `${m.name} · ${m.title}`, kind: 'actions', x: 0, z: 0, radius: 3.2, actions: p.menu === 'ibou' ? ACTIONS.ibou : chatWith(m.id), npc: m.id };
      world.interactables.push(it);
      const n: Npc = { id: m.id, m, p, r, body, h, it, x: 0, z: 0, yaw: 0, key: '', act: 'wait', place: r.slots[0].place, spot: { x: 0, z: 0, yaw: 0, sit: false, stool: false, approach: [] }, path: [], seg: 0, walking: false, paused: false, look: 'base', clip: 'Idle' };
      this.npcs.push(n);
      this.retarget(n, hour, true);
    }
    // Stools where a routine seats someone without a builder seat (attaya on the grand-place, Maïga, behind the counter).
    const seen = new Set<string>();
    for (const r of ROUTINES.filter(x => x.hub === world.id)) for (const pl of [...r.slots.map(s => s.place), ...(r.waitsFor ? [r.waitsFor.place] : [])]) {
      if (!pl.stool) continue;
      const s = resolvePlace(pl, world.interactables); if (!s) continue;
      const k = `${s.x.toFixed(1)},${s.z.toFixed(1)}`; if (seen.has(k)) continue; seen.add(k);
      const stool = new THREE.Mesh(stoolGeo, stoolMat); stool.position.set(s.x, 0, s.z); stool.castShadow = true; this.props.add(stool);
    }
    // Regular perks and goods at their places (copies: action lists can be shared between hubs).
    for (const p of PROFILES) {
      const extra: Perk[] = [...(p.sells ?? []), ...(p.perk ? [p.perk] : [])];
      if (!extra.length) continue;
      const target = (p.place && world.interactables.find(i => i.id.startsWith(p.place!))) || world.interactables.find(i => i.npc === p.id);
      if (!target) continue;
      target.actions = [...target.actions, ...extra.map(k => ({
        id: k.id, label: k.label, detail: k.detail, cost: k.cost, needs: k.needs, seconds: k.seconds, counter: k.counter,
        visible: k.flags.length ? (s: GameState) => k.flags.some(f => s.data.flags.includes(f)) : undefined,
      }))];
    }
  }

  setVisible(on: boolean) { this.group.visible = on; }

  // ------------------------------------------------------------------ per frame
  update(dt: number, player: Pt, viewer: Pt = player) {
    if (!this.world) return;
    const { hour } = this.ctx.clock();
    for (const n of this.npcs) {
      const plan = currentPlan(n.r, hour, id => id in this.ctx.state.data.beats);
      if (plan.key !== n.key) this.retarget(n, hour, false);
      let speed = 0;
      const dP = Math.hypot(player.x - n.x, player.z - n.z);
      if (n.walking) {
        n.paused = dP < STOP_R && this.group.visible;
        if (n.paused) { n.yaw = Math.atan2(player.x - n.x, player.z - n.z); n.clip = 'Talk'; }
        else {
          // Out of sight, people get on with their day: skip ahead until close to the player or arrived.
          let budget = 600;
          while (n.walking && budget > 0 && Math.hypot(player.x - n.x, player.z - n.z) > FAR) { this.advance(n, 2); budget -= 2; }
          if (n.walking) { this.advance(n, SPEED * dt); speed = SPEED; n.clip = 'Walk'; }
        }
      }
      if (!n.walking) {
        n.x = n.spot.x; n.z = n.spot.z;
        const partner = this.npcs.find(o => o !== n && !o.walking && Math.hypot(o.x - n.x, o.z - n.z) < 2.6);
        const talking = dP < TALK_R ? 'player' : partner ? 'npc' : null;
        n.clip = poseFor(n.act, n.spot.sit, talking);
        if (n.spot.sit) n.yaw = n.spot.yaw;
        else if (dP < 9) n.yaw = Math.atan2(player.x - n.x, player.z - n.z);
        else if (partner) n.yaw = Math.atan2(partner.x - n.x, partner.z - n.z);
        else n.yaw = n.spot.yaw;
      }
      const seated = !n.walking && n.spot.sit;
      n.body.group.position.set(n.x, 0.1 + (seated ? SIT_Y : 0) + (this.world.heightAt(n.x, n.z) || 0), n.z);
      n.body.group.rotation.y = n.yaw;
      n.it.x = n.x; n.it.z = n.z;
      const far = Math.hypot(viewer.x - n.x, viewer.z - n.z) > 110;    // not drawn nor animated far from the camera
      n.body.group.visible = !far;
      if (far) continue;
      if (n.h) n.h.hold = n.clip === 'Walk' ? null : n.clip;
      n.body.animate(dt, speed);
    }
  }

  private advance(n: Npc, step: number) {
    while (step > 0 && n.walking) {
      const a = n.path[n.seg], b = n.path[n.seg + 1];
      if (!b) { n.walking = false; break; }
      const dx = b.x - n.x, dz = b.z - n.z, d = Math.hypot(dx, dz);
      if (d <= step) { n.x = b.x; n.z = b.z; n.seg++; step -= d; if (n.seg >= n.path.length - 1) n.walking = false; }
      else { n.x += (dx / d) * step; n.z += (dz / d) * step; step = 0; }
      if (d > 0.01) n.yaw = Math.atan2(dx, dz);
      void a;
    }
  }

  private retarget(n: Npc, hour: number, snap: boolean) {
    const plan = currentPlan(n.r, hour, id => id in this.ctx.state.data.beats);
    const spot = resolvePlace(plan.place, this.world!.interactables)
      ?? { x: (this.world!.interactables.find(i => i.id.includes(':' + n.m.anchor))?.x ?? 0) + n.m.ox, z: (this.world!.interactables.find(i => i.id.includes(':' + n.m.anchor))?.z ?? 0) + n.m.oz, yaw: 0, sit: false, stool: false, approach: [] };
    const from = n.walking ? { x: n.x, z: n.z } : n.spot;
    n.key = plan.key; n.act = plan.act; n.place = plan.place;
    if (snap) { n.spot = spot; n.x = spot.x; n.z = spot.z; n.yaw = spot.yaw; n.walking = false; }
    else {
      n.path = planPath(from, spot, this.clear);
      n.spot = spot; n.seg = 0; n.walking = n.path.length > 1;
      if (n.walking) { n.x = n.path[0].x; n.z = n.path[0].z; }
    }
    const lk = n.act === 'train' && n.p.looks.train ? 'train' : hour >= 18 && n.p.looks.evening ? 'evening' : (n.act === 'work' || n.act === 'serve') && n.p.looks.work ? 'work' : 'base';
    if (lk !== n.look) { n.look = lk; n.h?.setLook((n.p.looks as Record<string, PersonLook>)[lk]); }
  }

  /** Straight segment clear of the hub's solid objects (those containing an end point are the place itself: bench, counter). */
  clear = this.makeClear();
  private makeClear(): ClearFn { return collidersClear(this.world?.colliders ?? []); }

  // ------------------------------------------------------------------ talking
  private npc(id: string) { return this.npcs.find(n => n.id === id); }
  private hostAt = (host: string) => { const n = this.npc(host); return n && !n.walking ? n.place.at : null; };
  private presentAt(at: string) { return new Set(this.npcs.filter(n => !n.walking && n.place.at === at).map(n => n.id)); }

  /** Greeting line for the NPC menu; counts the visit (once per city hour) and notices a new regular. */
  greet(id: string): string {
    const p = profileOf(id); if (!p) return '';
    const { hour, day } = this.ctx.clock(), s = this.ctx.state, r = this.ctx.rel;
    const counted = recordVisit(s, id, hourStamp(day, hour));
    const line = greeting(p, { id, s, r, hour, act: this.npc(id)?.act });
    if (counted && line.effect?.needs) s.adjust(line.effect.needs);
    if (updateRegular(s, r, id)) this.ctx.hud.toast(`${castById(id)?.name ?? id} te reconnaît : tu es un habitué ▲`);
    return line.line;
  }

  /** Extra menu entries for an NPC: today's situation, a favour owed, an introduction. Inserted after the story beat. */
  menuItems(id: string): (MenuItem & { detail: string; right: undefined; disabled: boolean })[] {
    const items: (MenuItem & { detail: string; right: undefined; disabled: boolean })[] = [];
    const { hour, day } = this.ctx.clock(), s = this.ctx.state, r = this.ctx.rel, p = profileOf(id);
    const sit = situationFor(id, hour, this.hostAt, s, day);
    if (sit) items.push({ label: '★ ' + sit.title, detail: sit.detail, right: undefined, disabled: false, onPick: () => this.openSituation(sit) });
    const fav = favourFor(id, r);
    if (fav) items.push({ label: '★ ' + fav.label, detail: fav.detail, right: undefined, disabled: false, onPick: () => { const reply = fav.apply(r, s); this.reply(castById(id)!.name, reply); } });
    const intro = p ? introduction(p, { id, s, r, hour, act: this.npc(id)?.act }) : null;
    if (p && intro) items.push({
      label: `★ Être présenté à ${castById(intro.to)?.name}`, detail: 'Une connaissance de ' + castById(id)?.name, right: undefined, disabled: false,
      onPick: () => { applyIntroduction(p, intro, s, r); this.reply(castById(id)!.name, intro.line, `${castById(id)?.name} te présente à ${castById(intro.to)?.name}`); },
    });
    return items;
  }

  /** A service bought or done at someone's place (or with them) is remembered. */
  afterAction(a: Action, it: Interactable | null) {
    if (!it) return;
    const owner = it.npc ?? PROFILES.find(p => p.place && it.id.startsWith(p.place))?.id;
    if (!owner) return;
    recordService(this.ctx.state, owner);
    if (updateRegular(this.ctx.state, this.ctx.rel, owner)) this.ctx.hud.toast(`${castById(owner)?.name} te reconnaît : tu es un habitué ▲`);
    void a;
  }

  private reply(title: string, text: string, toast?: string) {
    this.ctx.menuMode();
    this.ctx.hud.openMenu(title, text, [{ label: 'Continuer', onPick: () => this.ctx.hud.closeModal() }]);
    if (toast) this.ctx.hud.toast(toast);
    this.ctx.save();
  }

  openSituation(sit: Situation) {
    const { day } = this.ctx.clock(), s = this.ctx.state;
    const x = sitCtx(sit, this.ctx.rel, s, this.presentAt(sit.at), day);
    this.ctx.menuMode();
    this.ctx.hud.openMenu(sit.title, sit.text(x), choicesFor(sit, x).map(c => {
      const cost = -(c.effects.money ?? 0);
      return {
        label: c.label, right: cost > 0 ? '−' + fcfa(cost) : undefined, disabled: cost > 0 && !s.canAfford(cost),
        detail: cost > 0 && !s.canAfford(cost) ? 'Pas assez d’argent' : undefined,
        onPick: () => {
          const res = playSituation(sit, c, x);
          this.reply(sit.title, res.reply);
          if (res.notes.length) this.ctx.hud.toast(res.notes.join('  '));
        },
      };
    }));
  }

  // ------------------------------------------------------------------ People app and debug
  /** Where someone is now, by their routine (and walking state when they are in this hub). */
  whereNow(id: string): string {
    const r = ROUTINES.find(x => x.id === id), m = castById(id); if (!r || !m) return '';
    const n = this.npc(id), { hour } = this.ctx.clock();
    const plan = currentPlan(r, hour, b => b in this.ctx.state.data.beats);
    const here = this.world?.id === m.hub;
    const what = n?.walking ? `en chemin : ${plan.place.label}` : plan.place.label;
    return here ? what : `${HUB_NAMES[m.hub]} — ${what}`;
  }

  known(): CastMember[] {
    const s = this.ctx.state, r = this.ctx.rel;
    return CAST.filter(c => r.level(c.id) !== 0 || BEATS.some(b => b.npc === c.id && r.beatDone(b.id)) || familiarity(s, c.id) > 0)
      .sort((a, b) => r.level(b.id) - r.level(a.id));
  }

  openPeople() {
    const people = this.known(), r = this.ctx.rel;
    this.ctx.menuMode();
    this.ctx.hud.openMenu('Les gens du quartier', people.length ? 'Où les trouver maintenant, et ce qu’ils retiennent de toi.' : 'Tu ne connais encore personne. Va saluer Tonton Ibou, devant ta chambre.', people.map(c => ({
      label: c.name, detail: `${c.title} · ${this.whereNow(c.id)} · ${Relations.label(r.level(c.id))}`,
      onPick: () => this.openSheet(c.id),
    })));
  }

  openSheet(id: string) {
    const p = profileOf(id), c = castById(id); if (!p || !c) return;
    const s = this.ctx.state, r = this.ctx.rel, lv = r.level(id);
    const mem = lastMemory(id, s, r, this.ctx.clock().hour);
    const html = `<div class="kv"><b>${esc(p.job)}</b><br>${esc(p.hours)}<br>Maintenant : ${esc(this.whereNow(id))}<br>Relation : ${Relations.label(lv)} (${lv > 0 ? '+' : ''}${Math.round(lv)})<br>Dernier souvenir : ${esc(mem ?? 'rien de particulier pour l’instant')}${isRegular(s, id) ? '<br>Tu es un habitué.' : `<br>Passages : ${familiarity(s, id)}/${REGULAR_AT} pour devenir un habitué`}</div>
      <h3>À savoir</h3><div class="kv">${esc(p.ambition)}<br>${esc(p.difficulty)}</div>
      <h3>Sa façon de parler</h3><div class="kv">${esc(p.languages)}. ${esc(p.speech)}<br>${p.expressions.map(e => esc(wo(`« ${e.wo} »`, e.fr))).join(' · ')}</div>`;
    this.ctx.menuMode();
    this.ctx.hud.openMenu(c.name, c.title, [{ label: 'Retour', onPick: () => this.openPeople() }], html);
  }

  where(id: string) {
    const n = this.npc(id), c = castById(id);
    if (!n) return c ? { id, hub: c.hub, here: false, place: this.whereNow(id) } : null;
    return { id, hub: c!.hub, here: true, x: +n.x.toFixed(2), z: +n.z.toFixed(2), y: +n.body.group.position.y.toFixed(3), yaw: +n.yaw.toFixed(2), act: n.act, clip: n.h?.clipName ?? n.clip, walking: n.walking, paused: n.paused, sit: n.spot.sit && !n.walking, key: n.key, place: n.place.label, target: { x: n.spot.x, z: n.spot.z }, left: n.walking ? +pathLength(n.path.slice(n.seg + 1)).toFixed(1) : 0, it: { x: n.it.x, z: n.it.z } };
  }
  sheet(id: string) {
    const p = profileOf(id), r = ROUTINES.find(x => x.id === id); if (!p || !r) return null;
    const s = this.ctx.state;
    return { ...p, routine: r.slots.map(sl => `${sl.from}h–${sl.to}h ${sl.act} · ${sl.place.label}`), visits: s.data.counters[`visit_${id}`] ?? 0, served: s.data.counters[`served_${id}`] ?? 0, regular: isRegular(s, id), lastMemory: lastMemory(id, s, this.ctx.rel), relation: this.ctx.rel.level(id), situations: SITUATIONS.filter(x => x.host === id || x.with.includes(id)).map(x => x.id) };
  }
  /** Snap everyone walking to their destination (debug, captures). */
  settle() { for (const n of this.npcs) if (n.walking) { n.walking = false; n.x = n.spot.x; n.z = n.spot.z; } }
  /** Debug audit: every slot change of every routine in this hub plans a clear sidewalk path to a resolvable place. */
  audit() {
    const out: { id: string; from: string; to: string; ok: boolean; len: number; bad?: Pt[] }[] = [];
    if (!this.world) return out;
    const w = this.world;
    for (const r of ROUTINES.filter(x => x.hub === w.id)) {
      const seq = [...(r.waitsFor ? [r.waitsFor.place] : []), ...r.slots.map(s => s.place)];
      for (let k = 1; k < seq.length; k++) {
        const a = resolvePlace(seq[k - 1], w.interactables), b = resolvePlace(seq[k], w.interactables);
        if (!a || !b) { out.push({ id: r.id, from: seq[k - 1].label, to: seq[k].label, ok: false, len: 0 }); continue; }
        const path = planPath(a, b, this.clear), bad: Pt[] = [];
        for (let i = 1; i < path.length; i++) if (!this.clear(path[i - 1], path[i])) bad.push(path[i - 1], path[i]);
        out.push({ id: r.id, from: seq[k - 1].label, to: seq[k].label, ok: !bad.length, len: Math.round(pathLength(path)), ...(bad.length ? { bad } : {}) });
      }
    }
    return out;
  }
  slotsAt(hour: number) { return ROUTINES.map(r => ({ id: r.id, hub: r.hub, ...slotAt(r, hour) })); }
}
