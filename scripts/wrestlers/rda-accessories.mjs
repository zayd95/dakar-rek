// Port of Roi des Arènes' accessory generator (experiments/roi-des-arenes/src/accessories.ts, lab/roi-des-arenes-threejs @ 809a9817,
// WEB-007 arm/waist sets and WEB-008 chest X without a neck loop), types stripped with esbuild, the logic unchanged. It builds
// ORIGINAL external geometry (bands, cords, pouches, flaps, seams) fitted to the actual morphed body it is given; no inscription, no
// contents, no claimed effect. Cultural status: unverified (RDA CULT-ASSET-005 / CULT-ASSET-006); a Senegalese adviser reviews it before
// any prominent use. Run offline only, by scripts/wrestlers/build-rda-wrestlers.mjs, on the RDA body in its own (source) space; the
// pieces it makes are then carried onto Dakar Rek's v4 rig by the same transplant as the body (docs/wrestling/RDA-INTEGRATION.md).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
const count = 64;
const mix = (a, b, t) => {
  const skin = /* @__PURE__ */ new Map();
  a.skin.forEach((w, j) => skin.set(j, w * (1 - t)));
  b.skin.forEach((w, j) => skin.set(j, (skin.get(j) || 0) + w * t));
  return { p: a.p.clone().lerp(b.p, t), skin, normal: a.normal && b.normal ? a.normal.clone().lerp(b.normal, t).normalize() : void 0 };
};
const cross = (a, b) => a.x * b.y - a.y * b.x;
function createAccessories(body) {
  body.updateWorldMatrix(true, true);
  body.skeleton.update();
  const g = body.geometry, indices = g.index;
  const skinI = g.getAttribute("skinIndex"), skinW = g.getAttribute("skinWeight");
  const samples = [];
  for (let i = 0; i < g.getAttribute("position").count; i++) {
    const skin = /* @__PURE__ */ new Map();
    for (let j = 0; j < 4; j++) skin.set(skinI.getComponent(i, j), (skin.get(skinI.getComponent(i, j)) || 0) + skinW.getComponent(i, j));
    const normal = new THREE.Vector3().fromBufferAttribute(g.getAttribute("normal"), i);
    (g.morphAttributes.normal || []).forEach((a2, j) => normal.addScaledVector(new THREE.Vector3().fromBufferAttribute(a2, i), body.morphTargetInfluences?.[j] || 0));
    normal.transformDirection(body.matrixWorld);
    samples.push({ p: body.localToWorld(body.getVertexPosition(i, new THREE.Vector3())), skin, normal });
  }
  const arms = [], waist = [], chest = [];
  const leather = new THREE.MeshStandardMaterial({ color: "#61341e", roughness: 0.85, side: THREE.DoubleSide });
  const cord = new THREE.MeshStandardMaterial({ color: "#352316", roughness: 0.98 });
  const thread = new THREE.MeshStandardMaterial({ color: "#c6aa77", roughness: 1 });
  const sections = [];
  const anchors = [];
  function section(origin, axis, u, names, name, record = true) {
    axis = axis.clone().normalize();
    u = u.clone().addScaledVector(axis, -u.dot(axis)).normalize();
    const v = new THREE.Vector3().crossVectors(axis, u).normalize();
    let segments = [];
    for (let i = 0; i < indices.count; i += 3) {
      const tri = [0, 1, 2].map((j) => samples[indices.getX(i + j)]);
      const hits = [];
      for (let j = 0; j < 3; j++) {
        const a2 = tri[j], b2 = tri[(j + 1) % 3];
        const da = a2.p.clone().sub(origin).dot(axis), db = b2.p.clone().sub(origin).dot(axis);
        if (da <= 0 && db > 0 || db <= 0 && da > 0) hits.push(mix(a2, b2, da / (da - db)));
      }
      if (hits.length === 2) segments.push([hits[0], hits[1]]);
    }
    const key = (s) => s.p.toArray().map((x) => Math.round(x * 1e5)).join(",");
    const linked = /* @__PURE__ */ new Map();
    segments.forEach((segment, i) => segment.forEach((s) => linked.set(key(s), [...linked.get(key(s)) || [], i])));
    const visited = /* @__PURE__ */ new Set(), contours = [];
    for (let i = 0; i < segments.length; i++) {
      if (visited.has(i)) continue;
      const pending = [i], contour = [];
      while (pending.length) {
        const j = pending.pop();
        if (visited.has(j)) continue;
        visited.add(j);
        contour.push(segments[j]);
        segments[j].forEach((s) => (linked.get(key(s)) || []).forEach((k) => {
          if (!visited.has(k)) pending.push(k);
        }));
      }
      if (contour.length >= 12) contours.push(contour);
    }
    const score = (contour) => new THREE.Box3().setFromPoints(contour.flat().map((s) => s.p)).getCenter(new THREE.Vector3()).distanceTo(origin);
    contours.sort((a2, b2) => score(a2) - score(b2));
    segments = contours[0] || [];
    if (score(segments) > (names.includes("Hips") ? 0.3 : 0.18)) throw new Error("Accessory contour too far from anchor: " + name);
    if (segments.length < 8) throw new Error("Accessory fitting section unavailable: " + name);
    const xy = (p) => {
      const d = p.clone().sub(origin);
      return new THREE.Vector2(d.dot(u), d.dot(v));
    };
    const bounds = new THREE.Box2().setFromPoints(segments.flat().map((s) => xy(s.p)));
    const c = bounds.getCenter(new THREE.Vector2());
    const centre = origin.clone().addScaledVector(u, c.x).addScaledVector(v, c.y);
    const points = [];
    for (let j = 0; j < count; j++) {
      const ray = new THREE.Vector2(Math.cos(j / count * Math.PI * 2), Math.sin(j / count * Math.PI * 2));
      let hit, nearest = Infinity;
      for (const [a2, b2] of segments) {
        const p = xy(a2.p).sub(c), edge = xy(b2.p).sub(c).sub(p);
        const determinant = cross(ray, edge);
        if (Math.abs(determinant) < 1e-9) continue;
        const t = cross(p, edge) / determinant, s = cross(p, ray) / determinant;
        if (t > 0 && s >= -1e-6 && s <= 1 + 1e-6 && t < nearest) {
          nearest = t;
          hit = mix(a2, b2, THREE.MathUtils.clamp(s, 0, 1));
        }
      }
      if (!hit) throw new Error("Accessory contour gap: " + name + "/" + j);
      points.push(hit);
    }
    const radii = points.map((s) => s.p.distanceTo(centre));
    if (record) sections.push({ name, radiusMin: Math.min(...radii), radiusMax: Math.max(...radii) });
    return { centre, axis, u, v, points, names };
  }
  function surfaceMesh(name, rows, material, closedRows = false, closedColumns = true) {
    const positions = [], joints = [], weights = [], triangles = [];
    rows.forEach((row) => row.forEach((s) => {
      positions.push(...body.worldToLocal(s.p.clone()).toArray());
      const sorted = [...s.skin].sort((a2, b2) => b2[1] - a2[1]).slice(0, 4), sum = sorted.reduce((n, [, w]) => n + w, 0);
      for (let j = 0; j < 4; j++) {
        joints.push(sorted[j]?.[0] || 0);
        weights.push((sorted[j]?.[1] || 0) / sum);
      }
    }));
    for (let r = 0; r < (closedRows ? rows.length : rows.length - 1); r++) for (let j = 0; j < (closedColumns ? count : count - 1); j++) {
      const a2 = r * count + j, b2 = r * count + (j + 1) % count;
      const d = (r + 1) % rows.length * count + j, c = (r + 1) % rows.length * count + (j + 1) % count;
      triangles.push(a2, b2, d, b2, c, d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(joints, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    geometry.setIndex(triangles);
    geometry.computeVertexNormals();
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = name;
    mesh.bind(body.skeleton, body.bindMatrix);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    body.parent.add(mesh);
    return mesh;
  }
  const offset = (s, amount, useNormals = false) => s.points.map((p) => ({ p: p.p.clone().addScaledVector(useNormals ? p.normal : p.p.clone().sub(s.centre).normalize(), amount), skin: p.skin }));
  function rope(s, name, target, clearance = 9e-3, useNormals = false) {
    const rows = Array.from({ length: 6 }, (_, j) => {
      const phase = j / 6 * Math.PI * 2;
      const slice = section(s.centre.clone().addScaledVector(s.axis, Math.sin(phase) * 3e-3), s.axis, s.u, s.names, name + j, false);
      return offset(slice, clearance + Math.cos(phase) * 3e-3, useNormals);
    });
    target.push(surfaceMesh(name, rows, cord, true));
  }
  function pouch(s, angle, boneName, name, width, height, target, gap) {
    const i = Math.round(angle / (2 * Math.PI) * count + count) % count;
    const front = s.points[i].p.clone().sub(s.centre).normalize();
    const up = s.axis.clone().multiplyScalar(boneName.includes("Arm") ? -1 : 1);
    const right = new THREE.Vector3().crossVectors(up, front).normalize();
    up.crossVectors(front, right).normalize();
    const at = s.points[i].p.clone();
    let extent = 0;
    for (const sample of samples) {
      const d = sample.p.clone().sub(at);
      if (Math.abs(d.dot(right)) <= width * 0.65 && Math.abs(d.dot(up)) <= height * 0.65 && Math.abs(d.dot(front)) < 0.1) extent = Math.max(extent, d.dot(front));
    }
    const depth = 0.024, clearance = gap ?? (boneName.includes("Arm") ? 0.012 : 0.023);
    at.addScaledVector(front, extent + clearance + depth / 2);
    const bone = body.skeleton.bones.find((b2) => b2.name === boneName);
    const holder = new THREE.Group();
    holder.name = name;
    holder.position.copy(bone.worldToLocal(at));
    const rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, front));
    holder.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
    bone.add(holder);
    const shape = new THREE.Shape(), w = width / 2, h = height / 2, r = 5e-3;
    shape.moveTo(-w + r, -h);
    shape.lineTo(w - r, -h);
    shape.quadraticCurveTo(w, -h, w, -h + r);
    shape.lineTo(w, h - r);
    shape.quadraticCurveTo(w, h, w - r, h);
    shape.lineTo(-w + r, h);
    shape.quadraticCurveTo(-w, h, -w, h - r);
    shape.lineTo(-w, -h + r);
    shape.quadraticCurveTo(-w, -h, -w + r, -h);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: depth - 4e-3, bevelEnabled: true, bevelSize: 2e-3, bevelThickness: 2e-3, bevelSegments: 2, steps: 1, curveSegments: 3 });
    geometry.translate(0, 0, -depth / 2 + 2e-3);
    const mesh = new THREE.Mesh(geometry, leather);
    mesh.castShadow = true;
    holder.add(mesh);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(width * 0.88, height * 0.28, 3e-3), leather);
    flap.position.set(0, height * 0.27, depth / 2 + 15e-4);
    holder.add(flap);
    const stitches = [];
    for (const sign of [-1, 1]) for (let j = 0; j < 6; j++) {
      const a2 = new THREE.Vector3(sign * (w - 6e-3), -h + 9e-3 + j * (height - 0.018) / 6, depth / 2 + 1e-3);
      const b2 = a2.clone().add(new THREE.Vector3(0, 4e-3, 0));
      stitches.push(new THREE.TubeGeometry(new THREE.LineCurve3(a2, b2), 1, 8e-4, 4, false));
    }
    holder.add(new THREE.Mesh(mergeGeometries(stitches), thread));
    stitches.forEach((g2) => g2.dispose());
    anchors.push({ name, bone: boneName, local: holder.position.toArray(), surfaceClearance: clearance });
    target.push(holder);
  }
  for (const side of ["Left", "Right"]) {
    const arm = body.skeleton.bones.find((b3) => b3.name === side + "Arm");
    const elbow = body.skeleton.bones.find((b3) => b3.name === side + "ForeArm");
    const shoulder = arm.getWorldPosition(new THREE.Vector3()), direction = elbow.getWorldPosition(new THREE.Vector3()).sub(shoulder);
    const origin = shoulder.clone().addScaledVector(direction, 0.7), axis = direction.clone().normalize();
    const a2 = section(origin.clone().addScaledVector(axis, -0.018), axis, new THREE.Vector3(0, 0, 1), [side + "Arm"], side + "ArmUpper");
    const b2 = section(origin.clone().addScaledVector(axis, 0.018), axis, new THREE.Vector3(0, 0, 1), [side + "Arm"], side + "ArmLower");
    arms.push(surfaceMesh(side + "AccessoryBand", [offset(a2, 4e-3), offset(b2, 4e-3)], leather));
    rope(a2, side + "AccessoryCord", arms);
    rope(b2, side + "AccessoryCordLower", arms);
    pouch(a2, 0, side + "Arm", side + "AccessoryPouch", 0.068, 0.082, arms);
  }
  const waistNames = ["Hips", "LowerBack", "Spine"];
  const a = section(new THREE.Vector3(0, 1.012, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), waistNames, "WaistUpper");
  const b = section(new THREE.Vector3(0, 0.997, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), waistNames, "WaistLower");
  waist.push(surfaceMesh("WaistAccessoryBand", [offset(a, 0.019), offset(b, 0.019)], leather));
  rope(a, "WaistAccessoryCord", waist, 0.024);
  const low = section(new THREE.Vector3(0, 0.985, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), waistNames, "WaistPouches");
  for (const [j, angle] of [-0.62, 0, 0.62].entries()) pouch(low, angle, "Hips", "WaistAccessoryPouch" + j, 0.062, 0.074, waist);
  const torsoTriangles = Array.from({ length: indices.count / 3 }, (_, i) => {
    const vertices = [0, 1, 2].map((j) => samples[indices.getX(i * 3 + j)]);
    return {
      vertices,
      triangle: new THREE.Triangle(...vertices.map((s) => s.p)),
      minX: Math.min(...vertices.map((s) => s.p.x)),
      maxX: Math.max(...vertices.map((s) => s.p.x)),
      minY: Math.min(...vertices.map((s) => s.p.y)),
      maxY: Math.max(...vertices.map((s) => s.p.y))
    };
  }).filter((t) => t.maxY >= 1 && t.minY <= 1.56 && t.minX <= 0.2 && t.maxX >= -0.2);
  function torsoPoint(x, y, front) {
    const ray = new THREE.Ray(new THREE.Vector3(x, y, front ? 2 : -2), new THREE.Vector3(0, 0, front ? -1 : 1));
    let found, distance = Infinity;
    for (const t of torsoTriangles) {
      if (x < t.minX || x > t.maxX || y < t.minY || y > t.maxY) continue;
      const p = ray.intersectTriangle(t.triangle.a, t.triangle.b, t.triangle.c, false, new THREE.Vector3());
      if (!p || p.distanceTo(ray.origin) >= distance) continue;
      const bary = t.triangle.getBarycoord(p, new THREE.Vector3());
      const skin = /* @__PURE__ */ new Map();
      t.vertices.forEach((s, j) => s.skin.forEach((w, bone) => skin.set(bone, (skin.get(bone) || 0) + w * bary.getComponent(j))));
      found = { p, skin, normal: t.triangle.getNormal(new THREE.Vector3()) };
      distance = p.distanceTo(ray.origin);
    }
    if (!found) throw new Error("Chest cord surface unavailable");
    return found;
  }
  const lowerChest = section(new THREE.Vector3(0, 1.055, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), waistNames, "ChestLower");
  rope(lowerChest, "ChestLowerCord", chest);
  for (const front of [true, false]) for (const sign of [-1, 1]) {
    const shoulder = torsoPoint(sign * 0.125, 1.42, front);
    const startAnchor = { p: shoulder.p.clone().addScaledVector(shoulder.normal, 9e-3), skin: shoulder.skin };
    const start = startAnchor.p;
    const lowerPoints = offset(lowerChest, 9e-3);
    let endIndex = 0, endError = Infinity;
    lowerPoints.forEach((s, i) => {
      if ((s.p.z - lowerChest.centre.z) * (front ? 1 : -1) < 0) return;
      const error = Math.abs(s.p.x + sign * 0.145);
      if (error < endError) {
        endError = error;
        endIndex = i;
      }
    });
    const endAnchor = lowerPoints[endIndex];
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(start.x, start.y, 0),
      new THREE.Vector3(sign * 0.11, 1.39, 0),
      new THREE.Vector3(sign * 0.085, 1.36, 0),
      new THREE.Vector3(0, 1.26, 0),
      new THREE.Vector3(-sign * 0.09, 1.13, 0),
      new THREE.Vector3(endAnchor.p.x, endAnchor.p.y, 0)
    ], false, "centripetal");
    const rows = Array.from({ length: 6 }, (_, r) => Array.from({ length: count }, (_2, j) => {
      const t = j / (count - 1), at = path.getPoint(t), tangent = path.getTangent(t);
      const perpendicular = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
      const phase = r / 6 * Math.PI * 2;
      if (j === 0 || j === count - 1) {
        const anchor = j === 0 ? startAnchor : endAnchor;
        const normal = j === 0 ? shoulder.normal : lowerChest.points[endIndex].p.clone().sub(lowerChest.centre).normalize();
        return { p: anchor.p.clone().addScaledVector(perpendicular, Math.cos(phase) * 25e-4).addScaledVector(normal, Math.sin(phase) * 25e-4), skin: anchor.skin };
      }
      const p = at.clone().addScaledVector(perpendicular, Math.cos(phase) * 25e-4);
      const sample = torsoPoint(p.x, p.y, front);
      const crossingLift = sign === 1 ? 8e-3 * Math.exp(-(((at.y - 1.26) / 0.035) ** 2)) : 0;
      sample.p.addScaledVector(sample.normal, 9e-3 + crossingLift + Math.sin(phase) * 25e-4);
      return sample;
    }));
    chest.push(surfaceMesh(`Chest${front ? "Front" : "Back"}Cord${sign}`, rows, cord, true, false));
  }
  for (const sign of [-1, 1]) {
    const x = sign * 0.125, centre = new THREE.Vector3(x, 1.4, 0);
    const front = torsoPoint(x, 1.42, true), back = torsoPoint(x, 1.42, false);
    const firstAngle = Math.atan2(front.p.y - centre.y, front.p.z);
    const lastAngle = Math.atan2(back.p.y - centre.y, back.p.z);
    const rows = Array.from({ length: 6 }, (_, r) => Array.from({ length: count }, (_2, j) => {
      const phase = r / 6 * Math.PI * 2, t = j / (count - 1);
      const angle = THREE.MathUtils.lerp(firstAngle, lastAngle, t);
      const direction = new THREE.Vector3(0, Math.sin(angle), Math.cos(angle));
      const origin = centre.clone().addScaledVector(direction, 2);
      origin.x += Math.cos(phase) * 25e-4;
      const ray = new THREE.Ray(origin, direction.clone().negate());
      let sample, distance = Infinity;
      for (const triangle of torsoTriangles) {
        if (origin.x < triangle.minX || origin.x > triangle.maxX) continue;
        const p = ray.intersectTriangle(triangle.triangle.a, triangle.triangle.b, triangle.triangle.c, false, new THREE.Vector3());
        if (!p || p.distanceTo(origin) >= distance) continue;
        distance = p.distanceTo(origin);
        const bary = triangle.triangle.getBarycoord(p, new THREE.Vector3());
        const skin = /* @__PURE__ */ new Map();
        triangle.vertices.forEach((s, k) => s.skin.forEach((w, bone) => skin.set(bone, (skin.get(bone) || 0) + w * bary.getComponent(k))));
        const normal = triangle.triangle.getNormal(new THREE.Vector3());
        sample = { p: p.addScaledVector(normal, 9e-3 + Math.sin(phase) * 25e-4), skin };
      }
      if (!sample) throw new Error("Shoulder cord surface unavailable");
      return sample;
    }));
    chest.push(surfaceMesh(`ChestShoulderCord${sign}`, rows, cord, true, false));
  }
  const sternum = section(new THREE.Vector3(0, 1.26, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), ["Spine", "Spine1"], "ChestPouch");
  pouch(sternum, 0, "Spine1", "ChestAccessoryPouch", 0.045, 0.055, chest, 0.022);
  const parts = { arms, waist, chest };
  return {
    arms,
    waist,
    chest,
    materials: [leather, cord, thread],
    setVisible: (part, visible) => parts[part].forEach((o) => o.visible = visible),
    inspect: () => ({ arms: arms.every((o) => o.visible), waist: waist.every((o) => o.visible), chest: chest.every((o) => o.visible), pouches: anchors.length, sections, anchors })
  };
}
export {
  createAccessories
};
