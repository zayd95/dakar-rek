import { describe, it, expect } from 'vitest';
import { crossing, LINKS } from '../src/transport/hubLink';
import { GRID, roadCentre } from '../src/transport/lines';

const X = roadCentre(1), S = roadCentre(GRID.nb), N = roadCentre(0);

describe('hub links (the border road)', () => {
  it('the route Almadies ↔ Corniche exists in both directions, on the same street', () => {
    const a = LINKS.find(l => l.from === 'almadies'), c = LINKS.find(l => l.from === 'corniche');
    expect(a?.to).toBe('corniche'); expect(c?.to).toBe('almadies');
    expect(a?.x).toBe(c?.x);
  });
  it('driving south past the perimeter road of Almadies comes out on the north perimeter road of Corniche, same x and the same distance past the line', () => {
    const r = crossing('almadies', X + 1.2, S - 0.05, S + 0.15, 9);
    expect(r?.link.to).toBe('corniche');
    expect(r?.x).toBe(X + 1.2);
    expect(r?.z).toBeCloseTo(N + 0.15, 9);
  });
  it('and back: north out of Corniche arrives on Almadies’ south perimeter road', () => {
    const r = crossing('corniche', X - 2, N + 0.1, N - 0.2, -7);
    expect(r?.link.to).toBe('almadies');
    expect(r?.z).toBeCloseTo(S - 0.2, 9);
  });
  it('the line is crossed between two positions: a fast step cannot jump over it', () => {
    expect(crossing('almadies', X, S - 3, S + 3, 30)).not.toBeNull();
  });
  it('going the other way over the same line crosses nothing (no ping-pong after arrival)', () => {
    expect(crossing('corniche', X, N - 0.1, N + 0.1, 9)).toBeNull();   // arrives going south: Corniche’s link needs a northbound car
    expect(crossing('almadies', X, S + 0.1, S - 0.1, -9)).toBeNull();
  });
  it('only on the street of the link: another street, or off the carriageway, is a wall as before', () => {
    expect(crossing('almadies', roadCentre(3), S - 0.1, S + 0.1, 9)).toBeNull();
    expect(crossing('almadies', X + 8, S - 0.1, S + 0.1, 9)).toBeNull();
  });
  it('other districts have no link yet', () => {
    expect(crossing('plateau', X, S - 0.1, S + 0.1, 9)).toBeNull();
    expect(crossing('pikine', X, N + 0.1, N - 0.1, -9)).toBeNull();
  });
  it('a car that does not reach the line crosses nothing', () => {
    expect(crossing('almadies', X, S - 1, S - 0.5, 9)).toBeNull();
  });
});
