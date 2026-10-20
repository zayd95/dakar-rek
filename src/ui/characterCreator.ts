import './characterCreator.css';
import type { Avatar } from '../core/types';
import { COLORS, HAIRS, HAIR_LABEL, NAME_SUGGESTIONS, OUTFITS, SKINS, cleanFirstName, defaultAppearance, validFirstName, type Appearance, type HairId } from '../actors/appearance';
import { CreatorPreview } from './creatorPreview';

/**
 * The player's character, in two steps (docs/avatar/CREATOR.md). 1 · the first name, with a few suggestions and one Continue button. 2 · « Mon personnage »: the live 3D
 * avatar and five short rows (body, skin, hair, outfit, colour); every choice shows on the avatar at once, and there is one action, « C'est moi → Jouer ».
 * `mode: 'edit'` opens only step 2 on the current look (the phone's Profile › « Modifier mon personnage »): the same screen, saved without leaving the game.
 */
export interface CreatorResult { name: string | null; avatar: Avatar; appearance: Appearance }
export interface CreatorOptions {
  mode: 'new' | 'edit';
  /** The light body files (the low graphics preset). */
  low: boolean;
  avatar?: Avatar | null;
  appearance?: Appearance | null;
  name?: string;
  parent?: HTMLElement;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const printCss = (id: string, color: number) => id === 'uni' ? hex(color) : id === 'stripe' ? `repeating-linear-gradient(0deg, ${hex(color)} 0 4px, #f6efdd 4px 7px)` : `radial-gradient(circle at 50% 50%, #f6efdd 0 2px, ${hex(color)} 2.5px 4px, transparent 4.5px) 0 0/8px 8px, ${hex(color)}`;

export function openCreator(o: CreatorOptions): Promise<CreatorResult | null> {
  return new Promise(resolve => {
    const parent = o.parent ?? document.body, edit = o.mode === 'edit';
    let avatar: Avatar = o.avatar ?? 'homme';
    let look: Appearance = { ...(o.appearance ?? defaultAppearance(avatar)) };
    const root = document.createElement('section');
    root.id = 'creator'; root.dataset.mode = o.mode; root.dataset.step = edit ? 'look' : 'name';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'crTitle');
    const chip = (group: string, val: string | number, label: string, extra = '') => `<button type="button" class="cr-chip" data-g="${group}" data-v="${val}" aria-pressed="false"${extra}>${label}</button>`;
    root.innerHTML = `
      <div class="cr-name">
        <h1>Dakar Rek</h1>
        <h2 id="crTitle">Comment t’appelles-tu ?</h2>
        <label class="cr-field"><span class="cr-sr">Ton prénom</span><input id="crName" type="text" inputmode="text" maxlength="16" autocomplete="given-name" autocapitalize="words" enterkeyhint="next" placeholder="Ton prénom" spellcheck="false"></label>
        <div class="cr-sugg" role="group" aria-label="Prénoms suggérés">${NAME_SUGGESTIONS.slice(0, 8).map(n => `<button type="button" class="cr-pill" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div>
        <button type="button" class="cr-go" id="crContinue" disabled>Continuer</button>
      </div>
      <div class="cr-look">
        <header><h2 id="crTitle2">${edit ? 'Modifier mon personnage' : 'Mon personnage'}</h2>${edit ? '<button type="button" class="cr-x" id="crCancel" aria-label="Annuler">Annuler</button>' : '<button type="button" class="cr-x" id="crBack" aria-label="Changer de prénom">‹ Prénom</button>'}</header>
        <div class="cr-stage"><canvas id="crCanvas" aria-label="Aperçu de ton personnage, glisse pour le tourner"></canvas><p class="cr-wait" id="crWait">Chargement…</p></div>
        <div class="cr-ctl">
          <div class="cr-row" role="group" aria-label="Corps"><span>Corps</span><div>${chip('body', 'homme', 'Homme')}${chip('body', 'femme', 'Femme')}</div></div>
          <div class="cr-row" role="group" aria-label="Peau"><span>Peau</span><div class="cr-sw">${SKINS.map((s, i) => chip('skin', i, '', ` style="--c:${hex(s.hex)}" aria-label="${s.label}" title="${s.label}"`)).join('')}</div></div>
          <div class="cr-row" role="group" aria-label="Coiffure"><span>Cheveux</span><div id="crHair"></div></div>
          <div class="cr-row" role="group" aria-label="Tenue"><span>Tenue</span><div>${OUTFITS.map((f, i) => chip('outfit', i, `<i class="cr-print" data-p="${f.id}"></i>${f.label}`)).join('')}</div></div>
          <div class="cr-row" role="group" aria-label="Couleur de la tenue"><span>Couleur</span><div class="cr-sw">${COLORS.map((c, i) => chip('color', i, '', ` style="--c:${hex(c.hex)}" aria-label="${c.label}" title="${c.label}"`)).join('')}</div></div>
        </div>
        <button type="button" class="cr-go" id="crPlay">${edit ? 'Enregistrer' : 'C’est moi → Jouer'}</button>
      </div>`;
    parent.appendChild(root);
    const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
    const input = q<HTMLInputElement>('#crName'), cont = q<HTMLButtonElement>('#crContinue');
    const canvas = q<HTMLCanvasElement>('#crCanvas'), wait = q('#crWait');
    let preview: CreatorPreview | null = null, done = false;

    const paint = () => {
      root.querySelectorAll<HTMLElement>('.cr-chip').forEach(b => {
        const g = b.dataset.g!, v = b.dataset.v!;
        const on = g === 'body' ? avatar === v : g === 'hair' ? look.hair === v : String(look[g as 'skin' | 'outfit' | 'color']) === v;
        b.setAttribute('aria-pressed', String(on));
      });
      root.querySelectorAll<HTMLElement>('.cr-print').forEach(el => { el.style.background = printCss(el.dataset.p!, COLORS[look.color].hex); });
      q('#crHair').innerHTML = HAIRS.map(h => chip('hair', h, HAIR_LABEL[avatar][h])).join('');
      q('#crHair').querySelectorAll<HTMLElement>('.cr-chip').forEach(b => b.setAttribute('aria-pressed', String(look.hair === b.dataset.v)));
    };
    const sync = async () => {
      paint(); if (!preview) return;
      wait.hidden = false;
      await preview.show(avatar, look);
      if (!done) { wait.hidden = true; canvas.dataset.body = preview?.drawn ?? ''; canvas.dataset.look = JSON.stringify({ avatar, ...look }); }
    };

    // step 1
    const refreshName = () => { cont.disabled = !validFirstName(input.value); };
    input.addEventListener('input', refreshName);
    root.querySelectorAll<HTMLButtonElement>('.cr-pill').forEach(b => b.addEventListener('click', () => { input.value = b.dataset.name!; refreshName(); cont.focus({ preventScroll: true }); }));
    input.value = o.name ?? ''; refreshName();
    const toLook = () => {
      if (!validFirstName(input.value)) return;
      input.blur(); root.dataset.step = 'look'; startPreview(); paint();
    };
    cont.addEventListener('click', toLook);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); toLook(); } });

    // step 2
    function startPreview() {
      if (preview) return;
      preview = new CreatorPreview(canvas, o.low);
      if (!preview.ok) { wait.textContent = 'Aperçu indisponible sur cet appareil : tes choix sont pris en compte dans le jeu.'; return; }
      void sync(); preview.focus('body');
    }
    root.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.cr-chip'); if (!b) return;
      const g = b.dataset.g!, v = b.dataset.v!;
      if (g === 'body') avatar = v as Avatar;
      else if (g === 'hair') look.hair = v as HairId;
      else look[g as 'skin' | 'outfit' | 'color'] = Number(v);
      preview?.focus(g === 'skin' || g === 'hair' ? 'head' : 'body');
      void sync();
    });
    // the on-screen keyboard (iOS keeps the layout viewport): the layer follows the visible one, so « Continuer » is never under the keyboard
    const vv = window.visualViewport, fitView = () => { if (vv) { root.style.top = `${vv.offsetTop}px`; root.style.height = `${vv.height}px`; root.style.bottom = 'auto'; } };
    vv?.addEventListener('resize', fitView); vv?.addEventListener('scroll', fitView);
    const finish = (r: CreatorResult | null) => { if (done) return; done = true; vv?.removeEventListener('resize', fitView); vv?.removeEventListener('scroll', fitView); preview?.dispose(); preview = null; root.remove(); resolve(r); };
    q('#crPlay').addEventListener('click', () => finish({ name: edit ? null : cleanFirstName(input.value), avatar, appearance: { ...look } }));
    root.querySelector('#crBack')?.addEventListener('click', () => { root.dataset.step = 'name'; input.focus({ preventScroll: true }); });
    root.querySelector('#crCancel')?.addEventListener('click', () => finish(null));
    root.addEventListener('keydown', e => { if (e.key === 'Escape' && edit) { e.stopPropagation(); finish(null); } });
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as Record<string, unknown>).__dakarCreator = { freeze: (on: boolean) => { if (preview) preview.frozen = on; }, state: () => ({ step: root.dataset.step, avatar, look: { ...look }, name: input.value, drawn: preview?.drawn ?? null }) };
    paint();
    if (edit) { startPreview(); q<HTMLButtonElement>('#crPlay').focus({ preventScroll: true }); } else input.focus({ preventScroll: true });
  });
}
