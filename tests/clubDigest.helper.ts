import * as T from '../src/activity/templates';
import type { ActivitySpec } from '../src/activity/types';
import type { PlaceSpec } from '../src/activity/places';

/**
 * A canonical text of what a club() recipe offers, read the way the game reads it: every anchor, every offer, its label / detail / price / steps / effects, and what its visible() and
 * requires() answer across a grid of hours, nights and counters. Used to prove that the recipe's optional variant argument leaves La Vague's output byte for byte what it was.
 */
export function clubDigest(make: (hooks: T.PlaceHooks) => PlaceSpec): string {
  const lines: string[] = [];
  for (const hour of [0, 1.5, 3.9, 4.5, 4.99, 5, 12, 20.5, 21, 22.9, 23, 23.5]) for (const day of [10, 11, 12, 13, 14, 15, 16]) for (const mode of ['new', 'paid', 'regular']) {
    const counters: Record<string, number> = {};
    const keys = T.clubCounters('al:club');
    const nightNow = T.clubNight(day, hour);
    if (mode === 'paid') counters[keys.paid] = nightNow + 1;
    if (mode === 'regular') counters[keys.nights] = T.CLUB_REGULAR;
    if (mode === 'paid') counters[keys.contestNight] = nightNow + 1;
    const hooks: T.PlaceHooks = { count: k => counters[k] ?? 0, hour: () => hour, day: () => day, converse: () => {}, enter: () => {}, tired: e => (e > 10 ? 'fatigué' : null), done: () => {} };
    const p = make(hooks);
    lines.push(`## ${hour} ${day} ${mode} :: ${p.id} ${p.name} ${p.space} ${p.type} ${JSON.stringify(p.hours)} ${p.chat} ${JSON.stringify(p.peaks)}`);
    lines.push(JSON.stringify(p.anchors));
    for (const [anchor, offers] of Object.entries(p.offers)) for (const o of offers) lines.push(offerText(anchor, o));
  }
  return lines.join('\n');
}
function offerText(anchor: string, o: ActivitySpec): string {
  const vis = o.visible ? o.visible() : true, why = o.requires ? o.requires() : null;
  const steps = o.steps.map(s => JSON.stringify({ l: s.label, p: s.primitive, c: s.clip, s: s.seconds, seat: s.seat, e: s.effects, g: s.gesture, line: typeof s.line === 'function' ? 'fn' : s.line, thenIs: !!s.then, until: !!s.until }));
  return `${anchor}/${o.id} [${o.primitive}] "${o.label}" detail=${JSON.stringify(o.detail)} icon=${o.icon} price=${o.price} quiet=${(o as { quiet?: boolean }).quiet} vis=${vis} why=${JSON.stringify(why)} :: ${steps.join(' | ')}`;
}
