// Port of Roi des Arènes' finish helpers (experiments/roi-des-arenes/src/character-finish.ts, lab/roi-des-arenes-threejs @ 809a9817,
// WEB-003), types stripped with esbuild, the logic unchanged. Only `shortHair` is used here: an original short scalp layer cut from the
// reviewed anatomy (every attribute and morph interpolated at the hairline, the exact body rig). A generic study haircut, not a culturally
// approved style (status unverified). Run offline only, by scripts/wrestlers/build-rda-wrestlers.mjs.
import * as THREE from "three";
function surfaceMaterial(color, kind) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: kind === "skin" ? 0.76 : 0.96 });
  const frequency = kind === "skin" ? 620 : kind === "hair" ? 470 : 300;
  const depth = kind === "skin" ? 35e-6 : kind === "hair" ? 25e-5 : 12e-5;
  material.customProgramCacheKey = () => `study-surface-v1-${kind}`;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vStudySurface;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvStudySurface = position;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 vStudySurface;
      float studyHash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
      float studyNoise(vec3 p) {
        vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(studyHash(i),studyHash(i+vec3(1,0,0)),f.x),mix(studyHash(i+vec3(0,1,0)),studyHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(studyHash(i+vec3(0,0,1)),studyHash(i+vec3(1,0,1)),f.x),mix(studyHash(i+vec3(0,1,1)),studyHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
    `).replace("#include <color_fragment>", `#include <color_fragment>
      float studyDetail = studyNoise(vStudySurface * ${frequency.toFixed(1)});
      diffuseColor.rgb *= ${kind === "hair" ? "0.75 + 0.35 * studyDetail" : "0.975 + 0.05 * studyNoise(vStudySurface * 45.0)"};
    `).replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
      // Screen derivatives perturb the view-space normal, following the skinned surface.
      vec3 sx=dFdx(-vViewPosition), sy=dFdy(-vViewPosition);
      vec3 rx=cross(sy,normal), ry=cross(normal,sx);
      float det=dot(sx,rx);
      vec2 dh=vec2(dFdx(studyDetail),dFdy(studyDetail))*${depth.toFixed(6)};
      normal=normalize(abs(det)*normal-sign(det)*(dh.x*rx+dh.y*ry));
    `);
  };
  return material;
}
function shortHair(body) {
  const source = body.geometry;
  const pos = source.getAttribute("position");
  const norm = source.getAttribute("normal");
  const skinI = source.getAttribute("skinIndex"), skinW = source.getAttribute("skinWeight");
  const morphP = source.morphAttributes.position, morphN = source.morphAttributes.normal;
  const read = (i) => {
    const skin = /* @__PURE__ */ new Map();
    for (let j = 0; j < 4; j++) skin.set(skinI.getComponent(i, j), (skin.get(skinI.getComponent(i, j)) || 0) + skinW.getComponent(i, j));
    return {
      p: new THREE.Vector3().fromBufferAttribute(pos, i),
      n: new THREE.Vector3().fromBufferAttribute(norm, i),
      dp: morphP.map((a) => new THREE.Vector3().fromBufferAttribute(a, i)),
      dn: morphN.map((a) => new THREE.Vector3().fromBufferAttribute(a, i)),
      skin
    };
  };
  const lerp = (a, b, t) => {
    const skin = /* @__PURE__ */ new Map();
    a.skin.forEach((w, j) => skin.set(j, w * (1 - t)));
    b.skin.forEach((w, j) => skin.set(j, (skin.get(j) || 0) + w * t));
    return { p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t), dp: a.dp.map((d, i) => d.clone().lerp(b.dp[i], t)), dn: a.dn.map((d, i) => d.clone().lerp(b.dn[i], t)), skin };
  };
  const actual = (v) => v.dp.reduce((p, d, i) => p.addScaledVector(d, body.morphTargetInfluences[i]), v.p.clone());
  const signed = (v) => {
    const p = actual(v);
    const front = THREE.MathUtils.smoothstep(p.z, 0.025, 0.115);
    return p.y - (1.655 + 0.077 * front + 0.042 * THREE.MathUtils.smoothstep(Math.abs(p.x), 0.04, 0.085) * (1 - front));
  };
  const data = [], normals = [], indices = [], weights = [];
  const targets = morphP.map(() => []), targetNormals = morphN.map(() => []);
  const emit = (v) => {
    const n = v.n.clone().normalize();
    const thickness = 4e-3;
    data.push(...v.p.clone().addScaledVector(n, thickness).toArray());
    normals.push(...n.toArray());
    v.dp.forEach((d, i) => {
      const dn = v.n.clone().add(v.dn[i]).normalize().sub(n);
      targets[i].push(...d.clone().addScaledVector(dn, thickness).toArray());
      targetNormals[i].push(...dn.toArray());
    });
    const skin = [...v.skin].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = skin.reduce((s, [, w]) => s + w, 0);
    for (let j = 0; j < 4; j++) {
      indices.push(skin[j]?.[0] || 0);
      weights.push((skin[j]?.[1] || 0) / total);
    }
  };
  for (let i = 0; i < source.index.count; i += 3) {
    const triangle = [source.index.getX(i), source.index.getX(i + 1), source.index.getX(i + 2)].map(read);
    if (triangle.some((v) => v.p.y < 1.6)) continue;
    const polygon = [];
    triangle.forEach((b, j) => {
      const a = triangle[(j + 2) % 3], ah = signed(a), bh = signed(b);
      if (ah >= 0 !== bh >= 0) {
        let lo = 0, hi = 1;
        for (let k = 0; k < 18; k++) {
          const mid = (lo + hi) / 2;
          if (signed(lerp(a, b, mid)) >= 0 === ah >= 0) lo = mid;
          else hi = mid;
        }
        polygon.push(lerp(a, b, (lo + hi) / 2));
      }
      if (bh >= 0) polygon.push(b);
    });
    for (let j = 1; j + 1 < polygon.length; j++) [polygon[0], polygon[j], polygon[j + 1]].forEach(emit);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(data, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = targets.map((d) => new THREE.Float32BufferAttribute(d, 3));
  geometry.morphAttributes.normal = targetNormals.map((d) => new THREE.Float32BufferAttribute(d, 3));
  const material = surfaceMaterial("#10100e", "hair");
  material.side = THREE.DoubleSide;
  const hair = new THREE.SkinnedMesh(geometry, material);
  hair.name = "OriginalShortHair";
  hair.bind(body.skeleton, body.bindMatrix);
  hair.morphTargetInfluences = [...body.morphTargetInfluences];
  hair.morphTargetDictionary = { ...body.morphTargetDictionary };
  hair.castShadow = true;
  hair.frustumCulled = false;
  body.parent.add(hair);
  return material;
}
function finishEyes(model) {
  const head = model.getObjectByName("Head"), eyes = model.getObjectByName("Eyes");
  if (!head || !eyes) return [];
  model.updateMatrixWorld(true);
  eyes.skeleton.update();
  const materials = [];
  for (const sign of [-1, 1]) {
    const front = new THREE.Vector3(0, 0, -Infinity), sample = new THREE.Vector3();
    for (let i = 0; i < eyes.geometry.getAttribute("position").count; i++) {
      eyes.getVertexPosition(i, sample);
      eyes.localToWorld(sample);
      if (sample.x * sign > 0 && sample.z > front.z) front.copy(sample);
    }
    const layers = [{ r: 64e-4, color: "#21180f", roughness: 0.5 }, { r: 56e-4, color: "#513322", roughness: 0.4 }, { r: 27e-4, color: "#090b09", roughness: 0.2 }];
    layers.forEach((layer, i) => {
      const material = new THREE.MeshStandardMaterial({ color: layer.color, roughness: layer.roughness });
      const vertices = [], indices = [];
      const rings = 5, segments = 32, radius = 0.015;
      for (let ring = 0; ring <= rings; ring++) for (let j = 0; j <= segments; j++) {
        const r = layer.r * ring / rings, a = j / segments * Math.PI * 2;
        const point = new THREE.Vector3(front.x + r * Math.cos(a), front.y + r * Math.sin(a), front.z + Math.sqrt(radius * radius - r * r) - radius + 3e-4 + i * 8e-5);
        vertices.push(...head.worldToLocal(point).toArray());
      }
      for (let ring = 0; ring < rings; ring++) for (let j = 0; j < segments; j++) {
        const a = ring * (segments + 1) + j, b = a + segments + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const eye = new THREE.Mesh(geometry, material);
      eye.name = `StudyEye${sign}_${i}`;
      head.add(eye);
      materials.push(material);
    });
  }
  return materials;
}
function finishBrows(model) {
  const brows = model.getObjectByName("Brows");
  if (!brows) return void 0;
  const envelope = [[0.01, 1.689, 7e-3], [0.017, 1.6895, 75e-4], [0.028, 1.6903, 62e-4], [0.04, 1.6907, 57e-4], [0.047, 1.6907, 5e-3], [0.054, 1.6874, 28e-4], [0.06, 1.6853, 18e-4]];
  const positions = brows.geometry.getAttribute("position"), coords = [];
  for (let i = 0; i < positions.count; i++) {
    const x = Math.abs(positions.getX(i));
    let j = 0;
    while (j + 1 < envelope.length - 1 && x > envelope[j + 1][0]) j++;
    const a = envelope[j], b = envelope[j + 1], t = THREE.MathUtils.clamp((x - a[0]) / (b[0] - a[0]), 0, 1);
    const centre = THREE.MathUtils.lerp(a[1], b[1], t), width = THREE.MathUtils.lerp(a[2], b[2], t);
    coords.push((x - 0.01) / 0.05, (positions.getY(i) - centre) / width + 0.5);
  }
  brows.geometry.setAttribute("studyBrowUv", new THREE.Float32BufferAttribute(coords, 2));
  const material = new THREE.MeshStandardMaterial({ color: "#2c231b", roughness: 0.96, alphaTest: 0.5, alphaToCoverage: true });
  material.customProgramCacheKey = () => "original-brow-band-v1";
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute vec2 studyBrowUv; varying vec2 vStudyBrow;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvStudyBrow=studyBrowUv;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vStudyBrow;").replace("#include <alphatest_fragment>", `float band=1.0-smoothstep(.18,.29,abs(vStudyBrow.y-.5));
        float taper=smoothstep(0.0,.10,vStudyBrow.x)*(1.0-smoothstep(.84,1.0,vStudyBrow.x));
        diffuseColor.a *= band*taper*(.90+.10*sin(vStudyBrow.x*260.0+vStudyBrow.y*13.0));
        #include <alphatest_fragment>`);
  };
  brows.material = material;
  brows.castShadow = false;
  const lashes = model.getObjectByName("Lashes");
  if (lashes) lashes.visible = false;
  return material;
}
export {
  finishBrows,
  finishEyes,
  shortHair,
  surfaceMaterial
};
