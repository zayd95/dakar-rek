import * as THREE from 'three';

/**
 * The cockpit at the wheel (« Au volant »), one kit for every car: a dashboard across the view, a steering wheel that turns with the car, the cluster in
 * front of the driver (the speed in km/h, the revs) and a centre screen (the next turn and the distance left when there are directions, else the radio's
 * station, else the time). It is placed in the CAMERA's space each frame, framed by the field of view so it always sits in the same band of the screen,
 * above the touch pad's controls and under the road: on any car, in any phone held upright or sideways. Two trims: « city » (grey plastic, a small screen:
 * the Teranga, the Rafet, the saloons) and « premium » (dark leather, a metal strip, a wider screen: the Lamane Sport, the Gaïndé, the berline).
 * Drawn over the car's own inside (depth test off, a high render order); 5 draw calls; the two screens are redrawn at most 4 times a second.
 */
export type Trim = 'city' | 'premium';
export interface CockpitState { kmh: number; rpm: number; steer: number; nav: { glyph: string; dist: string; text: string } | null; radio: string | null; clock: string }

const TRIMS: Record<Trim, { dash: number; top: number; strip: number; wheel: number; hub: number; screenW: number }> = {
  city: { dash: 0x2c2e33, top: 0x3a3d43, strip: 0x55585f, wheel: 0x1c1d20, hub: 0x45474d, screenW: 0.1 },
  premium: { dash: 0x231d1a, top: 0x2f2723, strip: 0xb9bcc2, wheel: 0x1a1513, hub: 0x8a6a3a, screenW: 0.13 },
};

const coloured = (g: THREE.BufferGeometry, color: number) => {
  const c = new THREE.Color(color), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
};
const overlay = <M extends THREE.Material>(m: M, order: number, mesh: THREE.Mesh) => { m.depthTest = false; m.depthWrite = false; mesh.renderOrder = order; mesh.frustumCulled = false; return mesh; };

export class CockpitKit {
  readonly group = new THREE.Group();
  private dash: THREE.Mesh; private wheel: THREE.Group; private wheelSpin: THREE.Mesh; private cluster: THREE.Mesh; private screen: THREE.Mesh;
  private cv1: HTMLCanvasElement | null = null; private cv2: HTMLCanvasElement | null = null;
  private tex1: THREE.CanvasTexture | null = null; private tex2: THREE.CanvasTexture | null = null;
  private drawT = 0; private key = '';
  private own: { dispose(): void }[] = [];

  constructor(readonly trim: Trim) {
    const T = TRIMS[trim], g = this.group; g.name = 'cockpit_kit'; g.visible = false;
    // the dashboard: a wide body, its padded top lit a little lighter, a strip of trim along it (metal on the premium trim)
    const dg = new THREE.BoxGeometry(1, 0.2, 0.35); dg.translate(0, -0.1, 0); coloured(dg, T.dash);
    const tg = new THREE.BoxGeometry(1.02, 0.02, 0.36); tg.translate(0, 0.005, 0); coloured(tg, T.top);
    const sg = new THREE.BoxGeometry(1.02, 0.012, 0.01); sg.translate(0, -0.045, 0.18); coloured(sg, T.strip);
    const hg = new THREE.BoxGeometry(0.22, 0.05, 0.12); hg.translate(0, 0.035, -0.03); coloured(hg, T.dash);            // the cluster's hood
    const dashGeo = mergeBoxes([dg, tg, sg, hg]), dm = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x16171a });
    this.dash = overlay(dm, 20, new THREE.Mesh(dashGeo, dm)); this.dash.rotation.x = 0.22; g.add(this.dash);
    // the wheel: a rim, a hub, three spokes; it turns with the car's steering
    const rim = coloured(new THREE.TorusGeometry(0.1, 0.011, 8, 28), T.wheel), hub = coloured(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12).rotateX(Math.PI / 2), T.hub);
    const spokes = [0, 2.1, -2.1].map(a => { const b = new THREE.BoxGeometry(0.1, 0.014, 0.008); b.translate(0.05, 0, 0); b.rotateZ(a - Math.PI / 2); return coloured(b, T.wheel); });
    const wm = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x111214 });
    this.wheelSpin = overlay(wm, 23, new THREE.Mesh(mergeBoxes([rim, hub, ...spokes]), wm));
    this.wheel = new THREE.Group(); this.wheel.rotation.x = -0.35; this.wheel.add(this.wheelSpin); g.add(this.wheel);
    // the two screens: canvas textures, unlit (they glow), drawn on demand
    const doc = typeof document !== 'undefined';
    if (doc) {
      this.cv1 = document.createElement('canvas'); this.cv1.width = 256; this.cv1.height = 104; this.tex1 = new THREE.CanvasTexture(this.cv1); this.tex1.colorSpace = THREE.SRGBColorSpace;
      this.cv2 = document.createElement('canvas'); this.cv2.width = 256; this.cv2.height = 160; this.tex2 = new THREE.CanvasTexture(this.cv2); this.tex2.colorSpace = THREE.SRGBColorSpace;
    }
    const m1 = new THREE.MeshBasicMaterial({ map: this.tex1, color: doc ? 0xffffff : 0x111111 }), m2 = new THREE.MeshBasicMaterial({ map: this.tex2, color: doc ? 0xffffff : 0x111111 });
    const p1 = new THREE.PlaneGeometry(0.18, 0.073), p2 = new THREE.PlaneGeometry(T.screenW, T.screenW * 0.625);
    this.cluster = overlay(m1, 22, new THREE.Mesh(p1, m1)); this.screen = overlay(m2, 22, new THREE.Mesh(p2, m2));
    this.screen.rotation.y = -0.28; g.add(this.cluster, this.screen);
    this.own.push(dashGeo, dm, this.wheelSpin.geometry, wm, p1, p2, m1, m2, ...(this.tex1 ? [this.tex1] : []), ...(this.tex2 ? [this.tex2] : []));
  }

  /** Framed in the camera's view: the dashboard's top at a quarter of the height below the middle, the wheel under it, the screen to the right. */
  place(camera: THREE.PerspectiveCamera) {
    const g = this.group, tan = Math.tan((camera.fov * Math.PI) / 360), asp = camera.aspect;
    const at = (o: THREE.Object3D, ndcX: number, ndcY: number, d: number) => o.position.set(ndcX * d * tan * asp, ndcY * d * tan, -d);
    at(this.dash, 0, -0.22, 0.62); this.dash.scale.setScalar(Math.max(1, 0.62 * tan * asp * 2.2));          // as wide as the view at least
    at(this.cluster, 0, -0.165, 0.6);
    at(this.wheel, 0, -0.62, 0.5);                                                                // under the cluster, never across it: the speed stays readable
    at(this.screen, Math.min(0.62, 0.32 / asp), -0.3, 0.58);
    g.position.copy(camera.position); g.quaternion.copy(camera.quaternion); g.updateMatrixWorld(true);
  }

  update(s: CockpitState, dt: number) {
    this.wheelSpin.rotation.z = -s.steer * 2.2;
    this.drawT -= dt; if (this.drawT > 0) return; this.drawT = 0.25;
    const key = `${Math.round(s.kmh)}|${Math.round(s.rpm * 20)}|${s.nav ? `${s.nav.glyph}${s.nav.dist}` : ''}|${s.radio ?? ''}|${s.clock}`;
    if (key === this.key) return; this.key = key;
    this.drawCluster(s); this.drawScreen(s);
  }

  private drawCluster(s: CockpitState) {
    const cv = this.cv1, t = this.tex1; if (!cv || !t) return;
    const c = cv.getContext('2d')!; c.fillStyle = '#07080a'; c.fillRect(0, 0, 256, 104);
    // the revs: an arc of amber segments
    const n = 12, on = Math.round(Math.max(0, Math.min(1, s.rpm)) * n);
    for (let i = 0; i < n; i++) { c.fillStyle = i < on ? (i > 9 ? '#ef4444' : '#f59e0b') : '#2a2c31'; c.fillRect(14 + i * 19, 10, 15, 8); }
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '800 54px system-ui, sans-serif'; c.fillText(String(Math.round(s.kmh)), 118, 62);
    c.font = '700 18px system-ui, sans-serif'; c.fillStyle = '#9aa3ad'; c.fillText('km/h', 206, 72);
    c.font = '600 15px system-ui, sans-serif'; c.fillText(s.clock, 206, 40);
    t.needsUpdate = true;
  }
  private drawScreen(s: CockpitState) {
    const cv = this.cv2, t = this.tex2; if (!cv || !t) return;
    const c = cv.getContext('2d')!, prem = this.trim === 'premium';
    c.fillStyle = prem ? '#0b1220' : '#0d1117'; c.fillRect(0, 0, 256, 160);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (s.nav) {
      c.fillStyle = '#ffd23f'; c.font = '800 64px system-ui, sans-serif'; c.fillText(s.nav.glyph, 128, 58);
      c.fillStyle = '#ffffff'; c.font = '800 30px system-ui, sans-serif'; c.fillText(s.nav.dist, 128, 112);
      c.fillStyle = '#9aa3ad'; c.font = '600 16px system-ui, sans-serif'; c.fillText(s.nav.text.split(' · ').pop()!.slice(0, 26), 128, 142);
    } else if (s.radio) {
      c.fillStyle = '#ffd23f'; c.font = '700 22px system-ui, sans-serif'; c.fillText('RADIO', 128, 38);
      c.fillStyle = '#ffffff'; c.font = '800 28px system-ui, sans-serif'; c.fillText(s.radio.slice(0, 18), 128, 86);
    } else {
      c.fillStyle = '#ffffff'; c.font = '800 44px system-ui, sans-serif'; c.fillText(s.clock, 128, 70);
      c.fillStyle = '#9aa3ad'; c.font = '600 18px system-ui, sans-serif'; c.fillText('Dakar Rek', 128, 118);
    }
    t.needsUpdate = true;
  }

  dispose() { for (const o of this.own) o.dispose(); this.group.removeFromParent(); }
}

function mergeBoxes(gs: THREE.BufferGeometry[]) {
  // the pieces carry the same attributes (position, normal, uv, colour): merged by hand to keep the kit free of the examples' utilities in the tests
  const nonIndexed = gs.map(g => (g.index ? g.toNonIndexed() : g));
  const total = nonIndexed.reduce((n, g) => n + g.getAttribute('position').count, 0), out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color'] as const) {
    const size = nonIndexed[0].getAttribute(name).itemSize, arr = new Float32Array(total * size); let o = 0;
    for (const g of nonIndexed) { const a = g.getAttribute(name).array as Float32Array; arr.set(a, o); o += a.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  for (const g of gs) g.dispose();
  return out;
}
