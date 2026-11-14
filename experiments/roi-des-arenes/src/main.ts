import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Locomotion } from './locomotion';
import { ContactHold, ContactPractice } from './contact-practice';
import { createAccessories, type AccessorySet } from './accessories';
import { applyFaceAtlas, loadFaceAssets, applyFaceSkin, applyTexturedFeatures, type FaceAssets } from './face-material';
import { surfaceMaterial, shortHair, finishEyes, finishBrows } from './character-finish';
import { MotionInput, keyDirections, type Direction } from './motion-input';

type Profile = 'athletic' | 'heavy' | 'both';
type View = 'front' | 'side' | 'back' | 'quarter';
type Study = { root: THREE.Group; body: THREE.SkinnedMesh; rest: Map<THREE.Bone, THREE.Quaternion>; restPositions: Map<THREE.Bone, THREE.Vector3>; skins: THREE.MeshStandardMaterial[]; eyeMaterials: THREE.MeshStandardMaterial[]; accessories: AccessorySet };
const stage = document.querySelector<HTMLDivElement>('#stage')!;
const status = document.querySelector<HTMLDivElement>('#status')!;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const studies: Study[] = [];
let selected: Profile = 'both';
let view: View = 'quarter';
let faceDetail = false;
let faceAssets: FaceAssets | undefined;
const previousFace = new URLSearchParams(location.search).get('face') === 'previous';
const baselineFinish = new URLSearchParams(location.search).get('finish') === 'baseline';
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let camera: THREE.PerspectiveCamera;
let scene: THREE.Scene;
let animationId = 0;
let rotating = false;
let loaded = false;
let practice = false;
let contactMode = false;
let contact: ContactPractice | undefined;
const contactHold = new ContactHold();
let contactMarker: THREE.Mesh;
let walker: Locomotion | undefined;
let practiceFloor: THREE.Group;
let floor: THREE.Mesh;
const motionInput = new MotionInput();
const motionStatus = document.querySelector<HTMLElement>('#motion-status')!;

function clearInput() {
  motionInput.clear();
  contactHold.clear();
  contact?.cancel();
  walker?.setInput(new THREE.Vector3());
  document.querySelectorAll('[data-move]').forEach(b => b.classList.remove('held'));
  document.querySelector('#hold-contact')!.classList.remove('held');
}

function movementInput() {
  const directions = motionInput.directions();
  const forward = controls.target.clone().sub(camera.position).setY(0).normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
  const desired = new THREE.Vector3();
  if (directions.has('forward')) desired.add(forward);
  if (directions.has('back')) desired.sub(forward);
  if (directions.has('right')) desired.add(right);
  if (directions.has('left')) desired.sub(right);
  return desired.normalize();
}

function setMode(mode: string) {
  const next = mode !== 'study';
  clearInput();
  contact?.dispose(); contact = undefined;
  walker?.restore();
  practice = next;
  contactMode = mode === 'contact';
  faceDetail = false;
  document.querySelector('#face-detail')!.setAttribute('aria-pressed', 'false');
  rotating = false;
  document.querySelector('#rotate')!.setAttribute('aria-pressed', 'false');
  stage.closest('.workbench')!.classList.toggle('practice', next);
  document.querySelector('aside')!.classList.toggle('practice', next);
  document.querySelectorAll<HTMLElement>('[data-practice]').forEach(el => el.hidden = !next);
  updateButtons('[data-mode]', 'data-mode', mode);
  document.querySelectorAll<HTMLElement>('[data-contact]').forEach(el => el.hidden = !contactMode);
  document.querySelector('#hold-contact')!.setAttribute('aria-pressed', 'false');
  document.querySelector<HTMLElement>('#practice-instructions')!.textContent = contactMode
    ? 'Approcher le partenaire. À portée, maintenir Espace ou « Maintenir le contact ». Relâcher, puis relâcher les directions avant de repartir.'
    : 'Choisir un lutteur et marcher avec les flèches, ZQSD / WASD ou les boutons de la scène.';
  document.querySelector<HTMLElement>('#practice-title')!.textContent = contactMode ? 'APPROCHER · TENIR · RELÂCHER' : 'MARCHE LIBRE';
  document.querySelector<HTMLElement>('#reset-practice')!.textContent = contactMode ? 'Replacer les deux' : 'Repartir du centre';
  stage.closest('.workbench')!.classList.toggle('contact', contactMode);
  contactMarker.visible = false;
  practiceFloor.visible = next;
  floor.position.y = next ? 0 : -.062;
  controls.enablePan = !next;
  document.querySelector<HTMLElement>('.stage-help')!.textContent = next ? 'Flèches · ZQSD / WASD · glisser pour tourner' : 'Glisser pour tourner · Pincer pour zoomer';
  document.querySelector('#stage')!.setAttribute('aria-label', next ? 'Test de déplacement. Flèches, ZQSD ou WASD pour marcher ; glisser pour tourner la caméra.' : 'Vue 3D des lutteurs. Glisser pour tourner, molette ou pincement pour zoomer.');
  studies.forEach(s => { s.root.rotation.set(0, 0, 0); s.root.getObjectByName('StudyPlinth')!.visible = !next; });
  pose(false);
  applySelection(next && selected === 'both' ? 'athletic' : selected);
  if (next) stage.focus({ preventScroll: true });
}

function startWalker() {
  const study = studies[selected === 'heavy' ? 1 : 0];
  clearInput();
  contact?.dispose(); contact = undefined;
  walker?.restore();
  studies.forEach(s => s.root.position.set(0, 0, 0));
  if (contactMode) {
    contact = new ContactPractice(study, studies[selected === 'heavy' ? 0 : 1]);
    walker = contact.player;
  } else {
    walker = new Locomotion(study);
    walker.reset();
  }
}
const viewDirections: Record<View, [number, number, number]> = {
  front: [0, .10, 1], side: [1, .1, 0], back: [0, .1, -1], quarter: [.38, .16, 1]
};

function arrangeStudies() {
  const [x, , z] = viewDirections[view];
  const right = new THREE.Vector3(z, 0, -x).normalize();
  studies.forEach((study, index) => {
    study.root.position.copy(right).multiplyScalar(selected === 'both' ? (index === 0 ? -.72 : .72) : 0);
  });
}

function positionLabels() {
  studies.forEach((study, index) => {
    const label = document.querySelector<HTMLElement>(index === 0 ? '#label-a' : '#label-b')!;
    const point = study.root.position.clone().project(camera);
    label.style.left = `${(point.x + 1) * stage.clientWidth / 2}px`;
    label.style.top = `${Math.min((1 - point.y) * stage.clientHeight / 2 + 14, stage.clientHeight - 65)}px`;
    label.hidden = !study.root.visible || Math.abs(point.x) > 1 || point.z > 1;
  });
}

function updateButtons(selector: string, attribute: string, value: string) {
  document.querySelectorAll<HTMLButtonElement>(selector).forEach(button => {
    const active = button.getAttribute(attribute) === value;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function fail(message: string) {
  clearInput();
  loaded = false;
  rotating = false;
  cancelAnimationFrame(animationId);
  stage.classList.add('error');
  status.hidden = false;
  status.replaceChildren(document.createTextNode(message + ' '));
  const retry = document.createElement('button');
  retry.textContent = 'Réessayer';
  retry.style.cssText = 'margin:12px auto 0;display:block;padding:10px 16px;background:#242d27;color:white';
  retry.addEventListener('click', () => location.reload());
  status.append(retry);
  document.querySelectorAll<HTMLButtonElement>('button:not(#status button)').forEach(b => b.disabled = true);
}

function fitCamera(resetAngle = true) {
  if (resetAngle && !practice) arrangeStudies();
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  const visibleWidth = contactMode ? 4.0 : practice ? 3.2 : selected === 'both' ? 3.0 : 1.65;
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const distance = Math.max(2.45 / (2 * Math.tan(verticalFov / 2)), visibleWidth / (2 * Math.tan(verticalFov / 2) * camera.aspect));
  controls.minDistance = faceDetail ? .42 : 1.4;
  controls.maxDistance = distance * 2.0;
  const direction = resetAngle
    ? new THREE.Vector3(...viewDirections[view]).normalize()
    : camera.position.clone().sub(controls.target).normalize();
  controls.target.set(0, faceDetail ? 1.80 : 1.02, 0);
  if (practice && walker && !contactMode) controls.target.add(walker.study.root.position);
  camera.position.copy(controls.target).addScaledVector(direction, (faceDetail ? Math.max(.75, (selected === 'both' ? 2.1 : .55) / (2 * Math.tan(verticalFov / 2) * camera.aspect)) : distance * 1.1));
  controls.update();
}

function applySelection(profile: Profile) {
  selected = profile;
  studies.forEach((study, index) => {
    study.root.visible = contactMode || profile === 'both' || (profile === 'athletic' ? index === 0 : index === 1);
  });
  updateButtons('[data-profile]', 'data-profile', profile);
  const compare = document.querySelector<HTMLButtonElement>('#compare')!;
  compare.classList.toggle('active', profile === 'both');
  compare.setAttribute('aria-pressed', String(profile === 'both'));
  document.querySelector<HTMLElement>('#label-a')!.hidden = profile === 'heavy';
  document.querySelector<HTMLElement>('#label-b')!.hidden = profile === 'athletic';
  if (practice) startWalker();
  document.querySelector('#label-a strong')!.textContent = contactMode ? (profile === 'athletic' ? 'VOUS · ATHLÉTIQUE' : 'PARTENAIRE') : 'ATHLÉTIQUE';
  document.querySelector('#label-b strong')!.textContent = contactMode ? (profile === 'heavy' ? 'VOUS · PUISSANT' : 'PARTENAIRE') : 'PUISSANT';
  fitCamera();
}

// Rotate the anatomical bone axis in world space; retain the original rig.
function aimBone(bone: THREE.Bone, direction: THREE.Vector3) {
  bone.updateWorldMatrix(true, false);
  const current = bone.getWorldQuaternion(new THREE.Quaternion());
  const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(current);
  const turn = new THREE.Quaternion().setFromUnitVectors(axis.normalize(), direction.normalize());
  const parent = bone.parent!.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parent.invert().multiply(turn.multiply(current)));
  bone.updateWorldMatrix(false, true);
}

function pose(anatomy: boolean) {
  studies.forEach(study => {
    study.rest.forEach((q, bone) => bone.quaternion.copy(q));
    study.restPositions.forEach((p, bone) => bone.position.copy(p));
    study.root.updateMatrixWorld(true);
    if (!anatomy) {
      for (const side of ['Left', 'Right']) {
        const sign = side === 'Left' ? 1 : -1;
        const upper = study.root.getObjectByName(side + 'Arm') as THREE.Bone;
        const fore = study.root.getObjectByName(side + 'ForeArm') as THREE.Bone;
        if (upper) aimBone(upper, new THREE.Vector3(sign * .30, -1, .05));
        if (fore) aimBone(fore, new THREE.Vector3(sign * .12, -1, .15));
      }
    }
    study.root.updateMatrixWorld(true);
    study.body.skeleton.update();
  });
  updateButtons('[data-pose]', 'data-pose', anatomy ? 'anatomy' : 'relaxed');
}

function shorts(body: THREE.SkinnedMesh) {
  const source = body.geometry;
  const position = source.getAttribute('position');
  const normals = source.getAttribute('normal');
  const indices = source.index!;
  const joints = source.getAttribute('skinIndex');
  const weights = source.getAttribute('skinWeight');
  const targets = source.morphAttributes.position;
  const normalTargets = source.morphAttributes.normal;
  const lowerBody = new Set(['Hips', 'LHipJoint', 'RHipJoint', 'LeftUpLeg', 'RightUpLeg', 'LowerBack']);
  const coverage = (vertex: number) => [0, 1, 2, 3].reduce((sum, component) =>
    sum + (lowerBody.has(body.skeleton.bones[joints.getComponent(vertex, component)].name) ? weights.getComponent(vertex, component) : 0), 0);
  const readSkin = (index: number) => {
    const skin = new Map<number, number>();
    for (let c = 0; c < 4; c++) {
      const joint = joints.getComponent(index, c);
      skin.set(joint, (skin.get(joint) || 0) + weights.getComponent(index, c));
    }
    return skin;
  };
  type Vertex = { p: THREE.Vector3; n: THREE.Vector3; dp: THREE.Vector3[]; dn: THREE.Vector3[]; skin: Map<number, number> };
  const read = (index: number): Vertex => ({
    p: new THREE.Vector3().fromBufferAttribute(position, index),
    n: new THREE.Vector3().fromBufferAttribute(normals, index),
    dp: targets.map(a => new THREE.Vector3().fromBufferAttribute(a, index)),
    dn: normalTargets.map(a => new THREE.Vector3().fromBufferAttribute(a, index)),
    skin: readSkin(index)
  });
  const height = (v: Vertex) => v.p.y + v.dp.reduce((sum, d, i) => sum + d.y * body.morphTargetInfluences![i], 0);
  const interpolate = (a: Vertex, b: Vertex, t: number): Vertex => {
    const skin = new Map<number, number>();
    a.skin.forEach((w, j) => skin.set(j, w * (1 - t)));
    b.skin.forEach((w, j) => skin.set(j, (skin.get(j) || 0) + w * t));
    return { p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t),
      dp: a.dp.map((d, i) => d.clone().lerp(b.dp[i], t)),
      dn: a.dn.map((d, i) => d.clone().lerp(b.dn[i], t)), skin };
  };
  // Clip against actual morphed heights, preserving the rig and morph attributes.
  const clip = (polygon: Vertex[], boundary: number, above: boolean) => {
    const result: Vertex[] = [];
    polygon.forEach((b, i) => {
      const a = polygon[(i + polygon.length - 1) % polygon.length];
      const ah = height(a), bh = height(b);
      const aInside = above ? ah >= boundary : ah <= boundary;
      const bInside = above ? bh >= boundary : bh <= boundary;
      if (aInside !== bInside) result.push(interpolate(a, b, (boundary - ah) / (bh - ah)));
      if (bInside) result.push(b);
    });
    return result;
  };
  const positions: number[] = [], normalData: number[] = [], skinIndices: number[] = [], skinWeights: number[] = [];
  const morphPositions = targets.map(() => [] as number[]);
  const morphNormals = targets.map(() => [] as number[]);
  const offset = .014;
  const emit = (v: Vertex) => {
    const baseNormal = v.n.clone().normalize();
    positions.push(...v.p.clone().addScaledVector(baseNormal, offset).toArray());
    normalData.push(...baseNormal.toArray());
    v.dp.forEach((d, i) => {
      const targetNormal = v.n.clone().add(v.dn[i]).normalize();
      const normalDelta = targetNormal.sub(baseNormal);
      morphPositions[i].push(...d.clone().addScaledVector(normalDelta, offset).toArray());
      morphNormals[i].push(...normalDelta.toArray());
    });
    const skin = [...v.skin].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = skin.reduce((sum, [, w]) => sum + w, 0);
    for (let i = 0; i < 4; i++) {
      skinIndices.push(skin[i]?.[0] || 0);
      skinWeights.push((skin[i]?.[1] || 0) / total);
    }
  };
  for (let i = 0; i < indices.count; i += 3) {
    const triangle = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
    if (!triangle.every(v => coverage(v) > .7)) continue;
    const polygon = clip(clip(triangle.map(read), .63, true), .99, false);
    for (let j = 1; j + 1 < polygon.length; j++) [polygon[0], polygon[j], polygon[j + 1]].forEach(emit);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normalData, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = morphPositions.map(data => new THREE.Float32BufferAttribute(data, 3));
  geometry.morphAttributes.normal = morphNormals.map(data => new THREE.Float32BufferAttribute(data, 3));
  const material = baselineFinish ? new THREE.MeshStandardMaterial({ color: '#273b3a', roughness: .97 }) : surfaceMaterial('#273b3a', 'fabric');
  material.side = THREE.DoubleSide;
  const garment = new THREE.SkinnedMesh(geometry, material);
  garment.name = 'NeutralStudyShorts';
  garment.bind(body.skeleton, body.bindMatrix);
  garment.morphTargetInfluences = [...body.morphTargetInfluences!];
  garment.morphTargetDictionary = { ...body.morphTargetDictionary };
  garment.castShadow = true;
  garment.frustumCulled = false;
  body.parent!.add(garment);
}

function createStudy(original: THREE.Group, heavy: boolean): Study {
  const root = new THREE.Group();
  const model = clone(original);
  root.add(model);
  const rest = new Map<THREE.Bone, THREE.Quaternion>();
  const restPositions = new Map<THREE.Bone, THREE.Vector3>();
  const skins: THREE.MeshStandardMaterial[] = [];
  const eyeMaterials: THREE.MeshStandardMaterial[] = [];
  let body: THREE.SkinnedMesh | undefined;
  model.traverse(object => {
    if (object instanceof THREE.Bone) { rest.set(object, object.quaternion.clone()); restPositions.set(object, object.position.clone()); }
    if (!(object instanceof THREE.SkinnedMesh)) return;
    object.geometry = object.geometry.clone();
    object.morphTargetInfluences!.fill(0);
    object.morphTargetInfluences![heavy ? 1 : 0] = 1;
    object.frustumCulled = false;
    object.castShadow = true;
    object.receiveShadow = false;
    const color = object.name === 'Body' ? (baselineFinish ? (heavy ? '#79452d' : '#895036') : (heavy ? '#654530' : '#77513a')) : object.name === 'Eyes' ? (baselineFinish ? '#ddd2b9' : '#bfb3a1') : '#241a14';
    const material = object.name === 'Body' && !baselineFinish ? surfaceMaterial(color, 'skin') : new THREE.MeshStandardMaterial({ color, roughness: object.name === 'Body' ? .58 : baselineFinish ? .75 : object.name === 'Eyes' ? .3 : .9, metalness: 0 });
    material.vertexColors = object.name === 'Body';
    object.material = material;
    if (object.name === 'Body') {
      if (faceAssets && !baselineFinish && !previousFace) { object.geometry = applyFaceAtlas(object.geometry, faceAssets.atlas); applyFaceSkin(material, faceAssets.skin, heavy); }
      body = object; skins.push(material);
    }
    else eyeMaterials.push(material);
  });
  if (!body) throw new Error('Body mesh missing');
  shorts(body);
  if (!baselineFinish) {
    eyeMaterials.push(shortHair(body));
    if (faceAssets && !previousFace) eyeMaterials.push(...applyTexturedFeatures(model, faceAssets));
    else { eyeMaterials.push(...finishEyes(model)); const browMaterial = finishBrows(model); if (browMaterial) eyeMaterials.push(browMaterial); }
  } else {
  // Simple new iris/pupil geometry, positioned on the source neutral eye centres.
  const head = model.getObjectByName('Head');
  if (head) {
    model.updateMatrixWorld(true);
    for (const sign of [-1, 1]) {
      const irisMaterial = new THREE.MeshStandardMaterial({ color: '#291c13', roughness: .47 });
      const iris = new THREE.Mesh(new THREE.SphereGeometry(.008, 16, 10), irisMaterial);
      const point = new THREE.Vector3(sign * .032, 1.682, .149);
      head.worldToLocal(point);
      iris.position.copy(point);
      iris.scale.z = .35;
      head.add(iris);
      eyeMaterials.push(irisMaterial);
    }
  }
  }
  // Both are displayed at a common scale; physique differences are vertex morphs.
  const accessories = createAccessories(body);
  eyeMaterials.push(...accessories.materials);
  root.scale.setScalar(1.07);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(.57, .61, .045, 64), new THREE.MeshStandardMaterial({ color: '#d6daca', roughness: .9 }));
  plinth.name = 'StudyPlinth';
  plinth.position.y = -.038;
  plinth.receiveShadow = true;
  root.add(plinth);
  scene.add(root);
  return { root, body, rest, restPositions, skins, eyeMaterials, accessories };
}

function materials() {
  const clay = document.querySelector<HTMLInputElement>('#clay')!.checked;
  const wire = document.querySelector<HTMLInputElement>('#wireframe')!.checked;
  studies.forEach((study, index) => {
    study.skins.forEach(material => {
      material.color.set(clay ? '#b6a990' : baselineFinish ? (index === 0 ? '#895036' : '#79452d') : (index === 0 ? '#77513a' : '#654530')); 
      material.roughness = clay ? .94 : baselineFinish ? .58 : .76;
      material.vertexColors = !clay;
      if (material.userData.faceDetail) material.userData.faceDetail.value = clay ? 0 : 1;
      material.wireframe = wire;
      material.needsUpdate = true;
    });
    study.eyeMaterials.forEach(material => {
      material.wireframe = wire;
      material.needsUpdate = true;
    });
  });
}

async function init() {
  document.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.disabled = true);
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch {
    fail('La vue 3D nécessite WebGL. Activer l’accélération graphique du navigateur, puis réessayer.');
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor('#e4e7df');
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    fail('La vue 3D a été interrompue. Fermer les autres vues 3D, puis réessayer.');
  });
  stage.prepend(renderer.domElement);
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#e4e7df');
  scene.fog = new THREE.Fog('#e4e7df', 8, 22);
  camera = new THREE.PerspectiveCamera(36, 1, .05, 60);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minPolarAngle = .3;
  controls.maxPolarAngle = Math.PI / 2 + .15;
  controls.autoRotateSpeed = .9;
  controls.addEventListener('start', () => {
    rotating = false;
    document.querySelector('#rotate')!.setAttribute('aria-pressed', 'false');
  });
  scene.add(new THREE.HemisphereLight('#ffefda', '#5c695e', 2.6));
  const key = new THREE.DirectionalLight('#fff0dd', 4.3);
  key.position.set(-3, 5, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  key.shadow.normalBias = .035;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#e0edff', 2.2);
  rim.position.set(3, 3, -3);
  scene.add(rim);
  floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#e4e7df', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.062;
  floor.receiveShadow = true;
  scene.add(floor);
  practiceFloor = new THREE.Group();
  const grid = new THREE.GridHelper(6.3, 14, '#a5afa0', '#c5ccbe');
  grid.position.y = .003;
  practiceFloor.add(grid);
  const border = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-3.15, .005, -3.15), new THREE.Vector3(3.15, .005, -3.15),
    new THREE.Vector3(3.15, .005, 3.15), new THREE.Vector3(-3.15, .005, 3.15)
  ]), new THREE.LineBasicMaterial({ color: '#9c5336' }));
  practiceFloor.add(border);
  practiceFloor.visible = false;
  scene.add(practiceFloor);
  contactMarker = new THREE.Mesh(new THREE.RingGeometry(.38, .43, 64), new THREE.MeshBasicMaterial({ color: '#a64226', side: THREE.DoubleSide }));
  contactMarker.rotation.x = -Math.PI / 2;
  contactMarker.visible = false;
  scene.add(contactMarker);
  fitCamera();
  const loader = new GLTFLoader();
  // A finite timeout avoids an indefinitely inaccessible loading screen.
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const gltf = await Promise.race([
      loader.loadAsync(import.meta.env.BASE_URL + 'assets/anatomy-study.glb'),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Loading timed out')), 20000); })
    ]);
    if (stage.classList.contains('error')) return;
    if (!baselineFinish && !previousFace) {
      try {
        const candidate = await loadFaceAssets(import.meta.env.BASE_URL + 'assets/');
        const sourceBody = gltf.scene.getObjectByName('Body');
        if (!(sourceBody instanceof THREE.SkinnedMesh)) throw new Error('Face body unavailable');
        // Validate the entire seam remap before committing the optional finish.
        applyFaceAtlas(sourceBody.geometry, candidate.atlas).dispose();
        for (const name of ['Eyes', 'Brows', 'Lashes']) {
          const component = gltf.scene.getObjectByName(name);
          if (!(component instanceof THREE.SkinnedMesh) || !component.geometry.getAttribute('uv')) throw new Error('Face UV component unavailable');
        }
        faceAssets = candidate;
      }
      catch (error) { console.warn('Face detail unavailable; keeping the previous study finish', error); document.querySelector('.note strong')!.textContent = 'Modèles de travail · détails de peau indisponibles'; }
    }
    studies.push(createStudy(gltf.scene, false), createStudy(gltf.scene, true));
    pose(false);
    loaded = true;
    status.hidden = true;
    document.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.disabled = false);
    applySelection('both');
  } catch (error) {
    console.error('Study asset load failed', error);
    fail('Les modèles n’ont pas pu être chargés. Vérifier la connexion à l’aperçu, puis réessayer.');
    return;
  } finally {
    clearTimeout(timeout);
  }
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => {
    button.addEventListener('click', () => {
      view = button.dataset.view as View;
      updateButtons('[data-view]', 'data-view', view);
      rotating = false;
      document.querySelector('#rotate')!.setAttribute('aria-pressed', 'false');
      fitCamera();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-profile]').forEach(button => button.addEventListener('click', () => applySelection(button.dataset.profile as Profile)));
  document.querySelector('#compare')!.addEventListener('click', () => applySelection('both'));
  document.querySelector('#face-detail')!.addEventListener('click', () => { faceDetail = !faceDetail; document.querySelector('#face-detail')!.setAttribute('aria-pressed', String(faceDetail)); fitCamera(); });
  document.querySelector('#reset-camera')!.addEventListener('click', () => fitCamera());
  document.querySelector('#rotate')!.addEventListener('click', () => {
    rotating = !rotating;
    document.querySelector('#rotate')!.setAttribute('aria-pressed', String(rotating));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-pose]').forEach(button => button.addEventListener('click', () => pose(button.dataset.pose === 'anatomy')));
  document.querySelector('#clay')!.addEventListener('change', materials);
  document.querySelector('#wireframe')!.addEventListener('change', materials);
  for (const part of ['arms', 'waist', 'chest'] as const) {
    const accessoryInput = document.querySelector<HTMLButtonElement>('#accessory-' + part)!;
    // Pointer fitting controls keep stage keyboard ownership; deliberate Tab /
    // keyboard focus changes still use the existing blur cancellation policy.
    accessoryInput.addEventListener('pointerdown', event => {
      if (practice && document.activeElement === stage) event.preventDefault();
    });
    accessoryInput.addEventListener('click', () => {
      const visible = accessoryInput.getAttribute('aria-checked') !== 'true';
      accessoryInput.setAttribute('aria-checked', String(visible));
      studies.forEach(s => s.accessories.setVisible(part, visible));
    });
  }
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode!)));
  document.querySelector('#reset-practice')!.addEventListener('click', () => { startWalker(); fitCamera(); stage.focus({ preventScroll: true }); });
  document.querySelector('#stop-practice')!.addEventListener('click', clearInput);
  const holdButton = document.querySelector<HTMLButtonElement>('#hold-contact')!;
  holdButton.addEventListener('pointerdown', e => {
    if (!contactMode || !loaded) return;
    e.preventDefault(); stage.focus({ preventScroll: true });
    holdButton.setPointerCapture(e.pointerId);
    contactHold.press('pointer:' + e.pointerId);
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    holdButton.addEventListener(event, e => contactHold.release('pointer:' + e.pointerId));
  }
  holdButton.addEventListener('keydown', e => {
    if (contactMode && ['Space', 'Enter'].includes(e.code)) { e.preventDefault(); if (!e.repeat) contactHold.press('button:' + e.code); }
  });
  holdButton.addEventListener('keyup', e => contactHold.release('button:' + e.code));
  holdButton.addEventListener('blur', () => { contactHold.release('button:Space'); contactHold.release('button:Enter'); });
  document.querySelectorAll<HTMLButtonElement>('[data-move]').forEach(button => {
    button.addEventListener('pointerdown', e => {
      if (!practice || !loaded) return;
      e.preventDefault();
      stage.focus({ preventScroll: true });
      button.setPointerCapture(e.pointerId);
      motionInput.pressPointer(e.pointerId, button.dataset.move as Direction);
      button.classList.add('held');
    });
    const release = (e: PointerEvent) => {
      motionInput.releasePointer(e.pointerId);
      button.classList.toggle('held', [...motionInput.pointers.values()].includes(button.dataset.move as Direction));
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('keydown', e => {
      if (practice && [' ', 'Enter'].includes(e.key)) { e.preventDefault(); if (!e.repeat) motionInput.pressPointer(-1, button.dataset.move as Direction); }
    });
    button.addEventListener('keyup', () => motionInput.releasePointer(-1));
    button.addEventListener('blur', () => motionInput.releasePointer(-1));
  });
  stage.addEventListener('keyup', e => motionInput.releaseKey(e.code));
  window.addEventListener('keyup', e => { motionInput.releaseKey(e.code); if (e.code === 'Space') contactHold.release('stage:Space'); });
  stage.addEventListener('blur', () => { motionInput.clearKeys(); contactHold.release('stage:Space'); contact?.cancel(); });
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearInput(); });
  stage.addEventListener('keydown', event => {
    if (event.target !== stage) return;
    if (contactMode && event.code === 'Space') { event.preventDefault(); if (!event.repeat) contactHold.press('stage:Space'); return; }
    if (practice && keyDirections[event.code]) { event.preventDefault(); if (!event.repeat) motionInput.pressKey(event.code); return; }
    if (event.key === 'Home') { event.preventDefault(); fitCamera(); }
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), event.key === 'ArrowLeft' ? .15 : -.15);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    }
    if (['+', '-', '='].includes(event.key)) {
      event.preventDefault();
      const offset = camera.position.clone().sub(controls.target);
      const distance = THREE.MathUtils.clamp(offset.length() * (event.key === '-' ? 1.1 : .9), controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(offset.setLength(distance));
      controls.update();
    }
  });
  new ResizeObserver(() => { if (loaded) fitCamera(false); }).observe(stage);
  let previous = performance.now();
  function render(now: number) {
    if (!loaded) return;
    animationId = requestAnimationFrame(render);
    const dt = Math.min((now - previous) / 1000, .1);
    if (practice && walker && !document.hidden) {
      const desired = movementInput();
      if (contact) contact.update(dt, desired, contactHold.held);
      else { walker.setInput(desired); walker.update(dt); }
      const target = (contact ? contact.player.study.root.position.clone().add(contact.opponent.study.root.position).multiplyScalar(.5) : walker.study.root.position.clone()).add(new THREE.Vector3(0, 1.02, 0));
      const offset = target.sub(controls.target);
      controls.target.add(offset); camera.position.add(offset);
      const speed = walker.speed;
      const text = contact ? contact.active ? 'Contact maintenu' : contact.inspect().awaitNeutral ? 'Relâcher les commandes' : contact.distance <= contact.enterDistance ? 'À portée · maintenir Espace' : 'Approcher le partenaire' : speed > .03 ? 'En marche' : 'Au repos';
      if (motionStatus.textContent !== text) motionStatus.textContent = text;
      if (contact) {
        contactMarker.visible = true;
        contactMarker.position.copy(contact.opponent.study.root.position).setY(.012);
        (contactMarker.material as THREE.MeshBasicMaterial).color.set(contact.active ? '#316b51' : '#a64226');
        holdButton.classList.toggle('held', contactHold.held);
        holdButton.setAttribute('aria-pressed', String(contactHold.held));
        document.querySelector('#contact-distance')!.textContent = `${contact.distance.toFixed(2)} m · portée ${contact.enterDistance.toFixed(1)} m`;
      }
    }
    controls.autoRotate = rotating && !practice;
    // Updates consume elapsed time; rotation speed is independent of display refresh.
    controls.update(dt);
    previous = now;
    if (!document.hidden) {
      renderer.render(scene, camera); positionLabels();
      if (new URLSearchParams(location.search).has('qa')) {
        stage.dataset.qa = JSON.stringify({ mode: contactMode ? 'contact' : practice ? 'practice' : 'study', accessories: studies.map(s => s.accessories.inspect()), contact: contact?.inspect() ?? null, contactHeld: contactHold.held, selected, inputCount: motionInput.count,
          locomotion: practice ? walker?.inspect() : null, faceDetail, texturedFace: !!faceAssets && !previousFace, faceMix: studies.map(s => s.skins[0].userData.faceDetail?.value ?? 0), faceVertices: studies.map(s => s.body.geometry.getAttribute('position').count), finish: baselineFinish ? 'baseline' : 'refined', hairCount: studies.filter(s => s.root.getObjectByName('OriginalShortHair')).length, garmentCount: studies.reduce((n, s) => n + (s.root.getObjectByName('NeutralStudyShorts') ? 1 : 0), 0) });
      }
    }
  }
  animationId = requestAnimationFrame(render);
  window.addEventListener('pagehide', () => { clearInput(); cancelAnimationFrame(animationId); controls.dispose(); renderer.dispose(); });
  if (reducedMotion) rotating = false;
  // Read-only inspection surface for reproducible QA; no city/game state involved.
  Object.defineProperty(window, '__rdaStudy', { value: () => ({
    loaded, selected, view, rotating, mode: contactMode ? 'contact' : practice ? 'practice' : 'study', contact: contact?.inspect() ?? null, locomotion: practice ? walker?.inspect() : null,
    inputCount: motionInput.count,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    asset: 'anatomy-study.glb',
    visibleStudies: studies.filter(s => s.root.visible).length,
    camera: camera.position.toArray(),
    studyMorphs: studies.map(s => s.body.morphTargetInfluences),
    garmentCount: studies.reduce((n, s) => n + (s.root.getObjectByName('NeutralStudyShorts') ? 1 : 0), 0)
  }), configurable: false });
  if (new URLSearchParams(location.search).get('mode') === 'contact') setMode('contact');
}

void init();
