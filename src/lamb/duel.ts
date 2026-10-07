import * as THREE from 'three';
import { Wrestler, Humanoid, randomLook, wrestlerReady, type Clip } from '../actors/humanoid';
import type { Input } from '../core/input';
import type { WrestlerLook } from '../core/types';
import { rng } from '../core/rng';
import { Percussion, crowdCheer } from './audio';

/**
 * Controlled làmb bout against a local opponent (no network).
 * PROVISIONAL RULES, to be reviewed by a wrestling practitioner: wrestling without strikes (Habib chose "lutte avec
 * frappe", but strikes only ship after the written rules are reviewed). A bout is won by throwing the opponent to the
 * ground. Loop: move in the ring, guard (blocks a grab, slows endurance recovery), grab attempt (costs endurance, needs
 * to be close), the opponent's response (guard, counter, grab of its own), an empoignade decided by effort and
 * endurance, a fall, and a readable result.
 */
export type DuelPhase = 'intro' | 'fight' | 'clinch' | 'fall' | 'result';
interface Fighter { w: Wrestler | null; pos: THREE.Vector3; facing: number; stamina: number; guard: boolean; busy: number; grabT: number; effort: number; clip: Clip }

const RING = 7.6;           // the bout stays inside the sandbag ring (radius 9)
const GRAB_RANGE = 1.5;
const GRAB_COST = 22;

export class LambDuel {
  readonly kind = 'duel' as const;
  readonly group = new THREE.Group();
  t = 0;
  snap = true;
  done = false;
  onDone?: () => void;
  phase: DuelPhase = 'intro';
  winner: 'player' | 'opponent' | null = null;
  private me: Fighter;
  private ai: Fighter;
  private o: THREE.Vector3;
  private phaseT = 0;
  private aiThink = 1.2;
  private rand = rng(Date.now() & 0xffff);
  private crowd: Humanoid[] = [];
  private drums = new Percussion();
  private ui: HTMLDivElement;
  private guardHeld = false;
  /** Taps of the Saisir button since the last frame (each tap counts in an empoignade). */
  private grabTaps = 0;
  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'KeyG' || e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyF') this.guardHeld = e.type === 'keydown';
  };

  constructor(origin: { x: number; z: number }, look: WrestlerLook, private input: Input, crowdSize: number, readonly difficulty = 1) {
    this.o = new THREE.Vector3(origin.x, 0.1, origin.z);
    const mk = (skin: number, l: WrestlerLook, x: number, facing: number): Fighter => {
      const w = wrestlerReady() ? new Wrestler(skin) : null;
      if (w) { w.setLook(l, l.ngembPattern === 'bordure' ? 'B' : 'A'); this.group.add(w.group); }
      return { w, pos: new THREE.Vector3(origin.x + x, 0.1, origin.z), facing, stamina: 100, guard: false, busy: 0, grabT: 0, effort: 0, clip: 'Prep' };
    };
    this.me = mk(0x6b3f25, look, -3, Math.PI / 2);
    this.ai = mk(0x3b2216, { ngembColor: 'rouge', ngembPattern: 'uni', accessories: [] }, 3, -Math.PI / 2);
    // spectators on the stands (the arena's three tiers, radius 17.9 + 1.3 k)
    const r = rng(11);
    if (wrestlerReady()) for (let k = 0; k < crowdSize; k++) {
      const a = (k / crowdSize) * Math.PI * 2 + 0.2;
      if (Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 0.35) continue;
      const tier = k % 3, rr = 17.9 + tier * 1.3, y = 0.1 + 0.55 * (tier + 1);
      const h = new Humanoid(randomLook(r)); h.hold = k % 3 ? 'Celebrate' : 'Idle';
      h.group.position.set(origin.x + Math.sin(a) * rr, y, origin.z + Math.cos(a) * rr); h.group.rotation.y = a + Math.PI;
      this.group.add(h.group); this.crowd.push(h);
    }
    this.drums.start(122);
    addEventListener('keydown', this.onKey); addEventListener('keyup', this.onKey);
    this.ui = this.buildUi();
    input.enabled = true; input.takeAction();
  }

  private buildUi(): HTMLDivElement {
    const d = document.createElement('div'); d.className = 'duel-ui';
    d.innerHTML = `
      <div class="duel-bars"><div><span>Toi</span><i><b data-k="me"></b></i></div><div><span>Adversaire</span><i><b data-k="ai"></b></i></div></div>
      <div class="duel-msg" data-k="msg">Prêt ?</div>
      <div class="duel-btns"><button data-k="guard">Garde</button><button data-k="grab">Saisir</button></div>
      <div class="duel-note">Règles provisoires, sans frappe · à valider par des lutteurs · E/Espace : saisir · G/Maj : garde</div>`;
    const st = document.createElement('style');
    st.textContent = `.duel-ui{position:fixed;inset:0;pointer-events:none;z-index:30;font:600 14px system-ui,sans-serif;color:#fff}
      .duel-bars{position:absolute;top:calc(env(safe-area-inset-top,0px) + 64px);left:50%;transform:translateX(-50%);display:flex;gap:14px;width:min(92vw,520px)}
      .duel-bars>div{flex:1;background:rgba(15,23,42,.72);border-radius:10px;padding:6px 8px}
      .duel-bars i{display:block;height:8px;border-radius:4px;background:rgba(255,255,255,.18);margin-top:4px;overflow:hidden}
      .duel-bars b{display:block;height:100%;width:100%;background:#22c55e;transition:width .1s}
      .duel-msg{position:absolute;top:34%;left:50%;transform:translateX(-50%);font-size:clamp(22px,6vw,40px);font-weight:900;text-shadow:0 2px 8px #000;text-align:center;white-space:nowrap}
      .duel-btns{position:absolute;right:max(16px,env(safe-area-inset-right,0px));bottom:calc(env(safe-area-inset-bottom,0px) + 28px);display:flex;gap:12px;pointer-events:auto}
      .duel-btns button{width:84px;height:84px;border-radius:50%;border:0;font:800 15px system-ui;color:#111;background:#facc15;box-shadow:0 4px 14px rgba(0,0,0,.4);touch-action:none}
      .duel-btns button[data-k=guard]{background:#93c5fd}
      .duel-btns button.on{transform:scale(.94);filter:brightness(.85)}
      .duel-note{position:absolute;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 6px);transform:translateX(-50%);font-size:11px;opacity:.8;text-align:center;width:92vw}`;
    d.appendChild(st);
    const guard = d.querySelector<HTMLButtonElement>('[data-k=guard]')!, grab = d.querySelector<HTMLButtonElement>('[data-k=grab]')!;
    const hold = (on: boolean) => (e: Event) => { e.preventDefault(); this.guardHeld = on; guard.classList.toggle('on', on); };
    guard.addEventListener('pointerdown', hold(true)); guard.addEventListener('pointerup', hold(false)); guard.addEventListener('pointerleave', hold(false)); guard.addEventListener('pointercancel', hold(false));
    grab.addEventListener('pointerdown', e => { e.preventDefault(); this.grabTaps++; });
    document.body.appendChild(d);
    return d;
  }

  private msg(text: string) { const m = this.ui.querySelector<HTMLElement>('[data-k=msg]'); if (m && m.textContent !== text) m.textContent = text; }
  private bars() {
    (this.ui.querySelector('[data-k=me]') as HTMLElement).style.width = `${this.me.stamina}%`;
    (this.ui.querySelector('[data-k=ai]') as HTMLElement).style.width = `${this.ai.stamina}%`;
  }

  /** Debug/test hooks. */
  pressGrab() { this.grabTaps++; }
  setGuard(on: boolean) { this.guardHeld = on; }

  private tryGrab(a: Fighter, b: Fighter): 'none' | 'blocked' | 'clinch' {
    if (a.busy > 0 || a.stamina < GRAB_COST) return 'none';
    a.stamina -= GRAB_COST; a.busy = 0.7; a.clip = 'Grab';
    if (a.pos.distanceTo(b.pos) > GRAB_RANGE) return 'none';
    if (b.guard && b.busy <= 0) { a.busy = 1.0; return 'blocked'; }                // the guard stops the grab and leaves the attacker open
    return 'clinch';
  }

  update(dt: number): { cam: THREE.Vector3; look: THREE.Vector3 } {
    this.t += dt; this.phaseT += dt;
    const me = this.me, ai = this.ai;
    const taps = this.grabTaps + (this.input.takeAction() ? 1 : 0); this.grabTaps = 0;
    const grab = taps > 0;
    for (const f of [me, ai]) { f.busy = Math.max(0, f.busy - dt); }

    if (this.phase === 'intro') {
      this.msg(this.phaseT < 1.2 ? 'Prêt ?' : 'Làmb !');
      me.clip = ai.clip = 'Prep';
      if (this.phaseT > 2) { this.phase = 'fight'; this.phaseT = 0; this.msg(''); }
    } else if (this.phase === 'fight') {
      // player: move relative to the side camera (screen right = +x), guard while held
      const m = this.input.move();
      me.guard = this.guardHeld && me.busy <= 0;
      const sp = me.guard ? 1.4 : 2.6;
      if (me.busy <= 0) me.pos.add(new THREE.Vector3(m.x, 0, -m.y).multiplyScalar(sp * dt));
      // opponent: approach, keep a fighting distance, guard when the player is close, grab when it has the endurance
      const d = ai.pos.distanceTo(me.pos);
      this.aiThink -= dt;
      if (this.aiThink <= 0) {
        this.aiThink = 0.5 + this.rand() * 0.7;
        ai.guard = d < 2.2 && this.rand() < 0.45 * this.difficulty;
        if (d < GRAB_RANGE && ai.stamina > 40 && this.rand() < 0.5 * this.difficulty) {
          const r = this.tryGrab(ai, me);
          if (r === 'blocked') this.msg('Bien gardé !');
          if (r === 'clinch') this.startClinch(ai);
        }
      }
      if (this.phase === 'fight' && ai.busy <= 0) {
        const want = d > 1.25 ? 1 : d < 0.9 ? -0.6 : 0;
        const dir = me.pos.clone().sub(ai.pos).setY(0).normalize();
        ai.pos.addScaledVector(dir, want * (ai.guard ? 1.2 : 2.0) * dt);
      }
      if (this.phase === 'fight' && grab) {
        const r = this.tryGrab(me, ai);
        if (r === 'blocked') this.msg('Bloqué !');
        if (r === 'none' && me.busy > 0 && d > GRAB_RANGE) this.msg('Trop loin');
        if (r === 'none' && me.stamina < GRAB_COST) this.msg('Plus d’endurance');
        if (r === 'clinch') this.startClinch(me);
      }
      for (const f of [me, ai]) {
        f.stamina = Math.min(100, f.stamina + (f.guard ? 7 : 14) * dt);
        if (f.busy <= 0) f.clip = f.guard ? 'Stance' : f === me && Math.hypot(m.x, m.y) > 0.1 ? 'Walk' : 'Stance';
      }
    } else if (this.phase === 'clinch') {
      // empoignade: tap Saisir to push; the opponent pushes back according to its endurance
      me.effort += taps;
      ai.effort += dt * (2.4 + ai.stamina / 60) * this.difficulty;
      me.stamina = Math.max(0, me.stamina - dt * 8); ai.stamina = Math.max(0, ai.stamina - dt * 8);
      me.clip = ai.clip = 'Grab';
      this.msg(`Empoignade ! ${'●'.repeat(Math.min(8, Math.floor(me.effort)))}`);
      if (this.phaseT > 2.2) {
        const mine = me.effort + me.stamina / 40 + (this.clinchBy === me ? 1 : 0);
        const theirs = ai.effort + ai.stamina / 40 + (this.clinchBy === ai ? 1 : 0);
        this.winner = mine >= theirs ? 'player' : 'opponent';
        this.phase = 'fall'; this.phaseT = 0;
        (this.winner === 'player' ? ai : me).clip = 'Fall_Back';
        (this.winner === 'player' ? me : ai).clip = 'Celebrate';
        crowdCheer(2.5, 0.2);
      }
    } else if (this.phase === 'fall') {
      this.msg(this.winner === 'player' ? 'Il est à terre !' : 'Tu es à terre…');
      if (this.phaseT > 2.4) { this.phase = 'result'; this.phaseT = 0; }
    } else if (this.phase === 'result') {
      this.msg(this.winner === 'player' ? 'Victoire !' : 'Défaite');
      if (this.phaseT > 2.4) this.done = true;
    }

    // keep both inside the ring, never on top of each other, facing each other
    for (const f of [me, ai]) {
      const off = f.pos.clone().sub(this.o).setY(0);
      if (off.length() > RING) f.pos.copy(this.o).addScaledVector(off.normalize(), RING).setY(0.1);
    }
    const gap = ai.pos.clone().sub(me.pos).setY(0), dist = gap.length();
    if (dist < 0.75 && this.phase === 'fight') { const push = gap.normalize().multiplyScalar((0.75 - dist) / 2); ai.pos.add(push); me.pos.sub(push); }
    me.facing = Math.atan2(ai.pos.x - me.pos.x, ai.pos.z - me.pos.z);
    ai.facing = Math.atan2(me.pos.x - ai.pos.x, me.pos.z - ai.pos.z);
    for (const f of [me, ai]) if (f.w) { f.w.group.position.copy(f.pos); f.w.group.rotation.y = f.facing; f.w.hold = f.clip; f.w.animate(dt, 0); }
    for (const h of this.crowd) h.animate(dt, 0);
    this.bars();

    // side camera on the pair
    const mid = me.pos.clone().add(ai.pos).multiplyScalar(0.5);
    const side = new THREE.Vector3(-(ai.pos.z - me.pos.z), 0, ai.pos.x - me.pos.x).normalize();
    if (!Number.isFinite(side.x)) side.set(0, 0, 1);
    if (side.z > 0) side.multiplyScalar(-1);                                         // keep the camera on the gate side
    const cam = mid.clone().addScaledVector(side, 6.5 + dist * 0.6).setY(3.0);
    return { cam, look: mid.clone().setY(1.1) };
  }

  private clinchBy: Fighter | null = null;
  private startClinch(by: Fighter) {
    this.phase = 'clinch'; this.phaseT = 0; this.clinchBy = by;
    this.me.effort = 0; this.ai.effort = 0; this.me.guard = this.ai.guard = false;
  }

  dispose() {
    this.drums.stop();
    removeEventListener('keydown', this.onKey); removeEventListener('keyup', this.onKey);
    this.ui.remove();
    for (const f of [this.me, this.ai]) f.w?.dispose();
    for (const h of this.crowd) h.dispose();
    this.group.removeFromParent();
  }
}
