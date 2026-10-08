export class Input {
  keys = new Set<string>();
  joy = { x: 0, y: 0 };
  /** accumulated camera yaw/pitch delta from drags */
  dragYaw = 0; dragPitch = 0;
  actionPressed = false;
  menuPressed = false;
  enabled = true;
  private mouseDragging = false;

  constructor(el: HTMLElement) {
    addEventListener('keydown', e => {
      if (e.code !== 'Escape' && e.target instanceof HTMLElement && e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (e.target instanceof HTMLElement && e.target.closest('button') && ['Enter', 'Space'].includes(e.code)) return;
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') this.actionPressed = true;
      if (e.code === 'Escape' || e.code === 'KeyM') this.menuPressed = true;
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.reset());
    addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
    addEventListener('focusin', e => { if (e.target instanceof HTMLElement && e.target.closest('input,textarea,select,[contenteditable="true"]')) this.reset(); });
    // Mouse drag rotates the camera.
    el.addEventListener('mousedown', e => { if (e.button !== 0 || !this.enabled) return; this.mouseDragging = true; e.preventDefault(); });
    addEventListener('mouseup', () => (this.mouseDragging = false));
    addEventListener('mousemove', e => { if (this.mouseDragging) { this.dragYaw -= e.movementX * 0.005; this.dragPitch += e.movementY * 0.003; } });
  }

  reset() {
    this.keys.clear(); this.joy = { x: 0, y: 0 }; this.mouseDragging = false;
    this.dragYaw = this.dragPitch = 0; this.actionPressed = this.menuPressed = false;
  }

  /** Movement vector in screen space: x right, y forward. Magnitude <= 1. */
  move(): { x: number; y: number } {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = this.joy.x, y = this.joy.y;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }
  rotateKey(): number { return (this.keys.has('KeyQ') ? 1 : 0) - (this.keys.has('KeyR') ? 1 : 0); }
  takeDrag() { const d = { yaw: this.dragYaw, pitch: this.dragPitch }; this.dragYaw = 0; this.dragPitch = 0; return d; }
  takeAction() { const a = this.actionPressed; this.actionPressed = false; return a; }
  takeMenu() { const a = this.menuPressed; this.menuPressed = false; return a; }
}
