/** Duel-owned controls. Shared movement/action input remains owned by core/Input. */
const GUARD_KEYS = new Set(['KeyG', 'KeyF', 'ShiftLeft', 'ShiftRight']);
const editable = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return Boolean(el && typeof el.closest === 'function' &&
    (el.closest('input,textarea,select') || el.isContentEditable));
};

export class DuelInput {
  private keys = new Set<string>();
  private pointers = new Set<number>();
  private grabPointers = new Set<number>();
  private debugGuard = false;
  private grabs = 0;
  private disposed = false;
  private removers: (() => void)[] = [];

  constructor(
    view: EventTarget,
    private doc: Pick<Document, 'hidden' | 'activeElement'> & EventTarget,
    private guardButton: { classList: Pick<DOMTokenList, 'toggle'> } & EventTarget,
    grabButton: EventTarget,
    private discardAction: () => void,
  ) {
    const listen = (target: EventTarget, name: string, fn: (event: Event) => void) => {
      target.addEventListener(name, fn);
      this.removers.push(() => target.removeEventListener(name, fn));
    };
    listen(view, 'keydown', event => {
      const e = event as KeyboardEvent;
      if (!GUARD_KEYS.has(e.code) || e.repeat || this.doc.hidden || editable(e.target) || editable(this.doc.activeElement)) return;
      this.keys.add(e.code); this.paint();
    });
    listen(view, 'keyup', event => { this.keys.delete((event as KeyboardEvent).code); this.paint(); });
    listen(view, 'blur', () => this.reset());
    listen(doc, 'visibilitychange', () => { if (this.doc.hidden) this.reset(); });
    listen(doc, 'focusin', e => { if (editable(e.target)) this.reset(); });
    listen(guardButton, 'pointerdown', event => {
      const e = event as PointerEvent;
      if (this.doc.hidden || editable(this.doc.activeElement) || e.button !== 0) return;
      e.preventDefault(); this.pointers.add(e.pointerId); this.paint();
    });
    const release = (event: Event) => {
      const id = (event as PointerEvent).pointerId;
      this.pointers.delete(id); this.grabPointers.delete(id); this.paint();
    };
    listen(view, 'pointerup', release);
    listen(guardButton, 'pointerup', release);
    listen(guardButton, 'pointerleave', release);
    listen(grabButton, 'pointerup', release);
    listen(grabButton, 'pointerdown', event => {
      const e = event as PointerEvent;
      if (this.doc.hidden || editable(this.doc.activeElement) || e.button !== 0) return;
      e.preventDefault(); this.grabPointers.add(e.pointerId); this.pressGrab();
    });
    // A cancelled gesture must never replay a pending grab after interruption.
    listen(view, 'pointercancel', () => this.reset());
    for (const button of [guardButton, grabButton]) {
      listen(button, 'pointercancel', () => this.reset());
      listen(button, 'lostpointercapture', event => {
        const id = (event as PointerEvent).pointerId;
        // Touch implicitly releases capture after a normal pointerup: that is
        // not a cancellation and must not discard the completed tap.
        if (this.pointers.has(id) || this.grabPointers.has(id)) this.reset();
      });
    }
  }

  get guardHeld() { return !this.disposed && (this.debugGuard || this.keys.size > 0 || this.pointers.size > 0); }
  private paint() { this.guardButton.classList.toggle('on', this.guardHeld); }
  setGuard(on: boolean) { if (!this.disposed && !this.doc.hidden && !editable(this.doc.activeElement)) { this.debugGuard = on; this.paint(); } }
  pressGrab() { if (!this.disposed && !this.doc.hidden && !editable(this.doc.activeElement)) this.grabs++; }

  takeGrabs(sharedAction: boolean): number {
    if (this.disposed || this.doc.hidden || editable(this.doc.activeElement)) { this.reset(); return 0; }
    const taps = this.grabs + (sharedAction ? 1 : 0); this.grabs = 0; return taps;
  }

  reset() {
    this.keys.clear(); this.pointers.clear(); this.grabPointers.clear(); this.debugGuard = false; this.grabs = 0;
    this.discardAction(); this.paint();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const remove of this.removers) remove();
    this.removers = []; this.reset();
  }
}
