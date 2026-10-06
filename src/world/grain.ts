import * as THREE from 'three';

/**
 * Procedural surface grain for flat-coloured materials: world-space value noise at three scales
 * (fine speckle, mid blotches, large patches) so sand, plaster and asphalt stop looking like plastic.
 * Cheap: a few hashes per pixel, no textures.
 */
const NOISE = /* glsl */ `
varying vec3 vGrainPos;
varying vec3 vGrainN;
float gHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), f.x), f.y);
}`;

/** Low quality switches off procedural noise and the world-space detail textures (both per-pixel costs). Read when a hub is built. */
let noiseOn = true;
export function setGrainEnabled(on: boolean) { noiseOn = on; }

/** detail: optional seamless texture sampled in world space (planar by face direction), `detailSize` metres per repeat. */
export function addGrain(mat: THREE.Material, strength = 1, scale = 1, windows = false, detail?: THREE.Texture, detailSize = 2) {
  const noise = noiseOn;
  if (!noiseOn) detail = undefined;
  mat.onBeforeCompile = shader => {
    shader.uniforms.uGrain = { value: strength };
    shader.uniforms.uDetail = { value: detail ?? null };
    shader.uniforms.uDetailSize = { value: detailSize };
    shader.uniforms.uGrainScale = { value: scale };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrainPos;\nvarying vec3 vGrainN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrainPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vGrainN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGrain;\nuniform float uGrainScale;\n' + (detail ? 'uniform sampler2D uDetail;\nuniform float uDetailSize;\n' : '') + NOISE)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 gp = vGrainPos * uGrainScale;
        vec2 q = abs(vGrainN.y) > 0.5 ? gp.xz : (abs(vGrainN.x) > 0.5 ? gp.zy : gp.xy);
        ${noise ? `
        float fine = gHash(floor(q * 9.0));
        float mid = gNoise(q * 0.7);
        float big = gNoise(q * 0.045 + 7.0);
        float g = 0.93 + 0.07 * fine + 0.10 * (mid - 0.5) + 0.16 * (big - 0.5);
        // walls get darker toward the ground (dust, splash), ground stays as is
        float base = abs(vGrainN.y) < 0.5 ? mix(0.82, 1.0, smoothstep(0.0, 1.4, gp.y / uGrainScale)) : 1.0;
        diffuseColor.rgb *= mix(1.0, g * base, uGrain);` : ''}
        ${detail ? `{
          vec3 wp = vGrainPos / uDetailSize;
          vec2 dq = abs(vGrainN.y) > 0.5 ? wp.xz : (abs(vGrainN.x) > 0.5 ? wp.zy : wp.xy);
          diffuseColor.rgb *= texture2D(uDetail, dq).rgb;
        }` : ''}
      }`);
    if (windows) {
      // Night windows: only some are lit, at varying brightness, a few with cool fluorescent light.
      // The seed mixes the window's bay/storey cell with the building's tint and the face direction.
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec2 cell = floor(vEmissiveMapUv);
        // quantise every input: interpolated values differ by tiny amounts per pixel and would turn the hash into noise
        vec3 tint8 = floor(vColor * 31.0 + 0.5);
        float hs = gHash(cell * 1.37 + tint8.rg * 0.731 + tint8.b * 0.173 + floor(vGrainN.xz + 0.5) * 5.3 + 0.5);
        float lit = step(0.5, hs) * (0.55 + 0.7 * fract(hs * 7.31));
        vec3 tint = fract(hs * 13.7) > 0.8 ? vec3(0.75, 0.95, 1.35) : vec3(1.0);
        totalEmissiveRadiance *= lit * tint;
      }`);
    }
  };
  // strength, scale and the texture are uniforms: materials share one program per variant (faster start-up)
  mat.customProgramCacheKey = () => `grain-${noise}-${windows}-${!!detail}`;
  return mat;
}
