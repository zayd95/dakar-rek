import { describe, expect, it } from 'vitest';
import { GameState } from '../src/core/state';
import { EXTRAS_KEY, EXTRAS_V2_KEY, SAVE_KEY, STARTER_HOME, loadSave, migrate, newSave, restoredExtras, writeSave, type KV } from '../src/core/save';
import {
  ROOM_RETURNED, buyAsset, cannotMoveIn, cannotReturnRoom, currentHome, furnitureIn, holding, moveIn, reclaimRoom, returnRoom, roomReturned, sellAsset, setPlacement, takeNotices,
} from '../src/economy/assets';
import { deliverFurniture } from '../src/economy/furniture';
import { park, parked } from '../src/transport/owned';
import { BACKUP_KEY, EXPORT_PREFIX, PROFILE_KEY, backupOf, checksum, exportCode, importSave, readCode, summarize, undoImport } from '../src/core/saveTransfer';
import { ago, initSaveHealth, reportWrite, saveHealth, saveLine } from '../src/core/saveHealth';
import { specOf } from '../src/economy/catalog';

/**
 * The release blocker of the beta (docs/SAVES.md § « Where the save lives »): buy the Cité Jàmm house, make it the principal residence, furnish it,
 * park the car, leave, come back — everything is where it was. And what the game says about its save is what the storage did.
 */
const mem = (m = new Map<string, string>()): KV & { m: Map<string, string> } => ({ m, getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } });
const rich = () => { const d = newSave(0); d.wallet = 200_000_000; d.guestId = 'g-res'; return new GameState(d); };
const reload = (store: KV) => new GameState(loadSave(store)!);
const pieces = (s: GameState, uid: string) => furnitureIn(s, uid).map(f => ({ spec: f.spec, at: f.at ?? null })).sort((a, b) => a.spec.localeCompare(b.spec));

describe('principal residence: buy, move in, furnish, park, reload', () => {
  it('the Cité Jàmm house, its furniture (spot and turn), the parked car, the wallet, the debt, the streak and the look all come back', () => {
    const s = rich(), store = mem();
    expect(buyAsset(s, 'teranga')).toBeTruthy();
    const house = buyAsset(s, 'maison_cite')!;
    expect(currentHome(s).spec).toBe(STARTER_HOME);                         // bought is not lived in: the player decides
    expect(moveIn(s, house.uid, true)).toBe(true);
    for (const id of ['canape_wax', 'table_basse', 'lit_bois']) expect(deliverFurniture(s, id)?.home).toBe(house.uid);
    const placed = furnitureIn(s, house.uid).find(f => f.at)!;
    expect(placed).toBeTruthy();
    setPlacement(s, placed.uid, { x: placed.at!.x, z: placed.at!.z, rot: 3 });
    park(s.data, { asset: 'teranga', hub: 'pikine', x: 31.5, z: 19.25, yaw: 1.571 });
    s.data.loans = { list: [{ id: 'L1', lender: 'sarr', kind: 'vehicle', label: 'Teranga', principal: 2_800_000, paid: 10_000, installment: 10_000, every: 1, openedDay: 1, checkedDay: 1, missed: 0, status: 'open' }], seq: 1 };
    s.data.streak.run = 3; s.data.streak.best = 3;
    s.data.appearance = { skin: 2, hair: 'afro', outfit: 1, color: 3 };
    s.data.hub = 'pikine'; s.data.x = 32.5; s.data.z = 17.6;
    const before = { wallet: s.wallet, home: s.data.assets.home, furniture: pieces(s, house.uid) };
    expect(writeSave(store, s.data)).toBe(true);

    const t = reload(store);
    expect(t.data.assets.home).toBe(before.home);
    expect(currentHome(t).spec).toBe('maison_cite');
    expect(holding(t, 'maison_cite')?.how).toBe('owned');
    expect(holding(t, 'teranga')?.how).toBe('owned');
    expect(pieces(t, house.uid)).toEqual(before.furniture);
    expect(furnitureIn(t, house.uid).find(f => f.uid === placed.uid)!.at!.rot).toBe(3);
    expect(parked(t.data, 'teranga')).toEqual({ asset: 'teranga', hub: 'pikine', x: 31.5, z: 19.25, yaw: 1.571 });
    expect(t.wallet).toBe(before.wallet);
    expect(t.data.loans.list[0]).toMatchObject({ id: 'L1', paid: 10_000, status: 'open' });
    expect(t.data.streak.run).toBe(3);
    expect(t.data.appearance).toEqual({ skin: 2, hair: 'afro', outfit: 1, color: 3 });
    expect([t.data.hub, t.data.x, t.data.z]).toEqual(['pikine', 32.5, 17.6]);
  });

  it('an older client that rewrites the save keeps the home and the furniture, and the look comes back from the backup', () => {
    const s = rich(), store = mem(), house = buyAsset(s, 'maison_cite')!;
    moveIn(s, house.uid, true); deliverFurniture(s, 'chaises');
    s.data.appearance = { skin: 1, hair: 'natural', outfit: 2, color: 0 };
    writeSave(store, s.data);
    const raw = JSON.parse(store.getItem(SAVE_KEY)!); delete raw.appearance; delete raw.streak;    // what the polish-pass client writes
    store.setItem(SAVE_KEY, JSON.stringify(raw));
    const t = reload(store);
    expect(currentHome(t).spec).toBe('maison_cite');
    expect(furnitureIn(t, house.uid).map(f => f.spec)).toContain('chaises');
    expect(t.data.appearance).toEqual({ skin: 1, hair: 'natural', outfit: 2, color: 0 });
    expect(restoredExtras).toContain('appearance');
  });

  it('the polish-pass client rewrites the first backup without the look too: the second one, which it never touches, brings it back', () => {
    const s = rich(), store = mem();
    s.data.appearance = { skin: 3, hair: 'kufi', outfit: 0, color: 5 };
    writeSave(store, s.data);
    const raw = JSON.parse(store.getItem(SAVE_KEY)!); delete raw.appearance;
    store.setItem(SAVE_KEY, JSON.stringify({ ...raw, wallet: 77 }));                // PR #64's save…
    const ex = JSON.parse(store.getItem(EXTRAS_KEY)!); delete ex.appearance;
    store.setItem(EXTRAS_KEY, JSON.stringify({ ...ex, savedAt: ex.savedAt + 5000 })); // …and its newer first backup, without the look
    const t = reload(store);
    expect(t.data.appearance).toEqual({ skin: 3, hair: 'kufi', outfit: 0, color: 5 });
    expect(t.wallet).toBe(77);
    expect(JSON.parse(store.getItem(EXTRAS_V2_KEY)!).guestId).toBe(s.data.guestId);
  });

  it('a save with no look chosen keeps no look: the backup never adds one', () => {
    const s = rich(), store = mem();
    writeSave(store, s.data);
    expect(JSON.parse(store.getItem(SAVE_KEY)!).appearance).toBeNull();
    expect(JSON.parse(store.getItem(EXTRAS_KEY)!).appearance).toBeNull();
    expect(reload(store).data.appearance).toBeNull();
    expect(restoredExtras).not.toContain('appearance');
  });
});

describe('« Ma chambre » once the player lives elsewhere', () => {
  it('kept as a family room by default; given back only when living elsewhere; its furniture follows to the principal residence', () => {
    const s = rich(), room = currentHome(s);
    deliverFurniture(s, 'chaises');
    expect(cannotReturnRoom(s)).toMatch(/Tu y habites/);
    const house = buyAsset(s, 'appart_jamm')!;
    moveIn(s, house.uid, false);                                            // moved without the furniture: the room still holds it
    expect(furnitureIn(s, room.uid).map(f => f.spec)).toContain('chaises');
    expect(roomReturned(s)).toBe(false);
    expect(returnRoom(s)).toBe(true);
    expect(s.data.flags).toContain(ROOM_RETURNED);
    expect(furnitureIn(s, room.uid).filter(f => f.spec === 'chaises')).toHaveLength(0);
    expect(furnitureIn(s, house.uid).map(f => f.spec)).toContain('chaises');
    expect(cannotMoveIn(s, room.uid)).toMatch(/Rendue à la famille/);
    expect(returnRoom(s)).toBe(false);
    expect(holding(s, STARTER_HOME)).toBeTruthy();                          // never sold, never removed: the family keeps it
  });

  it('given back, then the only other home sold: the family takes the player back, once, and says so', () => {
    const s = rich(), house = buyAsset(s, 'appart_jamm')!;
    moveIn(s, house.uid, true); returnRoom(s); takeNotices();
    sellAsset(s, house.uid);
    expect(currentHome(s).spec).toBe(STARTER_HOME);
    expect(roomReturned(s)).toBe(false);
    expect(takeNotices().join(' ')).toMatch(/la famille te rend ta chambre/);
  });

  it('asked back from the family; the choice survives a save, and a save from before has nothing to migrate', () => {
    const s = rich(), house = buyAsset(s, 'appart_jamm')!;
    moveIn(s, house.uid, true); returnRoom(s);
    const t = new GameState(migrate(JSON.parse(JSON.stringify(s.data)))!);
    expect(roomReturned(t)).toBe(true);
    expect(reclaimRoom(t)).toBe(true);
    expect(cannotMoveIn(t, holding(t, STARTER_HOME)!.uid)).toBeNull();
    expect(roomReturned(new GameState(migrate(JSON.parse(JSON.stringify(newSave(0))))!))).toBe(false);
  });
});

describe('copy and import a save by hand', () => {
  const game = () => { const s = rich(), h = buyAsset(s, 'maison_cite')!; moveIn(s, h.uid, true); deliverFurniture(s, 'chaises'); buyAsset(s, 'teranga'); s.data.playedMs = 192 * 60_000; return s; };

  it('a code carries the whole game and the name, and reads back the same', () => {
    const s = game(), code = exportCode(s.data, { name: 'Awa', look: 2 });
    expect(code.startsWith(EXPORT_PREFIX)).toBe(true);
    const r = readCode(code);
    if ('error' in r) throw new Error(r.error);
    expect(r.data.assets).toEqual(s.data.assets);
    expect(r.data.wallet).toBe(s.wallet);
    expect(r.profile).toEqual({ name: 'Awa', look: 2 });
  });

  it('line breaks a messenger adds are ignored; a code cut short or altered is refused, never half-read', () => {
    const code = exportCode(game().data);
    expect('data' in readCode(code.replace(/(.{60})/g, '$1\n  '))).toBe(true);
    expect(readCode(code.slice(0, code.length - 40))).toEqual({ error: expect.stringMatching(/incomplet|illisible/) });
    const [head, sum] = code.split('.');
    expect(readCode(`${head}.${sum === '00000000' ? '00000001' : '00000000'}`)).toEqual({ error: expect.stringMatching(/incomplet ou modifié/) });
    expect(readCode('bonjour')).toEqual({ error: expect.stringMatching(/DAKARREK6/) });
    expect(readCode('')).toEqual({ error: expect.stringMatching(/Colle/) });
  });

  it('a save of a newer client is refused; a bare JSON save is accepted', () => {
    const d = game().data;
    expect(readCode(JSON.stringify({ ...d, schemaVersion: 99 }))).toEqual({ error: expect.stringMatching(/plus récente/) });
    const json = readCode(JSON.stringify(d));
    expect('data' in json && json.data.assets.home).toBe(d.assets.home);
    expect(checksum('abc')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('importing keeps the game it replaces, once; undoing swaps them back; a refusing storage replaces nothing', () => {
    const store = mem(), mine = rich(), theirs = game();
    writeSave(store, mine.data);
    const r = readCode(exportCode(theirs.data, { name: 'Moussa', look: 1 }));
    if ('error' in r) throw new Error(r.error);
    expect(importSave(store, r.data, r.profile)).toBe(true);
    expect(currentHome(reload(store)).spec).toBe('maison_cite');
    expect(JSON.parse(store.getItem(PROFILE_KEY)!)).toEqual({ name: 'Moussa', look: 1 });
    expect(backupOf(store)?.guestId).toBe(mine.data.guestId);
    expect(undoImport(store)).toBe(true);
    expect(currentHome(reload(store)).spec).toBe(STARTER_HOME);
    expect(JSON.parse(store.getItem(BACKUP_KEY)!).assets.home).toBe(theirs.data.assets.home);
    const refusing: KV = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
    expect(importSave(refusing, r.data)).toBe(false);
    expect(importSave(null, r.data)).toBe(false);
  });

  it('the line shown before importing: time played, money, principal residence, vehicles, furniture', () => {
    const sum = summarize(game().data, id => { const sp = specOf(id); return sp && { name: sp.name, kind: sp.kind }; });
    expect(sum).toMatchObject({ playedMin: 192, home: 'Maison familiale', vehicles: 1, furniture: 1 });
  });
});

describe('what the game says about its save', () => {
  it('only what the storage did: blocked, failed, not yet, framed with or without a copy, fine', () => {
    const now = 1_000_000;
    const h = (o: Partial<ReturnType<typeof saveHealth>>) => ({ ok: true, at: now - 12_000, failures: 0, noStorage: false, framed: false, ...o });
    expect(saveLine(h({ noStorage: true }), null, now).tone).toBe('bad');
    expect(saveLine(h({ ok: false, failures: 1 }), null, now)).toMatchObject({ tone: 'bad', text: expect.stringMatching(/a échoué/) });
    expect(saveLine(h({ ok: null }), null, now).tone).toBe('warn');
    expect(saveLine(h({ framed: true }), null, now)).toMatchObject({ tone: 'warn', text: expect.stringMatching(/effacer/) });
    expect(saveLine(h({ framed: true }), { label: 'ton compte Claude (aperçu)', ok: true, at: now - 5000 }, now)).toMatchObject({ tone: 'ok', text: expect.stringMatching(/ton compte Claude/) });
    expect(saveLine(h({ framed: true }), { label: 'ton compte Claude (aperçu)', ok: false, at: 0 }, now).tone).toBe('warn');
    expect(saveLine(h({}), null, now)).toMatchObject({ tone: 'ok', text: expect.stringMatching(/il y a 12 s sur cet appareil/) });
    expect(ago(now - 3 * 60_000, now)).toBe('il y a 3 min');
  });

  it('every write is reported: a refused one is never shown as saved', () => {
    initSaveHealth(true, false);
    reportWrite(true, 5000);
    expect(saveHealth()).toMatchObject({ ok: true, at: 5000, failures: 0 });
    reportWrite(false, 9000);
    expect(saveHealth()).toMatchObject({ ok: false, at: 5000, failures: 1 });
    expect(saveLine(saveHealth(), null, 9000).tone).toBe('bad');
  });
});
