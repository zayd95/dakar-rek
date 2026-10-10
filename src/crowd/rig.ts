import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The crowd's instanced figures (docs/CROWD.md): low-poly people whose arms, legs and upper body are posed in the vertex
 * shader from a few numbers per instance (src/crowd/reactions.ts RigPose), so a stand of hundreds claps, pumps its fists,
 * leaps up or walks with one draw call per figure kind and no per-person CPU skinning.
 *
 *  - mid figures: head and hair, torso, upper arms, forearms with the hands, thighs, shins and feet (seated or standing);
 *  - far silhouettes: a block for the legs, the torso, the head and one box per arm.
 *
 * Vertex colours mark what each instance colours: white = the shirt (instance colour), black = the skin (iSkin), pure
 * red = the trousers or skirt (iLegs); other colours are kept (shoes, hair). Per vertex, `aRig` = (side: +1 the
 * person's left / −1 right / 0, segment, joint height, hip height); segments: 0 still, 1 upper body (leans), 2 upper arm,
 * 3 forearm and hand, 4 leg (swings at the hip). Instances: iArm (pitch, spread, yaw, elbow), iOsc (yawAmp, pitchAmp,
 * freq, phase), iMove (bounce, lean, walk, sideOff). The maths mirror reactions.ts armDirs (tested there).
 */
export const SHOULDER_X = 0.245;
export const UPPER_ARM = 0.3;
const SHOES = 0x2e2620, HAIR = 0x2a2220;
type Tint = 'shirt' | 'skin' | 'legs' | number;
const MARK: Record<'shirt' | 'skin' | 'legs', [number, number, number]> = { shirt: [1, 1, 1], skin: [0, 0, 0], legs: [1, 0, 0] };

interface Box { w: number; h: number; d: number; x: number; y0: number; z: number; tint: Tint; seg: number; side?: number; joint?: number; hip?: number }
function build(boxes: Box[]): THREE.BufferGeometry {
  const parts = boxes.map(b => {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d);
    g.translate(b.x, b.y0 + b.h / 2, b.z);
    const n = g.attributes.position.count, col = new Float32Array(n * 3), rig = new Float32Array(n * 4);
    const c = typeof b.tint === 'number' ? new THREE.Color(b.tint).toArray() as [number, number, number] : MARK[b.tint];
    for (let i = 0; i < n; i++) {
      col.set(c, i * 3);
      rig.set([b.side ?? 0, b.seg, b.joint ?? 0, b.hip ?? 0], i * 4);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aRig', new THREE.BufferAttribute(rig, 4));
    g.deleteAttribute('uv');
    return g;
  });
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}
const both = (f: (s: 1 | -1) => Box[]) => [...f(1), ...f(-1)];

/** Seated: origin on the sitting surface under the hips, the legs over the edge in front (+z). */
function midSeated(): Box[] {
  const J = 0.63, H = 0.08;
  return [
    { w: 0.36, h: 0.16, d: 0.28, x: 0, y0: 0, z: -0.03, tint: 'legs', seg: 0 },
    ...both(s => [
      { w: 0.15, h: 0.15, d: 0.46, x: s * 0.095, y0: 0.01, z: 0.19, tint: 'legs', seg: 0 },
      { w: 0.13, h: 0.44, d: 0.13, x: s * 0.095, y0: -0.4, z: 0.38, tint: 'legs', seg: 0 },
      { w: 0.11, h: 0.07, d: 0.21, x: s * 0.095, y0: -0.47, z: 0.42, tint: SHOES, seg: 0 },
      { w: 0.1, h: UPPER_ARM, d: 0.11, x: s * SHOULDER_X, y0: J - UPPER_ARM, z: 0, tint: 'shirt', seg: 2, side: s, joint: J, hip: H },
      { w: 0.085, h: 0.33, d: 0.095, x: s * SHOULDER_X, y0: J - UPPER_ARM - 0.33, z: 0, tint: 'skin', seg: 3, side: s, joint: J, hip: H },
    ]),
    { w: 0.38, h: 0.52, d: 0.22, x: 0, y0: 0.14, z: -0.02, tint: 'shirt', seg: 1, hip: H },
    { w: 0.19, h: 0.23, d: 0.21, x: 0, y0: 0.7, z: -0.01, tint: 'skin', seg: 1, hip: H },
    { w: 0.2, h: 0.05, d: 0.22, x: 0, y0: 0.9, z: -0.015, tint: HAIR, seg: 1, hip: H },
  ];
}
/** Standing: origin on the ground between the feet. */
function midStanding(): Box[] {
  const J = 1.44, H = 0.88;
  return [
    ...both(s => [
      { w: 0.15, h: 0.84, d: 0.17, x: s * 0.095, y0: 0.04, z: 0, tint: 'legs', seg: 4, side: s, joint: H },
      { w: 0.11, h: 0.06, d: 0.22, x: s * 0.095, y0: 0, z: 0.03, tint: SHOES, seg: 4, side: s, joint: H },
      { w: 0.1, h: UPPER_ARM, d: 0.11, x: s * SHOULDER_X, y0: J - UPPER_ARM, z: 0, tint: 'shirt', seg: 2, side: s, joint: J, hip: H },
      { w: 0.085, h: 0.33, d: 0.095, x: s * SHOULDER_X, y0: J - UPPER_ARM - 0.33, z: 0, tint: 'skin', seg: 3, side: s, joint: J, hip: H },
    ]),
    { w: 0.36, h: 0.14, d: 0.24, x: 0, y0: 0.82, z: -0.01, tint: 'legs', seg: 1, hip: H },
    { w: 0.38, h: 0.54, d: 0.22, x: 0, y0: 0.94, z: -0.02, tint: 'shirt', seg: 1, hip: H },
    { w: 0.19, h: 0.23, d: 0.21, x: 0, y0: 1.52, z: -0.01, tint: 'skin', seg: 1, hip: H },
    { w: 0.2, h: 0.05, d: 0.22, x: 0, y0: 1.72, z: -0.015, tint: HAIR, seg: 1, hip: H },
  ];
}
/** Far silhouettes: the same outline in six boxes (an arm is one box, so the elbow does not bend). */
function farSeated(): Box[] {
  const J = 0.63, H = 0.08;
  return [
    { w: 0.34, h: 0.17, d: 0.5, x: 0, y0: 0, z: 0.17, tint: 'legs', seg: 0 },
    { w: 0.32, h: 0.44, d: 0.13, x: 0, y0: -0.42, z: 0.38, tint: 'legs', seg: 0 },
    { w: 0.38, h: 0.52, d: 0.22, x: 0, y0: 0.14, z: -0.02, tint: 'shirt', seg: 1, hip: H },
    { w: 0.19, h: 0.25, d: 0.21, x: 0, y0: 0.7, z: -0.01, tint: 'skin', seg: 1, hip: H },
    ...both(s => [{ w: 0.1, h: 0.6, d: 0.11, x: s * SHOULDER_X, y0: J - 0.6, z: 0, tint: 'shirt' as Tint, seg: 2, side: s, joint: J, hip: H }]),
  ];
}
function farStanding(): Box[] {
  const J = 1.44, H = 0.88;
  return [
    { w: 0.32, h: 0.9, d: 0.18, x: 0, y0: 0, z: 0, tint: 'legs', seg: 0 },
    { w: 0.38, h: 0.6, d: 0.22, x: 0, y0: 0.88, z: -0.02, tint: 'shirt', seg: 1, hip: H },
    { w: 0.19, h: 0.25, d: 0.21, x: 0, y0: 1.52, z: -0.01, tint: 'skin', seg: 1, hip: H },
    ...both(s => [{ w: 0.1, h: 0.6, d: 0.11, x: s * SHOULDER_X, y0: J - 0.6, z: 0, tint: 'shirt' as Tint, seg: 2, side: s, joint: J, hip: H }]),
  ];
}

export type FigureKind = 'midSeated' | 'midStanding' | 'farSeated' | 'farStanding';
const SHAPES: Record<FigureKind, () => Box[]> = { midSeated, midStanding, farSeated, farStanding };
/** A new geometry of that figure kind (each crowd owns its own: the per-instance attributes live on the geometry). */
export const figureGeometry = (k: FigureKind) => build(SHAPES[k]());
export const figureBoxes = (k: FigureKind) => SHAPES[k]().length;

// ------------------------------------------------------------------ the shared material
/** Seconds, shared by every crowd (the rig's oscillations and the near bodies' arms read the same clock). */
export const RIG_TIME = { value: 0 };
export function crowdClock() { return RIG_TIME.value; }
/** Set the shared clock from the page's clock (`now` = performance.now(), ms): any number of crowds may call it per frame. */
export function tickClock(now: number) { RIG_TIME.value = (now / 1000) % 600; }

const GLSL_DECL = /* glsl */`
attribute vec4 aRig;
attribute vec3 iSkin;
attribute vec3 iLegs;
attribute vec4 iArm;
attribute vec4 iOsc;
attribute vec4 iMove;
uniform float uCrowdTime;
vec3 crowdRotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
vec3 crowdRotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
vec3 crowdRotZ(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z); }
`;
// runs where the normal starts (before the position is used): poses both, keeps the position for begin_vertex
const GLSL_RIG = /* glsl */`
vec3 rigPos = vec3(position);
vec3 rigNrm = vec3(normal);
{
  float side = aRig.x, seg = aRig.y;
  float w = uCrowdTime * iOsc.z + iOsc.w;
  if (seg > 1.5 && seg < 3.5) {
    vec3 sh = vec3(side * ${SHOULDER_X.toFixed(3)}, aRig.z, 0.0);
    vec3 v = rigPos - sh;
    if (seg > 2.5) { vec3 e = vec3(0.0, -${UPPER_ARM.toFixed(3)}, 0.0); v = e + crowdRotX(v - e, -iArm.w); rigNrm = crowdRotX(rigNrm, -iArm.w); }
    float pitch = iArm.x + iOsc.y * sin(w + side * iMove.w);
    float yaw = iArm.z + iOsc.x * (0.5 + 0.5 * sin(w));
    v = crowdRotY(crowdRotX(crowdRotZ(v, side * iArm.y), -pitch), -side * yaw);
    rigNrm = crowdRotY(crowdRotX(crowdRotZ(rigNrm, side * iArm.y), -pitch), -side * yaw);
    rigPos = sh + v;
  } else if (seg > 3.5) {
    vec3 hp = vec3(0.0, aRig.z, 0.0);
    float swing = iMove.z * sin(w - side * 1.5708);
    rigPos = hp + crowdRotX(rigPos - hp, -swing); rigNrm = crowdRotX(rigNrm, -swing);
  }
  if (seg > 0.5 && seg < 3.5) {
    vec3 hp = vec3(0.0, aRig.w, 0.0);
    rigPos = hp + crowdRotX(rigPos - hp, iMove.y); rigNrm = crowdRotX(rigNrm, iMove.y);
  }
  rigPos.y += iMove.x * abs(sin(w));
}
vec3 objectNormal = rigNrm;
#ifdef USE_TANGENT
  vec3 objectTangent = vec3( tangent.xyz );
#endif
`;
const GLSL_COLOR = /* glsl */`
#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
  if (color.r > 0.99 && color.g > 0.99 && color.b > 0.99) vColor.xyz = instanceColor.xyz;
  else if (color.r < 0.002 && color.g < 0.002 && color.b < 0.002) vColor.xyz = iSkin;
  else if (color.r > 0.99 && color.g < 0.002 && color.b < 0.002) vColor.xyz = iLegs;
  else vColor.xyz = color.xyz;
#endif
`;

let material: THREE.MeshLambertMaterial | null = null;
/** One material for every crowd (never disposed: it is shared). */
export function rigMaterial(): THREE.MeshLambertMaterial {
  if (material) return material;
  material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = sh => {
    sh.uniforms.uCrowdTime = RIG_TIME;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL_DECL}`)
      .replace('#include <beginnormal_vertex>', GLSL_RIG)
      .replace('#include <begin_vertex>', 'vec3 transformed = rigPos;')
      .replace('#include <color_vertex>', GLSL_COLOR);
  };
  material.customProgramCacheKey = () => 'dakar-crowd-rig-v1';
  return material;
}

/** Floats per instance of each rig attribute. */
export const RIG_ATTRS = { iSkin: 3, iLegs: 3, iArm: 4, iOsc: 4, iMove: 4 } as const;
export type RigAttr = keyof typeof RIG_ATTRS;
