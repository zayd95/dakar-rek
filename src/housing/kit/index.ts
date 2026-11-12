import type { HomeLevel, HomeSpec } from '../../economy/catalog';
import { F2_JAMM, registerPlan, type FloorPlan } from '../plan';
import { MAISON_PLAN } from '../maisonPlan';
import { RESIDENCE_PLAN } from '../residencePlan';
import { VILLA_PLAN } from '../villaPlan';
import { IDENTITIES, IDENTITY_IDS, type HomeIdentity, type IdentityId } from './identity';
import { mirrorPlan } from './mirror';
import { f3Plan, miniStudioPlan, studioPlan } from './templates';

/**
 * The home kit (docs/kits/HOMES.md): every home of the game but « Ma chambre » is a floor plan, and the plans are templates a hub can list under its own
 * identity. A template is a plan; `instantiate` gives a copy with its own id, the colours of a hub (`IDENTITIES`), and, if asked, the other way round
 * (`mirrorPlan`); `homeSpecFromTemplate` makes the catalogue entry a hub lists and registers the plan the shell, the editor and the placement rules read.
 * The hub itself (the building, the street door, the listing board: src/economy/citeJamm.ts, src/world/builder.ts VILLA_GATES) stays the hub's own work.
 */
export type TemplateId = 'mini_studio' | 'studio' | 'f2' | 'f3' | 'house' | 'villa' | 'residence';
export interface HomeTemplate {
  id: TemplateId;
  name: string;
  /** The catalogue's ladder step (src/economy/catalog.ts HomeLevel). */
  level: HomeLevel;
  /** The living area in m² (every level, outdoors left out) and the number of levels. */
  area: number; levels: number;
  about: string;
  /** What a hub asks for it, as a start (the owner sets the real prices in the catalogue): the price and the daily rent in F. */
  price: number; rent: number;
  /** The plan, under a catalogue id. */
  build: (id: string) => FloorPlan;
  /** Hand-made for one place (the flagship villa, the Ngor residence): not mirrored, and the colours are its own. */
  signature?: boolean;
}
const living = (p: FloorPlan) => p.rooms.filter(r => !r.outdoor).reduce((a, r) => a + (r.box.x1 - r.box.x0) * (r.box.z1 - r.box.z0), 0);
const named = (p: FloorPlan, id: string): FloorPlan => ({ ...p, id });
export const TEMPLATES: Record<TemplateId, HomeTemplate> = {
  mini_studio: { id: 'mini_studio', name: 'Mini-studio', level: 'apartment', area: living(miniStudioPlan('x')), levels: 1, about: 'Une pièce à vivre avec sa kitchenette, une salle de bain, une entrée.', price: 4_500_000, rent: 2_500, build: miniStudioPlan },
  studio: { id: 'studio', name: 'Studio', level: 'apartment', area: living(studioPlan('x')), levels: 1, about: 'Une grande pièce à vivre, une kitchenette, une salle de bain.', price: 8_000_000, rent: 3_800, build: studioPlan },
  f2: { id: 'f2', name: 'Appartement F2', level: 'apartment', area: living(F2_JAMM), levels: 1, about: 'Entrée, séjour, cuisine, chambre et salle de bain (la Résidence Jàmm).', price: 15_000_000, rent: 6_000, build: id => named(F2_JAMM, id) },
  f3: { id: 'f3', name: 'Appartement F3', level: 'apartment', area: living(f3Plan('x')), levels: 1, about: 'Entrée, séjour, cuisine, deux chambres, salle de bain, couloir.', price: 30_000_000, rent: 11_000, build: f3Plan },
  house: { id: 'house', name: 'Maison à étage', level: 'house', area: living(MAISON_PLAN), levels: 2, about: 'Deux niveaux : salon, salle à manger, cuisine, trois chambres, deux salles d’eau, la cour et les balcons.', price: 150_000_000, rent: 30_000, build: id => named(MAISON_PLAN, id) },
  villa: { id: 'villa', name: 'Villa à piscine', level: 'villa', area: living(VILLA_PLAN), levels: 3, about: 'Deux étages, la piscine, le toit-terrasse et l’hélipad (la villa des Almadies).', price: 400_000_000, rent: 120_000, build: id => named(VILLA_PLAN, id), signature: true },
  residence: { id: 'residence', name: 'Résidence de luxe', level: 'residence', area: living(RESIDENCE_PLAN), levels: 1, about: 'Un étage entier de tour : réception, suite parentale, deux chambres, la terrasse sur la mer (la Pointe de Ngor).', price: 2_500_000_000, rent: 600_000, build: id => named(RESIDENCE_PLAN, id), signature: true },
};
export const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[];

export interface InstanceOptions {
  /** The catalogue id the home is listed under (the plan is registered under it). */
  id: string;
  /** The hub's colours (default: the template's own: the shell's finish, or the villa's). */
  identity?: IdentityId;
  /** The plan the other way round. */
  mirror?: boolean;
}
/** A copy of a template's plan: its own id, a hub's colours, mirrored if asked. */
export function instantiate(template: TemplateId, o: InstanceOptions): FloorPlan {
  const t = TEMPLATES[template];
  let p = t.build(o.id);
  if (o.mirror) p = mirrorPlan(p, o.id);
  const identity = o.identity ? IDENTITIES[o.identity] : null;
  return identity && Object.keys(identity.look).length ? { ...p, look: { ...p.look, ...identity.look } } : p;
}

export interface ListingOptions extends InstanceOptions {
  name: string; what?: string; hub: HomeSpec['hub']; place: string; where: string;
  /** The hub's street door (an interactable id: `<hub>:home:<place>`). */
  door: string;
  price?: number; rent?: number; floor?: HomeSpec['home']['floor'];
}
/**
 * The catalogue entry of a home made of a template, and its plan registered (so `planFor(id)` finds it): what a hub's listing needs. The caller adds the entry
 * to `HOMES` (src/economy/catalog.ts) next to the street door it builds; upgrades are the hub's choice (`upgrades: []` here).
 */
export function homeSpecFromTemplate(template: TemplateId, o: ListingOptions): HomeSpec {
  const t = TEMPLATES[template], plan = instantiate(template, o);
  registerPlan(o.id, plan);
  const box = plan.box ?? { x0: -plan.w / 2, x1: plan.w / 2, z0: -plan.d / 2, z1: plan.d / 2 };
  const price = o.price ?? t.price, rent = o.rent ?? t.rent;
  return {
    id: o.id, kind: 'home', name: o.name, what: o.what ?? t.about, price, rent, income: Math.round((rent / 24) * 0.6), hub: o.hub, place: o.place, where: o.where,
    size: Math.round(t.area), tier: Math.min(5, 1 + TEMPLATE_IDS.indexOf(template) % 5), upgrades: [],
    home: { level: t.level, w: box.x1 - box.x0, d: box.z1 - box.z0, door: o.door, floor: o.floor ?? 'tiles' },
  } as HomeSpec;
}
export { IDENTITIES, IDENTITY_IDS, mirrorPlan, type HomeIdentity, type IdentityId };
