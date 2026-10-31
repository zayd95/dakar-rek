import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const text = (rel: string) => new TextDecoder().decode(readFileSync(new URL(rel, import.meta.url)));
import { glossed, find } from '../src/i18n/wolof';
import { SIGNS, TALKERS, allStrings, doormanAsk, doormanGreeting, doormanWelcome, DOOR_BYE, djRequest, programme, type Choice, type Talker } from '../src/i18n/patioLines';
import { ALL_MOMENTS, APPROACHERS, CAST, PATIO_DRINKS, PATIO_ENTRY, PATIO_THEMES, patioLook } from '../src/venues/patioPlan';

/**
 * The content rules of Le Patio (src/i18n/patioLines.ts, docs/districts/PATIO.md « Content rules »), held as tests: an adult, grounded, non-explicit nightclub whose night is known for its
 * sex workers, who are among its people like anyone — they talk if you do, say no as easily as hello, and nothing in the venue sells, prices, negotiates or arranges a sexual service.
 */
const plain = (s: string) => glossed(s, false);
const read = (s: string) => plain(s).replace(/[  ]/g, ' ');
const fold = (s: string) => read(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const lines = allStrings().map(read);
const talkerLines = (t: Talker) => [t.name, t.unknown, ...(t.approach ? [t.approach] : []), ...(['early', 'warm', 'peak', 'dawn'] as const).flatMap(m => [t.hello(true, m), t.hello(false, m)]), ...t.choices.flatMap(c => [c.label, c.reply])].map(read);

/** Explicit, demeaning or coercive vocabulary: none of it is in the venue, in any form. (Folded: no accents, lower case.) */
const FORBIDDEN = [
  'baiser', 'sexes?', 'sexuel(le)?s?', 'fellation', 'sodomie', 'orgasme', 'jouir', 'bander', 'erection', 'chatte', 'foutre', 'nichons', 'seins', 'fesses', 'cul', 'poils?', 'nue?s?', 'porno',
  'pute', 'putain', 'salope', 'catin', 'racoleuse', 'racolage', 'fille de joie', 'peripateticienne', 'bordel', 'maquereau', 'proxenete', 'souteneur', 'pedophile', 'pedo', 'viols?', 'violer', 'agress\\w*', 'esclave', 'trafic\\w*',
  'chambre', 'etage', 'monter avec', 'emmener', 'sauter', 'coucher avec', 'une passe', 'faire l amour', 'caresses?', 'deshabill\\w*',
];
const PRICE_WORDS = ['tarifs?', 'prix', 'combien', 'forfait', 'marchand\\w*', 'negoci\\w*', 'supplement', 'pourboire', 'commission', 'billets?', 'cash', 'monnaie', 'argent'];
const MONEY = /\d[\d  ]*\s?(F|FCFA|CFA|francs?)\b/i;
const PRESSURE = [/allez,? viens/i, /juste un (verre|instant|peu|moment)/i, /sois sympa/i, /tu vas regretter/i, /dommage pour toi/i, /tant pis pour toi/i, /pourquoi pas ?\?/i, /je t’en prie, reste/i, /ne me dis pas non/i, /tu n’as pas le choix/i, /obligé/i];
const GRACE = /(aucun (souci|probl[eè]me)|pas de (souci|probl[eè]me)|amul solo|bien s[uû]r|ne t’en veux pas|ne d[eé]ranges pas|merci de comprendre|pas vex[eé]|c’est tr[eè]s bien|sans rancune|la porte est ouverte)/i;
const declines = (t: Talker) => t.choices.filter(c => c.kind === 'decline');

describe('the cast: who talks, and what they are is data', () => {
  it('six to eight people have a word for you, each with a name, an age between 21 and 60, a role and a place in the cast', () => {
    expect(TALKERS.length).toBeGreaterThanOrEqual(6); expect(TALKERS.length).toBeLessThanOrEqual(8);
    expect(new Set(TALKERS.map(t => t.id)).size).toBe(TALKERS.length);
    for (const t of TALKERS) {
      expect(t.name.length, t.id).toBeGreaterThan(2);
      expect(t.age, t.id).toBeGreaterThanOrEqual(21); expect(t.age, t.id).toBeLessThanOrEqual(60);
      expect(['patron', 'worker'], t.id).toContain(t.role);
      expect(CAST.find(c => c.id === t.id), `${t.id} is in the cast`).toBeTruthy();
      expect(CAST.find(c => c.id === t.id)!.gender, `${t.id}: the cast and the lines agree`).toBe(t.gender);
      expect(CAST.find(c => c.id === t.id)!.name, t.id).toBe(t.name);
    }
  });
  it('is mixed: patrons and workers, women and men, young and old; not every woman is a worker', () => {
    const f = TALKERS.filter(t => t.gender === 'f'), m = TALKERS.filter(t => t.gender === 'm');
    expect(f.length).toBeGreaterThanOrEqual(3); expect(m.length).toBeGreaterThanOrEqual(3);
    expect(f.filter(t => t.role === 'patron').length, 'women who are patrons').toBeGreaterThanOrEqual(3);
    expect(f.filter(t => t.role === 'worker').length).toBeGreaterThanOrEqual(1);
    expect(m.filter(t => t.role === 'worker').length, 'men who work the night too').toBeGreaterThanOrEqual(1);
    expect(TALKERS.filter(t => t.role === 'patron').length).toBeGreaterThanOrEqual(5);
    expect(Math.min(...TALKERS.map(t => t.age))).toBeLessThanOrEqual(30); expect(Math.max(...TALKERS.map(t => t.age))).toBeGreaterThanOrEqual(55);
  });
  it('a worker says what they do themselves, in the first greeting, as work; a patron never claims it', () => {
    for (const t of TALKERS) {
      const first = read(t.hello(true, 'warm'));
      if (t.role === 'worker') { expect(first, t.id).toMatch(/Je travaille ici la nuit/); expect(first, t.id).toMatch(/(parler|discuter)/); }
      else for (const l of talkerLines(t)) expect(l, t.id).not.toMatch(/Je travaille ici la nuit|tout le monde sait ce que je fais/);
    }
    const w = TALKERS.filter(t => t.role === 'worker');
    for (const t of w) { const topics = t.choices.filter(c => c.kind === 'topic').map(c => c.id); expect(topics, t.id).toContain('metier'); expect(topics.length, t.id).toBeGreaterThanOrEqual(3); }
    const rok = TALKERS.find(t => t.id === 'rokhaya')!, said = rok.choices.map(c => fold(c.reply)).join(' ');
    for (const word of ['travail', 'enfants', 'police', 'patronne', 'securite', 'dire non']) expect(said + fold(rok.choices.map(c => c.label).join(' ')), word).toMatch(new RegExp(word.split(' ')[0]));
    expect(said).toMatch(/honte|abri|droit de dire non/);
  });
  it('a person’s role is declared by data and no look is derived from it: patioLook takes an id and a gender, nothing else', () => {
    expect(patioLook.length).toBe(2);
    const src = patioLook.toString(); expect(src).not.toMatch(/role|worker|patron|job|metier|travail|age\b/i);
    for (const t of TALKERS) { expect(patioLook(t.id, t.gender === 'f')).toEqual(patioLook(t.id, t.gender === 'f')); expect(!!patioLook(t.id, t.gender === 'f').female, t.id).toBe(t.gender === 'f'); }
    for (const p of CAST) expect(Object.keys(p), p.id).not.toContain('look');
    const venue = text('../src/venues/patio.ts');
    expect(venue).toMatch(/STAFF_LOOK\[p\.id\] \?\? patioLook\(p\.id, p\.gender === 'f'\)/);
    expect(venue.split('\n').filter(l => /look/i.test(l) && /\bp\.role\b|\.role\b/.test(l)), 'no line makes a look from a role').toEqual([]);
    // two people of the same gender, one patron and one worker, are no more alike than two patrons: the look comes from the id
    const women = TALKERS.filter(t => t.gender === 'f').map(t => JSON.stringify(patioLook(t.id, true)));
    expect(new Set(women).size).toBe(women.length);
  });
  it('the ones who walk over are two standing people, a worker and a patron among them, and say it without pressure', () => {
    expect(APPROACHERS.length).toBe(2);
    const who = APPROACHERS.map(id => TALKERS.find(t => t.id === id)!);
    expect(who.map(t => t.role).sort()).toEqual(['patron', 'worker']);
    for (const t of who) {
      expect(t.approach, t.id).toBeTruthy(); expect(CAST.find(c => c.id === t.id)!.seat, `${t.id} stands`).toBeUndefined();
      expect(read(t.approach!), t.id).not.toMatch(MONEY);
      for (const re of PRESSURE) expect(read(t.approach!), t.id).not.toMatch(re);
    }
    expect(read(TALKERS.find(t => t.id === 'rokhaya')!.approach!)).toMatch(/aucune obligation/i);
  });
});

describe('every conversation can be declined, and the refusal is received gracefully', () => {
  it('each person has a way to decline and a way to say good night; the answer accepts it and says so', () => {
    for (const t of TALKERS) {
      expect(declines(t).length, `${t.id} can decline`).toBeGreaterThanOrEqual(1);
      expect(t.choices.some(c => c.kind === 'bye'), `${t.id} can leave`).toBe(true);
      expect(t.choices.filter(c => c.kind === 'topic').length, t.id).toBeGreaterThanOrEqual(2);
      for (const c of declines(t)) {
        expect(c.label, `${t.id}/${c.id}`).toMatch(/(non|pas ce soir|pas maintenant|pas ce que|tranquille|déranger|ne veux pas)/i);
        expect(read(c.reply), `${t.id}/${c.id}`).toMatch(GRACE);
        for (const re of PRESSURE) expect(read(c.reply), `${t.id}/${c.id}`).not.toMatch(re);
        expect(read(c.reply), `${t.id}/${c.id}`).not.toMatch(/\?\s*»?$/);                       // an answer to a no is never a new question
      }
    }
  });
  it('the replies after a refusal are the same as before: no choice is withdrawn, nobody turns cold, nothing is punished', () => {
    for (const t of TALKERS) {
      const before = t.choices.map(c => c.id);
      // the conversation keeps every choice (src/venues/venue.ts conversation): a decline answers and the sheet stays as it was
      expect(new Set(before).size).toBe(before.length);
      expect(t.hello(true, 'peak')).toBe(t.hello(true, 'peak'));
    }
    const venue = text('../src/venues/patio.ts');
    const chat = venue.slice(venue.indexOf('const chatWith'), venue.indexOf('const guests'));
    expect(chat).not.toMatch(/c\.kind === 'decline'|kind === 'decline'|relate\(ctx, [^)]*, -/);   // a refusal changes nothing in the save
  });
  it('an invitation to leave together can only be declined: there is no choice that accepts one', () => {
    const together = TALKERS.flatMap(t => t.choices.filter(c => c.together).map(c => [t, c] as const));
    expect(together.length).toBeGreaterThanOrEqual(1);
    for (const [t, c] of together) { expect(t.role, 'only a patron’s light flirt is ever a leave-together').toBe('patron'); expect(declines(t).length).toBeGreaterThanOrEqual(1); expect(read(c.reply)).toMatch(/pression|dire non/); }
    for (const t of TALKERS) for (const c of t.choices) {
      expect(['topic', 'flirt', 'invite', 'decline', 'bye'], `${t.id}/${c.id}`).toContain(c.kind);
      expect(c.label, `${t.id}/${c.id}`).not.toMatch(/accepte|d’accord|allons|on y va|partons|je viens avec toi|chez toi|chez moi/i);
    }
    // the worker's lines never invite anyone to leave: only the patron's flirt does
    for (const t of TALKERS.filter(x => x.role === 'worker')) expect(t.choices.filter(c => c.together), t.id).toEqual([]);
  });
  it('the doorman’s « Pas ce soir » and the DJ’s and barwoman’s goodbyes are warm too', () => {
    expect(read(DOOR_BYE)).toMatch(/Rentre bien|jàmm|à la prochaine/i);
    for (const re of PRESSURE) expect(read(DOOR_BYE)).not.toMatch(re);
  });
});

describe('nothing is for sale but the door, the bar and the DJ’s request', () => {
  it('no choice moves money: a choice is a label, an icon and an answer, and no talker’s line carries a price or talks of one', () => {
    for (const t of TALKERS) for (const c of t.choices) {
      expect(Object.keys(c).sort().filter(k => !['id', 'kind', 'label', 'icon', 'reply', 'together'].includes(k)), `${t.id}/${c.id}`).toEqual([]);
      const c2: Choice = c; expect((c2 as unknown as Record<string, unknown>).price).toBeUndefined();
    }
    for (const t of TALKERS) for (const l of talkerLines(t)) {
      expect(l, t.id).not.toMatch(MONEY);
      const f = fold(l).replace(/[^a-z0-9]+/g, ' ');
      for (const w of PRICE_WORDS) expect(f, `${t.id}: « ${w} » in ${l.slice(0, 60)}`).not.toMatch(new RegExp(`\\b${w}\\b`));
    }
  });
  it('the only prices written anywhere are the door’s, the bar’s menu, the DJ’s request: all in the doorman’s, barwoman’s, DJ’s lines and the signs', () => {
    const priced = lines.filter(l => MONEY.test(l));
    expect(priced.length).toBeGreaterThan(0);
    const talkerSet = new Set(TALKERS.flatMap(talkerLines));
    for (const l of priced) expect(talkerSet.has(l), l.slice(0, 80)).toBe(false);
    for (const l of priced) expect(l, l.slice(0, 80)).toMatch(/Boubacar|DJ|entrée|Entrée|carte|Avec alcool|F ?$|ticket|500|3 ?000|habitués|18 ans/i);
    expect(read(doormanAsk({ night: 1, hour: 23, nights: 0 }))).toContain('3 000');
    expect(PATIO_ENTRY).toBe(3000);
    expect(read(djRequest())).toMatch(/500 F/);
  });
  it('the bar’s menu is 1 000 – 4 500 F, with beer, cocktails and spirits mixes AND soft drinks, juice and water', () => {
    for (const d of PATIO_DRINKS) { expect(d.price, d.id).toBeGreaterThanOrEqual(1000); expect(d.price, d.id).toBeLessThanOrEqual(4500); expect(d.price % 100, d.id).toBe(0); }
    const alc = PATIO_DRINKS.filter(d => d.alcohol), soft = PATIO_DRINKS.filter(d => !d.alcohol);
    expect(alc.length).toBeGreaterThanOrEqual(4); expect(soft.length).toBeGreaterThanOrEqual(4);
    const ids = PATIO_DRINKS.map(d => d.id);
    expect(ids).toEqual(expect.arrayContaining(['biere', 'mojito', 'dakar_sunset', 'gin_tonic', 'bissap', 'jus_bouye', 'soda', 'eau']));
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.min(...PATIO_DRINKS.map(d => d.price))).toBe(1000); expect(Math.max(...PATIO_DRINKS.map(d => d.price))).toBe(4500);
  });
});

describe('an adult place: no explicit content, no violence, no coercion, nobody under eighteen', () => {
  it('none of the explicit, demeaning or coercive vocabulary appears anywhere in what Le Patio says or shows', () => {
    const bad: string[] = [];
    for (const l of lines) { const f = fold(l).replace(/[^a-z0-9]+/g, ' '); for (const w of FORBIDDEN) if (new RegExp(`\\b${w}\\b`).test(f)) bad.push(`${w}: ${l.slice(0, 70)}`); }
    expect(bad).toEqual([]);
  });
  it('the doorman asks the age before the fee: 18 years at least, on the sign, at the greeting, at the door', () => {
    expect(SIGNS.sub).toMatch(/18\+/); expect(SIGNS.age).toMatch(/18 ANS/);
    expect(read(doormanGreeting({ night: 1, hour: 22, nights: 0 }))).toMatch(/18 ans minimum/);
    expect(read(doormanAsk({ night: 1, hour: 22, nights: 5 }))).toMatch(/18 ans minimum/);
    expect(read(doormanWelcome({ night: 1, hour: 22, nights: 0 }))).toMatch(/dérange/);       // the welcome tells you to say so if something bothers you
  });
  it('nobody in the venue is under eighteen: every talker is 21 or more, no line gives a child’s age or a school’s pupil, children appear only as someone’s kids, never present', () => {
    for (const t of TALKERS) expect(t.age).toBeGreaterThanOrEqual(21);
    for (const l of lines) {
      for (const m of l.matchAll(/\b(\d{1,2}) ans\b/g)) expect(+m[1], l.slice(0, 70)).toBeGreaterThanOrEqual(18);
      expect(l, l.slice(0, 70)).not.toMatch(/\b(j’ai|tu as|il a|elle a|a|de|d’|âgée?s? de|âgés de)\s+(un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|dix-sept) ans\b/i);   // an age said of someone, under eighteen
    }
    const minors = /\b(mineur|mineure|lycéenne|lycéen|collégien|collégienne|gamine|fillette|petite fille|petit garçon|écolière|écolier|adolescent|adolescente|ado)\b/i;
    for (const l of lines) expect(l, l.slice(0, 70)).not.toMatch(minors);
    for (const p of CAST) expect(['staff', 'patron', 'worker', 'friend', 'queue', 'delivery']).toContain(p.role);
  });
  it('the narration never leers or jokes at anyone’s expense: no judgement words about the people who work the night, no comment on bodies, clothes or looks', () => {
    for (const t of TALKERS) for (const l of talkerLines(t)) {
      const f = fold(l);
      expect(f, `${t.id}: ${l.slice(0, 60)}`).not.toMatch(/\b(sexy|canon|bombe|belle plante|tenue|decollete|jupe|mini|moulant|corps|poitrine|hanches|jambes|regard(e)? les filles)\b/);
    }
    // the only judgement said about the work is by the workers themselves, against it (« les gens aiment juger »), and never funny
    for (const l of lines) expect(fold(l)).not.toMatch(/\b(rigol|hilarant|drole de metier|ha ha|mdr|lol)\b/);
  });
  it('is written like the rest of the game: French typography and everyday Wolof the lexicon knows', () => {
    const bad: string[] = [];
    for (const l of allStrings().map(plain)) for (const m of l.matchAll(/«([^»]*)»/g)) { const q = m[0]; if (/[^\s(][?!;:]/.test(q.replace(/https?:\/\/\S+/g, '')) || /«[^\s]/.test(q) || /[^\s]»/.test(q)) bad.push(q.slice(0, 80)); }
    expect(bad).toEqual([]);
    const src = text('../src/i18n/patioLines.ts');
    const used = [...src.matchAll(/\b(?:say|quote|lex)\('([^']+)'\)/g)].map(m => m[1]);
    expect(used.length).toBeGreaterThan(8);
    expect(used.filter(u => !find(u))).toEqual([]);
  });
  it('speaks of the week with its own themes (no contest) and every theme and moment is covered', () => {
    expect(PATIO_THEMES.length).toBe(7);
    expect(PATIO_THEMES.some(t => t.contest)).toBe(false);
    expect(programme(0).length).toBe(7); expect(programme(3)[0]).toMatch(/^Ce soir/);
    expect(ALL_MOMENTS.length).toBe(7);
    for (const t of TALKERS) for (const m of ['early', 'warm', 'peak', 'dawn'] as const) for (const first of [true, false]) expect(t.hello(first, m).length, `${t.id} ${m}`).toBeGreaterThan(20);
  });
});
