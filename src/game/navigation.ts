import type { GameCtx, GameModule } from './modules';
import type { HubId } from '../core/types';
import { planTrip, type TripPlan } from '../road/graph';
import { routePath } from '../ui/minimapMath';
import { phoneHooks } from '../ui/phoneHooks';
import { HUB_NAMES } from '../world/content';
import { GRID, roadCentre } from '../transport/lines';
import { missionTarget } from './missionGuide';
import { HUB_SHORT, TURN_GLYPH, gridMetres, legEnds, navDistance, nextTurn, openEdges, turnText, type Pt } from './navRules';
import { closuresNow } from '../actors/npc';

/**
 * Driving directions (rules: src/game/navRules.ts). The goal is the job in hand (a VTC passenger, then their destination; a Tiak parcel's pick-up, then its
 * client; a dealer's errand: src/game/missionGuide.ts), else a district or a place the player chose on the map (« 🚗 Itinéraire »). In the goal's district
 * the way follows the streets to it; in another district it follows them to the way out toward the next district on the trip (src/road/graph.ts planTrip),
 * and out on a road between districts it is « tout droit » with the kilometres left. While the player drives or rides, the goal line becomes the next turn
 * (« ↱ À droite dans 80 m · Restaurant La Pointe ») and the distance left by road; the minimap's dotted route and the phone's map follow the same point.
 * Nothing is drawn while walking that the goal line did not already show; it clears itself when the job ends or the place is reached.
 */
export interface NavGoal { name: string; hub: HubId; x: number; z: number; known: boolean }

class Navigation implements GameModule {
  readonly name = 'navigation';
  private ctx: GameCtx | null = null;
  /** A district (and place) chosen on the map to drive to. */
  private manual: NavGoal | null = null;
  private t = 0;
  private route: { points: Pt[]; length: number } | null = null; private routeKey = '';
  /** What the goal line says now (null: nothing to steer by), and the point steered for in this district. */
  private now: { glyph: string; text: string; dist: string; remaining: number; goal: string; local: Pt & { name: string }; road: boolean; driving: boolean } | null = null;
  private log = { arrivals: 0, set: 0, lines: [] as string[] };

  init(ctx: GameCtx) {
    this.ctx = ctx;
    phoneHooks.driveTo = (hub, name) => this.driveTo(hub, name);
    phoneHooks.driving = () => this.driving(ctx);
    phoneHooks.navGoal = () => (this.manual ? { hub: this.manual.hub, name: this.manual.name } : null);
  }

  /** « 🚗 Itinéraire » from the map: directions to a district (its centre) or a place of it (the walking marker then leads in that district). */
  driveTo(hub: HubId | null, name?: string) {
    const ctx = this.ctx; if (!ctx) return;
    if (!hub) { this.manual = null; ctx.hud.setNav(null); return; }
    this.manual = { name: name ?? HUB_NAMES[hub].split(' · ')[0], hub, x: 0, z: 0, known: false };
    this.log.set++;
    ctx.toast(`Itinéraire : ${this.manual.name}${hub !== ctx.world()?.id ? ` (${HUB_SHORT[hub]})` : ''} · suis la ligne jaune`);
  }

  private driving(ctx: GameCtx) { return ctx.player.seated()?.kind === 'vehicle'; }

  /** The goal now: the job in hand first, then the place chosen on the map. */
  goal(): NavGoal | null {
    const m = missionTarget();
    if (m) return { name: m.name, hub: m.hub, x: m.x, z: m.z, known: true };
    return this.manual;
  }

  /** What the goal line says now (the next turn, the distance left), for the car's screens at the wheel (src/transport/carInterior.ts). */
  current(): { glyph: string; text: string; dist: string } | null { return this.now ? { glyph: this.now.glyph, text: this.now.text, dist: this.now.dist } : null; }
  /** The point to steer for in this district (the goal, or the way out toward it), for the minimap and the marker: null when the goal is here and has its own. */
  localGoal(): { name: string; x: number; z: number } | null { return this.now?.local ?? null; }

  update(ctx: GameCtx, dt: number) {
    this.t -= dt; if (this.t > 0) return; this.t = 0.2;
    const w = ctx.world(), g = this.goal();
    if (!w || !g || ctx.inside()) { if (this.now) { this.now = null; ctx.hud.setNav(null); } return; }
    const p = ctx.player.pos, here = w.id, driving = this.driving(ctx);
    let local: Pt & { name: string }, beyond = 0, through: string | undefined, plan: TripPlan | null = null;
    if (g.hub === here) {
      if (!g.known) { const it = w.interactables.find(i => i.name === g.name); local = it ? { x: it.x, z: it.z, name: g.name } : { x: 0, z: 0, name: g.name }; }
      else local = { x: g.x, z: g.z, name: g.name };
      // a place chosen on the map, reached
      if (g === this.manual && Math.hypot(p.x - local.x, p.z - local.z) < (g.known ? 12 : 40)) { this.manual = null; this.log.arrivals++; ctx.toast(`Te voilà : ${g.name}`); ctx.hud.setNav(null); this.now = null; return; }
    } else {
      plan = planTrip(here, g.hub); if (!plan) { this.now = null; ctx.hud.setNav(null); return; }
      const first = legEnds(plan.legs[0]); through = HUB_SHORT[plan.hubs[1]];
      local = { ...first.exit, name: `Route vers ${HUB_SHORT[plan.hubs[1]]}` };
      for (let i = 0; i < plan.legs.length; i++) {
        const l = plan.legs[i], e = legEnds(l);
        beyond += l.edge.road ? l.edge.road.length : 0;
        const next = plan.legs[i + 1], out = next ? legEnds(next).exit : (g.known ? g : { x: 0, z: 0 });
        beyond += gridMetres(e.entry, out);
      }
    }
    // out on a road between districts: straight on, the road's metres left
    const R = roadCentre(GRID.nb) + 7, onRoad = Math.abs(p.x) > R || Math.abs(p.z) > R;
    let glyph: string, text: string, remaining: number;
    type View = { project?(x: number, z: number): { s: number }; road?: { length: number; def: { a: HubId; b: HubId; aMouth: Pt; bMouth: Pt } } };
    const cv = onRoad ? (w.corridors ?? []).find(c => c.contains(p.x, p.z, 2)) as unknown as View | undefined : undefined;
    if (onRoad && cv?.project && cv.road) {
      // which end of the road the trip makes for: this district (the swap happens at the road's middle) or the next one
      const d = cv.road.def, toward = g.hub === here || !plan ? here : plan.hubs[1], s = cv.project(p.x, p.z).s;
      const left = d.b === toward ? cv.road.length - s : s, mouth = d.b === here ? d.bMouth : d.aMouth;
      remaining = Math.max(0, left) + (g.hub === here ? gridMetres(mouth, local) : Math.max(0, beyond - cv.road.length));
      glyph = TURN_GLYPH.straight; text = `Tout droit sur la route · ${g.name}`;
    } else {
      // at the wheel the way keeps off the streets closed to cars (the arena's pedestrian zone, a road event)
      const shut = driving ? closuresNow() : [];
      const key = `${here}|${local.x | 0},${local.z | 0}|${Math.round(p.x / 6)},${Math.round(p.z / 6)}|${shut.length}`;
      if (key !== this.routeKey) { this.routeKey = key; this.route = routePath(openEdges(w.edges, shut), { x: p.x, z: p.z }, local); }
      const pts = [{ x: p.x, z: p.z }, ...(this.route?.points ?? [local])];
      const turn = nextTurn(pts, ctx.player.facing());
      remaining = (this.route?.length ?? Math.hypot(local.x - p.x, local.z - p.z)) + beyond;
      glyph = TURN_GLYPH[turn.dir];
      text = turnText(turn, g.name, g.hub === here ? undefined : through);
    }
    const dist = navDistance(remaining);
    this.now = { glyph, text, dist, remaining, goal: g.name, local, road: onRoad, driving };
    if (this.log.lines[this.log.lines.length - 1] !== `${glyph} ${text} · ${dist}`) { this.log.lines.push(`${glyph} ${text} · ${dist}`); if (this.log.lines.length > 30) this.log.lines.shift(); }
    // the goal line speaks turns while the player drives or rides; on foot the usual arrow and the straight distance stay
    ctx.hud.setNav(driving && ctx.mode() === 'play' ? { glyph, text, dist } : null);
  }

  debug(): Record<string, unknown> {
    return {
      nav: {
        info: () => ({ goal: this.goal(), manual: this.manual, now: this.now ? { ...this.now, local: { ...this.now.local } } : null, route: this.route ? { n: this.route.points.length, length: Math.round(this.route.length) } : null, log: { ...this.log, lines: [...this.log.lines] } }),
        to: (hub: HubId | null, name?: string) => this.driveTo(hub, name),
      },
    };
  }
}
export const navigation = new Navigation();
