import * as THREE from 'three';
import { Wrestler, Humanoid, randomLook, lookFromOutfit, wrestlerReady, type Clip } from '../actors/humanoid';
import type { Input } from '../core/input';
import type { WrestlerLook } from '../core/types';
import { rng } from '../core/rng';
import { castById } from '../social/cast';
import { Percussion, crowdCheer, fallThud, gripSlap, strikeSound } from './audio';
import { DuelFx, FX, clinchFraming, contactShift, mixFraming, pairHalfWidth, type FxEvent, type Framing } from './fx';
import { buzz } from '../transport/haptics';
import { fovFor } from '../core/view';
import {
  AVERAGE, STAND, STAND_STYLES, STRIKES, URGE, decide, frappeBreath, frappeFactor, frappePace, frappeSlow, rangeOf, urgeOf, free, land, react, reactDelay, standState, startStrike, tick,
  type Attributes, type Reaction, type StandState, type StandStyle, type StrikeKind,
} from './stand';
import { StrikeRig } from './strikeRig';
import { LESSON, advance, coachLine, feedback, hear, startLesson, stepNumber, type Lesson, type LessonEvent } from './lesson';
import { DRILLS, callWord, drillFeedback, drillLine, drillScore, drillTick, drillVerdict, hearDrill, startDrill, type DrillEvent, type DrillId, type DrillRun } from './drills';
import { utter } from '../i18n/lines';
import {
  CLINCH, CLINCH_STYLES, ENTRY_BONUS, ENTRY_TEXT, MOVES, THROW, clinchDecide, clinchPower, counterScore, counterThrow, entryGrip, exchange, gripWords, holdTick, posture, startMove,
  throwLands, tryBreak, wantsCounter, wantsThrow, clinchUrge,
  type ClinchMove, type ClinchStyle, type Entry, type Exchange, type Posture,
} from './clinch';
import { inGate, tierRadius, tierTop, TIERS } from '../world/geew';
import {
  COMBAT, GRIPS, PASSIVE, THROWS, aimLoss, bestThrow, braceAgainst, braceCost, braceFactor, combatDecision, combatPoints, commitTick, control, emptyTally, entryHolds, exposure,
  gripAdvantage, gripTick, isCombo, lean, legOpen, moveDir, reachFor, reverseFall, shove, slipFall, stickMove, throwFails, throwScore, wear,
  type CombatTally, type FallKind, type GripKind, type Hold, type ThrowId, type Vec,
} from './combat';
import { CombatAi, SIGNATURE, idle as idleIntent, recall, remember, type AiView, type Intent } from './combatAi';
import { COMBAT_LESSON, combatAdvance, combatCoachLine, combatFeedback, combatHear, combatStepNumber, startCombatLesson, type CombatLesson, type CombatLessonEvent } from './combatLesson';
import { loadCombatClips, combatClips } from './combatClips';
import { CombatRig, SandDust } from './combatRig';
import { CineBout, TECHS, TECH_ORDER, type TechId, type Who } from './cinematic';
import { STYLE6_IDS, k, type Style6 } from './stand';
import {
  RULES, RULES_STATUS, OUTCOME_TEXT, boutRewards, breakWindowOpen, clinchStrength, emptyScore, levelFactor, points, refereeDecision,
  type BoutMode, type BoutOutcome, type BoutScore, type Discipline, type OpponentStyle, type Rewards, type Side,
} from './rules';

/**
 * Controlled làmb bout against a local opponent (no network).
 * Dakar Rek's own rules (src/lamb/rules.ts, docs/LAMB_RULES.md). Discipline "sans frappe" for now; "avec frappe"
 * is the next discipline to build.
 *
 * Loop: referee call → bout (move, guard, grab, dégagement, openings, response windows, empoignade, timer) →
 * stop (projection, time-out decision or abandon) → recap. Three modes: guided training with Coach Ablaye (tutorial
 * steps, unranked), friendly and ranked. Difficulty comes from the opponent's style and level only.
 */
export type DuelPhase = 'intro' | 'fight' | 'clinch' | 'fall' | 'result';
/** A wrestler in the bout. The stand-up fields (balance, composure, strikes) only move in the « avec frappe » discipline. */
interface Fighter extends StandState {
  w: Wrestler | null; pos: THREE.Vector3; facing: number; regen: number;
  busy: number; clip: Clip;
  /** Seconds left before this fighter's grab lands (the defender's response window). */
  windup: number;
  effort: number;
  score: BoutScore;
  rig: StrikeRig | null;
  /** Avec frappe: the move being set up in the empoignade (push, pull, pivot). */
  move: { kind: ClinchMove; t: number } | null;
  /**
   * The new bout (src/lamb/combat.ts, `combat`): where his imbalance points, where he leans (the stick), the hold in his
   * hands, a reach for a hold under way, going deeper, how long his guard has been up, the pivot's side, the stick's last
   * direction class (moves start as the stick enters one), the referee's tally, seconds since he last attacked.
   */
  dir: Vec; weight: Vec; hold: Hold;
  reach: { kind: GripKind; t: number; dur: number } | null;
  deeper: number; guardFor: number; side: number; sec: string; secT: number;
  tally: CombatTally; idle: number;
  look: CombatRig | null;
  /** The last two exchanges he won in the empoignade (the move, when): a combo's recipe is read from them. */
  c1: ClinchMove | null; c2: ClinchMove | null; t1: number; t2: number;
}
/**
 * Avec frappe, the moments of a bout as they happen (onMoment; not in the écurie's lesson or drills): a clean strike, a
 * knockdown (he staggers: « vacille »), the fall that ends it, the referee raising the winner's arm, the result. `who`:
 * the one who landed the strike or made the other stagger; the winner.
 */
export type DuelMoment = 'strike' | 'stagger' | 'fall' | 'arm' | 'result';
export interface DuelOptions {
  origin: { x: number; z: number };
  look: WrestlerLook;
  input: Input;
  crowdSize: number;
  mode: BoutMode;
  style: OpponentStyle;
  level: number;
  /** Radius the wrestlers stay within (arena ring 7.6, écurie sand 5). */
  ring?: number;
  /**
   * Two NPC wrestlers watched from the stands (the arena gala, src/arena): same rules, but no controls, no duel HUD and
   * no keys. The module drives the « player » side with the same buttons (`pressGrab`, `setGuard`, `pressBreak`) and
   * moves it through `input.move()` in the duel's camera axes (`axes()`); the other side is the duel's opponent AI.
   */
  spectate?: boolean;
  /** 'sans_frappe' (default: the bout every check and the arena evening use) or 'avec_frappe' (Làmb 2.0, src/lamb/stand.ts). */
  discipline?: Discipline;
  /** The player's attributes (avec frappe); average when not given. */
  attrs?: Attributes;
  /**
   * Avec frappe: the opponent as himself (a wrestler of the city's roster, src/lamb/opponents.ts): his attributes, how
   * he fights standing and in the empoignade, and the line that says who he is (intro, header, recap).
   */
  opponent?: { attrs: Attributes; stand: StandStyle; clinch: ClinchStyle; line: string };
  /**
   * Avec frappe, watched from the stands (the evening's main event): the « player » side is a roster wrestler too, fought
   * by the same AI as the other side (reading strikes, the empoignade's moves, throws and counters). All its draws come
   * from the duel's seeded `rand`, so a seeded bout in fixed steps plays out alike on every device.
   */
  autopilot?: { attrs: Attributes; stand: StandStyle; clinch: ClinchStyle; style: OpponentStyle; level: number };
  /** Seed of the opponent AI's draws (default: the clock). A watched bout seeded alike plays out alike everywhere. */
  seed?: number;
  /** Seconds of the round before the referee's decision (default: the discipline's rules; a watched gala bout is shorter). */
  roundSeconds?: number;
  /**
   * Avec frappe at the écurie: one of the écurie drills, played (src/lamb/drills.ts), instead of Coach Ablaye's lesson.
   * `drillNotes`: lines for the recap (what a finished drill moves, computed by the caller from the career's rules).
   */
  drill?: DrillId;
  drillNotes?: string[];
  /**
   * The new bout (docs/wrestling/COMBAT.md, src/lamb/flag.ts combatOn): the player's own bout in either discipline is
   * played with grips, a directed balance, throws with their set-up and the opponent of src/lamb/combatAi.ts. Ignored in a
   * watched bout (`spectate`, `autopilot`): those stay exactly what they were.
   */
  combat?: boolean;
  /** The new bout: a « Revanche » on the result (a friendly outside the fighter's path): `rematch` is set when it is chosen. */
  rematchable?: boolean;
}
export interface DuelResult {
  mode: BoutMode; outcome: BoutOutcome; winner: Side | null; seconds: number;
  score: { player: BoutScore; opponent: BoutScore }; stamina: { player: number; opponent: number }; rewards: Rewards;
}

const R = RULES.sans_frappe;
const smooth01 = (x: number) => { const k = Math.max(0, Math.min(1, x)); return k * k * (3 - 2 * k); };
/** The cinematic bout's entrance (s): his bàkk until `him`, the player's until `me`, the face-off until `end`. */
const CINE_INTRO = { him: 3.2, me: 6.0, end: 7.6 };
const UP = new THREE.Vector3(0, 1, 0), V_DUST = new THREE.Vector3();
/** The new bout: Saisir held this long is a reach for the belt; Frappe held this long arms the big strike (s, real time: the thumb's). */
/** The new bout: the third time a wrestler leaves the pit, he loses the bout. */
const SORTIES_LOST = 3;
const COMBAT_HOLD = { grab: 0.28, strike: 0.22 } as const;
/** The écurie drills with the new controls: their keys and the controls highlighted (the drills themselves: src/lamb/drills.ts). */
const COMBAT_DRILL: Record<DrillId, { keys: string; touch: string[] }> = {
  frappe: { keys: 'J bref : frappe rapide · J maintenu : grosse frappe', touch: ['quick'] },
  saisies: { keys: 'Flèches : vers lui pousser · loin tirer · de côté pivoter', touch: ['joy'] },
  gainage: { keys: 'Flèche vers lui : pousse avec lui', touch: ['joy'] },
};
const TUTORIAL = [
  { id: 'move', text: 'Déplace-toi vers Babacar', how: 'Joystick · ZQSD/WASD/flèches' },
  { id: 'guard', text: 'Il va te saisir lentement : garde-toi quand il attaque', how: 'Maintiens Garde · G/Maj' },
  { id: 'grab', text: 'Approche et saisis-le, tout près', how: 'Saisir · E/Espace' },
  { id: 'clinch', text: 'Empoignade : tape Saisir le plus vite possible', how: 'Saisir · E/Espace, plusieurs fois' },
  { id: 'break', text: 'Laisse-le te saisir, puis dégage-toi quand la barre est verte', how: 'Dégager · X' },
] as const;
type StepId = (typeof TUTORIAL)[number]['id'];

/** The few numbers of a duel a watched bout's pilot reads (`LambDuel.pilotView`). */
export interface PilotView {
  phase: string; dist: number; windup: boolean; open: 'player' | 'opponent' | null;
  stamina: { player: number; opponent: number };
  clinch: { losing: boolean; breakWindow: boolean } | null;
}

export class LambDuel {
  readonly kind = 'duel' as const;
  readonly group = new THREE.Group();
  t = 0;
  snap = true;
  done = false;
  onDone?: () => void;
  phase: DuelPhase = 'intro';
  winner: Side | null = null;
  outcome: BoutOutcome | null = null;
  result: DuelResult | null = null;
  readonly mode: BoutMode;
  readonly style: OpponentStyle;
  readonly level: number;
  /** Seconds left in the round (Infinity in training). */
  timeLeft: number;
  /** The round's length in seconds (the rules', or the watched gala bout's). */
  private round: number;
  /** Tutorial step index (training only); equals TUTORIAL.length when finished. */
  step = 0;
  paused = false;
  private me: Fighter;
  private ai: Fighter;
  private o: THREE.Vector3;
  private ring: number;
  private phaseT = 0;
  private aiThink = 1.2;
  private factor: number;
  private rand = rng(Date.now() & 0xffff);
  private crowd: Humanoid[] = [];
  private official: Humanoid | null = null;
  /**
   * Avec frappe, the fall (step 6): a short slow-down on the wrestler going down, the referee walking up from his side
   * of the ring (towards the wrestlers' tunnel) to raise the winner's arm, the crowd's explosion, then the result.
   */
  private fallFx: { loser: Fighter; winner: Fighter; refFrom: THREE.Vector3; refTo: THREE.Vector3; cheered: boolean } | null = null;
  private refRig: StrikeRig | null = null;
  /**
   * « Le choc » (src/lamb/fx.ts): the hit-stop, the camera's push and close-up, the bodies chest to chest, the thud and
   * the buzz — the player's own bout only (null in a watched bout and without a DOM: those play exactly as before).
   */
  private fx: DuelFx | null = null;
  /** The player's own bout, after a projection (both disciplines): who goes down, and whether he has landed yet. */
  private feelFall: { loser: Fighter; winner: Fighter; landed: boolean } | null = null;
  /** Where the HUD leaves the pair room in the empoignade (px rows), measured once per empoignade and screen size. */
  private roomAt: { top: number; bottom: number; w: number; h: number; at: number } | null = null;
  /** Garde pressed since the last frame (in the empoignade it is « Tirer »): a tap is kept through a hit-stop. */
  private guardTapped = false;
  /** The referee has raised the winner's arm (avec frappe; kept for the checks once the bout is over). */
  private refRaised = false;
  /** The referee's raised arm was told (onMoment 'arm'), once. */
  private armTold = false;
  /** Avec frappe: moments of the bout for whoever listens (the stands react): the fall and the result. */
  onMoment?: (m: DuelMoment, who: Side | null, o?: { kind?: StrikeKind }) => void;
  private drums = new Percussion();
  private ui: HTMLDivElement;
  private input: Input;
  private guardHeld = false;
  /** Presses since the last frame. */
  private grabTaps = 0;
  private breakPresses = 0;
  private clinchBy: Fighter | null = null;
  private aiBreakTried = -1;
  private msgHold = 0;
  private camRight = new THREE.Vector3(-1, 0, 0);
  private camFwd = new THREE.Vector3(0, 0, 1);
  private spectate: boolean;
  /** Làmb 2.0: strikes, balance and composure (« lutte avec frappe »). */
  readonly discipline: Discipline;
  private frappe: boolean;
  private standStyle: StandStyle;
  private quickPresses = 0;
  private bigPresses = 0;
  /** The opponent's pending answer to the player's strike, and how long it keeps its guard up. */
  private aiReact: { at: number; what: Reaction } | null = null;
  /**
   * Checks only (debugHold): the opponent holds still — no decision, strike, grab, move, throw or counter — and so do
   * the round's clock and the referee's separation, so a check sets up a position and plays it out alike every run.
   */
  private held = false;
  private aiGuardHold = 0;
  /** Avec frappe: grip advantage in the empoignade, from the player's side (−100…100), and how it started. */
  private grip = 0;
  private entry: Entry = 'neutral';
  private clinchStyle: ClinchStyle;
  /** Guard held on the previous frame (in the empoignade, pressing Garde is « Tirer »), and a move queued by a hook. */
  private guardWas = false;
  private moveQueued: ClinchMove | null = null;
  /** Avec frappe, AI against AI: the « player » side's own AI (see DuelOptions.autopilot) and its timers. */
  private auto: NonNullable<DuelOptions['autopilot']> | null = null;
  private autoFactor = 1;
  private autoT = 0.8;
  private autoGuard = 0;
  private autoReact: { at: number; what: Reaction } | null = null;
  private autoSawStrike = false;
  private autoSawGrab = false;
  private autoStepIn = 0;
  /** Avec frappe: how much slower than its style's pace the player's opponent decides (by level, frappePace). */
  private pace = 1;
  /** Avec frappe: seconds standing since the last empoignade (the referee presses a bout that goes nowhere). */
  private standT = 0;
  private urged = false;
  /** Avec frappe at the écurie: Coach Ablaye's guided lesson (src/lamb/lesson.ts), one step at a time. */
  private lesson: Lesson | null = null;
  /** What Coach Ablaye says now (shown in the lesson's box). */
  private coachText = '';
  private lessonT = 0;
  private lessonEnd = 0;
  /** Avec frappe at the écurie: an écurie drill, played (src/lamb/drills.ts); its end's countdown; the recap's notes. */
  private drill: DrillRun | null = null;
  private drillEnd = 0;
  private drillNotes: string[] = [];
  /** Checks only (debugDrillAnswer): press the right answer to each call as it opens, through the usual inputs. */
  private drillAuto = false;
  /** No DOM (unit tests of a watched bout): the duel runs without its HUD. */
  private headless = typeof document === 'undefined';
  /** Avec frappe: who the opponent is, in one line (« Gora, costaud indépendant, 7-2 »). */
  identity: string | null = null;
  /** A throw being attempted in the empoignade (step 5): who, since when, and the other's counter (when it comes). */
  private attempt: { by: Fighter; t: number; counter: boolean; counterAt: number; id?: ThrowId; braceSum?: number; braceT?: number; moving?: boolean; combo?: boolean; special?: boolean } | null = null;
  /** Last throw attempt and how it ended (for the checks); the new bout says which throw. */
  lastThrow: { by: Side; result: string; throw?: ThrowId } | null = null;
  /** Last exchange in the empoignade (for the checks and the HUD). */
  lastExchange: { by: Side; move: ClinchMove; against: ClinchMove | null; winner: Side | null; result: string } | null = null;

  /** Last strike that landed (for the checks and the HUD). */
  lastStrike: { by: Side; kind: StrikeKind; result: string } | null = null;
  /** The new bout (src/lamb/combat.ts): on in the player's own bout when asked (DuelOptions.combat), never when watched. */
  readonly combat: boolean;
  /** The new bout's impacts: sand thrown up, and a shake of the camera scaled to the force (on top of « Le choc »'s push). */
  private dust: SandDust | null = null;
  private shakeAmp = 0; private shakeT = 9;
  /** Checks: combos thrown, banners shown (the last one). */
  combos = 0; bannerSaid: string | null = null;
  /** The new bout's opponent (src/lamb/combatAi.ts): the same intents as the player's stick and buttons. */
  private brain: CombatAi | null = null;
  /** The new bout at the écurie: Coach Ablaye's lesson (src/lamb/combatLesson.ts). */
  private cl: CombatLesson | null = null;
  /** The pair's shared motion in the empoignade (m/s, world), and its turn (rad/s). */
  private pairVel = new THREE.Vector3();
  private pairSpin = 0;
  /** Checks and tests: the stick in the player's own frame (f towards him, s to his left), until `stickUntil` (bout time). */
  private stickOver: Vec | null = null;
  private stickUntil = 0;
  /** Saisir and Frappe held (a hold is the belt, a big strike), since when, and whether the hold has fired. */
  private grabHeld = false; private grabHeldT = 0; private grabFired = false; private reachTap = 0; private reachHold = 0;
  private quickHeld = false; private quickHeldT = 0; private quickFired = false;
  /** A press's own clock (ms, real time): a tap or a hold is the thumb's time, whatever the frame rate. */
  private static now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());
  private deeperPresses = 0; private throwPresses = 0;
  /** A Projeter pressed during the short pause after a move landed is kept this long (s) and thrown as the pause ends. */
  private throwBuffer = 0;
  /** How the bout ended in the new bout: the throw (or a slip, a reversal) and how he landed (the fall rule). */
  fallKind: FallKind | null = null;
  throwName: string | null = null;
  /** A « Revanche » was chosen on the result (main.ts starts the same bout again). */
  rematch = false;
  private rematchable: boolean;
  /** What the sign over his head says (his tell), when shown. */
  private tellText: string | null = null;
  /** The last thing said by the referee about passivity or a sortie (checks). */
  refereeSaid: string | null = null;
  /** The window lost focus (alt-tab, another app): the key-up never arrives, so a held guard would stay on. */
  private releaseControls = () => {
    this.guardHeld = false;
    this.ui?.querySelectorAll('[data-k=guard],[data-k=grab],[data-k=break],[data-k=quick],[data-k=big]').forEach(b => b.classList.remove('on'));
  };
  private onHidden = () => { if (document.hidden) this.releaseControls(); };
  private onKey = (e: KeyboardEvent) => {
    const down = e.type === 'keydown';
    if ((this.cine && this.cine.phase !== 'fin' && (this.phase === 'fight' || this.phase === 'clinch')) || (this.cineIntro && this.phase === 'intro')) {
      const act = e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter';
      if (act) { e.preventDefault(); this.cineHold = down && !this.paused; }
      if (down && !e.repeat && !this.paused) {
        if (act) this.cinePress = true;
        const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code); if (n >= 0) this.cinePick = TECH_ORDER[n];
      }
      if (e.code === 'Escape' && down) this.askAbandon(!this.confirmOpen());
      return;
    }
    if (this.combat && this.combatKey(e, down)) return;
    if (e.code === 'KeyG' || e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyF') { if (down && !e.repeat && !this.paused) this.guardTapped = true; this.guardHeld = down; this.ui.querySelector('[data-k=guard]')?.classList.toggle('on', down); }
    if (!down || e.repeat) return;
    if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') {
      if (e.target instanceof HTMLButtonElement && this.ui.contains(e.target)) return;   // let a focused dialog button act
      if (e.code === 'Space') e.preventDefault();
      if (this.phase === 'result') this.finish(); else if (!this.paused) this.grabTaps++;
    }
    if (e.code === 'KeyX' && !this.paused) this.breakPresses++;
    if (e.code === 'KeyP' && this.lesson && !this.paused) this.skipLessonStep();
    if (this.frappe && !this.paused && (e.code === 'KeyJ' || e.code === 'KeyC')) this.quickPresses++;
    if (this.frappe && !this.paused && (e.code === 'KeyK' || e.code === 'KeyV')) this.bigPresses++;
    if (e.code === 'Escape') { if (this.phase === 'result') this.finish(); else this.askAbandon(!this.confirmOpen()); }
  };

  constructor(opts: DuelOptions) {
    const { origin, look, input, crowdSize } = opts;
    this.input = input; this.mode = opts.mode; this.style = opts.style; this.level = opts.level; this.spectate = !!opts.spectate;
    if (!this.spectate && !this.headless) this.fx = new DuelFx();
    this.discipline = opts.discipline ?? 'sans_frappe'; this.frappe = this.discipline === 'avec_frappe';
    this.combat = !!opts.combat && !this.spectate && !opts.autopilot;
    if (this.combat && opts.look) void loadCombatClips();                // the bodies' clips (procedural until they are in)
    this.rematchable = !!opts.rematchable && this.combat;
    this.standStyle = this.mode === 'entrainement' ? STAND_STYLES.partenaire : STAND_STYLES[this.style.id];
    this.clinchStyle = this.mode === 'entrainement' ? CLINCH_STYLES.partenaire : CLINCH_STYLES[this.style.id];
    if (this.frappe && opts.autopilot) { this.auto = opts.autopilot; this.autoFactor = levelFactor(opts.autopilot.level); }
    if ((this.frappe || this.combat) && this.mode === 'entrainement' && !this.spectate) {
      if (opts.drill) { this.drill = startDrill(opts.drill); this.drillNotes = opts.drillNotes ?? []; } else if (this.combat) this.cl = startCombatLesson(this.frappe); else this.lesson = startLesson();
      this.step = TUTORIAL.length;
    }
    const who = (this.frappe || this.combat) && this.mode !== 'entrainement' ? opts.opponent : undefined;
    if (who) { this.standStyle = who.stand; this.clinchStyle = who.clinch; this.identity = who.line; }
    // the player's opponent avec frappe by level (src/lamb/stand.ts AI_LEVEL); watched bouts and sans frappe as before
    const vsPlayer = this.frappe && !this.auto && opts.mode !== 'entrainement' && !this.combat;
    this.factor = opts.mode === 'entrainement' ? 1 : vsPlayer ? frappeFactor(opts.level) : levelFactor(opts.level);
    this.pace = vsPlayer ? frappePace(opts.level) : 1;
    this.round = opts.roundSeconds ?? R.roundSeconds;
    this.timeLeft = opts.mode === 'entrainement' ? Infinity : this.round;
    this.ring = opts.ring ?? 7.6;
    if (opts.seed !== undefined) this.rand = rng(opts.seed);
    this.o = new THREE.Vector3(origin.x, 0.1, origin.z);
    const mk = (skin: number, l: WrestlerLook, x: number, max: number, regen: number, attrs: Attributes): Fighter => {
      const w = wrestlerReady() ? new Wrestler(skin) : null;
      if (w) { w.setLook(l, l.ngembPattern === 'bordure' ? 'B' : 'A'); this.group.add(w.group); }
      return {
        ...standState(attrs, max), w, pos: new THREE.Vector3(origin.x + x, 0.1, origin.z), facing: 0, regen, busy: 0, clip: 'Prep', windup: 0, effort: 0, score: emptyScore(), rig: w && (this.frappe || this.fx) ? new StrikeRig(w) : null, move: null,
        dir: { f: 0, s: 0 }, weight: { f: 0, s: 0 }, hold: { kind: null, str: 0 }, reach: null, deeper: 0, guardFor: 0, side: 1, sec: '', secT: 0, tally: emptyTally(), idle: 0,
        look: w && this.combat ? new CombatRig(w) : null, c1: null, c2: null, t1: -9, t2: -9,
      };
    };
    // the camera stays on the -z side (gate side in the arena, open side at the écurie): screen right is world -x,
    // so the player starts at +x and is seen on the left, the opponent on the right
    this.me = mk(0x6b3f25, look, 3, this.auto?.style.staminaMax ?? R.stamina.max, this.auto?.style.staminaRegen ?? R.stamina.regen, opts.attrs ?? this.auto?.attrs ?? AVERAGE);
    const breath = vsPlayer ? frappeBreath(opts.level) : 1;                // a young wrestler is less fit (src/lamb/stand.ts AI_LEVEL)
    this.ai = mk(0x3b2216, { ngembColor: this.style.ngemb, ngembPattern: this.mode === 'entrainement' ? 'bordure' : 'uni', accessories: [] }, -3, Math.round(this.style.staminaMax * breath), this.style.staminaRegen * breath, who?.attrs ?? this.standStyle.attrs);
    if (this.lesson || this.drill || this.cl) this.ai.slow = 1.8;          // the partner shows everything slowly
    else if (vsPlayer && frappeSlow(opts.level) > 1) this.ai.slow = frappeSlow(opts.level);   // a young wrestler too, a little
    if (this.combat) {
      // the new bout's opponent: his style of the six (from his Làmb 2.0 data, else his career style), his level, what he remembers of the player
      const s6 = this.mode === 'entrainement' ? 'partenaire' : (STYLE6_IDS.find(x => STAND_STYLES[x] === this.standStyle) ?? (this.style.id as Style6));
      this.brain = new CombatAi(s6, opts.level, this.style.name, this.standStyle, this.clinchStyle, this.mode === 'entrainement' ? undefined : recall(this.style.name));
      if (!this.cl && !this.drill) this.ai.slow = this.brain.lvl.slow;      // a young wrestler sets everything up slowly: his tells
      if (this.mode !== 'entrainement') { const b = this.brain.lvl.breath; this.ai.max = Math.round(this.ai.max * b); this.ai.stamina = this.ai.max; this.ai.regen *= b; }
    }
    if (wrestlerReady()) {
      // referee (arena) or Coach Ablaye (écurie) watching from the far side of the ring
      const coach = castById('ablaye');
      const ref = new Humanoid(this.mode === 'entrainement' && coach ? lookFromOutfit(coach.outfit) : { skin: 0x4e2e1c, style: 'tee', top: 0xf2f2ec, bottom: 0x1c1c1f, shoes: 0x1c1c1f });
      ref.hold = 'Idle'; ref.group.position.set(origin.x, 0.1, origin.z + Math.min(4.2, this.ring - 0.6)); ref.group.rotation.y = Math.PI;
      this.group.add(ref.group); this.official = ref;
      if (this.frappe) this.refRig = new StrikeRig(ref);
    }
    // spectators on the tiers of the géew (dimensions in world/geew.ts)
    const r = rng(11);
    if (wrestlerReady()) for (let k = 0; k < crowdSize; k++) {
      const a = (k / crowdSize) * Math.PI * 2 + 0.2;
      if (inGate(a, 0.35)) continue;
      const tier = k % TIERS, rr = tierRadius(tier), y = tierTop(tier);
      const h = new Humanoid(randomLook(r)); h.hold = k % 3 ? 'Celebrate' : 'Idle';
      h.group.position.set(origin.x + Math.sin(a) * rr, y, origin.z + Math.cos(a) * rr); h.group.rotation.y = a + Math.PI;
      this.group.add(h.group); this.crowd.push(h);
    }
    if (this.mode !== 'entrainement') this.drums.start(122);
    this.ui = this.headless ? (null as unknown as HTMLDivElement) : this.buildUi();
    if (this.combat && !this.headless && wrestlerReady()) { this.dust = new SandDust(); this.group.add(this.dust.points); }
    if (this.spectate || this.headless) return;               // watched from the stands: no keys, no controls
    addEventListener('keydown', this.onKey); addEventListener('keyup', this.onKey);
    addEventListener('blur', this.releaseControls); document.addEventListener('visibilitychange', this.onHidden);
    input.enabled = true; input.takeAction();
  }

  // ---------------------------------------------------------------- UI
  private buildUi(): HTMLDivElement {
    // the new bout uses Làmb 2.0's gauges and their phone layout (src/ui/style.css) in both disciplines, with its own buttons
    const d = document.createElement('div'); d.className = this.combat ? 'duel-ui frappe combat' : this.frappe ? 'duel-ui frappe' : 'duel-ui';
    // the cinematic bout's controls from the start (the bout itself is made at the bell: cineOn)
    if (this.combat && !this.cl && !this.drill && !this.headless && !(typeof location !== 'undefined' && new URLSearchParams(location.search).has('cine0'))) { d.classList.add('cine'); this.cineIntro = !this.spectate && this.mode !== 'entrainement'; this.me.pos.x = this.o.x + 1.3; this.ai.pos.x = this.o.x - 1.3; }   // face to face for the shots, near the middle
    // short enough for the header's one line on a phone in portrait (the lesson and the drills avec frappe say which)
    const title = this.lesson || this.cl ? 'Leçon · Coach Ablaye' : this.drill ? 'Exercice · Coach Ablaye'
      : { entrainement: 'Entraînement · Coach Ablaye', amical: 'Combat amical', classe: 'Combat classé' }[this.mode];
    const sub = this.mode === 'entrainement' ? 'Partenaire : Babacar · non classé' : this.identity ? `${this.identity} · niveau ${this.level}` : `${this.style.name} · ${this.style.label} · niveau ${this.level}`;
    const keys = document.body.classList.contains('touch') ? '' : this.combat
      ? ` · flèches pieds et poids · E saisir (maintenu : ceinture) / projeter · G garde / prise · X reculer / casser${this.frappe ? ' · J frappe (maintenu : grosse)' : ''} · K projeter / contrer · Échap abandonner`
      : this.frappe
      ? ' · J frappe · K grosse frappe · E/Espace saisir · G/Maj garde · X reculer/dégager · Échap abandonner'
      : ' · E/Espace saisir · G/Maj garde · X dégager · Échap abandonner';
    const states = (who: string) => this.frappe || this.combat ? `<i class="bal"><b data-k="${who}bal"></b></i><i class="cmp"><b data-k="${who}cmp"></b></i>` : '';
    d.innerHTML = `
      <div class="duel-top">
        <div class="duel-head"><b></b><small></small></div>
        <div class="duel-timer" data-k="timer"></div>
        <button class="duel-ab" data-k="abandon">Abandonner</button>
      </div>
      <div class="duel-bars"><div data-k="mebar"><span>${this.combat ? 'Toi' : 'Toi'} <em data-k="meopen"></em></span><i><b data-k="me"></b></i>${states('me')}</div><div data-k="aibar"><span>${this.style.name} <em data-k="aiopen"></em></span><i><b data-k="ai"></b></i>${states('ai')}</div></div>
      ${this.frappe || this.combat ? '<div class="duel-legend"><span class="e">Endurance</span><span class="b">Équilibre</span><span class="c">Sang-froid</span></div>' : ''}
      <div class="duel-note">${RULES[this.discipline].label} · ${RULES_STATUS}${keys}</div>
      <div class="duel-step" data-k="step" hidden></div>
      <div class="duel-msg" data-k="msg">Arbitre : prêts ?</div>
      <div class="duel-clinch" data-k="clinch" hidden><i><b data-k="tug"></b></i><em data-k="cl"></em></div>
      ${this.combat ? `<div class="duel-btns combat${this.frappe ? ' strikes' : ''}"><button data-k="break">Reculer</button><button data-k="guard">Garde</button><button data-k="grab">Saisir</button>${this.frappe ? '<button data-k="quick">Frappe</button>' : ''}</div>`
        : `<div class="duel-btns${this.frappe ? ' frappe' : ''}"><button data-k="break">${this.frappe ? 'Reculer' : 'Dégager'}</button><button data-k="guard">Garde</button><button data-k="grab">Saisir</button>${this.frappe ? '<button data-k="quick">Frappe</button><button data-k="big">Grosse<br>frappe</button>' : ''}</div>`}
      <div class="duel-confirm" data-k="confirm" hidden><div><b>Abandonner le combat ?</b><p>Compté comme un abandon, à part des défaites : ce n’est pas une chute, et il n’y a aucune récompense.</p><button data-k="yes">Abandonner</button><button data-k="no">Continuer le combat</button></div></div>
      <div class="duel-recap" data-k="recap" hidden></div>${this.combat ? '<div class="duel-banner" data-k="banner"></div>' : ''}`;
    (d.querySelector('.duel-head b') as HTMLElement).textContent = title;
    if (this.combat) { const ab = d.querySelector<HTMLElement>('.duel-ab'); if (ab) { ab.textContent = '✕'; ab.setAttribute('aria-label', 'Abandonner'); } }
    (d.querySelector('.duel-head small') as HTMLElement).textContent = sub;
    const st = document.createElement('style');
    st.textContent = `.duel-ui{position:fixed;inset:0;pointer-events:none;z-index:30;font:600 14px system-ui,sans-serif;color:#fff}
      body.induel #stats,body.induel #place,body.induel #sceneTag,body.induel #menuBtn,body.induel #presenceBtn,body.induel #goal,body.induel #streakChip{display:none!important}
      body.induel.touch #joy{display:block!important}
      .duel-top{position:absolute;top:calc(env(safe-area-inset-top,0px) + 8px);left:max(10px,env(safe-area-inset-left,0px));right:max(10px,env(safe-area-inset-right,0px));display:flex;align-items:center;gap:8px}
      .duel-head{flex:1;min-width:0;background:rgba(15,23,42,.72);border-radius:10px;padding:5px 10px;line-height:1.2}
      .duel-head b{display:block;color:#facc15;font-size:13px}.duel-head small{display:block;font-size:11px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .duel-timer{background:rgba(15,23,42,.72);border-radius:10px;padding:7px 10px;font:800 16px ui-monospace,monospace;min-width:52px;text-align:center}
      .duel-ab{pointer-events:auto;border:1px solid rgba(255,255,255,.4);background:rgba(127,29,29,.75);color:#fff;font:700 12px system-ui;border-radius:10px;padding:9px 10px;min-height:40px}
      .duel-bars{position:absolute;top:calc(env(safe-area-inset-top,0px) + 58px);left:50%;transform:translateX(-50%);display:flex;gap:10px;width:min(94vw,520px)}
      .duel-bars>div{flex:1;background:rgba(15,23,42,.72);border-radius:10px;padding:4px 8px;font-size:12px}
      .duel-bars em{font-style:normal;color:#fb923c;font-weight:900}
      .duel-bars i{display:block;height:7px;border-radius:4px;background:rgba(255,255,255,.18);margin-top:3px;overflow:hidden}
      .duel-bars b{display:block;height:100%;width:100%;background:#22c55e;transition:width .1s}
      .duel-bars b.low{background:#f97316}
      .duel-bars i.bal,.duel-bars i.cmp{height:5px;margin-top:2px}.duel-bars i.bal b{background:#38bdf8}.duel-bars i.cmp b{background:#f59e0b}
      .duel-bars i.bal b.low{background:#ef4444}
      .duel-bars i.bal b.warn{animation:duelwarn .5s ease-in-out infinite alternate}
      @keyframes duelwarn{from{opacity:1}to{opacity:.35}}
      .duel-ui.slip{box-shadow:inset 0 0 70px 10px rgba(245,158,11,.35)}
      .duel-ui.falling{box-shadow:inset 0 0 90px 18px rgba(220,38,38,.5)}
      .duel-legend{position:absolute;top:calc(env(safe-area-inset-top,0px) + 110px);left:50%;transform:translateX(-50%);display:flex;gap:12px;font-size:10.5px;text-shadow:0 1px 3px #000;white-space:nowrap}
      .duel-legend span::before{content:'';display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;vertical-align:-1px}
      .duel-legend .e::before{background:#22c55e}.duel-legend .b::before{background:#38bdf8}.duel-legend .c::before{background:#f59e0b}
      .duel-ui.frappe .duel-note{top:calc(env(safe-area-inset-top,0px) + 127px)}
      .duel-ui.frappe .duel-step{top:calc(env(safe-area-inset-top,0px) + 146px)}
      .duel-note{position:absolute;top:calc(env(safe-area-inset-top,0px) + 104px);left:50%;transform:translateX(-50%);font-size:10.5px;opacity:.85;text-align:center;width:94vw;text-shadow:0 1px 3px #000}
      .duel-step{position:absolute;top:calc(env(safe-area-inset-top,0px) + 124px);left:50%;transform:translateX(-50%);width:min(92vw,440px);background:rgba(20,83,45,.85);border:1px solid #4ade80;border-radius:10px;padding:6px 10px;font-size:13px;text-align:center}
      .duel-step small{display:block;font-size:11px;color:#bbf7d0;margin-top:2px}
      .duel-step em{display:block;font-style:normal;font-weight:500;font-size:12px;color:#f0fdf4;margin-top:4px;line-height:1.3}
      .duel-step button{pointer-events:auto;margin-top:5px;border:1px solid #bbf7d0;background:rgba(20,83,45,.9);color:#fff;font:700 12px system-ui;border-radius:8px;padding:6px 12px;min-height:32px}
      .duel-btns button.teach{box-shadow:0 0 0 4px #4ade80,0 0 18px 4px rgba(74,222,128,.7);animation:duelteach .8s ease-in-out infinite alternate}
      #joy.teach{box-shadow:0 0 0 4px #4ade80,0 0 18px 4px rgba(74,222,128,.7);border-radius:50%}
      @keyframes duelteach{from{filter:brightness(1)}to{filter:brightness(1.25)}}
      .duel-msg{position:absolute;top:24%;left:50%;transform:translateX(-50%);font-size:clamp(20px,5.6vw,36px);font-weight:900;text-shadow:0 2px 8px #000;text-align:center;width:94vw}
      .duel-clinch{position:absolute;top:calc(24% + 48px);left:50%;transform:translateX(-50%);width:min(70vw,320px);text-align:center}
      .duel-clinch i{display:block;height:12px;border-radius:6px;background:#dc2626;overflow:hidden;border:2px solid rgba(255,255,255,.7)}
      .duel-clinch b{display:block;height:100%;background:#22c55e}
      .duel-clinch em{display:block;font-style:normal;font-size:13px;margin-top:4px;text-shadow:0 1px 4px #000}
      .duel-btns{position:absolute;right:max(12px,env(safe-area-inset-right,0px));bottom:calc(env(safe-area-inset-bottom,0px) + 18px);width:172px;height:166px;pointer-events:none}
      .duel-btns button{position:absolute;pointer-events:auto;border-radius:50%;border:0;font:800 13px system-ui;color:#111;box-shadow:0 4px 14px rgba(0,0,0,.45);touch-action:none;-webkit-user-select:none;user-select:none}
      .duel-btns button[data-k=grab]{right:0;bottom:0;width:88px;height:88px;background:#facc15;font-size:15px}
      .duel-btns button[data-k=guard]{right:96px;bottom:4px;width:70px;height:70px;background:#93c5fd}
      .duel-btns button[data-k=break]{right:9px;bottom:96px;width:70px;height:70px;background:#e5e7eb}
      .duel-btns button[data-k=break].hot,.duel-btns button[data-k=big].hot{background:#4ade80;box-shadow:0 0 0 4px #bbf7d0,0 4px 14px rgba(0,0,0,.45)}
      .duel-btns button.on{transform:scale(.93);filter:brightness(.85)}
      .duel-btns.frappe{width:216px;height:156px}
      .duel-btns.frappe button[data-k=grab]{width:84px;height:84px}
      .duel-btns.frappe button[data-k=guard]{right:90px;bottom:0;width:62px;height:62px}
      .duel-btns.frappe button[data-k=break]{right:8px;bottom:92px;width:60px;height:60px}
      .duel-btns button[data-k=quick]{right:90px;bottom:70px;width:60px;height:60px;background:#fdba74;font-size:12px}
      .duel-btns button[data-k=big]{right:156px;bottom:20px;width:60px;height:60px;background:#f87171;font-size:12px;line-height:1.05}
      @media (max-height:500px){.duel-ui.frappe .duel-msg{top:calc(env(safe-area-inset-top,0px) + 146px);font-size:22px}.duel-ui.frappe .duel-clinch{top:calc(env(safe-area-inset-top,0px) + 184px)}}
      body.induel .duel-ui.combat .duel-btns.combat{width:190px;height:172px}
      body.induel .duel-ui.combat .duel-btns.combat button{font-size:13.5px;line-height:1.1}
      body.induel .duel-ui.combat .duel-btns.combat button[data-k=grab]{right:0;bottom:0;width:96px;height:96px;font-size:15px}
      body.induel .duel-ui.combat .duel-btns.combat button[data-k=guard]{right:104px;bottom:6px;width:72px;height:72px}
      body.induel .duel-ui.combat .duel-btns.combat button[data-k=break]{right:12px;bottom:106px;width:68px;height:68px}
      body.induel .duel-ui.combat .duel-btns.combat.strikes{width:200px;height:182px}
      body.induel .duel-ui.combat .duel-btns.combat button[data-k=quick]{right:104px;bottom:90px;width:68px;height:68px}
      body.induel .duel-ui.combat .duel-btns.combat button.ready{background:#4ade80;box-shadow:0 0 0 4px #bbf7d0,0 4px 14px rgba(0,0,0,.45)}
      body.induel .duel-ui.combat .duel-btns.combat button.hot{background:#4ade80;box-shadow:0 0 0 4px #bbf7d0,0 4px 14px rgba(0,0,0,.45)}
      body.induel .duel-ui.combat .duel-btns.combat button.dim{filter:saturate(.55) brightness(.92)}
      body.induel .duel-ui.combat .duel-btns.combat button[hidden]{display:none}
      .duel-recap button[data-k=again]{background:#4ade80}
      .duel-banner{position:absolute;left:0;right:0;top:calc(env(safe-area-inset-top,0px) + 132px);text-align:center;font:italic 900 clamp(44px,15vw,96px)/1 system-ui,sans-serif;color:#fde047;letter-spacing:.02em;
        -webkit-text-stroke:3px #1c1917;text-shadow:0 6px 0 #7c2d12,0 10px 24px rgba(0,0,0,.6);opacity:0;pointer-events:none;transform:scale(.6)}
      .duel-banner.combo,.duel-banner.special{font-size:clamp(30px,9vw,60px);color:#fb923c}
      .duel-banner.go{animation:duelbanner 1.15s cubic-bezier(.2,1.6,.4,1) forwards}
      .duel-banner.end.go{animation-duration:1.9s}
      @keyframes duelbanner{0%{opacity:0;transform:scale(1.9) skewX(-8deg)}14%{opacity:1;transform:scale(.94) skewX(-8deg)}24%{transform:scale(1.04) skewX(-8deg)}72%{opacity:1;transform:scale(1) skewX(-8deg)}100%{opacity:0;transform:scale(1.08) skewX(-8deg)}}
      .duel-confirm,.duel-recap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,.55);pointer-events:auto}
      .duel-confirm[hidden],.duel-recap[hidden],.duel-step[hidden],.duel-clinch[hidden]{display:none}
      .duel-confirm>div,.duel-recap>div{background:#0f172a;border:1px solid rgba(255,255,255,.18);border-radius:16px;padding:16px;width:min(88vw,380px);max-height:86vh;overflow:auto}
      .duel-confirm p,.duel-recap p{font-weight:500;font-size:13px;color:#cbd5e1;margin:6px 0 12px}
      .duel-confirm button,.duel-recap button{display:block;width:100%;margin-top:8px;padding:12px;border-radius:12px;border:0;font:800 14px system-ui;background:#facc15;color:#111}
      .duel-confirm button[data-k=yes]{background:#b91c1c;color:#fff}
      .duel-recap h2{margin:0;font-size:22px;color:#facc15}.duel-recap table{width:100%;font-size:12.5px;border-collapse:collapse;margin:6px 0}
      .duel-recap td{padding:3px 0;border-bottom:1px solid rgba(255,255,255,.08)}.duel-recap td+td,.duel-recap th+th{text-align:right}
      .duel-recap th{font-size:11px;color:#94a3b8;text-align:left;font-weight:600}
      .duel-recap ul{margin:4px 0 0;padding-left:18px;font-size:13px;font-weight:500}.duel-recap small{display:block;color:#fbbf24;font-size:11px;margin-top:8px}`;
    d.appendChild(st);
    const guard = d.querySelector<HTMLButtonElement>('[data-k=guard]')!, grab = d.querySelector<HTMLButtonElement>('[data-k=grab]')!, brk = d.querySelector<HTMLButtonElement>('[data-k=break]')!;
    const hold = (on: boolean) => (e: Event) => {
      e.preventDefault();
      // the new bout, in the empoignade: the blue button goes deeper (a tap)
      if (on && this.combat && this.phase === 'clinch' && !this.paused) { this.deeperPresses++; guard.classList.add('on'); return; }
      if (on && !this.guardHeld && !this.paused) this.guardTapped = true; this.guardHeld = on; guard.classList.toggle('on', on);
    };
    guard.addEventListener('pointerdown', hold(true)); guard.addEventListener('pointerup', hold(false)); guard.addEventListener('pointerleave', hold(false)); guard.addEventListener('pointercancel', hold(false));
    const tap = (b: HTMLButtonElement, f: () => void) => {
      b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('on'); f(); });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => b.classList.remove('on'));
    };
    if (this.combat) {
      // Saisir: a tap reaches for the nape (or the leg), a hold for the belt; in the empoignade it throws (or counters)
      grab.addEventListener('pointerdown', e => { e.preventDefault(); grab.classList.add('on'); this.grabPress(); });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) grab.addEventListener(ev, () => { grab.classList.remove('on'); this.grabRelease(); });
      tap(brk, () => this.breakPresses++);
    } else { tap(grab, () => this.grabTaps++); tap(brk, () => this.breakPresses++); }
    d.querySelector('[data-k=step]')!.addEventListener('click', e => { if ((e.target as HTMLElement).closest('[data-k=skip]')) this.skipLessonStep(); });
    const quick = d.querySelector<HTMLButtonElement>('[data-k=quick]'), big = d.querySelector<HTMLButtonElement>('[data-k=big]');
    if (quick && this.combat) {
      // Frappe: a tap is the quick strike, held it arms the big one
      quick.addEventListener('pointerdown', e => { e.preventDefault(); quick.classList.add('on'); this.quickPress(); });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) quick.addEventListener(ev, () => { quick.classList.remove('on'); this.quickRelease(); });
    } else if (quick) tap(quick, () => this.quickPresses++);
    if (big) tap(big, () => this.bigPresses++);
    if (this.combat) {
      // the cinematic bout's controls (shown once it runs: the class « cine » on the HUD): the needle's bar, one action button, the moves at the opening
      const cl = document.createElement('div'); cl.className = 'cine-layer';
      cl.innerHTML = `<div class="cine-meter" data-k="cmeter" hidden><i><u data-k="czone"></u><b data-k="cneedle"></b></i></div>
        <div class="cine-techs" data-k="ctechs" hidden>${TECH_ORDER.map((id, n) => `<button data-t="${id}"><s></s><small>${n + 1}</small>${TECHS[id].label}</button>`).join('')}</div>
        <div class="cine-tag" data-k="ctag" hidden>Au ralenti</div>
        <div class="cine-card" data-k="ccard" hidden><b></b><small></small></div>
        <button class="cine-act" data-k="cact">Saisir</button>`;
      d.appendChild(cl);
      const act = cl.querySelector<HTMLButtonElement>('[data-k=cact]')!;
      act.addEventListener('pointerdown', e => { e.preventDefault(); if (!this.paused) { this.cinePress = true; this.cineHold = true; } act.classList.add('on'); });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) act.addEventListener(ev, () => { act.classList.remove('on'); this.cineHold = false; });
      cl.querySelectorAll<HTMLButtonElement>('[data-t]').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); if (!this.paused) this.cinePick = b.dataset.t as TechId; }));
    }
    d.querySelector<HTMLButtonElement>('[data-k=abandon]')!.addEventListener('click', e => { (e.currentTarget as HTMLButtonElement).blur(); this.askAbandon(true); });
    d.querySelector('[data-k=yes]')!.addEventListener('click', () => this.abandon());
    d.querySelector('[data-k=no]')!.addEventListener('click', () => this.askAbandon(false));
    if (!this.spectate) { document.body.appendChild(d); document.body.classList.add('induel'); }   // spectators keep the city HUD
    return d;
  }

  private q<T extends HTMLElement = HTMLElement>(k: string) { return this.ui.querySelector<T>(`[data-k=${k}]`)!; }
  /** Show a message; `hold` keeps it on screen at least that long against routine updates. */
  private msg(text: string, hold = 0) {
    if (hold <= 0 && this.msgHold > 0) return;
    if (hold > 0) this.msgHold = hold;
    this.said = text;
    if (this.headless || this.spectate) return;                              // (a watched bout's HUD is never shown)
    const m = this.q('msg'); if (m.textContent !== text) m.textContent = text;
  }
  /** The last message shown (also without a HUD). */
  said = '';
  private draw() {
    if (this.headless || this.spectate) return;                              // watched from the stands: its HUD is not on the page
    const me = this.me, ai = this.ai;
    const bar = (k: string, f: Fighter) => { const b = this.q(k); b.style.width = `${(100 * f.stamina) / f.max}%`; b.classList.toggle('low', f.stamina < R.stamina.grabCost); };
    bar('me', me); bar('ai', ai);
    if (this.frappe || this.combat) {
      const pm = this.phase === 'clinch' ? posture(me.balance) : 'stable';
      this.ui.classList.toggle('slip', pm === 'glisse'); this.ui.classList.toggle('falling', pm === 'chute');
    }
    if (this.frappe || this.combat) for (const [k, f] of [['me', me], ['ai', ai]] as const) {
      const b = this.q(k + 'bal'); b.style.width = `${Math.round(f.balance)}%`; b.classList.toggle('low', f.balance < 30);
      b.classList.toggle('warn', this.phase === 'clinch' && f.balance < 45);
      this.q(k + 'cmp').style.width = `${Math.round(f.composure)}%`;
    }
    this.q('meopen').textContent = me.stagger > 0 ? '· tu vacilles' : me.open > 0 ? '· exposé' : '';
    this.q('aiopen').textContent = ai.stagger > 0 ? '· VACILLE' : ai.open > 0 ? '· OUVERT' : '';
    const tl = this.timeLeft;
    this.q('timer').textContent = tl === Infinity ? '—' : `${Math.floor(Math.max(0, Math.ceil(tl)) / 60)}:${String(Math.max(0, Math.ceil(tl)) % 60).padStart(2, '0')}`;
    const step = this.q('step');
    if (this.lesson || this.drill || this.cl) {                              // (the new bout's lesson too: Coach Ablaye's card)
      const card = this.stepCard(document.body.classList.contains('touch'));
      step.hidden = !card;
      if (card) {
        const html = `<b>${card.head}</b><small>${card.keys}</small><em>${card.coach}</em>${card.skip ? '<button data-k="skip" type="button">Passer</button>' : ''}`;
        if (step.innerHTML !== html) step.innerHTML = html;
      }
      const teach = card?.teach ?? [];
      for (const b of this.ui.querySelectorAll<HTMLElement>('.duel-btns button')) b.classList.toggle('teach', teach.includes(b.dataset.k ?? ''));
      document.getElementById('joy')?.classList.toggle('teach', teach.includes('joy'));
    } else if (this.mode === 'entrainement' && this.step < TUTORIAL.length && this.phase !== 'result') {
      const s = TUTORIAL[this.step];
      step.hidden = false;
      const html = `<b>${this.step + 1}/${TUTORIAL.length} · ${s.text}</b><small>${s.how}</small>`;
      if (step.innerHTML !== html) step.innerHTML = html;
    } else step.hidden = true;
    const cl = this.q('clinch'), brk = this.q('break');
    if (this.cine || this.cineIntro) { this.drawCine(); return; }
    if (this.combat) { this.drawCombat(cl, brk); return; }
    if (this.phase === 'clinch') {
      const c = this.clinchState()!;
      cl.hidden = false;
      if (this.frappe) {
        // the grip is the bar; the balance bars above tell who is slipping
        this.q('tug').style.width = `${Math.round((this.grip + 100) / 2)}%`;
        this.q('cl').textContent = `${gripWords(this.grip)} · Tirer bat Pousser · Pivoter bat Tirer · Pousser bat Pivoter`;
        brk.classList.toggle('hot', this.grip > CLINCH.breakFloor && this.me.balance < 40);
      } else {
        this.q('tug').style.width = `${Math.round(100 * c.share)}%`;
        this.q('cl').textContent = c.losing ? (c.breakWindow ? 'Dégage maintenant !' : 'Tu perds l’empoignade : prépare Dégager') : 'Tu mènes : continue de taper Saisir';
        brk.classList.toggle('hot', c.losing && c.breakWindow);
      }
    } else { cl.hidden = true; brk.classList.remove('hot'); }
    if (this.frappe) {
      // the same five buttons, other words in the empoignade
      const inClinch = this.phase === 'clinch';
      if (inClinch !== this.labelsClinch) {
        this.labelsClinch = inClinch;
        const L: Record<string, [string, string]> = { grab: ['Saisir', 'Pousser'], guard: ['Garde', 'Tirer'], quick: ['Frappe', 'Pivoter'], break: ['Reculer', 'Casser'], big: ['Grosse<br>frappe', 'Projeter'] };
        for (const [k, [a, b]] of Object.entries(L)) { const el = this.ui.querySelector(`[data-k=${k}]`); if (el) el.innerHTML = inClinch ? b : a; }
      }
      // while he tries a throw, the same button counters it
      const against = inClinch && !!this.attempt && this.attempt.by === this.ai;
      if (against !== this.labelCounter) {
        this.labelCounter = against;
        const el = this.ui.querySelector<HTMLElement>('[data-k=big]');
        if (el) { el.innerHTML = against ? 'Contrer' : inClinch ? 'Projeter' : 'Grosse<br>frappe'; el.classList.toggle('hot', against); }
      }
    }
  }
  private labelsClinch = false;
  private labelCounter = false;
  /**
   * The new bout's HUD: the Prise (both holds in words), the buttons' words for now — Saisir / « Jambe ! » standing, the
   * throw the hold gives in the empoignade (lit when it is ready), « Contrer » while he throws, the hold one would go to.
   */
  /** The cinematic bout's controls: the one button's word (and its glow when the moment is now), the moves with their set-up, the gauge. */
  private drawCine() {
    const meter = this.q('cmeter'), act = this.q<HTMLButtonElement>('cact'), techs = this.q('ctechs');
    if (!this.cine) {
      // the entrance: one small « Passer » (to the face-off), nothing else
      meter.hidden = true; techs.hidden = true; this.q('ctag').hidden = true;
      const skip = this.phase === 'intro' && this.phaseT < CINE_INTRO.me;
      act.hidden = !skip; act.textContent = 'Passer'; act.className = 'cine-act small';
      return;
    }
    const c = this.cine, live = this.phase === 'fight' || this.phase === 'clinch';
    const showMeter = live && c.phase === 'projection';
    meter.hidden = !showMeter;
    if (showMeter) {
      const z = this.q('czone');
      z.style.left = `${(c.z0 * 100).toFixed(1)}%`; z.style.width = `${((c.z1 - c.z0) * 100).toFixed(1)}%`;
      this.q('cneedle').style.left = `${(c.needle * 100).toFixed(1)}%`;
      meter.classList.toggle('hot', c.inZone);
    }
    const tk = c.tellK, his = c.phase === 'empoignade' && c.aiPlan.act === 'attaque';
    const word = !live ? '' : c.phase === 'debout' ? 'Saisir' : c.phase === 'empoignade' ? (his ? (tk >= c.counterFrom() ? 'Contre !' : 'Résiste') : 'Force') : c.phase === 'projection' ? 'Projeter' : c.phase === 'replay' ? 'Passer' : '';
    act.hidden = !word; if (word && act.textContent !== word) act.textContent = word;
    act.classList.toggle('defend', his);
    act.classList.toggle('hot', (c.phase === 'debout' && (c.ai.act === 'rate' || tk >= c.holdFrom())) || (his && tk >= c.holdFrom()) || (c.phase === 'projection' && c.inZone));
    act.classList.toggle('counter', his && tk >= c.counterFrom());
    act.classList.toggle('hold', c.phase === 'empoignade' && !his);
    act.classList.toggle('small', c.phase === 'replay');
    const showTechs = live && c.phase === 'empoignade' && !his;
    techs.hidden = !showTechs;
    if (showTechs) for (const b of techs.querySelectorAll<HTMLElement>('[data-t]')) {
      const id = b.dataset.t as TechId;
      b.classList.toggle('lit', c.lit === id);
      const bar = b.firstElementChild as HTMLElement; const w = `${Math.round(100 * c.open[id])}%`; if (bar.style.width !== w) bar.style.width = w;
    }
    this.q('ctag').hidden = c.phase !== 'replay';
    this.ui.classList.toggle('tell', this.t - this.cineTellAt < 0.45);
  }

  private drawCombat(cl: HTMLElement, brk: HTMLElement) {
    const me = this.me, ai = this.ai, inClinch = this.phase === 'clinch';
    const set = (k: string, text: string, cls: Record<string, boolean> = {}) => {
      const el = this.ui.querySelector<HTMLElement>(`[data-k=${k}]`); if (!el) return;
      if (el.innerHTML !== text) el.innerHTML = text;
      for (const c of ['ready', 'hot', 'dim']) el.classList.toggle(c, !!cls[c]);
    };
    if (inClinch) {
      cl.hidden = false;
      this.q('tug').style.width = `${Math.round((this.grip + 100) / 2)}%`;
      const word = (h: Hold) => (h.kind ? GRIPS[h.kind].label : 'rien');
      const text = `${gripWords(this.grip)} · toi : ${word(me.hold)} · lui : ${word(ai.hold)}`;
      if (this.q('cl').textContent !== text) this.q('cl').textContent = text;
      const his = this.attempt && this.attempt.by === ai;
      const b = bestThrow(me, ai), ready = !!b && throwScore(b.id, me, ai) >= COMBAT.throwAt;
      set('grab', his ? 'Contrer' : b ? THROWS[b.id].label : 'Projeter', { hot: !!his, ready: !his && ready, dim: !his && !ready });
      const next = me.hold.kind ? GRIPS[me.hold.kind].deeper : null;
      set('guard', next ? GRIPS[next].short : 'Prise', { dim: !next });
      set('break', 'Casser', { hot: this.grip > CLINCH.breakFloor && me.balance < 40 });
      const q = this.ui.querySelector<HTMLElement>('[data-k=quick]'); if (q) q.hidden = true;
    } else {
      cl.hidden = true; brk.classList.remove('hot');
      const leg = this.phase === 'fight' && legOpen(ai) && me.pos.distanceTo(ai.pos) < 2.2;
      set('grab', leg ? 'Jambe !' : 'Saisir', { hot: leg || (this.phase === 'fight' && (ai.open > 0 || ai.stagger > 0)) });
      set('guard', 'Garde'); set('break', 'Reculer');
      const q = this.ui.querySelector<HTMLElement>('[data-k=quick]'); if (q) q.hidden = false;
    }
    this.tellText = this.tellNow();
    me.look?.sign(null); ai.look?.sign(this.tellText);
  }
  /**
   * What the sign over his head says (levels 1–2 and the lesson: a beginner reads his tell before it lands): the move he
   * sets up, the reach, the throw, a big strike being armed. Null: nothing to tell, or a level that hides it.
   */
  private tellNow(): string | null {
    if (!this.combat || !(this.cl || (this.brain && this.brain.lvl.tells))) return null;
    const ai = this.ai, at = this.attempt;
    if (at && at.by === ai && at.id) return `${THROWS[at.id].label} !`;
    if (ai.move) return ai.move.kind === 'push' ? '→ pousse' : ai.move.kind === 'pull' ? '← tire' : '↻ pivote';
    if (ai.reach) return ai.reach.kind === 'jambe' ? '↓ jambe' : ai.reach.kind === 'ceinture' ? '↘ ceinture' : '✋ nuque';
    if (ai.strike && !ai.strike.landed && ai.strike.kind === 'big') return '✊ grosse frappe';
    return null;
  }
  /**
   * The lesson's or the drill's card as it reads now: the step and its keys, Coach Ablaye's word, the buttons in green
   * (`touch`: a phone, the keys give way to « Boutons en vert »). Taken from the state itself, so the card is never a
   * frame behind it: a step not set up yet (at the bell, or right after « Passer ») already has his word for that step.
   * Null: no card (no lesson or drill, the lesson over, or the recap).
   */
  stepCard(touch = false): { head: string; keys: string; coach: string; teach: string[]; skip: boolean } | null {
    if (this.phase === 'result') return null;
    if (this.cl) {
      const l = this.cl; if (l.done) return null;
      const d = COMBAT_LESSON[l.step as Exclude<typeof l.step, 'done'>], n = combatStepNumber(l);
      return { head: `${n.n}/${n.of} · ${d.title}`, keys: touch ? 'Boutons en vert' : d.keys, coach: l.ready ? this.coachText : combatCoachLine(l.step), teach: [...d.touch], skip: true };
    }
    if (this.drill && this.combat) {
      // the drills with the new controls: strikes on the one Frappe button, the empoignade's moves with the joystick
      const dr = this.drill, def = DRILLS[dr.id], s = drillScore(dr), n = Math.min(dr.next, def.calls.length), c = COMBAT_DRILL[dr.id];
      return {
        head: `${def.title} · ${n}/${def.calls.length} · juste ${s.right}${s.faults ? ` · fautes ${s.faults}` : ''}`,
        keys: touch ? 'Boutons en vert' : c.keys, coach: dr.ready ? this.coachText : drillLine(dr.id), teach: [...c.touch], skip: false,
      };
    }
    if (this.lesson) {
      const l = this.lesson; if (l.done) return null;
      const d = LESSON[l.step as keyof typeof LESSON], n = stepNumber(l.step);
      return { head: `${n.n}/${n.of} · ${d.title}`, keys: touch ? 'Boutons en vert' : d.keys, coach: l.ready ? this.coachText : coachLine(l.step), teach: [...d.touch], skip: true };
    }
    if (this.drill) {
      const dr = this.drill, def = DRILLS[dr.id], s = drillScore(dr), n = Math.min(dr.next, def.calls.length);
      return {
        head: `${def.title} · ${n}/${def.calls.length} · juste ${s.right}${s.faults ? ` · fautes ${s.faults}` : ''}`,
        keys: touch ? 'Boutons en vert' : def.keys, coach: dr.ready ? this.coachText : drillLine(dr.id), teach: [...def.touch], skip: false,
      };
    }
    return null;
  }

  // ---------------------------------------------------------------- abandon and recap
  private confirmOpen() { return !this.headless && !this.q('confirm').hidden; }
  askAbandon(open: boolean) {
    if (open && !(this.phase === 'intro' || this.phase === 'fight' || this.phase === 'clinch')) return;
    if (this.done || this.headless) return;
    this.q('confirm').hidden = !open; this.paused = open;
    if (open) { this.guardHeld = false; this.q<HTMLButtonElement>('no').focus(); }
  }
  /** Confirmed abandon: recorded as an abandon (no winner, no reward), never as a defeat by projection. */
  abandon() {
    if (!(this.phase === 'intro' || this.phase === 'fight' || this.phase === 'clinch') || this.done) return;
    if (!this.headless) this.q('confirm').hidden = true;
    this.paused = false;
    this.end('abandon', null);
  }

  private end(outcome: BoutOutcome, winner: Side | null) {
    this.outcome = outcome; this.winner = winner;
    if (this.brain && this.mode !== 'entrainement') remember(this.style.name, this.brain.habits);   // what he saw of the player, for the next time (an abandon too)
    const seconds = this.mode === 'entrainement' ? this.t : this.round - Math.max(0, this.timeLeft);
    this.result = {
      mode: this.mode, outcome, winner, seconds,
      score: { player: { ...this.me.score }, opponent: { ...this.ai.score } },
      stamina: { player: Math.round(this.me.stamina), opponent: Math.round(this.ai.stamina) },
      rewards: this.drill ? this.drillRewards(outcome) : boutRewards({ mode: this.mode, outcome, winner }),
    };
    if (this.combat && !this.cl && !this.drill) this.banner(outcome === 'projection' ? 'TERRE !' : outcome === 'abandon' ? 'ABANDON' : 'TEMPS !', 'end');
    if (outcome === 'projection' || outcome === 'decision' || outcome === 'egalite') {
      this.phase = 'fall'; this.phaseT = 0;
      if (this.fx && outcome === 'projection' && winner) this.feelFall = winner === 'player' ? { loser: this.ai, winner: this.me, landed: false } : { loser: this.me, winner: this.ai, landed: false };
      if ((this.frappe || this.combat) && winner && this.official) {
        const w = winner === 'player' ? this.me : this.ai, l = winner === 'player' ? this.ai : this.me;
        // the referee comes up beside the winner, on the far side from the camera so he stays in view
        const side = new THREE.Vector3(-(l.pos.z - w.pos.z), 0, l.pos.x - w.pos.x).normalize();
        if (side.z < 0) side.multiplyScalar(-1);
        this.fallFx = { loser: l, winner: w, refFrom: this.official.group.position.clone(), refTo: w.pos.clone().addScaledVector(side, 1.1).setY(this.official.group.position.y), cheered: false };
        if (outcome === 'projection') { w.clip = 'Stance'; l.clip = this.combat && this.fallKind === 'appuis' ? 'Kneel' : 'Fall_Back'; }
      }
      if (this.frappe) this.onMoment?.('fall', winner);
    } else this.showRecap();
  }

  /** Avec frappe: the referee raises the winner's arm (step 6) — told once, as a moment (the announcer gives the result). */
  private armMoment() {
    if (this.armTold || !this.winner || this.phaseT <= 1.8) return;
    this.armTold = true;
    this.onMoment?.('arm', this.winner);
  }

  /**
   * « Le choc » (src/lamb/fx.ts): what a contact does in the player's own bout — the stop and the camera's push (held
   * by `fx`), the sound, the buzz (src/transport/haptics.ts: Android, the « Vibrations » setting). `mine`: the player did
   * it; `taken`: the player took it. Nothing in a watched bout or without a DOM.
   */
  private feel(e: FxEvent, mine = false, taken = false) {
    const fx = this.fx; if (!fx) return;
    if (this.combat) {                                                     // the shake, by force
      const a = ({ quick: 0.02, big: 0.05, stagger: 0.07, guarded: 0.02, throw: 0.06, counter: 0.06, read: 0.03, grip: 0.015, fall: 0.13 } as Record<string, number>)[e] ?? 0;
      if (a >= this.shakeAmp * Math.exp(-9 * this.shakeT)) { this.shakeAmp = a; this.shakeT = 0; }
    }
    const p = fx.hit(e, { mine, taken });
    if (p.sound === 'thud') fallThud(); else if (p.sound === 'slap') gripSlap();
    if (p.buzz !== null) buzz(p.buzz);
  }

  private showRecap() {
    this.phase = 'result'; this.phaseT = 0; this.msg('', 0); this.msgHold = 0;
    if (this.headless) return;
    this.q('msg').textContent = '';
    const r = this.result!;
    const title = r.outcome === 'abandon' ? 'Abandon' : r.outcome === 'entrainement' ? 'Entraînement terminé' : r.winner === 'player' ? 'Victoire' : r.winner === 'opponent' ? 'Défaite' : 'Match nul';
    const mode = { entrainement: 'Entraînement (non classé)', amical: 'Combat amical (non classé)', classe: 'Combat classé' }[r.mode];
    const opp = r.mode === 'entrainement' ? 'Babacar (partenaire)' : this.identity ?? `${this.style.name} · ${this.style.label} · niveau ${this.level}`;
    const row = (l: string, a: number | string, b: number | string) => `<tr><td>${l}</td><td>${a}</td><td>${b}</td></tr>`;
    const box = this.q('recap');
    if (this.cine) { this.showCineRecap(box, r, mode, opp); return; }
    box.innerHTML = `<div><h2></h2><p data-r="how"></p>
      <table><tr><th>${mode}</th><th>Toi</th><th data-r="opp"></th></tr>
      ${row('Endurance restante', r.stamina.player, r.stamina.opponent)}
      ${row('Parades réussies', r.score.player.guards, r.score.opponent.guards)}
      ${row('Saisies engagées', r.score.player.grabs, r.score.opponent.grabs)}
      ${row('Dégagements', r.score.player.breaks, r.score.opponent.breaks)}
      ${this.frappe ? row('Frappes touchées', r.score.player.hits ?? 0, r.score.opponent.hits ?? 0) + row('Adversaire vacille', r.score.player.staggers ?? 0, r.score.opponent.staggers ?? 0) : ''}
      ${this.combat ? row('Projections tentées', this.me.tally.throws, this.ai.tally.throws) + row('Sorties provoquées', this.me.tally.sorties, this.ai.tally.sorties) + row('Avertissements', this.me.tally.warnings, this.ai.tally.warnings) : ''}
      ${r.outcome === 'decision' || r.outcome === 'egalite' ? row('Points (arbitre)', this.combat ? combatPoints(this.me.score, this.me.tally, this.ai.tally) : points(r.score.player, RULES[this.discipline]), this.combat ? combatPoints(this.ai.score, this.ai.tally, this.me.tally) : points(r.score.opponent, RULES[this.discipline])) : ''}
      </table>
      <b>Récompenses</b><ul>${r.rewards.lines.map(() => '<li></li>').join('')}</ul>
      <small>${RULES[this.discipline].label} · ${RULES_STATUS}. Durée : ${Math.round(r.seconds)} s.</small>
      ${this.rematchable && r.mode !== 'entrainement' && r.outcome !== 'abandon' ? '<button data-k="again">Revanche</button>' : ''}
      <button data-k="continue">Continuer</button></div>`;
    box.querySelector('h2')!.textContent = title;
    // the new bout says how he fell (the throw, the rule)
    const how = this.combat && r.outcome === 'projection' && this.fallKind ? `${this.throwName ? `${this.throwName[0].toUpperCase()}${this.throwName.slice(1)} · ` : ''}${this.fallKind === 'appuis' ? 'les quatre appuis' : 'le dos au sol'}` : OUTCOME_TEXT[r.outcome];
    box.querySelector('[data-r=how]')!.textContent = `${how} · ${opp}`;
    box.querySelector('[data-r=opp]')!.textContent = r.mode === 'entrainement' ? 'Babacar' : this.style.name;
    box.querySelectorAll('li').forEach((li, i) => (li.textContent = r.rewards.lines[i]));
    box.querySelector('[data-k=continue]')!.addEventListener('click', () => this.finish());
    box.querySelector('[data-k=again]')?.addEventListener('click', () => { this.rematch = true; this.finish(); });
    box.hidden = false;
  }
  /**
   * The cinematic bout's result, a fight card's: the verdict big, how it was won, three numbers face to face, the rewards
   * on one line, two buttons.
   */
  private showCineRecap(box: HTMLElement, r: DuelResult, mode: string, opp: string) {
    const c = this.cine!, won = r.winner === 'player', lost = r.winner === 'opponent';
    const verdict = r.outcome === 'abandon' ? 'Abandon' : won ? 'Victoire' : lost ? 'Défaite' : 'Match nul';
    const tech = c.scene?.tech ? TECHS[c.scene.tech].label : null;
    const method = r.outcome === 'projection' ? (tech ? `Par ${tech.toLowerCase()}` : 'Par projection')
      : c.sorties.player >= 3 || c.sorties.opponent >= 3 ? 'Par sorties' : r.outcome === 'decision' ? 'Aux points' : r.outcome === 'abandon' ? 'Par abandon' : 'Égalité';
    const sub = r.outcome === 'projection' ? 'Le dos au sol' : c.sorties.player >= 3 || c.sorties.opponent >= 3 ? 'Trois fois hors du cercle' : `${c.points.player} – ${c.points.opponent}`;
    const sec = Math.max(0, Math.round(r.seconds)), clock = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    const name = r.mode === 'entrainement' ? 'Babacar' : this.style.name;
    const bar = (label: string, a: number, b: number) => {
      const t = Math.max(1, a + b), pa = Math.round((100 * a) / t);
      return `<div class="rc-stat"><b>${a}</b><span>${label}</span><b>${b}</b><i><u style="width:${pa}%"></u><u style="width:${100 - pa}%"></u></i></div>`;
    };
    const chips = r.rewards.lines.filter((l: string) => /[+−-]\s?\d/.test(l)).map((l: string) => `<em>${l.replace(/^(.*?)\s*([+−-]\s?[\d\s]+.*)$/, '$2 $1')}</em>`).join('');
    box.classList.add('rc');
    document.body.classList.add('cine-cut');
    this.ui.classList.add('rc-on');
    box.classList.toggle('rc-lost', lost);
    box.innerHTML = `<div class="rc-card">
      <small class="rc-kick"></small>
      <h2 class="rc-verdict"></h2>
      <div class="rc-names"><span class="${won ? 'w' : ''}">Toi</span><i>vs</i><span class="${lost ? 'w' : ''}" data-r="opp"></span></div>
      <div class="rc-method"><strong></strong><small></small></div>
      <div class="rc-stats">${bar('Prises', c.stats.player.throws, c.stats.opponent.throws)}${bar('Contres', c.stats.player.counters, c.stats.opponent.counters)}${bar('Endurance', Math.round(c.stamina.player), Math.round(c.stamina.opponent))}</div>
      ${chips ? `<div class="rc-chips">${chips}</div>` : ''}
      <div class="rc-btns">${this.rematchable && r.mode !== 'entrainement' && r.outcome !== 'abandon' ? '<button data-k="again">Revanche</button>' : ''}<button data-k="continue">Continuer</button></div></div>`;
    box.querySelector('.rc-kick')!.textContent = mode.replace(/\s*\(.*\)/, '');
    box.querySelector('.rc-verdict')!.textContent = verdict;
    box.querySelector('[data-r=opp]')!.textContent = name;
    box.querySelector('.rc-method strong')!.textContent = method;
    box.querySelector('.rc-method small')!.textContent = `${sub} · ${clock}`;
    void opp;
    box.querySelector('[data-k=continue]')!.addEventListener('click', () => this.finish());
    box.querySelector('[data-k=again]')?.addEventListener('click', () => { this.rematch = true; this.finish(); });
    box.hidden = false;
  }
  /** Close the recap (also after a delay, so an idle player is never stuck). */
  finish() { if (this.phase === 'result') this.done = true; }

  // ---------------------------------------------------------------- debug/test hooks
  pressGrab() {
    if (this.combat) { if (this.phase === 'clinch') this.throwPresses++; else if (this.phase === 'result') this.finish(); else this.reachTap++; return; }
    this.grabTaps++;
  }
  /** The new bout, checks and tests: a reach — a tap (the nape, or his leg when he leans in) or a hold of Saisir (the belt). */
  pressReach(how: 'tap' | 'hold') { if (how === 'hold') this.reachHold++; else this.reachTap++; }
  /** The new bout: Saisir in the empoignade — go deeper (the nape → the arm → the belt). */
  pressDeeper() { this.deeperPresses++; }
  /** The new bout, checks and tests: the stick in the player's own frame (f towards him, s to his left) for `seconds` of bout. */
  debugStick(f: number, s: number, seconds = 0.5) { this.stickOver = { f, s }; this.stickUntil = this.t + seconds; }
  /** Screen axes of the duel's camera on the ground (where `input.move()` x and y point): right and forward. */
  axes() { return { right: { x: this.camRight.x, z: this.camRight.z }, fwd: { x: this.camFwd.x, z: this.camFwd.z } }; }
  pressBreak() { this.breakPresses++; }
  /** Avec frappe, in the empoignade: push, pull or pivot (same as Saisir, Garde, Frappe). */
  pressMove(kind: ClinchMove) { this.moveQueued = kind; }
  /** Avec frappe: a quick or a big strike (same as the buttons). */
  pressStrike(kind: StrikeKind) { if (kind === 'big') this.bigPresses++; else this.quickPresses++; }
  /** Coach Ablaye's lesson: skip the current step (« Passer »). */
  skipLessonStep() {
    if (this.cl) {
      if (this.cl.done || this.phase === 'result') return;
      combatAdvance(this.cl, true);
      if (this.cl.done) this.finishLesson();
      this.draw();
      return;
    }
    const l = this.lesson; if (!l || l.done || this.phase === 'result') return;
    advance(l, true);
    if (l.done) this.finishLesson();
    this.draw();                                                           // the card shows the next step now, not a frame later
  }
  /** Checks only: set a wrestler's balance, composure or endurance (to reach a state without a long bout). */
  debugSet(side: Side, v: { balance?: number; composure?: number; stamina?: number; grip?: number; lean?: [number, number]; hold?: [GripKind | null, number] }) {
    const f = side === 'player' ? this.me : this.ai;
    if (v.lean) { const l = Math.hypot(v.lean[0], v.lean[1]) || 1; f.dir = { f: v.lean[0] / l, s: v.lean[1] / l }; }
    if (v.hold) { f.hold = { kind: v.hold[0], str: v.hold[1] }; this.grip = gripAdvantage(this.me.hold, this.ai.hold); }
    if (this.combat && v.grip !== undefined && v.hold === undefined) {
      // the Prise is the holds' now: a grip asked for is given as the holds' strength
      const mine = side === 'player' ? v.grip : -v.grip, hi = (h: Hold) => h.kind ?? 'nuque';
      this.me.hold = { kind: hi(this.me.hold), str: Math.max(10, Math.min(100, 50 + mine / 1.6)) }; this.ai.hold = { kind: hi(this.ai.hold), str: Math.max(10, Math.min(100, 50 - mine / 1.6)) };
      this.grip = gripAdvantage(this.me.hold, this.ai.hold);
      if (v.balance !== undefined) f.balance = v.balance;
      if (v.composure !== undefined) f.composure = v.composure;
      if (v.stamina !== undefined) f.stamina = v.stamina;
      return;
    }
    if (v.grip !== undefined) this.grip = side === 'player' ? v.grip : -v.grip;
    if (v.balance !== undefined) f.balance = v.balance;
    if (v.composure !== undefined) f.composure = v.composure;
    if (v.stamina !== undefined) f.stamina = v.stamina;
  }
  /** Checks only: hold the opponent, the clock and the referee still (see `held`), or let them go again. */
  debugHold(on: boolean) {
    this.held = on;
    if (on) { this.ai.move = null; this.ai.windup = 0; this.aiReact = null; this.aiGuardHold = 0; this.ai.guard = false; this.ai.reach = null; this.ai.deeper = 0; this.ai.weight = { f: 0, s: 0 }; }
  }
  /**
   * Checks only: answer each drill call right as it opens (the called strike; the move that beats his, or a push with
   * his push), through the same inputs as the buttons — a slow browser cannot miss the call's window.
   */
  debugDrillAnswer(on: boolean) { this.drillAuto = on; }
  /**
   * Checks only: the opponent throws this strike now — what his AI starts when it decides to strike (`startStrike`), and it
   * lands by the rules like any other. With `debugHold` it lets a check meet his strike every run (scripts/check-lamb2.mjs,
   * the guard step), where his own choice would often be a grab: a raised guard stops strikes, not a grab (stand.ts decide).
   */
  debugAiStrike(kind: StrikeKind): boolean {
    if (this.phase !== 'fight' || !this.frappe) return false;
    this.aiGuardHold = 0; this.ai.guard = false;
    return startStrike(this.ai, kind);
  }
  /**
   * Checks and tests only: the opponent starts this throw now (the one his hold gives when `id` is omitted) — what his AI
   * starts when it decides to throw (`startCombatThrow`); it lands by the rules like any other, braced or countered.
   */
  debugAiThrow(id?: ThrowId): boolean {
    if (!this.combat || this.phase !== 'clinch' || this.attempt) return false;
    this.ai.move = null; this.ai.recover = 0; this.ai.deeper = 0;
    return this.startCombatThrow(this.ai, this.me, id);
  }
  /** Checks only: the seconds left in the round (a long check's earlier steps do not eat the later ones' time). */
  debugClock(seconds: number) { if (this.timeLeft !== Infinity) this.timeLeft = seconds; }
  setGuard(on: boolean) { this.guardHeld = on; }
  /** World points on both wrestlers (feet, waist, head) for layout checks. */
  /** The two wrestlers' bodies (null before the humanoid is loaded): the arena's fête moves them once the bout is over. */
  bodies(): { player: Wrestler | null; opponent: Wrestler | null } { return { player: this.me.w, opponent: this.ai.w }; }
  /**
   * What a watched bout's pilot reads of the duel (src/arena/bout.ts, six steps a long frame), written into `v`: the same
   * values as `info()`'s phase, distance, windup, opening, endurance and empoignade, without building its whole object.
   */
  pilotView(v: PilotView): PilotView {
    const me = this.me, ai = this.ai;
    v.phase = this.phase;
    v.dist = Math.round(me.pos.distanceTo(ai.pos) * 100) / 100;
    v.windup = ai.windup > 0;
    v.open = me.open > 0 ? 'player' : ai.open > 0 ? 'opponent' : null;
    v.stamina.player = Math.round(me.stamina); v.stamina.opponent = Math.round(ai.stamina);
    const c = this.phase === 'clinch' ? this.clinchState() : null;
    v.clinch = c ? { losing: c.losing, breakWindow: c.breakWindow } : null;
    return v;
  }
  /** Where the two wrestlers stand on the ground (x, z of the « player » side, then of the opponent), into `out`. */
  fighterXZ(out: number[]): number[] {
    const me = this.me.pos, ai = this.ai.pos;
    out[0] = me.x; out[1] = me.z; out[2] = ai.x; out[3] = ai.z;
    return out;
  }
  fighterPoints(): [number, number, number][] { const p = new THREE.Vector3(); return [this.me, this.ai].flatMap(f => { this.placeOf(f, p); return [0.1, 1, this.headOf(f)].map(h => [p.x, p.y + h, p.z] as [number, number, number]); }); }
  /** How high a wrestler's head stands above his feet: the top of the body drawn (v4's or the Roi des Arènes'), 1.8 m without one. */
  private headOf(f: Fighter): number { return f.w ? f.w.headTop() : 1.8; }
  info() {
    const c = this.phase === 'clinch' ? this.clinchState() : null;
    return {
      mode: this.mode, phase: this.phase, winner: this.winner, outcome: this.outcome, style: this.style.id, opponent: this.style.name, level: this.level,
      timeLeft: this.timeLeft === Infinity ? null : Math.round(this.timeLeft * 10) / 10, paused: this.paused, ...(this.held ? { held: true } : {}),
      step: this.mode === 'entrainement' ? (TUTORIAL[this.step]?.id ?? 'done') : null,
      stamina: { player: Math.round(this.me.stamina), opponent: Math.round(this.ai.stamina) },
      open: this.me.open > 0 ? 'player' : this.ai.open > 0 ? 'opponent' : null,
      windup: this.ai.windup > 0, dist: Math.round(this.me.pos.distanceTo(this.ai.pos) * 100) / 100,
      clinch: c ? { by: c.by, losing: c.losing, breakWindow: c.breakWindow, share: Math.round(c.share * 100) / 100,
        ...(this.frappe || this.combat ? { grip: Math.round(this.grip), entry: this.entry, move: { player: this.me.move?.kind ?? null, opponent: this.ai.move?.kind ?? null }, last: this.lastExchange,
          posture: { player: posture(this.me.balance), opponent: posture(this.ai.balance) },
          attempt: this.attempt ? { by: this.attempt.by === this.me ? 'player' : 'opponent', t: Math.round(this.attempt.t * 100) / 100, counter: this.attempt.counter } : null } : {}) } : null,
      ...(this.frappe || this.combat ? { lastThrow: this.lastThrow } : {}),
      ...(this.phase === 'fall' && this.fallFx && this.official ? { fall: {
        t: Math.round(this.phaseT * 100) / 100, slow: this.outcome === 'projection' && this.phaseT < 0.9, cheered: this.fallFx.cheered,
        referee: Math.round(this.official.group.position.distanceTo(this.fallFx.winner.pos) * 100) / 100,
        refereeFrom: Math.round(this.fallFx.refFrom.distanceTo(this.fallFx.winner.pos) * 100) / 100,
        arm: this.phaseT > 1.8, ...(this.feelFall ? { landed: this.feelFall.landed } : {}),
      } } : this.phase === 'fall' && this.feelFall ? { fall: {
        t: Math.round(this.phaseT * 100) / 100, slow: this.outcome === 'projection' && this.phaseT < FX.fall.slowFor, landed: this.feelFall.landed,
      } } : {}),
      ...(this.fx ? { fx: this.fxInfo() } : {}),
      ...(this.combat ? { combat: this.combatInfo() } : {}),
      score: { player: { ...this.me.score }, opponent: { ...this.ai.score } },
      discipline: this.discipline, identity: this.identity, ...(this.frappe || this.combat ? { refereeRaised: this.refRaised } : {}),
      ...(this.lesson ? { lesson: { step: this.lesson.step, done: this.lesson.done, skipped: this.lesson.skipped } } : {}),
      ...(this.cl ? { lesson: { step: this.cl.step, done: this.cl.done, skipped: this.cl.skipped, combat: true } } : {}),
      ...(this.drill ? { drill: { id: this.drill.id, t: Math.round(this.drill.t * 100) / 100, next: this.drill.next, open: this.drill.open ? { ...this.drill.open, want: DRILLS[this.drill.id].calls[this.drill.open.i].want } : null, results: [...this.drill.results], ...drillScore(this.drill), done: this.drill.done } } : {}),
      ...(this.frappe || this.combat ? {
        balance: { player: Math.round(this.me.balance), opponent: Math.round(this.ai.balance) },
        composure: { player: Math.round(this.me.composure), opponent: Math.round(this.ai.composure) },
        guard: { player: this.me.guard, opponent: this.ai.guard },
        strike: { player: this.me.strike?.kind ?? null, opponent: this.ai.strike?.kind ?? null },
        stagger: this.me.stagger > 0 ? 'player' : this.ai.stagger > 0 ? 'opponent' : null,
        lastStrike: this.lastStrike,
      } : {}),
    };
  }

  /**
   * The new bout for the checks and the tests (`duelInfo().combat`): each side's hold, imbalance (own frame: f towards
   * the other, s to his left; depth = its length), weight, reach under way and the referee's tally; the throw the player's
   * hold gives now (its score, ready or not), the opponent's level, style, signature, what he has read, the sign over his
   * head, and how the bout ended (the throw, the fall).
   */
  private combatInfo() {
    const r2 = (x: number) => Math.round(x * 100) / 100;
    const side = (f: Fighter) => {
      const l = lean(f);
      return { hold: f.hold.kind ? { kind: f.hold.kind, str: Math.round(f.hold.str) } : null, lean: { f: r2(l.f), s: r2(l.s), depth: r2(Math.hypot(l.f, l.s)) }, weight: { f: r2(f.weight.f), s: r2(f.weight.s) },
        reach: f.reach ? { kind: f.reach.kind, t: r2(f.reach.t) } : null, deeper: f.deeper > 0, guardFor: r2(f.guardFor), tally: { ...f.tally }, idle: r2(f.idle) };
    };
    const b = bestThrow(this.me, this.ai), sc = b ? throwScore(b.id, this.me, this.ai) : 0;
    const at = this.attempt;
    return {
      player: side(this.me), opponent: side(this.ai), prise: Math.round(this.grip),
      best: b ? { id: b.id, label: THROWS[b.id].label, setup: r2(b.setup), score: Math.round(sc), ready: sc >= COMBAT.throwAt } : null,
      attempt: at && at.id ? { by: at.by === this.me ? 'player' : 'opponent', id: at.id, t: r2(at.t), brace: at.braceT ? r2(at.braceSum! / at.braceT) : 0, counter: at.counter } : null,
      ai: this.brain ? { level: this.level, style: this.brain.style, signature: SIGNATURE[this.brain.style].throw, reads: [...this.brain.reads], habits: this.brain.habits } : null,
      tell: this.tellText, fall: this.fallKind, throwName: this.throwName, referee: this.refereeSaid,
      points: { player: combatPoints(this.me.score, this.me.tally, this.ai.tally), opponent: combatPoints(this.ai.score, this.ai.tally, this.me.tally) },
      pair: { v: r2(Math.hypot(this.pairVel.x, this.pairVel.z)), spin: r2(this.pairSpin) },
      body: { player: this.me.look?.info() ?? null, opponent: this.ai.look?.info() ?? null }, clips: !!combatClips(),
      cine: this.cine ? { phase: this.cine.phase, t: r2(this.cine.t), needle: r2(this.cine.needle), z0: r2(this.cine.z0), z1: r2(this.cine.z1), grip: r2(this.cine.grip), ai: this.cine.ai.act, plan: this.cine.aiPlan.act, lit: this.cine.lit, lean: r2(this.cine.lean.opponent.f), aiT: r2(this.cine.ai.t), aiDur: r2(this.cine.ai.dur), tellK: r2(this.cine.tellK), holdFrom: r2(this.cine.holdFrom()), counterFrom: r2(this.cine.counterFrom()), open: Object.fromEntries(Object.entries(this.cine.open).map(([k, v]) => [k, r2(v)])), start: this.cine.start, tech: this.cine.tech, stamina: { player: Math.round(this.cine.stamina.player), opponent: Math.round(this.cine.stamina.opponent) }, force: r2(this.cine.force), sorties: this.cine.sorties, winner: this.cine.winner, scene: this.cine.scene ? { kind: this.cine.scene.kind, by: this.cine.scene.by, t: r2(this.cine.scene.t), result: this.cine.scene.result } : null } : null,
      rematchable: this.rematchable,
      combos: this.combos, banner: this.bannerSaid, dust: this.dust?.grains ?? 0, shake: Math.round(1000 * this.shakeAmp * Math.exp(-9 * this.shakeT)) / 1000,
      combo: at && at.id ? { combo: !!at.combo, special: !!at.special } : null,
    };
  }

  /**
   * « Le choc » for the checks (`duelInfo().fx`): stops started and the last one's length, the camera (the fight's
   * framing, the empoignade's close-up, the fall's close shot) with its close-up blend and push, the distance the bodies
   * are drawn apart, thuds, slaps and buzzes asked of the phone.
   */
  private fxInfo() {
    const fx = this.fx!, a = this.placeOf(this.me, new THREE.Vector3()), b = this.placeOf(this.ai, new THREE.Vector3());
    const down = this.fallFx?.loser ?? this.feelFall?.loser;
    const fall = this.phase === 'fall' && !!down && this.outcome === 'projection' && this.phaseT < (this.fallFx ? 1.2 : FX.fall.close);
    return {
      stops: fx.stops, lastStop: fx.lastStop, holding: fx.holding,
      cam: fall ? 'fall' : this.phase === 'clinch' ? 'clinch' : 'fight', close: Math.round(fx.close * 100) / 100, kick: Math.round(fx.kick * 1000) / 1000,
      clinchDist: Math.round(Math.hypot(a.x - b.x, a.z - b.z) * 100) / 100,
      thuds: fx.thuds, slaps: fx.slaps, buzzes: fx.buzzes, lastBuzz: fx.lastBuzz,
      ...(this.roomAt ? { room: { top: Math.round(this.roomAt.top), bottom: Math.round(this.roomAt.bottom) } } : {}),
    };
  }

  // ---------------------------------------------------------------- rules in motion
  private clinchState() {
    if (this.phase !== 'clinch' || !this.clinchBy) return null;
    const strength = (f: Fighter) => this.frappe ? clinchPower(f.effort, f.stamina, f.balance, f === this.me ? this.grip : -this.grip) : clinchStrength(f.effort, f.stamina, this.clinchBy === f);
    const mine = strength(this.me), theirs = strength(this.ai);
    return { by: (this.clinchBy === this.me ? 'player' : 'opponent') as Side, mine, theirs, losing: mine < theirs, share: mine / Math.max(0.01, mine + theirs), breakWindow: breakWindowOpen(this.phaseT) };
  }
  private stepId(): StepId | null { return this.mode === 'entrainement' && this.step < TUTORIAL.length ? TUTORIAL[this.step].id : null; }
  private nextStep() {
    this.step++;
    if (this.step >= TUTORIAL.length) { this.msg('Bravo ! Coach Ablaye : « C’est la base. »', 2); this.end('entrainement', null); }
  }
  private canAct(f: Fighter) { return f.busy <= 0 && f.open <= 0 && f.windup <= 0 && f.dodge <= 0; }

  /** Player grab: instant; the opponent's guard (decided by its style) stops it and exposes the player. */
  private playerGrab() {
    const me = this.me, ai = this.ai, d = me.pos.distanceTo(ai.pos);
    if (me.open > 0) { this.msg('Tu es exposé : recule ou attends', 0.8); return; }
    if (!this.canAct(me) || (this.frappe && !free(me))) return;
    if (me.stamina < R.stamina.grabCost) { this.msg('Plus d’endurance', 0.8); return; }
    me.stamina -= R.stamina.grabCost; me.busy = 0.6; me.clip = 'Grab';
    if (d > R.grabRange) { me.open = R.openingSeconds * 0.6; this.msg('Trop loin', 0.8); return; }
    me.score.grabs++;
    const tutorialGuard = this.stepId() !== null; // the training partner never blocks
    if (!tutorialGuard && !this.frappe && ai.guard && ai.open <= 0 && ai.windup <= 0) {
      me.open = R.openingSeconds; ai.score.guards++;
      this.msg('Bloqué ! Tu es exposé', 1);
      if (this.rand() < Math.min(0.9, this.style.counterChance * this.factor) && ai.stamina >= R.stamina.grabCost) { this.aiThink = 0.25; }
      return;
    }
    if (ai.windup > 0) ai.windup = 0;                                              // grabbed before its own grab landed
    if (ai.strike && !ai.strike.landed) ai.strike = null;                         // grabbed while winding up a strike
    // avec frappe, the guard is for strikes: hands up, the body is open to a grab
    this.startClinch(me, ai.open > 0 ? 'Saisie sur l’ouverture !' : ai.stagger > 0 ? 'Saisi pendant qu’il vacille !' : 'Empoignade !',
      ai.stagger > 0 ? 'stagger' : ai.open > 0 ? 'open' : this.frappe && ai.guard ? 'guard' : 'neutral');
  }
  /** Opponent grab: starts a windup, the player's response window (guard or dégagement cancels it). */
  private aiGrab() {
    const me = this.me, ai = this.ai;
    ai.stamina -= R.stamina.grabCost; ai.score.grabs++; ai.clip = 'Grab'; ai.busy = 0;
    if (me.open > 0 || me.stagger > 0) { this.startClinch(ai, me.stagger > 0 ? 'Tu vacilles : il te saisit !' : 'Contre ! Il saisit ton ouverture', me.stagger > 0 ? 'stagger' : 'open'); return; }
    ai.windup = R.responseWindow * this.style.windup * (ai.slow ?? 1);
    this.msg(this.frappe ? 'Il veut te saisir ! Recule ou frappe-le' : 'Il attaque ! Garde ou dégage !', ai.windup);
  }
  private responded(how: 'guard' | 'dodge') {
    const ai = this.ai;
    ai.windup = 0; ai.open = R.openingSeconds; ai.busy = 0.2; this.me.score.guards++;
    this.msg(how === 'guard' ? 'Bien gardé ! Ouverture !' : 'Esquivé ! Ouverture !', 1.1);
    if (this.stepId() === 'guard') this.nextStep();
    else if (this.stepId() === 'break') this.msg('Cette fois, laisse-le te saisir', 1.4);
  }
  private dodge() {
    const me = this.me;
    if (me.busy > 0 || me.dodge > 0 || (this.frappe && !free(me))) return;
    if (me.stamina < R.stamina.dodgeCost) { this.msg('Plus d’endurance', 0.8); return; }
    me.stamina -= R.stamina.dodgeCost; me.dodge = 0.28; me.busy = 0.35; me.guard = false;
    if (this.ai.windup > 0) this.responded('dodge');
  }

  update(dt: number): { cam: THREE.Vector3; look: THREE.Vector3; kick?: THREE.Vector3 } {
    // « Le choc »: the camera's push and close-up run in real time; a hit-stop holds the bout itself — no clock, no AI,
    // no pose — and keeps the presses made meanwhile for the frame it ends on
    const fx = this.fx;
    if (fx) {
      fx.tick(dt, this.phase === 'clinch', this.phase === 'clinch' || (this.phase === 'fall' && !!this.feelFall));
      this.shakeT += dt;
      if (!this.paused && fx.holds(dt)) return this.aim(this.gap);
    }
    if (this.paused) { this.grabTaps = 0; this.breakPresses = 0; this.guardTapped = false; this.reachTap = 0; this.reachHold = 0; this.throwPresses = 0; this.deeperPresses = 0; return this.frame(0); }
    if (this.combat) {
      // the new bout: Saisir held past COMBAT_HOLD.grab is a reach for the belt, Frappe held past COMBAT_HOLD.strike the big strike
      const now = LambDuel.now();
      if (this.grabHeld && !this.grabFired && now - this.grabHeldT >= COMBAT_HOLD.grab * 1000) { this.grabFired = true; if (this.phase === 'fight') this.reachHold++; }
      if (this.quickHeld && !this.quickFired && now - this.quickHeldT >= COMBAT_HOLD.strike * 1000) { this.quickFired = true; if (this.phase === 'fight') this.bigPresses++; }
    }
    this.t += dt;
    const tPrev = this.phaseT; this.phaseT += dt; this.msgHold = Math.max(0, this.msgHold - dt);
    const me = this.me, ai = this.ai;
    const taps = this.grabTaps; this.grabTaps = 0;
    const breaks = this.breakPresses; this.breakPresses = 0;
    const quick = this.quickPresses, big = this.bigPresses; this.quickPresses = 0; this.bigPresses = 0;
    const guardPress = (this.guardHeld && !this.guardWas) || this.guardTapped; this.guardWas = this.guardHeld; this.guardTapped = false;
    for (const f of [me, ai]) { f.busy = Math.max(0, f.busy - dt); if (!this.frappe) f.open = Math.max(0, f.open - dt); }
    const step = this.stepId();
    const down = this.feelFall;
    if (this.phase === 'fall' && down && !down.landed && this.phaseT >= FX.fall.land) {
      down.landed = true;
      this.feel('fall', down.winner === me, down.loser === me);
      this.dustAt(down.loser, 1);
    }

    if (this.phase === 'intro' && this.cineIntro) {
      this.introCine();
    } else if (this.phase === 'intro') {
      // referee check, kept to plain words (no invented ritual wording)
      // avec frappe, the opponent is introduced first: who he is, in one line
      const lead = this.identity ? 1.3 : 0;
      this.msg(this.phaseT < lead ? `Face à toi : ${this.identity}` : this.phaseT < lead + 1.4 ? (this.mode === 'entrainement' ? 'Coach Ablaye : prêts ?' : 'Arbitre : prêts ?') : 'Làmb !');
      me.clip = ai.clip = 'Prep';
      if (this.phaseT > lead + 2.2) { this.phase = 'fight'; this.phaseT = 0; this.msg(''); if (this.combat) this.banner('BËRE !', 'start'); }
    } else if ((this.lesson || this.cl) && this.lessonEnd > 0 && (this.lessonEnd -= dt) <= 0) {
      this.end('entrainement', null);                                       // the lesson is over: the training's recap
    } else if (this.drill && this.drillEnd > 0 && (this.drillEnd -= dt) <= 0) {
      this.end('entrainement', null);                                       // the drill is over: its recap
    } else if ((this.phase === 'fight' || this.phase === 'clinch') && this.cineOn()) {
      this.cineStep(dt);
    } else if (this.phase === 'fight' && this.combat) {
      if (this.drill) this.drillSetup();
      if ((this.phase as DuelPhase) === 'clinch') return this.frame(dt);
      this.fightCombat(dt, breaks, quick, big);
    } else if (this.phase === 'clinch' && this.combat) {
      if (this.drill) this.drillSetup();
      if ((this.phase as DuelPhase) === 'fight') return this.frame(dt);
      if (quick > 0) this.moveQueued = 'pivot';                             // (Làmb 2.0's debug: the quick-strike key pivots here)
      this.clinchCombat(dt, breaks, 0, big);
    } else if (this.phase === 'fight' && this.frappe) {
      if (this.lesson) this.lessonSetup();
      if (this.drill) this.drillSetup();
      if ((this.phase as DuelPhase) === 'clinch') return this.frame(dt);              // the step was set up in the empoignade
      this.fightFrappe(dt, taps, breaks, quick, big);
    } else if (this.phase === 'fight') {
      if (this.timeLeft !== Infinity) this.timeLeft -= dt;
      const m = this.input.move();
      me.guard = this.guardHeld && me.busy <= 0 && me.open <= 0 && me.dodge <= 0;
      // movement relative to the camera: joystick right is screen right
      if (me.busy <= 0) {
        const sp = me.guard ? 1.4 : 2.6;
        me.pos.addScaledVector(this.camRight, m.x * sp * dt).addScaledVector(this.camFwd, m.y * sp * dt);
      }
      if (me.dodge > 0) {
        const away = me.pos.clone().sub(ai.pos).setY(0).normalize();
        me.pos.addScaledVector(away, 4.2 * Math.min(dt, me.dodge)); me.dodge = Math.max(0, me.dodge - dt);
      }
      const d = ai.pos.distanceTo(me.pos);
      if (step === 'move' && d < 2.1) this.nextStep();

      // the opponent's grab in its response window
      if (ai.windup > 0) {
        if (me.guard) this.responded('guard');
        else {
          ai.windup = Math.max(0, ai.windup - dt);
          if (ai.windup <= 0) {
            if (step === 'guard') { ai.open = R.openingSeconds; this.msg('Trop tard : garde-toi dès qu’il attaque', 1.4); }
            else if (d <= R.grabRange + 0.3) this.startClinch(ai, 'Il t’a saisi ! Empoignade');
            else { ai.open = R.openingSeconds; this.msg('Il a raté ! Ouverture !', 1.1); }
          }
        }
      }
      if (this.phase === 'fight' && breaks > 0) this.dodge();
      if (this.phase === 'fight' && taps > 0) this.playerGrab();

      // opponent decisions
      this.aiThink -= dt;
      if (this.phase === 'fight' && this.aiThink <= 0 && this.canAct(ai)) {
        const [a, b] = this.style.think; this.aiThink = a + this.rand() * (b - a);
        const f = this.factor;
        if (step) {
          ai.guard = false;
          if ((step === 'guard' || step === 'break') && d < R.grabRange && ai.stamina >= R.stamina.grabCost) this.aiGrab();
        } else {
          ai.guard = d < 2.4 && this.rand() < Math.min(0.9, this.style.guardChance * f);
          const exploit = me.open > 0 ? this.style.counterChance + 0.2 : 0;
          if (d < R.grabRange && ai.stamina >= R.stamina.grabCost + 6 && this.rand() < Math.min(0.95, this.style.grabChance * f + exploit)) { ai.guard = false; this.aiGrab(); }
        }
      }
      if (this.phase === 'fight' && ai.busy <= 0 && ai.windup <= 0) {
        const hold = step === 'move' || (step === 'grab' && d < 1.3);
        const want = hold ? 0 : d > 1.25 ? 1 : d < 0.9 ? -0.6 : 0;
        const dir = me.pos.clone().sub(ai.pos).setY(0).normalize();
        ai.pos.addScaledVector(dir, want * (ai.guard ? 0.6 : 1) * this.style.speed * (step ? 1 : Math.min(1.2, this.factor)) * dt);
      }
      for (const f of [me, ai]) {
        f.stamina = Math.min(f.max, f.stamina + (f.guard ? R.stamina.regenGuard : f.regen) * dt);
        if (f.busy <= 0 && f.windup <= 0) f.clip = f.guard ? 'Stance' : f === me && Math.hypot(m.x, m.y) > 0.1 ? 'Walk' : f.open > 0 ? 'Idle' : 'Stance';
      }
      if (me.open > 0 && this.msgHold <= 0) this.msg('Tu es exposé !');
      else if (ai.open > 0 && this.msgHold <= 0) this.msg('Ouverture !');
      else if (this.msgHold <= 0) this.msg('');
      if (this.phase === 'fight' && this.timeLeft <= 0) this.timeUp();
    } else if (this.phase === 'clinch' && this.frappe) {
      if (this.lesson) this.lessonSetup();
      if (this.drill) this.drillSetup();
      if ((this.phase as DuelPhase) === 'fight') return this.frame(dt);              // the step was set up standing
      this.clinchFrappe(dt, taps, breaks, quick, big, guardPress);
    } else if (this.phase === 'clinch') {
      if (this.timeLeft !== Infinity) this.timeLeft -= dt;
      // empoignade: tap Saisir to push; the opponent pushes back according to its style, level and endurance
      me.effort += taps;
      const power = step === 'clinch' ? 0.9 : step === 'break' ? 2.6 : this.style.clinchPower * this.factor;
      ai.effort += dt * (1.6 + ai.stamina / 60) * power;
      me.stamina = Math.max(0, me.stamina - dt * R.stamina.clinchDrain); ai.stamina = Math.max(0, ai.stamina - dt * R.stamina.clinchDrain);
      me.clip = ai.clip = 'Grab';
      const c = this.clinchState()!;
      const windowWas = breakWindowOpen(tPrev);
      if (breaks > 0) {
        // dégagement: only while losing, timed on the green window, costs endurance
        if (!c.losing) this.msg('Tu mènes : pas besoin de dégager', 0.8);
        else if (me.stamina < R.stamina.breakCost) this.msg('Plus assez d’endurance pour dégager', 0.9);
        else if (windowWas) { me.stamina -= R.stamina.breakCost; me.score.breaks++; this.separate(ai, 0.5); this.msg('Dégagé !', 1.1); if (step === 'break') this.nextStep(); return this.frame(dt); }
        else { me.stamina = Math.max(0, me.stamina - R.stamina.breakMissCost); ai.effort += 1; this.msg('Trop tôt ou trop tard !', 0.8); }
      }
      // the opponent may break away from an empoignade it is losing (once per window)
      const win = Math.floor((this.phaseT - R.breakFirst) / R.breakCycle);
      if (!step && !c.losing && windowWas && win !== this.aiBreakTried && ai.stamina >= R.stamina.breakCost) {
        this.aiBreakTried = win;
        if (this.rand() < this.style.breakChance * this.factor) { ai.stamina -= R.stamina.breakCost; ai.score.breaks++; this.separate(me, 0.4); this.msg('Il se dégage !', 1.1); return this.frame(dt); }
      }
      if (this.msgHold <= 0) this.msg(c.losing ? 'Empoignade : il te pousse !' : 'Empoignade : pousse !');
      if (this.phaseT > R.clinchSeconds) this.resolveClinch(c.mine >= c.theirs);
    } else if (this.phase === 'fall' && this.fallFx) {
      const fx = this.fallFx, t = this.phaseT;
      if (t > 0.9 && !fx.cheered) {                                            // the stands explode once he is down
        fx.cheered = true; crowdCheer(3.2, 0.3);
        for (const h of this.crowd) h.hold = 'Celebrate';
      }
      if (t > 1.3 && this.outcome === 'projection') fx.winner.clip = 'Celebrate';
      // the new bout: « le dos au sol » is drawn as such — Fall_Back ends sitting on the sand; once there, he goes flat on his back
      if (this.combat && this.outcome === 'projection' && this.fallKind === 'dos' && t > 1.25 && !combatClips()) fx.loser.clip = 'Lie';   // (the Meshy clips lie him down themselves)
      if (this.frappe) this.armMoment();
      const name = this.style.name;
      // the new bout: the referee calls the fall by the rule (the back, or the four supports)
      const call = this.combat && this.fallKind ? (this.fallKind === 'appuis' ? 'Chute : les quatre appuis !' : 'Chute : le dos au sol !') : null;
      this.msg(t < 1.1 ? (this.outcome === 'projection' ? (call ?? (this.winner === 'player' ? 'Projection ! Il est au sol' : 'Tu es au sol…')) : 'Temps !')
        : this.winner === 'player' ? 'L’arbitre lève ton bras : victoire !' : `L’arbitre lève le bras de ${name}`);
      if (call && t < 1.1) this.refereeSaid = call;
      if (t > 3.4) { if (this.frappe) this.onMoment?.('result', this.winner); this.showRecap(); }
    } else if (this.phase === 'fall') {
      if (this.frappe) this.armMoment();
      if (this.outcome === 'projection') this.msg(this.winner === 'player' ? 'Il est à terre !' : 'Tu es à terre…');
      else this.msg(this.outcome === 'decision' ? `Temps ! Décision : ${this.winner === 'player' ? 'pour toi' : 'pour ' + this.style.name}` : 'Temps ! Égalité');
      if (this.phaseT > 2.4) { if (this.frappe) this.onMoment?.('result', this.winner); this.showRecap(); }
    } else if (this.phase === 'result') {
      if (this.phaseT > 10) this.done = true;
    }
    // the fall's first moment plays slowly (sans frappe too, in the player's own bout: « Le choc »)
    return this.frame(!this.spectate && this.phase === 'fall' && (this.fallFx || this.feelFall) && this.outcome === 'projection' && this.phaseT < FX.fall.slowFor ? dt * FX.fall.slow : dt);
  }

  // ---------------------------------------------------------------- the new bout (src/lamb/combat.ts, docs/wrestling/COMBAT.md)
  /** Saisir pressed: in the empoignade it throws (or counters his throw); standing it starts a reach, by tap or hold. */
  private grabPress() {
    if (this.paused || this.done) return;
    if (this.phase === 'result') { this.finish(); return; }
    if (this.phase === 'clinch') { this.throwPresses++; return; }
    this.grabHeld = true; this.grabHeldT = LambDuel.now(); this.grabFired = false;
  }
  private grabRelease() {
    if (!this.grabHeld) return;
    this.grabHeld = false;
    if (!this.grabFired && this.phase === 'fight') this.reachTap++;
  }
  /** Frappe (avec frappe): a tap is the quick strike, held past COMBAT_HOLD.strike it arms the big one. */
  private quickPress() { if (this.paused || this.phase !== 'fight') return; this.quickHeld = true; this.quickHeldT = LambDuel.now(); this.quickFired = false; }
  private quickRelease() {
    if (!this.quickHeld) return;
    this.quickHeld = false;
    if (!this.quickFired && this.phase === 'fight') this.quickPresses++;
  }
  /** The new bout's keys (desktop): the same meanings as the buttons. True: handled. */
  private combatKey(e: KeyboardEvent, down: boolean): boolean {
    const c = e.code;
    if (c === 'KeyE' || c === 'Space' || c === 'Enter') {
      if (e.target instanceof HTMLButtonElement && this.ui.contains(e.target)) return true;
      if (c === 'Space') e.preventDefault();
      if (e.repeat) return true;
      if (down) this.grabPress(); else this.grabRelease();
      return true;
    }
    if (c === 'KeyK' || c === 'KeyV') {
      if (down && !e.repeat && !this.paused) { if (this.phase === 'clinch') this.throwPresses++; else if (this.frappe) this.bigPresses++; }
      return true;
    }
    if (this.frappe && (c === 'KeyJ' || c === 'KeyC')) { if (!e.repeat) { if (down) this.quickPress(); else this.quickRelease(); } return true; }
    if (c === 'KeyG' || c === 'ShiftLeft' || c === 'ShiftRight' || c === 'KeyF') {
      if (down && !e.repeat && !this.paused && this.phase === 'clinch') { this.deeperPresses++; return true; }
      if (down && !e.repeat && !this.paused) this.guardTapped = true;
      this.guardHeld = down; this.ui.querySelector('[data-k=guard]')?.classList.toggle('on', down);
      return true;
    }
    if (c === 'KeyX') { if (down && !e.repeat && !this.paused) this.breakPresses++; return true; }
    if (c === 'KeyP') { if (down && this.cl && !this.paused) this.skipLessonStep(); return true; }
    return false;
  }

  /** The direction from `f` to `o` on the ground (unit), and `f`'s own left. */
  private frameOf(f: Fighter, o: Fighter) {
    let x = o.pos.x - f.pos.x, z = o.pos.z - f.pos.z; const l = Math.hypot(x, z) || 1; x /= l; z /= l;
    return { fx: x, fz: z, lx: z, lz: -x };
  }
  /** A world direction (x, z) in `f`'s own frame. */
  private own(f: Fighter, o: Fighter, x: number, z: number): Vec { const a = this.frameOf(f, o); return { f: x * a.fx + z * a.fz, s: x * a.lx + z * a.lz }; }
  /** The player's stick in his own frame: the joystick seen from the camera, turned to the pair (or a check's stick). */
  private playerStick(): Vec {
    if (this.stickOver && this.t <= this.stickUntil) return this.stickOver;
    const m = this.input.move();
    const x = this.camRight.x * m.x + this.camFwd.x * m.y, z = this.camRight.z * m.x + this.camFwd.z * m.y;
    const v = this.own(this.me, this.ai, x, z), l = Math.hypot(v.f, v.s);
    return l > 1 ? { f: v.f / l, s: v.s / l } : v;
  }
  /** What the player does this step: his stick and the presses since the last one. */
  private playerIntent(breaks: number, quick: number, big: number): Intent {
    const it = idleIntent();
    it.stick = this.playerStick();
    if (this.reachHold > 0) it.reach = 'hold'; else if (this.reachTap > 0) it.reach = 'tap';
    this.reachHold = 0; this.reachTap = 0;
    it.guard = this.guardHeld;
    if (breaks > 0) { if (this.phase === 'clinch') it.brk = true; else it.back = true; }
    if (this.deeperPresses > 0) it.deeper = true;
    if (this.throwPresses > 0) { if (this.attempt && this.attempt.by === this.ai) it.counter = true; else it.throw = true; }
    this.deeperPresses = 0; this.throwPresses = 0;
    if (big > 0) it.strike = 'big'; else if (quick > 0) it.strike = 'quick';
    return it;
  }
  /** How far `f` stands from the circle's edge behind him (along the pair's line). */
  private edgeBehind(f: Fighter, o: Fighter): number {
    const a = this.frameOf(f, o), px = f.pos.x - this.o.x, pz = f.pos.z - this.o.z;
    // distance along -forward from f to the circle of radius ring
    const b = -(px * -a.fx + pz * -a.fz), c = px * px + pz * pz - this.ring * this.ring;
    return -b + Math.sqrt(Math.max(0, b * b - c));
  }
  /** What the opponent's AI sees now (itself, and the player as his body and the screen show him). */
  private aiView(urge: number): AiView {
    const me = this.ai, him = this.me, at = this.attempt;
    const best = this.phase === 'clinch' ? bestThrow(me, him) : null;
    return {
      phase: this.phase === 'clinch' ? 'clinch' : 'fight', frappe: this.frappe, dist: me.pos.distanceTo(him.pos),
      edgeMe: this.edgeBehind(me, him), edgeHim: this.edgeBehind(him, me),
      me: { stamina: me.stamina, max: me.max, balance: me.balance, dir: me.dir, hold: me.hold, free: free(me) && me.busy <= 0 && !me.reach && me.deeper <= 0 && me.open <= 0, moving: !!me.move, throwing: !!at && at.by === me, open: me.open, stagger: me.stagger },
      him: {
        stamina: him.stamina, max: him.max, balance: him.balance, dir: him.dir, weight: him.weight, hold: him.hold, guard: him.guard, guardFor: him.guardFor, open: him.open, stagger: him.stagger,
        move: him.move ? { kind: him.move.kind, t: him.move.t } : null, reach: him.reach ? { kind: him.reach.kind, t: him.reach.t } : null,
        throwing: at && at.by === him && at.id ? { id: at.id, t: at.t } : null, strike: him.strike && !him.strike.landed ? { kind: him.strike.kind, t: him.strike.t } : null,
      },
      grip: -this.grip, best: best ? { id: best.id, score: throwScore(best.id, me, him, { moving: !!him.move }) } : null,
      urge, idle: me.idle,
    };
  }
  /** The opponent's intent this step: its AI (none while a check holds it, in a drill, or in the lesson: the partner is scripted). */
  private aiIntent(dt: number, urge: number): Intent {
    if (this.held || this.drill || this.cl || !this.brain) { this.brain?.rest(); return idleIntent(); }
    const it = this.brain.step(dt, this.aiView(urge), this.rand);
    if (this.brain.lastRead) { this.msg('Il a compris ton jeu !', 1.2); this.brain.lastRead = null; }
    return it;
  }

  /** A fighter starts a reach for a hold (Saisir): a tap for the nape — or his leg, if he leans in —, a hold for the belt. */
  private startReach(f: Fighter, o: Fighter, how: 'tap' | 'hold') {
    if (f.reach || !free(f) || f.busy > 0 || f.open > 0 || f.dodge > 0) return;
    const kind = reachFor(how, o), cost = kind === 'ceinture' ? 22 : kind === 'jambe' ? 20 : 16;
    if (f.stamina < cost) { if (f === this.me) this.msg('Plus d’endurance', 0.8); return; }
    f.stamina -= cost; f.guard = false; f.idle = 0;
    f.reach = { kind, t: 0, dur: GRIPS[kind].reach * (f === this.ai ? (this.ai.slow ?? 1) : 1) };
    f.clip = 'Grab';
    if (f === this.me) {
      this.brain?.saw('reach', kind);
      this.msg(kind === 'jambe' ? 'Tu plonges sur sa jambe !' : kind === 'ceinture' ? 'Tu plonges à la ceinture…' : 'Tu cherches sa nuque', 0.5);
    } else this.msg(kind === 'jambe' ? 'Il plonge sur ta jambe ! Recule !' : kind === 'ceinture' ? 'Il plonge à ta ceinture ! Recule !' : 'Il cherche ta nuque : garde ou recule', Math.max(0.5, f.reach.dur));
  }
  /** A reach under way: the reacher closes in; at its end it takes the hold, or misses (he stepped back, out of reach), or is parried. */
  private reachStep(f: Fighter, o: Fighter, dt: number) {
    const r = f.reach!; r.t += dt;
    const d = f.pos.distanceTo(o.pos), def = GRIPS[r.kind];
    if (d > 0.9 && f.stagger <= 0) { const dir = o.pos.clone().sub(f.pos).setY(0).normalize(); f.pos.addScaledVector(dir, Math.min(d - 0.9, (r.kind === 'nuque' ? 1.2 : 2.4) * dt)); }
    if (r.t < r.dur) return;
    f.reach = null; f.busy = 0.25;
    const deep = r.kind !== 'nuque';
    const miss = (why: string) => {
      f.open = Math.max(f.open, deep ? COMBAT.deepMissOpen : COMBAT.missOpen);
      if (deep) { const b0 = f.balance; shove(f, { f: 1, s: 0 }, COMBAT.deepMissBalance / k(f.attrs.equilibre)); void b0; }
      this.msg(f === this.me ? why : why === 'Paré !' ? 'Paré ! Il est ouvert' : 'Il a raté : il est ouvert !', 1);
    };
    if (o.dodge > 0 || d > def.range + 0.1) { if (o.dodge > 0) o.score.guards++; miss(o.dodge > 0 ? 'Il a reculé : tu es ouvert' : 'Trop loin : tu es ouvert'); return; }
    f.score.grabs++;
    if (r.kind === 'nuque' && o.guard && o.guardFor < COMBAT.parryFresh && o.open <= 0 && o.stagger <= 0) {
      o.score.guards++;
      if (this.combat && !this.cl && !this.drill) {
        // the new bout: his guard meets the hands — hand in hand, arm against arm, nobody ahead (the empoignade starts even)
        this.startCombatClinch(f, 'bras', 'guard');
        f.hold = { kind: 'bras', str: 45 }; o.hold = { kind: 'bras', str: 45 };
        this.grip = gripAdvantage(this.me.hold, this.ai.hold);
        this.banner('MAINS LIÉES', 'combo'); this.msg('');
        return;
      }
      miss('Paré !'); return;
    }
    const entry: Entry = o.stagger > 0 ? 'stagger' : o.open > 0 ? 'open' : o.guard ? 'guard' : r.dur > 0.45 ? 'late' : 'neutral';
    this.startCombatClinch(f, r.kind, entry);
  }
  /** The empoignade starts with the hold reached (its strength by how it was entered) and the other's reflex hold. */
  private startCombatClinch(by: Fighter, kind: GripKind, entry: Entry) {
    const me = this.me, ai = this.ai, other = by === me ? ai : me;
    this.startClinch(by, 'Empoignade !', entry);
    const h = entryHolds(kind, ENTRY_BONUS[entry]);
    by.hold = h.att; other.hold = h.def;
    for (const f of [me, ai]) { f.reach = null; f.deeper = 0; f.sec = ''; f.secT = 0; f.guardFor = 0; }
    if (kind === 'jambe') shove(other, { f: -1, s: 0 }, COMBAT.legShove);
    this.grip = gripAdvantage(me.hold, ai.hold);
    this.pairVel.set(0, 0, 0); this.pairSpin = 0;
    this.msg(by === me ? `Tu le tiens : ${GRIPS[kind].label} !` : `Il te tient : ${GRIPS[kind].label}`, 0.9);
    if (this.cl) this.combatLessonHear({ k: 'clinch', by: by === me ? 'player' : 'opponent' });
  }

  /** A burst of sand at a wrestler's feet (`force` 0…1). */
  private dustAt(f: Fighter, force: number) { if (this.dust) { const p = this.placeOf(f, V_DUST); this.dust.burst(p.x, this.o.y, p.z, force); } }
  /** A fighting-game banner over the bout (« BËRE ! », « COMBO ! », « TERRE ! »), restarted each time. */
  private banner(text: string, kind: 'start' | 'combo' | 'special' | 'end') {
    this.bannerSaid = text;
    if (this.headless || this.spectate) return;
    const el = this.ui.querySelector<HTMLElement>('[data-k=banner]'); if (!el) return;
    el.textContent = text; el.className = `duel-banner ${kind}`; void el.offsetWidth; el.classList.add('go');
  }

  /** A strike (avec frappe) in the new bout: the AI answers it by what it sees, not by the old reaction draw. */
  private combatStrike(f: Fighter, kind: StrikeKind) {
    if (f.open > 0 || !free(f) || f.busy > 0 || f.reach) return;
    const wasGuard = f.guard; f.guard = false;
    if (!startStrike(f, kind)) { f.guard = wasGuard; if (f === this.me && f.stamina < STRIKES[kind].cost) this.msg('Plus d’endurance', 0.8); return; }
    f.idle = 0;
    if (f === this.me && this.drill) this.drillHear({ k: 'swing', kind });
  }
  /** Moves the fighter standing: the player by the joystick (camera's axes), the AI by its stick (its own frame). */
  private stepFeet(f: Fighter, o: Fighter, it: Intent, dt: number) {
    if (f.busy > 0 || f.stagger > 0 || f.reach) { f.weight = { f: 0, s: 0 }; return; }
    const slow = f.guard ? STAND.guardSpeed : f.strike ? 0.4 : 1;
    const a = this.frameOf(f, o);
    const sp = f === this.me ? 2.6 * slow : this.style.speed * Math.min(1.2, 0.8 + 0.1 * this.level) * slow;
    const tx = (a.fx * it.stick.f + a.lx * it.stick.s) * sp, tz = (a.fz * it.stick.f + a.lz * it.stick.s) * sp;
    if (this.combat) {
      // the new bout: the feet speed up and slow down over a fraction of a second (no jump from still to full speed)
      let v = this.feetVel.get(f); if (!v) { v = new THREE.Vector2(); this.feetVel.set(f, v); }
      const ease = 1 - Math.exp(-dt * (Math.hypot(tx, tz) > Math.hypot(v.x, v.y) ? 9 : 12));
      v.x += (tx - v.x) * ease; v.y += (tz - v.y) * ease;
      f.pos.x += v.x * dt; f.pos.z += v.y * dt;
    } else { f.pos.x += tx * dt; f.pos.z += tz * dt; }
    f.weight = { f: it.stick.f * 0.85, s: it.stick.s * 0.4 };            // charging in commits the weight forward (his leg is there)
  }

  /**
   * The cinematic bout's entrance: the opponent's bàkk, filmed from the front with his name on screen, then the player's,
   * then the two face to face and « Bëre ! ». The sabar is the entrance's. The action button skips to the face-off.
   */
  private introCine() {
    const T = CINE_INTRO, t = this.phaseT;
    if (this.cinePress) { this.cinePress = false; if (t < T.me) this.phaseT = T.me; }
    this.me.clip = this.ai.clip = 'Prep';
    const card = this.q('ccard'), who = t < T.him ? 'ai' : t < T.me ? 'me' : null;
    card.hidden = !who;
    if (who && card.dataset.who !== who) {
      card.dataset.who = who; card.classList.remove('go'); void card.offsetWidth; card.classList.add('go');
      card.querySelector('b')!.textContent = who === 'ai' ? this.style.name : 'Toi';
      card.querySelector('small')!.textContent = who === 'ai' ? (this.identity ? this.identity.replace(new RegExp(`^${this.style.name}[,·\\s]*`), '') : `${this.style.label} · niveau ${this.level}`) : 'Ton bàkk';
      if (who === 'ai') crowdCheer(1.6, 0.15); else crowdCheer(2, 0.2);
    }
    this.drums.tempo(110);
    if (t > T.end) { this.phase = 'fight'; this.phaseT = 0; card.hidden = true; this.banner('BËRE !', 'start'); crowdCheer(2.4, 0.3); this.drums.tempo(122); }
  }
  /** The entrance's bàkk now: who dances (his clip's time), null at the face-off. */
  private bakkOf(f: Fighter): { id: import('./combatClips').ClipId; t: number } | null {
    if (!this.cineIntro || this.phase !== 'intro') return null;
    const T = CINE_INTRO, t = this.phaseT;
    if (f === this.ai && t < T.him) return { id: 'victory', t: 0.2 + t };
    if (f === this.me && t >= T.him && t < T.me) return { id: 'victory', t: 0.2 + t - T.him };
    return null;
  }
  /** The cinematic bout's entrance is played (the player's own bout, not the training's). */
  private cineIntro = false;

  /** The cinematic bout runs this bout (made at the bell: the player's own new bout, not the lesson, a drill or a test host). */
  private cineOn(): boolean {
    if (this.cine) return true;
    if (!this.combat || this.cl || this.drill || this.headless || this.phase !== 'fight') return false;
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('cine0')) return false;
    this.cine = new CineBout({ level: this.level, seed: Math.floor(this.t * 1000) + 11 });
    this.ui.classList.add('cine');
    return true;
  }

  /** One step of the cinematic bout: the feet while standing, the pair in the empoignade, the bout's state and events, the scene's places. */
  private cineStep(dt: number) {
    const c = this.cine!, me = this.me, ai = this.ai;
    if (this.timeLeft !== Infinity && !this.held && (c.phase === 'debout' || c.phase === 'empoignade')) this.timeLeft -= dt;
    const edge = (f: Fighter) => this.ring - Math.hypot(f.pos.x - this.o.x, f.pos.z - this.o.z);
    const apart = me.pos.distanceTo(ai.pos);
    // the stick on the ground (camera axes), and along / across the pair
    const ab = ai.pos.clone().sub(me.pos).setY(0); if (ab.lengthSq() < 1e-6) ab.set(1, 0, 0); ab.normalize();
    const m = this.input.move(), over = this.stickOver && this.t <= this.stickUntil ? this.stickOver : null;   // (debugStick: f towards him, s across)
    const wx = over ? ab.x * over.f - ab.z * over.s : this.camRight.x * m.x + this.camFwd.x * m.y;
    const wz = over ? ab.z * over.f + ab.x * over.s : this.camRight.z * m.x + this.camFwd.z * m.y;
    let push = 0, turn = 0;
    if (c.phase === 'debout') {
      // the player walks the pit (eased; slower just after a missed grab)
      const sp = c.whiff > 0 ? 1.1 : 2.4;
      const v = this.feetVel.get(me) ?? new THREE.Vector2(); this.feetVel.set(me, v);
      const e = 1 - Math.exp(-dt * 9); v.x += (wx * sp - v.x) * e; v.y += (wz * sp - v.y) * e;
      me.pos.x += v.x * dt; me.pos.z += v.y * dt;
      // he keeps his distance circling, stands crouched in his tell, lunges in a straight line (a side-step makes him miss)
      const to = me.pos.clone().sub(ai.pos).setY(0), d = to.length(); if (d > 1e-3) to.divideScalar(d);
      const act = c.ai.act;
      if (act === 'charge') { if (!this.lunge) this.lunge = to.clone(); ai.pos.addScaledVector(this.lunge, 3.1 * dt); }
      else if (act === 'rate' && this.lunge) { const k = Math.max(0, 1 - c.ai.t / 0.6); ai.pos.addScaledVector(this.lunge, 2.2 * k * dt); }
      else {
        this.lunge = null;
        if (act !== 'garde') {
          const err = d - c.aiWant();
          if (err > 0.25) ai.pos.addScaledVector(to, Math.min(1, err) * this.style.speed * (act === 'feinte' ? 1.8 : 0.85) * dt);
          else if (err < -0.6 && act !== 'feinte') ai.pos.addScaledVector(to, -0.5 * dt);
          ai.pos.addScaledVector(new THREE.Vector3(-to.z, 0, to.x), 0.4 * Math.sin(this.t * 0.7) * dt);
        }
      }
    } else if (c.phase === 'empoignade' || c.phase === 'projection') {
      push = Math.max(-1, Math.min(1, wx * ab.x + wz * ab.z));
      turn = Math.max(-1, Math.min(1, ab.x * wz - ab.z * wx));
      // chest to chest; the pair drifts the way the stronger drives and turns as the player turns it
      const mid = me.pos.clone().add(ai.pos).multiplyScalar(0.5);
      if (c.phase === 'empoignade') { mid.addScaledVector(ab, c.drift * dt); ab.applyAxisAngle(UP, c.spin * dt); }
      me.pos.copy(mid).addScaledVector(ab, -0.38).setY(0.1); ai.pos.copy(mid).addScaledVector(ab, 0.38).setY(0.1);
    }
    // a slow motion at the impact of a throw
    let k = 1;
    const sc = c.scene;
    if (c.phase === 'scene' && sc && sc.kind === 'throw' && sc.t > sc.impact - 0.45 && sc.t < sc.impact + 0.3) k = 0.4;
    const press = this.cinePress, pick = this.cinePick; this.cinePress = false; this.cinePick = null;
    if (press && c.phase === 'replay') c.skipReplay();
    // the sabar quickens in the empoignade and a move, and settles standing
    if (this.mode !== 'entrainement') this.drums.tempo(c.phase === 'empoignade' || c.phase === 'projection' || c.phase === 'scene' ? 126 : 122);
    const ev = c.step(dt * k, { press, hold: this.cineHold, push, turn, pick }, apart, { player: edge(me), opponent: edge(ai) });
    if (ev.banner) this.banner(ev.banner, ev.banner.startsWith('DEHORS') || ev.banner === 'TERRE !' ? 'end' : 'combo');
    if (ev.say) this.said = ev.say;
    if (ev.shake) { this.shakeAmp = 0.12 * ev.shake; this.shakeT = 0; }
    if (ev.cheer) crowdCheer(2.4 * ev.cheer, 0.3);
    if (ev.tell) this.cineTellAt = this.t;
    if (ev.fall) { const l = ev.fall === 'player' ? me : ai; this.dustAt(l, 1); this.feel('fall', ev.fall !== 'player', ev.fall === 'player'); }
    if (ev.out) { for (const v of this.feetVel.values()) v.set(0, 0); this.lunge = null; me.pos.set(this.o.x + 1.6, 0.1, this.o.z); ai.pos.set(this.o.x - 1.6, 0.1, this.o.z); }
    // the HUD's bars: breath and balance
    me.stamina = (me.max * c.stamina.player) / 100; ai.stamina = (ai.max * c.stamina.opponent) / 100;
    me.balance = 100 - 55 * Math.min(1.6, Math.hypot(c.lean.player.f, c.lean.player.s)); ai.balance = 100 - 55 * Math.min(1.6, Math.hypot(c.lean.opponent.f, c.lean.opponent.s));
    // a new scene: the receiver set at its distance in front of the attacker, facing him
    if (c.scene && c.scene !== this.cineScene) {
      this.cineScene = c.scene;
      const a = c.scene.by === 'player' ? me : ai, b = a === me ? ai : me, T = c.scene.tech ? TECHS[c.scene.tech] : null;
      const dir = b.pos.clone().sub(a.pos).setY(0).normalize();
      if (Number.isFinite(dir.x)) b.pos.copy(a.pos).addScaledVector(dir, T ? T.gap : 0.7).setY(0.1);
    }
    this.ui.classList.toggle('letterbox', c.phase === 'scene' || c.phase === 'replay');
    this.ui.classList.toggle('replay', c.phase === 'replay');
    document.body.classList.toggle('cine-cut', c.phase === 'scene' || c.phase === 'replay');
    if (c.phase === 'fin' && c.winner) {
      this.ui.classList.remove('letterbox', 'replay'); document.body.classList.remove('cine-cut');
      const side: Side = c.winner === 'player' ? 'player' : 'opponent';
      if (c.sorties.player >= 3 || c.sorties.opponent >= 3) this.end('decision', side);
      else { this.fallKind = 'dos'; this.throwName = c.scene?.tech ? TECHS[c.scene.tech].label.toLowerCase() : null; this.end('projection', side); }
      return;
    }
    if (this.timeLeft <= 0 && (c.phase === 'debout' || c.phase === 'empoignade')) {
      const w = c.decision(); this.end(w ? 'decision' : 'egalite', w ? (w === 'player' ? 'player' : 'opponent') : null);
    }
  }

  /** The clip a body plays in the cinematic bout now (null: the standing bout's own posing), and his trunk's lean on top. */
  private cineForce(f: Fighter): { id: import('./combatClips').ClipId; t: number } | null {
    const bakk = this.bakkOf(f); if (bakk) return bakk;
    const c = this.cine; if (!c) return null;
    const who: Who = f === this.me ? 'player' : 'opponent', sc = c.scene;
    if (sc && (c.phase === 'scene' || c.phase === 'replay' || c.phase === 'fin' || this.phase === 'fall' || this.phase === 'result')) {
      const attacker = sc.by === who, t = Math.min(sc.t, sc.dur);
      if (this.phase === 'fall' || this.phase === 'result') {
        // the bout is over: the man thrown stays down, the winner lets it out
        return attacker ? { id: 'victory', t: (this.phaseT % 4.5) + 0.2 } : { id: sc.b, t: 99 };
      }
      if (sc.kind === 'resist') return attacker ? { id: sc.a, t: Math.min(t, 0.9) } : { id: 'resist_sprawl', t: 0.4 + t };
      return { id: attacker ? sc.a : sc.b, t };
    }
    if (c.phase === 'debout') {
      // his lunge drives in; after a miss he stumbles
      if (who === 'opponent' && c.ai.act === 'charge') return { id: 'push_drive', t: 0.3 + c.ai.t };
      if (who === 'opponent' && c.ai.act === 'rate') return { id: 'stagger', t: 0.2 + c.ai.t };
      return null;
    }
    if (c.phase === 'projection' && c.tech) {
      // the move loads as the gauge rises: both halves of it on one clock, held before the throw
      const T = TECHS[c.tech], t = 0.32 * T.impact * Math.min(1, c.needle);
      return { id: who === 'player' ? T.a : T.b, t };
    }
    if (c.phase === 'empoignade') {
      const P = c.aiPlan;
      if (P.act === 'attaque' && P.tech) {
        // his tell: he starts his move (its first beats), you are taken into it
        const T = TECHS[P.tech], t = 0.28 * T.impact * Math.min(1, P.t / P.dur);
        return { id: who === 'opponent' ? T.a : T.b, t };
      }
      // the hand fight, out of step between the two; the one driving pushes
      if (c.drive[who] > 0.3) return { id: 'push_drive', t: 0.35 + ((this.t * 0.9) % 2) };
      return { id: 'grip_fight', t: ((this.t + (who === 'opponent' ? 1.4 : 0)) % 3.6) + 0.2 };
    }
    return null;
  }
  /**
   * Where the hands go on top of the clip, the two men's together: in the empoignade the one with the upper hand at the
   * belt (ngemb) and the other over his nape, an even fight hand at the nape and hand on the arm, both; a move's attacker
   * keeps his hold until it goes, the man taken hangs on to him at the start; let go as he flies.
   */
  private cineGrip(f: Fighter): { kind: GripKind; w: number } | null {
    const c = this.cine; if (!c || this.phase === 'fall' || this.phase === 'result') return null;
    const who: Who = f === this.me ? 'player' : 'opponent', other: Who = who === 'player' ? 'opponent' : 'player';
    const TECH_GRIP: Record<TechId, GripKind> = { souleve: 'ceinture', hanche: 'bras', croc: 'ceinture', pousse: 'nuque' };
    if (c.phase === 'empoignade' || c.phase === 'projection') {
      if (c.phase === 'projection' && c.tech) return who === 'player' ? { kind: TECH_GRIP[c.tech], w: 0.9 } : { kind: 'nuque', w: 0.75 };
      const P = c.aiPlan;
      if (P.act === 'attaque' && P.tech) return who === 'opponent' ? { kind: TECH_GRIP[P.tech], w: 0.9 } : { kind: 'nuque', w: 0.75 };
      const lead = c.grip > 0.3 ? 'player' : c.grip < -0.3 ? 'opponent' : null;
      return { kind: lead === who ? 'ceinture' : lead === other ? 'nuque' : 'bras', w: 0.85 };
    }
    const sc = c.scene;
    if (sc && (c.phase === 'scene' || c.phase === 'replay')) {
      const t = sc.t, attacker = sc.by === who, T = sc.tech ? TECHS[sc.tech] : null;
      if (sc.kind === 'resist') return attacker ? { kind: sc.tech ? TECH_GRIP[sc.tech] : 'ceinture', w: 0.8 * (1 - smooth01((t - 1.1) / 0.5)) } : { kind: 'nuque', w: 0.6 * (1 - smooth01((t - 0.9) / 0.5)) };
      if (!T) return null;
      // the attacker lets go just before the impact, the man thrown a little earlier (his arms go out as he flies)
      return attacker ? { kind: TECH_GRIP[T.id], w: 0.8 * (1 - smooth01((t - (T.impact - 0.55)) / 0.35)) } : { kind: 'nuque', w: 0.55 * (1 - smooth01((t - (T.impact - 0.95)) / 0.3)) };
    }
    return null;
  }
  /** The trunk's lean drawn on top of the clip in the empoignade (rad: forward into the other, sideways). */
  private cineTilt(f: Fighter): { f: number; s: number } | null {
    const c = this.cine; if (!c || (c.phase !== 'empoignade' && c.phase !== 'projection')) return null;
    const l = c.lean[f === this.me ? 'player' : 'opponent'];
    return { f: Math.max(-0.45, Math.min(0.5, 0.42 * l.f)), s: Math.max(-0.35, Math.min(0.35, 0.4 * l.s)) };
  }

  /** The new bout: each wrestler's footwork speed (eased, m/s on the ground). */
  private feetVel = new Map<Fighter, THREE.Vector2>();
  /**
   * The cinematic bout (src/lamb/cinematic.ts), the player's own new bout outside the lesson and the drills (`?cine0`: the
   * free bout instead): its state, the press and the move picked this step, the scene the bodies were last placed for.
   */
  private cine: CineBout | null = null;
  private cinePress = false; private cineHold = false; private cinePick: TechId | null = null; private cineScene: object | null = null;
  /** His lunge's line (fixed as it starts), the last tell (s, for the shot's punch). */
  private lunge: THREE.Vector3 | null = null; private cineTellAt = -9;
  /** How hard the last fall was thrown (0 a push down … 1 lifted and slammed): its thrower's hold, legs and the other's balance. */
  private fallForce = 0.5;
  private fightCombat(dt: number, breaks: number, quick: number, big: number) {
    const me = this.me, ai = this.ai;
    if (this.timeLeft !== Infinity && !this.held) this.timeLeft -= dt;
    if (!this.held) this.standT += dt;
    if (this.drill) this.drillStep(dt);
    const urge = this.cl || this.drill ? 0 : urgeOf(this.standT);
    if (urge > 0 && !this.urged) { this.urged = true; this.msg('L’arbitre presse les lutteurs : saisissez-vous !', 1.2); }
    const mi = this.playerIntent(breaks, quick, big), ai_ = this.aiIntent(dt, urge);
    if (this.cl) this.combatLessonStanding(dt);
    // feet and weight
    this.stepFeet(me, ai, mi, dt); this.stepFeet(ai, me, ai_, dt);
    for (const [f, o, it] of [[me, ai, mi], [ai, me, ai_]] as const) {
      if (it.back) this.dodgeOf(f, o);
      if (f.dodge > 0) { const away = f.pos.clone().sub(o.pos).setY(0).normalize(); f.pos.addScaledVector(away, 4.2 * Math.min(dt, f.dodge)); }
      f.guard = it.guard && !f.strike && f.stagger <= 0 && f.open <= 0 && f.dodge <= 0 && f.busy <= 0 && !f.reach;
      f.guardFor = f.guard ? f.guardFor + dt : 0;
      if (it.strike && this.frappe) this.combatStrike(f, it.strike);
      if (it.reach && this.phase === 'fight') this.startReach(f, o, it.reach);
    }
    if (this.checkSortie()) return;
    let d = ai.pos.distanceTo(me.pos);
    if (this.cl) this.combatLessonHear({ k: 'tick', dist: d });
    // reaches resolve (the one that started first lands first)
    for (const [f, o] of [[me, ai], [ai, me]] as const) if (this.phase === 'fight' && f.reach) this.reachStep(f, o, dt);
    if (this.phase !== 'fight') return;
    // states over time; strikes land at the end of their windup (avec frappe)
    d = ai.pos.distanceTo(me.pos);
    for (const [f, o] of [[me, ai], [ai, me]] as const) {
      const bo = o.balance, bf = f.balance;
      if (tick(f, dt, f.regen)) { this.strikeLands(f, o, d); aimLoss(o, bo, { f: -1, s: 0.25 }); aimLoss(f, bf, { f: 1, s: 0 }); }
      commitTick(f, dt);
      if (f.balance < 99.5 && Math.hypot(f.dir.f, f.dir.s) < 0.5) f.dir = { f: -1, s: 0 };
    }
    if (this.phase !== 'fight') return;
    // the referee: a wrestler who does not attack while the other does is warned (each warning a point for the other)
    if (!this.cl && !this.drill && !this.held && this.mode !== 'entrainement') for (const [f, o] of [[me, ai], [ai, me]] as const) {
      f.idle += dt;
      if (f.idle > PASSIVE.after && o.idle < f.idle - 2) {
        f.tally.warnings++; f.idle = 0;
        this.refereeSaid = f === me ? 'Avertissement : tu ne luttes pas !' : `Avertissement à ${this.style.name} : il ne lutte pas`;
        this.msg(this.refereeSaid, 1.6);
      }
    }
    for (const f of [me, ai]) if (f.busy <= 0 && !f.reach) f.clip = f.stagger > 0 ? 'Idle' : 'Stance';
    if (this.msgHold <= 0) {
      this.msg(me.stagger > 0 ? 'Tu vacilles… recule ou garde-toi' : ai.stagger > 0 ? `${this.style.name} vacille : saisis-le !`
        : me.open > 0 ? 'Tu es ouvert !' : ai.open > 0 ? 'Ouverture : saisis-le !' : ai.strike?.kind === 'big' && !ai.strike.landed ? 'Grosse frappe ! Garde, recule ou frappe vite'
        : legOpen(ai) && d < 2 ? 'Il se penche : sa jambe !' : '');
    }
    if (this.timeLeft <= 0) this.timeUp();
  }
  /** A step back (Reculer), for either side. */
  private dodgeOf(f: Fighter, o: Fighter) {
    if (f.busy > 0 || f.dodge > 0 || !free(f) || f.reach) return;
    if (f.stamina < R.stamina.dodgeCost) { if (f === this.me) this.msg('Plus d’endurance', 0.8); return; }
    f.stamina -= R.stamina.dodgeCost; f.dodge = 0.28; f.busy = 0.35; f.guard = false;
    void o;
  }

  /** The empoignade, played with grips, weights and throws (both disciplines). */
  private clinchCombat(dt: number, breaks: number, quick: number, big: number) {
    const me = this.me, ai = this.ai;
    if (this.timeLeft !== Infinity && !this.held) this.timeLeft -= dt;
    if (this.timeLeft <= 0 && !this.attempt) { this.timeUp(); return; }
    me.clip = ai.clip = 'Grab';
    const urge = this.cl ? 0 : clinchUrge(this.phaseT);
    const mi = this.playerIntent(breaks, quick, big), ai_ = this.aiIntent(dt, urge);
    if (big > 0 && !mi.counter) mi.throw = true;                            // (debug and K: the big-strike key is Projeter here)
    // a press kept from the pause after a move: thrown as soon as that pause is over
    if (this.throwBuffer > 0) { this.throwBuffer -= dt; if (me.recover <= 0 && !this.attempt) { mi.throw = true; this.throwBuffer = 0; } }
    me.weight = mi.stick; ai.weight = this.held ? { f: 0, s: 0 } : ai_.stick;
    if (this.cl && this.combatLessonClinch(dt)) return;
    if (this.drill) this.drillStep(dt);
    if ((this.phase as DuelPhase) !== 'clinch') return;
    // a throw under way takes the empoignade over until it lands
    if (this.attempt) { this.combatThrowStep(dt, mi.counter, ai_.counter); this.pairStep(dt); return; }
    for (const [f, o, it] of [[me, ai, mi], [ai, me, ai_]] as const) {
      if (it.brk) {
        if (tryBreak(f, f === me ? this.grip : -this.grip)) { f.score.breaks++; this.separate(o, 0.45); this.msg(f === me ? 'Dégagé !' : 'Il se dégage !', 1.0); if (this.cl) this.combatLessonHear({ k: 'break', by: f === me ? 'player' : 'opponent' }); return; }
        if (f === me) this.msg(this.grip < CLINCH.breakFloor ? 'Sa prise est trop forte pour casser' : me.move ? 'Pas au milieu d’un mouvement' : 'Plus assez d’endurance pour casser', 0.8);
      }
      if (it.deeper) this.startDeeper(f);
      if (it.throw) { if (this.startCombatThrow(f, o)) return; }
    }
    // moves: the stick entering a direction (towards him, away, to a side) starts one; held, it starts again after the pause
    const queued = this.moveQueued; this.moveQueued = null;
    for (const [f, o] of [[me, ai], [ai, me]] as const) {
      const sec = f === me && queued ? { kind: queued, side: 1 } : stickMove(f.weight);
      const key = sec ? `${sec.kind}${sec.side}` : '';
      f.secT = key && key === f.sec ? f.secT + dt : 0;
      const fresh = !!sec && (key !== f.sec || f.secT > 0.5 || (f === me && !!queued));
      f.sec = key;
      if (sec && fresh && !f.move && f.recover <= 0 && f.deeper <= 0) {
        if (startMove(f, sec.kind)) {
          f.stamina += MOVES[sec.kind].cost * (1 - COMBAT.moveCost);        // the new bout's economy: a move costs less
          f.side = sec.side || 1; f.idle = 0; f.secT = 0;
          if (f === me && this.brain) { if (o.move) this.brain.saw('answer', `${o.move.kind}>${sec.kind}`); else this.brain.saw('open', sec.kind); }
        } else if (f === me && f.stamina < MOVES[sec.kind].cost) this.msg('Plus d’endurance', 0.7);
      }
    }
    // going deeper: a moment exposed, then the deeper hold
    for (const f of [me, ai]) if (f.deeper > 0 && (f.deeper -= dt) <= 0) {
      f.deeper = 0;
      const next = f.hold.kind ? GRIPS[f.hold.kind].deeper : null;
      if (next) { f.hold = { kind: next, str: Math.max(COMBAT.deeperKeeps, f.hold.str - 10) }; this.msg(f === me ? `Tu passes : ${GRIPS[next].label} !` : `Il passe : ${GRIPS[next].label}`, 0.8); if (this.cl) this.combatLessonHear({ k: 'deeper', by: f === me ? 'player' : 'opponent', kind: next }); }
    }
    // holds over time, weights, the hold's drain and slip, moves landing: the exchange (Làmb 2.0's triangle) with a direction
    for (const f of [me, ai]) { gripTick(f.hold, f.stamina, dt); commitTick(f, dt); }
    this.grip = gripAdvantage(me.hold, ai.hold);
    for (const [f, o] of [[me, ai], [ai, me]] as const) {
      const moving = !!f.move;
      if (holdTick(f, dt, f === me ? this.grip : -this.grip) && f.move) this.combatExchange(f, o);
      f.stamina = Math.min(f.max, f.stamina + (CLINCH.drain * (1 - COMBAT.drain) + (!moving && Math.hypot(f.weight.f, f.weight.s) < 0.3 ? COMBAT.breathe : 0)) * dt);   // the hold drains less; holding still, he breathes
      if (!moving && f.stamina > CLINCH.spent && (f === me ? this.grip : -this.grip) > -25) f.balance = Math.min(100, f.balance + COMBAT.regen * k(f.attrs.equilibre) * dt);
      if (f.balance < 99.5 && Math.hypot(f.dir.f, f.dir.s) < 0.5) f.dir = { f: -1, s: 0 };
    }
    this.pairStep(dt);
    if ((this.phase as DuelPhase) !== 'clinch') return;
    // the fall: a wrestler whose balance runs out goes down — forward on his four supports, else on his back
    if (me.balance <= 0 || ai.balance <= 0) {
      const loser = ai.balance <= 0 && (me.balance > 0 || this.grip >= 0) ? ai : me;
      this.resolveCombatFall(loser === ai ? me : ai, loser, slipFall(loser), loser === ai ? 'Il glisse au sol' : 'Tu glisses au sol');
      return;
    }
    if (this.cl) { const l = lean(ai); this.combatLessonHear({ k: 'lean', who: 'opponent', depth: Math.hypot(l.f, l.s) }); }
    if (this.checkSortie()) return;
    const going = posture(me.balance) === 'chute' || posture(ai.balance) === 'chute';
    if (!this.held && !this.drill && !this.cl && this.phaseT > COMBAT.clinchMax + (going ? CLINCH.graceSeconds : 0)) {
      this.separate(null, 0); this.msg('L’arbitre sépare les lutteurs', 1.2);
      this.standT = URGE.after; this.urged = true;
      return;
    }
    const pm = posture(me.balance), po = posture(ai.balance);
    if (pm !== this.postureWas.me && pm === 'chute') strikeSound('big', 'guarded');
    if (po !== this.postureWas.ai && po === 'chute') { crowdCheer(1.2, 0.1); if (!this.cl) me.tally.advantages++; }
    if (pm !== this.postureWas.me && pm === 'chute' && !this.cl) ai.tally.advantages++;
    this.postureWas = { me: pm, ai: po };
    if (this.msgHold <= 0) {
      const b = bestThrow(me, ai);
      this.msg(pm === 'chute' ? 'Tu vas tomber : résiste, contre ou casse !' : ai.move ? `Il ${MOVES[ai.move.kind].doing}…`
        : pm === 'glisse' ? (this.grip < -25 ? 'Tu glisses : sa prise t’use, reprends-la !' : 'Tu glisses…')
        : b && throwScore(b.id, me, ai) >= COMBAT.throwAt ? `${THROWS[b.id].label} ! Il est prêt à tomber`
        : po === 'chute' ? 'Il va tomber !' : po === 'glisse' ? 'Il glisse !' : 'Empoignade');
    }
  }
  /** Going deeper (Saisir in the empoignade): the hold is weak for a moment (more exposed), then the deeper one. */
  private startDeeper(f: Fighter) {
    const next = f.hold.kind ? GRIPS[f.hold.kind].deeper : null;
    if (!next || f.deeper > 0 || f.move || f.recover > 0) { if (f === this.me && !next) this.msg(f.hold.kind ? 'Ta prise est déjà la plus profonde' : 'Pas de prise', 0.7); return; }
    if (f.stamina < COMBAT.deeperCost || f.hold.str < COMBAT.deeperNeeds) { if (f === this.me) this.msg('Ta prise est trop faible pour aller plus loin', 0.8); return; }
    f.stamina -= COMBAT.deeperCost; f.deeper = COMBAT.deeperTime * (f === this.ai ? (this.ai.slow ?? 1) : 1); f.idle = 0;
    if (f === this.me) this.msg(`Tu vas chercher : ${GRIPS[next].label}…`, 0.5);
  }
  /** A move lands: Làmb 2.0's exchange decides who wins it; the balance taken goes the move's way, through holds and braces. */
  private combatExchange(a: Fighter, b: Fighter) {
    const ba = a.balance, bb = b.balance, sideA = a.side, sideB = b.side;
    const e = exchange(a, b, a === this.me ? this.grip : -this.grip);
    a.balance = ba; b.balance = bb;
    const winner = e.winner === 'a' ? a : e.winner === 'b' ? b : null;
    if (winner) {
      const victim = winner === a ? b : a, kind = winner === a ? e.move : e.against!, side = winner === a ? sideA : sideB;
      const d = moveDir(kind, side);
      const amount = e.balance * COMBAT.exchange * control(winner.hold) * exposure(victim.hold) * (victim.deeper > 0 ? 1.3 : 1) * braceFactor(victim, d);
      shove(victim, d, amount);
      winner.hold.str = Math.min(100, winner.hold.str + COMBAT.winStr);
      winner.c1 = winner.c2; winner.t1 = winner.t2; winner.c2 = kind; winner.t2 = this.t;   // (for a combo)
      victim.c1 = victim.c2 = null;
      if (e.result === 'counter') this.dustAt(victim, 0.3);
      if (wear(victim.hold, COMBAT.loseStr * exposure(victim.hold)) && victim === this.me) this.msg(victim.hold.kind ? `Ta prise glisse : ${GRIPS[victim.hold.kind].label}` : 'Tu as perdu ta prise', 0.8);
    } else if (e.result === 'clash' && e.balance) { shove(a, moveDir(e.move), 3); shove(b, moveDir(e.move), 3); }
    // the pair moves together: the push drives, the pull draws, the pivot turns
    const dir = this.frameOf(a, b);
    this.pairVel.x += dir.fx * e.drive * COMBAT.impulse; this.pairVel.z += dir.fz * e.drive * COMBAT.impulse;
    this.pairSpin += e.turn * 2;
    this.grip = gripAdvantage(this.me.hold, this.ai.hold);
    const mine = a === this.me;
    const won: Side | null = winner === null ? null : winner === this.me ? 'player' : 'opponent';
    this.lastExchange = { by: mine ? 'player' : 'opponent', move: e.move, against: e.against, winner: won, result: e.result };
    if (this.cl) this.combatLessonHear({ k: 'exchange', winner: won, result: e.result });
    if (this.drill) this.drillHear({ k: 'exchange', by: mine ? 'player' : 'opponent', winner: won, result: e.result, move: e.move, against: e.against });
    const NOUN: Record<ClinchMove, [string, string]> = { push: ['sa poussée', 'ta poussée'], pull: ['sa traction', 'ta traction'], pivot: ['son pivot', 'ton pivot'] };
    let text = '';
    if (e.result === 'counter') {
      this.feel('read', won === 'player', won === 'opponent');
      const m = e.winner === 'a' ? e.move : e.against!, lost = e.winner === 'a' ? e.against! : e.move;
      text = won === 'player' ? `Contre ! Tu ${MOVES[m].doing}s sur ${NOUN[lost][0]} : il glisse !` : `Il ${MOVES[m].doing} sur ${NOUN[lost][1]} : tu glisses !`;
      crowdCheer(0.8, 0.07);
    } else if (e.result === 'clash') text = e.move === 'pivot' ? 'Vous tournez ensemble' : won === 'player' ? 'Tu l’emportes en force' : won === 'opponent' ? 'Il l’emporte en force' : 'Forces égales';
    else if (e.result === 'drive') text = mine ? `Tu ${MOVES[e.move].doing}s` : `Il ${MOVES[e.move].doing}`;
    if (text) this.msg(text, e.result === 'counter' ? 0.9 : 0.5);
  }
  /**
   * The pair's shared motion: the weights drive it (a push one way, a pull the other, the stronger man wins the push),
   * an exchange gives it a shove; a man moved back without bracing, or drawn forward without sitting back, loses his
   * balance that way. Then the turn.
   */
  private pairStep(dt: number) {
    const me = this.me, ai = this.ai, a = this.frameOf(me, ai);
    const power = (f: Fighter) => k(f.attrs.force) * (0.55 + 0.45 * Math.min(1, f.stamina / 60)) * (0.6 + 0.4 * f.balance / 100);
    const drive = COMBAT.driveSpeed * (me.weight.f * power(me) - ai.weight.f * power(ai));
    const tx = a.fx * drive, tz = a.fz * drive, ease = Math.min(1, dt / COMBAT.momentum);
    this.pairVel.x += (tx - this.pairVel.x) * ease; this.pairVel.z += (tz - this.pairVel.z) * ease;
    const spin = 0.5 * (me.weight.s * power(me) + ai.weight.s * power(ai));
    this.pairSpin += (spin - this.pairSpin) * ease;
    if (this.held) { this.pairVel.set(0, 0, 0); this.pairSpin = 0; return; }
    for (const f of [me, ai]) { f.pos.x += this.pairVel.x * dt; f.pos.z += this.pairVel.z * dt; }
    if (Math.abs(this.pairSpin) > 1e-3) {
      const mx = (me.pos.x + ai.pos.x) / 2, mz = (me.pos.z + ai.pos.z) / 2, c = Math.cos(this.pairSpin * dt), s = Math.sin(this.pairSpin * dt);
      for (const f of [me, ai]) { const x = f.pos.x - mx, z = f.pos.z - mz; f.pos.x = mx + x * c - z * s; f.pos.z = mz + x * s + z * c; }
    }
    for (const [f, o] of [[me, ai], [ai, me]] as const) {
      const b = this.frameOf(f, o), v = this.pairVel.x * b.fx + this.pairVel.z * b.fz;
      if (v > 0.12 && f.weight.f <= 0.3) shove(f, { f: 1, s: 0 }, COMBAT.dragLean * v * dt * braceFactor(f, { f: 1, s: 0 }));
      else if (v < -0.12 && f.weight.f >= -0.3) shove(f, { f: -1, s: 0 }, COMBAT.dragLean * -v * dt * braceFactor(f, { f: -1, s: 0 }));
    }
  }
  /** Out of the circle (not in the lesson or a drill); the new bout: the third time out loses (SORTIES_LOST): the referee stops, a point for the one who stayed in, back to the middle. */
  private checkSortie(): boolean {
    if (this.cl || this.drill || this.held || this.mode === 'entrainement') return false;
    for (const [f, o] of [[this.me, this.ai], [this.ai, this.me]] as const) {
      if (Math.hypot(f.pos.x - this.o.x, f.pos.z - this.o.z) <= this.ring - 0.3) continue;
      o.tally.sorties++;
      const outs = o.tally.sorties;
      this.refereeSaid = f === this.me ? `Sortie ${outs}/3` : `${this.style.name} sort ${outs}/3`;
      this.separate(null, 0);
      for (const v of this.feetVel.values()) v.set(0, 0);
      if (this.combat && outs >= SORTIES_LOST) {
        // the third time out of the pit loses the bout
        this.banner('DEHORS !', 'end');
        this.me.clip = this.ai.clip = 'Stance'; o.clip = 'Celebrate';
        this.end('decision', o === this.me ? 'player' : 'opponent');
        return true;
      }
      if (this.combat) this.banner(`SORTIE ${outs}/3`, 'combo');
      this.me.pos.set(this.o.x + 1.1, 0.1, this.o.z); this.ai.pos.set(this.o.x - 1.1, 0.1, this.o.z);
      this.msg(this.refereeSaid, 1.4);
      return true;
    }
    return false;
  }
  /** A throw starts (Projeter): the one its hold gives against his imbalance now. False: it could not start. */
  private startCombatThrow(by: Fighter, def: Fighter, force?: ThrowId): boolean {
    const mine = by === this.me;
    if (this.attempt) return false;
    if (!by.hold.kind) { if (mine) this.msg('Pas de prise : saisis-le d’abord', 0.7); return false; }
    if (by.deeper > 0) { if (mine) this.msg('Pas en changeant de prise', 0.6); return false; }
    if (by.recover > 0) {
      // the button lit (he is ready to fall) and pressed in the short pause after a move: kept, thrown as the pause ends
      const b = mine ? bestThrow(by, def) : null;
      if (b && throwScore(b.id, by, def) >= COMBAT.throwAt) this.throwBuffer = 0.35;
      return false;
    }
    const id = force ?? bestThrow(by, def)!.id, t = THROWS[id];
    if (by.stamina < t.cost) { if (mine) this.msg('Plus assez d’endurance pour projeter', 0.8); return false; }
    by.stamina -= t.cost; by.idle = 0; by.tally.throws++;                  // the throw takes over his own move being set up (a thumb on the stick can throw)
    const moving = !!def.move;
    this.me.move = this.ai.move = null;
    // a combo: the two exchanges its recipe asks for, won in a row just before (the same for both wrestlers)
    const combo = isCombo(id, by.c1, by.c2, by.t1, by.t2, this.t);
    const special = !mine && !!this.brain && id === SIGNATURE[this.brain.style].throw;
    by.c1 = by.c2 = null;
    this.attempt = { by, t: 0, counter: false, counterAt: Infinity, id, braceSum: 0, braceT: 0, moving, combo, special };
    if (mine) this.brain?.saw('throw', id);
    if (combo) { this.combos++; this.banner(mine ? `COMBO ! ${t.label}` : `Combo : ${t.label} !`, 'combo'); }
    else if (special) this.banner(`${this.style.name} : ${t.label} !`, 'special');
    this.msg(mine ? `Tu tentes ${t.name}…` : `Il tente ${t.name} ! Résiste ou contre !`, t.windup);
    return true;
  }
  /**
   * The throw is set up (its tell), the other braces (his weight against its way, in its last moments) or counters, then it
   * lands: he goes down (the fall rule), the thrower goes down (reversed), it is blocked, or it fails and costs its author.
   */
  private combatThrowStep(dt: number, meCounter: boolean, aiCounter: boolean) {
    const me = this.me, ai = this.ai, at = this.attempt!, att = at.by, def = att === me ? ai : me, id = at.id!, t = THROWS[id];
    for (const f of [me, ai]) { holdTick(f, dt, f === me ? this.grip : -this.grip); gripTick(f.hold, f.stamina, dt); }
    at.t += dt;
    const counterNow = def === me ? meCounter : aiCounter;
    if (!at.counter && counterNow) {
      if (def.stamina >= THROW.counterCost) { def.stamina -= THROW.counterCost; at.counter = true; if (def === me) this.msg('Contre !', 0.5); }
      else if (def === me) this.msg('Plus assez d’endurance pour contrer', 0.6);
    }
    const windup = t.windup * (att.slow ?? 1);
    if (at.t >= 0.4 * windup) { at.braceSum! += braceAgainst(id, def) * dt; at.braceT! += dt; }
    if (at.t < windup) return;
    this.attempt = null;
    const by: Side = att === me ? 'player' : 'opponent', brace = at.braceT ? at.braceSum! / at.braceT : 0;
    const name = t.name;
    if (at.counter) {
      const score = counterScore(def, att, def === me ? this.grip : -this.grip) + COMBAT.counterBrace * brace;
      this.feel(score >= THROW.counterThreshold ? 'counter' : 'read', def === me, att === me);
      if (score >= THROW.counterThreshold) {
        this.lastThrow = { by, result: 'countered', throw: id };
        if (this.cl) this.combatLessonHear({ k: 'throw', by, result: 'countered' });
        this.msg(def === me ? `Contre ! ${name} se retourne contre lui !` : 'Il contre ta projection…', 1.2);
        this.resolveCombatFall(def, att, reverseFall(id), `${name} contré`);
        return;
      }
      shove(att, { f: 1, s: 0 }, THROW.blockBalance / k(att.attrs.equilibre)); att.recover = 0.4;
      this.lastThrow = { by, result: 'blocked', throw: id };
      if (this.cl) this.combatLessonHear({ k: 'throw', by, result: 'blocked' });
      this.msg(def === me ? 'Projection bloquée' : 'Il bloque ta projection', 0.9);
      return;
    }
    const score = throwScore(id, att, def, { brace, moving: at.moving }) + (at.combo ? COMBAT.combo : 0);
    if (brace > 0.05) def.stamina = Math.max(0, def.stamina - braceCost(brace));
    if (score >= COMBAT.throwAt) {
      this.lastThrow = { by, result: 'fall', throw: id };
      if (this.cl) this.combatLessonHear({ k: 'throw', by, result: 'fall' });
      this.msg(att === me ? `${t.label} ! Il part au sol` : `${t.label}… tu pars au sol`, 1.2);
      this.resolveCombatFall(att, def, t.fall, name);
      return;
    }
    throwFails(id, att); att.recover = 0.35;
    this.grip = gripAdvantage(me.hold, ai.hold);
    const braced = brace > 0.3;
    this.lastThrow = { by, result: braced ? 'braced' : 'fail', throw: id };
    if (this.cl) this.combatLessonHear({ k: 'throw', by, result: braced ? 'braced' : 'fail' });
    if (braced) this.feel('read', def === me, false);
    this.msg(att === me ? (braced ? `Il a résisté à ${name} : tu es déséquilibré` : `${t.label} raté : il n’était pas prêt à tomber`) : braced ? `Tu résistes à ${name} : il est déséquilibré !` : `${t.label} raté : il est déséquilibré !`, 1.0);
  }
  /** A fall in the new bout: the referee calls it (the back on the sand, or the four supports); in the lesson or a drill, they get up. */
  private resolveCombatFall(winner: Fighter, loser: Fighter, fall: FallKind, name: string) {
    this.fallKind = fall; this.throwName = name;
    this.fallForce = Math.max(0, Math.min(1, 0.55 * (winner.hold.str / 100) + 0.3 * (winner.stamina / 100) + 0.15 * (1 - loser.balance / 100)));
    if (this.drill || this.cl) {
      this.feel('throw', winner === this.me, loser === this.me);
      if (this.drill && loser === this.me) this.drillHear({ k: 'fall' });
      this.msg(winner === this.me ? 'Au sol ! On se relève.' : 'Tu es au sol… On se relève, on recommence.', 1.4);
      if (this.cl) { this.separate(null, 0); if (!this.cl.done) this.cl.ready = false; }
      for (const f of [this.me, this.ai]) { f.balance = Math.max(f.balance, 75); f.move = null; }
      this.grip = gripAdvantage(this.me.hold, this.ai.hold);
      this.fallKind = null; this.throwName = null;
      return;
    }
    this.resolveClinch(winner === this.me, fall === 'appuis' ? 'Kneel' : 'Fall_Back');
  }
  /** The bell in the new bout: the referee's decision (points, then warnings, then throws tried; a draw only after that). */
  private combatTimeUp() {
    const w = combatDecision({ score: this.me.score, tally: this.me.tally }, { score: this.ai.score, tally: this.ai.tally });
    const side: Side | null = w === 'a' ? 'player' : w === 'b' ? 'opponent' : null;
    this.me.clip = this.ai.clip = 'Stance';
    if (side) (side === 'player' ? this.me : this.ai).clip = 'Celebrate';
    this.end(side ? 'decision' : 'egalite', side);
  }

  // ---------------------------------------------------------------- the new bout's lesson (src/lamb/combatLesson.ts)
  private combatLessonReady(): boolean {
    const l = this.cl!; if (l.done) return false;
    const d = COMBAT_LESSON[l.step as Exclude<typeof l.step, 'done'>];
    const wrong = (d.in === 'clinch' && this.phase === 'fight') || (d.in === 'fight' && this.phase === 'clinch');
    if (l.ready && !(wrong && !this.attempt)) return true;
    l.ready = true; this.lessonT = 0;
    const me = this.me, ai = this.ai;
    if (d.in === 'clinch' && this.phase === 'fight') this.startCombatClinch(me, 'nuque', 'neutral');
    else if (d.in === 'fight' && this.phase === 'clinch') this.separate(null, 0);
    if (d.in === 'clinch') {
      me.stamina = Math.max(me.stamina, 75);
      me.hold = { kind: l.step === 'unbalance' || l.step === 'throw' ? 'bras' : 'nuque', str: 62 }; ai.hold = { kind: 'nuque', str: 30 };
      for (const f of [me, ai]) { f.balance = 100; f.dir = { f: 0, s: 0 }; }
    }
    this.coachText = combatCoachLine(l.step);
    return false;
  }
  private combatLessonStanding(dt: number) {
    const l = this.cl!; this.combatLessonReady();
    if (l.step === 'guard' && (this.lessonT += dt) > 2.4 && free(this.ai) && this.ai.open <= 0 && this.me.pos.distanceTo(this.ai.pos) <= STRIKES.big.reach) {
      this.lessonT = 0;
      if (startStrike(this.ai, 'big')) this.msg('Il arme une grosse frappe : garde !', 0.8);
    }
  }
  /** The lesson's empoignade: the partner's scripted part (a slow push to read, a hip throw to resist). True: the step moved this frame. */
  private combatLessonClinch(dt: number): boolean {
    const l = this.cl!, me = this.me, ai = this.ai;
    if (!this.combatLessonReady() && (this.phase as DuelPhase) !== 'clinch') return true;
    if (l.step === 'moves' && !ai.move && ai.recover <= 0 && (this.lessonT += dt) > 1.4) { this.lessonT = 0; startMove(ai, 'push'); }
    if (l.step === 'throw') { if (ai.balance > 48) { ai.balance = 48; ai.dir = { f: -1, s: 0 }; } me.hold.str = Math.max(me.hold.str, 60); }
    if (l.step === 'brace') {
      me.hold.str = Math.min(me.hold.str, 40); ai.hold = { kind: 'bras', str: 60 };
      if (me.balance > 72) { me.balance = 72; me.dir = { f: 1, s: 0 }; }
      if (!this.attempt && ai.recover <= 0 && (this.lessonT += dt) > 1.8) { this.lessonT = 0; this.startCombatThrow(ai, me, 'hanche'); }
    }
    if (l.step === 'break') { this.grip = Math.max(this.grip, -20); me.hold.str = Math.max(me.hold.str, 45); }
    return false;
  }
  private combatLessonHear(e: CombatLessonEvent): boolean {
    const l = this.cl; if (!l || l.done) return false;
    const word = combatFeedback(l.step, e);
    if (combatHear(l, e)) {
      this.msg(utter(['Baax na !']), 0.9);
      if (l.done) this.finishLesson();
      return true;
    }
    if (word) this.coachText = `Coach Ablaye : ${word}`;
    return false;
  }

  // ---------------------------------------------------------------- avec frappe: the stand-up exchange (Làmb 2.0)
  private fightFrappe(dt: number, taps: number, breaks: number, quick: number, big: number) {
    const me = this.me, ai = this.ai;
    if (this.timeLeft !== Infinity && !this.held) this.timeLeft -= dt;
    if (!this.held) this.standT += dt;
    if (this.drill) this.drillStep(dt);
    const urge = this.lesson || this.drill ? 0 : urgeOf(this.standT);
    if (urge > 0 && !this.urged) { this.urged = true; this.msg('L’arbitre presse les lutteurs : saisissez-vous !', 1.2); }
    const m = this.auto ? { x: 0, y: 0 } : this.input.move();
    if (this.auto) ({ taps, breaks, quick, big } = this.autoStand(dt, ai.pos.distanceTo(me.pos)));
    me.guard = this.guardHeld && !me.strike && me.stagger <= 0 && me.open <= 0 && me.dodge <= 0 && me.busy <= 0;
    // feet: relative to the camera; slow in guard, slower while striking, none while staggering
    if (me.busy <= 0 && me.stagger <= 0) {
      const sp = 2.6 * (me.guard ? STAND.guardSpeed : me.strike ? 0.4 : 1);
      if (this.auto) {                                                      // AI against AI: it keeps its own range
        const d0 = ai.pos.distanceTo(me.pos), r0 = this.autoStepIn > 0 ? 1.1 : rangeOf(this.auto.stand, urgeOf(this.standT)), want = d0 > r0 + 0.15 ? 1 : d0 < r0 - 0.35 ? -0.6 : 0;
        me.pos.addScaledVector(ai.pos.clone().sub(me.pos).setY(0).normalize(), want * (sp / 2.6) * this.auto.style.speed * Math.min(1.2, this.autoFactor) * dt);
      } else me.pos.addScaledVector(this.camRight, m.x * sp * dt).addScaledVector(this.camFwd, m.y * sp * dt);
    }
    for (const [f, o] of [[me, ai], [ai, me]] as const) if (f.dodge > 0) {
      const away = f.pos.clone().sub(o.pos).setY(0).normalize();
      f.pos.addScaledVector(away, 4.2 * Math.min(dt, f.dodge));
    }
    let d = ai.pos.distanceTo(me.pos);
    if (this.lesson) this.lessonHear({ k: 'tick', dist: d });

    // the opponent's grab in its response window: step back or hit him (the guard does not stop a grab)
    if (ai.windup > 0) {
      {
        ai.windup = Math.max(0, ai.windup - dt);
        if (ai.windup <= 0) {
          if (d <= R.grabRange + 0.3) this.startClinch(ai, 'Il t’a saisi ! Empoignade', 'late');
          else { ai.open = R.openingSeconds; this.msg('Il a raté ! Ouverture !', 1.1); }
        }
      }
    }
    if (this.phase !== 'fight') return;
    if (breaks > 0) this.dodge();
    if (quick + big > 0) this.playerStrike(big > 0 ? 'big' : 'quick');
    if (taps > 0) this.playerGrab();
    if (this.phase !== 'fight') return;

    // the opponent answers the player's strike (guard, step back, or a quick strike first)
    if (this.held || this.drill) this.aiReact = null;
    if (this.aiReact && (this.aiReact.at -= dt) <= 0) {
      const what = this.aiReact.what; this.aiReact = null;
      if (what === 'guard' && free(ai) && ai.open <= 0) this.aiGuardHold = 0.45;
      else if (what === 'back' && free(ai)) { ai.dodge = 0.3; this.aiGuardHold = 0; }
      else if (what === 'counter') { this.aiGuardHold = 0; startStrike(ai, 'quick'); }
    }
    // the opponent's decisions (in the lesson, the partner only does what the step needs)
    this.aiThink -= dt;
    if (this.lesson) {
      if (this.lesson.step === 'guard' && (this.lessonT += dt) > 2.4 && free(ai) && ai.open <= 0 && d <= STRIKES.big.reach) {
        this.lessonT = 0;
        if (startStrike(ai, 'big')) this.msg('Il arme une grosse frappe : garde !', 0.8);
      }
      this.aiThink = 1;
    } else if (this.drill) {
      this.aiThink = 1;                                                     // the partner holds the pads, nothing more
    } else if (!this.held && this.aiThink <= 0 && free(ai) && ai.windup <= 0 && ai.open <= 0 && ai.busy <= 0) {
      const [a0, b0] = this.style.think; this.aiThink = (a0 + this.rand() * (b0 - a0)) * this.pace;
      const dec = decide({ me: ai, them: me, dist: d, grabRange: R.grabRange }, this.standStyle, this.factor, this.rand, urge);
      if (dec.grab && ai.stamina >= R.stamina.grabCost) this.aiGrab();
      else if (dec.strike) {
        this.aiGuardHold = 0; ai.guard = false;
        if (startStrike(ai, dec.strike) && dec.strike === 'big') this.msg('Grosse frappe ! Garde, recule ou frappe vite', 0.6);
      } else {
        this.aiGuardHold = dec.guard ? this.aiThink : 0;
        // wrestling still matters standing: it may go for the grab in range
        if (!dec.guard && d < R.grabRange + 0.2 && ai.stamina >= R.stamina.grabCost + 6 && this.rand() < Math.min(0.9, this.style.grabChance * 0.25 * this.factor)) this.aiGrab();
      }
    }
    if (this.phase !== 'fight') return;
    this.aiGuardHold = Math.max(0, this.aiGuardHold - dt);
    ai.guard = this.aiGuardHold > 0 && !ai.strike && ai.stagger <= 0 && ai.open <= 0 && ai.windup <= 0;
    if (ai.busy <= 0 && ai.windup <= 0 && ai.stagger <= 0 && ai.dodge <= 0) {
      const range = rangeOf(this.standStyle, urge), wait = this.lesson?.step === 'distance';
      const want = wait ? 0 : d > range + 0.15 ? 1 : d < range - 0.35 ? -0.6 : 0;
      const dir = me.pos.clone().sub(ai.pos).setY(0).normalize();
      ai.pos.addScaledVector(dir, want * (ai.guard ? STAND.guardSpeed : ai.strike ? 0.4 : 1) * this.style.speed * Math.min(1.2, this.factor) * dt);
    }
    // states over time; strikes land at the end of their windup
    d = ai.pos.distanceTo(me.pos);
    for (const [f, o] of [[me, ai], [ai, me]] as const) {
      if (tick(f, dt, f.regen)) this.strikeLands(f, o, d);
    }
    for (const f of [me, ai]) {
      if (f.busy <= 0 && f.windup <= 0) f.clip = f.stagger > 0 ? 'Idle' : f === me && Math.hypot(m.x, m.y) > 0.1 && !f.strike ? 'Walk' : 'Stance';
    }
    if (this.msgHold <= 0) {
      this.msg(me.stagger > 0 ? 'Tu vacilles… recule ou garde-toi' : ai.stagger > 0 ? `${this.style.name} vacille : saisis-le !`
        : me.open > 0 ? 'Tu es ouvert !' : ai.open > 0 ? 'Ouverture !' : ai.strike?.kind === 'big' && !ai.strike.landed ? 'Grosse frappe ! Garde, recule ou frappe vite' : '');
    }
    if (this.timeLeft <= 0) this.timeUp();
  }

  // ---------------------------------------------------------------- avec frappe: the empoignade is played (Làmb 2.0, step 3)
  private clinchFrappe(dt: number, taps: number, breaks: number, quick: number, big: number, pull: boolean) {
    const me = this.me, ai = this.ai;
    if (this.timeLeft !== Infinity && !this.held) this.timeLeft -= dt;
    // the bell ends the round in the empoignade too (a throw already launched lands first)
    if (this.timeLeft <= 0 && !this.attempt) { this.timeUp(); return; }
    me.clip = ai.clip = 'Grab';
    if (this.auto) {
      const o = this.autoClinch(dt);
      taps = 0; quick = 0; pull = false; breaks = o.brk ? 1 : 0; big = o.throw ? 1 : 0; this.moveQueued = o.move;
    }
    // the player: Saisir pushes, Garde pulls, Frappe pivots, Reculer breaks free
    if (breaks > 0) {
      if (tryBreak(me, this.grip)) { me.score.breaks++; this.separate(ai, 0.5); this.msg('Dégagé !', 1.0); if (this.lesson) this.lessonHear({ k: 'break', by: 'player' }); return; }
      this.msg(this.grip < CLINCH.breakFloor ? 'Sa prise est trop forte pour casser' : me.move ? 'Pas au milieu d’un mouvement' : 'Plus assez d’endurance pour casser', 0.8);
    }
    // the lesson holds the position its step needs (a grip to feel, a balance to throw), and the partner's throw to counter
    if (this.lesson) {
      const s = this.lesson.step;
      if (s === 'slip') this.grip = Math.min(this.grip, -55);
      if (s === 'break') this.grip = Math.max(this.grip, -25);
      if (s === 'throw') { ai.balance = Math.min(ai.balance, 28); this.grip = Math.max(this.grip, 35); }
      if (s === 'counter') {
        me.balance = Math.max(me.balance, 88); this.grip = Math.max(this.grip, 15);
        if (!this.attempt && (this.lessonT += dt) > 1.6 && !ai.move && ai.recover <= 0) { this.lessonT = 0; this.startThrow(ai); return; }
      }
    }
    if (this.drill) this.drillStep(dt);
    // step 5: a throw being attempted takes over the empoignade until it lands
    if (this.attempt) { this.throwStep(dt, big); return; }
    const want: ClinchMove | null = this.moveQueued ?? (taps > 0 ? 'push' : pull ? 'pull' : quick > 0 ? 'pivot' : null);
    this.moveQueued = null;
    if (big > 0) {
      if (me.move || me.recover > 0) this.msg('Pas au milieu d’un mouvement', 0.6);
      else if (me.stamina < THROW.cost) this.msg('Plus assez d’endurance pour projeter', 0.8);
      else { this.startThrow(me); return; }
    }
    if (want && !startMove(me, want) && !me.move && me.recover <= 0) this.msg('Plus d’endurance', 0.7);
    // the opponent reads, answers, or plays its style — and throws when the position is good
    this.aiThink -= dt;
    if (!this.held && !this.drill && this.aiThink <= 0) {
      const [a0, b0] = this.clinchStyle.think; this.aiThink = (a0 + this.rand() * (b0 - a0)) * this.pace;
      if (wantsThrow(ai, me, -this.grip, this.clinchStyle, this.factor, this.rand, this.lesson ? 0 : clinchUrge(this.phaseT))) { this.startThrow(ai); return; }
      const d = clinchDecide(ai, me, -this.grip, this.clinchStyle, this.factor, ai.composure, this.rand);
      if (d === 'break') {
        if (tryBreak(ai, -this.grip)) { ai.score.breaks++; this.separate(me, 0.4); this.msg('Il se dégage !', 1.0); return; }
      } else if (d) startMove(ai, d);
    }
    // moves land: the exchange decides who loses balance and grip
    for (const [f, o] of [[me, ai], [ai, me]] as const) {
      if (holdTick(f, dt, f === me ? this.grip : -this.grip) && f.move) this.clinchExchange(f, o, exchange(f, o, f === me ? this.grip : -this.grip));
    }
    // a wrestler whose balance is gone goes down (step 6 brings the throw attempt, the counter and the fall itself)
    if (me.balance <= 0 || ai.balance <= 0) { this.resolveClinch(ai.balance <= 0 && (me.balance > 0 || this.grip >= 0)); return; }
    const going = posture(me.balance) === 'chute' || posture(ai.balance) === 'chute';
    if (!this.held && !this.drill && this.phaseT > CLINCH.maxSeconds + (going ? CLINCH.graceSeconds : 0)) {
      this.separate(null, 0); this.msg('L’arbitre sépare les lutteurs', 1.2);
      // his patience is spent: back on their feet, he keeps pressing them to take hold again
      if (!this.lesson) { this.standT = URGE.after; this.urged = true; }
      return;
    }
    // step 4: the player feels the position going — words, the screen's edge, a low note when it gets serious
    const pm = posture(me.balance), po = posture(ai.balance);
    if (this.lesson && this.lessonHear({ k: 'posture', player: pm })) return;
    if (pm !== this.postureWas.me && pm === 'chute') strikeSound('big', 'guarded');
    if (po !== this.postureWas.ai && po === 'chute') crowdCheer(1.2, 0.1);
    this.postureWas = { me: pm, ai: po };
    if (this.msgHold <= 0) {
      this.msg(pm === 'chute' ? 'Tu vas tomber : contre ou casse !' : ai.move ? `Il ${MOVES[ai.move.kind].doing}…`
        : pm === 'glisse' ? (this.grip < -25 ? 'Tu glisses : sa prise t’use, reprends-la !' : 'Tu glisses…')
        : po === 'chute' ? 'Il va tomber : pousse !' : po === 'glisse' ? 'Il glisse !' : 'Empoignade');
    }
  }
  private postureWas: { me: Posture; ai: Posture } = { me: 'stable', ai: 'stable' };

  /** A throw starts: moves are dropped, the other sees it coming (the AI decides now whether it will counter). */
  private startThrow(by: Fighter) {
    const me = this.me, ai = this.ai;
    by.stamina -= THROW.cost; me.move = ai.move = null;
    // the defender answers by AI when it is the opponent, or the autopilot's side (AI against AI)
    const def = by === me ? ai : me, viaAi = def === ai || !!this.auto;
    const counters = viaAi && !(this.held && def === ai) && wantsCounter(def, def === ai ? this.clinchStyle : this.auto!.clinch, def === ai ? this.factor : this.autoFactor, def.composure, this.rand());
    this.attempt = { by, t: 0, counter: false, counterAt: counters ? 0.2 + 0.15 * (1 - def.composure / 100) : Infinity };
    this.msg(by === me ? 'Tu tentes la projection…' : 'Il tente la projection ! Contre !', THROW.windup);
  }

  /** The throw sets up, may be countered, then lands: he goes down, the thrower goes down, or it fails. */
  private throwStep(dt: number, counterPress: number) {
    const me = this.me, ai = this.ai, at = this.attempt!, att = at.by, def = att === me ? ai : me;
    const gAtt = att === me ? this.grip : -this.grip;
    for (const f of [me, ai]) holdTick(f, dt, f === me ? this.grip : -this.grip);
    at.t += dt;
    // the counter: the player presses Contrer while it sets up; the opponent after its reaction time
    if (!at.counter && def === me && !this.auto && counterPress > 0) {
      if (me.stamina >= THROW.counterCost) { me.stamina -= THROW.counterCost; at.counter = true; this.msg('Contre !', 0.5); }
      else this.msg('Plus assez d’endurance pour contrer', 0.6);
    }
    if (!at.counter && (def === ai || this.auto) && at.t >= at.counterAt && def.stamina >= THROW.counterCost) { def.stamina -= THROW.counterCost; at.counter = true; }
    if (at.t < THROW.windup * (att.slow ?? 1)) return;
    this.attempt = null;
    const by: Side = att === me ? 'player' : 'opponent';
    if (at.counter) {
      const c = counterThrow(def, att, -gAtt);
      // a counter landed: the player's buzzes; one that turns the throw holds the picture too
      this.feel(c.result === 'reverse' ? 'counter' : 'read', def === me, att === me);
      this.lastThrow = { by, result: c.result === 'reverse' ? 'countered' : 'blocked' };
      if (this.lesson) this.lessonHear({ k: 'throw', by, result: this.lastThrow.result });
      if (c.result === 'reverse') { this.msg(def === me ? 'Contre ! Il part au sol !' : 'Il contre ta projection…', 1.2); this.resolveClinch(def === me); return; }
      att.recover = 0.4;
      this.msg(def === me ? 'Projection bloquée' : 'Il bloque ta projection', 0.9);
      return;
    }
    const t = throwLands(att, def, gAtt);
    this.lastThrow = { by, result: t.result };
    if (this.lesson) this.lessonHear({ k: 'throw', by, result: t.result });
    if (t.result === 'fall') { this.msg(att === me ? 'Projection !' : 'Il te projette…', 1.2); this.resolveClinch(att === me); return; }
    this.grip = Math.max(-100, Math.min(100, this.grip + (att === me ? t.grip : -t.grip)));
    att.recover = 0.35;
    this.msg(att === me ? 'Projection ratée : il tenait bon, tu es déséquilibré' : 'Sa projection rate : il est déséquilibré !', 1.0);
  }

  // ---------------------------------------------------------------- Coach Ablaye's lesson avec frappe (src/lamb/lesson.ts)
  /** Sets the current step up once: standing or in the empoignade, a grip or a balance to feel, the coach's word. */
  private lessonSetup() {
    const l = this.lesson!; if (l.done) return;
    const d = LESSON[l.step as keyof typeof LESSON];
    const wrongPlace = (d.in === 'clinch' && this.phase === 'fight') || (d.in === 'fight' && this.phase === 'clinch');
    if (l.ready && !(wrongPlace && !this.attempt)) return;                  // set up, and still in the right place
    l.ready = true; this.lessonT = 0;
    if (d.in === 'clinch' && this.phase === 'fight') this.startClinch(this.me, 'Empoignade !', 'neutral');
    else if (d.in === 'fight' && this.phase === 'clinch') this.separate(null, 0);
    if (d.in === 'clinch') this.me.stamina = Math.max(this.me.stamina, 70);  // enough to do the step
    if (l.step === 'slip') this.me.balance = Math.min(this.me.balance, 58);
    if (l.step === 'break') this.grip = Math.max(this.grip, -20);
    this.coachText = coachLine(l.step);
  }
  /** The lesson hears what happened: a finished step moves on (the coach says so), else maybe a word. True: moved on. */
  private lessonHear(e: LessonEvent): boolean {
    const l = this.lesson; if (!l || l.done) return false;
    const word = feedback(l.step, e);
    if (hear(l, e)) {
      this.msg(utter(['Baax na !']), 0.9);
      if (l.done) this.finishLesson();
      return true;
    }
    if (word) this.coachText = `Coach Ablaye : ${word}`;
    return false;
  }
  private finishLesson() { this.coachText = this.cl ? combatCoachLine('done') : coachLine('done'); this.msg(`${utter(['Baax na !'])} Leçon terminée`, 2.2); this.lessonEnd = 2.2; }

  // ---------------------------------------------------------------- an écurie drill, played (src/lamb/drills.ts)
  /** Sets the drill up once (the pads at a step in front, or the empoignade taken) and keeps it in its place. */
  private drillSetup() {
    const dr = this.drill!, def = DRILLS[dr.id];
    if (dr.done) return;
    if (def.in === 'clinch' && this.phase === 'fight') { this.startClinch(this.me, 'Empoignade !', 'neutral'); this.grip = 0; }
    else if (def.in === 'fight' && this.phase === 'clinch' && !this.attempt) this.separate(null, 0);
    if (dr.ready) return;
    dr.ready = true;
    this.me.stamina = this.me.max;                                          // a fresh start: the drill spends it
    if (def.in === 'fight') {                                               // Babacar holds the pads a step in front
      const dir = this.ai.pos.clone().sub(this.me.pos).setY(0); if (dir.lengthSq() < 1e-4) dir.set(-1, 0, 0); dir.normalize();
      this.ai.pos.copy(this.me.pos).addScaledVector(dir, 1.35);
    }
    this.coachText = drillLine(dr.id);
  }
  /** The drill's clock: a call opens (the coach's word, or the partner's move), a call left unanswered closes. */
  private drillStep(dt: number) {
    const dr = this.drill!, ai = this.ai;
    if (dr.done) return;
    const { opened, closed } = drillTick(dr, dt);
    if (closed) this.drillWord(closed);
    if (opened) {
      ai.stamina = ai.max; ai.balance = Math.max(ai.balance, 80); ai.composure = 100; ai.stagger = 0;
      const word = callWord(opened.want);
      if (word) this.msg(`Coach Ablaye : « ${word} »`, 0.8);
      else { this.grip = 0; ai.move = null; ai.recover = 0; startMove(ai, opened.want as ClinchMove); }
    }
    if (this.drillAuto && dr.open && !dr.open.swung) {
      const want = DRILLS[dr.id].calls[dr.open.i].want, me = this.me;
      if (want === 'quick' || want === 'big') { if (this.phase === 'fight' && free(me) && me.busy <= 0 && !me.strike) this.pressStrike(want); }
      else if (this.phase === 'clinch' && ai.move && !me.move && me.recover <= 0) {
        const beats: Record<ClinchMove, ClinchMove> = { push: 'pull', pull: 'pivot', pivot: 'push' };
        this.moveQueued = dr.id === 'saisies' ? beats[ai.move.kind] : 'push';
      }
    }
    if (dr.done) this.finishDrill();
  }
  private drillHear(e: DrillEvent) {
    const dr = this.drill; if (!dr || dr.done) return;
    const r = hearDrill(dr, e);
    if (r) this.drillWord(r);
  }
  private drillWord(r: Parameters<typeof drillFeedback>[1]) {
    const word = drillFeedback(this.drill!.id, r);
    if (word) this.coachText = `Coach Ablaye : ${word}`;
  }
  private finishDrill() {
    const v = drillVerdict(this.drill!);
    this.coachText = v.line; this.msg(`Exercice terminé · ${v.score}/${v.of}`, 2.2); this.drillEnd = 2.2;
  }
  /** The drill's recap: its score, and what a finished drill moves (the caller's notes); nothing when abandoned. */
  private drillRewards(outcome: BoutOutcome) {
    if (outcome === 'abandon') return { needs: {}, coach: 0, lines: ['Exercice interrompu : rien n’est compté'] };
    const s = drillScore(this.drill!);
    return { needs: {}, coach: 0, lines: [`${DRILLS[this.drill!.id].title} : ${s.score}/${s.of} (juste ${s.right}, fautes ${s.faults}${s.falls ? `, chutes ${s.falls}` : ''})`, ...this.drillNotes] };
  }
  /** The drill's result (null before it ends): its score out of the calls. */
  drillResult() { return this.drill && this.result ? { id: this.drill.id, ...drillScore(this.drill), outcome: this.result.outcome } : null; }

  /** Applies an exchange: grip, the pair's motion, words, the crowd. */
  private clinchExchange(a: Fighter, b: Fighter, e: Exchange) {
    const mine = a === this.me, sign = mine ? 1 : -1;
    this.grip = Math.max(-100, Math.min(100, this.grip + sign * e.grip));
    const dir = b.pos.clone().sub(a.pos).setY(0); if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0); dir.normalize();
    a.pos.addScaledVector(dir, e.drive); b.pos.addScaledVector(dir, e.drive);
    if (e.turn) {
      const mid = a.pos.clone().add(b.pos).multiplyScalar(0.5), c = Math.cos(e.turn), s = Math.sin(e.turn);
      for (const f of [a, b]) { const x = f.pos.x - mid.x, z = f.pos.z - mid.z; f.pos.x = mid.x + x * c - z * s; f.pos.z = mid.z + x * s + z * c; }
    }
    const winner: Side | null = e.winner === null ? null : (e.winner === 'a') === mine ? 'player' : 'opponent';
    this.lastExchange = { by: mine ? 'player' : 'opponent', move: e.move, against: e.against, winner, result: e.result };
    if (this.lesson && this.lessonHear({ k: 'exchange', winner, result: e.result })) return;
    if (this.drill) this.drillHear({ k: 'exchange', by: mine ? 'player' : 'opponent', winner, result: e.result, move: e.move, against: e.against });
    // « Tu tires sur sa poussée : il glisse ! » — 2nd person is the 3rd plus « s » for these three verbs
    const NOUN: Record<ClinchMove, [string, string]> = { push: ['sa poussée', 'ta poussée'], pull: ['sa traction', 'ta traction'], pivot: ['son pivot', 'ton pivot'] };
    let text = '';
    if (e.result === 'counter') {
      this.feel('read', winner === 'player', winner === 'opponent');
      const won = winner === 'player', m = e.winner === 'a' ? e.move : e.against!, lost = e.winner === 'a' ? e.against! : e.move;
      text = won ? `Contre ! Tu ${MOVES[m].doing}s sur ${NOUN[lost][0]} : il glisse !` : `Il ${MOVES[m].doing} sur ${NOUN[lost][1]} : tu glisses !`;
      crowdCheer(0.8, 0.07);
    } else if (e.result === 'clash') text = e.move === 'pivot' ? 'Vous tournez ensemble' : winner === 'player' ? 'Tu l’emportes en force' : winner === 'opponent' ? 'Il l’emporte en force' : 'Forces égales';
    else if (e.result === 'drive') text = mine ? `Tu ${MOVES[e.move].doing}s` : `Il ${MOVES[e.move].doing}`;
    if (text) this.msg(text, e.result === 'counter' ? 0.9 : 0.5);
  }

  /**
   * AI against AI, standing: the « player » side reads the other's strikes and grabs (guard, step back, a quick strike
   * first), decides by its style like the other side, and presses the same buttons a player would.
   */
  private autoStand(dt: number, d: number) {
    const me = this.me, ai = this.ai, a = this.auto!, out = { taps: 0, breaks: 0, quick: 0, big: 0 };
    if (ai.strike && !ai.strike.landed && !this.autoSawStrike) {
      this.autoSawStrike = true;
      const w = react(ai.strike.kind, me, a.stand, this.autoFactor, this.rand());
      this.autoReact = w === 'none' ? null : { at: reactDelay(ai.strike.kind, me), what: w };
    }
    if (!ai.strike) this.autoSawStrike = false;
    if (ai.windup > 0 && !this.autoSawGrab) {                              // his grab on its way: step back, or hit him first
      this.autoSawGrab = true;
      const w = react('big', me, a.stand, this.autoFactor, this.rand());
      if (w === 'back') out.breaks = 1; else if (w !== 'none') out.quick = 1;
    }
    if (ai.windup <= 0) this.autoSawGrab = false;
    if (this.autoReact && (this.autoReact.at -= dt) <= 0) {
      const w = this.autoReact.what; this.autoReact = null;
      if (w === 'guard') this.autoGuard = 0.45; else if (w === 'back') out.breaks = 1; else if (w === 'counter') out.quick = 1;
    }
    this.autoT -= dt;
    if (this.autoT <= 0 && free(me) && me.open <= 0 && me.busy <= 0) {
      const [x0, x1] = a.style.think; this.autoT = x0 + this.rand() * (x1 - x0);
      const dec = decide({ me, them: ai, dist: d, grabRange: R.grabRange }, a.stand, this.autoFactor, this.rand, urgeOf(this.standT));
      if (dec.grab && me.stamina >= R.stamina.grabCost) { if (d <= R.grabRange) out.taps = 1; else this.autoStepIn = 0.8; }
      else if (dec.strike) { this.autoGuard = 0; if (dec.strike === 'big') out.big = 1; else out.quick = 1; }
      else this.autoGuard = dec.guard ? this.autoT : 0;
    }
    // stepping in for a grab decided just out of reach: it lands once close enough
    if (this.autoStepIn > 0) { this.autoStepIn -= dt; if (d <= R.grabRange - 0.05 && free(me) && me.open <= 0) { out.taps = 1; this.autoStepIn = 0; } }
    this.autoGuard = Math.max(0, this.autoGuard - dt);
    this.guardHeld = this.autoGuard > 0;
    return out;
  }

  /** AI against AI, in the empoignade: the « player » side throws when the position is good, else reads and moves. */
  private autoClinch(dt: number): { move: ClinchMove | null; throw: boolean; brk: boolean } {
    const me = this.me, ai = this.ai, a = this.auto!, out = { move: null as ClinchMove | null, throw: false, brk: false };
    this.autoT -= dt;
    if (this.autoT > 0 || this.attempt) return out;
    const [x0, x1] = a.clinch.think; this.autoT = x0 + this.rand() * (x1 - x0);
    if (wantsThrow(me, ai, this.grip, a.clinch, this.autoFactor, this.rand, clinchUrge(this.phaseT))) { out.throw = true; return out; }
    const d = clinchDecide(me, ai, this.grip, a.clinch, this.autoFactor, me.composure, this.rand);
    if (d === 'break') out.brk = true; else out.move = d;
    return out;
  }

  /** The player starts a strike; the opponent may see it coming. */
  private playerStrike(kind: StrikeKind) {
    const me = this.me, ai = this.ai;
    if (me.open > 0) { this.msg('Tu es ouvert : recule ou attends', 0.7); return; }
    if (!free(me) || me.busy > 0) return;
    const wasGuard = me.guard; me.guard = false;
    if (!startStrike(me, kind)) { me.guard = wasGuard; if (me.stamina < STRIKES[kind].cost) this.msg('Plus d’endurance', 0.8); return; }
    if (this.drill) this.drillHear({ k: 'swing', kind });
    const what = react(kind, ai, this.standStyle, this.factor, this.rand());
    this.aiReact = what === 'none' ? null : { at: reactDelay(kind, ai), what };
  }

  /** A strike reaches its landing moment: hit, stagger, guarded or missed; messages, sounds, the crowd. */
  private strikeLands(a: Fighter, d: Fighter, dist: number) {
    const l = land(a, d, dist), mine = a === this.me, name = this.style.name;
    this.lastStrike = { by: mine ? 'player' : 'opponent', kind: l.kind, result: l.result };
    if (this.lesson) this.lessonHear({ k: 'strike', by: mine ? 'player' : 'opponent', kind: l.kind, result: l.result });
    if (this.cl) this.combatLessonHear({ k: 'strike', by: mine ? 'player' : 'opponent', kind: l.kind, result: l.result });
    if (this.mode !== 'entrainement' && (l.result === 'hit' || l.result === 'stagger')) this.onMoment?.(l.result === 'stagger' ? 'stagger' : 'strike', mine ? 'player' : 'opponent', { kind: l.kind });
    if (this.drill && mine) {
      this.drillHear({ k: 'land', kind: l.kind, result: l.result });
      d.balance = Math.max(d.balance, 80); d.stagger = 0; d.composure = 100;   // the pads take it
    }
    strikeSound(l.kind, l.result);
    if (l.result === 'hit' || l.result === 'stagger') this.feel(l.result === 'stagger' ? 'stagger' : l.kind, mine, !mine);
    else if (l.result === 'guarded' && l.kind === 'big') this.feel('guarded', mine, !mine);
    if (l.result === 'hit' || l.result === 'stagger') a.score.hits = (a.score.hits ?? 0) + 1;
    if (l.result === 'stagger') { a.score.staggers = (a.score.staggers ?? 0) + 1; crowdCheer(1.6, 0.14); }
    else if (l.result === 'hit' && l.kind === 'big') crowdCheer(0.9, 0.08);
    if (l.result === 'guarded') d.score.guards++;
    if (this.combat && (l.result === 'hit' || l.result === 'stagger') && d.reach) {   // the new bout: a clean hit stops a reach on its way
      d.reach = null; d.open = Math.max(d.open, R.openingSeconds * 0.6); a.score.guards++;
      this.msg(mine ? 'Frappé pendant sa saisie : coupée !' : 'Il te frappe pendant ta saisie', 1.0);
      return;
    }
    if ((l.result === 'hit' || l.result === 'stagger') && d.windup > 0) {        // a clean hit stops a grab on its way
      d.windup = 0; d.open = Math.max(d.open, R.openingSeconds * 0.6); a.score.guards++;
      this.msg(mine ? 'Frappé pendant sa saisie : coupée !' : 'Il te frappe pendant ta saisie', 1.0);
      return;
    }
    const cut = l.interrupted ? ' · frappe coupée' : '';
    const text = mine
      ? { hit: l.kind === 'big' ? 'Grosse frappe touchée !' : 'Touché', stagger: `${name} vacille ! Saisis-le !`, guarded: l.kind === 'big' ? 'Paré : tu es ouvert !' : 'Paré par sa garde', miss: l.kind === 'big' ? 'Raté ! Tu es ouvert' : 'Dans le vide' }[l.result]
      : { hit: l.kind === 'big' ? 'Il te touche fort' : 'Il te touche', stagger: 'Tu vacilles… recule !', guarded: l.kind === 'big' ? 'Bien paré : il est ouvert !' : 'Paré', miss: l.kind === 'big' ? 'Il a raté : ouverture !' : 'Esquivé' }[l.result];
    this.msg(text + cut, l.result === 'stagger' ? 1.2 : l.kind === 'big' ? 0.9 : 0.5);
  }

  private resolveClinch(playerWins: boolean, downClip: Clip = 'Fall_Back') {
    this.feel('throw', playerWins, !playerWins);
    if (this.drill) {
      if (!playerWins) this.drillHear({ k: 'fall' });
      this.msg(playerWins ? 'Il est au sol : on se relève.' : 'Tu es au sol… On se relève.', 1.2);
      this.me.balance = Math.max(this.me.balance, 70); this.ai.balance = Math.max(this.ai.balance, 70); this.grip = 0;
      this.me.move = this.ai.move = null;
      return;
    }
    if (this.lesson) {
      this.msg(playerWins ? 'Au sol ! On se relève.' : 'Tu es au sol… On se relève, on recommence.', 1.4);
      this.separate(null, 0);
      if (!this.lesson.done) this.lesson.ready = false;
      this.me.balance = Math.max(this.me.balance, 70); this.ai.balance = Math.max(this.ai.balance, 70);
      return;
    }
    const step = this.stepId();
    const me = this.me, ai = this.ai;
    if (step) {
      // training: nobody is thrown for real; the step either advances or is tried again
      this.phase = 'fight'; this.phaseT = 0;
      if (step === 'clinch' && playerWins) { this.msg('Projection ! On se relève', 1.4); this.nextStep(); }
      else if (step === 'clinch') { this.msg('Pousse plus vite ! Saisis-le encore', 1.4); this.step = TUTORIAL.findIndex(s => s.id === 'grab'); }
      else if (step === 'break') this.msg(playerWins ? 'Bien poussé, mais entraîne le dégagement' : 'Il t’aurait projeté : dégage-toi au vert', 1.6);
      else if (step === 'grab' && playerWins) { this.msg('Projection ! On se relève', 1.4); this.step = TUTORIAL.findIndex(s => s.id === 'break'); }
      this.separate(null, 0);
      return;
    }
    (playerWins ? ai : me).clip = downClip;
    (playerWins ? me : ai).clip = 'Celebrate';
    crowdCheer(2.5, 0.2);
    this.end('projection', playerWins ? 'player' : 'opponent');
  }

  private timeUp() {
    if (this.combat) { this.combatTimeUp(); return; }
    const w = refereeDecision(this.me.score, this.ai.score, RULES[this.discipline]);
    this.me.clip = this.ai.clip = 'Stance';
    if (w) (w === 'player' ? this.me : this.ai).clip = 'Celebrate';
    this.end(w ? 'decision' : 'egalite', w);
  }

  private startClinch(by: Fighter, text: string, entry: Entry = 'neutral') {
    const step = this.stepId();
    if (step === 'grab' && by === this.me) this.nextStep();
    this.phase = 'clinch'; this.phaseT = 0; this.clinchBy = by; this.aiBreakTried = -1;
    this.me.effort = 0; this.ai.effort = 0; this.me.guard = this.ai.guard = false;
    this.me.windup = this.ai.windup = 0; this.me.open = this.ai.open = 0; this.me.dodge = 0;
    if (this.frappe) {
      // step 2: who grabbed, from what, with what balance → the grip each holds
      const other = by === this.me ? this.ai : this.me, g = entryGrip(entry, by, other);
      this.entry = entry; this.grip = by === this.me ? g : -g;
      text = `${ENTRY_TEXT[entry]} !`;                                        // the grip is told under the bar
    }
    for (const f of [this.me, this.ai]) { f.strike = null; f.stagger = 0; f.recover = 0; f.dodge = 0; f.move = null; }
    this.aiReact = null; this.aiGuardHold = 0; this.moveQueued = null; this.lastExchange = null; this.attempt = null;
    this.standT = 0; this.urged = false;
    if (this.lesson) this.lessonHear({ k: 'clinch', by: by === this.me ? 'player' : 'opponent' });
    if (this.frappe) { this.aiThink = 0.5; this.autoT = 0.5; }
    this.roomAt = null;                                                    // the HUD of this empoignade is measured afresh
    this.feel('grip');
    this.msg(text, 0.9);
  }
  /** End an empoignade without a fall: push the wrestlers apart; `exposed` (if any) is left open briefly. */
  private separate(exposed: Fighter | null, open: number) {
    const me = this.me, ai = this.ai;
    this.phase = 'fight'; this.phaseT = 0; this.clinchBy = null; me.move = ai.move = null; this.attempt = null;
    for (const f of [me, ai]) { f.hold = { kind: null, str: 0 }; f.reach = null; f.deeper = 0; f.sec = ''; f.weight = { f: 0, s: 0 }; }
    this.pairVel.set(0, 0, 0); this.pairSpin = 0;
    const dir = ai.pos.clone().sub(me.pos).setY(0); if (dir.lengthSq() < 1e-4) dir.set(-1, 0, 0); dir.normalize();
    const mid = me.pos.clone().add(ai.pos).multiplyScalar(0.5);
    me.pos.copy(mid).addScaledVector(dir, -1.1); ai.pos.copy(mid).addScaledVector(dir, 1.1);
    me.busy = ai.busy = 0.4; me.effort = ai.effort = 0;
    if (exposed) exposed.open = R.openingSeconds * open;
    this.aiThink = Math.max(this.aiThink, 0.7);
  }

  /** Placement, animation and the side camera. */
  private frame(dt: number) {
    const me = this.me, ai = this.ai;
    for (const f of [me, ai]) {
      const off = f.pos.clone().sub(this.o).setY(0);
      const edge = this.combat ? this.ring + 0.6 : this.ring;
      if (off.length() > edge) f.pos.copy(this.o).addScaledVector(off.normalize(), edge).setY(0.1);
    }
    const gap = ai.pos.clone().sub(me.pos).setY(0), dist = gap.length();
    if (dist < 0.75 && this.phase === 'fight') { const push = gap.normalize().multiplyScalar((0.75 - dist) / 2); ai.pos.add(push); me.pos.sub(push); }
    me.facing = Math.atan2(ai.pos.x - me.pos.x, ai.pos.z - me.pos.z);
    ai.facing = Math.atan2(me.pos.x - ai.pos.x, me.pos.z - ai.pos.z);
    // his bàkk at the entrance: he dances to the camera
    if (this.bakkOf(ai) && this.view) ai.facing = Math.atan2(this.view.cam.x - ai.pos.x, this.view.cam.z - ai.pos.z);
    this.poseDt += dt; this.gap = dist;
    if (!this.visual) return this.view;
    return this.poseBodies();
  }

  /**
   * A watched bout (src/arena/bout.ts) plays its fixed steps several at a time when the frame is long: only the last
   * one poses the bodies (`visual` false for the others, then `poseBodies` once, with the time of all of them). The
   * player's own bout poses them every step, as always.
   */
  visual = true;
  private poseDt = 0;
  private gap = 0;
  private view: { cam: THREE.Vector3; look: THREE.Vector3 } = { cam: new THREE.Vector3(), look: new THREE.Vector3() };
  /** The wrestlers, the referee and the crowd posed for the time gone by since they last were; the camera's view. */
  poseBodies(): { cam: THREE.Vector3; look: THREE.Vector3 } {
    const me = this.me, ai = this.ai, dt = this.poseDt, dist = this.gap;
    this.poseDt = 0;
    const hold = this.fx ? this.fx.contact : 0;
    for (const f of [me, ai]) if (f.w) {
      this.placeOf(f, f.w.group.position); f.w.group.rotation.y = f.facing; f.w.hold = f.clip; f.w.animate(dt, 0);
      if (f.look) { this.poseCombat(f, f === me ? ai : me, dt); continue; }
      if (f.rig && this.phase === 'fight' && this.frappe) f.rig.pose(f, dt);
      else if (f.rig && this.phase === 'clinch' && hold > 0) f.rig.grip(hold);     // « Le choc »: arms round each other, then the move
      if (f.rig && this.phase === 'clinch' && this.frappe) {
        const at = this.attempt;
        if (at) f.rig.hold(at.by === f ? 'push' : 'pull', Math.min(1, at.t / 0.25), at.by === f ? f.balance : Math.min(f.balance, 30));
        else f.rig.hold(f.move?.kind ?? null, f.move ? Math.min(1, f.move.t / 0.3) : 0, f.balance);
      }
    }
    this.dust?.tick(dt, this.o.y);
    if (this.official) {
      const mid0 = me.pos.clone().add(ai.pos).multiplyScalar(0.5), fx = this.phase === 'fall' ? this.fallFx : null;
      if (fx) {
        // step 6: he walks up from his side of the ring, then raises the winner's arm
        const k = THREE.MathUtils.clamp((this.phaseT - 0.6) / 1.2, 0, 1), o = this.official;
        o.group.position.lerpVectors(fx.refFrom, fx.refTo, k * k * (3 - 2 * k));
        const look = k < 1 ? fx.refTo : fx.winner.pos;
        o.group.rotation.y = Math.atan2(look.x - o.group.position.x, look.z - o.group.position.z);
        o.hold = k > 0 && k < 1 ? 'Walk' : 'Idle';
        o.animate(dt, 0);
        if (k >= 1) this.refRig?.apply({ upper_armL: [0.15, 1, 0.05], forearmL: [0.05, 1, 0], handL: [0, 1, 0] }, Math.min(1, (this.phaseT - 1.8) / 0.3));
        if (k >= 1 && this.phaseT > 1.8) this.refRaised = true;
      } else {
        this.official.group.rotation.y = Math.atan2(mid0.x - this.official.group.position.x, mid0.z - this.official.group.position.z);
        this.official.animate(dt, 0);
      }
    }
    for (const h of this.crowd) h.animate(dt, 0);
    this.draw();
    return this.aim(dist);
  }

  /**
   * The new bout's bodies (src/lamb/combatRig.ts): feet planted in a crouched stance that steps, the weight seen in the
   * hips, knees and trunk, the hands on the hold (the nape, the arm, the belt, the leg), the move or the throw set up, the
   * strikes avec frappe (Làmb 2.0's rig on top), the fall by the throw that caused it.
   */
  private poseCombat(f: Fighter, o: Fighter, dt: number) {
    const at = this.attempt, down = this.phase === 'fall' && this.outcome === 'projection' && (this.fallFx?.loser === f || this.feelFall?.loser === f);
    const force = this.cineForce(f), cc = this.cine;
    const tensed = !!cc && cc.phase === 'debout' && f === this.ai && (cc.ai.act === 'garde' || cc.ai.act === 'charge');
    f.look!.pose({
      force, tilt: force ? this.cineTilt(f) : null, grip: force ? this.cineGrip(f) : null,
      dt, phase: force ? 'scene' : this.phase, ring: this.o, other: o.w, otherLook: o.look,
      lean: lean(f), weight: f.weight, hold: f.hold.kind, holdStr: f.hold.str, reach: f.reach ? { kind: f.reach.kind, k: Math.min(1, f.reach.t / f.reach.dur) } : null,
      move: f.move ? { kind: f.move.kind, k: Math.min(1, f.move.t / 0.3), side: f.side } : null,
      throwing: at && at.by === f && at.id ? { id: at.id, k: Math.min(1, at.t / (THROWS[at.id].windup * (f.slow ?? 1))) } : null,
      thrown: at && at.by === o && at.id ? { id: at.id, k: Math.min(1, at.t / (THROWS[at.id].windup * (o.slow ?? 1))) } : null,
      fall: down ? { kind: this.fallKind ?? 'dos', throw: this.lastThrow?.throw ?? null, t: this.phaseT, force: this.fallForce } : null,
      apart: o.pos.distanceTo(f.pos),
      won: this.phase === 'fall' && !down && this.winner !== null && (this.winner === 'player') === (f === this.me),
      guard: f.guard, stagger: f.stagger, crouch: tensed ? 1 : this.phase === 'intro' ? 0.3 : this.phase === 'fight' ? Math.max(0.2, Math.min(1, (2.4 - o.pos.distanceTo(f.pos)) / 0.9)) : 1,   // tall while apart, low as he engages
      after: f.rig && this.frappe && this.phase === 'fight' ? () => f.rig!.pose(f, dt) : undefined,   // Làmb 2.0's guard and strikes, on top
    });
  }

  /**
   * Where a wrestler is drawn (into `out`): where the rules put him, or — « Le choc », the player's own bout — moved
   * along the pair's line towards the other in the empoignade, chest to chest (the pair's middle is kept, so the rules'
   * places, the separation and the ring are untouched).
   */
  private placeOf(f: Fighter, out: THREE.Vector3): THREE.Vector3 {
    out.copy(f.pos);
    const k = this.fx ? this.fx.contact : 0; if (k <= 0) return out;
    const o = f === this.me ? this.ai : this.me, dx = o.pos.x - f.pos.x, dz = o.pos.z - f.pos.z, d = Math.hypot(dx, dz);
    if (d > 1e-4) { const m = (contactShift(d) * k) / d; out.x += dx * m; out.z += dz * m; }
    return out;
  }

  /** The side camera's view of the pair `dist` m apart (the rules' distance), with the push of « Le choc » apart. */
  private aim(dist: number): { cam: THREE.Vector3; look: THREE.Vector3; kick?: THREE.Vector3 } {
    const me = this.me, ai = this.ai, fx = this.fx;
    // side camera on the pair, always from the -z side; farther in portrait so both wrestlers fit
    const mid = me.pos.clone().add(ai.pos).multiplyScalar(0.5);
    const side = new THREE.Vector3(-(ai.pos.z - me.pos.z), 0, ai.pos.x - me.pos.x).normalize();
    if (!Number.isFinite(side.x) || side.lengthSq() < 0.5) side.set(0, 0, -1);
    if (side.z > 0) side.multiplyScalar(-1);
    const portrait = typeof innerWidth !== 'undefined' && innerWidth < innerHeight;
    // the new bout is framed as a fighting game: side-on at chest height and close, the pair filling the screen (the gap
    // widens the shot as they part); the old bout keeps its high, far side camera
    let fr: Framing = this.combat
      ? { dist: Math.min(portrait ? 5.6 : 4.4, (portrait ? 3.3 : 2.7) + dist * (portrait ? 1.5 : 0.6)), height: (portrait ? 1.35 : 1.25) + Math.max(0, dist - 1.6) * 0.18, look: portrait ? 0.92 : 1.0 }
      : { dist: (portrait ? 8.5 : 6.5) + dist * (portrait ? 1.1 : 0.6), height: portrait ? 3.4 : 3.0, look: portrait ? 0.9 : 1.1 };
    if (fx && fx.close > 0) fr = mixFraming(fr, this.closeUp(fr), fx.close);   // « Le choc »: the empoignade's close-up
    // the new bout: a throw set up punches the camera in; a combo or a style's signature throw swings it round (a « super »)
    const at = this.combat && fx ? this.attempt : null;
    let orbit = 0;
    if (at && at.id) {
      const k = Math.min(1, at.t / (THROWS[at.id].windup * (at.by.slow ?? 1))), big = !!(at.combo || at.special);
      fr = { dist: fr.dist * (1 - (big ? 0.3 : 0.16) * k), height: fr.height - (big ? 0.6 : 0.25) * k, look: fr.look - (big ? 0.15 : 0) * k };
      if (big) orbit = 0.5 * k * (at.by === me ? 1 : -1);
    }
    const cam = orbit ? mid.clone().addScaledVector(side.clone().applyAxisAngle(UP, orbit), fr.dist).setY(fr.height) : mid.clone().addScaledVector(side, fr.dist).setY(fr.height);
    let view: { cam: THREE.Vector3; look: THREE.Vector3 };
    const down = this.fallFx?.loser ?? this.feelFall?.loser;
    if (!this.spectate && this.phase === 'fall' && down && this.outcome === 'projection' && this.phaseT < (this.fallFx ? 1.2 : FX.fall.close)) {
      // close and low on the wrestler going down, then back out (avec frappe: for the referee)
      const at = this.placeOf(down, new THREE.Vector3()), c = at.clone().addScaledVector(side, this.combat ? (portrait ? 4.4 : 3.2) : portrait ? 5 : 3.6).setY(this.combat ? 1.2 : 1.5);
      this.camFwd.copy(side).multiplyScalar(-1).setY(0).normalize(); this.camRight.set(-this.camFwd.z, 0, this.camFwd.x);
      view = { cam: c, look: at.setY(this.combat ? 0.75 : 0.6) };
    } else {
      // camera-relative movement axes
      this.camFwd.copy(side).multiplyScalar(-1).setY(0).normalize();
      this.camRight.set(-this.camFwd.z, 0, this.camFwd.x);           // forward × up
      view = { cam, look: mid.clone().setY(fr.look) };
    }
    // the cinematic bout's shots: close and turning slowly round the pair in the empoignade (pushed in on his tell, low as
    // a move loads); low, three-quarters from the attacker's front for a move, rising as the man thrown hits the sand; the
    // replay from the other side, lower and closer, sliding round
    if (this.cineIntro && this.phase === 'intro' && this.phaseT < CINE_INTRO.me) {
      // the bàkk: low, from the front of the one dancing, turning slowly round him
      const f = this.phaseT < CINE_INTRO.him ? ai : me, o = f === ai ? me : ai, k = f === ai ? this.phaseT / CINE_INTRO.him : (this.phaseT - CINE_INTRO.him) / (CINE_INTRO.me - CINE_INTRO.him);
      // (wide of the line between them, so the other man is never in the way)
      // (both from the player's side of the light: he turns his back to the player and dances to the camera and the stands)
      const front = (f === ai ? f.pos.clone().sub(o.pos) : o.pos.clone().sub(f.pos)).setY(0).normalize().applyAxisAngle(UP, (f === ai ? 0.35 : 0.75) + 0.45 * k);
      view = { cam: f.pos.clone().addScaledVector(front, (portrait ? 2.9 : 2.3) - 0.4 * k).setY(0.75 + 0.25 * k), look: f.pos.clone().setY(1.1) };
      this.camFwd.copy(view.look).sub(view.cam).setY(0).normalize(); this.camRight.set(-this.camFwd.z, 0, this.camFwd.x);
    }
    const c = this.cine;
    if (c && (this.phase === 'fight' || this.phase === 'clinch') && c.phase !== 'debout') {
      const sc = c.scene;
      if (sc && (c.phase === 'scene' || c.phase === 'replay' || c.phase === 'fin')) {
        const a = sc.by === 'player' ? me : ai, b = a === me ? ai : me;
        const ab = b.pos.clone().sub(a.pos).setY(0).normalize(), m = a.pos.clone().add(b.pos).multiplyScalar(0.5);
        const right = new THREE.Vector3(-ab.z, 0, ab.x);
        const k = Math.min(1, sc.t / Math.max(0.1, sc.impact)), after = Math.max(0, sc.t - sc.impact);
        if (c.phase === 'replay' || c.phase === 'fin') {
          const r = Math.min(1, c.replayT / 2.2), dir = right.clone().multiplyScalar(-0.9).addScaledVector(ab, 0.35 - 0.9 * r).normalize();
          view = { cam: m.clone().addScaledVector(dir, portrait ? 3.4 : 2.6).setY(0.45 + 0.35 * r), look: m.clone().setY(0.75 - 0.2 * Math.min(1, after)) };
        } else {
          const dir = right.clone().multiplyScalar(0.8).addScaledVector(ab, 0.6).normalize();
          const dist = (portrait ? 4.2 : 3.3) + 0.6 * Math.min(1, after);
          view = { cam: m.clone().addScaledVector(dir, dist).setY(0.75 + 0.65 * k), look: m.clone().setY(0.85 - 0.25 * Math.min(1, after)) };
        }
      } else {
        const tk = c.phase === 'empoignade' && c.aiPlan.act === 'attaque' ? Math.min(1, c.aiPlan.t / c.aiPlan.dur) : 0;
        const load = c.phase === 'projection' ? Math.min(1, c.needle) : 0;
        const ang = 0.35 * Math.sin(this.t * 0.35) + 0.25 * load;
        const dir = side.clone().applyAxisAngle(UP, ang);
        const dist = (portrait ? 2.9 : 2.3) * (1 - 0.22 * tk - 0.15 * load);
        view = { cam: mid.clone().addScaledVector(dir, dist).setY(1.2 - 0.25 * tk - 0.3 * load), look: mid.clone().setY(1.0 - 0.1 * load) };
      }
      this.camFwd.copy(view.look).sub(view.cam).setY(0).normalize(); this.camRight.set(-this.camFwd.z, 0, this.camFwd.x);
    }
    this.view = view;
    // the push towards the pair along the camera's own axis: given apart, so the caller adds it after its own smoothing
    if (!fx) return view;
    const kick = view.look.clone().sub(view.cam).multiplyScalar(fx.kick);
    const sh = this.shakeAmp * Math.exp(-9 * this.shakeT);
    if (sh > 0.002) { kick.addScaledVector(this.camRight, sh * Math.sin(this.shakeT * 55)); kick.y += 0.6 * sh * Math.sin(this.shakeT * 43); }
    return { ...view, kick };
  }

  /**
   * The empoignade's framing from the fight's (src/lamb/fx.ts clinchFraming): closer and lower, the heads under the HUD
   * over the pair (the Prise panel) and the feet over the controls under it, on this screen with the game camera's field
   * of view (src/core/view.ts fovFor, as src/main.ts sets it).
   */
  private closeUp(from: Framing): Framing {
    const room = this.room(from);
    // the heads: the top of the taller of the two bodies drawn (its hair), so the whole head is under the Prise, whichever body
    const head = this.o.y + Math.max(this.headOf(this.me), this.headOf(this.ai));
    return clinchFraming(from, { fovY: fovFor(room.w, room.h), h: room.h, top: room.top, bottom: room.bottom, head, feet: 0.2 });
  }
  /**
   * The rows the pair may use (px): under the lowest HUD block over the pair (the Prise, the lesson's card, the
   * message), over the highest control under it (the duel's buttons, the joystick) — over the pair: within the width it
   * can take on screen at the closest framing of `from` (fx.ts pairHalfWidth). Measured as an empoignade starts
   * (startClinch forgets it), then every half second (the Prise's words may take another line) and when the screen turns.
   */
  private room(from: Framing) {
    const w = typeof innerWidth === 'undefined' ? 390 : innerWidth, h = typeof innerHeight === 'undefined' ? 844 : innerHeight;
    const now = typeof performance === 'undefined' ? 0 : performance.now();
    if (this.roomAt && this.roomAt.w === w && this.roomAt.h === h && now - this.roomAt.at < 500) return this.roomAt;
    let top = 0, bottom = h;
    if (!this.headless && !this.spectate) {
      const half = pairHalfWidth(from, fovFor(w, h), w, h), x0 = w / 2 - half, x1 = w / 2 + half;
      const across = (r: DOMRect) => r.width > 0 && r.height > 0 && r.left < x1 && r.right > x0;
      for (const el of this.ui.querySelectorAll<HTMLElement>('.duel-clinch, .duel-step, .duel-msg')) {
        if (el.hidden || !el.textContent?.trim()) continue;
        const r = el.getBoundingClientRect();
        if (across(r) && r.bottom < h * 0.8) top = Math.max(top, r.bottom + FX.clinch.gap);
      }
      for (const el of [...this.ui.querySelectorAll<HTMLElement>('.duel-btns button'), document.getElementById('joy')]) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (across(r) && r.top > h * 0.35) bottom = Math.min(bottom, r.top - FX.clinch.room);
      }
    }
    return (this.roomAt = { top, bottom, w, h, at: now });
  }

  dispose() {
    this.drums.stop();
    if (!this.headless) {
      document.getElementById('joy')?.classList.remove('teach');
      removeEventListener('keydown', this.onKey); removeEventListener('keyup', this.onKey);
      removeEventListener('blur', this.releaseControls); document.removeEventListener('visibilitychange', this.onHidden);
      this.ui.remove(); document.body.classList.remove('induel', 'cine-cut');
    }
    for (const f of [this.me, this.ai]) { f.look?.dispose(); f.w?.dispose(); }
    this.dust?.dispose();
    this.official?.dispose();
    for (const h of this.crowd) h.dispose();
    this.group.removeFromParent();
  }
}
