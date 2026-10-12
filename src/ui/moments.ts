/**
 * Which moment cards stay in the toast column (pure; tests/boutCardLayout.test.ts). `live`: the cards shown, oldest
 * first and the one just added last, each marked when it is the fighter's after-bout card (hud.boutCard). Two at most;
 * the after-bout card says the bout's result itself, so the cards before it go when it comes, and it stays while later
 * cards come and go (the oldest of the others goes first). Returns the indices to drop.
 */
export function momentsToDrop(live: readonly boolean[]): number[] {
  const last = live.length - 1;
  if (last < 0) return [];
  if (live[last]) return live.map((_, i) => i).filter(i => i !== last);
  const out: number[] = [];
  let n = live.length;
  for (let i = 0; i < last && n > 2; i++) if (!live[i]) { out.push(i); n--; }
  return out;
}
