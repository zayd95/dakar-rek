import { describe, it, expect } from 'vitest';
import { GameState } from '../src/core/state';
import { newSave, migrate, SCHEMA_VERSION, LEDGER_MAX } from '../src/core/save';
import { Relations } from '../src/social/relations';
import { BEATS, availableBeat, suggestion, applyChoice } from '../src/social/beats';
import { ROUTES, CLIENTS, offers, acceptJob, completeJob, cancelJob, pickUp, deliveryLimitMs, routePay, pickupFrags } from '../src/economy/jobs';
import { FURNITURE, buyFurniture, goalItem, priceOf } from '../src/economy/furniture';
import { ECONOMY } from '../src/economy/config';

const fresh = () => { const s = new GameState(newSave(0)); return { s, r: new Relations(s.data) }; };
const play = (r: Relations, s: GameState, id: string, choice: string) => {
  const b = BEATS.find(x => x.id === id)!; return applyChoice(b, b.choices.find(c => c.id === choice)!, r, s);
};

describe('save schema v3 (now part of v4)', () => {
  it('a v2 save migrates with an empty ledger, no furniture and no delivery, keeping money and story', () => {
    const v2 = { schemaVersion: 2, guestId: 'g', hub: 'pikine', x: 1040, z: 0, wallet: 7777, flags: ['reco_modou'], beats: { ibou_welcome: 'oui' } };
    const m = migrate(v2)!;
    expect(SCHEMA_VERSION).toBe(4);
    expect(m.schemaVersion).toBe(4);
    expect(m.ledger).toEqual([]); expect(m.furniture).toEqual([]);
    expect(m.jobs).toEqual({ active: null, done: [], seq: 0 });
    expect(m.wallet).toBe(7777); expect(m.flags).toEqual(['reco_modou']); expect(m.beats.ibou_welcome).toBe('oui');
    expect(m.x).toBe(1040);              // off-map positions are recovered at load time (main.ts), not by the migration
  });
  it('a v1 save also reaches the current schema', () => {
    const m = migrate({ schemaVersion: 1, wallet: 500 })!;
    expect(m.schemaVersion).toBe(SCHEMA_VERSION); expect(m.ledger).toEqual([]); expect(m.furniture).toEqual([]);
  });
  it('sanitises ledger, furniture and jobs, and round-trips them', () => {
    const m = migrate({ schemaVersion: 3, ledger: [{ at: 1, label: 'ok', amount: 5 }, { label: 'bad' }, 'x'], furniture: ['radio', 'radio', 3], jobs: { active: { runId: 'r1', routeId: 'pk_mame_boutique', hub: 'mars' }, done: ['a', 2], seq: 'z' } })!;
    expect(m.ledger).toEqual([{ at: 1, label: 'ok', amount: 5 }]);
    expect(m.furniture).toEqual(['radio']);
    expect(m.jobs).toEqual({ active: null, done: ['a'], seq: 0 });
    const { s } = fresh();
    expect(buyFurniture(s, 'miroir')).toBe(true); s.addMoney(-100, 'Café Touba'); acceptJob(s, 'pk_mame_boutique', true, 60000);
    const back = migrate(JSON.parse(JSON.stringify(s.data)))!;
    expect(back.ledger).toEqual(s.data.ledger); expect(back.furniture).toEqual(['miroir']); expect(back.jobs).toEqual(s.data.jobs);
  });
  it('drops a restored active run that was already completed', () => {
    const m = migrate({ schemaVersion: 3, jobs: { active: { runId: 'r1', routeId: 'pk_mame_boutique', hub: 'pikine', stage: 'deliver', pay: 1200, startedMs: 0, limitMs: 1 }, done: ['r1'], seq: 1 } })!;
    expect(m.jobs.active).toBeNull();
  });
});

describe('ledger', () => {
  it('records every money change with what was actually applied, and keeps the last 100', () => {
    const { s } = fresh();
    s.addMoney(-1000, 'Ceebu jën', 10); s.addMoney(2500, 'Vendre au marché', 20); s.addMoney(-1e6, 'Trop cher', 30); s.addMoney(0, 'rien');
    expect(s.data.ledger).toEqual([{ at: 10, label: 'Ceebu jën', amount: -1000 }, { at: 20, label: 'Vendre au marché', amount: 2500 }, { at: 30, label: 'Trop cher', amount: -4500 }]);
    expect(s.wallet).toBe(0);
    for (let i = 0; i < 150; i++) s.addMoney(1, 'x' + i);
    expect(s.data.ledger.length).toBe(LEDGER_MAX); expect(s.data.ledger.at(-1)!.label).toBe('x149');
  });
  it('beat rewards are labelled with the beat', () => {
    const { s, r } = fresh();
    play(r, s, 'adja_stall', 'accepter');
    expect(s.data.ledger.at(-1)).toMatchObject({ label: 'Tenir l’étal', amount: 3000 });
  });
});

describe('Tiak Tiak deliveries', () => {
  it('has 3–5 ordinary routes in Pikine and Plateau, each with a pay and a better-paid recommended follow-up', () => {
    for (const hub of ['pikine', 'plateau'] as const) {
      const ordinary = ROUTES.filter(r => r.hub === hub && !r.needFlag);
      expect(ordinary.length).toBeGreaterThanOrEqual(3); expect(ordinary.length).toBeLessThanOrEqual(5);
      expect(pickupFrags(hub).length).toBeGreaterThanOrEqual(2);
      const reco = ROUTES.find(r => r.hub === hub && r.needFlag)!;
      expect(reco.needFlag).toBe(CLIENTS[hub]!.flag);
      expect(Math.max(...ordinary.map(routePay))).toBeLessThan(routePay(reco));
    }
    for (const r of ROUTES) { expect(ECONOMY.tiak.pay[r.id]).toBeGreaterThan(0); expect(r.from.frag).not.toBe(r.to.frag); }
  });
  it('pays once: completing the same run id twice pays a single time', () => {
    const { s } = fresh();
    const job = acceptJob(s, 'pk_mame_boutique', true, 60000)!;
    const first = completeJob(s, job.runId)!;
    expect(first.paid).toBe(1200); expect(first.late).toBe(false);
    const wallet = s.wallet, ledger = s.data.ledger.length, count = s.data.counters.livraisons;
    expect(completeJob(s, job.runId)).toBeNull();
    // even if a stale copy of the same run comes back as the active job, it is not paid again
    s.data.jobs.active = { ...job };
    expect(completeJob(s, job.runId)).toBeNull();
    expect(s.wallet).toBe(wallet); expect(s.data.ledger.length).toBe(ledger); expect(s.data.counters.livraisons).toBe(count);
    expect(s.data.jobs.done).toContain(job.runId);
  });
  it('gives each run its own id', () => {
    const { s } = fresh();
    const a = acceptJob(s, 'pk_mame_boutique', true, 60000)!; completeJob(s, a.runId);
    const b = acceptJob(s, 'pk_mame_boutique', true, 60000)!;
    expect(b.runId).not.toBe(a.runId);
  });
  it('cancelling pays nothing, and has no double effect', () => {
    const { s } = fresh();
    const w = s.wallet, energy = s.data.needs.energie;
    const job = acceptJob(s, 'pk_boutique_salon', true, 60000)!;
    expect(cancelJob(s)).toBe(true); expect(cancelJob(s)).toBe(false);
    expect(completeJob(s, job.runId)).toBeNull();
    expect(s.wallet).toBe(w); expect(s.data.needs.energie).toBe(energy); expect(s.data.ledger).toEqual([]);
    expect(s.data.counters.livraisons ?? 0).toBe(0);
  });
  it('one delivery at a time; a run accepted from the phone must be picked up first', () => {
    const { s } = fresh();
    const job = acceptJob(s, 'pk_mame_bank', false, 0)!;
    expect(job.stage).toBe('pickup');
    expect(acceptJob(s, 'pk_boutique_salon', true, 60000)).toBeNull();
    expect(completeJob(s, job.runId)).toBeNull();            // nothing to hand over yet
    expect(pickUp(s, 90000)).toBe(true); expect(pickUp(s, 90000)).toBe(false);
    expect(completeJob(s, job.runId)!.paid).toBe(1400);
  });
  it('late deliveries pay less but never a negative amount; fatigue is small', () => {
    const { s } = fresh();
    const job = acceptJob(s, 'pk_mame_boutique', true, 60000)!;
    s.tick(61000);
    const before = s.wallet, energy = s.data.needs.energie;
    const c = completeJob(s, job.runId)!;
    expect(c.late).toBe(true); expect(c.paid).toBe(Math.round(1200 * ECONOMY.tiak.latePayFactor)); expect(c.paid).toBeGreaterThan(0);
    expect(s.wallet).toBe(before + c.paid);
    expect(energy - s.data.needs.energie).toBeLessThanOrEqual(-ECONOMY.tiak.fatigue.energie + 0.01);
    expect(deliveryLimitMs(0)).toBe(ECONOMY.tiak.minLimitS * 1000);
    expect(deliveryLimitMs(200)).toBeGreaterThan((200 / ECONOMY.tiak.walkSpeed) * 2000);
  });
  it('the first client recommends a better-paid run, visible in the next offers', () => {
    const { s } = fresh();
    expect(offers(s, 'pikine').some(r => r.needFlag)).toBe(false);
    const job = acceptJob(s, 'pk_pathe_square', true, 60000)!;
    expect(completeJob(s, job.runId)!.newClient).toBe(CLIENTS.pikine!.name);
    expect(offers(s, 'pikine')[0].id).toBe('pk_reco_salon_bank');
    const again = acceptJob(s, 'pk_mame_boutique', true, 60000)!;
    expect(completeJob(s, again.runId)!.newClient).toBeNull();
  });
  it('a tired courier cannot take a delivery', () => {
    const { s } = fresh();
    s.data.needs.energie = 2;
    expect(acceptJob(s, 'pk_mame_boutique', true, 60000)).toBeNull();
  });
});

describe('furniture', () => {
  it('5–6 items, each with a price and an action; buying charges once and is recorded', () => {
    expect(FURNITURE.length).toBeGreaterThanOrEqual(5); expect(FURNITURE.length).toBeLessThanOrEqual(6);
    for (const f of FURNITURE) { expect(priceOf(f.id)).toBeGreaterThan(0); expect(f.action.needs).toBeDefined(); }
    const { s } = fresh();
    expect(buyFurniture(s, 'miroir')).toBe(true);
    expect(s.wallet).toBe(3000 - priceOf('miroir'));
    expect(buyFurniture(s, 'miroir')).toBe(false);
    expect(s.wallet).toBe(3000 - priceOf('miroir'));
    expect(s.data.ledger.at(-1)).toMatchObject({ amount: -priceOf('miroir') });
    expect(buyFurniture(s, 'tele')).toBe(false);                  // not enough money
    expect(buyFurniture(s, 'nope')).toBe(false);
  });
  it('the better mattress restores more energy than the plain bed', () => {
    const good = FURNITURE.find(f => f.id === 'matelas')!.action.needs!;
    expect(good.energie!).toBeGreaterThan(70);
  });
});

describe('a close one reacts (Ibou) and the next step', () => {
  it('a fresh save still suggests Ibou’s welcome first', () => {
    const { s, r } = fresh();
    expect(suggestion(r, s)?.id).toBe('ibou_welcome');
  });
  it('welcome → first delivery → Ibou reacts → furniture goal → first furniture → Ibou suggests the next goal', () => {
    const { s, r } = fresh();
    play(r, s, 'ibou_welcome', 'oui');
    expect(suggestion(r, s)?.id).toBe('goal_tiak');
    expect(availableBeat('ibou', r, s)).toBeNull();
    const job = acceptJob(s, 'pk_mame_boutique', true, 60000)!;
    expect(suggestion(r, s)?.id).toBe('goal_deliver');
    completeJob(s, job.runId);
    expect(availableBeat('ibou', r, s)?.id).toBe('ibou_tiak');
    expect(suggestion(r, s)?.id).toBe('ibou_tiak');
    play(r, s, 'ibou_tiak', 'radio');
    expect(goalItem(s)?.id).toBe('radio');
    const sg = suggestion(r, s)!;
    expect(sg.id).toBe('goal_buy');                                 // 3 000 + 1 200 F ≥ 4 000 F
    expect(sg.hint).toContain('radio');
    buyFurniture(s, 'radio');
    expect(availableBeat('ibou', r, s)?.id).toBe('ibou_meuble');
    expect(suggestion(r, s)?.id).toBe('ibou_meuble');
    play(r, s, 'ibou_meuble', 'chaises');
    expect(suggestion(r, s)?.id).toBe('goal_save');
    expect(suggestion(r, s)!.hint).toContain('chaises');
    s.addMoney(10000, 'test');
    expect(suggestion(r, s)?.id).toBe('goal_buy');
    buyFurniture(s, 'chaises');
    expect(suggestion(r, s)?.id).toBe('modou_reco');                // back to the story once Ibou's goal is reached
  });
});
