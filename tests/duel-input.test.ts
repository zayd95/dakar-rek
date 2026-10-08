import { describe, it, expect } from 'vitest';
import { DuelInput } from '../src/lamb/duelInput';

class Button extends EventTarget {
  on = false;
  classList = { toggle: (_name: string, value: boolean) => { this.on = value; return value; } };
}
class Doc extends EventTarget {
  hidden = false;
  activeElement: Element | null = null;
}
const emit = (target: EventTarget, name: string, props: Record<string, unknown> = {}) => {
  const e = new Event(name, { cancelable: true });
  for (const [key, value] of Object.entries(props)) Object.defineProperty(e, key, { value });
  target.dispatchEvent(e); return e;
};
const key = (target: EventTarget, code: string, type = 'keydown', repeat = false) => emit(target, type, { code, repeat });
const pointer = (target: EventTarget, type: string, pointerId = 1, button = 0) => emit(target, type, { pointerId, button });
function setup() {
  const view = new EventTarget(), doc = new Doc(), guard = new Button(), grab = new Button();
  let action = false, resets = 0;
  const controls = new DuelInput(view, doc, guard, grab, () => { action = false; resets++; });
  return { view, doc, guard, grab, controls, queueAction: () => { action = true; },
    consume: () => { const queued = action; action = false; return controls.takeGrabs(queued); }, resets: () => resets };
}

describe('duel interruption and input ownership', () => {
  it('blur immediately releases guard, visual state and both pending grab sources', () => {
    const f = setup(); key(f.view, 'KeyG'); pointer(f.grab, 'pointerdown'); f.queueAction();
    expect(f.controls.guardHeld).toBe(true); expect(f.guard.on).toBe(true);
    emit(f.view, 'blur');
    expect(f.controls.guardHeld).toBe(false); expect(f.guard.on).toBe(false); expect(f.consume()).toBe(0);
    key(f.view, 'KeyG', 'keydown', true); expect(f.controls.guardHeld).toBe(false);
    key(f.view, 'KeyG'); pointer(f.grab, 'pointerdown');
    expect(f.controls.guardHeld).toBe(true); expect(f.consume()).toBe(1);
  });
  it('hidden resets and blocks new controls until visible and a fresh press', () => {
    const f = setup(); pointer(f.guard, 'pointerdown'); pointer(f.grab, 'pointerdown'); f.queueAction();
    f.doc.hidden = true; emit(f.doc, 'visibilitychange');
    key(f.view, 'ShiftLeft'); pointer(f.guard, 'pointerdown'); pointer(f.grab, 'pointerdown');
    f.controls.pressGrab(); f.controls.setGuard(true);
    expect(f.controls.guardHeld).toBe(false); expect(f.guard.on).toBe(false); expect(f.consume()).toBe(0);
    f.doc.hidden = false; emit(f.doc, 'visibilitychange'); expect(f.consume()).toBe(0);
    pointer(f.guard, 'pointerdown'); pointer(f.grab, 'pointerdown');
    expect(f.controls.guardHeld).toBe(true); expect(f.consume()).toBe(1);
  });
  it.each(['pointercancel', 'lostpointercapture'])('%s clears guard visual and pending grabs from either button', type => {
    for (const button of ['guard', 'grab'] as const) {
      const f = setup(); key(f.view, 'KeyG'); pointer(f.guard, 'pointerdown'); pointer(f.grab, 'pointerdown'); f.queueAction();
      pointer(f[button], type);
      expect(f.controls.guardHeld).toBe(false); expect(f.guard.on).toBe(false); expect(f.consume()).toBe(0);
      pointer(f.guard, 'pointerdown', 2); expect(f.controls.guardHeld).toBe(true);
      f.controls.dispose();
    }
  });
  it('window pointer cancellation clears a cancelled touch outside either button', () => {
    const f = setup(); pointer(f.guard, 'pointerdown'); pointer(f.grab, 'pointerdown');
    pointer(f.view, 'pointercancel'); expect(f.guard.on).toBe(false); expect(f.consume()).toBe(0);
  });
  it('tracks simultaneous guard keys and pointer holds independently', () => {
    const f = setup(); key(f.view, 'ShiftLeft'); key(f.view, 'ShiftRight'); pointer(f.guard, 'pointerdown', 7);
    key(f.view, 'ShiftLeft', 'keyup'); key(f.view, 'ShiftRight', 'keyup'); expect(f.guard.on).toBe(true);
    pointer(f.view, 'pointerup', 9); expect(f.guard.on).toBe(true);
    pointer(f.view, 'pointerup', 7); expect(f.controls.guardHeld).toBe(false); expect(f.guard.on).toBe(false);
  });
  it('pointer leave releases its hold without cancelling another held key', () => {
    const f = setup(); key(f.view, 'KeyF'); pointer(f.guard, 'pointerdown'); pointer(f.guard, 'pointerleave');
    expect(f.guard.on).toBe(true); key(f.view, 'KeyF', 'keyup'); expect(f.guard.on).toBe(false);
  });
  it('ignores non-primary button clicks and unrelated keys', () => {
    const f = setup(); pointer(f.guard, 'pointerdown', 1, 2); pointer(f.grab, 'pointerdown', 1, 2); key(f.view, 'KeyA');
    expect(f.guard.on).toBe(false); expect(f.consume()).toBe(0);
  });
  it.each(['input', 'textarea', 'select', 'contenteditable'])('editable %s focus clears and suppresses fight inputs', kind => {
    const f = setup();
    const form = Object.assign(new EventTarget(), { closest: () => kind === 'contenteditable' ? null : {}, isContentEditable: kind === 'contenteditable' });
    key(f.view, 'KeyG'); pointer(f.grab, 'pointerdown'); f.queueAction();
    f.doc.activeElement = form as unknown as Element;
    emit(f.doc, 'focusin', { target: form });
    key(f.view, 'KeyG', 'keydown'); f.queueAction();
    expect(f.consume()).toBe(0); expect(f.guard.on).toBe(false);
    key(f.view, 'KeyG', 'keydown', false);
    emit(f.view, 'keydown', { code: 'ShiftLeft', target: form });
    pointer(f.guard, 'pointerdown'); f.controls.pressGrab(); f.controls.setGuard(true);
    expect(f.controls.guardHeld).toBe(false); expect(f.consume()).toBe(0);
    f.doc.activeElement = null; key(f.view, 'KeyG'); f.queueAction(); expect(f.consume()).toBe(1);
  });
  it('consumes each grab exactly once and keeps multiple clinch taps', () => {
    const f = setup(); pointer(f.grab, 'pointerdown'); pointer(f.grab, 'pointerdown', 2); f.queueAction();
    expect(f.consume()).toBe(3); expect(f.consume()).toBe(0);
  });
  it('normal touch release followed by implicit capture loss preserves a completed grab', () => {
    const f = setup(); pointer(f.grab, 'pointerdown', 9); pointer(f.grab, 'pointerup', 9);
    pointer(f.grab, 'lostpointercapture', 9);
    expect(f.consume()).toBe(1); expect(f.consume()).toBe(0);
  });
  it('ignores a guard key targeted at an editable descendant before activeElement changes', () => {
    const f = setup();
    const descendant = Object.assign(new EventTarget(), { closest: () => null, isContentEditable: true });
    emit(f.view, 'keydown', { code: 'KeyG', repeat: false, target: descendant });
    expect(f.controls.guardHeld).toBe(false); expect(f.guard.on).toBe(false);
    key(f.view, 'KeyG'); expect(f.controls.guardHeld).toBe(true);
  });
  it('dispose removes all listeners and replacement has a single active handler', () => {
    const f = setup(); key(f.view, 'KeyG'); f.controls.dispose(); f.controls.dispose(); const resets = f.resets();
    key(f.view, 'KeyG'); pointer(f.guard, 'pointerdown'); pointer(f.grab, 'pointerdown'); emit(f.view, 'blur');
    expect(f.controls.guardHeld).toBe(false); expect(f.guard.on).toBe(false); expect(f.resets()).toBe(resets);
    const next = new DuelInput(f.view, f.doc, f.guard, f.grab, () => {});
    pointer(f.grab, 'pointerdown'); expect(next.takeGrabs(false)).toBe(1); expect(f.consume()).toBe(0);
    key(f.view, 'KeyG'); expect(next.guardHeld).toBe(true); next.dispose(); expect(f.guard.on).toBe(false);
  });
});
