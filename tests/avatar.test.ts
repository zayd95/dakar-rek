import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_SAVE_KEY, SAVE_KEY, SCHEMA_VERSION, loadSave, migrate, newSave, writeSave, type KV } from '../src/core/save';
import { AVATARS } from '../src/core/types';
import { bodyOf, bodyUrl, loadPlayerBody, previewUrl } from '../src/actors/playerBody';
import { readTestParams } from '../src/core/testParams';

/**
 * The player's chosen body (docs/meshy/PROOF_REPORT.md): kept in the v6 save (`avatar`, never null: a save without one gets the default homme),
 * no new key; a body that cannot be loaded falls back to v4.
 */
const mem = (m = new Map<string, string>()): KV & { m: Map<string, string> } => ({ m, getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); }, });
const V3 = { schemaVersion: 3, guestId: 'g-v3', createdAt: 1000, savedAt: 2000, playedMs: 5000, hub: 'pikine', x: 12, z: -8, yaw: 1, wallet: 12345, needs: { faim: 42, energie: 55, moral: 61, social: 30, hygiene: 77 }, counters: {}, rel: {}, flags: [], beats: {} };

describe('the avatar in the v6 save', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a new game starts on the default homme, schema 6 under its own key', () => {
    expect(newSave().avatar).toBe('homme');
    expect(SCHEMA_VERSION).toBe(6); expect(SAVE_KEY).toBe('dakarrek.guest.save.v6');
  });

  it('every save made before the choice existed gets the default body (no prompt, nothing lost)', () => {
    for (const raw of [V3, { ...V3, schemaVersion: 5, wallet: 99 }, { schemaVersion: 5 }]) expect(migrate(raw)?.avatar).toBe('homme');
    const s = mem(); s.setItem(LEGACY_SAVE_KEY, JSON.stringify(V3));
    const d = loadSave(s)!; expect(d.avatar).toBe('homme'); expect(d.wallet).toBe(12345);
  });

  it('a chosen body survives write, reload and a later write', () => {
    for (const a of AVATARS) {
      const s = mem(), d = newSave(); d.avatar = a; d.wallet = 777;
      expect(writeSave(s, d)).toBe(true);
      const back = loadSave(s)!; expect(back.avatar).toBe(a); expect(back.wallet).toBe(777); expect(back.schemaVersion).toBe(SCHEMA_VERSION);
      writeSave(s, { ...back, wallet: 800 }); expect(loadSave(s)!.avatar).toBe(a);
      expect([...s.m.keys()]).toContain(SAVE_KEY); expect(s.m.has(LEGACY_SAVE_KEY)).toBe(false);   // nothing written under another key
    }
  });

  it('an unknown or malformed value is dropped to the default body, never trusted', () => {
    for (const bad of ['robot', 'Homme', '', 5, true, {}, [], null, undefined]) expect(migrate({ schemaVersion: 6, avatar: bad })?.avatar, String(bad)).toBe('homme');
  });
});

describe('identity to body', () => {
  it('maps the two identities to Meshy bodies and everything else to v4', () => {
    expect(bodyOf('homme')).toBe('meshy_m'); expect(bodyOf('femme')).toBe('meshy_f');
    expect(bodyOf(null)).toBe('v4'); expect(bodyOf(undefined)).toBe('v4');
  });

  it('serves the light files on the low preset only', () => {
    expect(bodyUrl('homme', false, './')).toBe('./assets/meshy/body_m.glb'); expect(bodyUrl('homme', true, './')).toBe('./assets/meshy/body_m_low.glb');
    expect(bodyUrl('femme', false, './')).toBe('./assets/meshy/body_f.glb'); expect(bodyUrl('femme', true, './')).toBe('./assets/meshy/body_f_low.glb');
    expect(previewUrl('homme', './')).toBe('./assets/meshy/preview_m.jpg'); expect(previewUrl('femme', './')).toBe('./assets/meshy/preview_f.jpg');
  });

  it('falls back to v4 without a request when there is no identity, and when the file is missing or the network fails', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false } as Response)); vi.stubGlobal('fetch', fetchMock);
    expect(await loadPlayerBody(null, false)).toBe('v4'); expect(fetchMock).not.toHaveBeenCalled();
    expect(await loadPlayerBody('homme', false, './')).toBe('v4'); expect(fetchMock).toHaveBeenCalledWith('./assets/meshy/body_m.glb');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await loadPlayerBody('femme', true, './')).toBe('v4');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as unknown as Response)));   // a corrupt file
    expect(await loadPlayerBody('femme', false, './')).toBe('v4');
  });
});

describe('the avatar test link', () => {
  it('only works on local and preview hosts, never on production', () => {
    expect(readTestParams('localhost', '?avatar=femme').avatar).toBe('femme');
    expect(readTestParams('127.0.0.1', '?avatar=homme').avatar).toBe('homme');
    expect(readTestParams('localhost', '?avatar=v4').avatar).toBe('v4');
    expect(readTestParams('localhost', '?avatar=choisir').avatar).toBe('choose');
    expect(readTestParams('localhost', '?avatar=robot').avatar).toBeNull();
    expect(readTestParams('dakar-rek.habibjallow95.workers.dev', '?avatar=femme').avatar).toBeNull();
  });

  it('the starting identity forces no career: a new save has an empty record whatever the identity', () => {
    const s = newSave();
    expect(s.avatar).toBe('homme');
    expect(s.career.bouts).toEqual([]);
    for (const a of AVATARS) {
      const r = migrate({ ...s, avatar: a })!;
      expect(r.avatar).toBe(a); expect(r.career.bouts).toEqual([]); expect(r.career.fav).toBeUndefined();
    }
  });
});
