import { describe, it, expect } from 'vitest';
import { GameState } from '../src/core/state';
import { newSave, migrate, STARTER_HOME } from '../src/core/save';
import { ECONOMY } from '../src/economy/config';
import { specOf } from '../src/economy/catalog';
import { accrue, assetByUid, buyAsset, chargesPerHour, currentHome, furnitureIn, holding, incomePerHour, moveIn, rentAsset, roomReturned, saleValue, setLeased } from '../src/economy/assets';
import { deliverFurniture } from '../src/economy/furniture';
import { contractOf, offer, setNotice, signLease } from '../src/economy/monthly';
import { asked, cannotMoveAndLeave, decide, followers, forgetGone, leaveOptions, markAsked, moveAndLeave, question, standing, type LeaveChoice } from '../src/economy/moving';

const F2 = 'appart_jamm', HOUSE = 'maison_cite';
const rich = (wallet = 40_000_000) => { const s = new GameState(newSave(0)); s.data.wallet = wallet; return s; };
const back = (s: GameState) => new GameState(migrate(JSON.parse(JSON.stringify(s.data)))!);
const ids = (s: GameState, uid: string) => leaveOptions(s, assetByUid(s, uid)!, 'elsewhere').map(o => o.id);
const opt = (s: GameState, uid: string, id: LeaveChoice, livingIn: string | null = 'elsewhere') => leaveOptions(s, assetByUid(s, uid)!, livingIn).find(o => o.id === id)!;
/** Every piece of furniture, with the home it is in (which must exist): nothing is ever lost by a move. */
const pieces = (s: GameState) => s.data.assets.list.filter(a => a.home).map(a => ({ uid: a.uid, home: a.home!, there: !!assetByUid(s, a.home!) }));
const nbsp = (t: string) => t.replace(/[  ]/g, ' ');

describe('the home left: one choice each, with its money', () => {
  it('the family room: keep it (free, the default) or give it back', () => {
    const s = rich(), room = currentHome(s);
    expect(ids(s, room.uid)).toEqual(['keep_room', 'return_room']);
    expect(opt(s, room.uid, 'keep_room')).toMatchObject({ right: 'gratuit', why: null, preset: true });
    expect(opt(s, room.uid, 'return_room').why).toBeNull();                       // read as if already living elsewhere
    expect(leaveOptions(s, room)).toEqual([]);                                      // the home lived in has nothing to leave
  });
  it('a home rented by the day: hand the keys back (the rent stops) or keep the lease (its rent said by the day and the hour)', () => {
    const s = rich(), h = rentAsset(s, HOUSE)!;
    expect(ids(s, h.uid)).toEqual(['end_lease', 'keep_lease']);
    expect(nbsp(opt(s, h.uid, 'end_lease').right)).toBe('0 F / jour');
    expect(nbsp(opt(s, h.uid, 'keep_lease').right)).toBe('−16 700 F / jour');
    expect(nbsp(opt(s, h.uid, 'keep_lease').detail)).toMatch(/696 F chaque heure en ville/);
  });
  it('the F2 by the month: hand the keys back, keep the lease (60 000 F a month) or sublet it, occupancy never guaranteed', () => {
    const s = rich(), f2 = signLease(s, F2)!;
    expect(ids(s, f2.uid)).toEqual(['end_lease', 'keep_lease', 'sublet']);
    expect(nbsp(opt(s, f2.uid, 'keep_lease').right)).toBe('−60 000 F / mois');
    const sub = opt(s, f2.uid, 'sublet');
    expect(nbsp(sub.right)).toBe('jusqu’à +60 000 F / mois');
    expect(sub.detail).toMatch(/80 % d’occupation en moyenne, jamais garanti/);
    expect(sub.why).toBeNull();
    expect(opt(s, f2.uid, 'sublet', s.data.assets.home).why).toBeNull();            // (the room is lived in: the F2 is free to offer)
  });
  it('an owned home: let it (the existing letting), sell it (its resale value), or keep it empty (what it still costs)', () => {
    const s = rich(200_000_000), f2 = buyAsset(s, F2)!, house = buyAsset(s, HOUSE)!;
    expect(ids(s, f2.uid)).toEqual(['let', 'sell', 'keep_empty']);
    expect(nbsp(opt(s, f2.uid, 'let').right)).toBe(`+${specOf(F2)!.income} F / h`);
    expect(nbsp(opt(s, f2.uid, 'sell').right)).toBe('+13 500 000 F');
    expect(saleValue(f2)).toBe(13_500_000);
    expect(nbsp(opt(s, f2.uid, 'keep_empty').right)).toBe('0 F / h');
    expect(nbsp(opt(s, house.uid, 'keep_empty').right)).toBe('−100 F / h');           // the family house's upkeep goes on, empty or not
    expect(opt(s, house.uid, 'keep_empty').detail).toMatch(/charges continuent/);
  });
});

describe('« Emménager »: the move and the choice in one step', () => {
  it('bought from the family room, moved in, the room kept: the furniture followed, the room is a family room, both homes were asked', () => {
    const s = rich(), room = currentHome(s);
    for (const id of ['chaises', 'radio', 'tapis']) deliverFurniture(s, id);
    const n = followers(s, room).length, all = pieces(s).length;
    const f2 = buyAsset(s, F2)!;
    const r = moveAndLeave(s, f2.uid, 'keep_room')!;
    expect(r.moved).toBe(n); expect(n).toBeGreaterThanOrEqual(3);
    expect(s.data.assets.home).toBe(f2.uid);
    expect(furnitureIn(s, f2.uid).length).toBeGreaterThanOrEqual(n);
    expect(roomReturned(s)).toBe(false);
    expect(asked(s, f2.uid) && asked(s, room.uid)).toBe(true);
    expect(pieces(s).length).toBe(all); expect(pieces(s).every(p => p.there)).toBe(true);
  });
  it('the room given back in the same step', () => {
    const s = rich(), f2 = buyAsset(s, F2)!;
    expect(moveAndLeave(s, f2.uid, 'return_room')).toBeTruthy();
    expect(roomReturned(s)).toBe(true);
    expect(currentHome(s).uid).toBe(f2.uid);
  });
  it('from the owned F2 to a rented house: let the F2 (it earns), sell it (paid once), or keep it empty', () => {
    for (const choice of ['let', 'sell', 'keep_empty'] as const) {
      const s = rich(), f2 = buyAsset(s, F2)!;
      deliverFurniture(s, 'chaises');
      moveAndLeave(s, f2.uid, 'keep_room');
      const house = rentAsset(s, HOUSE)!, all = pieces(s).length, w0 = s.wallet;
      const r = moveAndLeave(s, house.uid, choice)!;
      expect(r.choice).toBe(choice);
      expect(s.data.assets.home).toBe(house.uid);
      if (choice === 'let') { expect(assetByUid(s, f2.uid)!.leased).toBe(true); expect(incomePerHour(s)).toBe(specOf(F2)!.income); }
      if (choice === 'sell') { expect(assetByUid(s, f2.uid)).toBeUndefined(); expect(s.wallet - w0).toBe(13_500_000); expect(r.money).toBe(13_500_000); }
      if (choice === 'keep_empty') { const a = assetByUid(s, f2.uid)!; expect(a.how).toBe('owned'); expect(a.leased).toBe(false); expect(furnitureIn(s, f2.uid)).toHaveLength(0); }
      expect(pieces(s).length).toBe(all); expect(pieces(s).every(p => p.there)).toBe(true);    // the chair is in the house, whatever became of the F2
      expect(furnitureIn(s, house.uid).some(f => f.spec === 'chaises')).toBe(true);
    }
  });
  it('from a rented house: hand the keys back (the rent stops) or keep the lease (the rent goes on)', () => {
    for (const choice of ['end_lease', 'keep_lease'] as const) {
      const s = rich(), house = rentAsset(s, HOUSE)!;
      moveAndLeave(s, house.uid, 'keep_room');
      deliverFurniture(s, 'radio');
      const f2 = buyAsset(s, F2)!;
      expect(chargesPerHour(s)).toBe(Math.round(16_700 / 24));
      moveAndLeave(s, f2.uid, choice);
      if (choice === 'end_lease') { expect(holding(s, HOUSE)).toBeUndefined(); expect(chargesPerHour(s)).toBe(0); }
      else { expect(holding(s, HOUSE)?.how).toBe('rented'); expect(chargesPerHour(s)).toBe(Math.round(16_700 / 24)); }
      expect(furnitureIn(s, f2.uid).some(f => f.spec === 'radio')).toBe(true);
    }
  });
  it('from the F2 by the month: sublet it (the tenant model), hand the keys back, or keep it', () => {
    for (const choice of ['sublet', 'end_lease', 'keep_lease'] as const) {
      const s = rich(), f2 = signLease(s, F2)!;
      moveAndLeave(s, f2.uid, 'keep_room');
      const house = rentAsset(s, HOUSE)!;
      expect(moveAndLeave(s, house.uid, choice)).toBeTruthy();
      const c = contractOf(s, f2.uid);
      if (choice === 'sublet') expect(c?.lease.mode).toBe('sublet');
      if (choice === 'end_lease') expect(c).toBeNull();
      if (choice === 'keep_lease') expect(c?.lease.mode).toBe('live');
    }
  });
  it('a choice that is refused leaves everything as it was: no half move', () => {
    const s = rich(), f2 = signLease(s, F2)!;
    moveAndLeave(s, f2.uid, 'keep_room');
    setNotice(s, f2.uid, true);                                                     // notice given: the F2 can no longer be offered
    const house = rentAsset(s, HOUSE)!, before = JSON.stringify(s.data.assets);
    expect(cannotMoveAndLeave(s, house.uid, 'sublet')).toMatch(/congé/);
    expect(moveAndLeave(s, house.uid, 'sublet')).toBeNull();
    expect(moveAndLeave(s, house.uid, 'sell')).toBeNull();                          // a rented home is not the player's to sell
    expect(JSON.stringify(s.data.assets)).toBe(before);
    expect(s.data.assets.home).toBe(f2.uid);
  });
  it('a home already lived in, or one let to someone, cannot be moved into twice', () => {
    const s = rich(), f2 = buyAsset(s, F2)!;
    moveAndLeave(s, f2.uid, 'keep_room');
    expect(cannotMoveAndLeave(s, f2.uid, 'keep_room')).toMatch(/Tu y habites déjà/);
    const room = holding(s, STARTER_HOME)!;
    moveAndLeave(s, room.uid, 'let');
    expect(assetByUid(s, f2.uid)!.leased).toBe(true);
    expect(cannotMoveAndLeave(s, f2.uid, 'keep_room')).toMatch(/loué à quelqu’un/);
  });
  it('a sale and a re-purchase start again with a new home asked again (the marks go with the home)', () => {
    const s = rich(), f2 = buyAsset(s, F2)!;
    moveAndLeave(s, f2.uid, 'keep_room');
    moveAndLeave(s, holding(s, STARTER_HOME)!.uid, 'sell');
    expect(asked(s, f2.uid)).toBe(true);
    forgetGone(s);
    expect(s.data.flags.some(f => f === `logement:${f2.uid}`)).toBe(false);
    const again = buyAsset(s, F2)!;
    expect(again.uid).not.toBe(f2.uid);
    expect(question(s, again)).toBe('move');
  });
});

describe('the question, put once (older saves get it on the home\'s sheet, never at load)', () => {
  it('a save from before 1.0.1 that owns the F2 and still lives in the room: « Emménager maintenant ? », once', () => {
    const s = rich(), f2 = buyAsset(s, F2)!;                                        // bought by an older client: nothing was asked
    const t = back(s);
    expect(question(t, assetByUid(t, f2.uid)!)).toBe('move');
    markAsked(t, f2.uid);
    expect(question(t, assetByUid(t, f2.uid)!)).toBeNull();
    expect(question(back(t), assetByUid(back(t), f2.uid)!)).toBeNull();            // the mark is a story flag: it survives a save
  });
  it('a save that lives in the F2 and still rents the house: what to do with the house; the room too; nothing for a home already let or lived in', () => {
    const s = rich(200_000_000), f2 = buyAsset(s, F2)!, house = rentAsset(s, HOUSE)!, room = holding(s, STARTER_HOME)!;
    moveIn(s, f2.uid, true);                                                        // an older client moved without asking
    expect(question(s, house)).toBe('leave');
    expect(question(s, room)).toBe('leave');
    expect(question(s, f2)).toBeNull();
    const land = buyAsset(s, 'parcelle_150')!;
    expect(question(s, land)).toBeNull();                                           // only homes
    const other = buyAsset(s, 'f3_filaos')!; setLeased(s, other.uid, true);
    expect(question(s, other)).toBeNull();                                          // let: the player chose
  });
  it('answered without moving: let, sell or hand back; refused when lived in', () => {
    const s = rich(200_000_000), f2 = buyAsset(s, F2)!, house = rentAsset(s, HOUSE)!;
    moveIn(s, house.uid, true);
    expect(decide(s, house.uid, 'end_lease')).toBeNull();                           // lived in: nothing to decide
    expect(decide(s, f2.uid, 'let')).toBe(0);
    expect(assetByUid(s, f2.uid)!.leased).toBe(true);
    expect(asked(s, f2.uid)).toBe(true);
    expect(decide(s, f2.uid, 'sell')).toBeGreaterThan(0);
    expect(holding(s, F2)).toBeUndefined();
  });
  it('a monthly F2 on offer, or the room given back, has nothing left to ask', () => {
    const s = rich(), f2 = signLease(s, F2)!, house = rentAsset(s, HOUSE)!;
    moveAndLeave(s, house.uid, 'return_room');
    expect(question(s, holding(s, STARTER_HOME)!)).toBeNull();
    const t = rich(); const g = signLease(t, F2)!; const h = rentAsset(t, HOUSE)!; moveIn(t, h.uid, true);
    expect(offer(t, g.uid, 'sublet')).toBe(true);
    expect(question(t, g)).toBeNull();
    expect(f2).toBeTruthy();
  });
  it('how a home stands, in a few words', () => {
    const s = rich(), f2 = buyAsset(s, F2)!, house = rentAsset(s, HOUSE)!;
    expect(standing(s, holding(s, STARTER_HOME)!)).toMatch(/prêtée par la famille/);
    expect(standing(s, f2)).toBe('à toi');
    expect(nbsp(standing(s, house))).toBe('loué par toi · 16 700 F / jour');
    accrue(s);
    expect(ECONOMY.property.saleShare).toBe(0.9);
  });
});
