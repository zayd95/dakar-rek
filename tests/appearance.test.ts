import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import * as THREE from 'three';
import {
  COLORS, HAIRS, HAIRS_FOR, HAIR_LABEL, NAME_SUGGESTIONS, OUTFITS, SKINS, appearanceOf, cleanFirstName, decodeAppearance, defaultAppearance, encodeAppearance, hairFor, lightCloth, onBody,
  sameAppearance, validFirstName, type Appearance, type HairId,
} from '../src/actors/appearance';
import { MeshyLook, makeMeshyMaterial } from '../src/actors/meshyLook';
import { HEAD_FIT, buildHairStyle, scalpMode } from '../src/actors/hairStyles';
import { SHIRT_COLORS, appearanceLook, avatarLook, peerLook } from '../src/multiplayer/avatars';
import { appearanceCode, lookIndex, nickname } from '../src/multiplayer/protocol';
import { migrate, newSave, writeSave, loadSave, type KV } from '../src/core/save';
import { AVATARS, type Avatar } from '../src/core/types';

/** The character studio's rules (docs/avatar/STUDIO.md): what is offered, what a save may hold, how a look travels online, what the shader and the hair are told. */
const mem = (m = new Map<string, string>()): KV => ({ getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } });
const hueOf = (hex: number) => { const c = new THREE.Color(hex), h = { h: 0, s: 0, l: 0 }; c.getHSL(h, THREE.SRGBColorSpace); return h; };

describe('the choices', () => {
  it('six skin tones, four hairstyles per body, three outfits, six colours', () => {
    expect([SKINS.length, OUTFITS.length, COLORS.length]).toEqual([6, 3, 6]);
    for (const a of AVATARS) { expect(HAIRS_FOR[a]).toHaveLength(4); expect(HAIRS_FOR[a][0]).toBe('natural'); for (const h of HAIRS_FOR[a]) expect(HAIRS).toContain(h); }
  });
  it('the skin tones run from light to very dark, each clearly apart, none chalk-white nor black', () => {
    const lum = SKINS.map(s => 0.2126 * ((s.hex >> 16) & 255) + 0.7152 * ((s.hex >> 8) & 255) + 0.0722 * (s.hex & 255));
    for (let i = 1; i < lum.length; i++) expect(lum[i]).toBeLessThan(lum[i - 1] - 15);
    expect(lum[0]).toBeGreaterThan(160); expect(lum[0]).toBeLessThan(215); expect(lum[5]).toBeGreaterThan(40);
    for (const s of SKINS) { const h = hueOf(s.hex); expect(h.h).toBeGreaterThan(0.035); expect(h.h).toBeLessThan(0.1); }   // all warm: orange-brown, not pink, not yellow
  });
  it('the outfits are named for what they are and differ by print and trousers (no choice without a visible effect)', () => {
    expect(OUTFITS.map(o => o.label)).toEqual(['Uni', 'Rayé', 'Imprimé']);
    expect(new Set(OUTFITS.map(o => `${o.print}/${o.bottom}`)).size).toBe(3);
    expect(OUTFITS.map(o => o.label).join()).not.toMatch(/wax/i);
  });
  it('a print\'s inks follow the garment: dark inks on Ivoire only, cream on the others, judged the same by the cards and the shader', () => {
    expect(COLORS.map(c => lightCloth(c.hex))).toEqual([false, false, false, false, false, true]);
    expect(lightCloth(0xffffff)).toBe(true); expect(lightCloth(0x000000)).toBe(false);
  });
  it('each body names its hairstyles: the baked hair is « Court » on the homme and « Locks » on the femme', () => {
    for (const a of AVATARS) { const labels = HAIRS_FOR[a].map(h => HAIR_LABEL[a][h]); expect(labels.every(Boolean)).toBe(true); expect(new Set(labels).size).toBe(4); }
    expect(HAIR_LABEL.homme.natural).toBe('Court'); expect(HAIR_LABEL.femme.natural).toBe('Locks');
  });
  it('the outfit colours sit in the same hue family as the online shirt colours of the same index (older clients still see the right colour)', () => {
    for (let i = 0; i < COLORS.length; i++) {
      const a = hueOf(COLORS[i].hex), b = hueOf(SHIRT_COLORS[i]);
      if (b.s < 0.2) { expect(a.l).toBeGreaterThan(0.8); continue; }                                  // white ↔ ivory
      expect(Math.min(Math.abs(a.h - b.h), 1 - Math.abs(a.h - b.h))).toBeLessThan(0.06);
      expect(lookIndex(i)).toBe(i);
    }
  });
});

describe('changing body keeps the look', () => {
  it('a hairstyle the other body does not offer becomes its nearest one, everything else stays', () => {
    const l: Appearance = { skin: 2, hair: 'kufi', outfit: 2, color: 3 };
    expect(onBody('femme', l)).toEqual({ ...l, hair: 'wrap' });
    expect(onBody('homme', { ...l, hair: 'wrap' })).toEqual({ ...l, hair: 'kufi' });
    expect(hairFor('homme', 'puff')).toBe('afro'); expect(hairFor('femme', 'shaved')).toBe('puff'); expect(hairFor('femme', 'afro')).toBe('afro');
    for (const a of AVATARS) for (const h of HAIRS) expect(HAIRS_FOR[a]).toContain(hairFor(a, h));
  });
});

describe('a saved look', () => {
  it('garbage is no look; a partial look takes the defaults; out-of-range values fall back; a style the body lacks is mapped', () => {
    for (const raw of [undefined, null, 5, 'x', []]) expect(appearanceOf(raw as unknown, 'homme')).toBeNull();
    expect(appearanceOf({}, 'homme')).toEqual(defaultAppearance('homme'));
    expect(appearanceOf({ skin: 9, hair: 'mohawk', outfit: -1, color: 1.5 }, 'femme')).toEqual(defaultAppearance('femme'));
    expect(appearanceOf({ skin: 2, hair: 'wrap', outfit: 2, color: 5, extra: 1 }, 'femme')).toEqual({ skin: 2, hair: 'wrap', outfit: 2, color: 5 });
    expect(appearanceOf({ skin: 2, hair: 'wrap', outfit: 2, color: 5 }, 'homme')?.hair).toBe('kufi');
  });
  it('the defaults are the body as made (baked hair, plain outfit) and sameAppearance compares the four choices', () => {
    for (const a of AVATARS) { const d = defaultAppearance(a); expect(d.hair).toBe('natural'); expect(d.outfit).toBe(0); expect(sameAppearance(d, { ...d })).toBe(true); expect(sameAppearance(d, { ...d, skin: 0 })).toBe(false); }
    expect(sameAppearance(null, null)).toBe(false);
  });
});

describe('the first name', () => {
  it('is 2–16 letters, digits, spaces, apostrophes or hyphens; the online nickname rule keeps it unchanged', () => {
    expect(validFirstName('A')).toBe(false); expect(validFirstName('  ')).toBe(false); expect(validFirstName('Awa')).toBe(true); expect(validFirstName('Mame Diarra')).toBe(true);
    expect(cleanFirstName('  Moussa   <b>  ')).toBe('Moussa b'); expect(cleanFirstName('x'.repeat(40))).toHaveLength(16); expect(cleanFirstName('Aïssatou')).toBe('Aïssatou');
    for (const n of NAME_SUGGESTIONS) { expect(validFirstName(n)).toBe(true); expect(nickname(n)).toBe(n); }
    expect(new Set(NAME_SUGGESTIONS).size).toBe(NAME_SUGGESTIONS.length);
  });
});

describe('in the v6 save', () => {
  it('a new game has no look; saves made before the studio load with none (the body as it was made), nothing else lost', () => {
    expect(newSave().appearance).toBeNull();
    for (const raw of [{ schemaVersion: 6 }, { schemaVersion: 6, avatar: 'femme' }, { schemaVersion: 5, avatar: 'homme', wallet: 99 }, { schemaVersion: 3, wallet: 12345 }]) expect(migrate(raw)?.appearance).toBeNull();
    expect(migrate({ schemaVersion: 5, avatar: 'femme', wallet: 99 })?.wallet).toBe(99);
  });
  it('a chosen look survives write and reload with its body; garbage is dropped or sanitised, never trusted', () => {
    const s = mem(), d = newSave(); d.avatar = 'femme'; d.appearance = { skin: 1, hair: 'puff', outfit: 2, color: 4 }; d.wallet = 777;
    expect(writeSave(s, d)).toBe(true);
    const back = loadSave(s)!; expect(back.avatar).toBe('femme'); expect(back.appearance).toEqual({ skin: 1, hair: 'puff', outfit: 2, color: 4 }); expect(back.wallet).toBe(777);
    expect(migrate({ schemaVersion: 6, avatar: 'homme', appearance: 'no' })?.appearance).toBeNull();
    expect(migrate({ schemaVersion: 6, avatar: 'homme', appearance: { skin: 77, hair: 'x', outfit: 'y', color: null } })?.appearance).toEqual(defaultAppearance('homme'));
    expect(migrate({ schemaVersion: 6, avatar: 'homme', appearance: { skin: 1, hair: 'puff', outfit: 1, color: 1 } })?.appearance?.hair).toBe('afro');
  });
});

describe('a look on the wire', () => {
  it('encodes in five characters and decodes back, for every choice of both bodies', () => {
    for (const a of AVATARS) for (const h of HAIRS_FOR[a]) for (let s = 0; s < 6; s++) for (let o = 0; o < 3; o++) {
      const look = { skin: s, hair: h, outfit: o, color: (s + o) % 6 }, code = encodeAppearance(a, look);
      expect(code).toHaveLength(5); expect(appearanceCode(code)).toBe(code); expect(decodeAppearance(code)).toEqual({ body: a, look });
    }
  });
  it('the server and the receiving client accept nothing but that shape', () => {
    for (const bad of ['', 'x', 'm9n00', 'mXn00', 'f3w2', 'f3w211', 'F3w21', 5, null, undefined, { app: 'f3w21' }, '<f3w21>']) { expect(appearanceCode(bad)).toBeUndefined(); expect(decodeAppearance(bad)).toBeNull(); }
  });
  it('a peer with a look is drawn in it on the standard body (complexion, colour, print, hair or headwear); a peer without one, by the shirt colour as before', () => {
    expect(peerLook({ look: 3 })).toEqual(avatarLook(3));
    const f = peerLook({ look: 0, app: 'f1w21' });
    expect(f.female).toBe(true); expect(f.skin).toBe(SKINS[1].hex); expect(f.top).toBe(COLORS[1].hex); expect(f.pattern).toBe('wax'); expect(f.hat).toBe('headwrap'); expect(f.hatColor).toBe(COLORS[1].hex);
    const m = appearanceLook('homme', { skin: 5, hair: 'shaved', outfit: 1, color: 2 });
    expect(m.female).toBe(false); expect(m.hair).toBe('none'); expect(m.pattern).toBe('rayure'); expect(m.bottom).toBe(OUTFITS[1].bottom);
    expect(appearanceLook('homme', { skin: 0, hair: 'kufi', outfit: 0, color: 0 }).hat).toBe('kufi');
  });
});

describe('what the shader and the hair are told', () => {
  const shell = () => { const m = new THREE.Mesh(new THREE.BufferGeometry()); m.morphTargetDictionary = { grip: 0, shave: 1 }; m.morphTargetInfluences = [0, 0]; return m; };
  const rig = () => { const root = new THREE.Group(), head = new THREE.Object3D(); head.position.set(0, 1.68, 0); root.add(head); const m = shell(); root.add(m); return { root, head, m }; };
  const toGamma = (hex: number) => { const c = new THREE.Color(hex); c.convertLinearToSRGB(); return c; };
  it('skin (as a gamma tone), trousers, print and colour reach the uniforms; a null look switches the recolour off', () => {
    const { u } = makeMeshyMaterial(new THREE.Texture(), false), { root, head, m } = rig(), look = new MeshyLook(root, head, m, u);
    look.apply({ skin: 5, hair: 'natural', outfit: 2, color: 2 });
    const g = toGamma(SKINS[5].hex);
    expect(u.uOn.value).toBe(1); expect(u.uSkin.value.x).toBeCloseTo(g.r, 5); expect(u.uSkin.value.z).toBeCloseTo(g.b, 5); expect(u.uTop.value.getHex()).toBe(new THREE.Color(COLORS[2].hex).getHex());
    expect([u.uPrint.value, u.uBotOn.value]).toEqual([2, 1]); expect(u.uBot.value.getHex()).toBe(new THREE.Color(OUTFITS[2].bottom!).getHex());
    expect(u.uTone.value).toBeGreaterThan(0.1); expect(u.uTone.value).toBeLessThan(0.4);
    look.apply({ skin: 0, hair: 'natural', outfit: 0, color: 5 });
    expect([u.uPrint.value, u.uInnerOn.value]).toEqual([0, 0]);
    expect(u.uBotOn.value).toBe(1); expect(u.uBot.value.getHex()).toBe(new THREE.Color(0x0f1221).getHex());   // Uni: the body's own jeans, repainted in their own colour (no specks from the seams)
    look.apply(null); expect(u.uOn.value).toBe(0);
  });
  for (const a of AVATARS) it(`${a}: every offered style but the baked one takes the hair in; afro and puff draw a base and soft shells, headwear one cloth; nothing leaks between styles`, () => {
    const { u } = makeMeshyMaterial(new THREE.Texture(), a === 'femme'), { root, head, m } = rig(), look = new MeshyLook(root, head, m, u);
    const at = (hair: HairId) => { look.apply({ skin: 4, hair, outfit: 0, color: 1 }); const g = head.children.find(c => c.name.startsWith('hair_')); return { shave: m.morphTargetInfluences![1], scalp: u.uScalp.value, meshes: g ? g.children.length : 0 }; };
    for (const h of HAIRS_FOR[a]) {
      const r = at(h);
      expect(r.shave).toBe(h === 'natural' ? 0 : 1); expect(r.scalp).toBe(scalpMode(h));
      expect(r.meshes).toBe(h === 'afro' ? 4 : h === 'puff' ? 4 : h === 'wrap' || h === 'kufi' ? 1 : 0);
      expect(head.children.filter(c => c.name.startsWith('hair_')).length).toBe(r.meshes ? 1 : 0);
    }
    look.dispose(); expect(head.children).toHaveLength(0);
  });
  for (const [a, style] of [['femme', 'afro'], ['femme', 'wrap'], ['femme', 'puff'], ['homme', 'afro'], ['homme', 'kufi']] as [Avatar, HairId][]) it(`${a} ${style}: sits on that body's skull — clear of the face, its top close to the head, nothing far off`, () => {
    const F = HEAD_FIT[a], rigH = buildHairStyle(style, a, COLORS[1].hex)!, box = new THREE.Box3().setFromObject(rigH.group), c = F.skull.c, r = F.skull.r;
    const top = c[1] + r[1];
    expect(box.max.y).toBeGreaterThan(top); expect(box.max.y).toBeLessThan(top + (style === 'puff' ? 0.15 : 0.11));               // a volume, not a tower
    expect(box.min.y).toBeGreaterThan(c[1] - r[1] - 0.06);                                                                          // never down the neck
    expect(Math.max(-box.min.x, box.max.x)).toBeLessThan(r[0] + 0.085);                                                            // proportionate width
    // nothing in front of the face below the brows
    const pos = (rigH.group.children[0] as THREE.Mesh).geometry.getAttribute('position'); let inFace = 0;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < F.browY - 0.02 && pos.getZ(i) > F.faceZ + 0.03 && Math.abs(pos.getX(i)) < 0.06) inFace++;
    expect(inFace).toBe(0);
    rigH.dispose();
  });
});

describe('the Meshy files carry what the studio needs', () => {
  const json = (f: string) => { const b = fs.readFileSync(`public/assets/meshy/${f}`), n = new DataView(b.buffer, b.byteOffset).getUint32(12, true); return JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + n))) as { meshes: { extras?: { targetNames?: string[] }; primitives: { attributes: Record<string, number>; targets?: unknown[] }[] }[] }; };
  for (const f of ['body_m.glb', 'body_m_low.glb', 'body_f.glb', 'body_f_low.glb']) {
    it(`${f}: the 'grip' and 'shave' morph targets and the _HAIR attribute (scripts/avatar/add-hair.mjs)`, () => {
      const mesh = json(f).meshes[0], prim = mesh.primitives[0];
      expect(mesh.extras?.targetNames).toEqual(['grip', 'shave']); expect(prim.targets).toHaveLength(2); expect(prim.attributes._HAIR).toBeTypeOf('number');
    });
  }
  it('each body has its own skull (the femme\'s head sits lower and is smaller than the homme\'s)', () => {
    expect(HEAD_FIT.femme.skull.c[1]).toBeLessThan(HEAD_FIT.homme.skull.c[1] - 0.03);
    expect(HEAD_FIT.femme.skull.r[0]).toBeLessThan(HEAD_FIT.homme.skull.r[0]);
  });
});
