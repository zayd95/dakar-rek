import { loadSave, writeSave } from '../core/save';
import { ShowcaseStorage, showcaseSave } from './save';

/**
 * LD2.0-D lane V-E: the owner's private showcase's start screen (docs/ld2/LD2_D.md, decision 10). main.ts imports this file only behind
 * `import.meta.env.VITE_OWNER_SHOWCASE === '1'`, which vite.config.ts and vite.artifact.config.ts replace at build time from the shell's environment
 * alone (showcaseFlag.ts): every other build — the public one, .env.online, CI — compiles it out, so no username, link or client flag can bring it back.
 *
 * Before the game reads its save, a card offers « Ma partie » (the player's own game, untouched) or « Vitrine du propriétaire »: the showcase's own save
 * under its own keys (src/showcase/save.ts), made on the first visit (the villa, its pieces, the Lamane Sport in its bay, a comfortable wallet).
 * Returns the storage the game must use from then on.
 */
export async function chooseStart(real: Storage | null): Promise<Storage | null> {
  if (!real || typeof document === 'undefined') return real;
  const pick = await new Promise<'own' | 'showcase'>(resolve => {
    const el = document.createElement('section');
    el.id = 'owner-showcase';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:radial-gradient(120% 90% at 50% 10%,#1d3557 0%,#0b1626 70%);font:16px/1.35 system-ui,-apple-system,sans-serif;color:#f4efe4;padding:24px';
    el.innerHTML = `
      <div style="width:min(360px,100%);text-align:center">
        <div style="font-weight:900;letter-spacing:.06em;color:#f2c230;font-size:14px">DAKAR REK · APERÇU PRIVÉ</div>
        <h1 style="margin:10px 0 6px;font-size:26px">Bienvenue</h1>
        <p style="margin:0 0 22px;opacity:.85">Ta partie, ou la villa des Almadies telle qu’on peut la vivre.</p>
        <button type="button" data-pick="own" style="display:block;width:100%;margin:0 0 12px;padding:15px;border-radius:14px;border:1px solid #f4efe455;background:transparent;color:inherit;font:700 17px system-ui">Ma partie</button>
        <button type="button" data-pick="showcase" style="display:block;width:100%;padding:15px;border-radius:14px;border:0;background:#f2c230;color:#1b1406;font:800 17px system-ui">Vitrine du propriétaire</button>
        <p style="margin:14px 0 0;font-size:13px;opacity:.7">La vitrine a sa propre sauvegarde : ta partie n’est jamais touchée.</p>
      </div>`;
    el.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-pick]'); if (!b) return;
      el.remove(); resolve(b.dataset.pick === 'showcase' ? 'showcase' : 'own');
    });
    document.body.appendChild(el);
  });
  if (pick === 'own') return real;
  const store = new ShowcaseStorage(real);
  if (!loadSave(store)) writeSave(store, showcaseSave());
  return store;
}
