import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Sample = { p: THREE.Vector3; skin: Map<number, number>; normal?: THREE.Vector3 };
type Section = { centre: THREE.Vector3; axis: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3; points: Sample[]; names: string[] };
export type AccessorySet = { arms: THREE.Object3D[]; waist: THREE.Object3D[]; chest: THREE.Object3D[]; materials: THREE.MeshStandardMaterial[]; setVisible: (part: 'arms' | 'waist' | 'chest', visible: boolean) => void; inspect: () => unknown };
const count = 64;
const mix = (a: Sample, b: Sample, t: number): Sample => {
  const skin = new Map<number, number>();
  a.skin.forEach((w, j) => skin.set(j, w * (1 - t)));
  b.skin.forEach((w, j) => skin.set(j, (skin.get(j) || 0) + w * t));
  return { p: a.p.clone().lerp(b.p, t), skin, normal: a.normal && b.normal ? a.normal.clone().lerp(b.normal, t).normalize() : undefined };
};
const cross = (a: THREE.Vector2, b: THREE.Vector2) => a.x * b.y - a.y * b.x;

// Original external fitting placeholders only. No inscriptions or sacred contents.
export function createAccessories(body: THREE.SkinnedMesh): AccessorySet {
  body.updateWorldMatrix(true, true); body.skeleton.update();
  const g = body.geometry, indices = g.index!;
  const skinI = g.getAttribute('skinIndex'), skinW = g.getAttribute('skinWeight');
  const samples: Sample[] = [];
  for (let i = 0; i < g.getAttribute('position').count; i++) {
    const skin = new Map<number, number>();
    for (let j = 0; j < 4; j++) skin.set(skinI.getComponent(i, j), (skin.get(skinI.getComponent(i, j)) || 0) + skinW.getComponent(i, j));
    const normal = new THREE.Vector3().fromBufferAttribute(g.getAttribute('normal'), i);
    (g.morphAttributes.normal || []).forEach((a, j) => normal.addScaledVector(new THREE.Vector3().fromBufferAttribute(a, i), body.morphTargetInfluences?.[j] || 0));
    normal.transformDirection(body.matrixWorld);
    samples.push({ p: body.localToWorld(body.getVertexPosition(i, new THREE.Vector3())), skin, normal });
  }
  const arms: THREE.Object3D[] = [], waist: THREE.Object3D[] = [], chest: THREE.Object3D[] = [];
  const leather = new THREE.MeshStandardMaterial({ color: '#61341e', roughness: .85, side: THREE.DoubleSide });
  const cord = new THREE.MeshStandardMaterial({ color: '#352316', roughness: .98 });
  const thread = new THREE.MeshStandardMaterial({ color: '#c6aa77', roughness: 1 });
  const sections: { name: string; radiusMin: number; radiusMax: number }[] = [];
  const anchors: { name: string; bone: string; local: number[]; surfaceClearance: number }[] = [];

  function section(origin: THREE.Vector3, axis: THREE.Vector3, u: THREE.Vector3, names: string[], name: string, record = true): Section {
    axis = axis.clone().normalize(); u = u.clone().addScaledVector(axis, -u.dot(axis)).normalize();
    const v = new THREE.Vector3().crossVectors(axis, u).normalize();
    let segments: [Sample, Sample][] = [];
    for (let i = 0; i < indices.count; i += 3) {
      const tri = [0, 1, 2].map(j => samples[indices.getX(i + j)]);
      const hits: Sample[] = [];
      for (let j = 0; j < 3; j++) {
        const a = tri[j], b = tri[(j + 1) % 3];
        const da = a.p.clone().sub(origin).dot(axis), db = b.p.clone().sub(origin).dot(axis);
        if ((da <= 0 && db > 0) || (db <= 0 && da > 0)) hits.push(mix(a, b, da / (da - db)));
      }
      if (hits.length === 2) segments.push([hits[0], hits[1]]);
    }
    // Plane cuts can also hit the torso or opposite limb. Select the complete
    // connected contour nearest this anchor, rather than filtering by weights
    // (which tears holes at shoulder blends and distorts the heavy physique).
    const key = (s: Sample) => s.p.toArray().map(x => Math.round(x * 100000)).join(',');
    const linked = new Map<string, number[]>();
    segments.forEach((segment, i) => segment.forEach(s => linked.set(key(s), [...(linked.get(key(s)) || []), i])));
    const visited = new Set<number>(), contours: [Sample, Sample][][] = [];
    for (let i = 0; i < segments.length; i++) {
      if (visited.has(i)) continue;
      const pending = [i], contour: [Sample, Sample][] = [];
      while (pending.length) {
        const j = pending.pop()!; if (visited.has(j)) continue;
        visited.add(j); contour.push(segments[j]);
        segments[j].forEach(s => (linked.get(key(s)) || []).forEach(k => { if (!visited.has(k)) pending.push(k); }));
      }
      if (contour.length >= 12) contours.push(contour);
    }
    const score = (contour: [Sample, Sample][]) => new THREE.Box3().setFromPoints(contour.flat().map(s => s.p)).getCenter(new THREE.Vector3()).distanceTo(origin);
    contours.sort((a, b) => score(a) - score(b));
    segments = contours[0] || [];
    if (score(segments) > (names.includes('Hips') ? .3 : .18)) throw new Error('Accessory contour too far from anchor: ' + name);
    if (segments.length < 8) throw new Error('Accessory fitting section unavailable: ' + name);
    // Recenter the contour: a shared bone can sit asymmetrically inside heavy flesh.
    const xy = (p: THREE.Vector3) => { const d = p.clone().sub(origin); return new THREE.Vector2(d.dot(u), d.dot(v)); };
    const bounds = new THREE.Box2().setFromPoints(segments.flat().map(s => xy(s.p)));
    const c = bounds.getCenter(new THREE.Vector2());
    const centre = origin.clone().addScaledVector(u, c.x).addScaledVector(v, c.y);
    const points: Sample[] = [];
    for (let j = 0; j < count; j++) {
      const ray = new THREE.Vector2(Math.cos(j / count * Math.PI * 2), Math.sin(j / count * Math.PI * 2));
      let hit: Sample | undefined, nearest = Infinity;
      for (const [a, b] of segments) {
        const p = xy(a.p).sub(c), edge = xy(b.p).sub(c).sub(p);
        const determinant = cross(ray, edge);
        if (Math.abs(determinant) < 1e-9) continue;
        const t = cross(p, edge) / determinant, s = cross(p, ray) / determinant;
        if (t > 0 && s >= -1e-6 && s <= 1 + 1e-6 && t < nearest) { nearest = t; hit = mix(a, b, THREE.MathUtils.clamp(s, 0, 1)); }
      }
      if (!hit) throw new Error('Accessory contour gap: ' + name + '/' + j);
      points.push(hit);
    }
    const radii = points.map(s => s.p.distanceTo(centre));
    if (record) sections.push({ name, radiusMin: Math.min(...radii), radiusMax: Math.max(...radii) });
    return { centre, axis, u, v, points, names };
  }

  function surfaceMesh(name: string, rows: Sample[][], material: THREE.Material, closedRows = false, closedColumns = true) {
    const positions: number[] = [], joints: number[] = [], weights: number[] = [], triangles: number[] = [];
    rows.forEach(row => row.forEach(s => {
      positions.push(...body.worldToLocal(s.p.clone()).toArray());
      const sorted = [...s.skin].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = sorted.reduce((n, [, w]) => n + w, 0);
      for (let j = 0; j < 4; j++) { joints.push(sorted[j]?.[0] || 0); weights.push((sorted[j]?.[1] || 0) / sum); }
    }));
    for (let r = 0; r < (closedRows ? rows.length : rows.length - 1); r++) for (let j = 0; j < (closedColumns ? count : count - 1); j++) {
      const a = r * count + j, b = r * count + (j + 1) % count;
      const d = ((r + 1) % rows.length) * count + j, c = ((r + 1) % rows.length) * count + (j + 1) % count;
      triangles.push(a, b, d, b, c, d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(joints, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    geometry.setIndex(triangles); geometry.computeVertexNormals();
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = name; mesh.bind(body.skeleton, body.bindMatrix); mesh.frustumCulled = false; mesh.castShadow = true;
    body.parent!.add(mesh); return mesh;
  }

  const offset = (s: Section, amount: number, useNormals = false) => s.points.map(p => ({ p: p.p.clone().addScaledVector(useNormals ? p.normal! : p.p.clone().sub(s.centre).normalize(), amount), skin: p.skin }));
  function rope(s: Section, name: string, target: THREE.Object3D[], clearance = .009, useNormals = false) {
    const rows = Array.from({ length: 6 }, (_, j) => {
      const phase = j / 6 * Math.PI * 2;
      // Sample the tube's full width, including shoulder blends, instead of
      // translating a single contour across the changing morphed flesh.
      const slice = section(s.centre.clone().addScaledVector(s.axis, Math.sin(phase) * .003), s.axis, s.u, s.names, name + j, false);
      return offset(slice, clearance + Math.cos(phase) * .003, useNormals);
    });
    target.push(surfaceMesh(name, rows, cord, true));
  }

  function pouch(s: Section, angle: number, boneName: string, name: string, width: number, height: number, target: THREE.Object3D[], gap?: number) {
    const i = Math.round(angle / (2 * Math.PI) * count + count) % count;
    const front = s.points[i].p.clone().sub(s.centre).normalize();
    const up = s.axis.clone().multiplyScalar(boneName.includes('Arm') ? -1 : 1);
    const right = new THREE.Vector3().crossVectors(up, front).normalize(); up.crossVectors(front, right).normalize();
    const at = s.points[i].p.clone();
    // Fit the whole rear plane against the local flesh patch, not only its centre.
    let extent = 0;
    for (const sample of samples) {
      const d = sample.p.clone().sub(at);
      if (Math.abs(d.dot(right)) <= width * .65 && Math.abs(d.dot(up)) <= height * .65 && Math.abs(d.dot(front)) < .1) extent = Math.max(extent, d.dot(front));
    }
    const depth = .024, clearance = gap ?? (boneName.includes('Arm') ? .012 : .023);
    at.addScaledVector(front, extent + clearance + depth / 2);
    const bone = body.skeleton.bones.find(b => b.name === boneName)!;
    const holder = new THREE.Group(); holder.name = name;
    holder.position.copy(bone.worldToLocal(at));
    const rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, front));
    holder.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
    bone.add(holder);
    const shape = new THREE.Shape(), w = width / 2, h = height / 2, r = .005;
    shape.moveTo(-w + r, -h); shape.lineTo(w - r, -h); shape.quadraticCurveTo(w, -h, w, -h + r);
    shape.lineTo(w, h - r); shape.quadraticCurveTo(w, h, w - r, h); shape.lineTo(-w + r, h);
    shape.quadraticCurveTo(-w, h, -w, h - r); shape.lineTo(-w, -h + r); shape.quadraticCurveTo(-w, -h, -w + r, -h);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: depth - .004, bevelEnabled: true, bevelSize: .002, bevelThickness: .002, bevelSegments: 2, steps: 1, curveSegments: 3 });
    geometry.translate(0, 0, -depth / 2 + .002);
    const mesh = new THREE.Mesh(geometry, leather); mesh.castShadow = true; holder.add(mesh);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(width * .88, height * .28, .003), leather);
    flap.position.set(0, height * .27, depth / 2 + .0015); holder.add(flap);
    const stitches: THREE.BufferGeometry[] = [];
    for (const sign of [-1, 1]) for (let j = 0; j < 6; j++) {
      const a = new THREE.Vector3(sign * (w - .006), -h + .009 + j * (height - .018) / 6, depth / 2 + .001);
      const b = a.clone().add(new THREE.Vector3(0, .004, 0));
      stitches.push(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, .0008, 4, false));
    }
    holder.add(new THREE.Mesh(mergeGeometries(stitches), thread)); stitches.forEach(g => g.dispose());
    anchors.push({ name, bone: boneName, local: holder.position.toArray(), surfaceClearance: clearance });
    target.push(holder);
  }

  for (const side of ['Left', 'Right']) {
    const arm = body.skeleton.bones.find(b => b.name === side + 'Arm')!;
    const elbow = body.skeleton.bones.find(b => b.name === side + 'ForeArm')!;
    const shoulder = arm.getWorldPosition(new THREE.Vector3()), direction = elbow.getWorldPosition(new THREE.Vector3()).sub(shoulder);
    // Keep the upper edge below the heavy physique's armpit when arms lower.
    const origin = shoulder.clone().addScaledVector(direction, .70), axis = direction.clone().normalize();
    const a = section(origin.clone().addScaledVector(axis, -.018), axis, new THREE.Vector3(0, 0, 1), [side + 'Arm'], side + 'ArmUpper');
    const b = section(origin.clone().addScaledVector(axis, .018), axis, new THREE.Vector3(0, 0, 1), [side + 'Arm'], side + 'ArmLower');
    arms.push(surfaceMesh(side + 'AccessoryBand', [offset(a, .004), offset(b, .004)], leather));
    rope(a, side + 'AccessoryCord', arms); rope(b, side + 'AccessoryCordLower', arms);
    pouch(a, 0, side + 'Arm', side + 'AccessoryPouch', .068, .082, arms);
  }
  const waistNames = ['Hips', 'LowerBack', 'Spine'];
  const a = section(new THREE.Vector3(0, 1.012, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), waistNames, 'WaistUpper');
  const b = section(new THREE.Vector3(0, .997, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), waistNames, 'WaistLower');
  waist.push(surfaceMesh('WaistAccessoryBand', [offset(a, .019), offset(b, .019)], leather));
  rope(a, 'WaistAccessoryCord', waist, .024);
  const low = section(new THREE.Vector3(0, .985, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), waistNames, 'WaistPouches');
  for (const [j, angle] of [-.62, 0, .62].entries()) pouch(low, angle, 'Hips', 'WaistAccessoryPouch' + j, .062, .074, waist);

  // Original crossed torso cords, fitted from the actual physique's front/back
  // surface. Photo references guide arrangement only, not copied individual kits.
  const torsoTriangles = Array.from({ length: indices.count / 3 }, (_, i) => {
    const vertices = [0, 1, 2].map(j => samples[indices.getX(i * 3 + j)]);
    return { vertices, triangle: new THREE.Triangle(...vertices.map(s => s.p) as [THREE.Vector3, THREE.Vector3, THREE.Vector3]),
      minX: Math.min(...vertices.map(s => s.p.x)), maxX: Math.max(...vertices.map(s => s.p.x)),
      minY: Math.min(...vertices.map(s => s.p.y)), maxY: Math.max(...vertices.map(s => s.p.y)) };
  }).filter(t => t.maxY >= 1 && t.minY <= 1.56 && t.minX <= .2 && t.maxX >= -.2);
  function torsoPoint(x: number, y: number, front: boolean): Sample & { normal: THREE.Vector3 } {
    const ray = new THREE.Ray(new THREE.Vector3(x, y, front ? 2 : -2), new THREE.Vector3(0, 0, front ? -1 : 1));
    let found: (Sample & { normal: THREE.Vector3 }) | undefined, distance = Infinity;
    for (const t of torsoTriangles) {
      if (x < t.minX || x > t.maxX || y < t.minY || y > t.maxY) continue;
      const p = ray.intersectTriangle(t.triangle.a, t.triangle.b, t.triangle.c, false, new THREE.Vector3());
      if (!p || p.distanceTo(ray.origin) >= distance) continue;
      const bary = t.triangle.getBarycoord(p, new THREE.Vector3())!;
      const skin = new Map<number, number>();
      t.vertices.forEach((s, j) => s.skin.forEach((w, bone) => skin.set(bone, (skin.get(bone) || 0) + w * bary.getComponent(j))));
      found = { p, skin, normal: t.triangle.getNormal(new THREE.Vector3()) }; distance = p.distanceTo(ray.origin);
    }
    if (!found) throw new Error('Chest cord surface unavailable');
    return found;
  }
  const lowerChest = section(new THREE.Vector3(0, 1.055, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), waistNames, 'ChestLower');
  rope(lowerChest, 'ChestLowerCord', chest);
  for (const front of [true, false]) for (const sign of [-1, 1]) {
    const shoulder = torsoPoint(sign * .125, 1.42, front);
    const startAnchor = { p: shoulder.p.clone().addScaledVector(shoulder.normal, .009), skin: shoulder.skin };
    const start = startAnchor.p;
    const lowerPoints = offset(lowerChest, .009);
    let endIndex = 0, endError = Infinity;
    lowerPoints.forEach((s, i) => {
      if ((s.p.z - lowerChest.centre.z) * (front ? 1 : -1) < 0) return;
      const error = Math.abs(s.p.x + sign * .145);
      if (error < endError) { endError = error; endIndex = i; }
    });
    const endAnchor = lowerPoints[endIndex];
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(start.x, start.y, 0), new THREE.Vector3(sign * .11, 1.39, 0),
      new THREE.Vector3(sign * .085, 1.36, 0), new THREE.Vector3(0, 1.26, 0),
      new THREE.Vector3(-sign * .09, 1.13, 0), new THREE.Vector3(endAnchor.p.x, endAnchor.p.y, 0)
    ], false, 'centripetal');
    const rows = Array.from({ length: 6 }, (_, r) => Array.from({ length: count }, (_, j) => {
      const t = j / (count - 1), at = path.getPoint(t), tangent = path.getTangent(t);
      const perpendicular = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
      const phase = r / 6 * Math.PI * 2;
      // Share the loop centreline at each terminal ring. Independent normal /
      // radial offsets otherwise leave small visible gaps at sloping surfaces.
      if (j === 0 || j === count - 1) {
        const anchor = j === 0 ? startAnchor : endAnchor;
        const normal = j === 0 ? shoulder.normal : lowerChest.points[endIndex].p.clone().sub(lowerChest.centre).normalize();
        return { p: anchor.p.clone().addScaledVector(perpendicular, Math.cos(phase) * .0025).addScaledVector(normal, Math.sin(phase) * .0025), skin: anchor.skin };
      }
      const p = at.clone().addScaledVector(perpendicular, Math.cos(phase) * .0025);
      const sample = torsoPoint(p.x, p.y, front);
      // One strand passes above the other at the X; endpoints meet the shoulder /
      // lower torso fittings instead of sharing a coplanar self-intersection.
      const crossingLift = sign === 1 ? .008 * Math.exp(-(((at.y - 1.26) / .035) ** 2)) : 0;
      sample.p.addScaledVector(sample.normal, .009 + crossingLift + Math.sin(phase) * .0025);
      return sample;
    }));
    chest.push(surfaceMesh(`Chest${front ? 'Front' : 'Back'}Cord${sign}`, rows, cord, true, false));
  }
  // Each upper attachment goes over its own shoulder, leaving the neck clear.
  for (const sign of [-1, 1]) {
    const x = sign * .125, centre = new THREE.Vector3(x, 1.40, 0);
    const front = torsoPoint(x, 1.42, true), back = torsoPoint(x, 1.42, false);
    const firstAngle = Math.atan2(front.p.y - centre.y, front.p.z);
    const lastAngle = Math.atan2(back.p.y - centre.y, back.p.z);
    const rows = Array.from({ length: 6 }, (_, r) => Array.from({ length: count }, (_, j) => {
      const phase = r / 6 * Math.PI * 2, t = j / (count - 1);
      const angle = THREE.MathUtils.lerp(firstAngle, lastAngle, t);
      const direction = new THREE.Vector3(0, Math.sin(angle), Math.cos(angle));
      const origin = centre.clone().addScaledVector(direction, 2); origin.x += Math.cos(phase) * .0025;
      const ray = new THREE.Ray(origin, direction.clone().negate());
      let sample: Sample | undefined, distance = Infinity;
      for (const triangle of torsoTriangles) {
        if (origin.x < triangle.minX || origin.x > triangle.maxX) continue;
        const p = ray.intersectTriangle(triangle.triangle.a, triangle.triangle.b, triangle.triangle.c, false, new THREE.Vector3());
        if (!p || p.distanceTo(origin) >= distance) continue;
        distance = p.distanceTo(origin);
        const bary = triangle.triangle.getBarycoord(p, new THREE.Vector3())!;
        const skin = new Map<number, number>();
        triangle.vertices.forEach((s, k) => s.skin.forEach((w, bone) => skin.set(bone, (skin.get(bone) || 0) + w * bary.getComponent(k))));
        const normal = triangle.triangle.getNormal(new THREE.Vector3());
        sample = { p: p.addScaledVector(normal, .009 + Math.sin(phase) * .0025), skin };
      }
      if (!sample) throw new Error('Shoulder cord surface unavailable');
      return sample;
    }));
    chest.push(surfaceMesh(`ChestShoulderCord${sign}`, rows, cord, true, false));
  }
  const sternum = section(new THREE.Vector3(0, 1.26, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), ['Spine', 'Spine1'], 'ChestPouch');
  pouch(sternum, 0, 'Spine1', 'ChestAccessoryPouch', .045, .055, chest, .022);
  const parts = { arms, waist, chest };
  return { arms, waist, chest, materials: [leather, cord, thread], setVisible: (part, visible) => parts[part].forEach(o => o.visible = visible),
    inspect: () => ({ arms: arms.every(o => o.visible), waist: waist.every(o => o.visible), chest: chest.every(o => o.visible), pouches: anchors.length, sections, anchors }) };
}
