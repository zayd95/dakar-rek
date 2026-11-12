/** Master sound switch (phone › Réglages). Device-local preference; every synthesised sound goes through it. */
const KEY = 'dakarrek.sound';
let muted = (() => { try { return localStorage.getItem(KEY) === 'off'; } catch { return false; } })();
const listeners = new Set<(muted: boolean) => void>();

export function isMuted(): boolean { return muted; }
export function setMuted(on: boolean) {
  muted = on;
  try { localStorage.setItem(KEY, on ? 'off' : 'on'); } catch { /* preference kept for this session only */ }
  for (const fn of listeners) fn(on);
}
export function onMuteChange(fn: (muted: boolean) => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
