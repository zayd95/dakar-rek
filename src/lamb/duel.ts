import * as THREE from 'three';
import { Wrestler, Humanoid, randomLook, lookFromOutfit, wrestlerReady, type Clip } from '../actors/humanoid';
import type { Input } from '../core/input';
import type { WrestlerLook } from '../core/types';
import { rng } from '../core/rng';
import { castById } from '../social/cast';
import { Percussion, crowdCheer, strikeSound } from './audio';
import {
  AVERAGE, STAND, STAND_STYLES, STRIKES, decide, free, land, react, reactDelay, standState, startStrike, tick,
  type Attributes, type Reaction, type StandState, type StandStyle, type StrikeKind,
} from './stand';
import { StrikeRig } from './strikeRig';
import {
  CLINCH, CLINCH_STYLES, ENTRY_TEXT, MOVES, THROW, clinchDecide, clinchPower, counterThrow, entryGrip, exchange, gripWords, holdTick, posture, startMove,
  throwLands, tryBreak, wantsCounter, wantsThrow,
  type ClinchMove, type ClinchStyle, type Entry, type Exchange, type Posture,
} from './clinch';
import { inGate, tierRadius, tierTop, TIERS } from '../world/geew';
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
}
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
}
export interface DuelResult {
  mode: BoutMode; outcome: BoutOutcome; winner: Side | null; seconds: number;
  score: { player: BoutScore; opponent: BoutScore }; stamina: { player: number; opponent: number }; rewards: Rewards;
}

const R = RULES.sans_frappe;
const TUTORIAL = [
  { id: 'move', text: 'Déplace-toi vers Babacar', how: 'Joystick · ZQSD/WASD/flèches' },
  { id: 'guard', text: 'Il va te saisir lentement : garde-toi quand il attaque', how: 'Maintiens Garde · G/Maj' },
  { id: 'grab', text: 'Approche et saisis-le, tout près', how: 'Saisir · E/Espace' },
  { id: 'clinch', text: 'Empoignade : tape Saisir le plus vite possible', how: 'Saisir · E/Espace, plusieurs fois' },
  { id: 'break', text: 'Laisse-le te saisir, puis dégage-toi quand la barre est verte', how: 'Dégager · X' },
] as const;
type StepId = (typeof TUTORIAL)[number]['id'];

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
  /** Avec frappe: moments of the bout for whoever listens (the stands react): the fall and the result. */
  onMoment?: (m: 'fall' | 'result', winner: Side | null) => void;
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
  private aiGuardHold = 0;
  /** Avec frappe: grip advantage in the empoignade, from the player's side (−100…100), and how it started. */
  private grip = 0;
  private entry: Entry = 'neutral';
  private clinchStyle: ClinchStyle;
  /** Guard held on the previous frame (in the empoignade, pressing Garde is « Tirer »), and a move queued by a hook. */
  private guardWas = false;
  private moveQueued: ClinchMove | null = null;
  /** Avec frappe: who the opponent is, in one line (« Gora, costaud indépendant, 7-2 »). */
  identity: string | null = null;
  /** A throw being attempted in the empoignade (step 5): who, since when, and the other's counter (when it comes). */
  private attempt: { by: Fighter; t: number; counter: boolean; counterAt: number } | null = null;
  /** Last throw attempt and how it ended (for the checks). */
  lastThrow: { by: Side; result: string } | null = null;
  /** Last exchange in the empoignade (for the checks and the HUD). */
  lastExchange: { by: Side; move: ClinchMove; against: ClinchMove | null; winner: Side | null; result: string } | null = null;

  /** Last strike that landed (for the checks and the HUD). */
  lastStrike: { by: Side; kind: StrikeKind; result: string } | null = null;
  private onKey = (e: KeyboardEvent) => {
    const down = e.type === 'keydown';
    if (e.code === 'KeyG' || e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyF') { this.guardHeld = down; this.ui.querySelector('[data-k=guard]')?.classList.toggle('on', down); }
    if (!down || e.repeat) return;
    if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') {
      if (e.target instanceof HTMLButtonElement && this.ui.contains(e.target)) return;   // let a focused dialog button act
      if (e.code === 'Space') e.preventDefault();
      if (this.phase === 'result') this.finish(); else if (!this.paused) this.grabTaps++;
    }
    if (e.code === 'KeyX' && !this.paused) this.breakPresses++;
    if (this.frappe && !this.paused && (e.code === 'KeyJ' || e.code === 'KeyC')) this.quickPresses++;
    if (this.frappe && !this.paused && (e.code === 'KeyK' || e.code === 'KeyV')) this.bigPresses++;
    if (e.code === 'Escape') { if (this.phase === 'result') this.finish(); else this.askAbandon(!this.confirmOpen()); }
  };

  constructor(opts: DuelOptions) {
    const { origin, look, input, crowdSize } = opts;
    this.input = input; this.mode = opts.mode; this.style = opts.style; this.level = opts.level; this.spectate = !!opts.spectate;
    this.discipline = opts.discipline ?? 'sans_frappe'; this.frappe = this.discipline === 'avec_frappe';
    this.standStyle = this.mode === 'entrainement' ? STAND_STYLES.partenaire : STAND_STYLES[this.style.id];
    this.clinchStyle = this.mode === 'entrainement' ? CLINCH_STYLES.partenaire : CLINCH_STYLES[this.style.id];
    const who = this.frappe && this.mode !== 'entrainement' ? opts.opponent : undefined;
    if (who) { this.standStyle = who.stand; this.clinchStyle = who.clinch; this.identity = who.line; }
    this.factor = opts.mode === 'entrainement' ? 1 : levelFactor(opts.level);
    this.timeLeft = opts.mode === 'entrainement' ? Infinity : R.roundSeconds;
    this.ring = opts.ring ?? 7.6;
    this.o = new THREE.Vector3(origin.x, 0.1, origin.z);
    const mk = (skin: number, l: WrestlerLook, x: number, max: number, regen: number, attrs: Attributes): Fighter => {
      const w = wrestlerReady() ? new Wrestler(skin) : null;
      if (w) { w.setLook(l, l.ngembPattern === 'bordure' ? 'B' : 'A'); this.group.add(w.group); }
      return { ...standState(attrs, max), w, pos: new THREE.Vector3(origin.x + x, 0.1, origin.z), facing: 0, regen, busy: 0, clip: 'Prep', windup: 0, effort: 0, score: emptyScore(), rig: w && this.frappe ? new StrikeRig(w) : null, move: null };
    };
    // the camera stays on the -z side (gate side in the arena, open side at the écurie): screen right is world -x,
    // so the player starts at +x and is seen on the left, the opponent on the right
    this.me = mk(0x6b3f25, look, 3, R.stamina.max, R.stamina.regen, opts.attrs ?? AVERAGE);
    this.ai = mk(0x3b2216, { ngembColor: this.style.ngemb, ngembPattern: this.mode === 'entrainement' ? 'bordure' : 'uni', accessories: [] }, -3, this.style.staminaMax, this.style.staminaRegen, who?.attrs ?? this.standStyle.attrs);
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
    this.ui = this.buildUi();
    if (this.spectate) return;                                 // watched from the stands: no keys, no controls
    addEventListener('keydown', this.onKey); addEventListener('keyup', this.onKey);
    input.enabled = true; input.takeAction();
  }

  // ---------------------------------------------------------------- UI
  private buildUi(): HTMLDivElement {
    const d = document.createElement('div'); d.className = this.frappe ? 'duel-ui frappe' : 'duel-ui';
    const title = { entrainement: 'Entraînement · Coach Ablaye', amical: 'Combat amical', classe: 'Combat classé' }[this.mode];
    const sub = this.mode === 'entrainement' ? 'Partenaire : Babacar · non classé' : this.identity ? `${this.identity} · niveau ${this.level}` : `${this.style.name} · ${this.style.label} · niveau ${this.level}`;
    const keys = document.body.classList.contains('touch') ? '' : this.frappe
      ? ' · J frappe · K grosse frappe · E/Espace saisir · G/Maj garde · X reculer/dégager · Échap abandonner'
      : ' · E/Espace saisir · G/Maj garde · X dégager · Échap abandonner';
    const states = (who: string) => this.frappe ? `<i class="bal"><b data-k="${who}bal"></b></i><i class="cmp"><b data-k="${who}cmp"></b></i>` : '';
    d.innerHTML = `
      <div class="duel-top">
        <div class="duel-head"><b></b><small></small></div>
        <div class="duel-timer" data-k="timer"></div>
        <button class="duel-ab" data-k="abandon">Abandonner</button>
      </div>
      <div class="duel-bars"><div data-k="mebar"><span>Toi <em data-k="meopen"></em></span><i><b data-k="me"></b></i>${states('me')}</div><div data-k="aibar"><span>${this.style.name} <em data-k="aiopen"></em></span><i><b data-k="ai"></b></i>${states('ai')}</div></div>
      ${this.frappe ? '<div class="duel-legend"><span class="e">Endurance</span><span class="b">Équilibre</span><span class="c">Sang-froid</span></div>' : ''}
      <div class="duel-note">${RULES[this.discipline].label} · ${RULES_STATUS}${keys}</div>
      <div class="duel-step" data-k="step" hidden></div>
      <div class="duel-msg" data-k="msg">Arbitre : prêts ?</div>
      <div class="duel-clinch" data-k="clinch" hidden><i><b data-k="tug"></b></i><em data-k="cl"></em></div>
      <div class="duel-btns${this.frappe ? ' frappe' : ''}"><button data-k="break">${this.frappe ? 'Reculer' : 'Dégager'}</button><button data-k="guard">Garde</button><button data-k="grab">Saisir</button>${this.frappe ? '<button data-k="quick">Frappe</button><button data-k="big">Grosse<br>frappe</button>' : ''}</div>
      <div class="duel-confirm" data-k="confirm" hidden><div><b>Abandonner le combat ?</b><p>Compté comme un abandon, à part des défaites : ce n’est pas une chute, et il n’y a aucune récompense.</p><button data-k="yes">Abandonner</button><button data-k="no">Continuer le combat</button></div></div>
      <div class="duel-recap" data-k="recap" hidden></div>`;
    (d.querySelector('.duel-head b') as HTMLElement).textContent = title;
    (d.querySelector('.duel-head small') as HTMLElement).textContent = sub;
    const st = document.createElement('style');
    st.textContent = `.duel-ui{position:fixed;inset:0;pointer-events:none;z-index:30;font:600 14px system-ui,sans-serif;color:#fff}
      body.induel #stats,body.induel #place,body.induel #sceneTag,body.induel #menuBtn,body.induel #presenceBtn,body.induel #goal{display:none!important}
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
    const hold = (on: boolean) => (e: Event) => { e.preventDefault(); this.guardHeld = on; guard.classList.toggle('on', on); };
    guard.addEventListener('pointerdown', hold(true)); guard.addEventListener('pointerup', hold(false)); guard.addEventListener('pointerleave', hold(false)); guard.addEventListener('pointercancel', hold(false));
    const tap = (b: HTMLButtonElement, f: () => void) => {
      b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('on'); f(); });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => b.classList.remove('on'));
    };
    tap(grab, () => this.grabTaps++); tap(brk, () => this.breakPresses++);
    const quick = d.querySelector<HTMLButtonElement>('[data-k=quick]'), big = d.querySelector<HTMLButtonElement>('[data-k=big]');
    if (quick) tap(quick, () => this.quickPresses++);
    if (big) tap(big, () => this.bigPresses++);
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
    const m = this.q('msg'); if (m.textContent !== text) m.textContent = text;
  }
  private draw() {
    const me = this.me, ai = this.ai;
    const bar = (k: string, f: Fighter) => { const b = this.q(k); b.style.width = `${(100 * f.stamina) / f.max}%`; b.classList.toggle('low', f.stamina < R.stamina.grabCost); };
    bar('me', me); bar('ai', ai);
    if (this.frappe) {
      const pm = this.phase === 'clinch' ? posture(me.balance) : 'stable';
      this.ui.classList.toggle('slip', pm === 'glisse'); this.ui.classList.toggle('falling', pm === 'chute');
    }
    if (this.frappe) for (const [k, f] of [['me', me], ['ai', ai]] as const) {
      const b = this.q(k + 'bal'); b.style.width = `${Math.round(f.balance)}%`; b.classList.toggle('low', f.balance < 30);
      b.classList.toggle('warn', this.phase === 'clinch' && f.balance < 45);
      this.q(k + 'cmp').style.width = `${Math.round(f.composure)}%`;
    }
    this.q('meopen').textContent = me.stagger > 0 ? '· tu vacilles' : me.open > 0 ? '· exposé' : '';
    this.q('aiopen').textContent = ai.stagger > 0 ? '· VACILLE' : ai.open > 0 ? '· OUVERT' : '';
    const tl = this.timeLeft;
    this.q('timer').textContent = tl === Infinity ? '—' : `${Math.floor(Math.max(0, Math.ceil(tl)) / 60)}:${String(Math.max(0, Math.ceil(tl)) % 60).padStart(2, '0')}`;
    const step = this.q('step');
    if (this.mode === 'entrainement' && this.step < TUTORIAL.length && this.phase !== 'result') {
      const s = TUTORIAL[this.step];
      step.hidden = false;
      const html = `<b>${this.step + 1}/${TUTORIAL.length} · ${s.text}</b><small>${s.how}</small>`;
      if (step.innerHTML !== html) step.innerHTML = html;
    } else step.hidden = true;
    const cl = this.q('clinch'), brk = this.q('break');
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

  // ---------------------------------------------------------------- abandon and recap
  private confirmOpen() { return !this.q('confirm').hidden; }
  askAbandon(open: boolean) {
    if (open && !(this.phase === 'intro' || this.phase === 'fight' || this.phase === 'clinch')) return;
    if (this.done) return;
    this.q('confirm').hidden = !open; this.paused = open;
    if (open) { this.guardHeld = false; this.q<HTMLButtonElement>('no').focus(); }
  }
  /** Confirmed abandon: recorded as an abandon (no winner, no reward), never as a defeat by projection. */
  abandon() {
    if (!(this.phase === 'intro' || this.phase === 'fight' || this.phase === 'clinch') || this.done) return;
    this.q('confirm').hidden = true; this.paused = false;
    this.end('abandon', null);
  }

  private end(outcome: BoutOutcome, winner: Side | null) {
    this.outcome = outcome; this.winner = winner;
    const seconds = this.mode === 'entrainement' ? this.t : R.roundSeconds - Math.max(0, this.timeLeft);
    this.result = {
      mode: this.mode, outcome, winner, seconds,
      score: { player: { ...this.me.score }, opponent: { ...this.ai.score } },
      stamina: { player: Math.round(this.me.stamina), opponent: Math.round(this.ai.stamina) },
      rewards: boutRewards({ mode: this.mode, outcome, winner }),
    };
    if (outcome === 'projection' || outcome === 'decision' || outcome === 'egalite') {
      this.phase = 'fall'; this.phaseT = 0;
      if (this.frappe && winner && this.official) {
        const w = winner === 'player' ? this.me : this.ai, l = winner === 'player' ? this.ai : this.me;
        // the referee comes up beside the winner, on the far side from the camera so he stays in view
        const side = new THREE.Vector3(-(l.pos.z - w.pos.z), 0, l.pos.x - w.pos.x).normalize();
        if (side.z < 0) side.multiplyScalar(-1);
        this.fallFx = { loser: l, winner: w, refFrom: this.official.group.position.clone(), refTo: w.pos.clone().addScaledVector(side, 1.1).setY(this.official.group.position.y), cheered: false };
        if (outcome === 'projection') { w.clip = 'Stance'; l.clip = 'Fall_Back'; }
      }
      if (this.frappe) this.onMoment?.('fall', winner);
    } else this.showRecap();
  }

  private showRecap() {
    this.phase = 'result'; this.phaseT = 0; this.msg('', 0); this.msgHold = 0; this.q('msg').textContent = '';
    const r = this.result!;
    const title = r.outcome === 'abandon' ? 'Abandon' : r.outcome === 'entrainement' ? 'Entraînement terminé' : r.winner === 'player' ? 'Victoire' : r.winner === 'opponent' ? 'Défaite' : 'Match nul';
    const mode = { entrainement: 'Entraînement (non classé)', amical: 'Combat amical (non classé)', classe: 'Combat classé' }[r.mode];
    const opp = r.mode === 'entrainement' ? 'Babacar (partenaire)' : this.identity ?? `${this.style.name} · ${this.style.label} · niveau ${this.level}`;
    const row = (l: string, a: number | string, b: number | string) => `<tr><td>${l}</td><td>${a}</td><td>${b}</td></tr>`;
    const box = this.q('recap');
    box.innerHTML = `<div><h2></h2><p data-r="how"></p>
      <table><tr><th>${mode}</th><th>Toi</th><th data-r="opp"></th></tr>
      ${row('Endurance restante', r.stamina.player, r.stamina.opponent)}
      ${row('Parades réussies', r.score.player.guards, r.score.opponent.guards)}
      ${row('Saisies engagées', r.score.player.grabs, r.score.opponent.grabs)}
      ${row('Dégagements', r.score.player.breaks, r.score.opponent.breaks)}
      ${this.frappe ? row('Frappes touchées', r.score.player.hits ?? 0, r.score.opponent.hits ?? 0) + row('Adversaire vacille', r.score.player.staggers ?? 0, r.score.opponent.staggers ?? 0) : ''}
      ${r.outcome === 'decision' || r.outcome === 'egalite' ? row('Points (arbitre)', points(r.score.player, RULES[this.discipline]), points(r.score.opponent, RULES[this.discipline])) : ''}
      </table>
      <b>Récompenses</b><ul>${r.rewards.lines.map(() => '<li></li>').join('')}</ul>
      <small>${RULES[this.discipline].label} · ${RULES_STATUS}. Durée : ${Math.round(r.seconds)} s.</small>
      <button data-k="continue">Continuer</button></div>`;
    box.querySelector('h2')!.textContent = title;
    box.querySelector('[data-r=how]')!.textContent = `${OUTCOME_TEXT[r.outcome]} · ${opp}`;
    box.querySelector('[data-r=opp]')!.textContent = r.mode === 'entrainement' ? 'Babacar' : this.style.name;
    box.querySelectorAll('li').forEach((li, i) => (li.textContent = r.rewards.lines[i]));
    box.querySelector('[data-k=continue]')!.addEventListener('click', () => this.finish());
    box.hidden = false;
  }
  /** Close the recap (also after a delay, so an idle player is never stuck). */
  finish() { if (this.phase === 'result') this.done = true; }

  // ---------------------------------------------------------------- debug/test hooks
  pressGrab() { this.grabTaps++; }
  /** Screen axes of the duel's camera on the ground (where `input.move()` x and y point): right and forward. */
  axes() { return { right: { x: this.camRight.x, z: this.camRight.z }, fwd: { x: this.camFwd.x, z: this.camFwd.z } }; }
  pressBreak() { this.breakPresses++; }
  /** Avec frappe, in the empoignade: push, pull or pivot (same as Saisir, Garde, Frappe). */
  pressMove(kind: ClinchMove) { this.moveQueued = kind; }
  /** Avec frappe: a quick or a big strike (same as the buttons). */
  pressStrike(kind: StrikeKind) { if (kind === 'big') this.bigPresses++; else this.quickPresses++; }
  /** Checks only: set a wrestler's balance, composure or endurance (to reach a state without a long bout). */
  debugSet(side: Side, v: { balance?: number; composure?: number; stamina?: number; grip?: number }) {
    const f = side === 'player' ? this.me : this.ai;
    if (v.grip !== undefined) this.grip = side === 'player' ? v.grip : -v.grip;
    if (v.balance !== undefined) f.balance = v.balance;
    if (v.composure !== undefined) f.composure = v.composure;
    if (v.stamina !== undefined) f.stamina = v.stamina;
  }
  setGuard(on: boolean) { this.guardHeld = on; }
  /** World points on both wrestlers (feet, waist, head) for layout checks. */
  fighterPoints(): [number, number, number][] { return [this.me, this.ai].flatMap(f => [0.1, 1, 1.8].map(h => [f.pos.x, f.pos.y + h, f.pos.z] as [number, number, number])); }
  info() {
    const c = this.phase === 'clinch' ? this.clinchState() : null;
    return {
      mode: this.mode, phase: this.phase, winner: this.winner, outcome: this.outcome, style: this.style.id, opponent: this.style.name, level: this.level,
      timeLeft: this.timeLeft === Infinity ? null : Math.round(this.timeLeft * 10) / 10, paused: this.paused,
      step: this.mode === 'entrainement' ? (TUTORIAL[this.step]?.id ?? 'done') : null,
      stamina: { player: Math.round(this.me.stamina), opponent: Math.round(this.ai.stamina) },
      open: this.me.open > 0 ? 'player' : this.ai.open > 0 ? 'opponent' : null,
      windup: this.ai.windup > 0, dist: Math.round(this.me.pos.distanceTo(this.ai.pos) * 100) / 100,
      clinch: c ? { by: c.by, losing: c.losing, breakWindow: c.breakWindow, share: Math.round(c.share * 100) / 100,
        ...(this.frappe ? { grip: Math.round(this.grip), entry: this.entry, move: { player: this.me.move?.kind ?? null, opponent: this.ai.move?.kind ?? null }, last: this.lastExchange,
          posture: { player: posture(this.me.balance), opponent: posture(this.ai.balance) },
          attempt: this.attempt ? { by: this.attempt.by === this.me ? 'player' : 'opponent', t: Math.round(this.attempt.t * 100) / 100, counter: this.attempt.counter } : null } : {}) } : null,
      ...(this.frappe ? { lastThrow: this.lastThrow } : {}),
      ...(this.phase === 'fall' && this.fallFx && this.official ? { fall: {
        t: Math.round(this.phaseT * 100) / 100, slow: this.outcome === 'projection' && this.phaseT < 0.9, cheered: this.fallFx.cheered,
        referee: Math.round(this.official.group.position.distanceTo(this.fallFx.winner.pos) * 100) / 100,
        refereeFrom: Math.round(this.fallFx.refFrom.distanceTo(this.fallFx.winner.pos) * 100) / 100,
        arm: this.phaseT > 1.8,
      } } : {}),
      score: { player: { ...this.me.score }, opponent: { ...this.ai.score } },
      discipline: this.discipline, identity: this.identity,
      ...(this.frappe ? {
        balance: { player: Math.round(this.me.balance), opponent: Math.round(this.ai.balance) },
        composure: { player: Math.round(this.me.composure), opponent: Math.round(this.ai.composure) },
        guard: { player: this.me.guard, opponent: this.ai.guard },
        strike: { player: this.me.strike?.kind ?? null, opponent: this.ai.strike?.kind ?? null },
        stagger: this.me.stagger > 0 ? 'player' : this.ai.stagger > 0 ? 'opponent' : null,
        lastStrike: this.lastStrike,
      } : {}),
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
    ai.windup = R.responseWindow * this.style.windup;
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

  update(dt: number): { cam: THREE.Vector3; look: THREE.Vector3 } {
    if (this.paused) { this.grabTaps = 0; this.breakPresses = 0; return this.frame(0); }
    this.t += dt;
    const tPrev = this.phaseT; this.phaseT += dt; this.msgHold = Math.max(0, this.msgHold - dt);
    const me = this.me, ai = this.ai;
    const taps = this.grabTaps; this.grabTaps = 0;
    const breaks = this.breakPresses; this.breakPresses = 0;
    const quick = this.quickPresses, big = this.bigPresses; this.quickPresses = 0; this.bigPresses = 0;
    const guardPress = this.guardHeld && !this.guardWas; this.guardWas = this.guardHeld;
    for (const f of [me, ai]) { f.busy = Math.max(0, f.busy - dt); if (!this.frappe) f.open = Math.max(0, f.open - dt); }
    const step = this.stepId();

    if (this.phase === 'intro') {
      // referee check, kept to plain words (no invented ritual wording)
      // avec frappe, the opponent is introduced first: who he is, in one line
      const lead = this.identity ? 1.3 : 0;
      this.msg(this.phaseT < lead ? `Face à toi : ${this.identity}` : this.phaseT < lead + 1.4 ? (this.mode === 'entrainement' ? 'Coach Ablaye : prêts ?' : 'Arbitre : prêts ?') : 'Làmb !');
      me.clip = ai.clip = 'Prep';
      if (this.phaseT > lead + 2.2) { this.phase = 'fight'; this.phaseT = 0; this.msg(''); }
    } else if (this.phase === 'fight' && this.frappe) {
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
      const name = this.style.name;
      this.msg(t < 1.1 ? (this.outcome === 'projection' ? (this.winner === 'player' ? 'Projection ! Il est au sol' : 'Tu es au sol…') : 'Temps !')
        : this.winner === 'player' ? 'L’arbitre lève ton bras : victoire !' : `L’arbitre lève le bras de ${name}`);
      if (t > 3.4) { this.onMoment?.('result', this.winner); this.showRecap(); }
    } else if (this.phase === 'fall') {
      if (this.outcome === 'projection') this.msg(this.winner === 'player' ? 'Il est à terre !' : 'Tu es à terre…');
      else this.msg(this.outcome === 'decision' ? `Temps ! Décision : ${this.winner === 'player' ? 'pour toi' : 'pour ' + this.style.name}` : 'Temps ! Égalité');
      if (this.phaseT > 2.4) { if (this.frappe) this.onMoment?.('result', this.winner); this.showRecap(); }
    } else if (this.phase === 'result') {
      if (this.phaseT > 10) this.done = true;
    }
    // the fall's first moment plays slowly
    return this.frame(this.phase === 'fall' && this.fallFx && this.outcome === 'projection' && this.phaseT < 0.9 ? dt * 0.3 : dt);
  }

  // ---------------------------------------------------------------- avec frappe: the stand-up exchange (Làmb 2.0)
  private fightFrappe(dt: number, taps: number, breaks: number, quick: number, big: number) {
    const me = this.me, ai = this.ai;
    if (this.timeLeft !== Infinity) this.timeLeft -= dt;
    const m = this.input.move();
    me.guard = this.guardHeld && !me.strike && me.stagger <= 0 && me.open <= 0 && me.dodge <= 0 && me.busy <= 0;
    // feet: relative to the camera; slow in guard, slower while striking, none while staggering
    if (me.busy <= 0 && me.stagger <= 0) {
      const sp = 2.6 * (me.guard ? STAND.guardSpeed : me.strike ? 0.4 : 1);
      me.pos.addScaledVector(this.camRight, m.x * sp * dt).addScaledVector(this.camFwd, m.y * sp * dt);
    }
    for (const [f, o] of [[me, ai], [ai, me]] as const) if (f.dodge > 0) {
      const away = f.pos.clone().sub(o.pos).setY(0).normalize();
      f.pos.addScaledVector(away, 4.2 * Math.min(dt, f.dodge));
    }
    let d = ai.pos.distanceTo(me.pos);

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
    if (this.aiReact && (this.aiReact.at -= dt) <= 0) {
      const what = this.aiReact.what; this.aiReact = null;
      if (what === 'guard' && free(ai) && ai.open <= 0) this.aiGuardHold = 0.45;
      else if (what === 'back' && free(ai)) { ai.dodge = 0.3; this.aiGuardHold = 0; }
      else if (what === 'counter') { this.aiGuardHold = 0; startStrike(ai, 'quick'); }
    }
    // the opponent's decisions
    this.aiThink -= dt;
    if (this.aiThink <= 0 && free(ai) && ai.windup <= 0 && ai.open <= 0 && ai.busy <= 0) {
      const [a0, b0] = this.style.think; this.aiThink = a0 + this.rand() * (b0 - a0);
      const dec = decide({ me: ai, them: me, dist: d, grabRange: R.grabRange }, this.standStyle, this.factor, this.rand);
      if (dec.grab && ai.stamina >= R.stamina.grabCost) this.aiGrab();
      else if (dec.strike) {
        this.aiGuardHold = 0; ai.guard = false;
        if (startStrike(ai, dec.strike) && dec.strike === 'big') this.msg('Grosse frappe ! Garde, recule ou frappe vite', 0.6);
      } else {
        this.aiGuardHold = dec.guard ? this.aiThink : 0;
        // wrestling still matters standing: it may go for the grab in range
        if (!dec.guard && d < R.grabRange && ai.stamina >= R.stamina.grabCost + 6 && this.rand() < Math.min(0.9, this.style.grabChance * 0.6 * this.factor)) this.aiGrab();
      }
    }
    if (this.phase !== 'fight') return;
    this.aiGuardHold = Math.max(0, this.aiGuardHold - dt);
    ai.guard = this.aiGuardHold > 0 && !ai.strike && ai.stagger <= 0 && ai.open <= 0 && ai.windup <= 0;
    if (ai.busy <= 0 && ai.windup <= 0 && ai.stagger <= 0 && ai.dodge <= 0) {
      const range = this.standStyle.range, want = d > range + 0.15 ? 1 : d < range - 0.35 ? -0.6 : 0;
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
    if (this.timeLeft !== Infinity) this.timeLeft -= dt;
    me.clip = ai.clip = 'Grab';
    // the player: Saisir pushes, Garde pulls, Frappe pivots, Reculer breaks free
    if (breaks > 0) {
      if (tryBreak(me, this.grip)) { me.score.breaks++; this.separate(ai, 0.5); this.msg('Dégagé !', 1.0); return; }
      this.msg(this.grip < CLINCH.breakFloor ? 'Sa prise est trop forte pour casser' : me.move ? 'Pas au milieu d’un mouvement' : 'Plus assez d’endurance pour casser', 0.8);
    }
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
    if (this.aiThink <= 0) {
      const [a0, b0] = this.clinchStyle.think; this.aiThink = a0 + this.rand() * (b0 - a0);
      if (wantsThrow(ai, me, -this.grip, this.clinchStyle, this.factor, this.rand)) { this.startThrow(ai); return; }
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
    if (this.phaseT > CLINCH.maxSeconds) { this.separate(null, 0); this.msg('L’arbitre sépare les lutteurs', 1.2); return; }
    // step 4: the player feels the position going — words, the screen's edge, a low note when it gets serious
    const pm = posture(me.balance), po = posture(ai.balance);
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
    const aiCounters = by === me && wantsCounter(ai, this.clinchStyle, this.factor, ai.composure, this.rand());
    this.attempt = { by, t: 0, counter: false, counterAt: aiCounters ? 0.2 + 0.15 * (1 - ai.composure / 100) : Infinity };
    this.msg(by === me ? 'Tu tentes la projection…' : 'Il tente la projection ! Contre !', THROW.windup);
  }

  /** The throw sets up, may be countered, then lands: he goes down, the thrower goes down, or it fails. */
  private throwStep(dt: number, counterPress: number) {
    const me = this.me, ai = this.ai, at = this.attempt!, att = at.by, def = att === me ? ai : me;
    const gAtt = att === me ? this.grip : -this.grip;
    for (const f of [me, ai]) holdTick(f, dt, f === me ? this.grip : -this.grip);
    at.t += dt;
    // the counter: the player presses Contrer while it sets up; the opponent after its reaction time
    if (!at.counter && def === me && counterPress > 0) {
      if (me.stamina >= THROW.counterCost) { me.stamina -= THROW.counterCost; at.counter = true; this.msg('Contre !', 0.5); }
      else this.msg('Plus assez d’endurance pour contrer', 0.6);
    }
    if (!at.counter && def === ai && at.t >= at.counterAt && ai.stamina >= THROW.counterCost) { ai.stamina -= THROW.counterCost; at.counter = true; }
    if (at.t < THROW.windup) return;
    this.attempt = null;
    const by: Side = att === me ? 'player' : 'opponent';
    if (at.counter) {
      const c = counterThrow(def, att, -gAtt);
      this.lastThrow = { by, result: c.result === 'reverse' ? 'countered' : 'blocked' };
      if (c.result === 'reverse') { this.msg(def === me ? 'Contre ! Il part au sol !' : 'Il contre ta projection…', 1.2); this.resolveClinch(def === me); return; }
      att.recover = 0.4;
      this.msg(def === me ? 'Projection bloquée' : 'Il bloque ta projection', 0.9);
      return;
    }
    const t = throwLands(att, def, gAtt);
    this.lastThrow = { by, result: t.result };
    if (t.result === 'fall') { this.msg(att === me ? 'Projection !' : 'Il te projette…', 1.2); this.resolveClinch(att === me); return; }
    this.grip = Math.max(-100, Math.min(100, this.grip + (att === me ? t.grip : -t.grip)));
    att.recover = 0.35;
    this.msg(att === me ? 'Projection ratée : il tenait bon, tu es déséquilibré' : 'Sa projection rate : il est déséquilibré !', 1.0);
  }

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
    // « Tu tires sur sa poussée : il glisse ! » — 2nd person is the 3rd plus « s » for these three verbs
    const NOUN: Record<ClinchMove, [string, string]> = { push: ['sa poussée', 'ta poussée'], pull: ['sa traction', 'ta traction'], pivot: ['son pivot', 'ton pivot'] };
    let text = '';
    if (e.result === 'counter') {
      const won = winner === 'player', m = e.winner === 'a' ? e.move : e.against!, lost = e.winner === 'a' ? e.against! : e.move;
      text = won ? `Contre ! Tu ${MOVES[m].doing}s sur ${NOUN[lost][0]} : il glisse !` : `Il ${MOVES[m].doing} sur ${NOUN[lost][1]} : tu glisses !`;
      crowdCheer(0.8, 0.07);
    } else if (e.result === 'clash') text = e.move === 'pivot' ? 'Vous tournez ensemble' : winner === 'player' ? 'Tu l’emportes en force' : winner === 'opponent' ? 'Il l’emporte en force' : 'Forces égales';
    else if (e.result === 'drive') text = mine ? `Tu ${MOVES[e.move].doing}s` : `Il ${MOVES[e.move].doing}`;
    if (text) this.msg(text, e.result === 'counter' ? 0.9 : 0.5);
  }

  /** The player starts a strike; the opponent may see it coming. */
  private playerStrike(kind: StrikeKind) {
    const me = this.me, ai = this.ai;
    if (me.open > 0) { this.msg('Tu es ouvert : recule ou attends', 0.7); return; }
    if (!free(me) || me.busy > 0) return;
    const wasGuard = me.guard; me.guard = false;
    if (!startStrike(me, kind)) { me.guard = wasGuard; if (me.stamina < STRIKES[kind].cost) this.msg('Plus d’endurance', 0.8); return; }
    const what = react(kind, ai, this.standStyle, this.factor, this.rand());
    this.aiReact = what === 'none' ? null : { at: reactDelay(kind, ai), what };
  }

  /** A strike reaches its landing moment: hit, stagger, guarded or missed; messages, sounds, the crowd. */
  private strikeLands(a: Fighter, d: Fighter, dist: number) {
    const l = land(a, d, dist), mine = a === this.me, name = this.style.name;
    this.lastStrike = { by: mine ? 'player' : 'opponent', kind: l.kind, result: l.result };
    strikeSound(l.kind, l.result);
    if (l.result === 'hit' || l.result === 'stagger') a.score.hits = (a.score.hits ?? 0) + 1;
    if (l.result === 'stagger') { a.score.staggers = (a.score.staggers ?? 0) + 1; crowdCheer(1.6, 0.14); }
    else if (l.result === 'hit' && l.kind === 'big') crowdCheer(0.9, 0.08);
    if (l.result === 'guarded') d.score.guards++;
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

  private resolveClinch(playerWins: boolean) {
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
    (playerWins ? ai : me).clip = 'Fall_Back';
    (playerWins ? me : ai).clip = 'Celebrate';
    crowdCheer(2.5, 0.2);
    this.end('projection', playerWins ? 'player' : 'opponent');
  }

  private timeUp() {
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
    if (this.frappe) this.aiThink = 0.5;
    this.msg(text, 0.9);
  }
  /** End an empoignade without a fall: push the wrestlers apart; `exposed` (if any) is left open briefly. */
  private separate(exposed: Fighter | null, open: number) {
    const me = this.me, ai = this.ai;
    this.phase = 'fight'; this.phaseT = 0; this.clinchBy = null; me.move = ai.move = null; this.attempt = null;
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
      if (off.length() > this.ring) f.pos.copy(this.o).addScaledVector(off.normalize(), this.ring).setY(0.1);
    }
    const gap = ai.pos.clone().sub(me.pos).setY(0), dist = gap.length();
    if (dist < 0.75 && this.phase === 'fight') { const push = gap.normalize().multiplyScalar((0.75 - dist) / 2); ai.pos.add(push); me.pos.sub(push); }
    me.facing = Math.atan2(ai.pos.x - me.pos.x, ai.pos.z - me.pos.z);
    ai.facing = Math.atan2(me.pos.x - ai.pos.x, me.pos.z - ai.pos.z);
    for (const f of [me, ai]) if (f.w) {
      f.w.group.position.copy(f.pos); f.w.group.rotation.y = f.facing; f.w.hold = f.clip; f.w.animate(dt, 0);
      if (f.rig && this.phase === 'fight') f.rig.pose(f, dt);
      else if (f.rig && this.phase === 'clinch' && this.frappe) {
        const at = this.attempt;
        if (at) f.rig.hold(at.by === f ? 'push' : 'pull', Math.min(1, at.t / 0.25), at.by === f ? f.balance : Math.min(f.balance, 30));
        else f.rig.hold(f.move?.kind ?? null, f.move ? Math.min(1, f.move.t / 0.3) : 0, f.balance);
      }
    }
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
      } else {
        this.official.group.rotation.y = Math.atan2(mid0.x - this.official.group.position.x, mid0.z - this.official.group.position.z);
        this.official.animate(dt, 0);
      }
    }
    for (const h of this.crowd) h.animate(dt, 0);
    this.draw();

    // side camera on the pair, always from the -z side; farther in portrait so both wrestlers fit
    const mid = me.pos.clone().add(ai.pos).multiplyScalar(0.5);
    const side = new THREE.Vector3(-(ai.pos.z - me.pos.z), 0, ai.pos.x - me.pos.x).normalize();
    if (!Number.isFinite(side.x) || side.lengthSq() < 0.5) side.set(0, 0, -1);
    if (side.z > 0) side.multiplyScalar(-1);
    const portrait = innerWidth < innerHeight;
    const cam = mid.clone().addScaledVector(side, (portrait ? 8.5 : 6.5) + dist * (portrait ? 1.1 : 0.6)).setY(portrait ? 3.4 : 3.0);
    if (this.phase === 'fall' && this.fallFx && this.outcome === 'projection' && this.phaseT < 1.2) {
      // close and low on the wrestler going down, then back out for the referee
      const down = this.fallFx.loser.pos, c = down.clone().addScaledVector(side, portrait ? 5 : 3.6).setY(1.5);
      this.camFwd.copy(side).multiplyScalar(-1).setY(0).normalize(); this.camRight.set(-this.camFwd.z, 0, this.camFwd.x);
      return { cam: c, look: down.clone().setY(0.6) };
    }
    // camera-relative movement axes
    this.camFwd.copy(side).multiplyScalar(-1).setY(0).normalize();
    this.camRight.set(-this.camFwd.z, 0, this.camFwd.x);           // forward × up
    return { cam, look: mid.clone().setY(portrait ? 0.9 : 1.1) };
  }

  dispose() {
    this.drums.stop();
    removeEventListener('keydown', this.onKey); removeEventListener('keyup', this.onKey);
    this.ui.remove(); document.body.classList.remove('induel');
    for (const f of [this.me, this.ai]) f.w?.dispose();
    this.official?.dispose();
    for (const h of this.crowd) h.dispose();
    this.group.removeFromParent();
  }
}
