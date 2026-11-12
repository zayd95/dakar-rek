import type { GameCtx, GameModule } from '../game/modules';
import type { HubId } from '../core/types';
import { phoneHooks } from '../ui/phoneHooks';
import { HUB_NAMES } from '../world/content';
import { relLevel } from '../venues/venue';
import { dealerOffer } from './credit';
import { specOf } from './catalog';
import { assetsOf } from './assets';
import { villaFactsOf } from '../villa/facts';
import { nextPrice, unitsOwned } from './business';
import { FURNITURE, furnitureCount, priceOf } from './furniture';
import { ACTIVITIES, ACTIVITY_INFO, isRecent } from './polyvalence';
import { offerNow, openPistes, pistes, type Piste, type PisteFacts, type PlaceRef } from './pistes';
import { onWorkDone } from './streakModule';

/**
 * « Mes pistes » at run time (rules: src/economy/pistes.ts). The facts are read from the systems that own them; a lead's place is offered only when this
 * build has it. The leads live in the phone (« Mes pistes »); after a Tiak delivery or a VTC ride, once its card has gone and the player is on foot outside
 * any activity, ONE open lead may be offered in a small card (« Y aller » / « Plus tard »), at most once per facts and never more often than every
 * OFFER_GAP_MS of play. Following a lead marks its place (the walking marker, and driving directions toward another district) or opens its app.
 */
const OFFER_GAP_MS = 8 * 60_000;
/** Pikine and the Plateau have a Banque Teranga agency (src/world/city.ts); elsewhere the lead points to Pikine's. */
const BANK_HUBS: HubId[] = ['pikine', 'plateau'];
const short = (hub: HubId) => HUB_NAMES[hub].split(' · ')[0];

class PistesModule implements GameModule {
  readonly name = 'pistes';
  private ctx: GameCtx | null = null;
  /** performance.now() after which the lead may be offered (the work card's time), or 0. */
  private due = 0;
  private t = 0;
  private log = { offered: [] as string[], followed: [] as string[], dropped: [] as string[] };

  init(ctx: GameCtx) {
    this.ctx = ctx;
    phoneHooks.pistes = () => this.list();
    phoneHooks.followPiste = id => this.follow(id);
    phoneHooks.dropPiste = id => this.drop(id);
    onWorkDone((_kind, cardMs) => { this.due = performance.now() + cardMs + 1500; });
  }

  /** The facts, from the systems that own them. */
  facts(): PisteFacts {
    const ctx = this.ctx!, s = ctx.state, d = s.data, hub = (ctx.world()?.id ?? d.hub) as HubId;
    const sarrRow = phoneHooks.dealers?.().find(r => r.name === 'Sarr Auto');
    let sarr: PisteFacts['sarr'] = null;
    if (sarrRow) {
      const o = { price: specOf('teranga')?.price ?? 0, wallet: s.wallet, loans: d.loans.list };
      // what would stop him even if he trusted the player completely (a debt, a broken promise) vs. only not knowing them yet
      const refusal = dealerOffer({ ...o, trust: 100 }).verdict === 'refuse' ? 'other' : dealerOffer({ ...o, trust: relLevel(ctx, 'sarr') }).verdict === 'refuse' ? 'trust' : null;
      sarr = { place: { id: sarrRow.id, hub: sarrRow.hub, name: sarrRow.name }, refusal };
    }
    const bankHub = BANK_HUBS.includes(hub) ? hub : 'pikine';
    const square = ctx.world()?.interactables.find(i => i.id === `${hub}:city:square`);
    return {
      hub, hour: ctx.hour(), wallet: s.wallet, savings: d.bank.savings,
      deliveries: d.counters.livraisons ?? 0, vtcTrips: d.vtc.trips,
      cars: assetsOf(s, 'vehicle').filter(a => a.spec !== 'jakarta').length,
      sarr,
      bank: phoneHooks.openBank ? { place: { id: `${bankHub}:city:bank`, hub: bankHub, name: `Banque Teranga · ${short(bankHub)}` }, opened: d.bank.opened >= 0 } : null,
      ventures: unitsOwned(s),
      bana: { price: nextPrice(s, 'bana'), place: phoneHooks.banaPlace?.() ?? null },
      furniture: furnitureCount(s), cheapestFurniture: Math.min(...FURNITURE.map(f => priceOf(f.id))),
      furnitureShop: { id: 'keur_meubles', hub: 'pikine', name: 'Keur Meubles' },                   // the Cité Jàmm's furniture shop (src/economy/estate.ts), always in Pikine
      needs: { social: d.needs.social, moral: d.needs.moral },
      square: square ? { id: square.id, hub, name: square.name } : null,
      variety: ACTIVITIES.filter(a => !isRecent(s, a)).map(a => ({ label: ACTIVITY_INFO[a].label, where: ACTIVITY_INFO[a].where })),
      villa: villaFactsOf(s),                                                                         // LD2.0-D: the villa as a savings goal (src/villa/goal.ts)
    };
  }

  /** The open leads, best first (the phone's list). */
  list(): Piste[] { return this.ctx ? openPistes(pistes(this.facts()), this.ctx.state.data.pistes) : []; }

  /** « Y aller »: the place is marked (and, in another district, the way there is shown) or the app opens; the lead is done with these facts. */
  follow(id: string): boolean {
    const ctx = this.ctx; if (!ctx) return false;
    const p = pistes(this.facts()).find(x => x.id === id); if (!p) return false;
    ctx.state.data.pistes.off[p.id] = p.key; this.log.followed.push(p.id); ctx.save();
    if ('app' in p.go) { phoneHooks.openPhone?.(p.go.app); return true; }
    this.goTo(p.go.place);
    return true;
  }
  private goTo(pl: PlaceRef) {
    const ctx = this.ctx!, here = ctx.world()?.id;
    phoneHooks.markPlace?.(pl.id, pl.hub, pl.name);
    if (pl.hub !== here) phoneHooks.driveTo?.(pl.hub, pl.name);
    ctx.toast(pl.hub === here ? `Repère : ${pl.name}` : `Repère : ${pl.name} (${short(pl.hub)}) · suis la ligne d’objectif`);
  }

  /** « Pas maintenant »: the lead stays away until its facts change. */
  drop(id: string): boolean {
    const ctx = this.ctx; if (!ctx) return false;
    const p = pistes(this.facts()).find(x => x.id === id); if (!p) return false;
    ctx.state.data.pistes.off[p.id] = p.key; this.log.dropped.push(p.id); ctx.save();
    return true;
  }

  update(ctx: GameCtx, dt: number) {
    if (!this.due) return;
    this.t -= dt; if (this.t > 0) return; this.t = 0.5;
    if (performance.now() < this.due) return;
    // never while driving or riding, in an activity or a prayer, in a menu or the phone: it waits for the player to be free on foot
    if (ctx.mode() !== 'play' || ctx.player.seated() || document.body.dataset.focus || document.body.classList.contains('phone-open')) return;
    this.due = 0;
    const st = ctx.state.data.pistes, p = offerNow(pistes(this.facts()), st, ctx.state.data.playedMs, OFFER_GAP_MS);
    if (!p) return;
    st.offered[p.id] = p.key; st.lastMs = ctx.state.data.playedMs; this.log.offered.push(p.id); ctx.save();
    ctx.hud.offer({
      icon: p.icon, title: p.title, line: p.line,
      actions: [{ label: 'Y aller', primary: true, run: () => this.follow(p.id) }, { label: 'Plus tard', run: () => {} }],
    });
  }

  debug(ctx: GameCtx): Record<string, unknown> {
    return {
      pistes: {
        facts: () => this.facts(),
        list: () => this.list().map(p => ({ ...p })),
        all: () => pistes(this.facts()).map(p => ({ id: p.id, key: p.key })),
        state: () => JSON.parse(JSON.stringify(ctx.state.data.pistes)),
        follow: (id: string) => this.follow(id), drop: (id: string) => this.drop(id),
        /** Checks: as if a piece of work had just ended (the offer waits for the card, then for the player to be free). */
        afterWork: (ms = 0) => { this.due = performance.now() + ms; },
        log: () => ({ offered: [...this.log.offered], followed: [...this.log.followed], dropped: [...this.log.dropped] }),
      },
    };
  }
}
export const pistesModule = new PistesModule();
