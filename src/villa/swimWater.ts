import * as THREE from 'three';

/**
 * LD2.0-D round 2, lane R2-W: what the water does round the swimmer (src/villa/swim.ts), in two draw calls whatever happens:
 *  - rings on the surface, one instanced quad each (RINGS at most): a soft annulus drawn additively (its brightness per instance, so a ring fades out
 *    without its own material), growing from r0 to r1 and fading over its life; cut to the pool's water (`clipTo`: nothing spills over the coping);
 *    the swim leaves them round the treading body, at the head on each kick and behind it as it goes, so they spread into a wake;
 *  - drops, one instanced octahedron each (DROPS at most), thrown up and falling back: the splash going in, the drips climbing out.
 * Each mesh is drawn only while something of it lives (its `count` the live ones, packed at the front). Nothing is allocated per frame.
 */
export const RINGS = 28, DROPS = 32;
const GRAVITY = 9.8;

let ringTex: THREE.CanvasTexture | null = null;
/** A soft ring on a transparent square (alpha: the ring), made once. */
function ringTexture() {
  if (ringTex) return ringTex;
  const n = 64, cv = document.createElement('canvas'); cv.width = cv.height = n;
  const g = cv.getContext('2d')!, grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.62, 'rgba(255,255,255,0.05)'); grad.addColorStop(0.82, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.9, 'rgba(255,255,255,0.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, n, n);
  ringTex = new THREE.CanvasTexture(cv); ringTex.colorSpace = THREE.SRGBColorSpace;
  return ringTex;
}

export interface RingOpts { r0: number; r1: number; life: number; strength: number }

export class SwimWater {
  readonly group = new THREE.Group();
  private rings: THREE.InstancedMesh;
  private drops: THREE.InstancedMesh;
  /** Live rings: x, z, age, life, r0, r1, strength (7 a ring), packed. */
  private R = new Float32Array(RINGS * 7); private nR = 0;
  /** Live drops: x, y, z, vx, vy, vz, age, life (8 a drop), packed. */
  private D = new Float32Array(DROPS * 8); private nD = 0;
  private readonly clip = { value: new THREE.Vector4(-1e9, -1e9, 1e9, 1e9) };
  private readonly m = new THREE.Matrix4(); private readonly c = new THREE.Color();
  private readonly q = new THREE.Quaternion(); private readonly p = new THREE.Vector3(); private readonly s = new THREE.Vector3();
  private seed = 1;
  /** For the checks: rings and drops made. */
  private made = { rings: 0, drops: 0 };

  constructor() {
    this.group.name = 'villa-swim-water';
    const plane = new THREE.PlaneGeometry(2, 2); plane.rotateX(-Math.PI / 2);
    const rm = new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    // cut to the water's rectangle (world x0, z0, x1, z1): a ring by the wall never shows on the coping
    rm.onBeforeCompile = sh => {
      sh.uniforms.uSwimClip = this.clip;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vSwimW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 swimW = modelMatrix * instanceMatrix * vec4(transformed, 1.0); vSwimW = swimW.xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec4 uSwimClip; varying vec2 vSwimW;')
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if (vSwimW.x < uSwimClip.x || vSwimW.y < uSwimClip.y || vSwimW.x > uSwimClip.z || vSwimW.y > uSwimClip.w) discard;');
    };
    rm.customProgramCacheKey = () => 'villa-swim-ring';
    this.rings = new THREE.InstancedMesh(plane, rm, RINGS);
    this.rings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(RINGS * 3), 3);
    this.rings.name = 'villa-swim-rings'; this.rings.renderOrder = 4; this.rings.frustumCulled = false; this.rings.count = 0;
    const dm = new THREE.MeshLambertMaterial({ color: 0xe6f6ff, emissive: 0x3d6f86, transparent: true, opacity: 0.8, depthWrite: false });
    this.drops = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.03, 0), dm, DROPS);
    this.drops.name = 'villa-swim-drops'; this.drops.renderOrder = 4; this.drops.frustumCulled = false; this.drops.count = 0;
    this.group.add(this.rings, this.drops);
    this.rings.visible = this.drops.visible = false;
  }

  /** The water's rectangle (world x, z): rings are cut to it. */
  clipTo(x0: number, z0: number, x1: number, z1: number) { this.clip.value.set(x0, z0, x1, z1); }

  /** A ring at (x, z) of the surface. When all are taken, the oldest makes way. */
  ring(x: number, z: number, o: RingOpts) {
    if (this.nR >= RINGS) this.dropRing(this.oldest());
    const k = this.nR++ * 7, R = this.R;
    R[k] = x; R[k + 1] = z; R[k + 2] = 0; R[k + 3] = o.life; R[k + 4] = o.r0; R[k + 5] = o.r1; R[k + 6] = o.strength;
    this.made.rings++;
  }
  /** `n` drops thrown up from (x, y, z), `power` 0…1 (a splash: 1; drips: a little). */
  splash(x: number, y: number, z: number, n: number, power: number) {
    for (let i = 0; i < n && this.nD < DROPS; i++) {
      const k = this.nD++ * 8, D = this.D, a = this.rand() * Math.PI * 2, out = (0.35 + 0.9 * this.rand()) * power, up = power >= 0.5 ? (1.4 + 1.6 * this.rand()) * power : -0.2 * this.rand();
      D[k] = x + Math.cos(a) * 0.25; D[k + 1] = y; D[k + 2] = z + Math.sin(a) * 0.25;
      D[k + 3] = Math.cos(a) * out; D[k + 4] = up; D[k + 5] = Math.sin(a) * out; D[k + 6] = 0; D[k + 7] = 0.5 + 0.5 * this.rand();
      this.made.drops++;
    }
  }

  /** Every frame: the rings grow and fade on the surface at `waterY`, the drops fly; `light` (0…1) dims the rings by night. */
  update(dt: number, waterY: number, light: number) {
    const R = this.R, D = this.D;
    for (let i = 0; i < this.nR;) { const k = i * 7; R[k + 2] += dt; if (R[k + 2] >= R[k + 3]) this.dropRing(i); else i++; }
    for (let i = 0; i < this.nD;) {
      const k = i * 8; D[k + 6] += dt; D[k + 4] -= GRAVITY * dt;
      D[k] += D[k + 3] * dt; D[k + 1] += D[k + 4] * dt; D[k + 2] += D[k + 5] * dt;
      if (D[k + 6] >= D[k + 7] || D[k + 1] < waterY - 0.05) this.dropDrop(i); else i++;
    }
    this.q.identity();
    for (let i = 0; i < this.nR; i++) {
      const k = i * 7, u = R[k + 2] / R[k + 3], e = 1 - (1 - u) * (1 - u), r = R[k + 4] + (R[k + 5] - R[k + 4]) * e;
      this.p.set(R[k], waterY + 0.008, R[k + 1]); this.s.set(r, 1, r);
      this.rings.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
      const a = R[k + 6] * light * Math.min(1, u * 6) * (1 - u) * (1 - u);
      this.rings.setColorAt(i, this.c.setRGB(a, a, a));
    }
    for (let i = 0; i < this.nD; i++) {
      const k = i * 8, sc = 1 - 0.6 * (D[k + 6] / D[k + 7]);
      this.p.set(D[k], D[k + 1], D[k + 2]); this.s.setScalar(sc);
      this.drops.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    }
    this.rings.count = this.nR; this.drops.count = this.nD;
    this.rings.visible = this.nR > 0; this.drops.visible = this.nD > 0;
    if (this.nR) { this.rings.instanceMatrix.needsUpdate = true; this.rings.instanceColor!.needsUpdate = true; }
    if (this.nD) this.drops.instanceMatrix.needsUpdate = true;
  }

  info() { return { rings: this.nR, drops: this.nD, made: { ...this.made }, drawn: (this.rings.visible ? 1 : 0) + (this.drops.visible ? 1 : 0) }; }
  dispose() {
    this.rings.geometry.dispose(); (this.rings.material as THREE.Material).dispose(); this.rings.dispose();
    this.drops.geometry.dispose(); (this.drops.material as THREE.Material).dispose(); this.drops.dispose();
    this.group.removeFromParent();
  }

  private oldest() { let best = 0, age = -1; for (let i = 0; i < this.nR; i++) if (this.R[i * 7 + 2] / this.R[i * 7 + 3] > age) { age = this.R[i * 7 + 2] / this.R[i * 7 + 3]; best = i; } return best; }
  /** Removes ring `i`: the last live one takes its place. */
  private dropRing(i: number) { const last = --this.nR; if (i !== last) this.R.copyWithin(i * 7, last * 7, last * 7 + 7); }
  private dropDrop(i: number) { const last = --this.nD; if (i !== last) this.D.copyWithin(i * 8, last * 8, last * 8 + 8); }
  /** A small deterministic generator (the splash's spread). */
  private rand() { this.seed = (this.seed * 16807) % 2147483647; return (this.seed - 1) / 2147483646; }
}
