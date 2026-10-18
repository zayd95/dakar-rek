/**
 * A few line icons (24 px, 1.8 stroke, currentColor) for compact menus: calmer than emoji beside a price, and they follow the ink of
 * the scene. `glyphEl(name)` returns an <svg> or null for an unknown name (the caller then falls back to its emoji).
 */
const PATHS: Record<string, string> = {
  basket: '<path d="M3 10h18l-1.8 9a2 2 0 0 1-2 1.6H6.8a2 2 0 0 1-2-1.6L3 10z"/><path d="M8 10l3-6M16 10l-3-6M9 14v3M12 14v3M15 14v3"/>',
  box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5M12 12L4 7.5M12 12v9"/>',
  chat: '<path d="M4 12a8 7 0 1 1 3.2 5.5L4 19l1-3.6A6.8 6.8 0 0 1 4 12z"/>',
  bike: '<circle cx="6" cy="17" r="3.2"/><circle cx="18" cy="17" r="3.2"/><path d="M6 17l4-8h5l3 8M10 9L9 6H7M13 12.5h4"/>',
  cup: '<path d="M5 8h11v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V8z"/><path d="M16 9h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M8 3.5v2M12 3.5v2"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  star: '<path d="M12 3.2l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.7l-5.4 3 1.2-6-4.5-4.2 6.1-.7L12 3.2z" fill="currentColor"/>',
};
export const GLYPHS = Object.keys(PATHS);
export function glyphEl(name: string | undefined): SVGElement | null {
  const p = name ? PATHS[name] : undefined;
  if (!p) return null;
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true'); s.classList.add('glyph');
  s.innerHTML = p;
  return s;
}
