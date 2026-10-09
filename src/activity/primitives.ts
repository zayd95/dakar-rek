import type { Needs } from '../core/types';
import type { Clip } from '../actors/humanoid';
import type { ActivityCategory, ActivitySpec, Effects, Primitive, SeatPick, Step } from './types';

/**
 * Builders for the universal primitives. A place composes them (places.ts): the same `order` makes a Dibi plate, a
 * bowl at the Maïga or a coffee at the corner; the same `work` makes unloading pirogues or helping at a shop.
 * Durations are real seconds (game time is shortened). Texts are French; Wolof touches come from the language library.
 */
export const ICONS: Record<Primitive, string> = {
  enter: '🚪', exit: '🚪', sit: '🪑', stand: '🧍', greet: '👋', talk: '💬', invite: '✉️', buy: '🛒', sell: '💰', order: '🧾',
  eat: '🍽️', drink: '🥤', use: '✋', work: '💼', own: '🔑', rent: '📝', ride: '🚐', alight: '🛑', drive: '🚗', pray: '🤲',
  wash: '💧', sleep: '🛏️', dance: '💃', fish: '🎣', browse: '👀', inspect: '🔍', wait: '⏳', open: '👋', travel: '🚐',
};

interface Base { id: string; label: string; detail?: string; icon?: string; requires?: () => string | null; visible?: () => boolean }
const spec = (primitive: Primitive, b: Base, steps: Step[], price?: number): ActivitySpec =>
  ({ id: b.id, primitive, label: b.label, detail: b.detail, icon: b.icon ?? ICONS[primitive], price, steps, requires: b.requires, visible: b.visible });

/** Order food or drink: pay, wait while it is prepared, sit (nearest free seat by default), eat or drink. */
export function order(b: Base & { price: number; prep?: number; eat?: number; needs: Partial<Needs>; seat?: SeatPick | false; prop?: string; drink?: boolean; category?: ActivityCategory }): ActivitySpec {
  const steps: Step[] = [{ label: b.drink ? 'On te sert' : 'Préparation', primitive: 'wait', seconds: b.prep ?? 2 }];
  if (b.seat !== false) steps.push({ label: 'Tu t’installes', primitive: 'sit', seat: b.seat ?? 'near' });
  steps.push({ label: b.drink ? 'Tu bois' : 'Tu manges', primitive: b.drink ? 'drink' : 'eat', seconds: b.eat ?? 4, prop: b.prop,
    effects: { needs: b.needs, counters: b.drink ? undefined : { meals: 1 }, category: b.category ?? 'loisir' } });
  return spec('order', b, steps, b.price);
}

/** Buy goods: pay, receive the items (inventory, home or business — the place decides with `then`). */
export function buy(b: Base & { price: number; items?: Record<string, number>; seconds?: number; then?: () => void }): ActivitySpec {
  return spec('buy', b, [{ label: 'Paiement', primitive: 'buy', seconds: b.seconds ?? 1, effects: { items: b.items, category: 'commerce' }, then: b.then }], b.price);
}

/** Sell goods you carry: the buyer pays, the items leave the inventory. */
export function sell(b: Base & { price: number; items: Record<string, number>; seconds?: number }): ActivitySpec {
  const out = Object.fromEntries(Object.entries(b.items).map(([k, v]) => [k, -Math.abs(v)]));
  return spec('sell', b, [{ label: 'Vente', primitive: 'sell', seconds: b.seconds ?? 1.5, effects: { money: b.price, items: out, category: 'commerce' } }]);
}

/** Work a shift: time, a clip, pay and fatigue. */
export function work(b: Base & { pay: number; seconds: number; needs?: Partial<Needs>; counter?: string; category: ActivityCategory; clip?: Clip; items?: Record<string, number>; seat?: SeatPick }): ActivitySpec {
  return spec('work', b, [{ label: b.label, primitive: 'work', seconds: b.seconds, clip: b.clip, seat: b.seat,
    effects: { money: b.pay, needs: b.needs, counters: b.counter ? { [b.counter]: 1, shifts: 1 } : { shifts: 1 }, category: b.category, items: b.items } }]);
}

/** Use an object or a spot (mirror, radio, tap, shower, game table…): optional seat, a clip, effects. */
export function use(b: Base & { seconds: number; effects?: Effects; clip?: Clip; seat?: SeatPick; primitive?: Primitive; price?: number; then?: () => void }): ActivitySpec {
  return spec(b.primitive ?? 'use', b, [{ label: b.label, primitive: b.primitive ?? 'use', seconds: b.seconds, clip: b.clip, seat: b.seat, effects: b.effects, then: b.then }], b.price);
}

/** Sleep in a bed (lying pose comes with the asset lane; for now the character sits on the bed). */
export function sleep(b: Base & { seat?: SeatPick; seconds?: number; energy?: number }): ActivitySpec {
  return spec('sleep', b, [{ label: 'Tu dors', primitive: 'sleep', seconds: b.seconds ?? 6, seat: b.seat ?? 'near', effects: { needs: { energie: b.energy ?? 60, moral: 4 } } }]);
}

/**
 * Religious practice brings no reward (Habib, 9 Oct): ablutions and prayer change no need, no money, no counter and no
 * activity category. They stay calm, seat-based and interruptible like everything else. A plain wash at a public tap or
 * a basin is a hygiene action (`use` with the 'wash' verb), not this primitive.
 */
/** Ablutions at a tap (optionally seated on the low stool in front of it). No effects. */
export function wash(b: Base & { seconds?: number; seat?: SeatPick; then?: () => void }): ActivitySpec {
  return spec('wash', b, [{ label: 'Ablutions', primitive: 'wash', seconds: b.seconds ?? 3, seat: b.seat, then: b.then }]);
}

/** Pray: optional ablutions first, then a moment on a prayer row. No effects; no recitation text is ever shown. */
export function pray(b: Base & { wash?: boolean; seat?: SeatPick; seconds?: number }): ActivitySpec {
  const steps: Step[] = [];
  if (b.wash) steps.push({ label: 'Ablutions', primitive: 'wash', seconds: 3 });
  steps.push({ label: 'Prière', primitive: 'pray', seconds: b.seconds ?? 6, seat: b.seat ?? 'near' });
  return spec('pray', b, steps);
}

/** Dance: a clip, mood and company. */
export function dance(b: Base & { seconds?: number; clip?: Clip; price?: number }): ActivitySpec {
  return spec('dance', b, [{ label: 'Tu danses', primitive: 'dance', seconds: b.seconds ?? 6, clip: b.clip ?? 'Dance_A', effects: { needs: { moral: 10, social: 8, energie: -6 }, category: 'loisir' } }], b.price);
}

/** Fish or work the catch: time, a clip, pay and/or fish in the inventory. */
export function fish(b: Base & { seconds: number; pay?: number; fish?: number }): ActivitySpec {
  return spec('fish', b, [{ label: b.label, primitive: 'fish', seconds: b.seconds, clip: 'Grab',
    effects: { money: b.pay, items: b.fish ? { poisson: b.fish } : undefined, needs: { energie: -8, hygiene: -4 }, category: 'peche' } }]);
}

/** Greet someone: a short exchange, a little company, the relationship moves (`then` shows the line). */
export function greet(b: Base & { npc?: string; then?: () => void }): ActivitySpec {
  return { ...spec('greet', b, [{ label: 'Salut', primitive: 'greet', seconds: 1.2, clip: 'Talk', effects: { needs: { social: 3 }, rel: b.npc ? { [b.npc]: 1 } : undefined, category: 'social' }, then: b.then }]), quiet: true };
}

/**
 * Hand-over primitives: the activity starts a dedicated system right away (conversation, ownership sheet, boarding,
 * invitation, browsing, entering a space). They share the same button, icon and availability rules as the rest.
 */
export function handOver(primitive: Primitive, b: Base & { then: () => void; price?: number }): ActivitySpec {
  return { ...spec(primitive, b, [{ label: b.label, primitive, then: b.then }], b.price), quiet: true };
}
export const talk = (b: Base & { then: () => void }) => handOver('talk', b);
export const invite = (b: Base & { then: () => void }) => handOver('invite', b);
export const own = (b: Base & { then: () => void }) => handOver('own', b);
export const rent = (b: Base & { then: () => void }) => handOver('rent', b);
export const ride = (b: Base & { then: () => void; price?: number }) => handOver('ride', b);
export const enter = (b: Base & { then: () => void }) => handOver('enter', b);
export const browse = (b: Base & { then: () => void }) => handOver('browse', b);
export const inspect = (b: Base & { then: () => void }) => handOver('inspect', b);
