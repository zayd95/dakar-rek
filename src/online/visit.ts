import type { GameCtx, GameModule } from '../game/modules';
import type { HubId, Placement } from '../core/types';
import type { GameState } from '../core/state';
import type { HubWorld } from '../world/types';
import type { Affordance, Target } from '../interact/types';
import { online, onlineHooks, setOnline, type OnlineApi } from './api';
import type { GuestPerms, HomeRef, HomeSnapshot, InviteItem, Tag } from './protocol';
import { buildSnapshot, inviteOver, openInvites, validSnapshot, type SnapshotCatalogue } from './visitRules';
import { estateVisit } from '../economy/estate';
import { assetsRevision, currentHome, furnitureIn, holds } from '../economy/assets';
import { furnitureSpec, homeByDoor, homeSpec } from '../economy/catalog';
import { hasGoodMattress } from '../economy/furniture';
import { phoneHooks } from '../ui/phoneHooks';

/**
 * LD2.0-B « Belong Online »: being invited into another player's home (docs/ld2/LD2_B_CONTRACT.md, « The world »). One module on the shared seam.
 *
 * - The host's side: `onlineHooks.homeToInvite` (the home the player lives in: the room at the family's, an apartment, a house, a villa) and
 *   `onlineHooks.homeSnapshot` (that home as the host's client draws it, src/online/visitRules.ts). Inside it, with the account known, the player's
 *   presence space is `home:<own tag>`, so the guests let in by the host's account see them (the legacy 'home' stays private).
 * - The guest's side: an accepted, unexpired invitation gives « Y aller » (the walking marker at the host's street door, directions from another district,
 *   the host's presence room) and, at that door, « Entrer chez <nom> (invité) ». Going in asks the account (`visit`); the home is then drawn from the
 *   snapshot by the estate (src/economy/estate.ts `estateVisit`) where the host's client draws it, read-only, and the presence space is `home:<host>`.
 *   Leaving by the door, a revocation (`onVisitEnd`) or the invitation ending puts the player back in the street and draws their own homes again.
 *   Nothing of the visit is ever written to the guest's save.
 */

/** What main.ts gives the visits (wired there): the presence room this client is in, and joining a room of a district (PresenceClient.join). */
export const visitDeps: {
  room?: () => number;
  joinRoom?: (hub: HubId, room: number) => void;
  /**
   * The host's home changed (furniture moved, an upgrade) while this player has invitations open: the account should be given the new snapshot
   * (the protocol's `home` message). Called with the new snapshot at most once a second; the API does not send it yet (integration).
   */
  snapshotChanged?: (snapshot: HomeSnapshot) => void;
} = {};

/** How another player reads the name of a home (the catalogue's names; the starter room is « Ta chambre » only for its own player). */
export function homeRefOf(specId: string): HomeRef | null {
  const sp = homeSpec(specId); if (!sp?.hub) return null;
  return { spec: sp.id, hub: sp.hub, door: sp.home.door, name: sp.home.level === 'room' ? 'Chambre familiale · Pikine' : sp.name };
}
/** The name of a home's street door in every client's world (the walking marker and the directions find it by it). */
export const doorName = (specId: string) => { const sp = homeSpec(specId); return !sp ? '' : sp.home.level === 'room' ? 'Ma chambre' : sp.name; };
/** The home the player lives in, as their client draws it now. Reads the save, never writes it. */
export function homeSnapshotOf(s: GameState, at: number): HomeSnapshot | null {
  const h = currentHome(s), ref = homeRefOf(h.spec); if (!ref) return null;
  const room = homeSpec(h.spec)!.home.level === 'room';
  const upgrades = [...h.upgrades, ...(room && hasGoodMattress(s, h.uid) ? ['matelas'] : [])];
  return buildSnapshot(ref, upgrades, furnitureIn(s, h.uid).map(f => ({ spec: f.spec, at: f.at ?? null, fixed: !!furnitureSpec(f.spec)?.fixed })), at);
}
/** This build's catalogue, for the snapshots a guest receives: a home with its own door, pieces of furniture it knows. */
export const CATALOGUE_CHECK: SnapshotCatalogue = {
  home: (spec, door) => homeSpec(spec)?.home.door === door,
  piece: spec => !!furnitureSpec(spec),
};

// ------------------------------------------------------------------ pins: named points for the walking marker
/**
 * The walking marker (main.ts `destination`) leads to an interactable of a district by its id. A shared position, or a host's door under the host's name
 * (every client's world names that door « Ma chambre » or after the listing), is a pin: an interactable of radius −1 (listed, never a target) added to its
 * district now if it is loaded, else when it is. One of each kind at a time.
 */
export interface Pin { kind: 'pos' | 'visit'; hub: HubId; name: string; x?: number; z?: number; door?: string }
const pins = new Map<Pin['kind'], Pin>();
export const pinId = (p: Pick<Pin, 'kind' | 'hub'>) => `${p.hub}:pin:${p.kind}`;
export function pinPlace(p: Pin, world: HubWorld | null): string {
  pins.set(p.kind, p);
  if (world?.id === p.hub) applyPin(world, p);
  return pinId(p);
}
function applyPin(w: HubWorld, p: Pin) {
  const id = pinId(p), i = w.interactables.findIndex(x => x.id === id);
  if (i >= 0) w.interactables.splice(i, 1);
  const door = p.door ? w.interactables.find(x => x.id === p.door) : null;
  const x = door ? door.x : p.x, z = door ? door.z : p.z;
  if (x === undefined || z === undefined) return;
  w.interactables.push({ id, name: p.name, kind: 'actions', x, z, radius: -1, actions: [] });
}

/** Marks a place (any district) with the walking marker, and directions to its district when it is another one. */
export function guideTo(ctx: GameCtx, id: string, hub: HubId, name: string, navName = name) {
  if (phoneHooks.markPlace) phoneHooks.markPlace(id, hub, name); else if (ctx.world()?.id === hub) ctx.walkTo(id);
  if (ctx.world()?.id !== hub) phoneHooks.driveTo?.(hub, navName);
  else ctx.toast(`Repère : ${name}`);
}

interface Visit { host: Tag; name: string; invite: string; perms: GuestPerms; door: string; hub: HubId; spec: string; since: number; inside: boolean; leaving: boolean }

class Visits implements GameModule {
  readonly name = 'visits';
  private ctx: GameCtx | null = null;
  private bound: OnlineApi | null = null;
  private unsub: (() => void)[] = [];
  /** This player's accepted invitations as a guest (read again on every change of the account and each second). */
  private invites: { host: Tag; name: string; item: InviteItem }[] = [];
  private tick = 0;
  private visit: Visit | null = null;
  private knocking = false;
  /** The host's own home as last sent (to tell the account when it changes), and the assets revision it was read at. */
  private lastSnap = ''; private snapRev = -1;
  /** A player to join in their presence room once this player is in their district (« Y aller » from another district). */
  private follow: { tag: Tag; hub: HubId; until: number } | null = null;
  private followT = 0;
  /** For the checks: how many times this client asked the account to come in, and the last refusal shown. */
  readonly log = { knocks: 0, entered: 0, ended: 0, refused: '' as string, joins: [] as { hub: HubId; room: number }[] };

  init(ctx: GameCtx) {
    this.ctx = ctx;
    onlineHooks.homeToInvite = () => homeRefOf(currentHome(ctx.state).spec);
    onlineHooks.homeSnapshot = () => homeSnapshotOf(ctx.state, ctx.now());
    onlineHooks.goToInvite = (host, inv) => this.goToInvite(host, inv);
    onlineHooks.visiting = () => this.visit?.host ?? null;
    ctx.interactions.add({ name: 'visit-door', collect: (space, x, z, out) => this.collect(space, x, z, out) });
  }

  hubLoaded(_ctx: GameCtx, hub: HubWorld) {
    // a visit never follows the player to another district (the same district built again, a quality change, puts the player back in the room)
    if (this.visit && this.visit.hub !== hub.id) this.end();
    for (const p of pins.values()) if (p.hub === hub.id) applyPin(hub, p);
    if (this.follow?.hub === hub.id) this.followT = 2.5;                 // once presence has joined the district
  }

  spaceChanged(_ctx: GameCtx, space: string) {
    if (!this.visit) return;
    if (space === 'street') this.end();
    else if (estateVisit.inside()?.visit) { this.visit.inside = true; this.log.entered++; }
  }

  /** In a host's home: `home:<host>`; in one's own home (the one guests are invited into), with the account known: `home:<own tag>`. */
  presenceSpace(ctx: GameCtx): string | null {
    const h = estateVisit.inside(); if (!h) return null;
    if (h.visit) return this.visit ? `home:${this.visit.host}` : null;
    const me = online?.me;
    return me && h.spec === currentHome(ctx.state).spec ? `home:${me.tag}` : null;
  }

  update(ctx: GameCtx, dt: number) {
    this.bind();
    this.tick -= dt;
    if (this.tick <= 0) { this.tick = 1; this.readInvites(ctx); this.watch(ctx); this.hostChanged(ctx); }
    if (this.followT > 0 && (this.followT -= dt) <= 0) void this.joinFollowed();
  }

  // ---------------------------------------------------------------- the account
  private bind() {
    if (online === this.bound) return;
    for (const u of this.unsub) u();
    this.unsub = []; this.bound = online; this.tick = 0;
    if (online) this.unsub.push(online.onChange(() => { this.tick = 0; }), online.onVisitEnd(host => { if (this.visit?.host === host) this.takeOut(`${this.visit.name} a mis fin à la visite.`); }));
  }
  private readInvites(ctx: GameCtx) {
    const api = online; this.invites = [];
    if (!api) return;
    const me = api.me?.tag ?? null, now = ctx.now();
    for (const c of api.convs()) {
      if (c.blocked || c.with === me) continue;
      for (const item of openInvites(api.items(c.with), c.with, now)) this.invites.push({ host: c.with, name: c.name, item });
    }
  }
  /** A visit in progress: the invitation still holds, the player did get in. */
  private watch(ctx: GameCtx) {
    const v = this.visit; if (!v || v.leaving) return;
    if (!estateVisit.inside()?.visit && performance.now() - v.since > 4000) { this.end(); return; }   // never got in, or left another way
    const api = online; if (!api) return;
    if (api.isBlocked(v.host)) { this.takeOut(`${v.name} a mis fin à la visite.`); return; }
    const inv = api.items(v.host).find(i => i.id === v.invite);
    if (inv?.k === 'invite' && inviteOver(inv, ctx.now())) this.takeOut(inv.state === 'revoked' ? `${v.name} a mis fin à la visite.` : `L’invitation chez ${v.name} a pris fin.`);
  }
  /** The host's home changed while invitations of theirs are open: the snapshot goes to `visitDeps.snapshotChanged`. */
  private hostChanged(ctx: GameCtx) {
    const rev = assetsRevision(); if (rev === this.snapRev) return;
    this.snapRev = rev;
    const snap = homeSnapshotOf(ctx.state, ctx.now()); if (!snap) return;
    const key = JSON.stringify({ ...snap, at: 0 }), changed = !!this.lastSnap && key !== this.lastSnap;
    this.lastSnap = key;
    if (changed && this.hostInvitesOpen(ctx)) visitDeps.snapshotChanged?.(snap);
  }
  private hostInvitesOpen(ctx: GameCtx) {
    const api = online, me = api?.me?.tag; if (!api || !me) return false;
    const now = ctx.now();
    return api.convs().some(c => api.items(c.with).some(i => i.k === 'invite' && i.from === me && (i.state === 'open' || i.state === 'accepted') && i.until > now));
  }

  // ---------------------------------------------------------------- « Y aller » and the door
  goToInvite(host: Tag, inv: InviteItem) {
    const ctx = this.ctx; if (!ctx) return;
    const name = online?.convs().find(c => c.with === host)?.name ?? 'ton hôte';
    const id = pinPlace({ kind: 'visit', hub: inv.home.hub, name: `Chez ${name}`, door: inv.home.door }, ctx.world());
    guideTo(ctx, id, inv.home.hub, `Chez ${name}`, doorName(inv.home.spec));
    this.followInto(host, inv.home.hub);
  }
  /** Be in `tag`'s presence room in `hub`: now when this player is there, else once they arrive (directions from another district). */
  followInto(tag: Tag, hub: HubId) {
    this.follow = { tag, hub, until: Date.now() + 30 * 60_000 };
    if (this.ctx?.world()?.id === hub) void this.joinFollowed();
  }
  private async joinFollowed() {
    const f = this.follow; if (!f || Date.now() > f.until) { this.follow = null; return; }
    if (await this.sameRoom(f.tag)) this.follow = null;
  }
  /** Asks the account where `tag` is; in the same district and another room, joins theirs. True when nothing more is to be done. */
  private async sameRoom(tag: Tag): Promise<boolean> {
    const api = online, ctx = this.ctx; if (!api || !ctx) return false;
    let r: Awaited<ReturnType<OnlineApi['find']>>;
    try { r = await api.find(tag); } catch { return false; }
    if (!r.ok || !r.hub || r.hub !== ctx.world()?.id) return false;
    if (r.room > 0 && r.room !== visitDeps.room?.() && visitDeps.joinRoom) { visitDeps.joinRoom(r.hub, r.room); this.log.joins.push({ hub: r.hub, room: r.room }); }
    return true;
  }

  private collect(space: string, x: number, z: number, out: Target[]) {
    if (space !== 'street' || this.visit || !this.invites.length) return;
    const w = this.ctx?.world(); if (!w) return;
    for (const inv of this.invites) {
      if (inv.item.home.hub !== w.id) continue;
      const door = w.interactables.find(i => i.id === inv.item.home.door);
      if (!door || Math.hypot(door.x - x, door.z - z) > 4) continue;
      out.push({ id: `visit:${inv.host}`, name: `Chez ${inv.name}`, kind: 'door', space, x: door.x, z: door.z, radius: 3.2, bias: -2, affordances: () => this.doorActions(inv, door.id) });
    }
  }
  private doorActions(inv: { host: Tag; name: string; item: InviteItem }, doorId: string): Affordance[] {
    const ctx = this.ctx!, list: Affordance[] = [{
      id: 'visite', verb: 'enter', label: `Entrer chez ${inv.name} (invité)`, icon: '🚪', disabled: this.knocking ? 'On frappe à la porte…' : null,
      detail: inv.item.perms.use ? 'Invité : t’asseoir, la télé et la radio' : 'Invité : regarder, sans toucher', run: () => { void this.enter(inv); },
    }];
    const own = homeByDoor(doorId);                                      // the same door leads to the player's own home too (the family room, the same listing)
    if (own && holds(ctx.state, own.id)) list.push({ id: 'chez-moi', verb: 'enter', label: own.home.level === 'room' ? 'Entrer dans ta chambre' : 'Entrer chez toi', icon: '🏠', run: () => ctx.enter(doorId) });
    return list;
  }

  /** « Entrer chez <nom> (invité) »: the account says yes with the host's home as they have it, and the player goes in. */
  async enter(inv: { host: Tag; name: string; item: InviteItem }) {
    const ctx = this.ctx, api = online; if (!ctx || !api || this.knocking || this.visit) return;
    this.knocking = true; this.log.knocks++;
    ctx.toast(`Tu frappes chez ${inv.name}…`);
    let r: Awaited<ReturnType<OnlineApi['visit']>>;
    try { r = await api.visit(inv.host); } catch { r = { ok: false, reason: 'offline', text: 'Pas de réponse : réessaie dans un instant.' }; }
    this.knocking = false;
    if (!r.ok) { this.log.refused = r.text; ctx.toast(r.text); return; }
    const snap = validSnapshot(r.snapshot, CATALOGUE_CHECK);
    if (!snap || snap.home.door !== inv.item.home.door) { this.log.refused = 'snapshot'; ctx.toast(`Impossible d’entrer chez ${inv.name} : son logement a changé.`); return; }
    const w = ctx.world(), door = w?.interactables.find(i => i.id === snap.home.door);
    if (!w || !door || w.id !== snap.home.hub || ctx.inside() || Math.hypot(door.x - ctx.player.pos.x, door.z - ctx.player.pos.z) > 8) { this.log.refused = 'away'; ctx.toast(`${inv.name} t’ouvre : reviens devant sa porte.`); return; }
    this.visit = { host: inv.host, name: inv.name, invite: r.invite, perms: r.perms, door: snap.home.door, hub: snap.home.hub, spec: snap.home.spec, since: performance.now(), inside: false, leaving: false };
    estateVisit.set({ host: inv.host, hostName: inv.name, spec: snap.home.spec, upgrades: snap.upgrades, furniture: snap.furniture.map(f => ({ spec: f.spec, at: f.at as Placement })), use: r.perms.use });
    ctx.enter(snap.home.door);
    void this.sameRoom(inv.host);
  }

  /** The visit ends against the guest's will: one sentence, back in the street. */
  private takeOut(msg: string) {
    const ctx = this.ctx, v = this.visit; if (!ctx || !v || v.leaving) return;
    v.leaving = true; ctx.toast(msg);
    if (estateVisit.inside()?.visit) { ctx.hud.closeModal(); ctx.exit(); } else this.end();
  }
  /** Back to the player's own world: their own homes drawn from their save again. */
  private end() {
    if (!this.visit) return;
    this.visit = null; this.log.ended++;
    estateVisit.set(null);
  }

  debug() {
    const self = this;
    return {
      visit: {
        homeRef: () => onlineHooks.homeToInvite?.() ?? null,
        snapshot: () => onlineHooks.homeSnapshot?.() ?? null,
        /** The checks' own account (an in-page stub): `online` for this page. */
        setOnline: (api: OnlineApi | null) => setOnline(api),
        info: () => ({
          visiting: self.visit ? { host: self.visit.host, name: self.visit.name, inside: self.visit.inside, perms: self.visit.perms, spec: self.visit.spec } : null,
          space: self.ctx ? self.presenceSpace(self.ctx) : null, knocking: self.knocking, invites: self.invites.map(i => ({ host: i.host, name: i.name, id: i.item.id, door: i.item.home.door })),
          drawn: estateVisit.get() ? { spec: estateVisit.get()!.spec, pieces: estateVisit.get()!.furniture.length, use: estateVisit.get()!.use } : null,
          log: { ...self.log, joins: [...self.log.joins] }, pins: [...pins.values()],
        }),
        goToInvite: (host: Tag, inv: InviteItem) => self.goToInvite(host, inv),
        deps: (d: Partial<typeof visitDeps>) => { Object.assign(visitDeps, d); },
      },
    };
  }
}

const visits = new Visits();
/** Home visits (registered in src/game/modules.ts MODULES, after the estate whose homes it draws). */
export const VISIT_MODULE: GameModule = {
  name: 'visits',
  init: ctx => visits.init(ctx),
  hubLoaded: (ctx, hub) => visits.hubLoaded(ctx, hub),
  update: (ctx, dt) => visits.update(ctx, dt),
  spaceChanged: (ctx, space) => visits.spaceChanged(ctx, space),
  presenceSpace: ctx => visits.presenceSpace(ctx),
  debug: () => visits.debug(),
};
/** Joining another player's presence room (meetings: src/online/meetups.ts). */
export const followInto = (tag: Tag, hub: HubId) => visits.followInto(tag, hub);
