import { describe, expect, it } from 'vitest';
import { GameState } from '../src/core/state';
import { newSave } from '../src/core/save';
import { Relations } from '../src/social/relations';
import { creditWork } from '../src/economy/streak';
import { contextualShortcut, debtsNow, highlights, historyRows, missionNow, residenceLine, statRows, streakChip, streakView } from '../src/ui/phone/selectors';
import { APPS, GROUPS, homeLayout } from '../src/ui/phone/registry';
import { phoneHooks } from '../src/ui/phoneHooks';
import { dayName } from '../src/ui/phone/apps/home';
import { placeClock } from '../src/arena/eveningCall';

/** The phone's selectors (src/ui/phone/selectors.ts): what its screens show, read from the save — never a second copy of the game's numbers. */
const fresh = () => { const s = new GameState(newSave(0)); s.data.play = { day: 1, city: 10 }; return s; };

describe('phone: the player\'s life hub', () => {
  it('the residence line is the « domicile principal », named from the catalogue', () => {
    const r = residenceLine(fresh());
    expect(r).toMatchObject({ label: 'Domicile principal', name: 'Ta chambre', where: 'Pikine', how: 'prêté par la famille', hub: 'pikine' });
  });

  it('the streak chip reads the economy\'s own run: « Série 0 j », then « 🔥 N j », today marked', () => {
    const s = fresh();
    expect(streakView(s.data)).toMatchObject({ run: 0, chip: 'Série 0 j', today: false, next: 2 });
    creditWork(s.data.streak, 1, 60_000);
    expect(streakView(s.data)).toMatchObject({ run: 1, chip: '🔥 1 j', today: true, next: 2 });
    s.data.play.day = 2;                                                    // the next day begins: the run holds, today does not count yet
    expect(streakView(s.data)).toMatchObject({ run: 1, today: false });
    expect([streakChip(0), streakChip(3), streakChip(7)]).toEqual(['Série 0 j', '🔥 3 j', '🔥 7 j']);
  });

  it('one contextual shortcut at most, only when relevant', () => {
    const s = fresh(), at = { hub: 'pikine' as const, hour: 12, homeHub: 'pikine' as const, inside: false };
    expect(contextualShortcut(s, at)).toBeNull();
    expect(contextualShortcut(s, { ...at, hour: 23, hub: 'plateau' as never })?.id).toBe('home');
    s.data.jobs.active = { runId: 'r1', routeId: 'nope', hub: 'pikine', stage: 'pickup', pay: 1500, startedMs: 0, limitMs: 0 };
    expect(contextualShortcut(s, at)?.id).toBe('follow-job');
    expect(missionNow(s)).toMatchObject({ kind: 'tiak', pay: 1500 });
    s.data.vtc.active = { id: 'v1', from: 'pikine', to: 'plateau', pickup: { x: 0, z: 0, name: 'Gare' }, dropoff: { x: 0, z: 0, name: 'Banque' }, fare: 4000, stage: 'aboard', passenger: { name: 'Awa', seed: 1 }, acceptedMs: 0 };
    expect(contextualShortcut(s, at)?.id).toBe('resume-vtc');                // a passenger in the car comes first
  });

  it('the profile shows a few highlights, the non-zero statistics, and no debt on a new game', () => {
    const s = fresh(), rel = new Relations(s.data);
    expect(highlights(s, rel).map(h => h.label)).toEqual(['Activités', 'Relations', 'Véhicule']);
    s.data.counters.meals = 3;
    const st = statRows(s);
    expect(st.shown.map(r => r.label)).toEqual(['Temps de jeu', 'Repas']);
    expect(st.zero).toContain('Livraisons Tiak Tiak');
    expect(debtsNow(s)).toBeNull();
    expect(historyRows(s, rel)).toEqual([]);
    s.data.counters.livraisons = 12; s.data.streak.seen = [2, 3];
    expect(historyRows(s, rel).map(h => h.title)).toEqual(['Série de 3 jours', 'Série de 2 jours', '10 livraisons', 'Première livraison Tiak Tiak']);
  });

  it('every app keeps a place in « Toutes les apps »', () => {
    const ids = APPS.map(a => a.id);
    for (const id of ['messages', 'notifs', 'portefeuille', 'carte', 'quartier', 'travail', 'vtc', 'credits', 'affaires', 'maison', 'biens', 'habitants', 'arene', 'cesoir', 'carnet', 'actus', 'sante', 'profil', 'horloge', 'meteo', 'calcul', 'aide', 'reglages'])
      expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(APPS.every(a => GROUPS.some(([g]) => g === a.group) && (!!a.screen !== !!a.hook))).toBe(true);
  });

  it('the status bar names the day the HUD names (one weekday for the whole game)', () => {
    for (let day = 1; day <= 15; day++) {
      const hud = placeClock(day, 10, true).clock.split(' · ')[0];             // « Mardi » on day 1 (src/arena/eveningCall.ts)
      expect(dayName(day)).toBe(hud);
      expect(dayName(day, true)).toBe(hud.slice(0, 3) + '.');
    }
    expect(dayName(1)).toBe('Mardi');
  });

  it('the home screen: a dock of four favourites, every other app in the grid (one tap), a hook app only with its module', () => {
    expect(new Set(APPS.map(a => a.home)).size).toBe(APPS.length);           // one rank each: the order never depends on the registry's own
    const bare = homeLayout();
    expect(bare.dock.map(a => a.id)).toEqual(['carte', 'travailler', 'portefeuille', 'messages']);
    expect(bare.grid.some(a => a.hook)).toBe(false);                         // no module registered here: no hook app, no empty tile
    expect(bare.grid.slice(0, 3).map(a => a.id)).toEqual(['notifs', 'profil', 'logement']);
    const keys = ['openVtc', 'openJobs', 'openAssets', 'openCredits', 'openBusiness', 'openHome', 'openPeople', 'openPlaces'] as const;
    for (const k of keys) phoneHooks[k] = () => {};
    try {
      const { dock, grid } = homeLayout();
      expect([...dock, ...grid].map(a => a.id).sort()).toEqual(APPS.map(a => a.id).sort());   // every app is on the home screen
      expect(grid.slice(0, 8).map(a => a.id)).toEqual(['notifs', 'profil', 'logement', 'vtc', 'travail', 'biens', 'banque', 'reglages']);   // what is used all day first
    } finally { for (const k of keys) delete phoneHooks[k]; }
  });
});
