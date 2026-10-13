/**
 * Where to rest in this neighbourhood (docs/UI_V2_PLAN.md §4.2 hole 3): the tired refusals (« Repose-toi avant ce
 * service ») and phone › Santé name the place, not only the advice. Pure but for the one value main.ts sets when a
 * hub loads (tests/walk.test.ts).
 */
export interface RestPlace { name: string; actions: readonly { label: string; cost?: number; needs?: { energie?: number }; special?: string }[] }

/**
 * The free rest of this hub, said as « Place des voisins · Ngor : « Se poser à l'ombre » », or the player's own bed in
 * the hub they live in (« ta chambre : « Dormir » »). Null: nothing free here (the Santé tip then stays general).
 */
export function restSpot(places: readonly RestPlace[], homeName: string | null): string | null {
  if (homeName) return `${homeName} : « Dormir »`;
  for (const p of places) for (const a of p.actions) {
    if (!a.special && !(a.cost ?? 0) && (a.needs?.energie ?? 0) > 0) return `${p.name} : « ${a.label} »`;
  }
  return null;
}

let here: string | null = null;
/** main.ts, on every hub load (and on moving home): the rest spot of the hub the player is in. */
export const setRestSpot = (s: string | null) => { here = s; };
export const restSpotHere = () => here;
/** The tired refusal of paid work, with the place to rest when there is one. */
export const tiredReason = () => (here ? `Repose-toi avant ce service · ${here}` : 'Repose-toi avant ce service');
