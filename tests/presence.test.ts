import { describe, expect, it } from 'vitest';
import { parseMove, nickname, lookIndex, isHub } from '../src/multiplayer/protocol';

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
  });
  it('normalises display names and restricts appearance and hub identifiers', () => {
    expect(nickname(' <b> Mame\n Diarra </b> ')).toBe('b Mame Diarra b');
    expect(nickname('\u202e')).toBe('Dakarois'); expect(nickname('a'.repeat(100))).toHaveLength(24);
    expect(lookIndex('3')).toBe(3); expect(lookIndex(100)).toBe(0);
    expect(isHub('pikine')).toBe(true); expect(isHub('elsewhere')).toBe(false);
  });
  it('shares the mosque only at its actual Plateau doorway', () => {
    expect(parseMove({ ...move, x: 1003, z: 6, space: 'plateau:mosque:door' }, 'plateau')?.space).toBe('plateau:mosque:door');
    for (const space of ['pikine:mosque:door', 'plateau:mosque:invented', 'plateau:mosque:00']) {
      expect(parseMove({ ...move, space }, 'plateau')).toBeNull();
    }
    expect(parseMove({ ...move, space: 'plateau:mosque:door' }, 'pikine')).toBeNull();
  });
});
