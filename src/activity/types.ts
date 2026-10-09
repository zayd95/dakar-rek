/**
 * Universal activity primitives (docs/LIVING_DAKAR.md): enter, sit, talk, buy, sell, eat, use, work, own, ride, invite…
 * Every place in Dakar composes the same primitives differently — a Dibi is « order → wait → sit → eat », a mosque is
 * « enter → wash → pray → sit → talk », a salon is « sit → buy a service → appearance changes ». An ActivitySpec is
 * data (steps + effects); the ActivityRunner (runner.ts) plays any of them the same way.
 */
import type { Needs } from '../core/types';
import type { Clip } from '../actors/humanoid';
import type { SeatKind } from '../interact/seats';

export type Primitive =
  | 'enter' | 'exit' | 'sit' | 'stand' | 'greet' | 'talk' | 'invite'
  | 'buy' | 'sell' | 'order' | 'eat' | 'drink' | 'use' | 'work' | 'own' | 'rent'
  | 'ride' | 'alight' | 'drive' | 'pray' | 'wash' | 'sleep' | 'dance' | 'fish' | 'browse' | 'inspect' | 'wait'
  /** Interface verbs: open a place's sheet, the legacy hub-to-hub trip. */
  | 'open' | 'travel';

/** Kinds of life activity (the economy's polyvalence counts how many a player practises). */
export type ActivityCategory =
  | 'livraison' | 'service' | 'commerce' | 'combat' | 'peche' | 'artisanat' | 'social' | 'spirituel' | 'loisir' | 'transport';

/** Everything an activity can change, applied in one place (effects.ts). */
export interface Effects {
  /** Money: positive = earned, negative = spent (written to the wallet history with `label`). */
  money?: number;
  /** Wallet history line (defaults to « activity · place »). */
  label?: string;
  needs?: Partial<Needs>;
  counters?: Record<string, number>;
  /** Inventory change: item id → count (+ received, − used or sold). */
  items?: Record<string, number>;
  /** Relationship change with recurring characters: npc id → delta. */
  rel?: Record<string, number>;
  flags?: string[];
  category?: ActivityCategory;
}

/** A spoken line: fixed, or picked afresh each time the step starts (Wolof exchanges from src/i18n/lines.ts). */
export type Line = string | (() => string);

/** Which seat a step uses: a seat id, the nearest free one in the place, or the nearest of a kind around a point. */
export type SeatPick = string | 'near' | { near: { x: number; z: number }; r?: number; kind?: SeatKind };

export interface Step {
  /** Shown in the progress bar: « Cuisson », « Tu manges », « Ablutions ». */
  label: string;
  primitive: Primitive;
  /** Real seconds (game actions are shortened). 0 or absent = instant. */
  seconds?: number;
  /** Clip the player's body holds during the step (Sit is set by the seat). */
  clip?: Clip;
  /** Take a seat for this step (and stay seated afterwards). */
  seat?: SeatPick;
  /** Prop id the place shows during the step (plate, glass, prayer mat…). */
  prop?: string;
  /** Said when the step starts (shown like a toast): « Toi : « Ñaata la ? » · Vendeuse : « 700 F. » ». */
  line?: Line;
  effects?: Effects;
  /** Called when the step ends (after its effects): open a conversation, change the hairstyle, board… */
  then?: () => void;
}

export interface ActivityCtx {
  /** Place running the activity (for labels and props). */
  place?: string;
}

export interface ActivitySpec {
  id: string;
  /** The verb shown on buttons and used for the icon. */
  primitive: Primitive;
  label: string;
  icon?: string;
  detail?: string;
  /** Paid once at the start (the wallet history line names the activity and the place). */
  price?: number;
  steps: Step[];
  /** Reason it cannot be done now, or null. */
  requires?: () => string | null;
  visible?: () => boolean;
  /** No « ✓ » toast at the end (conversations and hand-overs speak for themselves). */
  quiet?: boolean;
}
