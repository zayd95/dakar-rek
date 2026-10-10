import { describe, expect, it } from 'vitest';
import { parseMove, nickname, lookIndex, isHub, recordTag, REC_RUNGS, REC_MAX } from '../src/multiplayer/protocol';
import { RUNGS, publicRecord } from '../src/career/career';

const move = { type: 'move', x: 10, y: 0.1, z: -20, yaw: 0, speed: 5.6, space: 'street', clip: 'Walk' };
describe('presence protocol', () => {
  it('accepts a finite movement and strips identity and economic fields', () => {
    const parsed = parseMove({ ...move, id: 'someone-else', wallet: 100000, name: 'Fake' }, 'pikine');
    expect(parsed).toEqual(move); expect(parsed).not.toHaveProperty('id'); expect(parsed).not.toHaveProperty('wallet');
  });
  it('rejects non-finite positions, out-of-bounds movement and unsupported messages', () => {
    for (const invalid of [null, [], { ...move, x: NaN }, { ...move, x: Infinity }, { ...move, x: 5000 }, { ...move, y: 200 }, { ...move, speed: -1 }, { ...move, speed: 100 }, { ...move, type: 'transfer' }, { ...move, clip: 'Unknown' }]) expect(parseMove(invalid, 'pikine')).toBeNull();
  });
  it('accepts public venues only in the current hub, and personal interiors are separate spaces', () => {
    expect(parseMove({ ...move, space: 'pikine:maiga:31' }, 'pikine')).not.toBeNull();
    expect(parseMove({ ...move, space: 'plateau:gargote:12' }, 'pikine')).toBeNull();
    expect(parseMove({ ...move, space: 'home' }, 'pikine')?.space).toBe('home');
    expect(parseMove({ ...move, space: 'invented' }, 'pikine')).toBeNull();
    // passengers of a car rapide share the vehicle's space (src/transport), only for the hub's own lines
    expect(parseMove({ ...move, space: 'pikine:rapide:23:1', clip: 'Sit', speed: 0 }, 'pikine')?.space).toBe('pikine:rapide:23:1');
    expect(parseMove({ ...move, space: 'plateau:rapide:5:0' }, 'pikine')).toBeNull();
    expect(parseMove({ ...move, space: 'pikine:rapide:../x:0' }, 'pikine')).toBeNull();
    expect(parseMove({ ...move, space: 'plateau:venue:mosque:11:salle' }, 'plateau')?.space).toBe('plateau:venue:mosque:11:salle');   // the prayer hall
    expect(parseMove({ ...move, space: 'plateau:venue:mosque:11:salle' }, 'pikine')).toBeNull();
    for (const bad of ['plateau:venue:mosque:11', 'plateau:venue:mosque:1:salle', 'plateau:venue:mosque:11:salle:x', 'plateau:venue:dibiterie:12:salle']) expect(parseMove({ ...move, space: bad }, 'plateau')).toBeNull();
    expect(parseMove({ ...move, space: 'plateau:venue:mosque:11:salle', clip: 'Kneel', speed: 0 }, 'plateau')?.clip).toBe('Kneel');   // kneeling on a row
  });
  it('carries the held poses (lying on a bed, sitting on a mat, kneeling, riding) and nothing else', () => {
    for (const clip of ['Lie', 'SitFloor', 'Kneel', 'Ride', 'Sit', 'Dance_A']) expect(parseMove({ ...move, clip, speed: 0 }, 'pikine')?.clip).toBe(clip);
    for (const clip of ['Fall_Back', 'Grab', 'lie', 'LIE', 'Lie ', '', 'Lie;drop', 'constructor', '__proto__', 'toString', 3, null, ['Lie'], { name: 'Lie' }]) expect(parseMove({ ...move, clip }, 'pikine')).toBeNull();
  });
  it('normalises display names and restricts appearance and hub identifiers', () => {
    expect(nickname(' <b> Mame\n Diarra </b> ')).toBe('b Mame Diarra b');
    expect(nickname('\u202e')).toBe('Dakarois'); expect(nickname('a'.repeat(100))).toHaveLength(24);
    expect(lookIndex('3')).toBe(3); expect(lookIndex(100)).toBe(0);
    expect(isHub('pikine')).toBe(true); expect(isHub('elsewhere')).toBe(false);
  });
  it('a public sporting record (rec): a rung, a ranked record and an écurie, nothing else, length-capped', () => {
    for (const ok of ['Undercards', 'Undercards · 3-1', 'Undercards · 3-1 · Écurie Baobab', 'Champion · 41-6-2 · Écurie Teranga', 'Petits combats · Écurie Baobab', 'Roi des Arènes · 9999-0'])
      expect(recordTag(ok)).toBe(ok);
    for (const bad of [
      '', 'Undercard', 'undercards', 'Undercards · 3-1 · Écurie Baobab · x', 'Undercards · Écurie Baobab · 3-1', 'Undercards · 3-1 · https://x.y',
      'Undercards · 3_1', 'Undercards · 12345-1', 'Undercards · 3-1 · Écurie <b>', 'Undercards · 3-1 · Écurie A', 'Undercards  · 3-1',
      'Champion · 1-1 · Écurie ' + 'B'.repeat(40), 3, null, undefined, ['Undercards'], { rec: 'Undercards' },
    ]) expect(recordTag(bad)).toBeUndefined();
    expect(REC_MAX).toBeLessThanOrEqual(48);
    // the career's rungs and the protocol's accepted labels stay in step
    expect([...REC_RUNGS]).toEqual(RUNGS.map(r => r.label));
    // the line the career sends is always accepted
    const b = { at: 0, day: 1, mode: 'classe' as const, opp: 'Pape', style: 'Rapide', level: 1, res: 'V' as const, how: 'projection', purse: 0, pts: 0 };
    expect(publicRecord([], 'Undercards', null)).toBeNull();
    expect(publicRecord([{ ...b, mode: 'amical' }], 'Undercards', null)).toBeNull();
    const rec = publicRecord([b, b, b, { ...b, res: 'D' }], 'Undercards', 'Baobab')!;
    expect(rec).toBe('Undercards · 3-1 · Écurie Baobab');
    for (const label of REC_RUNGS) expect(recordTag(publicRecord([b, { ...b, res: 'N' }], label, 'Teranga'))).toBe(publicRecord([b, { ...b, res: 'N' }], label, 'Teranga'));
  });
});
