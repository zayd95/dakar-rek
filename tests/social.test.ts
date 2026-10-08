import { describe, it, expect } from 'vitest';
import { GameState } from '../src/core/state';
import { newSave, migrate, SCHEMA_VERSION } from '../src/core/save';
import { Relations, PLAYER } from '../src/social/relations';
import { BEATS, availableBeat, suggestion, applyChoice } from '../src/social/beats';
import { CAST, START_LINKS } from '../src/social/cast';
import { ACTIONS, AIDA_REVISION, completeAidaRevision } from '../src/world/content';

const fresh = () => { const s = new GameState(newSave(0)); return { s, r: new Relations(s.data) }; };
const play = (r: Relations, s: GameState, id: string, choice: string) => {
  const b = BEATS.find(x => x.id === id)!; return applyChoice(b, b.choices.find(c => c.id === choice)!, r, s);
};

describe('Aïda revision activity', () => {
  it('a promise grants no session rewards; activity and recognition grant them once', () => {
    const { s, r } = fresh();
    const before = JSON.parse(JSON.stringify(s.data));
    expect(AIDA_REVISION.visible!(s)).toBe(false);
    expect(completeAidaRevision(s)).toBe(false);
    expect(availableBeat('aida', r, s)?.id).toBe('aida_revise');
    play(r, s, 'aida_revised', 'merci');
    expect(s.data.flags).not.toContain('aida_friend');
    play(r, s, 'aida_revise', 'venir');
    expect(s.data.flags).toContain('aida_revision_invited');
    expect(s.data.needs).toEqual(before.needs);
    expect(r.level('aida')).toBe(0);
    expect(s.data.counters).toEqual({});
    expect(availableBeat('aida', r, s)).toBeNull();
    expect(AIDA_REVISION.visible!(s)).toBe(true);
    expect(AIDA_REVISION.requires!(s)).toBeNull();
    expect(completeAidaRevision(s)).toBe(true);
    expect(s.data.needs.social).toBe(before.needs.social + 12);
    expect(s.data.needs.energie).toBe(before.needs.energie - 6);
    expect(s.data.counters).toEqual({ aida_revisions: 1, actions: 1 });
    expect(r.level('aida')).toBe(1);
    expect(s.data.flags).not.toContain('aida_friend');
    expect(AIDA_REVISION.visible!(s)).toBe(false);
    expect(availableBeat('aida', r, s)?.id).toBe('aida_revised');
    play(r, s, 'aida_revised', 'merci');
    expect(s.data.flags).toContain('aida_friend');
    expect(s.data.counters.etudes).toBe(1);
    expect(r.level('aida')).toBe(10);
    const completed = JSON.stringify(s.data);
    play(r, s, 'aida_revise', 'venir');
    play(r, s, 'aida_revised', 'merci');
    expect(completeAidaRevision(s)).toBe(false);
    expect(JSON.stringify(s.data)).toBe(completed);
    expect(availableBeat('aida', r, s)).toBeNull();
  });
  it('repeated refusal changes nothing and leaves the invitation available', () => {
    const { s, r } = fresh(), before = JSON.stringify(s.data);
    for (let i = 0; i < 5; i++) play(r, s, 'aida_revise', 'non');
    expect(JSON.stringify(s.data)).toBe(before);
    expect(availableBeat('aida', r, s)?.id).toBe('aida_revise');
    expect(AIDA_REVISION.visible!(s)).toBe(false);
  });
  it('energy is a start prerequisite and the activity belongs only to Aïda', () => {
    const { s, r } = fresh();
    play(r, s, 'aida_revise', 'venir');
    s.data.needs.energie = 5.99;
    expect(AIDA_REVISION.requires!(s)).toContain('6');
    s.data.needs.energie = 6;
    expect(AIDA_REVISION.requires!(s)).toBeNull();
    expect(AIDA_REVISION.seconds).toBe(4);
    for (const [owner, actions] of Object.entries(ACTIONS)) expect(actions.some(a => a.id === AIDA_REVISION.id)).toBe(owner === 'aida');
    // Natural drain while busy does not invalidate a session started at 6.
    s.tick(4000);
    expect(completeAidaRevision(s)).toBe(true);
    expect(s.data.needs.energie).toBe(0);
  });
  it('all three explicit milestones survive reload without replaying rewards', () => {
    let { s, r } = fresh();
    const reload = () => { s = new GameState(migrate(JSON.parse(JSON.stringify(s.data)))!); r = new Relations(s.data); };
    play(r, s, 'aida_revise', 'venir'); reload();
    expect(AIDA_REVISION.visible!(s)).toBe(true);
    expect(s.data.counters.aida_revisions).toBeUndefined();
    completeAidaRevision(s); reload();
    expect(AIDA_REVISION.visible!(s)).toBe(false);
    expect(availableBeat('aida', r, s)?.id).toBe('aida_revised');
    expect(completeAidaRevision(s)).toBe(false);
    play(r, s, 'aida_revised', 'merci'); reload();
    const before = JSON.stringify(s.data);
    play(r, s, 'aida_revised', 'merci');
    expect(JSON.stringify(s.data)).toBe(before);
    expect(s.data.counters.etudes).toBe(1);
  });
  it('old completed saves remain completed without retroactive rewards', () => {
    const { s, r } = fresh();
    s.data.beats.aida_revise = 'venir'; s.data.flags.push('aida_friend');
    s.data.counters.etudes = 1; r.change(PLAYER, 'aida', 10);
    const restored = new GameState(migrate(JSON.parse(JSON.stringify(s.data)))!);
    const rr = new Relations(restored.data), before = JSON.stringify(restored.data);
    expect(availableBeat('aida', rr, restored)).toBeNull();
    expect(AIDA_REVISION.visible!(restored)).toBe(false);
    expect(completeAidaRevision(restored)).toBe(false);
    play(rr, restored, 'aida_revised', 'merci');
    expect(JSON.stringify(restored.data)).toBe(before);
  });
});

describe('Ibou recommendation follow-up', () => {
  const id = 'ibou_modou_followup';
  const unlock = () => {
    const { s, r } = fresh();
    play(r, s, 'ibou_welcome', 'oui');
    play(r, s, 'modou_reco', 'commencer');
    return { s, r };
  };
  it('requires both the completed welcome and Modou trust, not a generic shift', () => {
    const b = BEATS.find(b => b.id === id)!;
    for (const [welcome, trust] of [[false, false], [true, false], [false, true]]) {
      const { s, r } = fresh();
      if (welcome) s.data.beats.ibou_welcome = 'oui';
      if (trust) r.set('modou_trust');
      s.count('shifts', 20);
      const before = JSON.stringify(s.data);
      expect(b.when(r, s)).toBe(false);
      expect(applyChoice(b, b.choices[0], r, s)).toEqual([]);
      expect(JSON.stringify(s.data)).toBe(before);
    }
    const { s, r } = unlock();
    expect(availableBeat('ibou', r, s)?.id).toBe(id);
  });
  it('adds only two relationship points and completion memory, exactly once', () => {
    const { s, r } = unlock();
    const before = JSON.parse(JSON.stringify(s.data));
    expect(play(r, s, id, 'merci')).toEqual(['Tonton Ibou ▲']);
    const expected = JSON.parse(JSON.stringify(before));
    expected.rel['ibou|player'] += 2;
    expected.flags.push(id);
    expected.beats[id] = 'merci';
    expect(s.data).toEqual(expected);
    const done = JSON.stringify(s.data);
    expect(play(r, s, id, 'merci')).toEqual([]);
    expect(play(r, s, id, 'plus_tard')).toEqual([]);
    expect(JSON.stringify(s.data)).toBe(done);
    expect(availableBeat('ibou', r, s)).toBeNull();
    const restored = new GameState(migrate(JSON.parse(done))!);
    const rr = new Relations(restored.data), loaded = JSON.stringify(restored.data);
    expect(availableBeat('ibou', rr, restored)).toBeNull();
    expect(play(rr, restored, id, 'merci')).toEqual([]);
    expect(JSON.stringify(restored.data)).toBe(loaded);
  });
  it('repeated postponement is neutral and available again after reload', () => {
    const { s, r } = unlock(), before = JSON.stringify(s.data);
    for (let i = 0; i < 5; i++) expect(play(r, s, id, 'plus_tard')).toEqual([]);
    expect(JSON.stringify(s.data)).toBe(before);
    const restored = new GameState(migrate(JSON.parse(before))!);
    expect(availableBeat('ibou', new Relations(restored.data), restored)?.id).toBe(id);
  });
  it('rejects foreign choices, forged beats and stale preconditions', () => {
    const { s, r } = unlock(), b = BEATS.find(b => b.id === id)!;
    const before = JSON.stringify(s.data);
    const foreign = BEATS.find(b => b.id === 'adja_stall')!.choices[0];
    expect(applyChoice(b, foreign, r, s)).toEqual([]);
    expect(applyChoice(b, { ...b.choices[0] }, r, s)).toEqual([]);
    expect(applyChoice({ ...b }, b.choices[0], r, s)).toEqual([]);
    expect(JSON.stringify(s.data)).toBe(before);
    s.data.flags = s.data.flags.filter(f => f !== 'modou_trust');
    const stale = JSON.stringify(s.data);
    expect(applyChoice(b, b.choices[0], r, s)).toEqual([]);
    expect(JSON.stringify(s.data)).toBe(stale);
  });
  it('keeps all existing beats in their authored order', () => {
    expect(BEATS.map(b => b.id)).toEqual([
      'ibou_welcome', 'modou_reco', 'mame_gaz', 'moussa_coach', 'ablaye_join',
      'ablaye_rival', 'lamine_meet', 'babacar_win', 'adja_stall', 'fatou_friend',
      'aida_revise', 'aida_revised', 'ousmane_cousin', 'khady_service', id,
    ]);
  });
});

describe('cast and links', () => {
  it('every beat and link refers to a cast member, every hub has someone', () => {
    const ids = new Set(CAST.map(c => c.id));
    for (const b of BEATS) expect(ids.has(b.npc)).toBe(true);
    for (const [a, b] of START_LINKS) { expect(ids.has(a)).toBe(true); expect(ids.has(b)).toBe(true); }
    for (const h of ['plateau', 'corniche', 'almadies', 'pikine']) expect(CAST.some(c => c.hub === h)).toBe(true);
    for (const h of ['plateau', 'corniche', 'almadies', 'pikine']) expect(BEATS.some(b => CAST.find(c => c.id === b.npc)!.hub === h)).toBe(true);
  });
  it('NPC–NPC links start from authored values and are symmetric', () => {
    const { r } = fresh();
    expect(r.level('ibou', 'modou')).toBe(70);
    expect(r.level('modou', 'ibou')).toBe(70);
    expect(r.level('babacar', 'lamine')).toBeLessThan(0);
  });
});

describe('story beats', () => {
  it('a neighbour recommends the player for a job (Ibou -> Modou -> trusted rate)', () => {
    const { s, r } = fresh();
    expect(suggestion(r, s)?.id).toBe('ibou_welcome');
    expect(availableBeat('modou', r, s)).toBeNull();
    play(r, s, 'ibou_welcome', 'oui');
    expect(availableBeat('modou', r, s)?.id).toBe('modou_reco');
    play(r, s, 'modou_reco', 'commencer');
    expect(s.data.flags).toContain('modou_trust');
    expect(r.level(PLAYER, 'modou')).toBeGreaterThan(0);
    expect(availableBeat('modou', r, s)).toBeNull();
  });
  it('a non-completing choice keeps the beat available', () => {
    const { s, r } = fresh();
    play(r, s, 'ibou_welcome', 'oui');
    play(r, s, 'modou_reco', 'plus_tard');
    expect(availableBeat('modou', r, s)?.id).toBe('modou_reco');
  });
  it('a coach introduces a rival, then the écurie celebrates', () => {
    const { s, r } = fresh();
    play(r, s, 'ablaye_join', 'rejoindre');
    expect(availableBeat('ablaye', r, s)).toBeNull();          // needs two training sessions
    s.count('lutte', 2);
    expect(availableBeat('ablaye', r, s)?.id).toBe('ablaye_rival');
    play(r, s, 'ablaye_rival', 'pret');
    play(r, s, 'lamine_meet', 'provoquer');
    expect(r.level(PLAYER, 'lamine')).toBeLessThan(0);
    const b = availableBeat('babacar', r, s)!;
    expect(b.id).toBe('babacar_win');
    expect(b.choices.find(c => c.id === 'danser')!.effects.scene).toBe('celebration');
  });
  it('a vendor remembers previous help', () => {
    const { s, r } = fresh();
    s.count('actions');
    play(r, s, 'mame_gaz', 'aider');
    expect(s.data.flags).toContain('mame_helped');
  });
  it('news travels between connected characters (Adja -> Fatou)', () => {
    const { s, r } = fresh();
    expect(availableBeat('fatou', r, s)).toBeNull();
    play(r, s, 'adja_stall', 'accepter');
    expect(s.wallet).toBe(3000 + 3000);
    expect(availableBeat('fatou', r, s)?.id).toBe('fatou_friend');
  });
});

describe('persistence', () => {
  it('relationships, flags, beats and wrestler look survive a save round-trip', () => {
    const { s, r } = fresh();
    play(r, s, 'ibou_welcome', 'oui');
    s.data.wrestler.ngembColor = 'indigo'; s.data.wrestler.accessories = ['taille'];
    const back = migrate(JSON.parse(JSON.stringify(s.data)))!;
    expect(back.flags).toContain('reco_modou');
    expect(back.beats.ibou_welcome).toBe('oui');
    expect(new Relations(back).level(PLAYER, 'ibou')).toBe(8);
    expect(back.wrestler).toEqual({ ngembColor: 'indigo', ngembPattern: 'uni', accessories: ['taille'] });
  });
  it('a v1 save migrates to v2 with empty social state', () => {
    const m = migrate({ schemaVersion: 1, wallet: 500, hub: 'plateau' })!;
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.rel).toEqual({}); expect(m.flags).toEqual([]); expect(m.beats).toEqual({});
    expect(m.wallet).toBe(500);
  });
  it('relationships do not decay with played time', () => {
    const { s, r } = fresh();
    play(r, s, 'ibou_welcome', 'oui');
    const before = r.level(PLAYER, 'ibou');
    s.tick(10 * 60 * 60 * 1000);
    expect(r.level(PLAYER, 'ibou')).toBe(before);
  });
});
