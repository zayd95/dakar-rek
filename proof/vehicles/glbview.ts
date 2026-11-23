// A bare viewer for a generated body (any GLB under the project): ?src=/assets-src/... &views=front,side,... renders each view when window.show(view) is called.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const q = new URLSearchParams(location.search), src = q.get('src')!;
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(innerWidth, innerHeight); document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xb8d4e8);
scene.add(new THREE.HemisphereLight(0xffffff, 0x777788, 1.1)); const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(3, 5, 2); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.MeshLambertMaterial({ color: 0x8d8a82 })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
const cam = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 200);
const gltf = await new GLTFLoader().loadAsync(src);
const g = gltf.scene; scene.add(g);
const wire = q.has('wire');
g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { const mat = m.material as THREE.MeshStandardMaterial; if (!mat.map && !q.has('keep')) m.material = new THREE.MeshStandardMaterial({ color: 0xb9bdc2, metalness: 0.3, roughness: 0.45 }); if (wire) (m.material as THREE.MeshStandardMaterial).wireframe = true; } });
g.rotation.y = Number(q.get('yaw') ?? 0) * Math.PI / 180;
const box = new THREE.Box3().setFromObject(g); g.position.y -= box.min.y; const b = new THREE.Box3().setFromObject(g), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
(window as unknown as Record<string, unknown>).size = [s.x, s.y, s.z]; (window as unknown as Record<string, unknown>).box = [b.min.toArray(), b.max.toArray()];
const d = Math.max(s.x, s.z) * 1.9;
const V: Record<string, [number, number, number]> = { side: [c.x, s.y * 0.5, c.z + d], front: [c.x + d, s.y * 0.6, c.z], rear: [c.x - d, s.y * 0.6, c.z], threeq: [c.x + d * 0.75, s.y * 1.2, c.z + d * 0.75], threeqr: [c.x - d * 0.75, s.y * 1.2, c.z + d * 0.75], top: [c.x, d * 1.1, c.z + 0.01] };
(window as unknown as Record<string, unknown>).show = (v: string) => { const p = V[v]; cam.position.set(...p); cam.lookAt(c.x, s.y * 0.45, c.z); r.render(scene, cam); };
// a free camera and a pixel picker (the hit point and its UV): window.look(x,y,z, lx,ly,lz, fov), window.pick(px, py)
const ray = new THREE.Raycaster();
(window as unknown as Record<string, unknown>).look = (x: number, y: number, z: number, lx: number, ly: number, lz: number, fov = 32) => { cam.fov = fov; cam.updateProjectionMatrix(); cam.position.set(x, y, z); cam.lookAt(lx, ly, lz); r.render(scene, cam); };
(window as unknown as Record<string, unknown>).pick = (px: number, py: number) => { ray.setFromCamera(new THREE.Vector2(px / innerWidth * 2 - 1, -(py / innerHeight) * 2 + 1), cam); const h = ray.intersectObject(g, true)[0]; return h ? { p: h.point.toArray(), uv: h.uv ? h.uv.toArray() : null } : null; };
(window as unknown as Record<string, unknown>).ready = true;
