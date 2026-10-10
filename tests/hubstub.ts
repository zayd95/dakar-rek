/**
 * A minimal DOM canvas for building a hub in node (tests only): every 2D-context call is a no-op, so the builder's
 * painted textures come out blank but the geometry, colliders, roads and interactables are the real ones.
 */
export function stubCanvas() {
  const g = globalThis as unknown as { document?: unknown; Image?: unknown };
  if (g.document) return;
  const ctx2d: unknown = new Proxy({}, {
    get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' || k === 'createImageData' ? () => ({ data: new Uint8ClampedArray(4 * 64 * 64), width: 64, height: 64 }) : k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' ? () => ({ addColorStop() {} }) : () => {}),
    set: () => true,
  });
  const canvas = () => ({ width: 64, height: 64, style: {}, getContext: () => ctx2d, toDataURL: () => '', addEventListener() {} });
  g.document = { createElement: (t: string) => (t === 'canvas' ? canvas() : { style: {}, appendChild() {}, addEventListener() {}, setAttribute() {}, classList: { add() {}, remove() {} } }), createElementNS: () => canvas(), getElementById: () => null };
}
