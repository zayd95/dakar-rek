import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The after-bout card (hud.boutCard, src/ui/style.css) on a phone: the room it is given keeps it clear of the controls a
 * finger is on — the joystick, « Courir » (src/ui/stride.css), the action column — whatever their sizes become. The
 * browser checks measure it (scripts/check-career.mjs, scripts/check-ui.mjs step 10b); this keeps the numbers in step.
 */
const text = (path: string) => new TextDecoder().decode(readFileSync(new URL(path, import.meta.url)));
const css = text('../src/ui/style.css'), stride = text('../src/ui/stride.css');
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

describe('the after-bout card keeps clear of the controls on a phone', () => {
  const joy = rule(css, '#joy'), bar = rule(css, '#ui > #actbar'), act = rule(css, '#act'), more = rule(css, '#actMore');
  const run = rule(stride, 'body.touch #runBtn');
  const joyTop = px(joy, 'bottom') + px(joy, 'height');                                         // 154
  const runTop = px(run, 'bottom') + px(run, 'height'), runRight = px(run, 'left') + px(run, 'width');
  const barTop = px(bar, 'bottom') + px(act, 'min-height') + px(bar, 'gap') + px(more, 'height');
  it('in portrait it ends above the controls row, with a margin, and still has room on a 360 × 640 phone', () => {
    const cap = /#toast \.mo \{ max-height:calc\(100vh - var\(--tt\) - var\(--sa-t\) - (\d+)px - var\(--sa-b\)\); max-height:calc\(100dvh - var\(--tt\) - var\(--sa-t\) - \1px - var\(--sa-b\)\)/.exec(portrait);
    expect(cap).not.toBeNull();
    const reserve = Number(cap![1]);
    expect(reserve).toBeGreaterThanOrEqual(Math.max(joyTop, runTop, barTop) + 8);
    const top = px(rule(portrait, '#toast'), 'top');                                            // 170 under the header
    const gala = Number(/#ui:has\(#galacard\.on\) #toast \{ --tt:(\d+)px; top:calc\(\1px/.exec(css.slice(css.indexOf('@media (max-width:640px)')))![1]);
    for (const [h, t] of [[640, top], [640, gala], [844, top]]) expect(h - t - reserve).toBeGreaterThanOrEqual(200);   // the title and a few rows, then it scrolls
    expect(portrait.slice(0, portrait.indexOf('#toast .mo.bc'))).toMatch(/#toast \.mo \{[^}]*overflow-y:auto/);
  });
  it('on a phone on its side its column sits between « Courir » and the action column, and it ends on screen', () => {
    const col = rule(landscape, '#toast');
    const left = Number(/left:calc\((\d+)px \+ var\(--sa-l\)\)/.exec(col)![1]);
    expect(left).toBeGreaterThanOrEqual(runRight + 8);
    const right = /right:calc\(24vw \+ (\d+)px \+ var\(--sa-r\)\)/.exec(col), actMax = /#act \{ max-width:calc\(24vw - (\d+)px - var\(--sa-r\)\)/.exec(landscape);
    expect(right && actMax).toBeTruthy();
    expect(Number(right![1]) + Number(actMax![1])).toBeGreaterThanOrEqual(px(bar, 'right') + 8);   // the act column's left edge, plus a margin
    expect(col).toMatch(/margin:0 auto; transform:none/);
    expect(landscape).toMatch(/#toast \.mo \{ max-height:calc\(100vh - var\(--tt\) - var\(--sa-t\) - (\d+)px - var\(--sa-b\)\); max-height:calc\(100dvh - var\(--tt\) - var\(--sa-t\) - \1px - var\(--sa-b\)\);\s*overflow-y:auto/);
    // the top of each toast column is the --tt its card's cap reads
    for (const m of css.matchAll(/--tt:(\d+)px; (?:position:absolute; left:50%; )?top:calc\((\d+)px/g)) expect(m[1]).toBe(m[2]);
  });
});
