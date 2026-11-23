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
  /**
   * Replace the game by an imported one and reload; false when the storage refuses. `key`: the online account's device key the code carries (LD2.0-B),
   * installed with the game (src/core/saveTransfer.ts importSave), or null for a code without one.
   */
  replace(data: SaveData, profile: CodeProfile | null, key?: string | null): boolean;
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
let pending: { data: SaveData; profile: CodeProfile | null; key: string | null } | null = null;
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
  const b = (sv: string, label: string, sub = '', kind = 'secondary') => `<button type="button" class="pk-btn ${kind}" data-sv="${sv}"><span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`;
  const plays = sum ? `${Math.floor(sum.playedMin / 60)} h ${String(sum.playedMin % 60).padStart(2, '0')} de jeu · ${sum.vehicles} véhicule${sum.vehicles > 1 ? 's' : ''} · ${sum.furniture} meuble${sum.furniture > 1 ? 's' : ''}` : '';
  return `<div class="ph-save">
    <p class="ph-save-line ${line.tone}" role="status">${esc(line.text)}</p>
    ${b('now', 'Sauvegarder maintenant')}
    ${b('copy', 'Copier ma sauvegarde', 'Un code qui contient toute ta partie')}
    ${panel === 'copy' ? `<div class="ph-save-io"><textarea class="ph-code" readonly rows="3" aria-label="Code de ta sauvegarde">${esc(copied)}</textarea>
      <p class="pk-note">Copie refusée ? Touche le code, sélectionne tout, puis copie.</p>
      <p class="pk-note warn">Ce code contient aussi la clé de ton compte en ligne (Messages, Teranga Money) : ne le partage avec personne.</p>
      ${h.framed ? '' : b('file', 'Enregistrer un fichier', 'dakar-rek-sauvegarde.txt')}</div>` : ''}
    ${b('import', 'Importer une sauvegarde', 'Un code copié depuis le jeu, ou son fichier')}
    ${panel === 'import' ? `<div class="ph-save-io">
      ${sum ? `<div class="pk-rows"><div class="pk-row"><span class="pk-tx"><b>Partie du ${esc(when)}</b><small>${esc(plays)}</small></span><em class="pk-val">${esc(fcfa(sum.wallet))}</em></div>
          <div class="pk-row"><span class="pk-tx"><b>Domicile principal</b></span><em class="pk-val">${esc(sum.home)}</em></div></div>
        <p class="pk-note warn">Elle remplace la partie de cet appareil. Ta partie actuelle est gardée de côté : tu pourras y revenir.</p>
        ${pending?.key ? '<p class="pk-note warn">Ce code contient un compte en ligne : il remplacera celui de cet appareil (Messages, Teranga Money).</p>' : ''}
        ${b('apply', 'Remplacer ma partie', '', 'danger')}`
      : `<textarea class="ph-code" rows="3" placeholder="Colle ici le code DAKARREK6:…" aria-label="Code à importer"></textarea>
        <label class="pk-btn secondary ph-file"><span>Choisir un fichier</span><input type="file" accept=".txt,.json,text/plain,application/json" hidden></label>
        ${lastError ? `<p class="pk-note warn" role="alert">${esc(lastError)}</p>` : ''}
        ${b('check', 'Vérifier le code', '', 'primary')}`}
      ${b('cancel', 'Annuler', '', 'quiet')}</div>` : ''}
    ${h.canUndo() ? b('undo', 'Revenir à la partie d’avant l’import', 'Celle qu’un import a remplacée ici') : ''}
    <p class="pk-note">Ta partie reste sur cet appareil. Pour changer de téléphone : copie le code ici, importe-le là-bas. Le code est aussi la clé de ton compte en ligne : ne le partage pas.</p>
  </div>`;
}

/** `notify`: the phone's own toast (what the player sees while the phone covers the HUD); the hook's toast (the HUD's) when there is none. */
export function bindSaveCard(root: HTMLElement, rerender: () => void, notify?: (m: string, kind?: 'ok' | 'warn') => void) {
  const h = phoneHooks.saveCard; if (!h) return;
  const say = (m: string, kind?: 'ok' | 'warn') => (notify ? notify(m, kind) : h.toast(m));
  const on = (k: string, fn: () => void) => root.querySelector(`[data-sv="${k}"]`)?.addEventListener('click', fn);
  const check = (text: string) => {
    const r = readCode(text);
    if ('error' in r) { lastError = r.error; pending = null; } else { lastError = ''; pending = r; }
    rerender();
  };
  on('now', () => { const ok = h.save(); say(ok ? 'Partie sauvegardée sur cet appareil' : 'Sauvegarde impossible sur ce navigateur : copie ta sauvegarde', ok ? 'ok' : 'warn'); rerender(); });
  on('copy', () => {
    const code = copied = h.code();
    panel = 'copy'; pending = null; lastError = '';
    const done = (ok: boolean) => { say(ok ? 'Code copié · garde-le dans tes notes' : 'Copie refusée ici : sélectionne le code affiché', ok ? 'ok' : undefined); rerender(); };
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
    if (!h.replace(p.data, p.profile, p.key)) { lastError = 'Ce navigateur refuse d’enregistrer : rien n’a été remplacé.'; panel = 'import'; rerender(); }
  });
  on('undo', () => { if (!h.undo()) say('Impossible de revenir en arrière ici', 'warn'); });
  // the code box selects itself on a tap (copying by hand where the clipboard is refused)
  root.querySelector<HTMLTextAreaElement>('.ph-code[readonly]')?.addEventListener('focus', e => (e.target as HTMLTextAreaElement).select());
}
