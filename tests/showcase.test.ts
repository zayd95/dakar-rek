import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { GameState } from '../src/core/state';
import { SAVE_KEY, clearSave, loadSave, newSave, writeSave } from '../src/core/save';
import { assetsOf, currentHome, furnitureIn, holding } from '../src/economy/assets';
import { BAYS, LOT, VILLA_ID } from '../src/housing/villa';
import { parked } from '../src/transport/owned';
import { SHOWCASE_FURNITURE, SHOWCASE_PREFIX, SHOWCASE_WALLET, ShowcaseStorage, showcaseReady, showcaseSave } from '../src/showcase/save';

/**
 * LD2.0-D lane V-E: the owner's private showcase (src/showcase/, docs/ld2/LD2_D.md decision 10).
 *  - Its save lives under its own keys: the player's real save is never read, written or removed by it.
 *  - It opens on the villa owned and furnished, the Lamane Sport in its bay, a comfortable wallet.
 *  - It exists only in a build made with VITE_OWNER_SHOWCASE=1 in the shell: a normal `vite build` has none of it, not even with the flag in an .env file.
 */
/** A browser storage that records every key it is asked for. */
class Recorder implements Storage {
  m = new Map<string, string>(); seen: string[] = [];
  get length() { return this.m.size; }
  key(i: number) { this.seen.push(`key:${i}`); return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { this.seen.push(k); return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.seen.push(k); this.m.set(k, v); }
  removeItem(k: string) { this.seen.push(k); this.m.delete(k); }
  clear() { this.m.clear(); }
}

describe('the showcase\'s own save', () => {
  it('never reads, writes or removes the player\'s real save: every key it touches is under its own prefix', () => {
    const real = new Recorder();
    const mine = new GameState(newSave()); mine.data.wallet = 12_345; mine.data.flags.push('ma-vraie-partie');
    writeSave(real, mine.data);
    const before = new Map(real.m), savedBytes = real.m.get(SAVE_KEY)!;
    real.seen = [];
    // what the start screen does (src/showcase/start.ts chooseStart), then a game played, saved, a New Game in the showcase
    const store = new ShowcaseStorage(real);
    expect(loadSave(store)).toBeNull();                                                  // its first visit: no showcase save yet (and the real one is not taken)
    writeSave(store, showcaseSave());
    const g = loadSave(store)!;
    expect(g.flags).toContain('vitrine'); expect(g.flags).not.toContain('ma-vraie-partie');
    g.wallet -= 1_000_000; writeSave(store, g);
    expect(loadSave(store)!.wallet).toBe(SHOWCASE_WALLET - 1_000_000);
    clearSave(store);
    // the real save: byte for byte as it was, and no key of the player's was even read
    expect(real.m.get(SAVE_KEY)).toBe(savedBytes);
    for (const [k, v] of before) expect(real.m.get(k), k).toBe(v);
    const touched = real.seen.filter(k => !k.startsWith('key:'));
    expect(touched.length).toBeGreaterThan(5);
    for (const k of touched) expect(k.startsWith(SHOWCASE_PREFIX), k).toBe(true);
    // and the player's game still loads as it was
    expect(loadSave(real)!.wallet).toBe(12_345);
  });

  it('is a storage of its own: length, key, clear see only its keys', () => {
    const real = new Recorder(); real.setItem('dakarrek.guest.save.v6', 'x'); real.setItem('autre', 'y');
    const s = new ShowcaseStorage(real);
    s.setItem('a', '1'); s.setItem('b', '2');
    expect(s.length).toBe(2); expect([s.key(0), s.key(1)].sort()).toEqual(['a', 'b']); expect(s.getItem('dakarrek.guest.save.v6')).toBeNull();
    s.clear();
    expect(s.length).toBe(0); expect(real.getItem('dakarrek.guest.save.v6')).toBe('x'); expect(real.getItem('autre')).toBe('y');
  });

  it('opens on the villa owned and lived in, its prestige pieces furnished, the Lamane Sport in the first bay, a comfortable wallet', () => {
    const d = showcaseSave(), s = new GameState(d);
    expect(showcaseReady(d)).toBe(true);
    expect(holding(s, VILLA_ID)?.how).toBe('owned'); expect(currentHome(s).spec).toBe(VILLA_ID);
    const pieces = furnitureIn(s, holding(s, VILLA_ID)!.uid);
    expect(pieces.map(p => p.spec).sort()).toEqual(SHOWCASE_FURNITURE.map(p => p.id).sort());
    expect(pieces.filter(p => !p.at).map(p => p.spec)).toEqual([]);                                     // every one of them set up in the house
    expect(assetsOf(s, 'vehicle').map(a => a.spec)).toEqual(['tout_terrain']);
    expect(parked(d, 'tout_terrain')).toEqual({ asset: 'tout_terrain', hub: 'almadies', x: LOT.cx + BAYS[0].x, z: LOT.cz + BAYS[0].z, yaw: Math.round(BAYS[0].yaw * 1000) / 1000 });
    expect(d.wallet).toBe(SHOWCASE_WALLET); expect(d.hub).toBe('almadies');
    // the furnishing is one plain list (catalogue id, level, place): the integration swaps its ids
    for (const p of SHOWCASE_FURNITURE) { expect(Object.keys(p).sort()).toEqual(['id', 'level', 'rot', 'x', 'z']); expect(['rdc', 'etage', 'toit']).toContain(p.level); }
  });
});

/** Every file a build wrote, as text. */
const bundleText = (dir: string) => (readdirSync(dir, { recursive: true }) as string[]).filter(f => /\.(js|html|css|json)$/.test(f)).map(f => new TextDecoder().decode(readFileSync(`${dir}/${f}`))).join('\n');
/** Texts only the showcase has (« Vitrine du propriétaire » cut before its accent, whatever escaping the minifier chooses). */
const MARKS = ['Vitrine du propri', 'owner-showcase', SHOWCASE_PREFIX];

describe('the showcase only in the owner\'s private build', () => {
  it('a normal `vite build` contains none of it, even with VITE_OWNER_SHOWCASE=1 written in an .env file; a build made with the flag in the shell has it', async () => {
    const { build } = await import('vite');
    const root = 'node_modules/.cache/showcase-check', env = `${root}/env`;
    mkdirSync(env, { recursive: true });
    writeFileSync(`${env}/.env`, 'VITE_OWNER_SHOWCASE=1\nVITE_MULTIPLAYER=true\n');           // an .env (like .env.online) can never turn it on
    const proc = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process;
    const was = proc.env.VITE_OWNER_SHOWCASE;
    try {
      delete proc.env.VITE_OWNER_SHOWCASE;
      await build({ configFile: 'vite.config.ts', envDir: env, logLevel: 'silent', build: { outDir: `${root}/public`, emptyOutDir: true } });
      const pub = bundleText(`${root}/public`);
      expect(pub.length).toBeGreaterThan(100_000);
      for (const m of MARKS) expect(pub.includes(m), m).toBe(false);
      proc.env.VITE_OWNER_SHOWCASE = '1';
      await build({ configFile: 'vite.config.ts', logLevel: 'silent', build: { outDir: `${root}/owner`, emptyOutDir: true } });
      const own = bundleText(`${root}/owner`);
      for (const m of MARKS) expect(own.includes(m), m).toBe(true);
    } finally {
      if (was === undefined) delete proc.env.VITE_OWNER_SHOWCASE; else proc.env.VITE_OWNER_SHOWCASE = was;
    }
  }, 400_000);
});
