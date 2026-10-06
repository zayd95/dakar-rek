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

function canvasTex(draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** Facade texture: plain wall with one shuttered window per bay; emissive mask lights windows at night. */
export function facadeTextures() {
  const map = canvasTex(c => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#e4e1da'; c.fillRect(0, 60, 64, 4);          // storey line
    c.fillStyle = '#3d4b5f'; c.fillRect(20, 16, 24, 28);        // window
    c.fillStyle = '#8fa3b8'; c.fillRect(22, 18, 20, 11);        // glass glint
    c.fillStyle = '#b9b2a6'; c.fillRect(18, 44, 28, 3);         // sill
  });
  const glow = canvasTex(c => {
    c.fillStyle = '#000'; c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#fff'; c.fillRect(21, 17, 22, 26);
  });
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
