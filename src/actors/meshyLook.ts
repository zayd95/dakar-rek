import * as THREE from 'three';
import { COLORS, OUTFITS, SKINS, type Appearance } from './appearance';

/**
 * What the character creator changes on a Meshy body (docs/avatar/CREATOR.md). The body is one fused shell with one base-colour texture, so:
 *  - skin and clothes are recoloured in the fragment shader by what the texture shows there (hue keys per body, shading detail kept), the main
 *    garment can take a print (plain, striped, wax: drawn in the shell's own model space, so it follows the animation) and the trousers another colour;
 *  - the baked hair is pulled onto the skull by the 'shave' morph target and the `_HAIR` vertex attribute that scripts/avatar/add-hair.mjs adds to the
 *    GLBs (the scalp then reads as skin, a little darker), and a procedural afro or headwrap can sit on it.
 * `null` is the body as it always was: no tint, baked hair.
 */

/** Linear luminance of what the shader recolours, per body: skin, main garment, trousers (the detail of the texture is kept as the ratio to it). */
const REF = { m: new THREE.Vector3(0.092, 0.189, 0.0062), f: new THREE.Vector3(0.066, 0.059, 0.018) };

export interface MeshyUniforms {
  uOn: { value: number }; uFemale: { value: number }; uScalp: { value: number }; uBotOn: { value: number }; uInnerOn: { value: number }; uPrint: { value: number }; uBotY: { value: number };
  uSkin: { value: THREE.Color }; uTop: { value: THREE.Color }; uTop2: { value: THREE.Color }; uBot: { value: THREE.Color }; uInner: { value: THREE.Color }; uRef: { value: THREE.Vector3 };
}

const FRAG_FUNCS = /* glsl */`
uniform float uOn, uFemale, uScalp, uBotOn, uInnerOn, uPrint, uBotY;
uniform vec3 uSkin, uTop, uTop2, uBot, uInner, uRef;
varying float vHair; varying vec3 vMp;
vec3 mlHsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); return vec3(abs(q.z+(q.w-q.y)/(6.*d+1e-10)),d/(q.x+1e-10),q.x); }
float mlHue(float h,float c,float lo,float hi){ float d=abs(fract(h-c+.5)-.5); return 1.-smoothstep(lo,hi,d); }
vec3 mlTop(){
  if (uPrint < .5) return uTop;
  if (uPrint < 1.5) return mix(uTop, uTop2, step(.5, fract(vMp.y*13.)));
  vec3 p = vMp*21.; vec3 q = fract(p)-.5; float d = length(q);
  float ring = smoothstep(.36,.32,d) - smoothstep(.23,.19,d);
  vec3 w = mix(uTop, uTop2, ring);
  return mix(w, uTop*.4, smoothstep(.10,.06,d));
}
`;
const FRAG_BODY = /* glsl */`
#include <map_fragment>
#ifdef USE_MAP
if (uOn > .5) {
  vec3 mc = diffuseColor.rgb, hs = mlHsv(pow(max(mc, vec3(0.)), vec3(1./2.2)));
  float lum = dot(mc, vec3(.2126,.7152,.0722)), wSkin, wTop, wInner = 0., wBot;
  if (uFemale < .5) {
    wSkin = mlHue(hs.x,.03,.06,.095)*smoothstep(.15,.3,hs.y)*smoothstep(.08,.16,hs.z);          // (the lips are a dark red: inside the window)
    wTop = mlHue(hs.x,.567,.05,.09)*smoothstep(.5,.7,hs.y)*smoothstep(.3,.5,hs.z);
    wBot = mlHue(hs.x,.62,.1,.17)*smoothstep(.25,.4,hs.y)*smoothstep(.06,.09,hs.z)*(1.-smoothstep(.25,.35,hs.z));
  } else {
    wSkin = mlHue(hs.x,.02,.06,.085)*smoothstep(.15,.3,hs.y)*smoothstep(.08,.16,hs.z)*(1.-smoothstep(.5,.65,hs.z));
    wInner = mlHue(hs.x,.125,.03,.06)*smoothstep(.5,.65,hs.y)*smoothstep(.35,.5,hs.z);
    wTop = mlHue(hs.x,.18,.05,.1)*smoothstep(.15,.3,hs.y)*smoothstep(.1,.18,hs.z)*(1.-wInner);
    wBot = mlHue(hs.x,.58,.06,.11)*smoothstep(.3,.45,hs.y)*smoothstep(.06,.1,hs.z)*(1.-smoothstep(.3,.4,hs.z));
  }
  // the creases and seams of the trousers are not a hue: below the hips and above the shoes, it is all trousers
  float leg = (1.-step(uBotY,vMp.y))*step(.15,vMp.y)*(1.-step(.24,abs(vMp.x)));   // between the hips and the shoes, not the arms
  wSkin *= 1.-leg; wBot = max(wBot, leg);
  vec3 col = mc;
  col = mix(col, uSkin*clamp(lum/uRef.x,.35,1.9), wSkin);
  col = mix(col, mlTop()*clamp(lum/uRef.y,.4,1.7), wTop);
  col = mix(col, uInner*clamp(lum/.12,.45,1.4), wInner*uInnerOn);
  col = mix(col, uBot*clamp(lum/uRef.z,.6,1.5), wBot*uBotOn);
  if (uScalp > .5 && vHair > .5) col = uSkin*.5;
  diffuseColor.rgb = col;
}
#endif
`;

/** The material of a Meshy body (the baked texture, the recolour off until an appearance is applied). */
export function makeMeshyMaterial(map: THREE.Texture, female: boolean): { mat: THREE.MeshLambertMaterial; u: MeshyUniforms } {
  const u: MeshyUniforms = {
    uOn: { value: 0 }, uFemale: { value: female ? 1 : 0 }, uScalp: { value: 0 }, uBotOn: { value: 0 }, uInnerOn: { value: 0 }, uPrint: { value: 0 }, uBotY: { value: female ? 0.8 : 0.92 },
    uSkin: { value: new THREE.Color() }, uTop: { value: new THREE.Color() }, uTop2: { value: new THREE.Color() }, uBot: { value: new THREE.Color() }, uInner: { value: new THREE.Color() },
    uRef: { value: (female ? REF.f : REF.m).clone() },
  };
  const mat = new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _hair; varying float vHair; varying vec3 vMp;')
      .replace('#include <morphtarget_vertex>', '#include <morphtarget_vertex>\nvHair = _hair; vMp = transformed;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${FRAG_FUNCS}`).replace('#include <map_fragment>', FRAG_BODY);
  };
  mat.customProgramCacheKey = () => 'meshy-look-v5';
  return { mat, u };
}

// ------------------------------------------------------------------ procedural hair (model space of the shell; the skull of scripts/avatar/add-hair.mjs)
const hash = (x: number, y: number, z: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x: number, y: number, z: number) => {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t, h = (i: number, j: number, k: number) => hash(ix + i, iy + j, iz + k);
  return l(l(l(h(0, 0, 0), h(1, 0, 0), sx), l(h(0, 1, 0), h(1, 1, 0), sx), sy), l(l(h(0, 0, 1), h(1, 0, 1), sx), l(h(0, 1, 1), h(1, 1, 1), sx), sy), sz);
};
let afroGeo: THREE.BufferGeometry | null = null, wrapGeo: THREE.BufferGeometry | null = null;
/** A rounded, lumpy volume over the skull: the forehead is left clear (the front is held back and slanted). */
function afroGeometry(): THREE.BufferGeometry {
  if (afroGeo) return afroGeo;
  const g = new THREE.IcosahedronGeometry(1, 4), p = g.getAttribute('position') as THREE.BufferAttribute, c = { x: 0, y: 1.862, z: -0.034 }, r = { x: 0.158, y: 0.14, z: 0.15 };
  for (let i = 0; i < p.count; i++) {
    const nx = p.getX(i), ny = p.getY(i), nz = p.getZ(i);
    const k = 1 + 0.07 * (vnoise(nx * 3.1, ny * 3.1, nz * 3.1) - 0.5) + 0.035 * (vnoise(nx * 11, ny * 11, nz * 11) - 0.5);
    let x = c.x + nx * r.x * k, y = c.y + ny * r.y * k, z = c.z + nz * r.z * k;
    z = Math.min(z, 0.03 + Math.max(0, y - 1.835) * 1.1);                                    // the hairline: slanted back from the brows
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals(); return afroGeo = g;
}
/** A cap over the skull, its front edge on the forehead (above the eyes), with the knot at the back. */
function wrapGeometry(): THREE.BufferGeometry {
  if (wrapGeo) return wrapGeo;
  const cap = new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, 1.92), p = cap.getAttribute('position') as THREE.BufferAttribute, c = { x: 0, y: 1.795, z: -0.015 }, r = { x: 0.104, y: 0.124, z: 0.116 };
  for (let i = 0; i < p.count; i++) {
    let x = c.x + p.getX(i) * r.x, y = c.y + p.getY(i) * r.y, z = c.z + p.getZ(i) * r.z;
    if (z > 0) y = Math.max(y, 1.835 + (1 - Math.min(1, z / 0.1)) * -0.06);                  // the band sits on the forehead, lower at the temples
    p.setXYZ(i, x, y, z);
  }
  cap.computeVertexNormals();
  const knot = new THREE.SphereGeometry(1, 12, 8); knot.scale(0.05, 0.045, 0.05); knot.translate(0, 1.905, -0.115);
  const tail = new THREE.SphereGeometry(1, 10, 6); tail.scale(0.032, 0.07, 0.03); tail.rotateX(0.5); tail.translate(0.018, 1.86, -0.15);
  const tail2 = tail.clone().translate(-0.04, 0.0, 0.0);
  const merged = mergeGeos([cap, knot, tail, tail2]); return wrapGeo = merged;
}
function mergeGeos(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], idx: number[] = []; let off = 0;
  for (const g of gs) {
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off); else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count;
  }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); m.setIndex(idx); return m;
}

const hex = (n: number) => new THREE.Color(n);
const luma = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/** The look of one Meshy body: owns its uniforms and its hair meshes. */
export class MeshyLook {
  private hairMesh: THREE.Mesh | null = null;
  private hairMat: THREE.MeshLambertMaterial | null = null;
  applied: Appearance | null = null;
  /** The shell's model space (where the hair geometry is drawn) in the head bone's frame, taken at construction, when the bones are at rest. */
  private toHead = new THREE.Matrix4();
  constructor(root: THREE.Object3D, private head: THREE.Object3D | null, private shell: THREE.Mesh, private u: MeshyUniforms) {
    if (head) { root.updateWorldMatrix(true, true); this.toHead.copy(head.matrixWorld).invert().multiply(shell.matrixWorld); }
  }

  apply(a: Appearance | null) {
    const u = this.u; this.applied = a ? { ...a } : null;
    u.uOn.value = a ? 1 : 0;
    this.setShave(!!a && a.hair !== 'natural'); u.uScalp.value = a && a.hair !== 'natural' ? 1 : 0;
    this.setHair(a);
    if (!a) return;
    const skin = SKINS[a.skin], color = COLORS[a.color], outfit = OUTFITS[a.outfit], top = hex(color.hex);
    u.uSkin.value.setHex(skin.hex); u.uTop.value.copy(top);
    // the second colour of a print: cream on a dark garment, a deep navy on a light one
    u.uTop2.value.setHex(luma(top) > 0.5 ? 0x1c2540 : 0xf6efdd);
    u.uPrint.value = outfit.print === 'uni' ? 0 : outfit.print === 'stripe' ? 1 : 2;
    u.uBotOn.value = outfit.bottom === null ? 0 : 1; if (outfit.bottom !== null) u.uBot.value.setHex(outfit.bottom);
    u.uInnerOn.value = a.outfit === 0 ? 0 : 1; u.uInner.value.setHex(luma(top) > 0.5 ? 0xe8e2d2 : 0xf6efdd);
  }

  private setShave(on: boolean) {
    const d = this.shell.morphTargetDictionary, inf = this.shell.morphTargetInfluences;
    if (d && inf && d.shave !== undefined) inf[d.shave] = on ? 1 : 0;
  }

  private setHair(a: Appearance | null) {
    const want = a?.hair === 'afro' || a?.hair === 'wrap' ? a.hair : null;
    if (this.hairMesh) { this.hairMesh.removeFromParent(); this.hairMesh = null; }
    this.hairMat?.dispose(); this.hairMat = null;
    if (!want || !this.head) return;
    this.hairMat = new THREE.MeshLambertMaterial(want === 'afro' ? { color: 0x17120f } : { color: hex(COLORS[a!.color].hex), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(want === 'afro' ? afroGeometry() : wrapGeometry(), this.hairMat);
    mesh.name = `hair_${want}`; mesh.castShadow = true; mesh.frustumCulled = false;
    mesh.applyMatrix4(this.toHead);                                                          // the geometry is in the shell's model space: into the head bone's frame
    this.head.add(mesh); this.hairMesh = mesh;
  }

  dispose() { this.hairMesh?.removeFromParent(); this.hairMat?.dispose(); this.hairMesh = null; this.hairMat = null; }
}
