import * as THREE from 'three';

/**
 * Sky dome: zenith-to-horizon gradient with a warm haze band (Sahel dust), a sun disc and glow,
 * and a few stars at night. Follows the camera and ignores fog; the fog colour is set to the
 * horizon colour so distant streets melt into the sky instead of into a flat wall.
 */
const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const frag = /* glsl */ `
uniform vec3 uZenith, uHorizon, uHaze, uSunColor, uSunDir;
uniform float uNight;
varying vec3 vDir;
float h21(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float y = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.62, y), 0.75));
  col = mix(col, uHaze, exp(-y * 14.0) * 0.75);                 // dusty band just above the horizon
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(s, 900.0) * 6.0 + pow(s, 24.0) * 0.32 + pow(s, 4.0) * 0.12);
  if (uNight > 0.01 && d.y > 0.05) {
    vec3 c = floor(d * 260.0);
    float st = step(0.9965, h21(c));
    col += vec3(st) * uNight * smoothstep(0.05, 0.35, d.y) * 0.9;
  }
  if (d.y < 0.0) col = mix(uHorizon, uHaze, 0.5);               // below the horizon: ground haze
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

type Key = [number, number, number, number]; // hour, zenith, horizon, haze
const KEYS: Key[] = [
  [0, 0x040814, 0x0f1a34, 0x1a2440],
  [5, 0x060c20, 0x18264a, 0x2a3050],
  [6.2, 0x2d4a80, 0xf0a46c, 0xf6c08a],
  [7.5, 0x3e7cc0, 0xbfd6e2, 0xead8bc],
  [12, 0x2f74c4, 0xb9d5e6, 0xe9dcc2],
  [17, 0x3a78c0, 0xc6d8e0, 0xefd5b0],
  [18.6, 0x34508e, 0xf29a5c, 0xf7b072],
  [19.6, 0x101a3c, 0x3a3060, 0x5a3a52],
  [20.5, 0x060c20, 0x16234a, 0x22284a],
  [24, 0x040814, 0x0f1a34, 0x1a2440],
];

const GREY_DAY = new THREE.Color(0x9aa2aa), GREY_NIGHT = new THREE.Color(0x2c3036);

export class Sky {
  readonly mesh: THREE.Mesh;
  private u: Record<string, THREE.IUniform>;
  readonly horizon = new THREE.Color();
  readonly zenith = new THREE.Color();
  constructor() {
    this.u = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color(0xfff0d0) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uNight: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = -1;
  }
  /** Cloud cover 0–1 (src/city/weather.ts): the sky greys and the sun's disc fades. Call after update(). */
  overcast(c: number, night: boolean) {
    if (c <= 0.06) return;
    const g = night ? GREY_NIGHT : GREY_DAY;
    this.zenith.lerp(g, 0.75 * c); this.horizon.lerp(g, 0.6 * c);
    (this.u.uZenith.value as THREE.Color).copy(this.zenith); (this.u.uHorizon.value as THREE.Color).copy(this.horizon);
    (this.u.uHaze.value as THREE.Color).lerp(g, 0.6 * c);
    (this.u.uSunColor.value as THREE.Color).multiplyScalar(1 - 0.85 * c);
  }
  update(hour: number, sunDir: THREE.Vector3, sunVisible: number, camPos: THREE.Vector3) {
    let i = 0; while (i < KEYS.length - 2 && hour > KEYS[i + 1][0]) i++;
    const [h0, z0, o0, a0] = KEYS[i], [h1, z1, o1, a1] = KEYS[i + 1];
    const t = THREE.MathUtils.clamp((hour - h0) / (h1 - h0), 0, 1);
    this.zenith.set(z0).lerp(new THREE.Color(z1), t);
    this.horizon.set(o0).lerp(new THREE.Color(o1), t);
    (this.u.uZenith.value as THREE.Color).copy(this.zenith);
    (this.u.uHorizon.value as THREE.Color).copy(this.horizon);
    (this.u.uHaze.value as THREE.Color).set(a0).lerp(new THREE.Color(a1), t);
    (this.u.uSunDir.value as THREE.Vector3).copy(sunDir);
    (this.u.uSunColor.value as THREE.Color).set(hour < 8 || hour > 17 ? 0xffb070 : 0xfff2d8).multiplyScalar(sunVisible);
    this.u.uNight.value = hour < 5.5 || hour > 19.8 ? 1 : 0;
    this.mesh.position.copy(camPos);
  }
}
