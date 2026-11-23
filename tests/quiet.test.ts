import { describe, it, expect } from 'vitest';
import { ANSWER_MS, QuietLog, ago, centreZone, lineMs, overlaps, route, speechOf } from '../src/ui/quiet';
import { PlaceEvents, eventRank, eventText, placeEvents } from '../src/ui/placeEvent';
import { MOMENT_QUEUE, momentArrives } from '../src/ui/moments';
import { CALL_FROM, eveningEvent } from '../src/arena/eveningCall';
import { GALA } from '../src/arena/program';
import { GalaCard } from '../src/arena/card';
import { RideCard } from '../src/transport/ui';
import { ARENA } from '../src/i18n/lines';
import { announceLine } from '../src/arena/ceremony';

/**
 * A quiet screen (Habib, 12 Oct; docs/UI_V2_PLAN.md §0 C): spoken lines become one subtitle, refusals and answers one
 * line by the action button, everything else the quiet log (the phone's Notifications); the event cards collapse into
 * the place chip; one moment card at a time; nothing over the middle of the screen.
 */
describe('what the game says: a subtitle, a line by the button, or the quiet log', () => {
  it('spoken lines are recognised with their speaker — quoted words, the microphone, the people who speak unquoted', () => {
    expect(speechOf('Le contrôleur : « Xaaral tuuti ! » (attends un peu) · Il faut un billet : le guichet est à gauche de la porte.'))
      .toEqual({ icon: '', who: 'Le contrôleur', sep: ' : ', line: '« Xaaral tuuti ! » (attends un peu) · Il faut un billet : le guichet est à gauche de la porte.' });
    expect(speechOf(ARENA.ticket(1000))?.who).toBe('Le guichetier');
    const mic = speechOf('🎤 L’annonceur : À ma gauche, pour l’écurie Baobab, venu de Pikine… Malick ! 6 victoires, 4 défaites, 2 nuls !');
    expect(mic).toMatchObject({ icon: '🎤', who: 'L’annonceur' });
    expect(speechOf('DJ Mbaye : « Ba beneen yoon ! »')?.who).toBe('DJ Mbaye');
    expect(speechOf('Coach Ablaye : Baax na ! C’est la base de la lutte avec frappe.')?.who).toBe('Coach Ablaye');
    // notices that look alike are not speech
    for (const m of ['Nouvelle cliente : Awa, du Salon Awa. Elle te recommandera.', 'Livraison réussie ✓ +2 200 F', 'Nouveau palier : Réputation 3',
      'Ton billet est pour la Tribune couverte (grands côtés) : cette place est en Populaire.', 'Pas assez d’argent'])
      expect(speechOf(m), m).toBeNull();
  });
  it('the announcer\'s line of Habib\'s screenshot is a subtitle, his name first', () => {
    const line = announceLine({ id: 'malick', name: 'Malick', ecurie: 'Baobab' } as Parameters<typeof announceLine>[0], 'left', { v: 6, d: 4, n: 2 });
    expect(route(line, 'info', Infinity)).toBe('say');
    expect(speechOf(line)?.who).toBe('L’annonceur');
  });
  it('a refusal, or the answer to what the player just did, goes by the button; anything else to the quiet log', () => {
    expect(route('Pas assez d’argent', 'warn', Infinity)).toBe('now');
    expect(route('Tu as déjà ton billet pour ce soir : entre par la porte de l’arène.', 'info', 120)).toBe('now');
    expect(route('Tu as déjà ton billet pour ce soir : entre par la porte de l’arène.', 'info', ANSWER_MS + 1)).toBe('log');
    expect(route('Jus de bouye frais ✓  −500 F', 'info', 6000)).toBe('log');
    expect(route('Livraison réussie ✓ +2 200 F · Nouvelle cliente : Awa, du Salon Awa. Elle te recommandera.', 'info', 9000)).toBe('log');
    expect(route('Le guichetier : « 1 000 F, jërëjëf ! »', 'info', 0)).toBe('say');           // speech stays a subtitle
  });
  it('a line stays long enough to be read, and never more than 7 s', () => {
    expect(lineMs('Arrêté')).toBe(2600);
    expect(lineMs('x'.repeat(100))).toBe(5900);
    expect(lineMs('x'.repeat(400))).toBe(7000);
  });
});

describe('the middle of the screen', () => {
  it('is the centred 40 % of the width and 33 %–62 % of the height, on desktop and on a phone either way', () => {
    expect(centreZone(1280, 720)).toEqual({ left: 384, right: 896, top: 238, bottom: 446 });
    expect(centreZone(390, 844)).toEqual({ left: 117, right: 273, top: 279, bottom: 523 });
    expect(centreZone(844, 390)).toEqual({ left: 253, right: 591, top: 129, bottom: 242 });
  });
  it('overlap is strict', () => {
    const z = centreZone(1280, 720);
    expect(overlaps({ left: 910, right: 1270, top: 162, bottom: 560 }, z)).toBe(false);   // the moment card on the right
    expect(overlaps({ left: 896, right: 1000, top: 300, bottom: 320 }, z)).toBe(false);   // touching the edge
    expect(overlaps({ left: 500, right: 780, top: 172, bottom: 240 }, z)).toBe(true);     // the old gala toast column, under the card
  });
});

describe('the quiet log (the phone\'s Notifications)', () => {
  it('keeps the newest first, counts what is unseen, merges a notice repeated at once, and is read in the phone', () => {
    const log = new QuietLog(); let calls = 0; log.on(() => calls++);
    log.add('Achat : radio', 'info', 1000); log.add('Livraison réussie ✓ +1 200 F', 'info', 2000); log.add('Livraison réussie ✓ +1 200 F', 'info', 3000);
    expect(log.entries.map(e => e.text)).toEqual(['Livraison réussie ✓ +1 200 F', 'Achat : radio']);
    expect(log.unread).toBe(2); expect(calls).toBe(3);
    log.markRead(); expect(log.unread).toBe(0);
    for (let i = 0; i < 80; i++) log.add(`n°${i}`, 'info', 10_000 + i * 5000);
    expect(log.entries.length).toBe(log.max); expect(log.unread).toBe(log.max); expect(log.entries[0].text).toBe('n°79');
    expect([ago(10_000), ago(5 * 60_000), ago(3 * 3_600_000)]).toEqual(['à l’instant', 'il y a 5 min', 'il y a 3 h']);
  });
});

describe('event cards collapse into the place chip', () => {
  it('being carried somewhere comes first, then the show, then tonight\'s call; cleared, the next one shows', () => {
    const ev = new PlaceEvents(); let calls = 0; ev.on(() => calls++);
    ev.set('evening', { tag: 'CE SOIR', line: 'Grand gala de lutte · portes 17 h' });
    ev.set('gala', { tag: 'LÀMB', line: 'Entrée des lutteurs · Malick – Assane' });
    expect(ev.current()?.source).toBe('gala');
    ev.set('ride', { tag: '23', line: '23 · vers Pikine', sub: 'Prochain arrêt : Arène · 40 s' });
    expect(ev.current()?.source).toBe('ride');
    ev.set('ride', { tag: '23', line: '23 · vers Pikine', sub: 'Prochain arrêt : Arène · 40 s' });   // the same: nothing to repaint
    expect(calls).toBe(3);
    ev.set('ride', null); expect(ev.current()?.source).toBe('gala');
    ev.set('gala', null); expect(ev.current()?.ev.tag).toBe('CE SOIR');
    expect(eventRank('taxi-card') < eventRank('gala') && eventRank('gala') < eventRank('evening')).toBe(true);
  });
  it('the gala card and the ride cards set their event and keep their text for the checks', () => {
    const g = new GalaCard();
    g.show({ title: 'Gala de làmb · Arène de Pikine', sub: 'Entrée des lutteurs · Malick (Écurie Baobab) – Assane (Écurie Teranga)' });
    expect(placeEvents.get('gala')).toMatchObject({ tag: 'LÀMB', line: 'Entrée des lutteurs · Malick (Écurie Baobab) – Assane (Écurie Teranga)', more: ['Gala de làmb · Arène de Pikine'] });
    expect(g.text).toMatch(/Gala de làmb.*Entrée des lutteurs · Malick /);
    g.dispose(); expect(placeEvents.get('gala')).toBeNull(); expect(g.text).toBe('');
    const r = new RideCard(null, 'taxi-card');
    r.show({ num: '🚕', title: 'Taxi → Almadies', sub: 'Arrivée dans ≈ 40 s', req: 'Arrêt demandé' });
    expect(placeEvents.get('taxi-card')).toMatchObject({ tag: '🚕', line: 'Taxi → Almadies', sub: 'Arrivée dans ≈ 40 s', alert: 'Arrêt demandé', tone: 'ride' });
    expect(eventText(placeEvents.get('taxi-card'))).toBe('🚕 Taxi → Almadies Arrivée dans ≈ 40 s Arrêt demandé');
    expect(r.text).toMatch(/Taxi → Almadies/);
    r.show(null); expect(placeEvents.get('taxi-card')).toBeNull();
  });
  it('tonight\'s call: from half an hour before the doors until the bout is over, with the ticket or « Billet en poche »', () => {
    expect(eveningEvent(CALL_FROM - 0.1, false, 'gala', false, null)).toBeNull();
    expect(eveningEvent(CALL_FROM, false, 'gala', false, null)).toMatchObject({ tag: 'CE SOIR', line: `Grand gala de lutte · portes ${GALA.doors} h`, tone: 'evening' });
    expect(eveningEvent(GALA.doors + 0.5, false, 'card', true, 'Malick combat ce soir')).toMatchObject({ line: `Combat de quartier · portes ${GALA.doors} h`, sub: 'Billet en poche : entre par la porte de l’arène', more: ['Malick combat ce soir'] });
    expect(eveningEvent(GALA.doors + 0.5, true, 'gala', true, null)).toBeNull();                   // tonight's bout seen to the end
  });
});

describe('moment cards, one at a time', () => {
  it('a new card replaces the one on screen, except that a recap waits for the after-bout card to go', () => {
    expect(momentArrives(null, 'moment')).toBe('show');
    expect(momentArrives('moment', 'moment')).toBe('show');
    expect(momentArrives('moment', 'bout')).toBe('show');
    expect(momentArrives('bout', 'bout')).toBe('show');
    expect(momentArrives('bout', 'moment')).toBe('wait');
    expect(MOMENT_QUEUE).toBeLessThanOrEqual(2);
  });
});
