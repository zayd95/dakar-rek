import { glossed } from './wolof';

/** Marks the gloss travels between (see `wo` in wolof.ts): any text holding one still has a gloss to resolve. */
const MARK = '⁣';

/** Resolves the Wolof glosses of every text node under `node` (shown or hidden, as set in Réglages › Langue). */
export function resolveGlosses(node: Node) {
  if (node.nodeType === 3) { const t = node.nodeValue; if (t && t.includes(MARK)) node.nodeValue = glossed(t); return; }
  if (node.nodeType !== 1 && node.nodeType !== 11) return;
  if (!(node.textContent ?? '').includes(MARK)) return;
  const walk = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let t = walk.nextNode(); t; t = walk.nextNode()) if (t.nodeValue?.includes(MARK)) t.nodeValue = glossed(t.nodeValue);
}

/**
 * One place resolves the glosses of everything the interface shows: toasts, menus, prompts, the progress bar, the
 * phone… whatever module wrote the text. A MutationObserver on the page resolves new text before it is painted
 * (observer callbacks run before rendering), so no UI file needs to know about glosses. Canvas texts (speech bubbles)
 * do not go through the DOM: they are written without glosses.
 */
export function installGlossResolver(root: Node = document.body): MutationObserver {
  resolveGlosses(root);
  const obs = new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'characterData') resolveGlosses(r.target);
      else for (const n of r.addedNodes) resolveGlosses(n);
    }
  });
  obs.observe(root, { childList: true, subtree: true, characterData: true });
  return obs;
}
