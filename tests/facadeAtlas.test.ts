import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { stubCanvas } from './hubstub';
import { Batch, facadeTextures } from '../src/world/batch';
import { FACADE_ATLAS_SIZE, FACADE_COLS, FACADE_ROWS, ROW, facadeAtlas, facadeRowRect } from '../src/world/facadeAtlas';
import type { HubId } from '../src/core/types';

/**
 * The facade atlas (src/world/facadeAtlas.ts): every district's walls from one texture and one material. A wall says which rows of the atlas its
 * storeys read through the `fstyle` attribute (src/world/batch.ts); a wall that says nothing is the classic window, on the same box as ever.
 */
stubCanvas();
const mesh = (b: Batch) => b.build(new THREE.MeshBasicMaterial())!;
const style = (m: THREE.Mesh, i: number) => { const a = m.geometry.attributes.fstyle as THREE.BufferAttribute; return [a.getX(i), a.getY(i), a.getZ(i), a.getW(i)]; };

describe('the facade atlas', () => {
  it('lays its rows out without overlap, the two ground-floor rows at twice the others\' size', () => {
    const rects = Object.values(ROW).map(r => ({ r, ...facadeRowRect(r) }));
    for (const a of rects) {
      expect(a.s).toBe(a.r === ROW.SHOPS || a.r === ROW.HOME_GROUND ? 0.25 : 0.125);
      expect(a.u >= 0 && a.u + a.s * FACADE_COLS <= 1 && a.v >= 0 && a.v + a.s <= 1, `row ${a.r} inside the image`).toBe(true);
      for (const b of rects) if (a !== b) expect(a.u + a.s * FACADE_COLS <= b.u || b.u + b.s * FACADE_COLS <= a.u || a.v + a.s <= b.v || b.v + b.s <= a.v, `rows ${a.r} / ${b.r}`).toBe(true);
    }
  });

  it('is ONE pair of textures for the whole game: every facade material shares them, nobody\'s dispose frees them', () => {
    const a = facadeTextures(), b = facadeTextures();
    expect(b.map).toBe(a.map); expect(b.glow).toBe(a.glow);
    expect(a.map.userData.shared).toBe(true); expect(a.glow.userData.shared).toBe(true);
    expect(a.map.image).toBe(facadeAtlas().map);
  });

  it('is eight rows of four bays, painted once (in node too: the canvas is a stub)', () => {
    expect([FACADE_COLS, FACADE_ROWS]).toEqual([4, 8]);
    expect(new Set(Object.values(ROW)).size).toBe(FACADE_ROWS);
    expect(Math.max(...Object.values(ROW))).toBe(FACADE_ROWS - 1);
    const a = facadeAtlas();
    expect(facadeAtlas()).toBe(a);
    expect([a.map.width, a.map.height, a.glow.width, a.glow.height]).toEqual([FACADE_ATLAS_SIZE, FACADE_ATLAS_SIZE, FACADE_ATLAS_SIZE / 2, FACADE_ATLAS_SIZE / 2]);
    expect(FACADE_ATLAS_SIZE).toBe(1024);
  });

  it('a wall without a style is the box it always was: 36 vertices, bays by storeys in its uv, no style', () => {
    const b = new Batch(); b.facade(17, 9.6, 6.8, 0, 0, 0, 0xffffff);
    const m = mesh(b), uv = m.geometry.attributes.uv as THREE.BufferAttribute;
    expect(m.geometry.attributes.position.count).toBe(36);
    expect(m.geometry.attributes.fstyle).toBeUndefined();
    let u = 0, v = 0; for (let i = 0; i < uv.count; i++) { u = Math.max(u, uv.getX(i)); v = Math.max(v, uv.getY(i)); }
    expect(u).toBeCloseTo(17 / 3.4, 5); expect(v).toBeCloseTo(3, 5);
  });

  it('a styled wall names its rows face by face: the street faces their shops, the others a house\'s ground floor, the roof nothing', () => {
    const b = new Batch(); b.styled = true;
    b.facade(17, 9.6, 6.8, 0, 0, 0, 0xffffff, 0, { upper: ROW.OFFICE, ground: ROW.SHOPS, back: ROW.HOME_GROUND, top: ROW.UNFINISHED, streets: [[0, 1]], seed: 6 });
    b.box(1, 1, 1, 5, 0, 5, 0xffffff);                                    // any other piece of the batch: zeros (the classic window)
    const m = mesh(b), n = m.geometry.attributes.normal as THREE.BufferAttribute, seen = new Map<string, number[]>();
    expect(m.geometry.attributes.position.count).toBe(36 + 30);
    for (let i = 0; i < 36; i++) seen.set([n.getX(i), n.getY(i), n.getZ(i)].map(Math.round).join(), style(m, i));
    const rows = (ground: number) => ROW.OFFICE + 16 * (ground + 1) + 256 * (ROW.UNFINISHED + 1);
    expect(seen.get('0,0,1')).toEqual([rows(ROW.SHOPS), 2, 5, 3]);         // the street: 17 m is five bays, three storeys, the seed kept to 0…3
    expect(seen.get('0,0,-1')).toEqual([rows(ROW.HOME_GROUND), 2, 5, 3]);
    expect(seen.get('1,0,0')![0]).toBe(rows(ROW.HOME_GROUND)); expect(seen.get('1,0,0')![2]).toBeCloseTo(2, 5);
    expect(seen.get('0,1,0')).toEqual([0, 0, 0, 0]);
    for (let i = 36; i < 66; i++) expect(style(m, i)).toEqual([0, 0, 0, 0]);
  });

  it('stretches the rows to the storeys it is given, and leaves what is over the last whole storey plain', () => {
    const b = new Batch(); b.styled = true;
    b.facade(8, 5.7, 8, 0, 0, 0, 0xffffff, 0, { upper: ROW.SELF_BUILT, floors: 2 });      // Pikine: two storeys of 2.85 m
    b.facade(14, 4.2, 8, 0, 0, 0, 0xffffff, 0, { upper: ROW.CLASSIC, ground: ROW.SHOPS }); // a kiosk: one storey and a parapet's worth of wall
    b.facade(17, 9.6, 17, 0, 0, 0, 0xffffff, 0, { upper: ROW.TILED, stacked: true, seed: 7 });   // a block of flats: its bays in columns (the seed + 4)
    const m = mesh(b), uv = m.geometry.attributes.uv as THREE.BufferAttribute;
    let v0 = 0, v1 = 0; for (let i = 0; i < 36; i++) v0 = Math.max(v0, uv.getY(i)); for (let i = 36; i < 72; i++) v1 = Math.max(v1, uv.getY(i));
    expect(v0).toBeCloseTo(2, 5); expect(style(m, 0)[3]).toBe(2);
    expect(v1).toBeCloseTo(4.2 / 3.2, 5); expect(style(m, 36)[3]).toBe(1);
    expect(style(m, 0)[1]).toBe(0); expect(style(m, 72)[1]).toBe(3 + 4);
  });
});

describe('the districts\' walls', () => {
  it('say what they are in every district, in one mesh; batches that share a material are one draw call', async () => {
    const { buildHub } = await import('../src/world/builder');
    for (const id of ['pikine', 'plateau', 'mermoz', 'corniche'] as HubId[]) {
      const hub = buildHub(id), meshes = hub.group.children.filter((o): o is THREE.Mesh => (o as THREE.Mesh).isMesh);
      const walls = meshes.filter(m => m.material === hub.facadeMat);
      expect(walls, id).toHaveLength(1);
      const a = walls[0].geometry.attributes.fstyle as THREE.BufferAttribute, rows = new Set<number>(), grounds = new Set<number>();
      for (let i = 0; i < a.count; i += 6) { const r = a.getX(i); if (a.getZ(i) > 0) { rows.add(r % 16); if ((r >> 4) % 16) grounds.add(((r >> 4) % 16) - 1); } }
      expect(rows.size, `${id}: kinds of storey`).toBeGreaterThanOrEqual(2);
      expect(grounds.has(ROW.HOME_GROUND) || grounds.has(ROW.SHOPS), `${id}: a ground floor`).toBe(true);
      const merged = meshes.filter(m => !hub.signs.includes(m)), mats = new Set(merged.map(m => `${(m.material as THREE.Material).uuid}/${m.castShadow}`));
      expect(mats.size, `${id}: one mesh per material`).toBe(merged.length);
      hub.dispose();
    }
  }, 60_000);
});
