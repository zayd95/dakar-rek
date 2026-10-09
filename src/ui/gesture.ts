import './gesture.css';
import type { Gesture, GestureOption } from '../activity/types';

const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const PAUSE = 0.55;                          // seconds of feedback between rounds

interface Live {
  g: Gesture; done: (score: number) => void; label: string;
  round: number; results: boolean[]; t: number; pause: number;
  /** timing */ zone: [number, number]; cursor: number;
  /** choose */ ask: GestureOption | null; shown: GestureOption[];
  /** sequence */ next: number; errors: number;
}

/**
 * Plays the gestures of the trades (src/activity/gestures.ts) in a compact card above the action area: a moving cursor
 * to stop in the green, the right item for the person asking, steps in the right order. Keys: Space/E/Enter to press,
 * 1–4 to pick; Escape still stops the whole activity (main.ts).
 */
export class GesturePlayer {
  private el: HTMLElement;
  private live: Live | null = null;
  private raf = 0;
  private last = 0;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'gesture';
    root.appendChild(this.el);
    this.el.addEventListener('pointerdown', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-pick],[data-tap]');
      if (!b || !this.live) return;
      e.preventDefault(); e.stopPropagation();
      if (b.dataset.tap !== undefined) this.tap(); else this.pick(b.dataset.pick!);
    });
    addEventListener('keydown', e => {
      const L = this.live; if (!L || e.repeat) return;
      if (L.g.kind === 'timing' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE')) { e.preventDefault(); e.stopPropagation(); this.tap(); }
      const n = /^(Digit|Numpad)([1-9])$/.exec(e.code);
      if (n && L.g.kind !== 'timing') { const o = L.shown[Number(n[2]) - 1]; if (o) { e.preventDefault(); e.stopPropagation(); this.pick(o.id); } }
      if (L.g.kind !== 'timing' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE')) { e.preventDefault(); e.stopPropagation(); }   // never stops the shift by accident
    }, true);                                                  // capture: the game's own action key never sees it
  }

  get active() { return this.live !== null; }

  /** State for the checks (?debug). */
  info() {
    const L = this.live; if (!L) return null;
    return { kind: L.g.kind, label: L.label, round: L.round, rounds: this.rounds(L), results: [...L.results], cursor: L.cursor, zone: L.zone,
      ask: L.ask?.id ?? null, shown: L.shown.map(o => o.id), next: L.g.kind === 'sequence' ? L.g.steps[L.next]?.id ?? null : null, pause: L.pause > 0 };
  }

  play(g: Gesture, label: string, done: (score: number) => void): () => void {
    this.stop();
    const L: Live = { g, done, label, round: 0, results: [], t: 0, pause: 0, zone: [0.4, 0.6], cursor: 0, ask: null, shown: [], next: 0, errors: 0 };
    this.live = L;
    this.startRound();
    this.el.classList.add('on');
    this.last = performance.now();
    const loop = (now: number) => { if (this.live !== L) return; this.raf = requestAnimationFrame(loop); this.tick(Math.min(0.1, (now - this.last) / 1000)); this.last = now; };
    this.raf = requestAnimationFrame(loop);
    return () => { if (this.live === L) this.stop(); };
  }

  private stop() {
    cancelAnimationFrame(this.raf); this.live = null;
    this.el.classList.remove('on'); this.el.innerHTML = '';
  }

  private rounds(L: Live) { return L.g.kind === 'sequence' ? L.g.steps.length : L.g.rounds; }

  private startRound() {
    const L = this.live!; const g = L.g;
    L.t = 0; L.pause = 0;
    if (g.kind === 'timing') {
      const w = Math.max(0.1, (g.zone ?? 0.2) - L.round * 0.015), c = 0.2 + Math.random() * 0.6;
      L.zone = [c - w / 2, c + w / 2];
    } else if (g.kind === 'choose') {
      const pool = g.options.filter(o => o.id !== L.ask?.id);
      L.ask = pool[Math.floor(Math.random() * pool.length)];
      const others = g.options.filter(o => o.id !== L.ask!.id).sort(() => Math.random() - 0.5).slice(0, 3);
      L.shown = [L.ask, ...others].sort(() => Math.random() - 0.5);
    } else if (L.round === 0) L.shown = [...g.steps].sort(() => Math.random() - 0.5);
    this.render();
  }

  private tick(dt: number) {
    const L = this.live!; const g = L.g;
    if (L.pause > 0) { L.pause -= dt; if (L.pause <= 0) this.advance(); return; }
    L.t += dt;
    if (g.kind === 'timing') {
      const f = (g.speed ?? 1) * (0.55 + 0.12 * L.round);
      const p = (L.t * f) % 2; L.cursor = p < 1 ? p : 2 - p;
      const cur = this.el.querySelector<HTMLElement>('.gst-cursor'); if (cur) cur.style.left = `${L.cursor * 100}%`;
    } else if (g.kind === 'choose') {
      const left = 1 - L.t / (g.patience ?? 6);
      const bar = this.el.querySelector<HTMLElement>('.gst-patience i'); if (bar) bar.style.width = `${Math.max(0, left) * 100}%`;
      if (left <= 0) this.result(false, 'Elle est partie…');
    }
  }

  private tap() {
    const L = this.live; if (!L || L.pause > 0 || L.g.kind !== 'timing') return;
    this.result(L.cursor >= L.zone[0] && L.cursor <= L.zone[1], null);
  }

  private pick(id: string) {
    const L = this.live; if (!L || L.pause > 0) return;
    if (L.g.kind === 'choose') this.result(id === L.ask?.id, id === L.ask?.id ? 'Jërëjëf !' : 'Déedéet, pas ça.');
    else if (L.g.kind === 'sequence') {
      const want = L.g.steps[L.next];
      const btn = this.el.querySelector<HTMLElement>(`[data-pick="${CSS.escape(id)}"]`);
      if (id === want.id) {
        L.next++; L.results.push(true); btn?.classList.add('ok'); btn?.setAttribute('disabled', '');
        if (L.next >= L.g.steps.length) this.finish();
        else this.renderDots();
      } else { L.errors++; btn?.classList.remove('ko'); void btn?.offsetWidth; btn?.classList.add('ko'); }
    }
  }

  private result(ok: boolean, say: string | null) {
    const L = this.live!; L.results.push(ok); L.pause = PAUSE;
    this.el.classList.remove('hit', 'miss'); void this.el.offsetWidth; this.el.classList.add(ok ? 'hit' : 'miss');
    const fb = this.el.querySelector<HTMLElement>('.gst-fb'); if (fb) fb.textContent = say ?? (ok ? '✓' : '✗');
    this.renderDots();
  }

  private advance() {
    const L = this.live!; L.round++;
    this.el.classList.remove('hit', 'miss');
    if (L.round >= this.rounds(L)) this.finish(); else this.startRound();
  }

  private finish() {
    const L = this.live!; const g = L.g;
    const score = g.kind === 'sequence' ? Math.max(0, 1 - L.errors / g.steps.length) : L.results.filter(Boolean).length / g.rounds;
    this.stop();
    L.done(score);
  }

  private renderDots() {
    const L = this.live!; const n = this.rounds(L);
    const dots = this.el.querySelector('.gst-dots'); if (!dots) return;
    dots.innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i < L.results.length ? (L.results[i] ? 'ok' : 'ko') : ''}"></i>`).join('');
  }

  private render() {
    const L = this.live!; const g = L.g;
    let body = '';
    if (g.kind === 'timing') {
      body = `<div class="gst-bar" data-tap><div class="gst-zone" style="left:${L.zone[0] * 100}%;width:${(L.zone[1] - L.zone[0]) * 100}%"></div><div class="gst-cursor"></div></div>
        <button class="gst-tap" data-tap>${esc(g.icon ?? '👆')} ${esc(g.verb ?? 'Maintenant')}</button>`;
    } else if (g.kind === 'choose') {
      body = `<div class="gst-ask"><b>${esc(g.who ?? 'Client')}</b> « ${esc(L.ask?.ask ?? L.ask?.label ?? '')} »<div class="gst-patience"><i></i></div></div>
        <div class="gst-opts">${L.shown.map((o, i) => `<button data-pick="${esc(o.id)}"><span class="ic">${esc(o.icon)}</span>${esc(o.label)}<kbd>${i + 1}</kbd></button>`).join('')}</div>`;
    } else {
      body = `<div class="gst-opts seq">${L.shown.map((o, i) => `<button data-pick="${esc(o.id)}"><span class="ic">${esc(o.icon)}</span>${esc(o.label)}<kbd>${i + 1}</kbd></button>`).join('')}</div>`;
    }
    this.el.innerHTML = `<div class="gst-head"><span class="gst-title">${esc(g.prompt)}</span><span class="gst-fb"></span></div>${body}<div class="gst-dots"></div>`;
    this.renderDots();
  }
}
