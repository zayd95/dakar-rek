import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import { Seats } from '../src/interact/seats';
import { ActivityRunner, type ActivityServices } from '../src/activity/runner';
import { KIND_ICON, KIND_LABEL, WEAR, specOf } from '../src/economy/catalog';
import { assetsOf, holding, holds, sellAsset } from '../src/economy/assets';
import { WORN_COUNTER, cannotTakeGear, fanOf, setWorn, takeGear, worn } from '../src/economy/wear';
import { ECURIES, SUPPORTERS_STALL, vendorPlaces } from '../src/arena/exteriorRules';
import { answersCheer, flagGeometry, gearColours, raisesFlag, scarfGeometry, sectionEcurie, sideOfEcurie } from '../src/arena/supporterGear';
import { ECURIE_LOOK } from '../src/crowd/looks';

const arena = { cx: 100, cz: 50 };
function rig(wallet = 20000) {
  const state = new GameState(newSave()); state.data.wallet = wallet;
  const seats = new Seats(), toasts: string[] = [];
  const s: ActivityServices = { state, seats, space: () => 'street', player: () => ({ x: 0, z: 0 }), seated: () => null, sit: () => false, clip: () => {}, busy: () => {}, progress: () => {}, toast: t => { toasts.push(t); }, save: () => {} };
  return { state, runner: new ActivityRunner(s), toasts };
}
const run = (r: ActivityRunner, seconds: number) => { for (let t = 0; t < seconds; t += 0.25) r.update(0.25); };
const colours = (g: THREE.BufferGeometry) => { const c = g.attributes.color, out = new Set<string>(); for (let i = 0; i < c.count; i++) out.add(new THREE.Color(c.getX(i), c.getY(i), c.getZ(i)).getHexString()); return out; };

describe('a supporter\'s colours: what is sold (src/economy/catalog.ts WEAR)', () => {
  it('a scarf, a cap, a small flag and a tee for each of the two (fictional) écuries, priced, owned like any good', () => {
    expect(WEAR).toHaveLength(8);
    for (const e of ECURIES) for (const item of ['scarf', 'cap', 'flag', 'tee']) {
      const w = WEAR.find(x => x.ecurie === e.id && x.item === item)!;
      expect(w.kind).toBe('wear'); expect(w.name).toContain(e.name); expect(w.price).toBeGreaterThan(0);
      expect(specOf(w.id)).toBe(w);
    }
    expect(KIND_LABEL.wear).toBe('Couleurs de supporter'); expect(KIND_ICON.wear).toBe('🧣');
    expect(new Set(WEAR.map(w => w.id)).size).toBe(8);
  });
  it('in the stands\' colours: Baobab green and yellow (B–C), Teranga red and white (F–G)', () => {
    expect(gearColours('baobab')).toEqual({ main: ECURIE_LOOK.left.main, accent: ECURIE_LOOK.left.accent });
    expect(gearColours('teranga')).toEqual({ main: ECURIE_LOOK.right.main, accent: ECURIE_LOOK.right.accent });
    expect(gearColours('baobab')).toEqual({ main: 0x1a7a44, accent: 0xf4c20d });
    expect(gearColours('teranga')).toEqual({ main: 0xc8322a, accent: 0xf2f2ec });
    for (const e of ECURIES) expect(gearColours(e.id).main).toBe(e.colour);                 // the exterior's fans wear the same
    const scarf = colours(scarfGeometry(0x1a7a44, 0xf4c20d)), flag = colours(flagGeometry(0xc8322a, 0xf2f2ec));
    expect([...scarf].sort()).toEqual(['1a7a44', 'f4c20d']);
    expect(flag.has('c8322a') && flag.has('f2f2ec')).toBe(true);
    expect([...colours(scarfGeometry())]).toEqual(['ffffff']);                               // the fans' instanced scarves: white, tinted per fan
  });
});

describe('the supporters\' stall « Couleurs du Géew »: price shown, paid once, the piece owned and worn', () => {
  it('buying a scarf: −2 000 F once, listed in « Biens », worn; a second one is refused; another piece replaces it on the body', () => {
    const r = rig(), s = r.state;
    const hooks = { gear: (id: string) => { takeGear(s, id); }, owns: (id: string) => holds(s, id) };
    const stall = vendorPlaces('pikine', arena, hooks)[2];
    expect(stall.name).toBe(SUPPORTERS_STALL);
    const scarf = stall.offers.stall.find(o => o.id === 'echarpe_baobab')!;
    expect(scarf.price).toBe(2000);                                                          // shown on the row before choosing
    r.runner.start(scarf); run(r.runner, 8);
    expect(s.wallet).toBe(18000);
    expect(holds(s, 'echarpe_baobab')).toBe(true);
    expect(assetsOf(s, 'wear').map(a => a.spec)).toEqual(['echarpe_baobab']);
    expect(worn(s)?.id).toBe('echarpe_baobab');
    expect(fanOf(worn(s))).toEqual({ e: 'baobab', k: 'scarf' });
    // one of each: the offer says why, nothing is charged
    expect(r.runner.blocked(scarf)).toMatch(/Déjà à toi/);
    // a flag of the other side: worn instead, both owned
    const flag = stall.offers.stall.find(o => o.id === 'drapeau_teranga')!;
    r.runner.start(flag); run(r.runner, 8);
    expect(s.wallet).toBe(16500);
    expect(worn(s)?.id).toBe('drapeau_teranga');
    expect(assetsOf(s, 'wear').map(a => a.spec).sort()).toEqual(['drapeau_teranga', 'echarpe_baobab']);
    // the purchases are on the wallet's history, once each
    expect(s.data.ledger.filter(l => /Écharpe Baobab|Petit drapeau Teranga/.test(l.label))).toHaveLength(2);
  });
  it('worn one at a time, only what one owns; sold, it is no longer worn', () => {
    const r = rig(), s = r.state;
    expect(setWorn(s, 'maillot_baobab')).toBe(false);                                        // not the player's
    expect(cannotTakeGear(s, 'maillot_baobab')).toBeNull(); expect(cannotTakeGear(s, 'chapeau')).toBe('Inconnu');
    takeGear(s, 'maillot_baobab'); takeGear(s, 'casquette_teranga');
    expect(worn(s)?.id).toBe('casquette_teranga');
    expect(setWorn(s, 'maillot_baobab')).toBe(true); expect(worn(s)?.id).toBe('maillot_baobab');
    expect(setWorn(s, null)).toBe(true); expect(worn(s)).toBeNull(); expect(fanOf(worn(s))).toBeNull();
    setWorn(s, 'maillot_baobab');
    expect(sellAsset(s, holding(s, 'maillot_baobab')!.uid)).toBeGreaterThan(0);
    expect(worn(s)).toBeNull();
    expect(s.data.counters[WORN_COUNTER]).toBeGreaterThan(0);                                // the counter stays; the piece is gone
  });
});

describe('in the stands: who answers, when the flag goes up (cosmetic only)', () => {
  it('sections B–C are Baobab\'s, F–G Teranga\'s, the others mixed', () => {
    expect(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(sectionEcurie)).toEqual([null, 'baobab', 'baobab', null, null, 'teranga', 'teranga', null]);
    expect(sectionEcurie(null)).toBeNull(); expect(sideOfEcurie('baobab')).toBe('left'); expect(sideOfEcurie('teranga')).toBe('right');
  });
  it('« Encourager » makes the neighbours answer only in one\'s own écurie\'s section, wearing its colours', () => {
    const fan = { e: 'baobab' as const, k: 'tee' as const };
    expect(answersCheer(fan, { kind: 'stand', section: 'B' })).toBe(true);
    expect(answersCheer(fan, { kind: 'stand', section: 'F' })).toBe(false);                  // the other side's section
    expect(answersCheer(fan, { kind: 'stand', section: 'A' })).toBe(false);                  // a mixed section
    expect(answersCheer(null, { kind: 'stand', section: 'B' })).toBe(false);                 // no colours
    expect(answersCheer({ e: 'none', k: 'tee' }, { kind: 'stand', section: 'B' })).toBe(false);
    expect(answersCheer(fan, { kind: 'bench', section: 'B' })).toBe(false);                  // not a place of the stands
    expect(answersCheer(fan, null)).toBe(false);
  });
  it('the flag goes up for one\'s own wrestler: his entrance, a fall he wins, his victory — never for the other one', () => {
    const flag = { e: 'teranga' as const, k: 'flag' as const };
    for (const m of ['entrance', 'fall', 'result'] as const) { expect(raisesFlag(flag, m, 'right')).toBe(true); expect(raisesFlag(flag, m, 'left')).toBe(false); }
    expect(raisesFlag(flag, 'clinch', 'right')).toBe(false); expect(raisesFlag(flag, 'decision', 'right')).toBe(false); expect(raisesFlag(flag, 'result', null)).toBe(false);
    expect(raisesFlag({ e: 'teranga', k: 'scarf' }, 'entrance', 'right')).toBe(false);      // only a flag goes up
  });
  it('wearing the colours changes no need, no money and no counter but the one saying what is worn', () => {
    const r = rig(), s = r.state;
    takeGear(s, 'echarpe_teranga');
    const before = JSON.stringify({ needs: s.data.needs, wallet: s.data.wallet, counters: Object.keys(s.data.counters).filter(k => k !== WORN_COUNTER && k !== 'biens') });
    setWorn(s, null); setWorn(s, 'echarpe_teranga');
    expect(JSON.stringify({ needs: s.data.needs, wallet: s.data.wallet, counters: Object.keys(s.data.counters).filter(k => k !== WORN_COUNTER && k !== 'biens') })).toBe(before);
  });
});
