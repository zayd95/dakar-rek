import { frameStats } from '../core/frameStats';

/**
 * The little meter of « Mesure de fluidité » (src/core/frameStats.ts): the current place's frame rate and 95th-percentile frame time, at the bottom centre,
 * between the stick and the action button. It never takes a touch. Built on first use and only shown while the measure is on.
 */
let el: HTMLElement | null = null;
let shownAt = 0;

export function updateFrameMeter(now: number) {
  if (!frameStats.enabled) { if (el) el.hidden = true; return; }
  if (now - shownAt < 500) return;
  shownAt = now;
  if (!el) {
    el = document.createElement('div');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 24px);z-index:9;pointer-events:none;max-width:calc(100vw - 12px);overflow:hidden;text-overflow:ellipsis;'
      + 'font:600 11px/1.3 ui-monospace,Menlo,monospace;color:#d9ffd9;background:rgba(0,0,0,.55);padding:2px 6px;border-radius:6px;white-space:nowrap';
    document.body.appendChild(el);
  }
  const c = frameStats.current();
  el.hidden = !c;
  if (c) el.textContent = `${c.fps} img/s · 95 % < ${c.p95} ms · ${c.key}`;
}
