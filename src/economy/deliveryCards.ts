/**
 * The delivery panel's look: clean cards made of icons, short French words and one big reward (no paragraphs): a vertical route
 * (pick-up, then the stops), the price on the right, one big yellow button. Presentation only — what a card shows comes from the
 * delivery logic (jobs.ts, tour.ts), which this file never reads.
 * A card is a `button.item.dcard` inside the sheet, so the menu keeps its focus, scrolling, close button and sounds.
 */
export interface Spot { icon: string; name: string }

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const pill = (s: Spot) => {
  const e = node('span', 'pill');
  const i = node('i', 'ic', s.icon); i.setAttribute('aria-hidden', 'true');
  e.append(i, node('b', '', s.name));
  return e;
};
const chip = (text: string, cls = '') => node('span', 'chip' + (cls ? ' ' + cls : ''), text);

/** An icon for a place by its interactable id fragment (the places the deliveries use). */
export function iconOf(frag: string): string {
  const f = frag.toLowerCase();
  return f.includes('bank') ? '🏦' : f.includes('cafe') ? '☕' : f.includes('gargote') ? '🍲' : f.includes('dibiterie') ? '🍢' : f.includes('maiga') ? '🥬'
    : f.includes('garage') ? '🔧' : f.includes('salon') ? '💇' : f.includes('square') ? '♟️' : f.includes('boutique') ? '🛍️' : f.includes('market') ? '🧺' : '📍';
}

/** One delivery to pick: the route (from, then one or two stops), the reward on the right, a few chips, one yellow action. */
export function routeCard(o: {
  from: Spot; to: Spot[]; reward: string; chips?: string[]; badge?: string; cta: string; tour?: boolean; blocked?: string; live?: boolean; onPick: () => void;
}): HTMLElement {
  const b = node(o.live ? 'div' : 'button', 'item dcard' + (o.tour ? ' tour' : '') + (o.blocked ? ' dis' : '') + (o.live ? ' live' : '')) as HTMLElement;
  if (b instanceof HTMLButtonElement) b.type = 'button';
  const face = node('div', 'face');
  const main = node('div', 'main');
  if (o.badge) main.append(node('span', 'dbadge', o.badge));
  const stops = node('div', 'stops');
  const start = node('div', 'stop'); start.append(node('span', 'mark start'), pill(o.from)); stops.append(start);
  o.to.forEach((t, k) => { const r = node('div', 'stop'); r.append(node('span', 'mark num', String(k + 1)), pill(t)); stops.append(r); });
  main.append(stops);
  const chips = node('div', 'chips');
  for (const c of o.blocked ? [o.blocked] : o.chips ?? []) chips.append(chip(c, o.blocked ? 'warn' : /^🎁/.test(c) ? 'bonus' : ''));
  if (chips.children.length) main.append(chips);
  const side = node('div', 'side');
  side.append(node('small', '', 'Gain estimé'), node('em', 'reward', o.reward));
  face.append(main, node('span', 'vdiv'), side);
  b.append(face);
  if (!o.live) b.append(node('span', 'go', o.blocked ? '' : o.cta + ' ›'));
  if (o.blocked) b.setAttribute('aria-disabled', 'true');
  else if (!o.live) b.addEventListener('click', o.onPick);
  return b;
}

/** A big single button (an icon and one short word): abandon, cancel, continue. */
export function actionCard(icon: string, label: string, onPick: () => void, danger = false): HTMLButtonElement {
  const b = node('button', 'item dcard act' + (danger ? ' danger' : ''));
  b.type = 'button';
  const i = node('i', 'ic', icon); i.setAttribute('aria-hidden', 'true');
  b.append(i, node('b', '', label));
  b.addEventListener('click', onPick);
  return b;
}

/**
 * A card for one of the two orders of a tour: the stops in the order served, each with its client's urgency (🔥) and time limit,
 * a light between them (green: the second client will be on time, red: late), the outcome as one icon beside the price.
 */
export function orderCard(o: {
  first: number; stops: { spot: Spot; urgency: 1 | 2 | 3; limit: string; ok: boolean; memory: string }[]; reward: string; onPick: () => void;
}): HTMLButtonElement {
  const b = node('button', 'item dcard order');
  b.type = 'button'; b.dataset.first = String(o.first);
  const face = node('div', 'face col');
  const stops = node('div', 'stops');
  o.stops.forEach((s, k) => {
    const row = node('div', 'stop' + (s.ok ? ' ok' : ' late') + (k < o.stops.length - 1 ? ' link ' + (o.stops[k + 1].ok ? 'link-ok' : 'link-late') : ''));
    row.append(node('span', 'mark num', String(k + 1)), pill(s.spot));
    if (s.memory) row.append(node('span', 'mem', s.memory));
    const u = node('span', 'urg', '🔥'.repeat(s.urgency)); u.title = 'Pressé';
    row.append(u, node('span', 'lim', `⏱ ${s.limit}`));
    stops.append(row);
  });
  face.append(stops);
  const allOk = o.stops.every(s => s.ok);
  const price = node('div', 'pricerow');
  price.append(node('span', 'verdict ' + (allOk ? 'ok' : 'warn'), allOk ? '✓' : '!'), node('em', 'reward', o.reward));
  face.append(price, node('span', 'go', 'Partir ›'));
  b.append(face);
  b.addEventListener('click', o.onPick);
  return b;
}

/** One short line with an icon (the only text a panel may carry besides names and numbers). */
export const tip = (icon: string, text: string) => { const t = node('div', 'dtip'); t.append(node('i', '', icon), node('span', '', text)); return t; };

/** « Si j'abandonne ? » opens one short line; closed by default. */
export function disclosure(label: string, text: string): HTMLElement {
  const w = node('div', 'ddisc');
  const btn = node('button', 'dmore', `ℹ️ ${label}`); btn.type = 'button';
  const p = node('p', '', text); p.hidden = true;
  btn.addEventListener('click', () => { p.hidden = !p.hidden; btn.setAttribute('aria-expanded', String(!p.hidden)); });
  btn.setAttribute('aria-expanded', 'false');
  w.append(btn, p);
  return w;
}

/** The wrapper cards are put in (placed before the sheet's list of plain rows). */
export const cards = () => node('div', 'dlv');
