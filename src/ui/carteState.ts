import type { HubId } from '../core/types';
import { HUB_IDS } from '../core/types';
import { HUB_NAMES, travelLeg } from '../world/content';
import { ROADS } from '../road/routes';
import { walkMinutes } from '../world/walk';
import { phoneHooks } from './phoneHooks';
import { fcfa } from './hud';
import { esc } from './journal';

/**
 * What the phone's map screen shares between its two maps (the district's canvas, the city's MapLibre): the player's shortcuts, what the strip under the map points at (a district, a place of
 * another district), and the short cards that say what to do about it. Everything is one line of text and one or two buttons: the map is the screen, the card is only its caption.
 */

/** A place the player keeps one tap away (any district). Kept on this device only (nothing in the save, no protocol). */
export interface Shortcut { id: string; name: string; hub: HubId; icon: string }
/** What a tap on the strip asks the maps to show: a whole district, or one place (in this district, or in another one). */
export type Focus = { kind: 'hub'; hub: HubId } | { kind: 'place'; id: string; hub: HubId; name: string; icon?: string };

const KEY = 'dakarrek.map.shortcuts', MAX = 8;
const store = () => { try { return window.localStorage; } catch { return null; } };

export const shortcuts = {
  list(): Shortcut[] {
    try { const v = JSON.parse(store()?.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.filter((s): s is Shortcut => !!s && typeof s.id === 'string' && typeof s.name === 'string' && (HUB_IDS as readonly string[]).includes(s.hub)).slice(0, MAX) : []; } catch { return []; }
  },
  has(id: string) { return this.list().some(s => s.id === id); },
  /** Adds the shortcut, or removes it when it is already there. Returns true when it is now a shortcut. */
  toggle(s: Shortcut): boolean {
    const list = this.list(), i = list.findIndex(x => x.id === s.id);
    if (i >= 0) list.splice(i, 1); else list.unshift(s);
    try { store()?.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* session only */ }
    return i < 0;
  },
};

const short = (h: HubId) => HUB_NAMES[h].split(' · ')[0];

/** « ☆ Raccourci » / « ★ Raccourci »: the pin button of a place's card. */
export function pinHtml(s: Shortcut): string {
  const on = shortcuts.has(s.id);
  return `<button type="button" class="ph-btn cm-pin${on ? ' on' : ''}" data-cm-pin data-id="${esc(s.id)}" data-hub="${s.hub}" data-name="${esc(s.name)}" data-icon="${esc(s.icon)}" aria-pressed="${on}">${on ? '★' : '☆'} Raccourci</button>`;
}

/** The card of a district, or of a place in another district: how far, how, and the one button that goes there. */
export function remoteCardHtml(f: Focus, here: HubId | null): string {
  const walk = !!phoneHooks.walkTo, there = f.hub === here;
  const min = here && !there ? walkMinutes(here, f.hub) : 0, leg = here && !there ? travelLeg(here, f.hub) : null;
  const road = here && !there ? ROADS.find(r => r.touches(here) && r.touches(f.hub)) : null;               // a road you can drive between the two districts
  const facts = there ? '' : `<p class="cm-facts"><span>🚶 ${min} min · gratuit</span>${leg ? `<span>🚌 Car rapide ${esc(fcfa(leg.cost))} · ≈ ${leg.minutes} min</span>` : ''}${road ? `<span>🛣️ Au volant · ${(road.length / 1000).toFixed(1).replace('.', ',')} km</span>` : ''}</p>`;
  if (f.kind === 'hub') {
    return `<div class="fm-row"><b>${esc(HUB_NAMES[f.hub])}</b>${there ? '<em>Tu es ici</em>' : ''}</div>${facts}
      ${!there && walk ? `<div class="cm-acts"><button type="button" class="ph-btn cm-go" data-walk="${f.hub}">🚶 Y aller à pied</button></div>` : ''}`;
  }
  const marked = phoneHooks.marked?.()?.id === f.id, icon = f.icon ?? '📍';
  return `<div class="fm-row"><span class="cm-ic" aria-hidden="true">${esc(icon)}</span><b>${esc(f.name)}</b><em>${esc(short(f.hub))}</em></div>${facts}
    <div class="cm-acts">${!there && walk ? `<button type="button" class="ph-btn cm-go" data-dealer="${esc(f.id)}" data-hub="${f.hub}" data-name="${esc(f.name)}">🚶 Y aller · repère gardé</button>`
      : `<button type="button" class="ph-btn cm-go" data-dealer="${esc(f.id)}" data-hub="${f.hub}" data-name="${esc(f.name)}">${marked ? 'Retirer le repère' : '📍 Marquer'}</button>`}${pinHtml({ id: f.id, name: f.name, hub: f.hub, icon })}</div>`;
}

/** The strip under the map: the player's shortcuts, the vehicles, and the other districts with their walking time. One row to swipe. */
export function stripHtml(here: HubId | null): string {
  const home = phoneHooks.homeHub?.() ?? null, chips: string[] = [];
  for (const s of shortcuts.list()) chips.push(`<button type="button" class="cm-chip sc" data-cm-sc="${esc(s.id)}" data-hub="${s.hub}" data-name="${esc(s.name)}" data-icon="${esc(s.icon)}"><i aria-hidden="true">★</i>${esc(s.name)}</button>`);
  if ((phoneHooks.dealers?.() ?? []).length && phoneHooks.markPlace) chips.push('<button type="button" class="cm-chip veh" data-cm="dealers"><i aria-hidden="true">🚗</i>Véhicules</button>');
  const hubs = HUB_IDS.filter(h => h !== here).sort((a, b) => Number(b === home) - Number(a === home));
  for (const h of hubs) chips.push(`<button type="button" class="cm-chip hub" data-cm-hub="${h}"><i aria-hidden="true">${h === home ? '🏠' : '🚶'}</i>${esc(short(h))}${here ? `<small>${walkMinutes(here, h)} min</small>` : ''}</button>`);
  return chips.join('');
}

/** « Quartier | Ville »: laid over the top left of each map. */
export const tabsHtml = () => `<div class="gm-tabs cm-tabs" role="tablist" aria-label="Carte"><button type="button" role="tab" data-mt="quartier">Quartier</button><button type="button" role="tab" data-mt="ville">Ville</button></div>`;

/** The strip's request, sent to whichever map is showing (see mountCarte in phone.ts). */
export const sendFocus = (host: HTMLElement, f: Focus) => host.dispatchEvent(new CustomEvent<Focus>('carte:focus', { detail: f }));
