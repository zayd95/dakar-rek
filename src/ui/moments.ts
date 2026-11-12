/**
 * Moment cards, one at a time (pure; tests/quiet.test.ts; docs/UI_V2_PLAN.md §0 C 5). A moment card (a recap, a new
 * word on a gauge, Tonton Ibou's word) or the fighter's after-bout card (hud.boutCard) sits at the top or the side,
 * never over the ring or the player; it leaves by itself, or at a tap.
 * `showing`: the card on screen ('bout': the after-bout card; 'moment': any other; null: none). `incoming`: the new
 * one. 'show': it replaces the card on screen. 'wait': it waits until the after-bout card leaves — the bout's result is
 * not pushed away by a recap.
 */
export type MomentKind = 'bout' | 'moment';
export function momentArrives(showing: MomentKind | null, incoming: MomentKind): 'show' | 'wait' {
  return showing === 'bout' && incoming === 'moment' ? 'wait' : 'show';
}
/** At most this many cards wait; an older waiting card goes to the quiet log instead. */
export const MOMENT_QUEUE = 2;
