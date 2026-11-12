import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { countCalls, loadHumanoid } from './perfHost';

// The life jacket of la traversée (src/actors/humanoid.ts setVest), on the shipped humanoid parsed in node (tests/perfHost.ts).
type H = import('../src/actors/humanoid').Humanoid;
let Humanoid: typeof import('../src/actors/humanoid').Humanoid, VEST_ORANGE: number;
beforeAll(async () => { await loadHumanoid(); ({ Humanoid, VEST_ORANGE } = await import('../src/actors/humanoid')); });

const LOOKS = {
  tee: { skin: 0x5b3420, style: 'tee', top: 0x2f6fa8, bottom: 0x22252b },
  boubou: { skin: 0x4e2e1c, style: 'boubou', top: 0xeee8da, bottom: 0xeee8da, hat: 'kufi', hatColor: 0xf2f2ec },
  dress: { skin: 0x6b3f25, style: 'dress', top: 0xd66532, female: true, pattern: 'wax', accent: 0xf2d16b, hat: 'headwrap', hatColor: 0xe8b734 },
} as const;
/** Every mesh of a body with what it draws: its geometry, its material, whether it shows. */
const parts = (h: H) => { const out: { name: string; geo: THREE.BufferGeometry; mat: THREE.Material; visible: boolean }[] = []; h.group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) out.push({ name: m.name, geo: m.geometry, mat: m.material as THREE.Material, visible: m.visible }); }); return out; };
const trunk = (h: H) => { let t: THREE.SkinnedMesh | null = null; h.group.traverse(o => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.getAttribute('vest')) t = o as THREE.SkinnedMesh; }); return t as THREE.SkinnedMesh | null; };
/** The body's draw calls in a frame (main pass, and the shadow pass), as three r169 counts them. */
function calls(h: H) {
  const scene = new THREE.Scene(), extra = new THREE.Group(); scene.add(extra); extra.add(h.group);
  const cam = new THREE.PerspectiveCamera(60, 390 / 844, 0.1, 100); cam.position.set(0, 1.4, 4); cam.lookAt(0, 1, 0);
  const sun = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 50); sun.position.set(3, 10, 3); sun.lookAt(0, 0, 0);
  scene.updateMatrixWorld(true);
  const n = countCalls(scene, extra, cam, sun); h.group.removeFromParent(); return { main: n.calls, shadow: n.shadow };
}
/** A vertex of the trunk's vest, skinned and morphed as the GPU draws it, in the world. */
const skinned = (m: THREE.SkinnedMesh, i: number) => { m.updateMatrixWorld(true); return m.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(m.matrixWorld); };
const posed = (h: H, clip: 'Idle' | 'Walk' | 'Sit', t = 0.37) => { h.play(clip, 0); h.update(t); h.group.updateMatrixWorld(true); };

describe('the life jacket (la traversée)', () => {
  it('changes nothing for a body that never wears one', () => {
    const a = new Humanoid(LOOKS.tee), b = new Humanoid(LOOKS.tee);
    b.setVest(true); b.setVest(false);
    const pa = parts(a), pb = parts(b);
    expect(pa.map(p => [p.name, p.visible])).toEqual(pb.map(p => [p.name, p.visible]));
    expect(pa.every((p, i) => p.geo === pb[i].geo)).toBe(true);                         // the shared garments' own geometries, back in place
    expect(pa.some(p => p.geo.getAttribute('vest'))).toBe(false);
    for (const p of pa) { expect(p.mat.customProgramCacheKey()).not.toBe('vest'); }       // and no material of it patched
    expect(a.vestOn).toBe(false);
  });

  for (const style of ['tee', 'boubou', 'dress'] as const) {
    it(`${style}: put on, it is no extra draw call; it is the trunk of the garment worn, pushed out and painted orange; taken off, the garment comes back`, () => {
      const h = new Humanoid(LOOKS[style]), before = calls(h), own = parts(h);
      expect(h.setVest(true)).toBe(true); expect(h.vestOn).toBe(true);
      const after = calls(h), t = trunk(h)!;
      expect(after).toEqual(before);                                                    // the same meshes: no draw call more, in either pass
      expect(parts(h).map(p => p.name)).toEqual(own.map(p => p.name));
      const garment = { tee: 'Cloth_Tee', boubou: 'Cloth_Boubou', dress: 'Cloth_DressTop' }[style];
      expect(t.name).toBe(garment); expect(t.visible).toBe(true);
      // the trunk (between the hips and the collar, off the sleeves) is marked and stands out from the garment; the sleeves stay as they were
      const g = t.geometry, ownGeo = own.find(p => p.name === garment)!.geo, v = g.getAttribute('vest'), p = g.getAttribute('position'), q = ownGeo.getAttribute('position');
      let on = 0, moved = 0, still = 0;
      for (let i = 0; i < v.count; i++) {
        const d = Math.hypot(p.getX(i) - q.getX(i), p.getY(i) - q.getY(i), p.getZ(i) - q.getZ(i));
        if (v.getX(i) > 0.5) { on++; expect(p.getY(i)).toBeGreaterThan(0.9); expect(p.getY(i)).toBeLessThan(1.7); if (d > 0.014) moved++; expect(Math.hypot(p.getX(i), p.getZ(i))).toBeGreaterThanOrEqual(Math.hypot(q.getX(i), q.getZ(i)) - 1e-3); }
        else if (v.getX(i) === 0) { expect(d).toBe(0); still++; }
      }
      expect(on).toBeGreaterThan(60); expect(moved).toBe(on); expect(still).toBeGreaterThan(10);           // (half the vest at its edge: half its puff)
      // its morph targets and skinning are the garment's: it fits every body shape and moves with the bones
      expect(g.morphAttributes.position).toBe(ownGeo.morphAttributes.position); expect(g.getAttribute('skinIndex')).toBe(ownGeo.getAttribute('skinIndex'));
      // the material paints the marked part orange, the body's own (patched once)
      const mat = t.material as THREE.Material, shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
      expect(mat.customProgramCacheKey()).toBe('vest');
      mat.onBeforeCompile(shader as never, null as never);
      expect(shader.vertexShader).toMatch(/attribute float vest;/); expect(shader.vertexShader).toMatch(/vVest = vest \* vestOn;/);
      expect(shader.fragmentShader).toMatch(/mix\( diffuseColor\.rgb, vestColor, step\( 0\.5, vVest \) \)/);
      expect(shader.uniforms.vestOn.value).toBe(1); expect((shader.uniforms.vestColor.value as THREE.Color).getHex()).toBe(VEST_ORANGE);
      // off: the garment's own geometry, and the patched shader paints nothing
      h.setVest(false);
      expect(t.geometry).toBe(ownGeo); expect(shader.uniforms.vestOn.value).toBe(0); expect(h.vestOn).toBe(false); expect(calls(h)).toEqual(before);
      h.dispose();
    });
  }

  it('one vest geometry per garment, shared by every body that wears it; a new look refits it to what the body now wears', () => {
    const a = new Humanoid(LOOKS.tee), b = new Humanoid({ ...LOOKS.tee, top: 0xd9322b });
    a.setVest(true); b.setVest(true);
    expect(trunk(a)!.geometry).toBe(trunk(b)!.geometry);
    expect(trunk(a)!.material).not.toBe(trunk(b)!.material);                                // each body's own cloth, so each fades on its own
    a.setLook(LOOKS.boubou as never);
    expect(a.vestOn).toBe(true); expect(trunk(a)!.name).toBe('Cloth_Boubou');
    expect(parts(a).filter(p => p.geo.getAttribute('vest'))).toHaveLength(1);              // the tee has its own geometry back
    a.reset(); expect(a.vestOn).toBe(false); expect(trunk(a)).toBeNull();
  });

  it('follows the trunk in the clips the customers play: standing, walking, sitting', () => {
    const h = new Humanoid(LOOKS.tee); h.setVest(true);
    const t = trunk(h)!, v = t.geometry.getAttribute('vest'), p = t.geometry.getAttribute('position');
    // a vertex on the chest's front and one on the back, low: each against the bone that carries it
    let front = -1, low = -1;
    for (let i = 0; i < v.count; i++) if (v.getX(i) > 0.99) {
      if (p.getY(i) > 1.3 && p.getY(i) < 1.45 && (front < 0 || p.getZ(i) > p.getZ(front))) front = i;
      if (p.getY(i) > 1.0 && p.getY(i) < 1.15 && (low < 0 || p.getZ(i) < p.getZ(low))) low = i;
    }
    expect(front).toBeGreaterThanOrEqual(0); expect(low).toBeGreaterThanOrEqual(0);
    const chest = h.bone('chest')!, spine = h.bone('spine')!, inBone = (b: THREE.Object3D, w: THREE.Vector3) => b.worldToLocal(w.clone());
    posed(h, 'Idle'); const f0 = inBone(chest, skinned(t, front)), l0 = inBone(spine, skinned(t, low)), c0 = chest.getWorldPosition(new THREE.Vector3());
    for (const clip of ['Walk', 'Sit'] as const) {
      posed(h, clip);
      const c1 = chest.getWorldPosition(new THREE.Vector3());
      if (clip === 'Sit') expect(c0.y - c1.y).toBeGreaterThan(0.25);                         // the trunk did move down onto the seat…
      expect(inBone(chest, skinned(t, front)).distanceTo(f0)).toBeLessThan(0.03);            // …and the vest with it, front and back
      expect(inBone(spine, skinned(t, low)).distanceTo(l0)).toBeLessThan(0.05);
    }
    h.dispose();
  });

});
