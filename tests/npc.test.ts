import { describe, it, expect } from 'vitest';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import { Relations, PLAYER } from '../src/social/relations';
import { BEATS, availableBeat, suggestion, applyChoice } from '../src/social/beats';
import { CAST } from '../src/social/cast';
import { PROFILES, profileOf } from '../src/social/profiles';
import { ROUTINES, routineOf, slotAt, currentPlan, resolvePlace, planPath, kioskDir, poseFor, LANE, type Anchor } from '../src/social/routines';
import { REGULAR_AT, recordVisit, recordService, updateRegular, isRegular, greeting, introduction, applyIntroduction, lastMemory, hourStamp } from '../src/social/memory';
import { SITUATIONS, situationFor, sitCtx, choicesFor, playSituation, favourFor } from '../src/social/situations';

const fresh = () => { const s = new GameState(newSave(0)); return { s, r: new Relations(s.data) }; };
const play = (r: Relations, s: GameState, id: string, choice: string) => { const b = BEATS.find(x => x.id === id)!; return applyChoice(b, b.choices.find(c => c.id === choice)!, r, s); };
const ids = new Set(CAST.map(c => c.id));

describe('character sheets', () => {
  it('every cast member has a draft sheet with two relations, reactions and no invented expressions', () => {
    for (const c of CAST) {
      const p = profileOf(c.id)!;
      expect(p, c.id).toBeTruthy();
      expect(p.review).toBe('brouillon — à relire par Habib');
      expect(p.relations.length).toBeGreaterThanOrEqual(2);
      for (const [id] of p.relations) expect(ids.has(id), `${c.id} -> ${id}`).toBe(true);
      expect(p.reactions.length).toBeGreaterThan(2);
      expect(p.reactions[p.reactions.length - 1].when).toEqual({}); // always a fallback line
      for (const e of p.expressions) expect(e.startsWith('TODO(Habib)') || e.includes('déjà dans le jeu')).toBe(true);
      for (const i of p.intros ?? []) expect(ids.has(i.to)).toBe(true);
    }
    expect(PROFILES.length).toBe(CAST.length);
  });
  it('the Diallo family is Peul with different occupations, and one trader of another origin', () => {
    const [m, k, n] = ['mamadou', 'kadiatou', 'ndeye'].map(id => profileOf(id)!);
    expect(m.origin).toMatch(/Peul/); expect(k.origin).toMatch(/Peul/);
    expect(m.job).toMatch(/Boutique/); expect(k.job).toMatch(/Étudiante/);
    expect(m.relations.map(r => r[0])).toContain('kadiatou');
    expect(n.origin).not.toMatch(/Peul/); expect(n.job).toMatch(/commerçante/);
  });
});

describe('routines by city hour', () => {
  it('every routine covers the whole day without overlap', () => {
    for (const r of ROUTINES) {
      expect(ids.has(r.id)).toBe(true);
      for (let h = 0; h < 24; h += 0.25) {
        const n = r.slots.filter(s => h >= s.from && h < s.to).length;
        expect(n, `${r.id} at ${h}h`).toBe(1);
      }
    }
    for (const c of CAST) expect(routineOf(c.id)?.hub).toBe(c.hub);
  });
  it('the same person is at four different places at 8h, 12h, 14h30 and 20h', () => {
    const r = routineOf('ibou')!;
    const at = [8, 12, 14.5, 20].map(h => slotAt(r, h));
    expect(at.map(s => s.place.label)).toEqual(['au café Touba des Parcelles', 'à la Boutique Diallo, chez Mamadou', 'à la Maïga du marché (déjeuner)', 'sur la grand-place, à l’attaya']);
    expect(at.map(s => s.act)).toEqual(['eat', 'chat', 'eat', 'attaya']);
    expect(new Set(at.map(s => JSON.stringify(s.place))).size).toBe(4);
  });
  it('Ibou waits in front of the player’s room until the first meeting', () => {
    const r = routineOf('ibou')!;
    expect(currentPlan(r, 8, () => false).key).toBe('wait:ibou_welcome');
    expect(currentPlan(r, 8, id => id === 'ibou_welcome').place.at).toBe('cafe');
  });
  it('no seat is given to two people at the same time', () => {
    for (let h = 0; h < 24; h += 0.25) for (const hub of ['pikine', 'plateau', 'corniche', 'almadies']) {
      const seats = ROUTINES.filter(r => r.hub === hub).map(r => slotAt(r, h).place).filter(p => p.sit || p.bench || p.maiga).map(p => JSON.stringify({ ...p, label: '' }));
      expect(new Set(seats).size, `${hub} ${h}h`).toBe(seats.length);
    }
  });
  it('poses: seated on seats, work pose when training, face to face when talking', () => {
    expect(poseFor('eat', true, 'player')).toBe('Seated');
    expect(poseFor('train', false, null)).toBe('Stance');
    expect(poseFor('train', false, 'player')).toBe('Talk');
    expect(poseFor('serve', false, 'npc')).toBe('Talk');
    expect(poseFor('wait', false, null)).toBe('Idle');
  });
});

describe('places and walking', () => {
  const anchors: Anchor[] = [{ id: 'pikine:gargote:32', x: 78, z: 54.5 }, { id: 'pikine:cafe:02', x: -78, z: 5.5 }, { id: 'pikine:maiga:31', x: 78, z: -5.5 }];
  it('kiosk benches and the Maïga bench resolve in front of the right kiosk, facing the street', () => {
    expect(kioskDir(54.5)).toBe(1); expect(kioskDir(5.5)).toBe(-1);
    expect(resolvePlace({ at: 'gargote', label: '', bench: { n: 2, side: 1 } }, anchors)).toMatchObject({ x: 82.4, z: 55.7, yaw: 0, sit: true });
    expect(resolvePlace({ at: 'cafe', label: '', bench: { n: 0, side: -1 } }, anchors)).toMatchObject({ x: -82.4, z: 4.3, yaw: Math.PI, sit: true });
    expect(resolvePlace({ at: 'maiga', label: '', maiga: -1 }, anchors)).toMatchObject({ x: 79.2, z: -6.6, sit: true });
    expect(resolvePlace({ at: 'arena', label: '' }, anchors)).toBeNull();
  });
  it('a walk follows the sidewalks: every waypoint between the two places lies on a lane', () => {
    const path = planPath({ x: -36, z: -54.5 }, { x: 78, z: 54.5 });
    expect(path.length).toBeGreaterThan(3);
    const onLane = (v: number) => [-120, -60, 0, 60, 120].some(c => Math.abs(Math.abs(v - c) - LANE) < 1e-6);
    for (const p of path.slice(1, -1)) expect(onLane(p.x) || onLane(p.z), JSON.stringify(p)).toBe(true);
  });
  it('a blocked sidewalk stretch is avoided', () => {
    const blocked = (a: { x: number; z: number }, b: { x: number; z: number }) => !(Math.abs(a.z + 55) < 0.01 && Math.abs(b.z + 55) < 0.01 && Math.min(a.x, b.x) < 30 && Math.max(a.x, b.x) > 30);
    const path = planPath({ x: 0, z: -54.5 }, { x: 50, z: -54.5 }, blocked);
    for (let k = 1; k < path.length; k++) expect(blocked(path[k - 1], path[k])).toBe(true);
    expect(path.some(p => Math.abs(p.z + 65) < 0.01)).toBe(true);   // crossed to the other side of the road
  });
  it('approach waypoints lead into a shop aisle', () => {
    const path = planPath({ x: -36, z: -54.5 }, { x: -105, z: 80.1, yaw: 0, sit: false, stool: false, approach: [[-95.5, 86], [-95.5, 79.6]] });
    expect(path.slice(-3)).toEqual([{ x: -95.5, z: 86 }, { x: -95.5, z: 79.6 }, { x: -105, z: 80.1 }]);
  });
});

describe('memory and recognition', () => {
  it('visits count once per city hour; a regular is recognised after REGULAR_AT visits or services', () => {
    const { s, r } = fresh();
    expect(recordVisit(s, 'mame', hourStamp(3, 12))).toBe(true);
    expect(recordVisit(s, 'mame', hourStamp(3, 12.5))).toBe(false);
    expect(updateRegular(s, r, 'mame')).toBe(false);
    recordService(s, 'mame');
    for (let k = 0; k < REGULAR_AT; k++) recordVisit(s, 'mame', hourStamp(3, 13 + k));
    expect(updateRegular(s, r, 'mame')).toBe(true);
    expect(updateRegular(s, r, 'mame')).toBe(false);
    expect(isRegular(s, 'mame')).toBe(true);
    expect(s.data.flags).toContain('regular_mame');
    expect(Object.keys(s.data).sort()).toEqual(Object.keys(newSave(0)).sort());   // no save schema change
  });
  it('greetings vary with remembered help, regulars and the hour', () => {
    const { s, r } = fresh();
    const p = profileOf('mame')!;
    expect(greeting(p, { id: 'mame', s, r, hour: 8 }).line).toMatch(/pas encore prêt/);
    expect(greeting(p, { id: 'mame', s, r, hour: 13 }).line).toMatch(/Assieds-toi/);
    s.count('actions'); play(r, s, 'mame_gaz', 'aider');
    expect(greeting(p, { id: 'mame', s, r, hour: 13 }).line).toMatch(/bonbonne/);
    r.set('regular_mame');
    expect(greeting(p, { id: 'mame', s, r, hour: 13 }).line).toMatch(/habitué/);
    expect(lastMemory('mame', s, r)).toMatch(/bonbonne/);
  });
  it('a commitment is taken into account (Modou knows Ibou sent you)', () => {
    const { s, r } = fresh();
    const p = profileOf('modou')!;
    play(r, s, 'ibou_welcome', 'oui');
    expect(greeting(p, { id: 'modou', s, r, hour: 9 }).line).toMatch(/Ibou m’a prévenu/);
  });
  it('a regular introduces the player to someone, which unlocks their beat (Mame → Mamadou → Kadiatou)', () => {
    const { s, r } = fresh();
    const mame = profileOf('mame')!;
    expect(introduction(mame, { id: 'mame', s, r, hour: 13 })).toBeNull();
    r.set('regular_mame');
    const i = introduction(mame, { id: 'mame', s, r, hour: 13 })!;
    expect(i.to).toBe('mamadou');
    expect(availableBeat('mamadou', r, s)).toBeNull();
    applyIntroduction(mame, i, s, r);
    expect(introduction(mame, { id: 'mame', s, r, hour: 13 })).toBeNull();
    expect(availableBeat('mamadou', r, s)?.id).toBe('mamadou_livraison');
    const w = s.wallet;
    play(r, s, 'mamadou_livraison', 'livrer');
    expect(s.wallet).toBe(w + 1500);
    expect(r.has('mamadou_trust')).toBe(true);
    expect(r.level(PLAYER, 'mame')).toBeGreaterThan(0);
    const mm = profileOf('mamadou')!;
    const k = introduction(mm, { id: 'mamadou', s, r, hour: 10 })!;
    expect(k.to).toBe('kadiatou');
    applyIntroduction(mm, k, s, r);
    expect(availableBeat('kadiatou', r, s)?.id).toBe('kadiatou_enquete');
    play(r, s, 'kadiatou_enquete', 'carnet');
    expect(greeting(mm, { id: 'mamadou', s, r, hour: 10 }).line).toMatch(/carnet/);
  });
  it('a fresh save still suggests Ibou first', () => {
    const { s, r } = fresh();
    expect(suggestion(r, s)?.id).toBe('ibou_welcome');
  });
});

describe('situations', () => {
  const maiga = SITUATIONS.find(x => x.id === 'maiga_repas')!, attaya = SITUATIONS.find(x => x.id === 'attaya_place')!;
  it('the Maïga meal happens at lunch, when Babacar is at the Maïga, once per day', () => {
    const { s } = fresh();
    const at = (where: string) => (h: string) => (h === 'babacar' ? where : null);
    expect(situationFor('babacar', 14, at('maiga'), s, 5)?.id).toBe('maiga_repas');
    expect(situationFor('modou', 14, at('maiga'), s, 5)?.id).toBe('maiga_repas');
    expect(situationFor('babacar', 9, at('maiga'), s, 5)).toBeNull();
    expect(situationFor('babacar', 14, at('ecurie'), s, 5)).toBeNull();
  });
  it('paying for a neighbour is remembered: favour later, a different scene next time', () => {
    const { s, r } = fresh();
    const x = sitCtx(maiga, r, s, new Set(['babacar', 'modou']), 5);
    expect(x.times).toBe(0);
    expect(choicesFor(maiga, x).map(c => c.id)).toEqual(['payer', 'partager', 'rien']);
    expect(maiga.text(x)).toMatch(/Modou/);
    const w = s.wallet;
    const res = playSituation(maiga, maiga.choices.find(c => c.id === 'payer')!, x);
    expect(res.reply).toMatch(/Modou/);
    expect(s.wallet).toBe(w - 1000);
    expect(r.has('babacar_doit')).toBe(true);
    expect(r.level(PLAYER, 'babacar')).toBe(10);
    expect(situationFor('babacar', 14, () => 'maiga', s, 5)).toBeNull();       // played today
    expect(situationFor('babacar', 14, () => 'maiga', s, 6)?.id).toBe('maiga_repas');
    const y = sitCtx(maiga, r, s, new Set(['babacar']), 6);
    expect(y.last).toBe('payer');
    expect(maiga.text(y)).toMatch(/moi qui invite/);
    expect(choicesFor(maiga, y).map(c => c.id)).toEqual(['accepter']);
    const fav = favourFor('babacar', r)!;
    expect(fav.apply(r, s)).toMatch(/Ablaye/);
    expect(r.has('reco_ablaye')).toBe(true);
    expect(favourFor('babacar', r)).toBeNull();
  });
  it('saying nothing has a consequence too', () => {
    const { s, r } = fresh();
    const x = sitCtx(maiga, r, s, new Set(['babacar', 'modou']), 2);
    playSituation(maiga, maiga.choices.find(c => c.id === 'rien')!, x);
    expect(r.level(PLAYER, 'babacar')).toBeLessThan(0);
    expect(maiga.text(sitCtx(maiga, r, s, new Set(['babacar']), 3))).toMatch(/Modou qui a payé/);
  });
  it('the attaya gives information that unlocks an opportunity, depending on who is there', () => {
    const { s, r } = fresh();
    const withM = sitCtx(attaya, r, s, new Set(['ibou', 'mamadou']), 1);
    expect(choicesFor(attaya, withM).map(c => c.id)).toEqual(['mousse', 'nouvelles', 'partir']);
    playSituation(attaya, attaya.choices.find(c => c.id === 'nouvelles')!, withM);
    expect(availableBeat('mamadou', r, s)?.id).toBe('mamadou_livraison');
    const alone = sitCtx(attaya, r, s, new Set(['ibou']), 2);
    expect(alone.times).toBe(1);
    expect(attaya.text(alone)).toMatch(/habitué/);
    s.count('sucre');
    expect(choicesFor(attaya, alone).map(c => c.id)).toEqual(['mousse', 'cousin', 'sucre', 'partir']);
    playSituation(attaya, attaya.choices.find(c => c.id === 'sucre')!, alone);
    expect(s.data.counters.sucre).toBe(0);
  });
});
