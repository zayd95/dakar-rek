import type { Screen } from '../types';
import { badge, btn, card, empty, esc, type Tone } from '../kit';
import { phoneHooks, type VehicleRow } from '../../phoneHooks';
import { wantFocus } from '../../carteState';

/**
 * « Mes véhicules » (src/transport/whereabouts.ts; main.ts provides the rows): each vehicle the player has, its real state (parked, being driven, will not start), where it
 * was last left (the district and the place it stands near) and « Localiser », which puts the game's one marker on it and opens the phone's own map on that spot. Close by,
 * « Faire sonner » sounds its horn once. Nothing here moves a vehicle: the player walks, rides or drives to it.
 */
const TONE: Record<VehicleRow['status'], Tone> = { parked: 'gain', driven: 'info', broken: 'warn', unknown: 'sun' };
const metres = (m: number) => (m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(m) + ' m');

function rowHtml(v: VehicleRow): string {
  const where = [v.where, v.metres !== undefined ? `à ${metres(v.metres)}` : ''].filter(Boolean).join(' · ');
  return card(`<div class="pi-c"><i class="pi-ic" aria-hidden="true">${esc(v.icon)}</i><div class="pi-tx"><b>${esc(v.name)} ${badge(v.statusLabel, TONE[v.status])}</b>${where ? `<p class="vh-where">${esc(where)}</p>` : ''}${v.note ? `<p>${esc(v.note)}</p>` : ''}</div></div>
    ${v.locate || v.ring ? `<div class="pi-acts">${v.locate ? btn(v.locate, { act: 'locate', arg: v.asset, kind: 'primary', inline: true, icon: '📍' }) : ''}${v.ring ? btn('Faire sonner', { act: 'ring', arg: v.asset, kind: 'quiet', inline: true, icon: '🔔' }) : ''}</div>` : ''}`, 'pi vh');
}

export const vehiclesScreen: Screen = {
  title: 'Mes véhicules',
  mount(page, api) {
    const list = phoneHooks.vehicles?.() ?? [];
    page.innerHTML = list.length ? list.map(rowHtml).join('') : empty('🚗', 'Pas encore de véhicule. Les concessionnaires sont sur la Carte : l’essai est gratuit.');
    page.dataset.vh = list.map(v => `${v.asset}:${v.status}:${v.where}:${v.ring}:${v.marked}`).join('|');
    page.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]'); if (!b) return;
      const asset = b.dataset.arg ?? '';
      if (b.dataset.act === 'locate') {
        const f = phoneHooks.locateVehicle?.(asset) ?? null;
        if (!f) { api.notify('Rien à localiser pour l’instant', 'warn'); api.rerender(); return; }
        wantFocus(f); api.go('carte');
      } else if (b.dataset.act === 'ring') {
        const why = phoneHooks.ringVehicle?.(asset) ?? 'Indisponible';
        api.notify(why ?? '🔔 Il a sonné : écoute', why ? 'warn' : 'ok');
      }
    });
  },
  /** The list follows the game while it is shown (the player walks off with the phone open, a vehicle is sold from another screen): redrawn only when a row changed. */
  tick(page, api) {
    const key = (phoneHooks.vehicles?.() ?? []).map(v => `${v.asset}:${v.status}:${v.where}:${v.ring}:${v.marked}`).join('|');
    if (key !== page.dataset.vh) api.rerender();
  },
};
