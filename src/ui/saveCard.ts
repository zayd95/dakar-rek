import { phoneHooks } from './phoneHooks';
import { saveLine } from '../core/saveHealth';
import { readCode, summarize, type CodeProfile } from '../core/saveTransfer';
import type { SaveData } from '../core/types';
import { fcfa } from './hud';

/**
 * « Partie » in the phone's settings: one honest line about where the game is kept (src/core/saveHealth.ts), save now, copy the save as a code, import
 * one (src/core/saveTransfer.ts), and go back to the game an import replaced. The phone shows it where `saveCardHtml()` is placed and binds it with
 * `bindSaveCard`; main.ts provides `phoneHooks.saveCard`.
 */
export interface SaveCardHooks {
  /** Write now: true when the storage took it. */
  save(): boolean;
  /** The current game as a code (saved first). */
  code(): string;
  /** Replace the game by an imported one and reload; false when the storage refuses. */
  replace(data: SaveData, profile: CodeProfile | null): boolean;
  canUndo(): boolean;
  undo(): boolean;
  /** Catalogue name and kind of an asset id, for the summary of a code. */
  nameOf(spec: string): { name: string; kind: string } | undefined;
  toast(m: string): void;
  /** A page in another site's frame: no file download there (the frame blocks it), the code is copied instead. */
  framed: boolean;
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** The import being checked, kept while the phone re-renders. */
let pending: { data: SaveData; profile: CodeProfile | null } | null = null;
let panel: 'none' | 'copy' | 'import' = 'none';
let lastError = '';
/** The code shown after « Copier » (made once per tap: making it saves the game). */
let copied = '';

export function saveCardHtml(): string {
  const h = phoneHooks.saveCard;
  if (!h) return '';
  const line = saveLine();
  const sum = pending ? summarize(pending.data, h.nameOf) : null;
  const when = sum ? new Date(sum.savedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  return `<div class="ph-save">
    <p class="ph-save-line ${line.tone}" role="status">${esc(line.text)}</p>
    <button type="button" class="ph-btn" data-sv="now">Sauvegarder maintenant</button>
    <button type="button" class="ph-btn" data-sv="copy">Copier ma sauvegarde<small>Un code à garder dans tes notes ou à t’envoyer : il contient toute ta partie</small></button>
    ${panel === 'copy' ? `<div class="ph-save-io"><textarea class="ph-code" readonly rows="3" aria-label="Code de ta sauvegarde">${esc(copied)}</textarea>
      <p class="ph-note">Si la copie n’a pas marché : touche le code, sélectionne tout, puis copie.</p>
      ${h.framed ? '' : '<button type="button" class="ph-btn" data-sv="file">Enregistrer un fichier<small>dakar-rek-sauvegarde.txt</small></button>'}</div>` : ''}
    <button type="button" class="ph-btn" data-sv="import">Importer une sauvegarde<small>Colle un code copié depuis le jeu, ou choisis le fichier</small></button>
    ${panel === 'import' ? `<div class="ph-save-io">
      ${sum ? `<div class="ph-rows"><div><span>Partie du ${esc(when)}<small>${Math.floor(sum.playedMin / 60)} h ${String(sum.playedMin % 60).padStart(2, '0')} de jeu · ${sum.vehicles} véhicule${sum.vehicles > 1 ? 's' : ''} · ${sum.furniture} meuble${sum.furniture > 1 ? 's' : ''}</small></span><em>${fcfa(sum.wallet)}</em></div>
          <div><span>Domicile principal</span><em>${esc(sum.home)}</em></div></div>
        <p class="ph-note warn">Elle remplace la partie de cet appareil. Ta partie actuelle est gardée de côté : tu pourras y revenir.</p>
        <button type="button" class="ph-btn danger" data-sv="apply">Remplacer ma partie</button>`
      : `<textarea class="ph-code" rows="3" placeholder="Colle ici le code DAKARREK6:…" aria-label="Code à importer"></textarea>
        <label class="ph-btn ph-file">Choisir un fichier<input type="file" accept=".txt,.json,text/plain,application/json" hidden></label>
        ${lastError ? `<p class="ph-note warn" role="alert">${esc(lastError)}</p>` : ''}
        <button type="button" class="ph-btn" data-sv="check">Vérifier le code</button>`}
      <button type="button" class="ph-btn" data-sv="cancel">Annuler</button></div>` : ''}
    ${h.canUndo() ? '<button type="button" class="ph-btn" data-sv="undo">Revenir à la partie d’avant l’import<small>Celle qu’un import a remplacée sur cet appareil</small></button>' : ''}
    <p class="ph-note">Ta partie reste sur cet appareil : elle ne passe pas toute seule sur un autre téléphone. Pour changer d’appareil, copie le code ici et importe-le là-bas.</p>
  </div>`;
}

export function bindSaveCard(root: HTMLElement, rerender: () => void) {
  const h = phoneHooks.saveCard; if (!h) return;
  const on = (k: string, fn: () => void) => root.querySelector(`[data-sv="${k}"]`)?.addEventListener('click', fn);
  const check = (text: string) => {
    const r = readCode(text);
    if ('error' in r) { lastError = r.error; pending = null; } else { lastError = ''; pending = r; }
    rerender();
  };
  on('now', () => { h.toast(h.save() ? 'Partie sauvegardée sur cet appareil' : 'Sauvegarde impossible sur ce navigateur : copie ta sauvegarde'); rerender(); });
  on('copy', () => {
    const code = copied = h.code();
    panel = 'copy'; pending = null; lastError = '';
    const done = (ok: boolean) => { h.toast(ok ? 'Code copié · garde-le dans tes notes' : 'Copie refusée ici : sélectionne le code affiché'); rerender(); };
    try { navigator.clipboard.writeText(code).then(() => done(true), () => done(false)); } catch { done(false); }   // must start inside the tap
  });
  on('file', () => {
    const url = URL.createObjectURL(new Blob([copied || h.code()], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'dakar-rek-sauvegarde.txt' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  });
  on('import', () => { panel = panel === 'import' ? 'none' : 'import'; pending = null; lastError = ''; rerender(); });
  on('cancel', () => { panel = 'none'; pending = null; lastError = ''; rerender(); });
  on('check', () => check(root.querySelector<HTMLTextAreaElement>('.ph-save-io textarea')?.value ?? ''));
  root.querySelector<HTMLInputElement>('.ph-file input')?.addEventListener('change', e => {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
    if (f.size > 4_000_000) { lastError = 'Ce fichier est trop gros pour être une sauvegarde.'; rerender(); return; }
    f.text().then(check, () => { lastError = 'Fichier illisible.'; rerender(); });
  });
  on('apply', () => {
    if (!pending) return;
    const p = pending; pending = null; panel = 'none';
    if (!h.replace(p.data, p.profile)) { lastError = 'Ce navigateur refuse d’enregistrer : rien n’a été remplacé.'; panel = 'import'; rerender(); }
  });
  on('undo', () => { if (!h.undo()) h.toast('Impossible de revenir en arrière ici'); });
  // the code box selects itself on a tap (copying by hand where the clipboard is refused)
  root.querySelector<HTMLTextAreaElement>('.ph-code[readonly]')?.addEventListener('focus', e => (e.target as HTMLTextAreaElement).select());
}
