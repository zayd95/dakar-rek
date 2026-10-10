import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAYER_SIDE, boutByClock, entranceByClock, mainCalledOff, mainDriver, myShowResult, playerCorner, playerMainBill, remoteCard, remoteMain } from '../src/arena/myGala';
import { undercardFor } from '../src/arena/undercard';
import { cornerSides, entranceCues, setRecordSource, griotLine, standsOf, type Fighter } from '../src/arena/ceremony';
import { standsSide } from '../src/arena/bakk';
import { PREP_SIDE } from '../src/world/arenaModules';
import { parseArena } from '../src/multiplayer/protocol';
import { arenaField } from '../src/arena/together';
import { ARENA, unknownPhrases } from '../src/i18n/lines';
import { glossed } from '../src/i18n/wolof';
import { arenaFighter, fighterModule, fighterSpots } from '../src/arena/fighter';
import type { GameCtx } from '../src/game/modules';

const g = (s: string) => glossed(s, true).replace(/[  ]/g, ' ');
const ROSTER = [{ id: 'gora', name: 'Gora Sène', ecurie: 'Teranga' }, { id: 'pape', name: 'Pape Diouf', ecurie: 'Baobab' }, { id: 'ali', name: 'Ali Ndoye', ecurie: null }];

describe('the player\'s own gala night: the bill and the corners', () => {
  it('names the player on the left against their opponent; the title flag only for the belt', () => {
    const b = playerMainBill({ name: 'Moussa', ecurie: 'Baobab' }, ROSTER[0], false);
    expect(b.left).toEqual({ id: 'player', name: 'Moussa', ecurie: 'Baobab' });
    expect(b.right).toEqual({ id: 'gora', name: 'Gora Sène', ecurie: 'Teranga' });
    expect(b.title).toBeUndefined();
    expect(playerMainBill({ name: 'Moussa', ecurie: null }, ROSTER[2], true)).toMatchObject({ left: { ecurie: 'indépendant' }, right: { ecurie: 'indépendant' }, title: true });
    expect(PLAYER_SIDE).toBe('left');
  });
  it('the player\'s corner is the one the ceremony gives their side, never their opponent\'s', () => {
    for (const me of ['Baobab', null] as const) for (const opp of ROSTER) {
      const bill = playerMainBill({ name: 'Moussa', ecurie: me }, opp, false), cs = cornerSides(bill), c = playerCorner(bill);
      expect(PREP_SIDE[c]).toBe(cs.left);
      expect(cs.right).not.toBe(cs.left);
      if (me === 'Baobab') expect(c).toBe('baobab');                                   // a member takes his écurie's corner
    }
  });
  it('the stands by their corner cheer them, whichever side of the bill they are', () => {
    // an independent against a Baobab man: the player takes the Teranga corner, the stands there are theirs
    const bill = playerMainBill({ name: 'Moussa', ecurie: null }, ROSTER[1], false);
    expect(playerCorner(bill)).toBe('teranga');
    expect(standsOf(bill, 'left')).toBe(standsSide('teranga'));
    expect(standsOf(bill, 'right')).toBe(standsSide('baobab'));
    const member = playerMainBill({ name: 'Moussa', ecurie: 'Baobab' }, ROSTER[0], false);
    expect(standsOf(member, 'left')).toBe(standsSide('baobab'));
  });
  it('their real result is the show\'s: their side is the left one', () => {
    expect(myShowResult('player', 'projection')).toEqual({ winner: 'left', outcome: 'projection' });
    expect(myShowResult('opponent', 'decision')).toEqual({ winner: 'right', outcome: 'decision' });
    expect(myShowResult(null, 'abandon')).toEqual({ winner: null, outcome: 'abandon' });
    expect(myShowResult(null, 'entrainement')).toEqual({ winner: null, outcome: 'egalite' });
  });
});

describe('the ceremony is theirs', () => {
  afterEach(() => setRecordSource(null));
  it('named with their real record, praised by their griot, chanted by their people; their bàkk comes on the walk-out', () => {
    setRecordSource(id => (id === 'player' ? { v: 7, d: 2, n: 1 } : null));
    const bill = { left: { id: 'player', name: 'Moussa', ecurie: 'Baobab' }, right: { id: 'gora', name: 'Gora Sène', ecurie: 'Teranga' } };
    const cues = entranceCues(bill, 40, '40', { player: 'left' });
    const mine = cues.filter(c => c.who === 'left'), theirs = cues.filter(c => c.who === 'right');
    expect(mine.map(c => c.kind)).toEqual(['announce', 'griot', 'chant']);                        // no bàkk, boast or drums: theirs comes later
    expect(theirs.map(c => c.kind).sort()).toEqual(['announce', 'bakk', 'boast', 'chant', 'drums', 'griot']);
    expect(mine[0].text).toMatch(/Moussa !.*7 victoires, 2 défaites, 1 nul/);
    expect(g(mine[1].text!)).toMatch(/Moussa.*7 (victoires|combats)/);
    // one voice at a time: the lines never overlap (at least a second apart)
    const said = cues.filter(c => c.text).map(c => c.t).sort((a, b) => a - b);
    for (let i = 1; i < said.length; i++) expect(said[i] - said[i - 1]).toBeGreaterThanOrEqual(1);
    // without a record (a first bout) the griot praises strength and neighbourhood, as for the roster
    expect(griotLine(bill.left as Fighter, '40', null)).not.toMatch(/victoire/);
  });
});

describe('friends see them through their presence, never a simulated duel', () => {
  it('the presence field says « tonight\'s main event is me » and passes the protocol; nothing else is accepted for it', () => {
    const f = arenaField({ day: 40, phase: 'bout', t: 0, result: null, here: true, main: true })!;
    expect(f).toEqual({ d: 40, p: 4, t: 0, m: 1 });
    expect(parseArena(f)).toEqual(f);
    expect(parseArena({ ...f, w: 1, o: 0 })).toEqual({ ...f, w: 1, o: 0 });                       // their real result, once
    for (const m of [0, 2, true, '1', 1.5]) expect(parseArena({ ...f, m })).toBeNull();
    expect(arenaField({ day: 40, phase: 'bout', t: 0, result: null, here: true })).not.toHaveProperty('m');
  });
  it('the friend who is the main event: this evening, inside the walls, the same one on every device', () => {
    const peers = [
      { id: 'b', name: 'Awa', arena: { d: 40, m: 1 }, inside: true },
      { id: 'a', name: 'Moussa', arena: { d: 40, m: 1 }, inside: true },
      { id: 'c', name: 'Fatou', arena: { d: 39, m: 1 }, inside: true },
      { id: '0', name: 'Ibou', arena: { d: 40 }, inside: true },
      { id: '1', name: 'Mame', arena: { d: 40, m: 1 }, inside: false },
    ];
    expect(remoteMain(peers, 40, p => p.inside)?.name).toBe('Moussa');
    expect(remoteMain(peers.slice(2), 40, p => p.inside)).toBeNull();
    expect(remoteCard('entrance', 'Moussa')).toBe('Entrée de Moussa');
    expect(remoteCard('bout', 'Moussa')).toBe('Combat en cours : Moussa');
  });
  it('their own presence moves the friends\' show on: never this device\'s clock', () => {
    const friend = mainDriver(false, true), mine = mainDriver(true, true), clock = mainDriver(false, false);
    expect([friend, mine, clock]).toEqual(['friend', 'mine', 'clock']);
    // a friend's night: the stands wait after the preliminaries for their entrance, then for their bout
    expect(entranceByClock(friend)).toBe(false); expect(boutByClock(friend)).toBe(false);
    // the player's own: the preliminaries lead into their entrance, which ends when they reach the ring
    expect(entranceByClock(mine)).toBe(true); expect(boutByClock(mine)).toBe(false);
    expect(entranceByClock(clock)).toBe(true); expect(boutByClock(clock)).toBe(true);
    // their bout given up before it began: no main event (and no made-up result)
    expect(mainCalledOff(mine, 'entrance', 'idle')).toBe(true);
    expect(mainCalledOff(mine, 'bout', 'return')).toBe(false);
    expect(mainCalledOff(mine, 'prelims', 'idle')).toBe(false);
    expect(mainCalledOff(clock, 'entrance', 'idle')).toBe(false);
  });
  it('the preliminaries are the same bouts on every device, whatever their main event (only a clashing name changes)', () => {
    for (let day = 1; day < 80; day++) {
      const theirs = undercardFor('pikine', day, 'gala', ['Moussa', 'Gora Sène']), ours = undercardFor('pikine', day, 'gala', ['Modou Faye', 'Pape Diouf']);
      expect(theirs.map(p => [p.style, p.level, p.seed, p.left.from, p.right.from, p.look])).toEqual(ours.map(p => [p.style, p.level, p.seed, p.left.from, p.right.from, p.look]));
      for (const [u, avoid] of [[theirs, ['Moussa', 'Gora']], [ours, ['Modou', 'Pape']]] as const) {
        const names = u.flatMap(p => [p.left.name, p.right.name]);
        expect(new Set(names).size).toBe(names.length);
        for (const n of names) expect(avoid).not.toContain(n);
      }
    }
  });
  it('their result in the stands, from what they sent: won, lost, a draw, an abandon', () => {
    unknownPhrases.clear();
    expect(g(ARENA.friendResult('Moussa', true, 'projection'))).toMatch(/^Moussa l’emporte par chute ! · Le public : « Daan na ! »/);
    expect(ARENA.friendResult('Moussa', false, 'decision')).toBe('Moussa s’incline aux points.');
    expect(ARENA.friendResult('Moussa', null, 'egalite')).toBe('Match nul pour Moussa.');
    expect(ARENA.friendResult('Moussa', null, 'abandon')).toBe('Abandon : Moussa s’arrête là.');
    expect(ARENA.friendBill('Moussa')).toMatch(/Moussa est le combat de la soirée/);
    expect([...unknownPhrases]).toEqual([]);
  });
});

describe('their corner waits for the preliminaries and the ceremony', () => {
  afterEach(() => { vi.useRealTimers(); arenaFighter.hold(null); });
  it('held by the show, « Je suis prêt » asks it to move on; released, they walk out', () => {
    vi.useFakeTimers({ toFake: ['performance'] });
    const cx = 30, cz = -30, pos = { x: 0, y: 0, z: 0 }, toasts: string[] = [], walks: (string | null)[] = [];
    const hub = { id: 'pikine', arena: { cx, cz, r: 19 }, interactables: [] as unknown[] };
    const ctx = {
      state: { data: { flags: ['ecurie_baobab'] } }, day: () => 40, world: () => hub, toast: (m: string) => toasts.push(m), walkTo: (id: string | null) => walks.push(id),
      player: { pos, place: (x: number, z: number) => { pos.x = x; pos.z = z; } }, mode: () => 'play', startBout: () => true, places: { add: () => {} },
    } as unknown as GameCtx;
    fighterModule.init!(ctx); fighterModule.hubLoaded!(ctx, hub as never);
    let held = true, ready = 0;
    arenaFighter.hold({ held: () => held, ready: () => { ready++; } });
    expect(arenaFighter.begin({ mode: 'classe', opponent: 'Gora Sène', main: 'gala', corner: 'baobab' })).toBe(true);
    expect(arenaFighter.main()).toBe('gala');
    const s = fighterSpots(cx, cz, 'baobab');
    pos.x = s.tunnel.x; pos.z = s.tunnel.z; fighterModule.update!(ctx, 0.1);
    expect(arenaFighter.phase()).toBe('tunnel');
    pos.x = s.corner.x; pos.z = s.corner.z; fighterModule.update!(ctx, 0.1);
    expect(arenaFighter.phase()).toBe('prep');
    expect(toasts.at(-1)).toMatch(/préliminaires d’abord/);
    vi.advanceTimersByTime(20000); fighterModule.update!(ctx, 0.1);
    expect(arenaFighter.phase()).toBe('prep');                                                     // held past the usual moment
    held = false; fighterModule.update!(ctx, 0.1);
    expect(arenaFighter.phase()).toBe('ring');                                                     // released: the walk-out
    expect(ready).toBe(0);
    arenaFighter.cancel();
  });
});
