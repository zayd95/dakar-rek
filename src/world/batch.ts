import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const BAY = 3.4;   // facade bay width (m)
const FLOOR = 3.2; // storey height (m)

/** Collects many coloured primitives and merges them into one draw call. */
export class Batch {
  private geos: THREE.BufferGeometry[] = [];
  count = 0;

  private finish(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, x: number, y: number, z: number, rotY = 0, rotX = 0, rotZ = 0) {
    g.rotateX(rotX); g.rotateZ(rotZ); g.rotateY(rotY); g.translate(x, y, z);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (g.index) g = g.toNonIndexed();
    this.geos.push(g); this.count++;
  }

  /** Box with its base at y. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, rotY = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    this.finish(g, color, x, y, z, rotY);
  }
  /** Box whose side faces tile a window texture (storey/bay repeat); roof/underside sample plain wall. */
  facade(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, rotY = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const widths = [d, d, 0, 0, w, w];
    for (let f = 0; f < 6; f++) {
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        if (f === 2 || f === 3) uv.setXY(i, 0.03, 0.03);
        else uv.setXY(i, uv.getX(i) * (widths[f] / BAY), uv.getY(i) * (h / FLOOR));
      }
    }
    g.translate(0, h / 2, 0);
    this.finish(g, color, x, y, z, rotY);
  }
  cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, seg = 8, rot: [number, number, number] = [0, 0, 0]) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    g.translate(0, h / 2, 0);
    this.finish(g, color, x, y, z, rot[1], rot[0], rot[2]);
  }
  sphere(r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, half = false) {
    const g = half ? new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.SphereGeometry(r, 12, 8);
    this.finish(g, color, x, y, z);
  }

  build(material: THREE.Material, receive = true, cast = true): THREE.Mesh | null {
    if (!this.geos.length) return null;
    const merged = mergeGeometries(this.geos, false)!;
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, material);
    m.receiveShadow = receive; m.castShadow = cast;
    return m;
  }
}

/**
 * Facade texture (one storey × one bay): rendered plaster, a recessed window with frame, louvred shutters,
 * sill with a drip stain, and the slab line between storeys. White-based so each building's vertex colour
 * tints it. The emissive mask lights the window glass at night.
 */
export function facadeTextures() {
  const S = 128;
  const mk = (draw: (c: CanvasRenderingContext2D) => void) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = S; draw(cv.getContext('2d')!);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  const map = mk(c => {
    c.fillStyle = '#fbfaf7'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) { const v = 235 + Math.floor(Math.random() * 20); c.fillStyle = `rgb(${v},${v - 2},${v - 6})`; c.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
    c.fillStyle = '#d9d3c7'; c.fillRect(0, S - 9, S, 9);                 // slab band between storeys
    c.fillStyle = '#c9c1b2'; c.fillRect(0, S - 10, S, 2);
    c.fillStyle = '#e6e1d8'; c.fillRect(34, 18, 60, 74);                 // window surround
    c.fillStyle = '#26303d'; c.fillRect(40, 24, 48, 62);                 // recess / glass
    c.fillStyle = '#5b6f86'; c.fillRect(42, 26, 20, 26); c.fillStyle = '#4a5c71'; c.fillRect(66, 26, 20, 26);
    c.fillStyle = '#e9e5dd'; c.fillRect(63, 24, 3, 62); c.fillRect(40, 53, 48, 3); // mullions
    for (const x of [22, 94]) {                                           // louvred shutters
      c.fillStyle = '#8b8f8c'; c.fillRect(x, 24, 12, 62);
      c.fillStyle = '#6d726f'; for (let y = 27; y < 84; y += 5) c.fillRect(x + 1, y, 10, 2);
    }
    c.fillStyle = '#cfc8ba'; c.fillRect(32, 90, 64, 5);                  // sill
    const g = c.createLinearGradient(0, 95, 0, S - 10); g.addColorStop(0, 'rgba(120,110,95,0.35)'); g.addColorStop(1, 'rgba(120,110,95,0)');
    c.fillStyle = g; c.fillRect(44, 95, 40, S - 105);                    // drip stain under the sill
  });
  const glow = mk(c => { c.fillStyle = '#000'; c.fillRect(0, 0, S, S); c.fillStyle = '#fff'; c.fillRect(42, 26, 44, 58); });
  return { map, glow };
}

export function signTexture(text: string, bg: string, fg: string, w = 256, h = 64): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  c.strokeStyle = fg; c.lineWidth = 3; c.strokeRect(4, 4, w - 8, h - 8);
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
  let size = 34; c.font = `800 ${size}px system-ui, sans-serif`;
  while (c.measureText(text).width > w - 24 && size > 12) { size -= 2; c.font = `800 ${size}px system-ui, sans-serif`; }
  c.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
