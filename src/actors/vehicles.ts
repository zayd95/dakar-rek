import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Batch } from '../world/batch';

const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c });
function bx(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m;
}

/** Blender-made car rapide (public/assets/car_rapide.glb), loaded at start-up when present. */
let rapideTemplate: THREE.Group | null = null;
export const assetStatus = { carRapide: 'TEMP procedural' as 'TEMP procedural' | 'Blender GLB' };

export async function preloadAssets(base = import.meta.env.BASE_URL): Promise<void> {
  try {
    const res = await fetch(`${base}assets/car_rapide.glb`);
    if (!res.ok) return;
    const buf = await res.arrayBuffer();
    const gltf = await new GLTFLoader().parseAsync(buf, '');
    const g = new THREE.Group(); g.name = 'car_rapide_blender';
    gltf.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        const old = m.material as THREE.MeshStandardMaterial;
        m.material = new THREE.MeshLambertMaterial({ color: old.color });
      }
    });
    g.add(gltf.scene);
    rapideTemplate = g; assetStatus.carRapide = 'Blender GLB';
  } catch { /* keep the temporary model */ }
}

/** Shared vertex-coloured material for procedural vehicles (one draw call per vehicle body). */
const vehicleMat = new THREE.MeshLambertMaterial({ vertexColors: true });
let rapideGeo: THREE.BufferGeometry | null = null;
let rapideDecals: { side: THREE.Material; front: THREE.Material; back: THREE.Material } | null = null;

// Car rapide palette, after Habib's references (7 Oct 2026): indigo lower body, white band, yellow top.
const CR = { yellow: 0xf4c430, blue: 0x2b3a8f, white: 0xf4f1e8, dark: 0x1d1d1f, glass: 0x22303c, chrome: 0xc2c6ca, rack: 0xe9b31c };

/**
 * Painted panels of the car rapide, drawn in code. Motifs follow the references: "TRANSPORT EN COMMUN" on the white
 * band, a multicoloured diamond in the middle of the blue panel, fish, birds, stars, crescent and star, green-yellow-red
 * stripes, painted eyes on the front. All lettering is authored here (no generated text). UNREVIEWED: motifs and words
 * are to be checked by Habib; no real person's name or company is painted.
 */
function rapidePaint() {
  if (rapideDecals) return rapideDecals;
  const mk = (w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const m = new THREE.MeshLambertMaterial({ map: t }); m.userData.shared = true; return m;
  };
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  const star = (c: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) => {
    c.fillStyle = col; c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.fill();
  };
  const fish = (c: CanvasRenderingContext2D, x: number, y: number, s: number, col: string) => {
    c.fillStyle = col; c.beginPath(); c.ellipse(x, y, 16 * s, 7 * s, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(x + 14 * s, y); c.lineTo(x + 26 * s, y - 8 * s); c.lineTo(x + 26 * s, y + 8 * s); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x - 9 * s, y - 2 * s, 2 * s, 0, Math.PI * 2); c.fill();
  };
  const bird = (c: CanvasRenderingContext2D, x: number, y: number, s: number, col: string) => {
    c.strokeStyle = col; c.lineWidth = 3 * s; c.beginPath(); c.moveTo(x - 14 * s, y); c.quadraticCurveTo(x - 6 * s, y - 9 * s, x, y); c.quadraticCurveTo(x + 6 * s, y - 9 * s, x + 14 * s, y); c.stroke();
  };
  const flagStripes = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    for (const [i, col] of ['#1a9d54', '#f4c20d', '#d9322b'].entries()) { c.fillStyle = col; c.fillRect(x + (i * w) / 3, y, w / 3, h); }
    star(c, x + w / 2, y + h / 2, h * 0.32, '#1a9d54');
  };
  // Side panel, 6.4 m × 1.25 m: white band on top (text), blue panel below (motifs). Mirrored use on both sides.
  const side = mk(1024, 200, c => {
    c.fillStyle = hex(CR.white); c.fillRect(0, 0, 1024, 46);
    c.fillStyle = '#d9322b'; c.fillRect(0, 44, 1024, 4); c.fillStyle = '#1a9d54'; c.fillRect(0, 0, 1024, 3);
    c.fillStyle = '#1b2a7a'; c.font = 'italic 900 30px system-ui, sans-serif'; c.textBaseline = 'middle';
    c.fillText('TRANSPORT', 250, 24); c.font = 'italic 700 22px system-ui, sans-serif'; c.fillText('en', 456, 25);
    c.font = 'italic 900 30px system-ui, sans-serif'; c.fillText('COMMUN', 500, 24);
    star(c, 220, 24, 10, '#d9322b'); star(c, 680, 24, 10, '#1a9d54'); flagStripes(c, 720, 10, 54, 28);
    c.fillStyle = hex(CR.blue); c.fillRect(0, 48, 1024, 152);
    c.strokeStyle = '#f4f1e8'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 60); c.lineTo(1024, 60); c.moveTo(0, 188); c.lineTo(1024, 188); c.stroke();
    // central diamond (losange) in four colours with a white outline
    const dx = 512, dy = 124;
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(dx, dy - 56); c.lineTo(dx + 92, dy); c.lineTo(dx, dy + 56); c.lineTo(dx - 92, dy); c.fill();
    const tri = (a: [number, number], b: [number, number], col: string) => { c.fillStyle = col; c.beginPath(); c.moveTo(dx, dy); c.lineTo(...a); c.lineTo(...b); c.fill(); };
    tri([dx, dy - 48], [dx + 80, dy], '#d9322b'); tri([dx + 80, dy], [dx, dy + 48], '#1a9d54'); tri([dx, dy + 48], [dx - 80, dy], '#f4c20d'); tri([dx - 80, dy], [dx, dy - 48], '#e8742c');
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(dx, dy - 14); c.lineTo(dx + 24, dy); c.lineTo(dx, dy + 14); c.lineTo(dx - 24, dy); c.fill();
    // garlands of leaves either side of the diamond
    for (const sgn of [-1, 1]) for (let k = 0; k < 7; k++) {
      const x = dx + sgn * (110 + k * 26), y = dy + Math.sin(k * 0.9) * 8;
      c.fillStyle = k % 2 ? '#4fb26a' : '#e8742c'; c.beginPath(); c.ellipse(x, y, 11, 5, sgn * 0.5, 0, Math.PI * 2); c.fill();
    }
    fish(c, 140, 100, 1.1, '#7fc4e8'); fish(c, 880, 104, 1.1, '#f4c20d'); bird(c, 70, 150, 1.2, '#f4f1e8'); bird(c, 960, 150, 1.2, '#f4f1e8');
    for (const [x, y] of [[300, 92], [340, 160], [700, 92], [740, 160], [40, 90], [990, 90]] as [number, number][]) star(c, x, y, 9, '#f4c20d');
    // crescent and star
    c.fillStyle = '#f4c20d'; c.beginPath(); c.arc(240, 130, 20, 0, Math.PI * 2); c.fill(); c.fillStyle = hex(CR.blue); c.beginPath(); c.arc(248, 125, 18, 0, Math.PI * 2); c.fill(); star(c, 262, 122, 7, '#f4c20d');
  });
  // Front: blue face with painted eyes and a white strip reading ALHAMDOULILAH (common on car rapides; UNREVIEWED)
  const front = mk(256, 128, c => {
    c.fillStyle = hex(CR.blue); c.fillRect(0, 0, 256, 128);
    c.fillStyle = hex(CR.white); c.fillRect(0, 0, 256, 30);
    c.fillStyle = '#1b2a7a'; c.font = 'italic 900 17px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ALHAMDOULILAH', 128, 16);
    for (const x of [62, 194]) { // painted eyes
      c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(x, 66, 30, 16, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#3a7bd5'; c.beginPath(); c.arc(x, 66, 11, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#111111'; c.beginPath(); c.arc(x, 66, 5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#f4c20d'; c.lineWidth = 3; c.beginPath(); c.ellipse(x, 66, 30, 16, 0, 0, Math.PI * 2); c.stroke();
    }
    star(c, 128, 64, 12, '#f4c20d');
    c.fillStyle = '#c2c6ca'; for (let y = 90; y < 124; y += 7) c.fillRect(70, y, 116, 4);                   // grille
  });
  // Back: yellow with stripes and a painted star
  const back = mk(256, 256, c => {
    c.fillStyle = hex(CR.yellow); c.fillRect(0, 0, 256, 256);
    c.fillStyle = hex(CR.blue); c.fillRect(0, 150, 256, 106);
    c.fillStyle = hex(CR.white); c.fillRect(0, 138, 256, 14);
    c.fillStyle = '#22303c'; c.fillRect(18, 14, 100, 60); c.fillRect(138, 14, 100, 60);             // rear windows
    flagStripes(c, 88, 88, 80, 40); star(c, 40, 200, 14, '#f4c20d'); star(c, 216, 200, 14, '#f4c20d');
  });
  rapideDecals = { side, front, back };
  return rapideDecals;
}

/**
 * TEMPORARY procedural car rapide (until a Blender model): Saviem-style minibus after Habib's references —
 * rounded front roof, short bonnet, window row, yellow tubular roof rack with luggage, rear ladder, open rear door
 * with the apprentice's step. Front is +z, the rear door at -z. Built once, shared by every instance.
 */
/** Cylinder lying along x, centred on cx (wheels, rounded roof front). */
function axle(b: Batch, r: number, len: number, cx: number, y: number, z: number, col: number, seg: number) {
  b.cyl(r, r, len, cx + len / 2, y, z, col, seg, [0, 0, Math.PI / 2]);
}

function carRapideGeometry(): THREE.BufferGeometry {
  if (rapideGeo) return rapideGeo;
  const b = new Batch();
  const { yellow: Y, blue: BL, white: W, dark: D, glass: GL, chrome: CH, rack: RK } = CR;
  b.box(2.3, 0.95, 6.5, 0, 0.45, -0.1, BL);                                       // lower body (painted panels go on top)
  b.box(2.32, 0.28, 6.52, 0, 1.38, -0.1, W);                                      // white band
  b.box(2.24, 0.92, 5.6, 0, 1.64, -0.55, Y);                                      // passenger cabin
  b.box(2.27, 0.56, 5.3, 0, 1.78, -0.6, GL);                                      // window row
  for (let k = 0; k < 6; k++) b.box(2.29, 0.58, 0.14, 0, 1.77, -3.15 + k * 1.02, Y);
  b.box(2.24, 0.16, 5.6, 0, 2.54, -0.55, W);                                      // white roof
  axle(b, 0.42, 2.24, 0, 2.12, 2.23, Y, 10);                                       // rounded front of the roof
  b.box(2.2, 0.72, 0.9, 0, 1.38, 2.3, Y);                                         // cab front below the windscreen
  b.box(2.12, 0.58, 0.1, 0, 1.72, 2.62, GL);                                      // windscreen
  b.box(2.15, 0.85, 0.9, 0, 0.5, 2.98, BL);                                       // short bonnet
  b.box(2.2, 0.22, 0.2, 0, 0.36, 3.46, CH);                                       // bumper
  for (const sx of [-1, 1]) {
    b.box(0.32, 0.26, 0.06, sx * 0.8, 1.0, 3.44, 0xfff5d0);                      // headlights
    b.box(0.05, 0.6, 0.05, sx * 1.22, 1.75, 2.6, D); b.box(0.06, 0.3, 0.18, sx * 1.3, 2.0, 2.62, D); // mirrors
    for (const z of [-2.15, 2.35]) {
      axle(b, 0.46, 0.34, sx * 1.0, 0.46, z, D, 12);
      axle(b, 0.22, 0.36, sx * 1.0, 0.46, z, W, 10);                              // white hub caps
      axle(b, 0.1, 0.37, sx * 1.0, 0.46, z, BL, 6);
      b.box(0.06, 0.12, 1.2, sx * 1.17, 0.95, z, W);                              // arch trim
    }
  }
  // tubular roof rack with luggage: bags, a basin, bundles under cords
  for (const sx of [-1, 1]) { b.box(0.07, 0.07, 4.6, sx * 1.02, 3.05, -0.8, RK); for (let k = 0; k < 6; k++) b.box(0.06, 0.45, 0.06, sx * 1.02, 2.62, -3.0 + k * 0.88, RK); }
  for (let k = 0; k < 6; k++) b.box(2.04, 0.06, 0.06, 0, 2.66, -3.0 + k * 0.88, RK);
  b.box(1.0, 0.45, 0.8, -0.4, 2.68, -2.4, 0x6b3fa0); b.box(0.8, 0.5, 0.7, 0.45, 2.68, -1.6, 0x8b6a47);
  b.cyl(0.5, 0.35, 0.3, -0.3, 2.68, -0.6, 0x3a8fd1, 10); b.box(0.9, 0.35, 0.6, 0.35, 2.68, 0.3, 0x1a9d54);
  b.box(0.7, 0.4, 0.9, -0.35, 2.68, 1.1, 0xd9482b); b.box(0.5, 0.3, 0.5, 0.45, 2.68, 1.1, 0xf2f2ec);
  // back: ladder on the right, open rear door, step
  for (const dx of [0.62, 0.98]) b.box(0.05, 2.3, 0.05, dx, 0.6, -3.38, D);
  for (let k = 0; k < 7; k++) b.box(0.4, 0.05, 0.06, 0.8, 0.85 + k * 0.32, -3.39, D);
  b.box(0.9, 1.8, 0.06, -1.55, 0.55, -3.0, Y, Math.PI / 2 - 0.25);               // rear door swung open to the left
  b.box(0.8, 0.06, 0.35, -0.4, 0.3, -3.52, CH);                                   // step
  b.box(0.05, 0.05, 1.3, -1.08, 2.2, -3.35, CH, Math.PI / 2);                     // grab bar over the door
  rapideGeo = b.build(vehicleMat, false, false)!.geometry;
  return rapideGeo;
}

/** Car rapide: Blender asset when loaded, otherwise the TEMPORARY procedural model with painted panels. */
export function makeCarRapide(): THREE.Group {
  if (rapideTemplate) return rapideTemplate.clone(true);
  const g = new THREE.Group(); g.name = 'TEMP_car_rapide';
  const m = new THREE.Mesh(carRapideGeometry(), vehicleMat); m.castShadow = true; m.userData.shared = true; g.add(m);
  const paint = rapidePaint();
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(sidePanel(), paint.side); p.position.set(sx * 1.165, 1.0, -0.1); p.rotation.y = sx * Math.PI / 2; p.userData.shared = true; g.add(p);
  }
  const f = new THREE.Mesh(frontPanel(), paint.front); f.position.set(0, 0.78, 3.435); f.userData.shared = true; g.add(f);
  const bk = new THREE.Mesh(backPanel(), paint.back); bk.position.set(0.15, 1.35, -3.36); bk.rotation.y = Math.PI; bk.userData.shared = true; g.add(bk);
  return g;
}
let sideGeo: THREE.PlaneGeometry | null = null, frontGeo: THREE.PlaneGeometry | null = null, backGeo: THREE.PlaneGeometry | null = null;
const sidePanel = () => (sideGeo ??= new THREE.PlaneGeometry(6.4, 1.25));
const frontPanel = () => (frontGeo ??= new THREE.PlaneGeometry(2.05, 0.9));
const backPanel = () => (backGeo ??= new THREE.PlaneGeometry(1.5, 1.5));

/** TEMPORARY decorative taxi (yellow/black). Visual only: decorative traffic has no gameplay collisions. */
export function makeTaxi(color = 0xf0b800): THREE.Group {
  const g = new THREE.Group(); g.name = 'TEMP_taxi';
  const body = lam(color), dark = lam(0x1d1d1d), glass = lam(0x4a6b8a);
  g.add(bx(1.9, 0.8, 4.2, 0, 0.7, 0, body)); g.add(bx(1.7, 0.7, 2.2, 0, 1.4, -0.2, body)); g.add(bx(1.72, 0.45, 2.1, 0, 1.45, -0.2, glass));
  for (const sx of [-1, 1]) for (const z of [-1.4, 1.4]) g.add(bx(0.3, 0.7, 0.7, sx * 0.95, 0.35, z, dark));
  return g;
}
