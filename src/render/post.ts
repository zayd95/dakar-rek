import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Post-processing: colour grade (contrast, saturation, warm highlights / cool shadows, vignette) on Medium and High,
 * plus bloom on High (lamps, lit windows and the low sun). Low renders straight to the screen.
 * The grade works in linear HDR before tone mapping; OutputPass applies ACES and sRGB.
 */
const GradeShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uNight: { value: 0 }, uVignette: { value: 0.32 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uNight; uniform float uVignette; varying vec2 vUv;
    void main() {
      vec4 t = texture2D(tDiffuse, vUv); vec3 c = max(t.rgb, vec3(0.0));
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, mix(1.12, 1.05, uNight));                          // saturation
      c = pow(c / 0.18, vec3(mix(1.07, 1.02, uNight))) * 0.18;               // contrast around mid grey
      vec3 shadowTint = mix(vec3(0.96, 1.0, 1.05), vec3(0.9, 0.97, 1.12), uNight);
      vec3 hiTint = mix(vec3(1.05, 1.0, 0.93), vec3(1.08, 0.98, 0.88), uNight);
      c *= mix(shadowTint, hiTint, smoothstep(0.03, 0.5, l));
      float d = length((vUv - 0.5) * vec2(1.1, 1.0));
      c *= mix(1.0, smoothstep(0.85, 0.25, d), uVignette);
      gl_FragColor = vec4(c, t.a);
    }`,
};

export type PostMode = 'off' | 'grade' | 'full';

export class Post {
  private composer: EffectComposer | null = null;
  private grade: ShaderPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  mode: PostMode = 'off';
  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private camera: THREE.Camera) {}

  setMode(mode: PostMode) {
    this.mode = mode;
    this.composer?.dispose(); this.composer = null; this.grade = null; this.bloom = null;
    if (mode === 'off') return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.renderer.capabilities.isWebGL2 ? 4 : 0 });
    const c = new EffectComposer(this.renderer, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (mode === 'full') {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.3, 0.5, 1.1);
      c.addPass(this.bloom);
    }
    this.grade = new ShaderPass(GradeShader); c.addPass(this.grade);
    c.addPass(new OutputPass());
    this.composer = c;
  }
  setSize(w: number, h: number) {
    if (!this.composer) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }
  /** night: 0 day … 1 night. */
  render(night: number) {
    if (!this.composer) { this.renderer.render(this.scene, this.camera); return; }
    if (this.grade) this.grade.uniforms.uNight.value = night;
    if (this.bloom) { this.bloom.strength = 0.18 + 0.55 * night; this.bloom.threshold = 1.15 - 0.55 * night; }
    this.renderer.info.autoReset = false; this.renderer.info.reset();   // count every pass of the frame
    this.composer.render();
  }
}
