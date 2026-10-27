import { describe, expect, it } from 'vitest';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import { HOMES, FURNITURE_SPECS, furnitureSpec, homeSpec } from '../src/economy/catalog';
import { buyAsset, currentHome, furnitureIn, holding, moveIn, upgradeAsset } from '../src/economy/assets';
import { deliverFurniture } from '../src/economy/furniture';
import { ROOM_X, ROOM_STEP, homeOrigin } from '../src/economy/placement';
import { HALF } from '../src/world/builder';
import {
  GUEST_NEVER, SNAPSHOT_MAX_CHARS, SNAPSHOT_MAX_PIECES, buildSnapshot, guestMaySit, guestMayUse, guestOffers, inviteOver, openInvites, snapshotChars, validSnapshot,
} from '../src/online/visitRules';
import { CATALOGUE_CHECK, doorName, homeRefOf, homeSnapshotOf } from '../src/online/visit';
import { drawnHere, isSharedHome } from '../src/multiplayer/avatars';
import type { HomeSnapshot, InviteItem, Item } from '../src/online/protocol';

const fresh = (wallet = 1e9) => { const s = new GameState(newSave(0)); s.data.wallet = wallet; return s; };
/** A host who lives in the Résidence Jàmm's F2 with a few pieces, one moved by hand. */
function host() {
  const s = fresh();
  const a = buyAsset(s, 'appart_jamm')!; expect(moveIn(s, a.uid, true)).toBe(true);
  for (const id of ['canape_wax', 'table_basse', 'tele_plate', 'lit_bois', 'chaise_bois', 'plante', 'radio', 'cuisiniere', 'bureau_simple']) expect(deliverFurniture(s, id)).not.toBeNull();
  upgradeAsset(s, a.uid, 'ventilo');
  return { s, home: a };
}
const TAG = 'a1b2c3d4e5f60718';

describe('where homes are drawn', () => {
  it('one origin per catalogue home, from the catalogue order alone: every client draws a home at the same place', () => {
    const seen = new Set<string>();
    HOMES.forEach((h, i) => {
      const o = homeOrigin(h.id)!;
      expect(o).toEqual({ x: ROOM_X + i * ROOM_STEP, z: 0 });
      seen.add(`${o.x},${o.z}`);
    });
    expect(seen.size).toBe(HOMES.length);
    expect(homeOrigin('pas_un_logement')).toBeNull();
  });
  it('the homes never overlap one another and stand off the street grid', () => {
    const biggest = Math.max(...HOMES.map(h => Math.max(h.home.w, h.home.d)));
    expect(ROOM_STEP).toBeGreaterThan(biggest + 4);
    expect(ROOM_X - biggest).toBeGreaterThan(HALF + 100);
  });
});

describe('the host’s snapshot', () => {
  it('is the home the player lives in, with every placed piece exactly where the save has it', () => {
    const { s, home } = host();
    const snap = homeSnapshotOf(s, 123_456)!;
    expect(snap.home).toEqual({ spec: 'appart_jamm', hub: 'pikine', door: 'pikine:home:jamm', name: 'Appartement F2 · Résidence Jàmm' });
    expect(snap.upgrades).toEqual(['ventilo']);
    const placed = furnitureIn(s, home.uid).filter(f => f.at && !furnitureSpec(f.spec)!.fixed);
    expect(snap.furniture.length).toBe(placed.length);
    expect(placed.length).toBeGreaterThanOrEqual(9);
    for (const f of placed) expect(snap.furniture).toContainEqual({ spec: f.spec, at: { x: f.at!.x, z: f.at!.z, rot: f.at!.rot } });
    expect(snap.at).toBe(123_456);
  });
  it('is well under the size limit, and passes the server’s check and the client’s catalogue check', () => {
    const { s } = host();
    const snap = homeSnapshotOf(s, Date.now())!;
    expect(snapshotChars(snap)).toBeLessThan(2_000);
    expect(validSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
    expect(validSnapshot(JSON.parse(JSON.stringify(snap)), CATALOGUE_CHECK)).toEqual(snap);
  });
  it('reads the save and never writes it', () => {
    const { s } = host();
    const before = JSON.stringify(s.data);
    homeSnapshotOf(s, 1); homeRefOf(currentHome(s).spec);
    expect(JSON.stringify(s.data)).toBe(before);
  });
  it('the family room: its own door in every world, the good mattress shown in the shell, a name for others', () => {
    const s = fresh();
    deliverFurniture(s, 'matelas'); deliverFurniture(s, 'radio'); deliverFurniture(s, 'tele');
    const snap = homeSnapshotOf(s, 0)!;
    expect(snap.home.door).toBe('pikine:home:11');
    expect(snap.home.name).toBe('Chambre familiale · Pikine');
    expect(snap.upgrades).toContain('matelas');
    expect(snap.furniture.map(f => f.spec).sort()).toEqual(['radio', 'tele']);         // the mattress is fixed: in the shell, not a piece
    expect(doorName('chambre_pikine')).toBe('Ma chambre');
    expect(doorName('appart_jamm')).toBe(homeSpec('appart_jamm')!.name);
  });
  it('a home crammed full stays under 12 000 characters (capped at SNAPSHOT_MAX_PIECES pieces)', () => {
    const ref = homeRefOf('residence_ngor')!, long = FURNITURE_SPECS.reduce((a, f) => (f.id.length > a.length ? f.id : a), '');
    const pieces = Array.from({ length: 400 }, (_, i) => ({ spec: long, at: { x: -8.75 + (i % 30) * 0.25, z: -5.75 + Math.floor(i / 30) * 0.25, rot: i % 4 } }));
    const snap = buildSnapshot(ref, ['domotique', 'clim', 'peinture'], pieces, Date.now());
    expect(snap.furniture.length).toBe(SNAPSHOT_MAX_PIECES);
    expect(snapshotChars(snap)).toBeLessThan(SNAPSHOT_MAX_CHARS);
    expect(validSnapshot(snap, CATALOGUE_CHECK)).not.toBeNull();
  });
});

describe('validSnapshot (the server may reuse it)', () => {
  const good = (): HomeSnapshot => ({ home: { spec: 'appart_jamm', hub: 'pikine', door: 'pikine:home:jamm', name: 'Appartement F2 · Résidence Jàmm' }, upgrades: ['ventilo'], furniture: [{ spec: 'canape_wax', at: { x: -1.25, z: 2.5, rot: 2 } }], at: 1_760_000_000_000 });
  const bad: [string, (s: any) => void][] = [
    ['an unknown field', s => { s.extra = 1; }],
    ['an unknown field of the home', s => { s.home.owner = 'x'; }],
    ['a missing field', s => { delete s.upgrades; }],
    ['a district of no game', s => { s.home.hub = 'thies'; }],
    ['a door of another district', s => { s.home.door = 'almadies:home:jamm'; }],
    ['a door that is not a home’s', s => { s.home.door = 'pikine:gargote:32'; }],
    ['a name too long', s => { s.home.name = 'x'.repeat(81); }],
    ['a quarter turn of 4', s => { s.furniture[0].at.rot = 4; }],
    ['half a quarter turn', s => { s.furniture[0].at.rot = 1.5; }],
    ['a piece out of the home', s => { s.furniture[0].at.x = 31; }],
    ['a NaN', s => { s.furniture[0].at.z = NaN; }],
    ['a spot as text', s => { s.furniture[0].at = '1,2,0'; }],
    ['an id with capitals', s => { s.furniture[0].spec = 'Canape'; }],
    ['too many pieces', s => { s.furniture = Array.from({ length: SNAPSHOT_MAX_PIECES + 1 }, () => s.furniture[0]); }],
    ['a negative time', s => { s.at = -1; }],
    ['upgrades not a list', s => { s.upgrades = 'ventilo'; }],
  ];
  it('accepts a good one and returns a copy', () => { const s = good(), v = validSnapshot(s)!; expect(v).toEqual(s); expect(v).not.toBe(s); expect(v.furniture[0]).not.toBe(s.furniture[0]); });
  for (const [why, spoil] of bad) it(`refuses ${why}`, () => { const s = good(); spoil(s); expect(validSnapshot(s)).toBeNull(); });
  it('refuses more than 12 000 characters (long floats)', () => {
    const s = good();
    s.furniture = Array.from({ length: SNAPSHOT_MAX_PIECES }, (_, i) => ({ spec: 'cuisine_equipee', at: { x: -9.123456789012345 + i * 1e-9, z: 5.987654321098765, rot: 3 } }));
    expect(JSON.stringify(s).length).toBeGreaterThan(SNAPSHOT_MAX_CHARS);
    expect(validSnapshot(s)).toBeNull();
  });
  it('the catalogue check: an unknown piece, a home with another home’s door', () => {
    const s = good(); s.furniture[0].spec = 'trone_en_or'; expect(validSnapshot(s)).not.toBeNull(); expect(validSnapshot(s, CATALOGUE_CHECK)).toBeNull();
    const t = good(); t.home.spec = 'maison_cite'; expect(validSnapshot(t, CATALOGUE_CHECK)).toBeNull();
    const u = good(); u.home.spec = 'chambre_pikine'; u.home.door = 'pikine:home:11'; expect(validSnapshot(u, CATALOGUE_CHECK)).not.toBeNull();
  });
});

describe('the guest’s side is read-only', () => {
  const pieces = ['canape_wax', 'lit_bois', 'tele_plate', 'chaine_hifi', 'radio', 'cuisiniere', 'bureau_simple', 'coiffeuse', 'chaises', 'tapis_tisse'].map(id => furnitureSpec(id)!);
  it('with « use »: chairs and sofas to sit on (never the bed), the TV and the radio; nothing else', () => {
    const o = guestOffers(pieces, { use: true });
    expect(o.uses.sort()).toEqual(['musique', 'radio', 'tele']);
    const seats = pieces.flatMap(p => (p.seats ?? []).filter(st => st.kind !== 'bed')).length;
    expect(o.seats).toBe(seats);                                                    // the sofa's three, the desk's chair, the two plastic chairs
    expect(o.seats).toBe(6);
  });
  it('without « use »: look around only', () => { expect(guestOffers(pieces, { use: false })).toEqual({ seats: 0, uses: [] }); });
  it('no bed, no lying down, no kitchen, desk or wardrobe, whatever the permissions', () => {
    expect(guestMaySit('bed', 'Lie', true)).toBe(false);
    expect(guestMaySit('chair', undefined, true)).toBe(true);
    for (const t of ['kitchen', 'desk', 'wardrobe', 'mirror', 'bed', 'rug', 'plant']) expect(guestMayUse(t, true)).toBe(false);
    for (const t of ['tv', 'radio']) { expect(guestMayUse(t, true)).toBe(true); expect(guestMayUse(t, false)).toBe(false); }
    for (const a of ['amenager', 'commander', 'dormir', 'cuisiner', 'douche', 'laver', 'bureau']) expect(GUEST_NEVER).toContain(a);
  });
});

describe('invitations', () => {
  const HOST = '0123456789abcdef', ME = 'fedcba9876543210';
  const inv = (o: Partial<InviteItem>): InviteItem => ({ id: 'i' + Math.random(), from: HOST, at: 1000, k: 'invite', home: homeRefOf('appart_jamm')!, perms: { use: true }, state: 'accepted', until: 10_000, ...o });
  it('an accepted, unexpired invitation from the host lets the guest in; nothing else does', () => {
    const items: Item[] = [inv({ id: 'ok' }), inv({ id: 'open', state: 'open' }), inv({ id: 'old', until: 5_000 }), inv({ id: 'revoked', state: 'revoked' }), inv({ id: 'mine', from: ME }),
      { id: 't', from: HOST, at: 1, k: 'text', text: 'Viens !' }];
    expect(openInvites(items, HOST, 6_000).map(i => i.id)).toEqual(['ok']);
    expect(openInvites(items, HOST, 10_000)).toEqual([]);
  });
  it('a visit ends when the invitation is revoked, declined or past its time', () => {
    expect(inviteOver(inv({}), 9_999)).toBe(false);
    expect(inviteOver(inv({}), 10_000)).toBe(true);
    expect(inviteOver(inv({ state: 'revoked' }), 0)).toBe(true);
    expect(inviteOver(inv({ state: 'expired' }), 0)).toBe(true);
  });
});

describe('presence in a home (avatars)', () => {
  it('a host and their guests see each other in `home:<host>`; the legacy own room and scenes stay private', () => {
    expect(drawnHere(`home:${TAG}`, `home:${TAG}`)).toBe(true);
    expect(drawnHere('home', 'home')).toBe(false);
    expect(drawnHere(`home:${TAG}`, 'home:0000000000000000')).toBe(false);
    expect(drawnHere(`home:${TAG}`, 'street')).toBe(false);
    expect(drawnHere('street', `home:${TAG}`)).toBe(false);
    expect(drawnHere('scene', 'scene')).toBe(false);
    expect(drawnHere('street', 'street')).toBe(true);
    expect(isSharedHome(`home:${TAG}`)).toBe(true);
    expect(isSharedHome('home')).toBe(false);
  });
});

describe('the guest owns the same home', () => {
  it('a snapshot received never touches the guest’s save (their own pieces of the same F2 stay as they are)', () => {
    const { s: h } = host(), snap = homeSnapshotOf(h, 5)!;
    const g = fresh(); const a = buyAsset(g, 'appart_jamm')!; moveIn(g, a.uid, true);
    deliverFurniture(g, 'banquette'); deliverFurniture(g, 'plante');
    const before = JSON.stringify(g.data);
    const seen = validSnapshot(JSON.parse(JSON.stringify(snap)), CATALOGUE_CHECK)!;
    expect(seen.home.spec).toBe(holding(g, 'appart_jamm')!.spec);                 // the same home: the guest's view of it is the one replaced while visiting
    expect(JSON.stringify(g.data)).toBe(before);
  });
});
