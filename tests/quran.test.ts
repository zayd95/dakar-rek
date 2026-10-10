import { describe, expect, it } from 'vitest';
import data from '../src/venues/quran.json';
import { QURAN_CREDIT, QURAN_SOURCE, arabicDigits, passage, wrapLines, wrapUnits } from '../src/venues/quran';
import { mosque } from '../src/activity/templates';

describe('Quranic text of the Grande Mosquée (Tanzil, verbatim)', () => {
  it('keeps Tanzil’s copyright block and credits the source with its link', () => {
    expect(data.notice).toContain('Tanzil Project');
    expect(data.notice).toContain('CHANGING IT IS NOT ALLOWED');
    expect(data.edition).toMatch(/^Tanzil Quran Text \(Simple, Version/);
    expect(QURAN_SOURCE.url).toBe('https://tanzil.net');
    expect(QURAN_CREDIT).toMatch(/Tanzil Project — tanzil\.net/);
  });

  it('holds only the whole verses the mosque shows', () => {
    const refs = (id: Parameters<typeof passage>[0]) => passage(id).verses.map(v => `${v.sura}:${v.aya}`);
    expect(refs('bismillah')).toEqual(['1:1']);
    expect(refs('fatiha')).toEqual(['1:1', '1:2', '1:3', '1:4', '1:5', '1:6', '1:7']);
    expect(refs('kursi')).toEqual(['2:255']);
    expect(refs('ikhlas')).toEqual(['112:1', '112:2', '112:3', '112:4']);
    for (const p of data.passages) for (const v of p.verses) {
      expect(v.text.length).toBeGreaterThan(3);
      expect(v.text).toMatch(/^[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF ]+$/);   // Arabic script only
    }
  });

  // Byte-for-byte against Tanzil's file: node scripts/quran-extract.mjs --verify <tanzil-simple.xml>

  it('wraps between words only: every verse reads back unchanged, pause marks stay with their word', () => {
    const p = passage('kursi');
    const units = wrapUnits(p, false);
    expect(units.join(' ')).toBe(p.verses[0].text);
    expect(units.some(u => /^[\u06D6-\u06DC]/.test(u))).toBe(false);
    const lines = wrapLines(units, 60, s => s.length);
    expect(lines.length).toBeGreaterThan(3);
    expect(lines.join(' ')).toBe(p.verses[0].text);
    const ik = wrapUnits(passage('ikhlas')).join(' ');
    for (const v of passage('ikhlas').verses) expect(ik).toContain(v.text);
  });

  it('numbers verses in Arabic-Indic digits', () => {
    expect(arabicDigits(255)).toBe('٢٥٥');
    expect(arabicDigits(7)).toBe('٧');
  });

  it('reading the Quran is offered at the stand and brings no reward', () => {
    let opened = 0;
    const spec = mosque({ id: 'm', name: 'Grande Mosquée', space: 'street', anchors: [
      { id: 'ablutions', name: 'Robinets', kind: 'spot', x: 0, z: 0 },
      { id: 'hall', name: 'Rangs', kind: 'place', x: 0, z: 5 },
      { id: 'imam', name: 'Imam', kind: 'person', x: 1, z: 5 },
      { id: 'shelf', name: 'Coran sur son support', kind: 'furniture', x: 2, z: 5 },
    ] }, { read: () => { opened++; } });
    const lire = spec.offers.shelf[0];
    expect(lire.label).toBe('Lire le Coran');
    expect(lire.requires?.()).toBeFalsy();
    for (const s of lire.steps) {
      expect(s.effects).toBeUndefined();
      s.then?.();
    }
    expect(lire.price ?? 0).toBe(0);
    expect(opened).toBe(1);
  });
});
