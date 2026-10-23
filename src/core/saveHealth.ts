/**
 * What the game may say about its save (docs/SAVES.md § « Where the save lives »): it never claims a save the storage refused.
 * main.ts reports every write here; the phone, the wallet and the settings read `saveLine()`.
 *
 * Where a guest save lives, honestly:
 * - On this device, in this browser only: nothing synchronises it to another phone (no account yet).
 * - A page shown inside another site's frame (the Claude artifact preview) gets « third-party » storage: WebKit (every browser on iOS, the Claude app
 *   included) partitions it AND makes it ephemeral, so it can be gone when the app is closed. The preview's host page may keep a copy of its own (the
 *   artifact's per-viewer store, `__dakarSaveMirror`); otherwise the game says so and offers the export.
 */
export interface SaveMirror {
  /** « ton compte Claude (aperçu) »: where the host page keeps its copy. */
  label: string;
  /** null: not tried yet; false: the copy was refused (a viewer who may not write, a full store). */
  ok: boolean | null;
  /** Date.now() of the last copy kept. */
  at: number;
}
export interface SaveHealth {
  /** null: nothing written yet this visit. */
  ok: boolean | null;
  /** Date.now() of the last write that succeeded. */
  at: number;
  /** Writes refused in a row (full or blocked storage). */
  failures: number;
  /** No storage at all (site data blocked, some private modes). */
  noStorage: boolean;
  /** The page runs in another site's frame: its storage may last only as long as the app (see above). */
  framed: boolean;
}

const health: SaveHealth = { ok: null, at: 0, failures: 0, noStorage: false, framed: false };
/** Writes are held after an import or a New Game: the page reloads and nothing must write the old game back on the way out. */
let held = false;

export function initSaveHealth(hasStorage: boolean, framed = isFramed()) { health.noStorage = !hasStorage; health.framed = framed; }
export function reportWrite(ok: boolean, now = Date.now()) {
  health.ok = ok;
  if (ok) { health.at = now; health.failures = 0; } else health.failures++;
}
export const saveHealth = (): Readonly<SaveHealth> => health;
export const holdSaves = () => { held = true; };
export const savesHeld = () => held;

export function isFramed(): boolean {
  try { return typeof window !== 'undefined' && window.self !== window.top; } catch { return true; }   // a cross-origin parent throws: framed
}
/** The copy kept by the page that hosts the game, if it keeps one (the artifact preview's packer sets it). */
export function saveMirror(): SaveMirror | null {
  const m = (globalThis as { __dakarSaveMirror?: SaveMirror }).__dakarSaveMirror;
  return m && typeof m.label === 'string' ? m : null;
}

/** « il y a 12 s », « il y a 3 min », « à 14:05 ». */
export function ago(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `il y a ${s} s`;
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  const d = new Date(at);
  return `à ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export type SaveTone = 'ok' | 'warn' | 'bad';
/** One honest line about the save, and how worried to be. */
export function saveLine(h: Readonly<SaveHealth> = health, mirror: SaveMirror | null = saveMirror(), now = Date.now()): { tone: SaveTone; text: string } {
  if (h.noStorage) return { tone: 'bad', text: 'Sauvegarde impossible : ce navigateur bloque le stockage. Copie ta sauvegarde pour ne rien perdre.' };
  if (h.ok === false) return { tone: 'bad', text: `La dernière sauvegarde a échoué (stockage plein ou bloqué)${h.at ? ` · la précédente date ${ago(h.at, now)}` : ''}. Copie ta sauvegarde pour ne rien perdre.` };
  if (h.ok === null) return { tone: 'warn', text: 'Pas encore sauvegardée pendant cette visite.' };
  if (mirror?.ok) return { tone: 'ok', text: `Sauvegardée ${ago(h.at, now)} sur cet appareil, et une copie sur ${mirror.label} (${ago(mirror.at, now)}).` };
  if (h.framed) {
    return { tone: 'warn', text: `Sauvegardée ${ago(h.at, now)}, mais cet aperçu est intégré à une autre page : le navigateur peut l’effacer quand l’app se ferme. Copie ta sauvegarde de temps en temps.` };
  }
  return { tone: 'ok', text: `Sauvegardée ${ago(h.at, now)} sur cet appareil (elle ne passe pas toute seule sur un autre téléphone).` };
}
/** The short form for notes under the wallet or the profile: empty when there is nothing reassuring to say. */
export function savedNote(h: Readonly<SaveHealth> = health, mirror: SaveMirror | null = saveMirror()): string {
  const l = saveLine(h, mirror);
  return l.tone === 'ok' ? 'Partie invité : gardée sur cet appareil.' : l.tone === 'bad' ? 'Partie invité : la sauvegarde ne fonctionne pas sur ce navigateur (Réglages › Partie).' : 'Partie invité : pense à copier ta sauvegarde (Réglages › Partie).';
}
