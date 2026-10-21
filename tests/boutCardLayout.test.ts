import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { centreZone } from '../src/ui/quiet';

/**
 * The quiet screen's room (docs/UI_V2_PLAN.md §0 C; src/ui/style.css): the moment card — the after-bout card above all
 * — and the one transient line are placed clear of the middle of the screen (src/ui/quiet.ts centreZone) and of the
 * controls a finger is on (the joystick, « Courir » in src/ui/stride.css, the action column), whatever their sizes
 * become. The browser checks measure it (scripts/check-ui.mjs, scripts/check-arena-visit.mjs, __dakar.quiet()); this
 * keeps the numbers in step.
 */
const text = (path: string) => new TextDecoder().decode(readFileSync(new URL(path, import.meta.url)));
const css = text('../src/ui/style.css'), chat = text('../src/multiplayer/chat.css');
const rule = (src: string, sel: string) => {
  const at = src.indexOf(`${sel} {`); expect(at, sel).toBeGreaterThanOrEqual(0);
  return src.slice(at, src.indexOf('}', at));
};
const px = (r: string, prop: string) => {
  const m = new RegExp(`(?:^|[;{\\s])${prop}:\\s*(?:calc\\()?(?:env\\([^)]*\\)\\s*\\+\\s*)?(-?\\d+(?:\\.\\d+)?)px`).exec(r);
  expect(m, `${prop} in ${r.slice(0, 40)}`).not.toBeNull();
  return Number(m![1]);
};
const portrait = css.slice(css.indexOf('@media (max-width:640px) and (orientation:portrait) {\n  #stats'));
const landscape = css.slice(css.indexOf('@media (max-height:500px) and (orientation:landscape)'));
const joy = rule(css, '#joy'), bar = rule(css, '#ui > #actbar'), act = rule(css, '#act'), more = rule(css, '#actMore');
const joyTop = px(joy, 'bottom') + px(joy, 'height');                                           // 154
const runTop = 0, runRight = 0;                                                                  // there is no « Courir » button any more: the joystick sets the pace
const barTop = px(bar, 'bottom') + px(act, 'min-height') + px(bar, 'gap') + px(more, 'height');
const controlsTop = Math.max(joyTop, runTop, barTop);

describe('the moment card (the after-bout card above all) keeps clear of the middle and of the controls', () => {
  it('on desktop: on the right, 30 vw wide at most, under the social buttons, ending above the action column', () => {
    const mo = rule(css, '#toast .mo');
    expect(mo).toMatch(/right:calc\(10px \+ var\(--sa-r\)\)/);
    expect(mo).toMatch(/width:min\(360px, calc\(30vw - 20px\)\)/);                            // its left edge ≥ 70 vw: the middle's right edge
    expect(px(mo, 'top')).toBeGreaterThanOrEqual(px(rule(chat, '#chatBtn'), 'top') + px(rule(chat, '#chatBtn'), 'min-height') + 8);
    expect(Number(/max-height:calc\(100vh - (\d+)px - (\d+)px/.exec(mo)![2])).toBeGreaterThanOrEqual(barTop + 8);
  });
  it('on a phone in portrait: at the top, ending above the middle (33 % of the height), with room on a 360 × 640 phone', () => {
    const mo = rule(portrait, '#toast .mo'), top = px(mo, 'top'), cap = /max-height:calc\(33vh - (\d+)px - var\(--sa-t\)\)/.exec(mo);
    expect(cap).not.toBeNull();
    for (const h of [640, 844]) {
      const bottom = top + h * 0.33 - Number(cap![1]);
      expect(bottom).toBeLessThanOrEqual(centreZone(360, h).top);
      expect(bottom - top).toBeGreaterThanOrEqual(70);                                          // the title and a line, then it scrolls
    }
    expect(px(mo, 'right')).toBeGreaterThanOrEqual(110);                                        // left of the presence and chat buttons
  });
  it('on a phone on its side: on the left, 30 vw wide at most, ending above the joystick and « Courir »', () => {
    const mo = rule(landscape, '#toast .mo');
    expect(mo).toMatch(/width:calc\(30vw - 20px - var\(--sa-l\)\)/);                            // from 10 px: its right edge < 30 vw
    expect(px(mo, 'left')).toBe(10);
    expect(Number(/max-height:calc\(100vh - (\d+)px - (\d+)px/.exec(mo)![2])).toBeGreaterThanOrEqual(Math.max(joyTop, runTop) + 8);
  });
});

describe('the one transient line', () => {
  it('the subtitle sits above the controls in portrait, three lines at most, under the middle even on a 360 × 640 phone', () => {
    const say = rule(portrait, '#toast .t.say'), bottom = px(say, 'bottom');
    expect(bottom).toBeGreaterThanOrEqual(controlsTop + 8);
    expect(say).toMatch(/-webkit-line-clamp:3/);
    const height = 3 * 13 * 1.35 + 14;                                                          // three lines of 13 px, padding
    for (const h of [640, 844]) expect(h - bottom - height).toBeGreaterThanOrEqual(centreZone(360, h).bottom);
  });
  it('on a phone on its side it sits at the bottom between « Courir » and the action column, two lines at most', () => {
    const say = rule(landscape, '#toast .t.say');
    expect(px(say, 'left')).toBeGreaterThanOrEqual(runRight + 8);
    const right = /right:calc\(24vw \+ (\d+)px \+ var\(--sa-r\)\)/.exec(say), actMax = /#act \{ max-width:calc\(24vw - (\d+)px - var\(--sa-r\)\)/.exec(landscape);
    expect(right && actMax).toBeTruthy();
    expect(Number(right![1]) + Number(actMax![1])).toBeGreaterThanOrEqual(px(bar, 'right') + 8);
    expect(say).toMatch(/-webkit-line-clamp:2/);
    expect(390 - px(say, 'bottom') - (2 * 12.5 * 1.35 + 12)).toBeGreaterThanOrEqual(centreZone(844, 390).bottom);
  });
  it('on desktop it sits at the bottom centre, under the middle; a refusal sits right above the action column, clear of the middle', () => {
    const say = rule(css, '#toast .t.say');
    expect(720 - px(say, 'bottom') - (3 * 13.5 * 1.35 + 14)).toBeGreaterThanOrEqual(centreZone(1280, 720).bottom);
    const now = rule(css, '#toast .t.now');
    expect(px(now, 'bottom')).toBeGreaterThanOrEqual(barTop + 8);
    expect(rule(landscape, '#toast .t.now')).toMatch(/max-width:calc\(24vw \+ 4px\)/);       // from 16 px: its left edge > 70 vw on a phone
  });
  it('the cards that used to sit over the middle are gone: the gala and the rides live in the place chip', () => {
    expect(css).not.toMatch(/galacard|ridecard/);
    expect(text('../src/transport/transport.css')).not.toMatch(/\.ridecard \{/);
    expect(text('../src/arena/card.ts')).not.toMatch(/createElement/);
  });
});
