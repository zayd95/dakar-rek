import * as THREE from 'three';
const ctx2d: unknown = new Proxy({}, {
  get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' || k === 'createImageData' ? () => ({ data: new Uint8ClampedArray(4 * 64 * 64), width: 64, height: 64 })
    : k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' ? () => ({ addColorStop() {} }) : () => {}),
  set: () => true,
});
function element(tag = 'div'): unknown {
  const own: Record<string | symbol, unknown> = { tagName: tag.toUpperCase(), style: {}, dataset: {}, textContent: '', innerHTML: '', className: '', id: '', width: 64, height: 64, hidden: false, value: '' };
  const classes = new Set<string>();
  const classList = { add: (...c: string[]) => { for (const x of c) classes.add(x); }, remove: (...c: string[]) => { for (const x of c) classes.delete(x); },
    toggle: (c: string, on?: boolean) => { const v = on ?? !classes.has(c); if (v) classes.add(c); else classes.delete(c); return v; }, contains: (c: string) => classes.has(c) };
  return new Proxy(own, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      switch (k) {
        case 'classList': return classList;
        case 'getContext': return () => ctx2d;
        case 'toDataURL': return () => '';
        case 'querySelector': return () => element();
        case 'querySelectorAll': case 'getElementsByTagName': case 'getElementsByClassName': return () => [];
        case 'children': case 'childNodes': return [];
        case 'parentNode': case 'parentElement': case 'firstChild': case 'lastChild': case 'nextSibling': case 'firstElementChild': return null;
        case 'getBoundingClientRect': return () => ({ x: 0, y: 0, width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 });
        case 'appendChild': case 'append': case 'prepend': case 'insertBefore': case 'replaceChildren': return (c: unknown) => c;
        case 'offsetWidth': case 'offsetHeight': case 'clientWidth': case 'clientHeight': case 'scrollHeight': case 'scrollTop': return 0;
        case 'contains': return () => false;
        default: return () => {};
      }
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
let domReady = false;
export function stubDom() {
  if (domReady) return;
  domReady = true;
  const g = globalThis as Record<string, unknown>;
  const ui = element('div');
  if (!g.document) {
    g.document = {
      createElement: (t: string) => element(t), createElementNS: (_n: string, t: string) => element(t), createTextNode: () => element('#text'),
      getElementById: (id: string) => (id === 'ui' ? ui : null), querySelector: () => null, querySelectorAll: () => [],
      body: element('body'), head: element('head'), documentElement: element('html'), addEventListener() {}, removeEventListener() {}, hidden: false,
    };
  }
  g.window ??= g;
  g.innerWidth ??= 1280; g.innerHeight ??= 720;
  g.addEventListener ??= () => {}; g.removeEventListener ??= () => {};
  g.requestAnimationFrame ??= () => 0;
  class Observer { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  g.MutationObserver ??= Observer; g.ResizeObserver ??= Observer; g.IntersectionObserver ??= Observer;
}

// ------------------------------------------------------------------ the humanoid, parsed in node
let humanoid = false;
/** Loads the shipped humanoid through the game's own preloadHumanoid (the GLB has no textures: it parses in node). */
