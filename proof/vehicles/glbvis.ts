// Which triangles of a body can be seen from outside the car? Every triangle gets a unique flat colour (its index), the model is drawn from many directions
// around and above it, and every colour that shows up in a picture is a visible triangle. window.visible(src) -> { total, visible: number[] per mesh name }.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
THREE.ColorManagement.enabled = false;                       // flat ids must come back as they went in
const W = 640, H = 640;
const r = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true }); r.setSize(W, H); r.setPixelRatio(1);
r.outputColorSpace = THREE.LinearSRGBColorSpace; r.setClearColor(0xffffff); document.body.appendChild(r.domElement);
(window as unknown as Record<string, unknown>).visible = async (src: string, dirs = 220) => {
  const gltf = await new GLTFLoader().loadAsync(src), scene = new THREE.Scene(), meshes: THREE.Mesh[] = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const info: { name: string; tris: number; base: number }[] = []; let next = 1;
  for (const m of meshes) {
    const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(), n = src.getAttribute('position').count / 3;
    const col = new Float32Array(n * 9);
    for (let t = 0; t < n; t++) { const id = next + t, c = [((id >> 16) & 255) / 255, ((id >> 8) & 255) / 255, (id & 255) / 255]; for (let k = 0; k < 3; k++) col.set(c, t * 9 + k * 3); }
    src.setAttribute('color', new THREE.BufferAttribute(col, 3)); src.deleteAttribute('uv'); src.deleteAttribute('normal');
    const mesh = new THREE.Mesh(src, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.FrontSide })); mesh.applyMatrix4(m.matrixWorld); scene.add(mesh);
    info.push({ name: m.name || m.parent?.name || 'mesh', tris: n, base: next }); next += n;
  }
  const box = new THREE.Box3().setFromObject(scene), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()), R = s.length() * 0.9;
  const cam = new THREE.OrthographicCamera(-R / 2, R / 2, R / 2, -R / 2, 0.01, R * 4);
  const seen = new Set<number>(), buf = new Uint8Array(W * H * 4), gl = r.getContext();
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < dirs; i++) {                                   // directions spread over the upper hemisphere and the sides (never from far below: the road is there)
    const y = 0.92 - (i / (dirs - 1)) * 1.14, rr = Math.sqrt(Math.max(0, 1 - y * y)), th = i * golden;
    cam.position.set(c.x + Math.cos(th) * rr * R * 1.5, c.y + y * R * 1.5, c.z + Math.sin(th) * rr * R * 1.5); cam.lookAt(c); cam.updateProjectionMatrix();
    r.render(scene, cam); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    for (let p = 0; p < W * H; p++) { const id = (buf[p * 4] << 16) | (buf[p * 4 + 1] << 8) | buf[p * 4 + 2]; if (id > 0 && id < next) seen.add(id); }
  }
  return { total: next - 1, meshes: info.map(m => ({ name: m.name, tris: m.tris, visible: [...seen].filter(id => id >= m.base && id < m.base + m.tris).map(id => id - m.base) })) };
};
(window as unknown as Record<string, unknown>).ready = true;
