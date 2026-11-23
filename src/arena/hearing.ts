/**
 * What the arena's sound needs to know of the show, shared without imports (src/lamb/audio.ts, src/arena/module.ts and
 * src/arena/soundscape.ts all read or write it; none of them imports the others for it).
 *   - `phase`, `crowd`, `excite`: the evening's show phase, how full the stands are and how roused (0..1), written every frame by src/arena/module.ts;
 *   - `moment`: the stands' last moment (an entrance, a fall, the result…), written by src/arena/module.ts when it happens,
 *     so the cheer that follows it in the same frame is the right one (a gasp and a roar for a fall, ululations for a result);
 *   - `stands`: how much of the stands the player hears where they are (1 inside the walls, less over them, 0 far off,
 *     indoors or with the sound off) and `muffled` (heard over the wall), written by src/arena/soundscape.ts. `active` is
 *     false where no arena is near (another hub): the làmb's own sounds then play as they are (a bout started from the phone).
 */
export const arenaHearing = {
  phase: 'idle' as string,
  crowd: 0,
  /** How roused the stands are now (0..1: src/crowd/reactions.ts), written with `crowd`. */
  excite: 0,
  moment: null as { m: string; side: string | null; at: number } | null,
  active: false,
  stands: 1,
  muffled: false,
};
/** How loud a sound of the stands is for the player (a cheer, the announcer's chime): 1 where no arena is near. */
export const standsGain = () => (arenaHearing.active ? arenaHearing.stands : 1);

let gestured = false;
let listening = false;
/** Whether the player has tapped, clicked or pressed a key yet (sound may only start after that). Re-exported by src/arena/exteriorAudio.ts. */
export const hasGestured = () => gestured;
/** Watches for the first user gesture (once per page). */
export function listenForGesture() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  const on = () => { gestured = true; };
  for (const type of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(type, on, { once: true, capture: true, passive: true });
}
