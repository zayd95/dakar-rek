import type { Screen } from '../types';
import { empty, esc, section } from '../kit';
import { phoneHooks } from '../../phoneHooks';
import { AROUND_REFRESH_MS, aroundKey, type AroundAct, type AroundSection } from '../../../game/aroundPage';
import './around.css';

/**
 * « Autour de moi » (src/game/around.ts, the page: src/game/aroundPage.ts): what the player can do right here, right now — Tiak Tiak, Grand Camp, the
 * friends online, the places open now and the district's activities — ONE action a row, the nearest first. Drawn like « Ce soir » (light cards of rows,
 * the action on the right). It asks the server when it opens and every few seconds while it is shown (the phone's tick runs only while the phone is
 * open: nothing is asked when it is closed), and it is drawn again only when what it says has changed.
 *
 * What happens in the street (accepting a run, the marker, starting an activity, joining a friend) closes the phone first, as the board's cards do;
 * what is another screen of the phone (a match, a conversation) opens it there.
 */
const STREET: ReadonlySet<AroundAct['kind']> = new Set(['tiak', 'job', 'join', 'go', 'start']);
/** The acts of the rows drawn now, by their index on the page (a button carries its index, not the act). */
let acts: AroundAct[] = [];

function html(page: readonly AroundSection[]): string {
  acts = [];
  if (!page.length) return empty('📍', 'Rien autour de toi pour l’instant. Marche un peu : le quartier change avec l’heure.');
  return `<div class="ph-around">${page.map(s => section(s.title, `<div class="ph-rows">${s.rows.map(r => {
    const i = r.act ? acts.push(r.act.do) - 1 : -1;
    return `<div data-row="${esc(r.key)}"><span><i aria-hidden="true">${esc(r.icon)}</i><span>${esc(r.label)}${r.detail ? `<small>${esc(r.detail)}</small>` : ''}${r.why ? `<small class="ar-why">${esc(r.why)}</small>` : ''}</span></span>${r.act
      ? `<button type="button" class="ph-go${r.act.disabled ? ' off' : ''}" data-around="${i}"${r.act.disabled ? ` aria-disabled="true" title="${esc(r.why ?? '')}"` : ''}>${esc(r.act.label)}</button>` : ''}</div>`;
  }).join('')}</div>`, ` data-sec="${s.id}"`)).join('')}</div>`;
}

export const aroundScreen: Screen = {
  title: 'Autour de moi',
  mount(page, api) {
    phoneHooks.aroundRefresh?.();                                       // the server's part on opening (the lobbies, where the friends are)
    const list = phoneHooks.around?.() ?? [];
    page.innerHTML = html(list);
    page.dataset.key = aroundKey(list); page.dataset.asked = String(Date.now());
    page.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-around]'); if (!b) return;
      const act = acts[Number(b.dataset.around)]; if (!act) return;
      if (b.classList.contains('off')) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); api.notify(b.title || 'Pas maintenant', 'warn'); return; }
      if (STREET.has(act.kind)) { api.launch(() => { const why = phoneHooks.aroundDo?.(act) ?? null; if (why) api.ctx.toast(why); }); return; }
      const why = phoneHooks.aroundDo?.(act) ?? null;
      if (why) api.notify(why, 'warn');
    });
  },
  /** Every second while shown: the facts again (cheap, local), the server every few seconds; drawn again only when a row changed. */
  tick(page, api) {
    if (Date.now() - Number(page.dataset.asked ?? 0) >= AROUND_REFRESH_MS) { page.dataset.asked = String(Date.now()); phoneHooks.aroundRefresh?.(); }
    const key = aroundKey(phoneHooks.around?.() ?? []);
    if (key !== page.dataset.key) api.rerender();
  },
};
