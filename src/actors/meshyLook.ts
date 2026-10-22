import * as THREE from 'three';
import { COLORS, OUTFITS, SKINS, lightCloth, type Appearance } from './appearance';
import { GLSL_NOISE, GLSL_TEXTILE } from './glslTextile';
import { HAIRLINE_GLSL, HEAD_FIT, buildHairStyle, combToward, scalpMode, type HairRig } from './hairStyles';

/**
 * What the character studio changes on a Meshy body (docs/avatar/STUDIO.md). The body is one fused shell with one base-colour texture, so in the fragment shader:
 *  - the skin is found (by hue, and on the head by elimination: not hair, not the white of eyes and teeth, not gold, not cloth) and re-toned in gamma space: the
 *    texture's own shading and its local colour (lips, blush, shadows) are carried onto the chosen tone, gentler on the darkest tones so faces stay readable;
 *  - the main garment (homme: the tee; femme: the bomber, her top under it following) is recoloured from its hue, and can take stripes or the geometric print
 *    (src/actors/glslTextile.ts, in the shell's model space so it follows the animation); the trousers can take another colour;
 *  - the baked hair, taken in onto the skull by the 'shave' morph target (scripts/avatar/add-hair.mjs, `_HAIR` attribute), is shaded as a shaved scalp or as
 *    hair combed close, under a procedural style (src/actors/hairStyles.ts).
 * `null` is the body as it was made: no tint, baked hair.
 */

/** Per body: the mean colour of its skin in the texture (gamma), the linear luminance of its main garment and of its trousers, where its head begins. */
const BODY = {
  m: { skin: new THREE.Vector3(0.486, 0.282, 0.212), top: 0.189, bot: 0.0062, headY: 1.62, botY: 0.92 },
  f: { skin: new THREE.Vector3(0.412, 0.243, 0.157), top: 0.059, bot: 0.018, headY: 1.565, botY: 0.8 },
};

export interface MeshyUniforms {
  uOn: { value: number }; uFemale: { value: number }; uScalp: { value: number }; uBotOn: { value: number }; uInnerOn: { value: number }; uPrint: { value: number };
  uBotY: { value: number }; uHeadY: { value: number }; uTopRef: { value: number }; uBotRef: { value: number };
  uTone: { value: number }; uBrowTop: { value: number }; uSkin: { value: THREE.Vector3 }; uSkinRef: { value: THREE.Vector3 }; uTop: { value: THREE.Color }; uTop2: { value: THREE.Color }; uTop3: { value: THREE.Color };
  uBot: { value: THREE.Color }; uInner: { value: THREE.Color }; uSkullC: { value: THREE.Vector3 }; uSkullR: { value: THREE.Vector3 }; uComb: { value: THREE.Vector3 };
  uHairline: { value: THREE.Vector3 }; uNeckTop: { value: number };
}

const FRAG_FUNCS = /* glsl */`
uniform float uOn, uFemale, uScalp, uBotOn, uInnerOn, uPrint, uBotY, uHeadY, uTopRef, uBotRef;
uniform float uTone, uBrowTop;
uniform vec3 uSkin, uSkinRef, uTop, uTop2, uTop3, uBot, uInner, uSkullC, uSkullR, uComb, uHairline; uniform float uNeckTop;
varying float vHair; varying vec3 vMp; varying vec3 vMn;
${GLSL_NOISE}
${GLSL_TEXTILE}
vec3 mlHsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); return vec3(abs(q.z+(q.w-q.y)/(6.*d+1e-10)),d/(q.x+1e-10),q.x); }
float mlHue(float h,float c,float lo,float hi){ float d=abs(fract(h-c+.5)-.5); return 1.-smoothstep(lo,hi,d); }
vec3 mlGarment(){
  if (uPrint < .5) return uTop;
  if (uPrint < 1.5) { float f = vMp.y*11.5, w = fwidth(f)*.75; return mix(uTop, uTop2, smoothstep(.25-w, .25+w, abs(fract(f)-.5))); }
  vec3 w = pow(abs(normalize(vMn)), vec3(6.)); w /= (w.x+w.y+w.z+1e-5);
  float s = 15.5;
  vec3 ink = textileInks(vMp.zy*s)*w.x + textileInks(vMp.xz*s)*w.y + textileInks(vMp.xy*s)*w.z;
  return uTop*ink.x + uTop2*ink.y + uTop3*ink.z;
}
`;
const FRAG_BODY = /* glsl */`
#include <map_fragment>
float mlSkinW = 0.;
#ifdef USE_MAP
if (uOn > .5) {
  vec3 mc = diffuseColor.rgb, g = pow(max(mc, vec3(0.)), vec3(1./2.2)), hs = mlHsv(g);
  float lum = dot(mc, vec3(.2126,.7152,.0722)), wTop, wInner = 0., wBot, wSeam = 0., wInnerSeam = 0.;
  float upper = step(.55, vMp.y);                                                     // garments above the hips (never the shoes)
  if (uFemale < .5) {
    wTop = mlHue(hs.x,.567,.06,.11)*smoothstep(.3,.5,hs.y)*smoothstep(.12,.26,hs.z)*upper*(1.-step(uNeckTop, vMp.y));   // (wide: the tee's seams too; never a blue texel in his hair)
    // the darkest seam texels (the tee's blue run into the navy between islands), only between the waist and the collar: cloth too, at the cloth's mean shade
    wSeam = mlHue(hs.x,.6,.08,.14)*smoothstep(.25,.4,hs.y)*(1.-smoothstep(.2,.3,hs.z))*step(uBotY+.04, vMp.y)*(1.-step(1.5, vMp.y))*(1.-wTop);
    wBot = mlHue(hs.x,.62,.1,.17)*smoothstep(.25,.4,hs.y)*smoothstep(.06,.09,hs.z)*(1.-smoothstep(.25,.35,hs.z))*(1.-step(uBotY+.15, vMp.y));   // (trousers: never his blue-black hair)
  } else {
    wInner = mlHue(hs.x,.125,.03,.06)*smoothstep(.5,.65,hs.y)*smoothstep(.35,.5,hs.z)*upper;
    wTop = mlHue(hs.x,.18,.05,.1)*smoothstep(.15,.3,hs.y)*smoothstep(.1,.18,hs.z)*(1.-wInner)*upper;
    wBot = mlHue(hs.x,.58,.06,.11)*smoothstep(.3,.45,hs.y)*smoothstep(.06,.1,hs.z)*(1.-smoothstep(.3,.4,hs.z));
    // the bomber's darkest creases (olive, below the mask's floor), between the waist and the collar: cloth too; in the open front, the top under it
    float dk = mlHue(hs.x,.16,.05,.1)*smoothstep(.04,.1,hs.y)*(1.-smoothstep(.25,.38,hs.z))*step(uBotY+.04, vMp.y)*(1.-step(1.56, vMp.y))*(1.-wTop)*(1.-wInner);
    float front = (1.-step(.085, abs(vMp.x)))*step(.04, vMp.z);
    wSeam = dk*(1.-front); wInnerSeam = dk*front*uInnerOn;
  }
  float leg = (1.-step(uBotY,vMp.y))*step(.15,vMp.y)*(1.-step(.24,abs(vMp.x)));      // between the hips and the shoes (not the arms): all trousers
  wBot = max(wBot, leg);
  // femme: the waist under the bomber's hem, painted near-black in the texture: trousers too (not the bomber, its creases or the top)
  float waist = uFemale*step(uBotY-.01, vMp.y)*(1.-step(uBotY+.16, vMp.y))*(1.-step(.2, abs(vMp.x)));
  wBot = max(wBot, max(1.-smoothstep(.05,.1,hs.z), mlHue(hs.x,.6,.08,.14)*smoothstep(.15,.3,hs.y)*(1.-smoothstep(.3,.45,hs.z)))*waist*(1.-wTop)*(1.-wSeam)*(1.-wInner)*(1.-wInnerSeam));
  float garment = max(max(max(wTop, wSeam), max(wInner, wInnerSeam)), wBot*uBotOn);
  // the skin: by its hue anywhere; on the head, everything that is not hair, the white of eyes and teeth, gold or cloth
  float dark = 1.-smoothstep(.1,.17,hs.z);
  float white = (1.-smoothstep(.12,.24,hs.y))*smoothstep(.45,.6,hs.z);
  float gold = mlHue(hs.x,.12,.03,.06)*smoothstep(.35,.5,hs.y)*smoothstep(.4,.55,hs.z);
  float head = step(uHeadY, vMp.y)*(1.-step(.16, abs(vMp.x)))*step(-.17, vMp.z);
  float hueSkin = mlHue(hs.x,.035,.065,.105)*smoothstep(.12,.25,hs.y)*smoothstep(.07,.14,hs.z);
  // the homme's bare arms (out from the torso, below the sleeves): grey highlights Meshy painted on the elbows and forearms are skin too
  float limb = (1.-uFemale)*step(.2, abs(vMp.x))*step(.72, vMp.y)*(1.-step(1.42, vMp.y))*(1.-dark)*(1.-white);
  float wSkin = max(max(hueSkin, head*(1.-dark*.9)*(1.-white)*(1.-gold)), limb) * (1.-garment) * (1.-leg);
  // re-toned in gamma space: the texture's shading and its local colour (lips, blush) carried onto the tone; gentler contrast on dark tones
  vec3 L = vec3(.299,.587,.114);
  float lg = dot(g, L), lr = dot(uSkinRef, L), k = lg / lr;
  // (his bare arms count as skin by position, not by hue: the olive that bled into the texture along the sleeve's hem must not tint them)
  float chromaW = mix(max(hueSkin, head), 1., uFemale);
  vec3 chroma = mix(vec3(1.), clamp((g / max(lg, .004)) / (uSkinRef / lr), vec3(.62, .62, .62), vec3(1.4, 1.2, 1.1)), .6 * chromaW);   // lips and blush keep their red, never turn mauve
  float tl = dot(uSkin, L), con = mix(.55, 1., smoothstep(.3, .62, tl));
  float kk = k > 1. ? 1. + (k - 1.) * .45 : 1. + (k - 1.) * con;                           // the texture's baked highlights never bleach a light tone
  vec3 o = uSkin * max(kk, .32) * chroma;
  o *= mix(vec3(1.), vec3(1.06,.95,.86), clamp((1. - k) * .7, 0., .45));               // shadows on skin are warm, not grey
  vec3 skin = pow(clamp(o, 0., 1.), vec3(2.2));
  // once the hair is taken in, the strands painted over the forehead go with it
  float fore = uScalp > .5 ? dark * step(uBrowTop, vMp.y) * step(.03, vMp.z) * (1. - step(.09, abs(vMp.x))) : 0.;
  skin = mix(skin, pow(clamp(uSkin * .97, 0., 1.), vec3(2.2)), fore); wSkin = max(wSkin, fore);
  vec3 col = mc;
  col = mix(col, skin, wSkin); mlSkinW = wSkin;
  col = mix(col, mlGarment()*clamp(pow(lum/uTopRef,.7),.45,1.5), wTop);              // the folds kept, softened: creases read as cloth, not as dirt
  col = mix(col, mlGarment()*.85, wSeam);
  col = mix(col, uInner*clamp(lum/.12,.45,1.4), wInner*uInnerOn);
  col = mix(col, uInner*.8, wInnerSeam);
  col = mix(col, uBot*clamp(pow(lum/uBotRef,.75),.6,1.12), wBot*uBotOn);            // (bright specks at the seams never become light scratches)
  // where the hair was taken in (blended across a triangle that is half hair: no polygon edge on the forehead)
  float hw = uScalp > .5 ? smoothstep(.05, .95, vHair) : 0.;
  vec3 e = (vMp - uSkullC) / uSkullR; float ph = acos(clamp(normalize(e).y, -1., 1.)), th = abs(atan(e.x, e.z));
  float line = uHairline.x + uHairline.y * smoothstep(.26, 1.66, th) + uHairline.z * smoothstep(1.66, 3.14, th);
  // the homme shaved: a dark texel on his scalp, above his hairline, that no strand vertex carried (a speck, the fringe's last row, a temple) is taken in too
  if (uScalp > .5 && uScalp < 1.5 && uFemale < .5) hw = max(hw, dark * (1. - smoothstep(line + .02, line + .05, ph)) * (1. - smoothstep(1.2, 1.35, length(e))));
  if (hw > 0.) {
    // below the hairline (the forehead and temples a fringe covered) and on the nape it is skin again
    float bare = max(smoothstep(line + .015, line + .06, ph) * (1. - smoothstep(1.1, 1.4, th)), 1. - smoothstep(uNeckTop - .012, uNeckTop + .004, vMp.y));
    vec3 hc;
    if (uScalp < 1.5) {                                                                  // shaved (the homme's style): his skin in the face's own tone, a touch darker
      vec3 st = pow(clamp(uSkin * .93, 0., 1.), vec3(2.2));                              // where the hair was, a soft grain of stubble, never black specks
      hc = st * (.88 + .08 * tnNoise(vMp * 700.));
      // where the texel is skin already, near his hairline, it stays his skin: the edge follows his hairline, not the triangles (higher up, a fade's paint is scalp too)
      hc = mix(hc, max(skin, hc * .92), (1. - dark) * smoothstep(line - .1, line - .02, ph));
      mlSkinW = max(mlSkinW, hw * (1. - garment));                                       // the scalp catches the light as his face does (no helmet)
    } else {                                                                             // combed close toward the style
      vec3 v = normalize(vMp - uSkullC), b1 = normalize(cross(uComb, vec3(.577,.577,.577))), b2 = cross(uComb, b1);
      float az = atan(dot(v, b1), dot(v, b2)), strand = .5 + .5 * sin(az * 130. + tnNoise(vMp * 260.) * 5.);
      hc = vec3(.011,.0075,.006) * (.65 + 1.1 * strand * strand);
    }
    // bare: where the texel is skin already (a hairline vertex taken in with its strand), its own re-toned skin, so no edge shows against the face; under a strand, the tone
    hc = mix(hc, mix(pow(clamp(uSkin * .93, 0., 1.), vec3(2.2)), skin, (1. - dark) * (1. - garment)), bare);
    col = mix(col, hc, hw * (1. - garment * (1. - uFemale)));                            // (on the homme, never over cloth the masks know)
  }
  // the homme's hair taken in (shaved, or under an afro or a kufi): under his skull the nape's painted hairline (its dark line, its fade) is his skin too, as smooth as
  // the scalp above it (shaved: up into the scalp; a close-combed style keeps its own hair above the neck line); shaved, the thin line painted along his temples too
  if (uScalp > .5 && uFemale < .5) {
    float top = uScalp < 1.5 ? uNeckTop + .03 : uNeckTop - .004;
    float nape = smoothstep(1.75, 2.2, th) * smoothstep(uNeckTop - .068, uNeckTop - .052, vMp.y) * (1. - smoothstep(top - .01, top + .01, vMp.y)) * (1. - garment) * (1. - smoothstep(.78, .97, k));
    if (uScalp < 1.5) nape = max(nape, smoothstep(line - .09, line - .06, ph) * (1. - smoothstep(line + .05, line + .08, ph)) * step(uBrowTop + .005, vMp.y) * (1. - smoothstep(1.25, 1.6, th)) * (1. - garment) * (1. - smoothstep(.72, .9, k)));
    col = mix(col, pow(clamp(uSkin * mix(.97, .93, smoothstep(uNeckTop - .05, uNeckTop - .01, vMp.y)), 0., 1.), vec3(2.2)) * (.88 + .08 * tnNoise(vMp * 700.)), nape);   // (toward the neck's tone below)
    mlSkinW = max(mlSkinW, nape);
  }
  diffuseColor.rgb = col;
}
#endif
`;

/** A soft sheen on the skin (the key light's highlight, a little rim), stronger on darker tones: a face keeps its shape in any complexion. */
const SHEEN = /* glsl */`
#if NUM_DIR_LIGHTS > 0
if (mlSkinW > 0.) {
  vec3 vd = normalize(vViewPosition), hv = normalize(directionalLights[0].direction + vd);
  float spec = pow(max(dot(normal, hv), 0.), 20.), rim = pow(1. - max(dot(normal, vd), 0.), 3.);
  outgoingLight += (directionalLights[0].color * spec * mix(.075, .03, uTone) + vec3(rim * mix(.07, .015, uTone))) * mlSkinW;
}
#endif
#include <opaque_fragment>
`;

/** The material of a Meshy body (the baked texture; the studio's recolour stays off until a look is applied). */
export function makeMeshyMaterial(map: THREE.Texture, female: boolean): { mat: THREE.MeshLambertMaterial; u: MeshyUniforms } {
  const B = female ? BODY.f : BODY.m, F = HEAD_FIT[female ? 'femme' : 'homme'];
  const u: MeshyUniforms = {
    uOn: { value: 0 }, uFemale: { value: female ? 1 : 0 }, uScalp: { value: 0 }, uBotOn: { value: 0 }, uInnerOn: { value: 0 }, uPrint: { value: 0 },
    uBotY: { value: B.botY }, uHeadY: { value: B.headY }, uTopRef: { value: B.top }, uBotRef: { value: B.bot },
    uTone: { value: 0.3 }, uBrowTop: { value: female ? 1.768 : 1.84 }, uSkin: { value: new THREE.Vector3(0.5, 0.3, 0.2) }, uSkinRef: { value: B.skin.clone() }, uTop: { value: new THREE.Color() }, uTop2: { value: new THREE.Color() }, uTop3: { value: new THREE.Color() },
    uBot: { value: new THREE.Color() }, uInner: { value: new THREE.Color() }, uSkullC: { value: new THREE.Vector3(...F.skull.c) }, uSkullR: { value: new THREE.Vector3(...F.skull.r) }, uHairline: { value: new THREE.Vector3(...HAIRLINE_GLSL[female ? 'femme' : 'homme']) }, uNeckTop: { value: F.neckTop }, uComb: { value: new THREE.Vector3(0, 0.6, -0.8).normalize() },
  };
  const mat = new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _hair; varying float vHair; varying vec3 vMp; varying vec3 vMn;')
      .replace('#include <morphnormal_vertex>', '#include <morphnormal_vertex>\nvMn = objectNormal;')
      .replace('#include <morphtarget_vertex>', '#include <morphtarget_vertex>\nvHair = _hair; vMp = transformed;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${FRAG_FUNCS}`).replace('#include <map_fragment>', FRAG_BODY).replace('#include <opaque_fragment>', SHEEN);
  };
  mat.customProgramCacheKey = () => 'meshy-look-v29';
  return { mat, u };
}

/** Each body's own jeans (their mean colour in the texture, measured), for the plain outfit. */
const OWN_JEANS = { homme: 0x0f1221, femme: 0x1a2836 };
const gamma = (hex: number) => { const c = new THREE.Color(hex); c.convertLinearToSRGB(); return new THREE.Vector3(c.r, c.g, c.b); };

/** The look of one Meshy body: owns its uniforms and its hair meshes. */
export class MeshyLook {
  private hair: HairRig | null = null;
  private hairKey = '';
  applied: Appearance | null = null;
  /** The shell's model space (where the hair geometry is built) in the head bone's frame, taken at construction, when the bones are at rest. */
  private toHead = new THREE.Matrix4();
  constructor(root: THREE.Object3D, private head: THREE.Object3D | null, private shell: THREE.Mesh, private u: MeshyUniforms) {
    if (head) { root.updateWorldMatrix(true, true); this.toHead.copy(head.matrixWorld).invert().multiply(shell.matrixWorld); }
  }
  private get body() { return this.u.uFemale.value > 0.5 ? 'femme' as const : 'homme' as const; }

  apply(a: Appearance | null) {
    const u = this.u; this.applied = a ? { ...a } : null;
    u.uOn.value = a ? 1 : 0;
    const style = a?.hair ?? 'natural';
    this.setShave(style !== 'natural'); u.uScalp.value = a ? scalpMode(style) : 0; u.uComb.value.copy(combToward(style, this.body));
    this.setHair(a);
    if (!a) return;
    const color = COLORS[a.color], outfit = OUTFITS[a.outfit], top = new THREE.Color(color.hex);
    u.uSkin.value.copy(gamma(SKINS[a.skin].hex)); u.uTone.value = u.uSkin.value.dot(new THREE.Vector3(0.299, 0.587, 0.114)); u.uTop.value.copy(top);
    // the print's inks: cream and a deep shade on a dark garment, indigo inks on a light one
    const light = lightCloth(color.hex);
    u.uTop2.value.setHex(light ? 0x2a3866 : 0xf3ead6); u.uTop3.value.copy(light ? new THREE.Color(0x1a2140) : top.clone().multiplyScalar(0.36));
    u.uPrint.value = outfit.print === 'uni' ? 0 : outfit.print === 'stripe' ? 1 : 2;
    u.uBotOn.value = 1; u.uBot.value.setHex(outfit.bottom ?? OWN_JEANS[this.body]);   // (the body's own jeans, repainted in their own colour: no stray specks from the seams)
    u.uInnerOn.value = a.outfit === 0 ? 0 : 1; u.uInner.value.setHex(light ? 0xe6dfcf : 0xf3ead6);
  }

  private setShave(on: boolean) {
    const d = this.shell.morphTargetDictionary, inf = this.shell.morphTargetInfluences;
    if (d && inf && d.shave !== undefined) inf[d.shave] = on ? 1 : 0;
  }

  private setHair(a: Appearance | null) {
    const style = a?.hair ?? 'natural', key = `${style}:${style === 'wrap' || style === 'kufi' || style === 'puff' ? a!.color : ''}`;
    if (key === this.hairKey) return;
    this.hair?.dispose(); this.hair = null; this.hairKey = key;
    if (!a || !this.head) return;
    const rig = buildHairStyle(style, this.body, COLORS[a.color].hex);
    if (!rig) return;
    rig.group.applyMatrix4(this.toHead);                                                    // built in the shell's model space: into the head bone's frame
    this.head.add(rig.group); this.hair = rig;
  }

  dispose() { this.hair?.dispose(); this.hair = null; this.hairKey = ''; }
}
