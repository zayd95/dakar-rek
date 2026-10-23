import './characterStudio.css';
import type { Avatar } from '../core/types';
import { previewUrl } from '../actors/playerBody';
import {
  COLORS, HAIRS_FOR, HAIR_LABEL, NAME_SUGGESTIONS, OUTFITS, SKINS, cleanFirstName, defaultAppearance, lightCloth, onBody, validFirstName, type Appearance, type HairId,
} from '../actors/appearance';
import { StudioStage, type Focus } from './studioStage';

/**
 * The character studio (docs/avatar/STUDIO.md). New game: « Bienvenue à Dakar » and a first name, then the studio: the real avatar, large, alive and turnable,
 * and four categories — Corps, Peau, Coiffure, Tenue — of which only the open one shows its choices; every choice is on the avatar at once, and the one action,
 * « C'est moi → Jouer », goes into the game. Phone › Profil › « Modifier mon personnage » opens the same studio on the current look (`mode: 'edit'`).
 *
 * Built so that a later step (the neighbourhood a life starts in) slots in between the name and the studio without a redesign: steps are `data-step` panes of one
 * layer, and the result is a plain record the caller applies.
 */
export interface StudioOptions {
  mode: 'new' | 'edit';
  /** The light body files (the low graphics preset). */
  low: boolean;
  avatar?: Avatar | null;
  appearance?: Appearance | null;
  /** Edit: the look as saved (null: the body as it was made), given back unchanged when this device's studio cannot draw (only the body can then be chosen). */
  keep?: Appearance | null;
  name?: string;
  /** The body a previous game used (save v6's suggestion): pre-selected on a new game. */
  suggested?: Avatar | null;
  /** The neighbourhood the life starts in, for the arrival card (Pikine today). */
  origin?: string;
  parent?: HTMLElement;
}
export interface StudioResult {
  name: string | null; avatar: Avatar; appearance: Appearance | null;
  /** The Profile picture of this look (JPEG data URL), or null when the stage could not draw. */
  portrait: string | null;
  /** New game: the arrival card stays over the screen while the world is built; call this once the game draws, it fades away. */
  arrive(): void;
}

type Cat = 'corps' | 'peau' | 'coiffure' | 'tenue';
const CATS: { id: Cat; label: string; focus: Focus; icon: string }[] = [
  { id: 'corps', label: 'Corps', focus: 'body', icon: '<circle cx="12" cy="5.5" r="2.6"/><path d="M7.5 21v-6.2a4.5 4.5 0 0 1 9 0V21M9 11.2 7 15.5m8-4.3 2 4.3"/>' },
  { id: 'peau', label: 'Peau', focus: 'face', icon: '<path d="M12 3.2c3.3 4.2 5.6 7.3 5.6 10.4a5.6 5.6 0 0 1-11.2 0c0-3.1 2.3-6.2 5.6-10.4Z"/>' },
  { id: 'coiffure', label: 'Coiffure', focus: 'hair', icon: '<path d="M5.5 13.5c0-5 3-8.3 6.5-8.3s6.5 3.3 6.5 8.3"/><path d="M5.5 13.5c1.6-2.6 3.8-4.3 6.5-4.6m6.5 4.6c-1.1-1.9-2.6-3.3-4.4-4"/><path d="M7 13.5v3.5m10-3.5v3.5"/>' },
  { id: 'tenue', label: 'Tenue', focus: 'body', icon: '<path d="M8.5 4 4.2 6.6l1.7 4 2.1-.9V20h8V9.7l2.1.9 1.7-4L15.5 4c-.6 1.3-1.9 2.2-3.5 2.2S9.1 5.3 8.5 4Z"/>' },
];
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const icon = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
/** The garment tile of an outfit card: the real print in the real colour (the same motif as the shader's, drawn as SVG). */
function weave(print: string, base: number): string {
  const light = lightCloth(base);
  const ink = light ? '#2a3866' : '#f3ead6', deep = light ? '#1a2140' : 'rgba(0,0,0,.45)';
  if (print === 'uni') return `background:${hex(base)}`;
  if (print === 'stripe') return `background:repeating-linear-gradient(180deg, ${hex(base)} 0 7px, ${ink} 7px 12px)`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='22' height='33' viewBox='0 0 22 33'><rect width='22' height='33' fill='${hex(base)}'/><path d='M11 2.5 19 10.5 11 18.5 3 10.5Z' fill='none' stroke='${ink}' stroke-width='1.6'/><circle cx='11' cy='10.5' r='2' fill='${deep}'/><path d='M0 27l3.7-3.5 3.7 3.5 3.6-3.5 3.7 3.5 3.6-3.5L22 27' fill='none' stroke='${ink}' stroke-width='1.4'/><path d='M0 21h22' stroke='${deep}' stroke-width='.9'/></svg>`;
  return `background:url("data:image/svg+xml,${encodeURIComponent(svg)}") 0 0/22px 33px`;
}

export function openStudio(o: StudioOptions): Promise<StudioResult | null> {
  return new Promise(resolve => {
    const parent = o.parent ?? document.body, edit = o.mode === 'edit';
    let avatar: Avatar = o.avatar ?? o.suggested ?? 'homme';
    let look: Appearance = onBody(avatar, { ...(o.appearance ?? defaultAppearance(avatar)) });
    let cat: Cat = 'corps', names = 0, done = false;
    const root = document.createElement('section');
    root.id = 'studio'; root.dataset.mode = o.mode; root.dataset.step = edit ? 'look' : 'name'; root.dataset.cat = cat;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', edit ? 'stWhoName' : 'stHello');
    root.innerHTML = `
      <div class="st-bg" aria-hidden="true"><i class="st-glow g1"></i><i class="st-glow g2"></i><i class="st-cloth"></i>
        <svg class="st-skyline" viewBox="0 0 400 90" preserveAspectRatio="xMidYMax slice"><path d="M0 90V62h18v-9h14v9h10V50h20v12h8V44l6-7 6 7v18h12V55h22v7h10V30h3v-6h4v6h3v32h12V48h26v14h8v-7h16v7h10V40l5-4 5 4v22h14V52c0-8 6-13 12-13h0c6 0 12 5 12 13v10h12V46h18v16h10v-9h20v9h12V56h16v6h18v28Z"/><path d="M332 62c-1-9 2-15 8-18-6-1-10-6-10-6 5 1 9 0 12-3-2 5 0 8 3 10 0-6 3-10 8-12-3 4-3 9-1 12 3-3 8-4 12-2-5 1-8 4-9 8 5-1 9 1 11 4-6-2-11-1-14 3 1 2 1 5 0 4Z"/></svg>
      </div>
      <canvas class="st-stage" aria-label="Ton personnage, en 3D : glisse pour le tourner"></canvas>
      <img class="st-still" alt="" hidden>
      <div class="st-welcome">
        <div class="st-brand"><i class="st-sun"></i>Dakar Rek</div>
        <div class="st-hero">
          <h1 id="stHello">Bienvenue à Dakar.</h1>
          <p>Ta nouvelle vie commence ici.<br>Comment tu t’appelles&nbsp;?</p>
        </div>
        <div class="st-ask">
          <label class="st-field"><span class="st-sr">Ton prénom</span><input id="stName" type="text" maxlength="16" autocomplete="given-name" autocapitalize="words" enterkeyhint="next" spellcheck="false" placeholder="Ton prénom"></label>
          <div class="st-names" role="group" aria-label="Quelques prénoms"></div>
        </div>
        <button type="button" class="st-cta" id="stContinue" disabled>Continuer</button>
      </div>
      <header class="st-top">
        <button type="button" class="st-back" id="stBack">${edit ? 'Annuler' : '<span aria-hidden="true">‹</span> Prénom'}</button>
        <div class="st-who"><small>${edit ? 'Modifier mon personnage' : 'Ton personnage'}</small><b id="stWhoName"></b></div>
        <span class="st-turn" aria-hidden="true">${icon('<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>')}Glisse</span>
      </header>
      <div class="st-panel">
        <nav class="st-tabs" role="tablist" aria-label="Catégories">${CATS.map(c => `<button type="button" role="tab" class="st-tab" id="stTab-${c.id}" data-cat="${c.id}" aria-controls="stPane-${c.id}">${icon(c.icon)}<span>${c.label}</span></button>`).join('')}<i class="st-tab-ink" aria-hidden="true"></i></nav>
        <div class="st-panes">
          <div class="st-pane" role="tabpanel" id="stPane-corps" data-pane="corps" aria-labelledby="stTab-corps"><div class="st-bodies">${(['homme', 'femme'] as Avatar[]).map(a => `<button type="button" class="st-card st-bodycard" data-g="body" data-v="${a}" aria-pressed="false"><span class="st-thumb"></span><b>${a === 'homme' ? 'Homme' : 'Femme'}</b></button>`).join('')}</div></div>
          <div class="st-pane" role="tabpanel" id="stPane-peau" data-pane="peau" aria-labelledby="stTab-peau"><div class="st-tones">${SKINS.map((s, i) => `<button type="button" class="st-swatch st-tone" data-g="skin" data-v="${i}" style="--c:${hex(s.hex)}" aria-label="${s.label}" aria-pressed="false"></button>`).join('')}</div><p class="st-caption" id="stToneName"></p></div>
          <div class="st-pane" role="tabpanel" id="stPane-coiffure" data-pane="coiffure" aria-labelledby="stTab-coiffure"><div class="st-hairs"></div></div>
          <div class="st-pane" role="tabpanel" id="stPane-tenue" data-pane="tenue" aria-labelledby="stTab-tenue">
            <div class="st-outfits">${OUTFITS.map((f, i) => `<button type="button" class="st-card st-outfit" data-g="outfit" data-v="${i}" aria-pressed="false"><i class="st-weave" data-print="${f.print}"></i><b>${f.label}</b></button>`).join('')}</div>
            <div class="st-colors">${COLORS.map((c, i) => `<button type="button" class="st-swatch st-color" data-g="color" data-v="${i}" style="--c:${hex(c.hex)}" aria-label="${c.label}" aria-pressed="false"></button>`).join('')}</div>
          </div>
        </div>
        <button type="button" class="st-cta" id="stPlay">${edit ? 'Enregistrer' : 'C’est moi <span class="st-arrow" aria-hidden="true">→</span> Jouer'}</button>
      </div>
      <div class="st-arrival" aria-live="polite"><small>${esc(o.origin ?? 'Pikine')}</small><b></b><i class="st-dots"><i></i><i></i><i></i></i></div>`;
    parent.appendChild(root);
    const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
    const input = q<HTMLInputElement>('#stName'), cont = q<HTMLButtonElement>('#stContinue'), canvas = q<HTMLCanvasElement>('.st-stage');
    const panel = q('.st-panel'), top = q('.st-top'), hairs = q('.st-hairs'), still = q<HTMLImageElement>('.st-still'), welcome = q('.st-welcome');
    /** One step on screen; the other is inert (out of reach of a tab key or a screen reader, not only out of sight). */
    const setStep = (st: 'name' | 'look') => { root.dataset.step = st; welcome.inert = st !== 'name'; top.inert = panel.inert = st !== 'look'; };

    // ------------------------------------------------------------------ the stage: created at once, its body loading while the name is typed
    const stage = new StudioStage(canvas, o.low);
    const live = stage.ok;
    stage.paused = !edit;
    if (live) { void stage.load(avatar).then(() => stage.load(avatar === 'homme' ? 'femme' : 'homme')); }
    else root.classList.add('st-flat');                                                  // no WebGL here: the bodies' pictures, and only the body choice
    // the free part of the screen, from the layout boxes (not the drawn ones: the panel's entrance animation must not move the framing)
    const layout = () => {
      const h = root.clientHeight, w = root.clientWidth, side = panel.offsetLeft > w * 0.3, below = top.offsetTop + top.offsetHeight;
      stage.setFree(side ? { top: below, bottom: 8, right: w - panel.offsetLeft + 8 } : { top: below + 4, bottom: h - panel.offsetTop + 6 });
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(layout) : null;
    ro?.observe(panel); ro?.observe(root);

    // ------------------------------------------------------------------ step 1: the name
    const refreshName = () => { cont.disabled = !validFirstName(input.value); };
    const showNames = () => {
      const list = NAME_SUGGESTIONS, pick = Array.from({ length: 6 }, (_, i) => list[(names * 6 + i) % list.length]);
      q('.st-names').innerHTML = pick.map(n => `<button type="button" class="st-pill" data-name="${esc(n)}">${esc(n)}</button>`).join('') + `<button type="button" class="st-pill st-more" aria-label="D’autres prénoms">${icon('<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>')}</button>`;
    };
    q('.st-names').addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.st-pill'); if (!b) return;
      if (b.classList.contains('st-more')) { names++; showNames(); return; }
      input.value = b.dataset.name!; refreshName(); cont.focus({ preventScroll: true });
    });
    input.addEventListener('input', refreshName);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); toStudio(); } });
    input.value = o.name ?? ''; showNames(); refreshName();
    function toStudio() {
      if (!validFirstName(input.value)) return;
      input.blur(); setStep('look'); stage.paused = false;
      q('#stWhoName').textContent = cleanFirstName(input.value);
      requestAnimationFrame(() => { layout(); setCat(cat); q(`#stTab-${cat}`).focus({ preventScroll: true }); }); void sync();
    }
    cont.addEventListener('click', toStudio);
    // the on-screen keyboard (iOS keeps the layout viewport): the layer follows the visible one, so « Continuer » is never under the keyboard
    const vv = window.visualViewport, fitView = () => { if (vv && root.dataset.step === 'name') { root.style.top = `${vv.offsetTop}px`; root.style.height = `${vv.height}px`; root.style.bottom = 'auto'; } else { root.style.top = ''; root.style.height = ''; root.style.bottom = ''; } };
    vv?.addEventListener('resize', fitView); vv?.addEventListener('scroll', fitView);

    // ------------------------------------------------------------------ step 2: the studio
    const setCat = (c: Cat) => {
      cat = c; root.dataset.cat = c;
      root.querySelectorAll<HTMLElement>('.st-tab').forEach(t => { const on = t.dataset.cat === c; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
      root.querySelectorAll<HTMLElement>('.st-pane').forEach(p => { p.inert = p.dataset.pane !== c; });
      const t = q(`#stTab-${c}`), ink = q('.st-tab-ink');
      ink.style.transform = `translateX(${t.offsetLeft}px)`; ink.style.width = `${t.offsetWidth}px`;
      stage.setFocus(CATS.find(x => x.id === c)!.focus);
      stills();
    };
    q('.st-tabs').addEventListener('click', e => { const t = (e.target as HTMLElement).closest<HTMLElement>('.st-tab'); if (t) setCat(t.dataset.cat as Cat); });
    q('.st-tabs').addEventListener('keydown', e => {
      const i = CATS.findIndex(c => c.id === cat), k = (e as KeyboardEvent).key, n = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0;
      if (n) { e.preventDefault(); const c = CATS[(i + n + CATS.length) % CATS.length].id; setCat(c); q(`#stTab-${c}`).focus({ preventScroll: true }); }
    });
    const renderHairs = () => {
      hairs.innerHTML = HAIRS_FOR[avatar].map(h => `<button type="button" class="st-card st-haircard" data-g="hair" data-v="${h}" aria-pressed="false"><span class="st-thumb"></span><b>${HAIR_LABEL[avatar][h]}</b></button>`).join('');
      hairs.dataset.avatar = avatar;
    };
    const paint = () => {
      if (hairs.dataset.avatar !== avatar) renderHairs();
      root.querySelectorAll<HTMLElement>('[data-g]').forEach(b => {
        const g = b.dataset.g!, v = b.dataset.v!;
        const on = g === 'body' ? avatar === v : g === 'hair' ? look.hair === v : String(look[g as 'skin' | 'outfit' | 'color']) === v;
        b.setAttribute('aria-pressed', String(on));
      });
      root.querySelectorAll<HTMLElement>('.st-weave').forEach(w => { w.setAttribute('style', weave(w.dataset.print!, COLORS[look.color].hex)); });
      q('#stToneName').textContent = SKINS[look.skin].label;
      root.dataset.color = COLORS[look.color].label;
    };
    // the choice cards' pictures: the real avatar in that choice, drawn by the stage, refreshed when what they show changes
    const stillFor = new Map<HTMLElement, string>();
    function stills() {
      if (!live || root.dataset.step !== 'look') return;
      const want: [HTMLElement, Avatar, Appearance, 'face' | 'hair', number, number][] = [];
      if (cat === 'corps') root.querySelectorAll<HTMLElement>('.st-bodycard').forEach(c => { const a = c.dataset.v as Avatar; want.push([c, a, onBody(a, look), 'face', 112, 104]); });
      if (cat === 'coiffure') root.querySelectorAll<HTMLElement>('.st-haircard').forEach(c => want.push([c, avatar, { ...look, hair: c.dataset.v as HairId }, 'hair', 74, 78]));
      for (const [card, a, l, focus, w, h] of want) {
        const key = `${a}:${l.skin}:${l.hair}:${l.outfit}:${l.color}`;
        if (stillFor.get(card) === key) continue;
        stillFor.set(card, key); card.classList.add('st-loading');
        void stage.load(a).then(() => stage.still(a, l, focus, w, h)).then(c => {
          if (!c || stillFor.get(card) !== key || !card.isConnected) return;
          c.className = 'st-pic'; const slot = card.querySelector('.st-thumb')!; slot.replaceChildren(c); card.classList.remove('st-loading');
        });
      }
    }
    async function sync() {
      paint();
      if (!live) { still.hidden = false; still.src = previewUrl(avatar); return; }
      root.classList.toggle('st-waiting', !stage.drawn);
      const ok = await stage.show(avatar, look);
      root.classList.remove('st-waiting');
      if (!ok && !stage.drawn) { root.classList.add('st-flat'); still.hidden = false; still.src = previewUrl(avatar); }
      else if (ok && root.classList.contains('st-flat')) { root.classList.remove('st-flat'); still.hidden = true; }   // a body that failed once drew after all
      stills();
    }
    root.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.st-panel [data-g]'); if (!b || done) return;
      const g = b.dataset.g!, v = b.dataset.v!;
      if (g === 'body') { if (v === avatar) return; avatar = v as Avatar; look = onBody(avatar, look); }
      else if (g === 'hair') look = { ...look, hair: v as HairId };
      else look = { ...look, [g]: Number(v) };
      b.classList.remove('st-pop'); void b.offsetWidth; b.classList.add('st-pop');
      void sync();
    });
    stage.onTurn = () => { root.classList.add('st-turned'); stage.onTurn = null; };

    // ------------------------------------------------------------------ leaving
    const cleanup = () => { ro?.disconnect(); vv?.removeEventListener('resize', fitView); vv?.removeEventListener('scroll', fitView); document.removeEventListener('keydown', onKey, true); stage.dispose(); };
    const portrait = async (): Promise<string | null> => {
      if (!live || !stage.drawn) return null;
      const c = await stage.still(avatar, look, 'face', 160, 160, 0x1d2438);
      try { return c ? c.toDataURL('image/jpeg', 0.86) : null; } catch { return null; }
    };
    const finish = async (save: boolean) => {
      if (done || (save && !edit && !validFirstName(input.value))) return;
      done = true; welcome.inert = top.inert = panel.inert = true;                          // nothing more is chosen while it closes (the arrival card stays announced)
      if (!save) { root.classList.add('st-out'); setTimeout(() => { cleanup(); root.remove(); resolve(null); }, 220); return; }
      // what was chosen, taken at once (the picture is drawn after); a studio that could not draw gives back the saved look
      const name = edit ? null : cleanFirstName(input.value), chosen: Avatar = avatar, appearance = live ? { ...look } : o.keep ?? null, pic = await portrait();
      if (edit) { root.classList.add('st-out'); setTimeout(() => { cleanup(); root.remove(); resolve({ name, avatar: chosen, appearance, portrait: pic, arrive() {} }); }, 220); return; }
      // into the game: the panels go, the camera steps back, the arrival card comes up while the world is built
      root.classList.add('st-leaving'); stage.home();
      q('.st-arrival b').textContent = `Bienvenue, ${name}.`;
      setTimeout(() => {
        root.classList.add('st-arriving');
        setTimeout(() => {
          cleanup();
          let gone = false;
          resolve({ name, avatar: chosen, appearance, portrait: pic, arrive() { if (gone) return; gone = true; root.classList.add('st-arrived'); setTimeout(() => root.remove(), 700); } });
        }, 420);
      }, 380);
    };
    q('#stPlay').addEventListener('click', () => { void finish(true); });
    q('#stBack').addEventListener('click', () => { if (done) return; if (edit) void finish(false); else { setStep('name'); stage.paused = true; fitView(); input.focus({ preventScroll: true }); } });
    // Escape cancels an edit wherever the focus is (after a drag on the stage it is on the page, not in the layer); the game never sees it
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && edit && !done) { e.stopPropagation(); e.preventDefault(); void finish(false); } }
    document.addEventListener('keydown', onKey, true);

    if (new URLSearchParams(location.search).has('debug')) (window as unknown as Record<string, unknown>).__studio = {
      state: () => ({ step: root.dataset.step, cat, avatar, look: { ...look }, name: input.value, drawn: stage.drawn, shown: stage.shown, view: stage.view, extent: stage.extent, info: stage.info, stills: root.querySelectorAll('.st-pic').length, firstBodyMs: stage.firstBodyMs, live }),
      freeze: (on: boolean) => { stage.frozen = on; },
    };
    paint();
    setStep(edit ? 'look' : 'name');
    if (edit) { q('#stWhoName').textContent = o.name ?? ''; root.classList.add('st-edit'); requestAnimationFrame(() => { layout(); setCat('corps'); }); void sync(); q<HTMLButtonElement>('#stPlay').focus({ preventScroll: true }); }
    else { requestAnimationFrame(() => setCat('corps')); input.focus({ preventScroll: true }); }
  });
}
