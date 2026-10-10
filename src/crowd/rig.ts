import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RIG_DIMS } from './reactions';
import { BANNER, BANNER_COLS, BANNER_ROWS, bannerAtlas } from './banners';
import { HAIR as HAIR_COLOUR } from './looks';

/**
 * The crowd's instanced figures (docs/CROWD.md): low-poly people whose arms, legs and upper body are posed in the vertex
 * shader from a few numbers per instance (src/crowd/reactions.ts RigPose), so a stand of hundreds claps, pumps its fists,
 * leaps up or walks with one draw call per figure kind and no per-person CPU skinning.
 *
 *  - mid figures: head and hair, torso, upper arms, forearms with the hands, thighs, shins and feet (seated or standing);
 *  - far silhouettes: a block for the legs, the torso, the head and one box per arm.
 *
 * Vertex colours mark what each instance colours: white = the shirt (instance colour), black = the skin, pure red = the
 * trousers or skirt, pure green = the headwear or hair (iCols: skin, legs, head and the print's accent, each a 0xRRGGBB
 * sRGB colour packed in one float: four colours in one attribute, under WebGL's 16 vertex attributes); other colours
 * are kept (shoes). Per
 * vertex, `aRig` = (side: +1 the person's left / −1 right / 0, segment, joint height, hip height); segments: 0 still,
 * 1 upper body (leans), 2 upper arm, 3 forearm and hand, 4 leg (swings at the hip). Instances: iArm (pitch, spread, yaw,
 * elbow), iOsc (yawAmp, pitchAmp, freq, phase), iMove (bounce, lean, walk, sideOff). The maths mirror reactions.ts
 * armDirs (tested there).
 *
 * The look varies per instance without a mesh per variant (src/crowd/looks.ts): `aPart` = (part, pivot y, pivot z,
 * cloth) marks the crown on the head (scaled from short hair to a kufi, a cap or a tall headwrap: iLook.x), a cap's
 * brim (iLook.y bit 1), a supporters' banner hung on the parapet (iLook.w: its cell in the atlas, src/crowd/banners.ts;
 * the banner's texture coordinates in aPart.yz), the thighs and shins of a seated figure drawn upright (iLook.y bit 2:
 * people standing at the rail use the seated bucket), the body's width (iLook.z, the build) and the garment the print
 * covers (cloth 1 shirt, 2 trousers or skirt; the print code is iLook.y / 4: wax motifs or an invented football shirt in
 * the accent colour, drawn in the fragment shader).
 */
export const SHOULDER_X = RIG_DIMS.shoulderX;
export const UPPER_ARM = RIG_DIMS.upper;
const SHOES = 0x2e2620, BANNER_GREY = 0x808080;
type Tint = 'shirt' | 'skin' | 'legs' | 'head' | number;
const MARK: Record<'shirt' | 'skin' | 'legs' | 'head', [number, number, number]> = { shirt: [1, 1, 1], skin: [0, 0, 0], legs: [1, 0, 0], head: [0, 1, 0] };
/** Parts of a figure the shader shapes per instance (aPart.x). */
export const PART = { body: 0, head: 1, crown: 2, brim: 3, banner: 4, thigh: 5, shin: 6 } as const;
/** A seated figure drawn upright (at the rail) is lifted by this much: its feet on the ground. */
export const UPRIGHT_LIFT = 0.81;
/** Height of the crown box (a headwrap); short hair, a kufi or a cap are a share of it (looks.ts headShape). */
export const CROWN_H = 0.16;

interface Box {
  w: number; h: number; d: number; x: number; y0: number; z: number; tint: Tint; seg: number; side?: number; joint?: number; hip?: number;
  part?: number;
  /**
   * Crown and brim: the point they grow from (y, z); thighs: the hip (y, z); shins: their move when upright (dy, dz);
   * the banner: its texture coordinates (per vertex).
   */
  pivot?: [number, number];
}
/** `cloth`: mark the shirt and trousers for prints (the mid figures; silhouettes stay plain). */
function build(boxes: Box[], cloth: boolean): THREE.BufferGeometry {
  const parts = boxes.map(b => {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d);
    g.translate(b.x, b.y0 + b.h / 2, b.z);
    const n = g.attributes.position.count, col = new Float32Array(n * 3), rig = new Float32Array(n * 4), part = new Float32Array(n * 4);
    const c = typeof b.tint === 'number' ? new THREE.Color(b.tint).toArray() as [number, number, number] : MARK[b.tint];
    const k = !cloth ? 0 : b.tint === 'shirt' ? 1 : b.tint === 'legs' ? 2 : 0;
    const uv = g.attributes.uv.array as Float32Array;
    for (let i = 0; i < n; i++) {
      col.set(c, i * 3);
      rig.set([b.side ?? 0, b.seg, b.joint ?? 0, b.hip ?? 0], i * 4);
      // the banner keeps its texture coordinates (its cell of the atlas) where the others keep their pivot
      const [p1, p2] = b.part === PART.banner ? [uv[i * 2], uv[i * 2 + 1]] : [b.pivot?.[0] ?? 0, b.pivot?.[1] ?? 0];
      part.set([b.part ?? PART.body, p1, p2, k], i * 4);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aRig', new THREE.BufferAttribute(rig, 4));
    g.setAttribute('aPart', new THREE.BufferAttribute(part, 4));
    g.deleteAttribute('uv');
    return g;
  });
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}
const both = (f: (s: 1 | -1) => Box[]) => [...f(1), ...f(-1)];
/** The banner over the parapet in front of a ringside holder (collapsed for everyone else). */
const banner = (): Box => ({ w: BANNER.w, h: BANNER.h, d: 0.02, x: 0, y0: BANNER.top - BANNER.h, z: BANNER.z, tint: BANNER_GREY, seg: 0, part: PART.banner });

/** Seated: origin on the sitting surface under the hips, the legs over the edge in front (+z). */
function midSeated(): Box[] {
  const J = RIG_DIMS.seated.shoulder, H = RIG_DIMS.seated.hip;
  return [
    { w: 0.36, h: 0.16, d: 0.28, x: 0, y0: 0, z: -0.03, tint: 'legs', seg: 0 },
    ...both(s => [
      { w: 0.15, h: 0.15, d: 0.46, x: s * 0.095, y0: 0.01, z: 0.19, tint: 'legs', seg: 0, part: PART.thigh, pivot: [0.085, 0.035] },
      { w: 0.13, h: 0.44, d: 0.13, x: s * 0.095, y0: -0.4, z: 0.38, tint: 'legs', seg: 0, part: PART.shin, pivot: [-0.34, -0.345] },
      { w: 0.11, h: 0.07, d: 0.21, x: s * 0.095, y0: -0.47, z: 0.42, tint: SHOES, seg: 0, part: PART.shin, pivot: [-0.34, -0.345] },
      { w: 0.1, h: UPPER_ARM, d: 0.11, x: s * SHOULDER_X, y0: J - UPPER_ARM, z: 0, tint: 'shirt', seg: 2, side: s, joint: J, hip: H },
      { w: 0.085, h: RIG_DIMS.fore, d: 0.095, x: s * SHOULDER_X, y0: J - UPPER_ARM - RIG_DIMS.fore, z: 0, tint: 'skin', seg: 3, side: s, joint: J, hip: H },
    ]),
    { w: 0.38, h: 0.52, d: 0.22, x: 0, y0: 0.14, z: -0.02, tint: 'shirt', seg: 1, hip: H },
    { w: 0.19, h: 0.23, d: 0.21, x: 0, y0: 0.7, z: -0.01, tint: 'skin', seg: 1, hip: H, part: PART.head },
    { w: 0.205, h: CROWN_H, d: 0.225, x: 0, y0: 0.9, z: -0.015, tint: 'head', seg: 1, hip: H, part: PART.crown, pivot: [0.9, -0.015] },
    { w: 0.19, h: 0.02, d: 0.1, x: 0, y0: 0.9, z: 0.14, tint: 'head', seg: 1, hip: H, part: PART.brim, pivot: [0.9, 0.095] },
    banner(),
  ];
}
/** Standing: origin on the ground between the feet. */
function midStanding(): Box[] {
  const J = RIG_DIMS.standing.shoulder, H = RIG_DIMS.standing.hip;
  return [
    ...both(s => [
      { w: 0.15, h: 0.84, d: 0.17, x: s * 0.095, y0: 0.04, z: 0, tint: 'legs', seg: 4, side: s, joint: H },
      { w: 0.11, h: 0.06, d: 0.22, x: s * 0.095, y0: 0, z: 0.03, tint: SHOES, seg: 4, side: s, joint: H },
      { w: 0.1, h: UPPER_ARM, d: 0.11, x: s * SHOULDER_X, y0: J - UPPER_ARM, z: 0, tint: 'shirt', seg: 2, side: s, joint: J, hip: H },
      { w: 0.085, h: 0.33, d: 0.095, x: s * SHOULDER_X, y0: J - UPPER_ARM - 0.33, z: 0, tint: 'skin', seg: 3, side: s, joint: J, hip: H },
    ]),
    { w: 0.36, h: 0.14, d: 0.24, x: 0, y0: 0.82, z: -0.01, tint: 'legs', seg: 1, hip: H },
    { w: 0.38, h: 0.54, d: 0.22, x: 0, y0: 0.94, z: -0.02, tint: 'shirt', seg: 1, hip: H },
    { w: 0.19, h: 0.23, d: 0.21, x: 0, y0: 1.52, z: -0.01, tint: 'skin', seg: 1, hip: H, part: PART.head },
    { w: 0.205, h: CROWN_H, d: 0.225, x: 0, y0: 1.72, z: -0.015, tint: 'head', seg: 1, hip: H, part: PART.crown, pivot: [1.72, -0.015] },
    { w: 0.19, h: 0.02, d: 0.1, x: 0, y0: 1.72, z: 0.14, tint: 'head', seg: 1, hip: H, part: PART.brim, pivot: [1.72, 0.095] },
    banner(),
  ];
}
/** Far silhouettes: the same outline in six boxes (an arm is one box, so the elbow does not bend). */
function farSeated(): Box[] {
  const J = RIG_DIMS.seated.shoulder, H = RIG_DIMS.seated.hip, A = RIG_DIMS.farArm;
  return [
    { w: 0.34, h: 0.17, d: 0.5, x: 0, y0: 0, z: 0.17, tint: 'legs', seg: 0, part: PART.thigh, pivot: [0.085, 0.005] },
    { w: 0.32, h: 0.44, d: 0.13, x: 0, y0: -0.42, z: 0.38, tint: 'legs', seg: 0, part: PART.shin, pivot: [-0.39, -0.375] },
    { w: 0.38, h: 0.52, d: 0.22, x: 0, y0: 0.14, z: -0.02, tint: 'shirt', seg: 1, hip: H },
    { w: 0.19, h: 0.25, d: 0.21, x: 0, y0: 0.7, z: -0.01, tint: 'skin', seg: 1, hip: H, part: PART.head },
    { w: 0.2, h: CROWN_H, d: 0.22, x: 0, y0: 0.92, z: -0.01, tint: 'head', seg: 1, hip: H, part: PART.crown, pivot: [0.92, -0.01] },
    ...both(s => [{ w: 0.1, h: A, d: 0.11, x: s * SHOULDER_X, y0: J - A, z: 0, tint: 'shirt' as Tint, seg: 2, side: s, joint: J, hip: H }]),
    banner(),
  ];
}
function farStanding(): Box[] {
  const J = RIG_DIMS.standing.shoulder, H = RIG_DIMS.standing.hip, A = RIG_DIMS.farArm;
  return [
    { w: 0.32, h: 0.9, d: 0.18, x: 0, y0: 0, z: 0, tint: 'legs', seg: 0 },
    { w: 0.38, h: 0.6, d: 0.22, x: 0, y0: 0.88, z: -0.02, tint: 'shirt', seg: 1, hip: H },
    { w: 0.19, h: 0.25, d: 0.21, x: 0, y0: 1.52, z: -0.01, tint: 'skin', seg: 1, hip: H, part: PART.head },
    { w: 0.2, h: CROWN_H, d: 0.22, x: 0, y0: 1.74, z: -0.01, tint: 'head', seg: 1, hip: H, part: PART.crown, pivot: [1.74, -0.01] },
    ...both(s => [{ w: 0.1, h: A, d: 0.11, x: s * SHOULDER_X, y0: J - A, z: 0, tint: 'shirt' as Tint, seg: 2, side: s, joint: J, hip: H }]),
    banner(),
  ];
}

export type FigureKind = 'midSeated' | 'midStanding' | 'farSeated' | 'farStanding';
const SHAPES: Record<FigureKind, () => Box[]> = { midSeated, midStanding, farSeated, farStanding };
/** A new geometry of that figure kind (each crowd owns its own: the per-instance attributes live on the geometry). */
export const figureGeometry = (k: FigureKind) => build(SHAPES[k](), k === 'midSeated' || k === 'midStanding');
export const figureBoxes = (k: FigureKind) => SHAPES[k]().length;

// ------------------------------------------------------------------ the shared material
/** Seconds, shared by every crowd (the rig's oscillations and the near bodies' arms read the same clock). */
export const RIG_TIME = { value: 0 };
export function crowdClock() { return RIG_TIME.value; }
/** Set the shared clock from the page's clock (`now` = performance.now(), ms): any number of crowds may call it per frame. */
export function tickClock(now: number) { RIG_TIME.value = (now / 1000) % 600; }

const GLSL_DECL = /* glsl */`
attribute vec4 aRig;
attribute vec4 iCols;
attribute vec4 iArm;
attribute vec4 iOsc;
attribute vec4 iMove;
attribute vec4 aPart;
attribute vec4 iLook;
uniform float uCrowdTime;
varying vec3 vCrowdP;
varying vec4 vCrowdWax;
varying vec2 vCrowdUv;
varying float vCrowdBanner;
vec3 crowdRotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
vec3 crowdRotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
vec3 crowdRotZ(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z); }
// a 0xRRGGBB sRGB colour packed in a float, to the linear colour the shading works in
vec3 crowdUnpack(float p) {
  float r = floor(p / 65536.0), g = floor((p - r * 65536.0) / 256.0), b = p - r * 65536.0 - g * 256.0;
  vec3 s = vec3(r, g, b) / 255.0;
  return mix(s / 12.92, pow((s + 0.055) / 1.055, vec3(2.4)), step(0.04045, s));
}
`;
// runs where the normal starts (before the position is used): poses both, keeps the position for begin_vertex
const GLSL_RIG = /* glsl */`
vec3 rigPos = vec3(position);
vec3 rigNrm = vec3(normal);
float crowdPart = aPart.x;
float crowdFlags = floor(iLook.y + 0.01);
bool crowdUpright = mod(floor(crowdFlags / 2.0), 2.0) > 0.5;
float crowdCode = floor(crowdFlags / 4.0);
{
  // the look: headwear, a cap's brim, the banner, the build, the legs of someone standing at the rail
  if (crowdPart > 1.5 && crowdPart < 2.5) {
    rigPos.y = aPart.y + (rigPos.y - aPart.y) * iLook.x;
    if (iLook.x < 0.01) rigPos = vec3(0.0, aPart.y, aPart.z);
  } else if (crowdPart > 2.5 && crowdPart < 3.5) {
    vec3 bp = vec3(0.0, aPart.y, aPart.z);
    rigPos = bp + (rigPos - bp) * mod(crowdFlags, 2.0);
  } else if (crowdPart > 3.5 && crowdPart < 4.5) {
    if (iLook.w < 0.5) rigPos = vec3(0.0);
  } else if (crowdPart < 0.5 || crowdPart > 4.5) {
    rigPos.x *= iLook.z;
    if (crowdUpright && crowdPart > 4.5 && crowdPart < 5.5) {
      vec3 hp = vec3(0.0, aPart.y, aPart.z);
      rigPos = hp + crowdRotX(rigPos - hp, 1.5708); rigNrm = crowdRotX(rigNrm, 1.5708);
    } else if (crowdUpright && crowdPart > 5.5) rigPos += vec3(0.0, aPart.y, aPart.z);
  }
}
{
  float side = aRig.x, seg = aRig.y;
  float w = uCrowdTime * iOsc.z + iOsc.w;
  if (seg > 1.5 && seg < 3.5) {
    vec3 sh = vec3(side * ${SHOULDER_X.toFixed(3)} * iLook.z, aRig.z, 0.0);
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
  if (crowdPart < 3.5 || crowdPart > 4.5) rigPos.y += iMove.x * abs(sin(w));
}
if (crowdUpright) rigPos.y += ${UPRIGHT_LIFT.toFixed(3)};
vCrowdP = position;
float crowdCloth = aPart.w;
vCrowdWax = ((crowdCloth > 0.5 && crowdCloth < 1.5 && crowdCode > 0.5) || (crowdCloth > 1.5 && crowdCode > 8.5)) ? vec4(crowdUnpack(iCols.w), mod(crowdCode, 8.0)) : vec4(0.0);
vCrowdUv = aPart.yz;
vCrowdBanner = (crowdPart > 3.5 && crowdPart < 4.5) ? iLook.w - 1.0 : -1.0;
vec3 objectNormal = rigNrm;
#ifdef USE_TANGENT
  vec3 objectTangent = vec3( tangent.xyz );
#endif
`;
const GLSL_COLOR = /* glsl */`
#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
  if (color.r > 0.99 && color.g > 0.99 && color.b > 0.99) vColor.xyz = instanceColor.xyz;
  else if (color.r < 0.002 && color.g < 0.002 && color.b < 0.002) vColor.xyz = crowdUnpack(iCols.x);
  else if (color.r > 0.99 && color.g < 0.002 && color.b < 0.002) vColor.xyz = crowdUnpack(iCols.y);
  else if (color.r < 0.002 && color.g > 0.99 && color.b < 0.002) vColor.xyz = crowdUnpack(iCols.z);
  else vColor.xyz = color.xyz;
#endif
`;

// prints on the cloth (object space, metres) and the banners' atlas, in the fragment shader
const GLSL_FRAG_DECL = /* glsl */`
varying vec3 vCrowdP;
varying vec4 vCrowdWax;
varying vec2 vCrowdUv;
varying float vCrowdBanner;
uniform sampler2D uCrowdBanners;
float crowdPrint(float code, vec3 p) {
  vec2 q = vec2(p.x + p.z, p.y);
  float m = 0.0, f = 11.0;
  if (code < 1.5) { vec2 c = fract(q * 11.0) - 0.5; m = 1.0 - smoothstep(0.2, 0.28, length(c)); }
  else if (code < 2.5) { vec2 c = abs(fract(q * 8.0) - 0.5); m = 1.0 - smoothstep(0.24, 0.32, c.x + c.y); f = 8.0; }
  else if (code < 3.5) { float v = fract(q.y * 9.0 + 0.2 * sin(q.x * 28.0)); m = smoothstep(0.0, 0.08, v) * (1.0 - smoothstep(0.3, 0.38, v)); f = 9.0; }
  else if (code < 4.5) { m = step(0.5, fract(q.x * 6.0)); f = 6.0; }
  else if (code < 5.5) { m = step(0.62, fract(q.y * 5.0)); f = 5.0; }
  else { m = 1.0 - step(0.13, abs(fract((q.x - q.y) * 1.6) - 0.5)); f = 1.6; }
  // far away the motif melts into its average instead of shimmering
  float aa = clamp(1.5 - fwidth(q.x * f + q.y * f) * 2.0, 0.0, 1.0);
  return mix(0.3, m, aa);
}
`;
const GLSL_FRAG = /* glsl */`
#include <color_fragment>
if (vCrowdBanner > -0.5) {
  float bc = mod(vCrowdBanner, ${BANNER_COLS.toFixed(1)}), br = floor(vCrowdBanner / ${BANNER_COLS.toFixed(1)} + 0.01);
  vec2 buv = vec2((bc + vCrowdUv.x) / ${BANNER_COLS.toFixed(1)}, 1.0 - (br + 1.0 - vCrowdUv.y) / ${BANNER_ROWS.toFixed(1)});
  diffuseColor.rgb = texture2D(uCrowdBanners, buv).rgb;
} else if (vCrowdWax.w > 0.5) {
  diffuseColor.rgb = mix(diffuseColor.rgb, vCrowdWax.rgb, crowdPrint(vCrowdWax.w, vCrowdP));
}
`;

let material: THREE.MeshLambertMaterial | null = null;
/** One material for every crowd (never disposed: it is shared). */
export function rigMaterial(): THREE.MeshLambertMaterial {
  if (material) return material;
  material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = sh => {
    sh.uniforms.uCrowdTime = RIG_TIME;
    sh.uniforms.uCrowdBanners = { value: bannerAtlas() };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL_DECL}`)
      .replace('#include <beginnormal_vertex>', GLSL_RIG)
      .replace('#include <begin_vertex>', 'vec3 transformed = rigPos;')
      .replace('#include <color_vertex>', GLSL_COLOR);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_FRAG_DECL}`)
      .replace('#include <color_fragment>', GLSL_FRAG);
  };
  material.customProgramCacheKey = () => 'dakar-crowd-rig-v2';
  return material;
}

// ------------------------------------------------------------------ supporters' flags
/** A small hand flag: the stick held at the origin along +y, the cloth (white: the instance colour) at the top. */
export function flagGeometry(): THREE.BufferGeometry {
  const paint = (g: THREE.BufferGeometry, hex: number) => {
    const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv');
    return g;
  };
  const stick = new THREE.BoxGeometry(0.022, 0.8, 0.022); stick.translate(0, 0.25, 0);
  const cloth = new THREE.BoxGeometry(0.4, 0.26, 0.012); cloth.translate(0.21, 0.5, 0);
  const g = mergeGeometries([paint(stick, 0x4a3a2a), paint(cloth, 0xffffff)])!;
  stick.dispose(); cloth.dispose();
  return g;
}
let flagMat: THREE.MeshLambertMaterial | null = null;
/** White vertices take the instance colour (the écurie's), the stick keeps its own. */
export function flagMaterial() {
  if (flagMat) return flagMat;
  flagMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  flagMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
  vColor.xyz = (color.r > 0.99 && color.g > 0.99 && color.b > 0.99) ? instanceColor.xyz : color.xyz;
#endif`);
  };
  flagMat.customProgramCacheKey = () => 'dakar-crowd-flag-v1';
  return flagMat;
}

/** Floats per instance of each rig attribute. */
export const RIG_ATTRS = { iCols: 4, iArm: 4, iOsc: 4, iMove: 4, iLook: 4 } as const;
/** Short dark hair: the crown's colour when there is no headwear. */
export const HAIR = HAIR_COLOUR;
export type RigAttr = keyof typeof RIG_ATTRS;
