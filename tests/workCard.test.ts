import { describe, expect, it } from 'vitest';
import { distance, duration, feedbackLine, streakNote, workCard } from '../src/economy/workCard';

/** The card after a job (src/economy/workCard.ts): what, where, paid, how long, how far, the run, one line from what happened. No stars. */
describe('the work card', () => {
  const w = { kind: 'vtc' as const, title: 'Course terminée · Awa', from: 'Boutique Diallo (Pikine)', to: 'Marché Sandaga (Plateau)', paid: 3500, ms: 252_000, metres: 2310, late: false, bumps: 0 };
  it('says the real numbers', () => {
    expect(duration(252_000)).toBe('4 min 12 s'); expect(duration(42_000)).toBe('42 s');
    expect(distance(2310)).toBe('2,3 km'); expect(distance(436)).toBe('440 m');
    const c = workCard(w, { counted: true, why: 'counted', run: 3, milestone: 3, first: true, graceUsed: false, fresh: false }, 3);
    expect(c.sub).toBe('Boutique Diallo (Pikine) → Marché Sandaga (Plateau)');
    expect(c.rows.map(r => r.k)).toEqual(['Payé', 'Durée', 'Distance', 'Série']);
    expect(c.rows[0].v.replace(/\s/g, ' ')).toBe('3 500 F'); expect(c.rows[3]).toMatchObject({ v: '3 jours d’affilée', note: 'Jour actif compté' });
    expect(c.next).toHaveLength(1); expect(JSON.stringify(c)).not.toMatch(/★/);
  });
  it('one line, read from what happened', () => {
    expect(feedbackLine({ ...w, late: true })).toMatch(/retard/);
    expect(feedbackLine(w)).toMatch(/sans accroc/);
    expect(feedbackLine({ ...w, bumps: 2 })).toBe('À l’heure.');
  });
  it('the run: counted, already counted today, or a little later', () => {
    expect(streakNote({ counted: false, why: 'already', run: 2, milestone: null, first: false, graceUsed: false, fresh: false }, 2).note).toMatch(/déjà/);
    expect(streakNote({ counted: true, why: 'counted', run: 1, milestone: null, first: false, graceUsed: false, fresh: true }, 1)).toEqual({ v: '1 jour actif', note: 'Premier jour actif' });
  });
});
