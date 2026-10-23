import type { Screen, PhoneApi } from '../types';
import type { HubId } from '../../../core/types';
import { esc } from '../kit';
import { fullMapHtml, fullCardHtml, mountFullMap } from '../../fullmap';
import { geoMapHtml, geoCardHtml } from '../../geoMapHtml';
import { sendFocus, shortcuts, stripHtml, type Focus } from '../../carteState';
import { phoneHooks } from '../../phoneHooks';
import { HUB_NAMES } from '../../../world/content';
import { walkMinutes } from '../../../world/walk';

/**
 * Carte: the map is the screen (the district's own canvas map, or the whole city on MapLibre), the strip under it (shortcuts, vehicles, the other
 * districts and the walk there), and one short card for whatever was picked. Only the open tab is alive: MapLibre (its code, its WebGL context, its tiles)
 * is only ever loaded while « Ville » is showing, and released when the tab or the screen closes.
 */
let lastMapTab: 'quartier' | 'ville' = 'quartier';
/** The vehicles list under the strip stays as the player left it while the screen is redrawn (marking a dealer redraws it). */
let vehiclesOpen = false;

function dealersHtml(here: HubId | null, walk: boolean): string {
  const list = phoneHooks.dealers?.() ?? [], mark = phoneHooks.marked?.() ?? null;
  if (!list.length || !phoneHooks.markPlace) return '';
  return `<p class="cm-sheet-h">Concessionnaires · essai gratuit</p><div class="ph-dealers">${list.map(r => {
    const marked = mark?.id === r.id, there = here === r.hub, leg = here && !there ? walkMinutes(here, r.hub) : 0;
    const act = there ? (marked ? 'Retirer le repère' : '📍 Marquer') : walk ? `🚶 ${leg} min` : '📍 Marquer';
    return `<div class="ph-dealer${marked ? ' on' : ''}"><span><i class="dl-i" aria-hidden="true">${r.icon}</i><span class="dl-t"><b>${esc(r.name)}</b><small>${esc(HUB_NAMES[r.hub].split(' · ')[0])} · ${esc(r.vehicle)}</small></span></span>
      <button type="button" class="ph-btn" data-dealer="${esc(r.id)}" data-hub="${r.hub}" data-name="${esc(r.name)}">${act}</button></div>`;
  }).join('')}</div>`;
}

/** « Marquer » a dealer (or a place of another district from the strip's cards), and from another district walk there, the marker kept. */
function dealerAct(api: PhoneApi, b: HTMLElement) {
  const id = b.dataset.dealer!, hub = b.dataset.hub as HubId, name = b.dataset.name ?? '', here = api.ctx.hub();
  if (phoneHooks.marked?.()?.id === id && here === hub) { phoneHooks.markPlace?.(null); api.rerender(); return; }
  phoneHooks.markPlace?.(id, hub, name);
  if (here === hub || !phoneHooks.walkTo) { api.notify('Repère : ' + name); api.rerender(); return; }
  api.launch(() => phoneHooks.walkTo?.(hub));
}

export const mapScreen: Screen = {
  title: 'Carte',
  mount(s, api) {
    const here = api.ctx.hub();
    s.innerHTML = `<div class="cm"><div class="cm-map"><div class="gm-pane" data-pane="quartier">${fullMapHtml()}</div><div class="gm-pane" data-pane="ville" hidden>${geoMapHtml()}</div></div>
      <div class="cm-side"><div class="cm-strip" role="group" aria-label="Raccourcis et quartiers">${stripHtml(here)}</div>
        <div class="cm-sheet"${vehiclesOpen ? '' : ' hidden'}>${dealersHtml(here, !!phoneHooks.walkTo)}</div>${fullCardHtml()}${geoCardHtml()}</div></div>`;
    let off: (() => void) | null = null, tab: 'quartier' | 'ville' | null = null;
    const show = (t: 'quartier' | 'ville') => {
      if (t === tab) return;
      off?.(); off = null; tab = t; lastMapTab = t;
      s.querySelectorAll<HTMLElement>('[data-mt]').forEach(b => { const on = b.dataset.mt === t; b.setAttribute('aria-selected', String(on)); b.classList.toggle('on', on); });
      s.querySelectorAll<HTMLElement>('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== t; });
      if (t === 'quartier') off = mountFullMap(s);
      else void import('../../geoMap').then(m => { if (tab === 'ville') off = m.mountGeoMap(s); });
    };
    const strip = s.querySelector<HTMLElement>('.cm-strip'), vehicles = s.querySelector<HTMLElement>('.cm-sheet');
    const lit = (b: HTMLElement | null) => { strip?.querySelectorAll('.cm-chip.on').forEach(c => c.classList.remove('on')); b?.classList.add('on'); };
    // the strip, the vehicles and the cards' buttons: one delegated listener, since the cards are rewritten as the player picks things
    s.addEventListener('click', e => {
      const t = e.target as HTMLElement | null; if (!t) return;
      const mt = t.closest<HTMLElement>('[data-mt]'); if (mt) { show(mt.dataset.mt as 'quartier' | 'ville'); return; }
      const hubChip = t.closest<HTMLElement>('[data-cm-hub]'), sc = t.closest<HTMLElement>('[data-cm-sc]'), veh = t.closest<HTMLElement>('[data-cm="dealers"]');
      if (hubChip) { lit(hubChip); if (vehicles) vehicles.hidden = true; vehiclesOpen = false; sendFocus(s, { kind: 'hub', hub: hubChip.dataset.cmHub as HubId }); return; }
      if (sc) {
        const f: Focus = { kind: 'place', id: sc.dataset.cmSc!, hub: sc.dataset.hub as HubId, name: sc.dataset.name ?? '', icon: sc.dataset.icon };
        lit(sc); if (vehicles) vehicles.hidden = true; vehiclesOpen = false;
        if (f.hub === here) show('quartier');                                  // a place of this district: on the district's own map, selected
        sendFocus(s, f); return;
      }
      if (veh && vehicles) { vehicles.hidden = !vehicles.hidden; vehiclesOpen = !vehicles.hidden; lit(vehicles.hidden ? null : veh); return; }
      const pin = t.closest<HTMLElement>('[data-cm-pin]');
      if (pin) {
        const on = shortcuts.toggle({ id: pin.dataset.id!, name: pin.dataset.name ?? '', hub: pin.dataset.hub as HubId, icon: pin.dataset.icon ?? '📍' });
        if (strip) strip.innerHTML = stripHtml(here);
        api.notify(on ? 'Raccourci ajouté' : 'Raccourci retiré');
        s.dispatchEvent(new Event('carte:refresh')); return;
      }
      const act = t.closest<HTMLElement>('[data-dealer], [data-walk], [data-drive]');
      if (!act) return;
      if (act.dataset.drive !== undefined) { const h = (act.dataset.drive || null) as HubId | null, n = act.dataset.name; api.launch(() => phoneHooks.driveTo?.(h, n)); }
      else if (act.dataset.dealer) dealerAct(api, act);
      else if (act.dataset.walk) { const h = act.dataset.walk as HubId; api.launch(() => phoneHooks.walkTo?.(h)); }
    });
    if (vehiclesOpen) lit(s.querySelector('[data-cm="dealers"]'));
    show(lastMapTab);
    return () => { off?.(); off = null; tab = null; };
  },
};
