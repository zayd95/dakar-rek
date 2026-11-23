// Review page for an authored body, drawn the way the game draws it (src/actors/glbVehicle.ts prepare: Lambert, vertex shading):
// ?id=teranga[&tint=0x...]; window.show(view) renders 'side' 'front' 'rear' 'threeq' 'threeqr' 'top' 'low' 'door' 'wheel'. Used by shoot.mjs.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { prepare, tintBody } from '../../../src/actors/glbVehicle';
const q = new URLSearchParams(location.search), id = q.get('id') ?? 'teranga';
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(innerWidth, innerHeight); r.setPixelRatio(1); document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xd7e2ea);
scene.add(new THREE.HemisphereLight(0xf3f6ff, 0x8a7f6c, 1.25));
const sun = new THREE.DirectionalLight(0xfff4e2, 2.1); sun.position.set(4, 7, 3); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: 0xb3aa9a })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.003; scene.add(shadow);
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 200);
const gltf = await new GLTFLoader().loadAsync(`/public/assets/vehicles/${id}.glb?v=${Date.now()}`);
const p = prepare(gltf.scene, false), g = p.scene; scene.add(g);
if (q.get('tint')) tintBody(g, Number(q.get('tint')));
const b = new THREE.Box3().setFromObject(g), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
shadow.scale.set(s.x * 0.95, s.z * 0.98, 1);
const W = window as unknown as Record<string, unknown>;
W.size = [s.x, s.y, s.z]; W.stats = { tris: p.tris, drawCalls: p.drawCalls };
const door = g.getObjectByName('door'), cabin = g.getObjectByName('cabin');
const L = s.z, d = L * 1.65;
const V: Record<string, [number[], number[], number]> = {
  side: [[d * 1.05, s.y * 0.48, 0], [0, s.y * 0.42, 0], 30], front: [[0.4, s.y * 0.62, d], [0, s.y * 0.45, 0], 30], rear: [[-0.4, s.y * 0.66, -d], [0, s.y * 0.5, 0], 30],
  threeq: [[d * 0.72, s.y * 0.85, d * 0.68], [0, s.y * 0.38, 0], 30], threeqr: [[d * 0.7, s.y * 0.95, -d * 0.7], [0, s.y * 0.4, 0], 30],
  top: [[0.01, d * 1.25, 0], [0, 0, 0], 30], low: [[d * 0.42, 0.55, d * 0.55], [0, s.y * 0.45, 0.2], 38],
  door: [[d * 0.62, s.y * 1.0, d * 0.15], [0.2, s.y * 0.5, 0.1], 34], wheel: [[s.x * 1.8, 0.45, s.z * 0.33], [0, 0.35, s.z * 0.3], 26],
  rside: [[-d * 1.05, s.y * 0.48, 0], [0, s.y * 0.42, 0], 30],
};
W.show = (v: string) => {
  const open = v === 'door';
  if (door) door.rotation.y = open ? -1.12 : 0; if (cabin) cabin.visible = open;
  const [pp, look, fov] = V[v]; cam.fov = fov; cam.updateProjectionMatrix(); cam.position.set(pp[0], pp[1], pp[2]); cam.lookAt(look[0], look[1], look[2]); r.render(scene, cam);
};
W.ready = true;
