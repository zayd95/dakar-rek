import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TextureSweep, texturesIn } from '../src/core/textureSweep';

const tex = () => { const t = new THREE.Texture(); let gone = 0; t.addEventListener('dispose', () => gone++); return { t, gone: () => gone }; };
const mesh = (m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(), m);

describe('textures are freed when a district is left (src/core/textureSweep.ts)', () => {
  it('finds every texture a scene draws with: any map of a material, a shader’s uniforms, the background', () => {
    const a = tex(), b = tex(), c = tex(), d = tex(), bg = tex();
    const scene = new THREE.Scene(); scene.background = bg.t;
    scene.add(mesh(new THREE.MeshLambertMaterial({ map: a.t, emissiveMap: b.t })));
    const g = new THREE.Group(); scene.add(g);
    g.add(mesh(new THREE.ShaderMaterial({ uniforms: { uTex: { value: c.t }, uList: { value: [d.t] }, uNum: { value: 3 } } })));
    const found = texturesIn(scene as never);
    expect([...found.keys()].sort()).toEqual([a.t, b.t, c.t, d.t, bg.t].map(t => t.uuid).sort());
  });

  it('frees what the district being left used and the next scene does not; keeps what both use', () => {
    const sign = tex(), wall = tex(), shared = tex(), next = tex();
    const scene = new THREE.Scene();
    const old = new THREE.Group(); old.add(mesh(new THREE.MeshLambertMaterial({ map: sign.t })), mesh(new THREE.MeshLambertMaterial({ map: wall.t })), mesh(new THREE.MeshLambertMaterial({ map: shared.t })));
    const player = mesh(new THREE.MeshLambertMaterial({ map: shared.t }));
    scene.add(old, player);
    const sweep = new TextureSweep();
    sweep.note(scene as never);
    scene.remove(old);
    scene.add(mesh(new THREE.MeshLambertMaterial({ map: next.t })));
    expect(sweep.sweep(scene as never)).toBe(2);
    expect([sign.gone(), wall.gone(), shared.gone(), next.gone()]).toEqual([1, 1, 0, 0]);
    expect(sweep.freed).toBe(2);
    // the district after that: what was new is now old
    scene.clear(); scene.add(player);
    expect(sweep.sweep(scene as never)).toBe(1);
    expect(next.gone()).toBe(1); expect(shared.gone()).toBe(0);
  });

  it('never touches a render target or a video frame', () => {
    const rt = new THREE.WebGLRenderTarget(4, 4); let gone = 0; rt.texture.addEventListener('dispose', () => gone++);
    const scene = new THREE.Scene(); const m = mesh(new THREE.MeshBasicMaterial({ map: rt.texture })); scene.add(m);
    const sweep = new TextureSweep(); sweep.note(scene as never); scene.remove(m);
    expect(sweep.sweep(scene as never)).toBe(0); expect(gone).toBe(0);
  });

  it('frees the bone texture of every character that has left the scene, and leaves the ones still there', () => {
    const person = () => { const bones = [new THREE.Bone(), new THREE.Bone()]; const sk = new THREE.Skeleton(bones); const m = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); m.add(bones[0]); m.bind(sk); sk.computeBoneTexture(); return { m, sk }; };
    const gone = person(), stays = person();
    const scene = new THREE.Scene(); scene.add(gone.m, stays.m);
    const sweep = new TextureSweep(); sweep.note(scene as never);
    expect(gone.sk.boneTexture).not.toBeNull();
    scene.remove(gone.m);
    expect(sweep.sweep(scene as never)).toBe(1);
    expect(gone.sk.boneTexture).toBeNull();
    expect(stays.sk.boneTexture).not.toBeNull();
  });

  it('a district visited ten times leaves no more textures behind than one visit', () => {
    const scene = new THREE.Scene(), sweep = new TextureSweep(), alive = new Set<string>();
    const build = () => { const g = new THREE.Group(); for (let i = 0; i < 40; i++) { const t = new THREE.Texture(); alive.add(t.uuid); t.addEventListener('dispose', () => alive.delete(t.uuid)); g.add(mesh(new THREE.MeshLambertMaterial({ map: t }))); } return g; };
    let cur = build(); scene.add(cur);
    for (let i = 0; i < 10; i++) { sweep.note(scene as never); scene.remove(cur); cur = build(); scene.add(cur); sweep.sweep(scene as never); }
    expect(alive.size).toBe(40);
    expect(sweep.freed).toBe(400);
  });
});
