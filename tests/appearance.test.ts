import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import * as THREE from 'three';
import { COLORS, HAIRS, HAIR_LABEL, NAME_SUGGESTIONS, OUTFITS, SKINS, appearanceOf, cleanFirstName, defaultAppearance, sameAppearance, validFirstName } from '../src/actors/appearance';
import { MeshyLook, makeMeshyMaterial } from '../src/actors/meshyLook';
import { SHIRT_COLORS, avatarLook } from '../src/multiplayer/avatars';
import { lookIndex, nickname } from '../src/multiplayer/protocol';
import { migrate, newSave, writeSave, loadSave, type KV } from '../src/core/save';
import { AVATARS } from '../src/core/types';

/** The character creator's rules (docs/avatar/CREATOR.md): what is offered, what a save may hold, what other players see, what the shader and the hair meshes are told. */
const mem = (m = new Map<string, string>()): KV => ({ getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } });

describe('the choices', () => {
  it('six skin tones, four hairstyles, three outfits, six colours', () => {
    expect([SKINS.length, HAIRS.length, OUTFITS.length, COLORS.length]).toEqual([6, 4, 3, 6]);
  });
  it('the skin tones run from light to dark and are all different', () => {
    const lum = SKINS.map(s => 0.2126 * ((s.hex >> 16) & 255) + 0.7152 * ((s.hex >> 8) & 255) + 0.0722 * (s.hex & 255));
    for (let i = 1; i < lum.length; i++) expect(lum[i]).toBeLessThan(lum[i - 1] - 15);
    expect(lum[0]).toBeGreaterThan(190); expect(lum[5]).toBeLessThan(60);
  });
  it('the outfits differ by print or trousers (no choice without a visible effect)', () => {
    const keys = OUTFITS.map(o => `${o.print}/${o.bottom}`); expect(new Set(keys).size).toBe(3);
  });
  it('both bodies name their four hairstyles; the baked hair is « Court » on the homme and « Locks » on the femme', () => {
    for (const a of AVATARS) { expect(Object.keys(HAIR_LABEL[a]).sort()).toEqual([...HAIRS].sort()); expect(new Set(Object.values(HAIR_LABEL[a])).size).toBe(4); }
    expect(HAIR_LABEL.homme.natural).toBe('Court'); expect(HAIR_LABEL.femme.natural).toBe('Locks');
  });
  it('the outfit colours are the online shirt colours, in order: what other players see is what was chosen', () => {
    expect(COLORS.map(c => c.hex)).toEqual(SHIRT_COLORS);
    for (let i = 0; i < COLORS.length; i++) { expect(lookIndex(i)).toBe(i); expect(avatarLook(i).top).toBe(COLORS[i].hex); }
  });
});

describe('a saved look', () => {
  it('garbage is no look; a partial look takes the defaults; out-of-range values fall back', () => {
    for (const raw of [undefined, null, 5, 'x', []]) expect(appearanceOf(raw as unknown, 'homme')).toBeNull();
    expect(appearanceOf({}, 'homme')).toEqual(defaultAppearance('homme'));
    expect(appearanceOf({ skin: 9, hair: 'mohawk', outfit: -1, color: 1.5 }, 'femme')).toEqual(defaultAppearance('femme'));
    expect(appearanceOf({ skin: 2, hair: 'wrap', outfit: 2, color: 5, extra: 1 }, 'homme')).toEqual({ skin: 2, hair: 'wrap', outfit: 2, color: 5 });
  });
  it('the defaults are the body as shipped (baked hair, plain outfit) and sameAppearance compares the four choices', () => {
    for (const a of AVATARS) { const d = defaultAppearance(a); expect(d.hair).toBe('natural'); expect(d.outfit).toBe(0); expect(sameAppearance(d, { ...d })).toBe(true); expect(sameAppearance(d, { ...d, skin: 0 })).toBe(false); }
    expect(sameAppearance(null, null)).toBe(false);
  });
});

describe('the first name', () => {
  it('is 2–16 letters, digits, spaces, apostrophes or hyphens; the online nickname rule accepts all of it unchanged', () => {
    expect(validFirstName('A')).toBe(false); expect(validFirstName('  ')).toBe(false); expect(validFirstName('Awa')).toBe(true); expect(validFirstName('Mame Diarra')).toBe(true);
    expect(cleanFirstName('  Moussa   <b>  ')).toBe('Moussa b'); expect(cleanFirstName('x'.repeat(40))).toHaveLength(16); expect(cleanFirstName('Aïssatou')).toBe('Aïssatou');
    for (const n of NAME_SUGGESTIONS) { expect(validFirstName(n)).toBe(true); expect(nickname(n)).toBe(n); }
  });
});

describe('in the save', () => {
  it('a new game has no look, the schema is unchanged, and every save made before the creator keeps its body as it was', () => {
    expect(newSave().appearance).toBeNull();
    for (const raw of [{ schemaVersion: 5 }, { schemaVersion: 5, avatar: 'homme' }, { schemaVersion: 5, avatar: 'femme', wallet: 99 }, { schemaVersion: 3, wallet: 12345 }]) expect(migrate(raw)?.appearance).toBeNull();
    expect(migrate({ schemaVersion: 5, avatar: 'femme', wallet: 99 })?.wallet).toBe(99);
  });
  it('a chosen look survives write and reload, with the body; a look without a body is dropped; garbage is dropped', () => {
    const s = mem(), d = newSave(); d.avatar = 'femme'; d.appearance = { skin: 1, hair: 'afro', outfit: 2, color: 4 }; d.wallet = 777;
    expect(writeSave(s, d)).toBe(true);
    const back = loadSave(s)!; expect(back.avatar).toBe('femme'); expect(back.appearance).toEqual({ skin: 1, hair: 'afro', outfit: 2, color: 4 }); expect(back.wallet).toBe(777);
    expect(migrate({ schemaVersion: 5, appearance: { skin: 1 } })?.appearance).toBeNull();
    expect(migrate({ schemaVersion: 5, avatar: 'homme', appearance: 'no' })?.appearance).toBeNull();
    expect(migrate({ schemaVersion: 5, avatar: 'homme', appearance: { skin: 77, hair: 'x', outfit: 'y', color: null } })?.appearance).toEqual(defaultAppearance('homme'));
  });
});

describe('what the shader and the hair meshes are told', () => {
  const shell = () => { const m = new THREE.Mesh(new THREE.BufferGeometry()); m.morphTargetDictionary = { grip: 0, shave: 1 }; m.morphTargetInfluences = [0, 0]; return m; };
  const rig = () => { const root = new THREE.Group(), head = new THREE.Object3D(); head.position.set(0, 1.68, 0); root.add(head); const m = shell(); root.add(m); return { root, head, m }; };
  it('skin, trousers, print and colour reach the uniforms; a null look switches the recolour off', () => {
    const { u } = makeMeshyMaterial(new THREE.Texture(), false), { root, head, m } = rig(), look = new MeshyLook(root, head, m, u);
    look.apply({ skin: 5, hair: 'natural', outfit: 2, color: 2 });
    expect(u.uOn.value).toBe(1); expect(u.uSkin.value.getHex()).toBe(new THREE.Color(SKINS[5].hex).getHex()); expect(u.uTop.value.getHex()).toBe(new THREE.Color(COLORS[2].hex).getHex());
    expect([u.uPrint.value, u.uBotOn.value]).toEqual([2, 1]); expect(u.uBot.value.getHex()).toBe(new THREE.Color(OUTFITS[2].bottom!).getHex());
    look.apply({ skin: 0, hair: 'natural', outfit: 0, color: 5 });
    expect([u.uPrint.value, u.uBotOn.value, u.uInnerOn.value]).toEqual([0, 0, 0]);
    expect(u.uTop2.value.getHex()).toBe(new THREE.Color(0x1c2540).getHex());          // a white garment gets a dark second colour, a dark one a cream
    look.apply(null); expect(u.uOn.value).toBe(0);
  });
  it('every hairstyle but the baked one shaves the head; the afro and the foulard add one mesh to the head bone, and nothing leaks when the style changes', () => {
    const { u } = makeMeshyMaterial(new THREE.Texture(), true), { root, head, m } = rig(), look = new MeshyLook(root, head, m, u);
    const at = (hair: 'natural' | 'shaved' | 'afro' | 'wrap') => { look.apply({ skin: 4, hair, outfit: 0, color: 1 }); return { shave: m.morphTargetInfluences![1], scalp: u.uScalp.value, hairMeshes: head.children.filter(c => c.name.startsWith('hair_')).map(c => c.name) }; };
    expect(at('natural')).toEqual({ shave: 0, scalp: 0, hairMeshes: [] });
    expect(at('shaved')).toEqual({ shave: 1, scalp: 1, hairMeshes: [] });
    expect(at('afro')).toEqual({ shave: 1, scalp: 1, hairMeshes: ['hair_afro'] });
    expect(at('wrap')).toEqual({ shave: 1, scalp: 1, hairMeshes: ['hair_wrap'] });
    expect(at('afro').hairMeshes).toEqual(['hair_afro']); expect(at('natural').hairMeshes).toEqual([]);
    look.apply({ skin: 4, hair: 'afro', outfit: 0, color: 1 }); look.dispose(); expect(head.children).toHaveLength(0);
  });
  it('the hair mesh sits on the skull: in the head bone\'s frame, near the shell\'s head, not at the origin', () => {
    const { u } = makeMeshyMaterial(new THREE.Texture(), false), { root, head, m } = rig(), look = new MeshyLook(root, head, m, u);
    look.apply({ skin: 4, hair: 'wrap', outfit: 0, color: 1 });
    root.updateMatrixWorld(true);
    const mesh = head.children.find(c => c.name === 'hair_wrap') as THREE.Mesh, box = new THREE.Box3().setFromObject(mesh);
    expect(box.min.y).toBeGreaterThan(1.7); expect(box.max.y).toBeLessThan(2.05); expect(Math.abs((box.min.x + box.max.x) / 2)).toBeLessThan(0.02);
  });
});

describe('the Meshy files carry what the creator needs', () => {
  const json = (f: string) => { const b = fs.readFileSync(`public/assets/meshy/${f}`), n = new DataView(b.buffer, b.byteOffset).getUint32(12, true); return JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + n))) as { meshes: { extras?: { targetNames?: string[] }; primitives: { attributes: Record<string, number>; targets?: unknown[] }[] }[] }; };
  for (const f of ['body_m.glb', 'body_m_low.glb', 'body_f.glb', 'body_f_low.glb']) {
    it(`${f}: the 'grip' and 'shave' morph targets and the _HAIR attribute (scripts/avatar/add-hair.mjs)`, () => {
      const mesh = json(f).meshes[0], prim = mesh.primitives[0];
      expect(mesh.extras?.targetNames).toEqual(['grip', 'shave']); expect(prim.targets).toHaveLength(2); expect(prim.attributes._HAIR).toBeTypeOf('number');
    });
  }
});
