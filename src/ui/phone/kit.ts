import { esc } from '../journal';

/**
 * The phone's shared UI, as small HTML builders (styles: src/ui/phone.css, « design language »). Every app screen is made of these, so a button, a
 * row, a card or a tab looks and behaves the same everywhere:
 *   – a section title (`section`), a card (`card`), grouped rows (`rows` of `row`), a segmented control (`seg`), a switch (`toggle`);
 *   – buttons: `btn` (primary = the sun-yellow action, secondary = the plain one, danger), always ≥ 44 px tall, one verb;
 *   – `badge` (a small tone pill), `stat` tiles, `empty` (an icon and one line), `more` (a detail shown on tap, never a permanent paragraph).
 * Actions are data attributes the shell and the screens delegate on: data-app (open an app), data-go (a screen of the phone), data-act (the screen's own).
 */
export { esc };

export type Tone = '' | 'gain' | 'warn' | 'info' | 'sun' | 'mute';
type Target = { app?: string; go?: string; act?: string; arg?: string };
const attrs = (t: Target) => `${t.app ? ` data-app="${esc(t.app)}"` : ''}${t.go ? ` data-go="${esc(t.go)}"` : ''}${t.act ? ` data-act="${esc(t.act)}"` : ''}${t.arg ? ` data-arg="${esc(t.arg)}"` : ''}`;

/** A section: a small caps title over its content. */
export const section = (title: string, body: string, extra = '') => `<section class="pk-sec"${extra}>${title ? `<h3>${esc(title)}</h3>` : ''}${body}</section>`;
/** A white card. */
export const card = (body: string, cls = '') => `<div class="pk-card${cls ? ' ' + cls : ''}">${body}</div>`;

export interface RowOpt extends Target {
  icon?: string;
  label: string;
  sub?: string;
  /** The value on the right (a number, an amount). */
  value?: string;
  tone?: Tone;
  /** A chevron: the row opens something. */
  chevron?: boolean;
  /** Raw HTML on the right instead of the value (a small button). */
  end?: string;
}
/** One row of a grouped list: icon, label (and a second line), value or chevron. A row with a target is a button. */
export function row(o: RowOpt): string {
  const tap = !!(o.app || o.go || o.act), tag = tap ? 'button' : 'div';
  return `<${tag}${tap ? ' type="button"' : ''} class="pk-row${tap ? ' tap' : ''}"${attrs(o)}>`
    + (o.icon ? `<i class="pk-ic" aria-hidden="true">${esc(o.icon)}</i>` : '')
    + `<span class="pk-tx"><b>${esc(o.label)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span>`
    + (o.value !== undefined ? `<em class="pk-val ${o.tone ?? ''}">${esc(o.value)}</em>` : '')
    + (o.end ?? '')
    + (tap && o.chevron !== false ? '<span class="pk-chev" aria-hidden="true">›</span>' : '')
    + `</${tag}>`;
}
/** Grouped rows in one card. */
export const rows = (list: string[]) => `<div class="pk-rows">${list.join('')}</div>`;

/** A button: primary (the sun-yellow action), secondary (plain), danger. Full width unless `inline`. */
export function btn(label: string, t: Target & { kind?: 'primary' | 'secondary' | 'danger' | 'quiet'; sub?: string; inline?: boolean; icon?: string; cls?: string }): string {
  return `<button type="button" class="pk-btn ${t.kind ?? 'secondary'}${t.inline ? ' inline' : ''}${t.cls ? ' ' + t.cls : ''}"${attrs(t)}>${t.icon ? `<i aria-hidden="true">${esc(t.icon)}</i>` : ''}<span>${esc(label)}${t.sub ? `<small>${esc(t.sub)}</small>` : ''}</span></button>`;
}
/** A small pill. */
export const badge = (text: string, tone: Tone = '') => `<span class="pk-badge ${tone}">${esc(text)}</span>`;
/** Stat tiles in a row (2–4). */
export const stats = (list: { value: string; label: string; act?: string; go?: string; app?: string; arg?: string }[]) =>
  `<div class="pk-stats" style="--n:${list.length}">${list.map(s => { const tap = !!(s.act || s.go || s.app); return `<${tap ? 'button type="button"' : 'div'} class="pk-stat"${attrs(s)}><b>${esc(s.value)}</b><small>${esc(s.label)}</small></${tap ? 'button' : 'div'}>`; }).join('')}</div>`;
/** An empty state: an icon and one short line (and an optional button). */
export const empty = (icon: string, text: string, action = '') => `<div class="pk-empty"><i aria-hidden="true">${esc(icon)}</i><p>${esc(text)}</p>${action}</div>`;
/** A segmented control (tabs or a setting): `name` is the data attribute each button carries. */
export function seg(name: string, options: [string, string][], current: string, role: 'tab' | 'radio' = 'radio'): string {
  return `<div class="pk-seg" role="${role === 'tab' ? 'tablist' : 'radiogroup'}">${options.map(([k, l]) => `<button type="button" role="${role}" data-${name}="${esc(k)}" class="${k === current ? 'on' : ''}" aria-${role === 'tab' ? 'selected' : 'checked'}="${k === current}">${esc(l)}</button>`).join('')}</div>`;
}
/** A switch row (the whole row is the button). */
export function toggle(act: string, label: string, on: boolean, sub = '', state: [string, string] = ['Activé', 'Coupé']): string {
  return `<button type="button" class="pk-row tap pk-toggle${on ? ' on' : ''}" data-act="${esc(act)}" role="switch" aria-checked="${on}"><span class="pk-tx"><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><em class="pk-sw" aria-hidden="true">${esc(on ? state[0] : state[1])}</em></button>`;
}
/** A detail shown on tap (complex values explained on demand, never a permanent paragraph). */
export const more = (summary: string, body: string, cls = '') => `<details class="pk-more${cls ? ' ' + cls : ''}"><summary>${esc(summary)}</summary><div>${body}</div></details>`;
/** A short note (one or two lines, grey). */
export const note = (text: string) => `<p class="pk-note">${esc(text)}</p>`;
/** A progress bar 0–1. */
export const bar = (v: number, tone: Tone = '') => `<i class="pk-bar ${tone}" style="--v:${Math.round(Math.max(0, Math.min(1, v)) * 100)}"><i></i></i>`;
