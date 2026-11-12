import { describe, expect, it } from 'vitest';
import type { SaveData } from '../src/core/types';
import { tripOf, vtcFare, VTC_POINTS } from '../src/transport/vtcRules';
import { hourStamp } from '../src/social/memory';
import {
  AMINATA, FILAOS, LATER_HOURS, MZ, PAPE_SPOT, isBankRide, isFirstRide, mermozRequests, onPaid, recognise, recognition,
} from '../src/districts/mermozRules';

const blank = (): Pick<SaveData, 'flags' | 'counters'> => ({ flags: [], counters: {} });
const trip = (key: string, d: Pick<SaveData, 'flags'>, hub: 'corniche' | 'mermoz') => tripOf(mermozRequests(hub, d).find(r => r.key === key)!, 'V1', 0);

describe('Mermoz M1: the first ride, Pape Diouf and his memory (src/districts/mermozRules.ts)', () => {
  it('a new save sees one authored ride on the Corniche, to the Filaos, fare by the ordinary rules; nothing yet from Mermoz', () => {
    const d = blank(), c = mermozRequests('corniche', d);
    expect(c.map(r => r.key)).toEqual(['mz:first']);
    expect(c[0]).toMatchObject({ from: 'corniche', to: 'mermoz', passenger: { name: AMINATA } });
    expect(c[0].dropoff).toEqual(FILAOS());
    const f = vtcFare('corniche', c[0].pickup, 'mermoz', c[0].dropoff);
    expect(c[0].fare).toBe(f.fare);
    expect(f.hubs).toEqual(['corniche', 'mermoz']);
    expect(mermozRequests('mermoz', d)).toEqual([]);
    for (const h of ['plateau', 'pikine', 'almadies'] as const) expect(mermozRequests(h, d)).toEqual([]);
  });

  it('paid once: the first ride is gone, Pape thanks them once (first), a second drop at his gate is « again »', () => {
    const d = blank(), t = trip('mz:first', d, 'corniche');
    expect(isFirstRide(t)).toBe(true);
    expect(onPaid(d, t, hourStamp(3, 18))).toBe('first');
    expect(d.flags).toContain(MZ.first);
    expect(d.counters[MZ.rides]).toBe(1);
    expect(d.counters[MZ.met]).toBe(hourStamp(3, 18) + 1);
    expect(mermozRequests('corniche', d)).toEqual([]);
    // an ordinary ride that also ends at the Filaos
    const other = tripOf({ ...mermozRequests('corniche', blank())[0], passenger: { name: 'Awa', seed: 1 } }, 'V2', 0);
    expect(isFirstRide(other)).toBe(false);
    expect(onPaid(d, other, hourStamp(3, 19))).toBe('again');
    expect(d.counters[MZ.met]).toBe(hourStamp(3, 18) + 1);                       // met stays the first meeting
  });

  it('rides that do not end at his gate change nothing he says', () => {
    const d = blank();
    const t = tripOf({ key: 'x', from: 'corniche', to: 'plateau', pickup: VTC_POINTS.corniche[0], dropoff: VTC_POINTS.plateau[0], fare: 900, metres: 1, hubs: ['corniche', 'plateau'], passenger: { name: 'Awa', seed: 1 } }, 'V3', 0);
    expect(onPaid(d, t, 10)).toBeNull();
    expect(d).toEqual(blank());
  });

  it('recognition: not on the same visit-hour, then once a later day; it reveals Mme Ndiaye’s bank ride once ever', () => {
    const d = blank(), met = hourStamp(3, 18);
    expect(recognition(d, 3, met + 5)).toBeNull();                              // never met
    onPaid(d, trip('mz:first', d, 'corniche'), met);
    expect(recognition(d, 3, met + LATER_HOURS - 1)).toBeNull();               // too soon
    const r = recognition(d, 3, met + LATER_HOURS);
    expect(r).toEqual({ reveal: true });
    recognise(d, 3, r!.reveal);
    expect(recognition(d, 3, met + 4)).toBeNull();                              // once a day
    expect(d.flags).toContain(MZ.offer);
    const bank = mermozRequests('mermoz', d);
    expect(bank.map(q => q.key)).toEqual(['mz:ndiaye']);
    expect(bank[0]).toMatchObject({ from: 'mermoz', to: 'plateau', passenger: { name: AMINATA } });
    expect(bank[0].dropoff.name).toBe('Banque Teranga · Plateau');
    // the next day: recognised again, nothing more revealed
    expect(recognition(d, 4, hourStamp(4, 9))).toEqual({ reveal: false });
    // the bank ride paid: gone for good, and it never comes back however often they visit
    const bt = tripOf(bank[0], 'V9', 0);
    expect(isBankRide(bt)).toBe(true);
    expect(onPaid(d, bt, hourStamp(4, 10))).toBeNull();
    expect(d.flags).toContain(MZ.offerDone);
    expect(mermozRequests('mermoz', d)).toEqual([]);
    expect(recognition(d, 5, hourStamp(5, 9))).toEqual({ reveal: false });
  });

  it('the memory is flags and counters only, the same after a JSON round trip (a reload)', () => {
    const d = blank(), met = hourStamp(3, 18);
    onPaid(d, trip('mz:first', d, 'corniche'), met);
    const back = JSON.parse(JSON.stringify(d)) as typeof d;
    expect(recognition(back, 3, met + LATER_HOURS)).toEqual({ reveal: true });
    expect(mermozRequests('corniche', back)).toEqual([]);
    expect(Object.keys(back).sort()).toEqual(['counters', 'flags']);
  });

  it('Pape stands on the pavement beside the Filaos gate, by the drop-off', () => {
    const f = FILAOS();
    expect(Math.hypot(PAPE_SPOT.x - f.x, PAPE_SPOT.z - f.z)).toBeLessThan(5);
  });
});
