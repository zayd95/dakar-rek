import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  apprentiCalls, apprentiLine, chatPlace, exchange, farewellLines, greetLines, haggleLine, haggler, hostLine, hostSays, nameLines,
  price, quickChat, smallTalkLines, unknownPhrases, utter, waitLine, tasteLine, comeLine, type Host,
} from '../src/i18n/lines';
import { find, glossed, glossesShown, greetingAt, LEXICON, setGlossesShown, wo } from '../src/i18n/wolof';
import { resolveGlosses } from '../src/i18n/dom';

/** Glosses shown, no-break spaces read as spaces (typography is checked on its own). */
const g = (s: string) => glossed(s, true).replace(/[\u00a0\u202f]/g, ' ');
const raw = (s: string) => glossed(s, true);
const HOURS = Array.from({ length: 24 }, (_, h) => h + 0.5);
const DESTS = ['Colobane', 'Petersen', 'Médina', 'Pikine', 'Fann', 'Mermoz', 'Ouakam', 'Liberté 6', 'Ngor', 'Yoff', 'Parcelles', 'Thiaroye', 'Guédiawaye'];
const HOSTS: Host[] = ['dibi', 'cook', 'imam', 'mareyeuse', 'pecheur'];

/** Every line the library can say, for the orthography checks. */
function corpus(names: readonly string[]): string[] {
  const out: string[] = [];
  for (let k = 0; k < 60; k++) {
    const name = names[k % names.length], seed = `placed:${k}`;
    for (const hour of HOURS) {
      out.push(...greetLines({ name, seed, hour }), ...greetLines({ name, seed, hour, again: true }));
      out.push(...smallTalkLines({ name, seed, hour }), ...farewellLines({ name, seed, hour }));
    }
    out.push(...nameLines({ name, seed }));
    for (const kind of ['buy', 'sell'] as const) for (const amount of [100, 400, 700, 1200, 2400, 15000]) out.push(haggleLine(kind, amount, k), haggleLine(kind, amount, k, 'Mamadou', false));
    for (const h of HOSTS) out.push(hostLine(h, k));
    out.push(apprentiLine(DESTS, k));
  }
  out.push(waitLine('Le patron'), tasteLine(), comeLine('Le patron'));
  return out.map(raw);
}

/** Wolof inside « … »: proper names and prices removed, what is left must be CLAD Wolof. */
function wolofParts(line: string, names: readonly string[]): string[] {
  const parts = [...line.matchAll(/«\s([^»]*)\s»/g)].map(m => m[1]);
  return parts.map(p => {
    let t = p.replace(/\d[\d ]* F\b/g, ' ');
    for (const n of [...names, ...DESTS].sort((a, b) => b.length - a.length)) t = t.split(n).join(' ');
    return t.replace(/\s+/g, ' ').trim();
  });
}
const CLAD = /^[a-zàéëóñŋ ,.?!-]*$/i;
const FRENCH_DIGRAPHS = /ou|ch|dj|tch|gn/i;
/** French typography: a space before ? ! ; » and after «. */
const badSpacing = (s: string) => /[^\s(][?!;»]/.test(s.replace(/\(c’est combien \?\)/g, '')) || /«[^\s]/.test(s);

describe('everyday exchanges: greetings by the hour, names, small talk, goodbyes', () => {
  it('the first greeting is « Salaam aleekum ! » — « Maleekum salaam ! », then the greeting of the hour for most people', () => {
    const first = greetLines({ name: 'Awa', seed: 'placed:1', hour: 8 });
    expect(g(first[0])).toBe('Toi : « Salaam aleekum ! » · Awa : « Maleekum salaam ! »');
    const styles = new Set<string>();
    for (let k = 0; k < 40; k++) {
      const lines = greetLines({ name: 'Awa', seed: `p${k}`, hour: 8 });
      expect(lines).toEqual(greetLines({ name: 'Awa', seed: `p${k}`, hour: 8 }));            // stable per person
      expect(g(lines[0])).toContain('Maleekum salaam');
      styles.add(lines.length === 1 ? 'short' : /fanaane/.test(lines[1]) ? 'hour' : 'jamm');
      if (lines[1]) expect(g(lines[1])).toMatch(/^Awa : « (Na nga fanaane \?|Jàmm nga am \?) » \([^)]*\) · Toi : « Jàmm rekk\. » \(tout va bien\)$/);
    }
    expect(styles).toEqual(new Set(['short', 'hour', 'jamm']));                                  // people answer differently
  });
  it('greeting someone again uses the greeting of the hour and their own answer', () => {
    expect(g(greetLines({ name: 'Moussa', seed: 'x', hour: 9, again: true })[0])).toMatch(/^Toi : « Na nga fanaane \? » \(bien dormi \?\) · Moussa : « Jàmm rekk\. »/);
    expect(g(greetLines({ name: 'Moussa', seed: 'x', hour: 19, again: true })[0])).toMatch(/« Na nga yendoo \? »/);
    const afternoon = new Set(Array.from({ length: 20 }, (_, k) => g(greetLines({ name: 'A', seed: `s${k}`, hour: 14, again: true })[0]).split(' · ')[1]));
    expect(afternoon).toEqual(new Set(['A : « Maa ngi fi rekk. » (je suis là, ça va)', 'A : « Jàmm rekk. » (tout va bien)']));
  });
  it('asking a name: « Naka nga tudd ? » — « Maa ngi tudd Awa. » or « Awa laa tudd. »', () => {
    const forms = new Set(Array.from({ length: 12 }, (_, k) => g(nameLines({ name: 'Awa', seed: `n${k}` })[0])));
    expect(forms).toEqual(new Set([
      'Toi : « Naka nga tudd ? » (comment tu t’appelles ?) · Awa : « Maa ngi tudd Awa. » (je m’appelle Awa)',
      'Toi : « Naka nga tudd ? » (comment tu t’appelles ?) · Awa : « Awa laa tudd. » (je m’appelle Awa)',
    ]));
  });
  it('small talk follows the hour: news always, the heat in the afternoon, an invitation to eat at meal times', () => {
    const at = (hour: number) => new Set(Array.from({ length: 40 }, (_, k) => g(smallTalkLines({ name: 'Awa', seed: `t${k}`, hour })[0])));
    const morning = [...at(9)].join('\n'), lunch = [...at(13)].join('\n');
    expect(morning).not.toMatch(/Dafa tàng|Kaay lekk/);
    expect(lunch).toMatch(/Awa : « Dafa tàng ! » \(il fait chaud\) · Toi : « Dëgg la\. » \(c’est vrai\)/);
    expect(lunch).toMatch(/Awa : « Kaay lekk ! » \(viens manger\) · Toi : « Jërëjëf, dama suur\. » \(merci · j’ai bien mangé\)/);
    expect(morning).toMatch(/« (Lu bees \?|Ana waa kër gi \?|Naka liggéey bi \?|Jàmm nga am \?|Na nga def \?) »/);
  });
  it('goodbyes: « Ba ci kanam » by day, « Fanaanal ak jàmm ! » — « Ba suba ! » at night', () => {
    expect(g(farewellLines({ name: 'Awa', seed: 1, hour: 22 })[0])).toBe('Toi : « Fanaanal ak jàmm ! » (bonne nuit) · Awa : « Ba suba ! » (à demain)');
    expect(g(farewellLines({ name: 'Awa', seed: 1, hour: 10 })[0])).toMatch(/^Toi : « Maa ngi dem\. Ba (ci kanam|beneen yoon) ! » \(j’y vais · [^)]+\) · Awa : « Ba (ci kanam|beneen yoon) ! »/);
  });
});

describe('prices and haggling', () => {
  it('asks the price, discusses it, and the seller holds firm', () => {
    const buys = new Set(Array.from({ length: 30 }, (_, k) => g(haggleLine('buy', 700, k, 'La mareyeuse'))));
    expect(buys).toEqual(new Set([
      'Toi : « Ñaata la ? » (c’est combien ?) · La mareyeuse : « 700 F. »',
      'Toi : « Ñaata la ? » (c’est combien ?) · La mareyeuse : « 700 F. Yomb na ! » (ce n’est pas cher)',
      'Toi : « Seer na ! Wàññi ko tuuti. » (c’est cher · baisse un peu) · La mareyeuse : « Déedéet, 700 F rekk. » (non · 700 F seulement)',
    ]));
    const sells = [...new Set(Array.from({ length: 30 }, (_, k) => g(haggleLine('sell', 2400, k))))].join('\n');
    expect(sells).toMatch(/^Cliente : « Ñaata la \? » \(c’est combien \?\) · Toi : « 2 400 F\. »$/m);
    expect(sells).toMatch(/Cliente : « Seer na ! Wàññi ko tuuti\. » .* Toi : « Déedéet, 2 400 F rekk\. »/);
    const noHaggle = Array.from({ length: 30 }, (_, k) => haggleLine('buy', 400, k, 'Mamadou', false)).join('\n');
    expect(noHaggle).not.toMatch(/Wàññi|Seer na/);
    expect(price(15000)).toBe('15\u202f000\u00a0F');
  });
  it('a haggler gives a fresh line each time', () => {
    const next = haggler('buy', 700);
    expect(new Set(Array.from({ length: 12 }, () => next())).size).toBeGreaterThan(1);
  });
});

describe('hosts, apprentices and the chat', () => {
  it('the mosque keeps to the everyday greeting: no recitation, no religious formula', () => {
    const imam = g(hostLine('imam'));
    expect(imam).toBe('Toi : « Salaam aleekum. » · L’imam : « Maleekum salaam. Jàmm nga am ? » (tout va bien ?)');
    expect(imam).not.toMatch(/allah|alxamdu|alhamdu|bismi|insha|inch|amiin|amine|sourate|verset|coran|du[’']a/i);
  });
  it('hosts welcome with the lexicon: the Dibi, the gargote cook, the mareyeuses, the fishermen', () => {
    expect(g(hostLine('dibi', 0)) + g(hostLine('dibi', 1))).toMatch(/Dalal ak jàmm/);
    expect(new Set(Array.from({ length: 8 }, (_, k) => g(hostLine('cook', k)))).size).toBe(2);
    const say = hostSays('mareyeuse'); expect(g(say())).toMatch(/^La mareyeuse : « Jën bu bees !/);
    expect(g(waitLine('Le patron'))).toBe('Le patron : « Xaaral tuuti ! » (attends un peu)');
  });
  it('the apprentice calls the destinations, « Nanu dem ! » and « Fan nga dem ? »', () => {
    const calls = apprentiCalls(['Colobane', 'Petersen', 'Médina', 'Pikine']);
    expect(calls).toEqual(['Colobane ! Colobane !', 'Petersen ! Nanu dem !', 'Fan nga dem ?', 'Médina ! Médina !', 'Pikine ! Pikine !']);
    expect(calls.join(' ')).not.toMatch(/ndaw/i);
    expect(g(apprentiLine(['Colobane'], 3))).toBe('L’apprenti : « Colobane ! Nanu dem ! » (on y va)');
  });
  it('quick chat phrases follow the place and the hour; the mosque gets greetings, thanks and goodbye only', () => {
    expect(chatPlace('street')).toBe('street');
    expect(chatPlace('pikine:gargote:12')).toBe('food'); expect(chatPlace('pikine:maiga:31')).toBe('food');
    expect(chatPlace('plateau:market')).toBe('market'); expect(chatPlace('rapide:2')).toBe('transport');
    expect(chatPlace('mosque:medina')).toBe('mosque'); expect(chatPlace('home')).toBe('home');
    const street9 = quickChat('street', 9).map(e => e.wo);
    expect(street9.slice(0, 2)).toEqual(['Salaam aleekum', 'Na nga fanaane ?']);
    expect(street9.at(-1)).toBe('Ba ci kanam');
    expect(quickChat('street', 22).map(e => e.wo)).toContain('Fanaanal ak jàmm');
    expect(quickChat('pikine:gargote:12', 13).map(e => e.wo)).toEqual(expect.arrayContaining(['Na nga def ?', 'Neex na', 'Dama suur']));
    expect(quickChat('plateau:market', 13).map(e => e.wo)).toEqual(expect.arrayContaining(['Ñaata la ?', 'Wàññi ko tuuti']));
    expect(quickChat('rapide:1', 13).map(e => e.wo)).toEqual(expect.arrayContaining(['Nanu dem', 'Maa ngi ñëw']));
    expect(quickChat('mosque', 13).map(e => e.wo)).toEqual(['Salaam aleekum', 'Maleekum salaam', 'Jërëjëf', 'Ba ci kanam']);
    for (const space of ['street', 'pikine:gargote:1', 'plateau:market', 'rapide:1', 'mosque', 'club', 'home']) for (const h of HOURS) {
      const list = quickChat(space, h);
      for (const e of list) expect(LEXICON).toContain(e);
      expect(new Set(list.map(e => e.wo)).size).toBe(list.length);
      expect(list.length).toBeLessThanOrEqual(9);
    }
  });
});

describe('orthography of every generated line (CLAD, French spacing)', async () => {
  const { STREET_NAMES } = await import('../src/interact/people');
  const typeset = corpus(STREET_NAMES), lines = typeset.map(l => l.replace(/[\u00a0\u202f]/g, ' '));
  it('no-break spaces keep « ? » with its words on a phone: never a plain space before ? ! : » or after «', () => {
    const bad = typeset.filter(l => / [?!:;»]/.test(l) || /« /.test(l));
    expect(bad).toEqual([]);
    expect(typeset.some(l => l.includes('\u202f?'))).toBe(true);
  });
  it('apprentice calls are plain text for the canvas bubbles', () => {
    for (const c of apprentiCalls(DESTS)) { expect(c).not.toMatch(/[\u2063\u2064]/); expect(badSpacing(c)).toBe(false); }
  });
  it('every Wolof phrase given as text is a lexicon entry', () => {
    expect(lines.length).toBeGreaterThan(5000);
    expect([...unknownPhrases]).toEqual([]);
  });
  it('Wolof in quotes is CLAD: no ou, ch, dj, gn, never « Nanga def » in one word', () => {
    const bad = new Set<string>();
    for (const line of lines) for (const w of wolofParts(line, STREET_NAMES)) {
      if (!CLAD.test(w) || FRENCH_DIGRAPHS.test(w) || /nanga/i.test(w)) bad.add(w);
    }
    expect([...bad]).toEqual([]);
  });
  it('French spacing before ? ! and inside « »', () => {
    expect(lines.filter(badSpacing)).toEqual([]);
  });
});

describe('recipes and primitives speak through Step.line', async () => {
  const T = await import('../src/activity/templates');
  const P = await import('../src/activity/primitives');
  const { ActivityRunner } = await import('../src/activity/runner');
  const { GameState } = await import('../src/core/state');
  const { newSave } = await import('../src/core/save');
  const { Seats } = await import('../src/interact/seats');
  const { Inventory } = await import('../src/activity/inventory');
  const A = (id: string, x = 0, z = 0) => ({ id, kind: 'spot' as const, x, z });
  const say = (l: unknown) => g(typeof l === 'function' ? (l as () => string)() : String(l ?? ''));
  it('Dibi: « Xaaral tuuti ! » while it grills, « Neex na ! » at the first bite, the patron welcomes', () => {
    const d = T.dibi({ id: 'd', name: 'Chez Ass', space: 'street', anchors: [A('counter'), A('grill', 5)] }, { converse: () => {} });
    const dibi = d.offers.counter[0];
    expect(say(dibi.steps[0].line)).toBe('Le patron : « Xaaral tuuti ! » (attends un peu)');
    expect(say(dibi.steps.at(-1)!.line)).toBe('Toi : « Neex na ! » (c’est bon)');
    expect(say(d.offers.counter.at(-1)!.steps[0].line)).toMatch(/Dalal ak jàmm/);
    expect(say(d.offers.grill[0].steps[0].line)).toBe('Le patron : « Kaay fi ! » (viens ici)');
  });
  it('mosque: the imam greets; washing and prayer say nothing', () => {
    const m = T.mosque({ id: 'm', name: 'Mosquée', space: 'mosque', anchors: [A('ablutions'), A('hall', 3), A('imam', 6)] }, { converse: () => {} });
    for (const s of [...m.offers.ablutions, ...m.offers.hall]) for (const st of s.steps) expect(st.line).toBeUndefined();
    expect(say(m.offers.imam[0].steps[0].line)).toMatch(/^Toi : « Salaam aleekum\. » · L’imam : « Maleekum salaam\. Jàmm nga am \? »/);
  });
  it('fishing beach: the mareyeuses discuss the price before buying or selling', () => {
    const b = T.fishingBeach({ id: 'b', name: 'Soumbédioune', space: 'street', anchors: [A('pirogue'), A('mareyeuses', 4)] }, { converse: () => {} });
    const [sell, buy] = b.offers.mareyeuses;
    expect(sell.primitive).toBe('sell'); expect(buy.primitive).toBe('buy');
    for (const a of [sell, buy]) { expect(a.steps[0]).toMatchObject({ primitive: 'talk', label: 'On discute le prix' }); expect(say(a.steps[0].line)).toMatch(/La mareyeuse/); }
    expect(say(buy.steps[0].line)).toMatch(/« (Ñaata la \?|Seer na ! Wàññi ko tuuti\.) »/);
  });
  it('a stop shows where the car rapide goes and the apprentice calls it when boarding', () => {
    const s = T.stop({ id: 's', name: 'Arrêt', space: 'street', anchors: [A('stop')], line: 'l1', to: ['Colobane', 'Petersen'] }, { board: () => {} });
    const ride = s.offers.stop[0];
    expect(ride.detail).toBe('Vers Colobane, Petersen');
    expect(say(ride.steps[0].line)).toMatch(/^L’apprenti : « (Colobane|Petersen) ! Nanu dem ! » \(on y va\)$/);
  });
  it('the runner says the line when the step starts', () => {
    const state = new GameState(newSave()); state.data.wallet = 5000;
    const toasts: string[] = []; const inv = new Inventory(state);
    const r = new ActivityRunner({ state, seats: new Seats(), space: () => 'street', player: () => ({ x: 0, z: 0 }), seated: () => null, sit: () => false,
      clip: () => {}, busy: () => {}, progress: () => {}, toast: m => toasts.push(g(m)), save: () => {}, item: (id, d) => inv.add(id, d) });
    const buy = P.buy({ id: 'poisson', label: 'Acheter un poisson', price: 700, items: { poisson: 1 }, haggle: haggler('buy', 700, 'La mareyeuse') });
    r.start(buy);
    expect(toasts[0]).toMatch(/^Toi : « (Ñaata la \?|Seer na !)/);
    for (let t = 0; t < 4; t += 0.25) r.update(0.25);
    expect(inv.count('poisson')).toBe(1); expect(state.wallet).toBe(4300);
    expect(toasts.at(-1)).toMatch(/Acheter un poisson ✓/);
  });
  it('legacy places compose the same exchanges: Sandaga stall, Soumbédioune fish stall, Boutique Diallo', async () => {
    const { ACTIONS } = await import('../src/world/content');
    const { CITY_ACTIONS } = await import('../src/world/cityContent');
    const stall = ACTIONS.market[0];
    expect(say(stall.steps![0].line)).toMatch(/^Une cliente : « (Ñaata la \?|Seer na ! Wàññi ko tuuti\.) »/);
    expect(stall.steps![0].effects).toMatchObject({ money: 2500, counters: { shifts: 1 } });
    const fish = CITY_ACTIONS.fish[0];
    expect(fish.steps![0]).toMatchObject({ primitive: 'talk', label: 'On discute le prix' });
    expect(say(fish.steps!.at(-1)!.line)).toBe('Toi : « Neex na ! » (c’est bon)');
    const bread = CITY_ACTIONS.boutique[0];
    expect(say(bread.steps![0].line)).toMatch(/^Toi : « Ñaata la \? » \(c’est combien \?\) · Le boutiquier : « 400 F\./);
  });
});

describe('people in the street speak Wolof by the hour', async () => {
  const { People, nameFor } = await import('../src/interact/people');
  const { ActivityRunner } = await import('../src/activity/runner');
  const { GameState } = await import('../src/core/state');
  const { newSave } = await import('../src/core/save');
  const { Seats } = await import('../src/interact/seats');
  afterEach(() => { vi.useRealTimers(); });
  const runner = () => new ActivityRunner({ state: new GameState(newSave()), seats: new Seats(), space: () => 'street', player: () => ({ x: 0, z: 0 }), seated: () => null,
    sit: () => false, clip: () => {}, busy: () => {}, progress: () => {}, toast: () => {}, save: () => {} });
  const body = (id: string) => ({ id, obj: { position: { x: 1, z: 1 }, rotation: { y: 0 }, visible: true } as unknown as import('three').Object3D, h: null, female: true });
  it('greet, then the greeting of the hour a moment later, then « Dire au revoir »', () => {
    vi.useFakeTimers();
    // a person whose style adds the greeting of the hour
    const id = Array.from({ length: 60 }, (_, k) => `placed:${k}`).find(s => greetLines({ name: 'x', seed: s, hour: 8 }).length === 2 && /fanaane/.test(greetLines({ name: 'x', seed: s, hour: 8 })[1]))!;
    const said: string[] = []; const r = runner();
    const people = new People(() => [body(id)], r, l => said.push(g(l)), () => ({ x: 0, z: 0 }), () => 8);
    const target = () => { const out: import('../src/interact/types').Target[] = []; people.collect('street', 0, 0, out); return out[0]; };
    expect(target().affordances().map(a => a.label)).toEqual(['Saluer', 'Demander son nom']);
    target().affordances()[0].run(); for (let t = 0; t < 2; t += 0.25) r.update(0.25);
    expect(said.at(-1)).toBe('Toi : « Salaam aleekum ! » · Passante : « Maleekum salaam ! »');
    vi.advanceTimersByTime(2700);
    expect(said.at(-1)).toMatch(/^Passante : « Na nga fanaane \? » \(bien dormi \?\) · Toi : « Jàmm rekk\. »/);
    expect(target().affordances().map(a => a.label)).toEqual(['Saluer', 'Demander son nom', 'Dire au revoir']);
    target().affordances()[1].run();
    expect(said.at(-1)).toContain(`tudd`); expect(said.at(-1)).toContain(nameFor(id, true));
    const bye = target().affordances().find(a => a.label === 'Dire au revoir')!; bye.run(); for (let t = 0; t < 2; t += 0.25) r.update(0.25);
    expect(said.at(-1)).toMatch(/^Toi : « Maa ngi dem\. Ba (ci kanam|beneen yoon) ! »/);
    people.clear();
  });
});

describe('gloss resolution in the page', () => {
  const was = glossesShown();
  afterEach(() => setGlossesShown(was));
  it('resolves a text node as the setting says', () => {
    const node = { nodeType: 3, nodeValue: `${wo('Jërëjëf', 'merci')} !` } as unknown as Node;
    setGlossesShown(false); resolveGlosses(node); expect(node.nodeValue).toBe('Jërëjëf !');
    const shown = { nodeType: 3, nodeValue: utter(['Toogal.']) } as unknown as Node;
    setGlossesShown(true); resolveGlosses(shown); expect(shown.nodeValue).toBe('« Toogal. » (assieds-toi)');
  });
  it('a known phrase carries no gloss, a free one carries its own', () => {
    expect(g(utter(['Salaam aleekum !']))).toBe('« Salaam aleekum ! »');
    expect(g(exchange(['A', [{ wo: 'Awa laa tudd.', fr: 'je m’appelle Awa' }]]))).toBe('A : « Awa laa tudd. » (je m’appelle Awa)');
    expect(find('Salaam aleekum')?.known).toBe(true);
    expect(greetingAt(9).known).toBeUndefined();
  });
});

describe('sources: no French-style Wolof spellings', () => {
  const SRC = new URL('../src/', import.meta.url);
  const files = readdirSync(SRC, { recursive: true }).filter(f => String(f).endsWith('.ts')).map(f => ({ f: String(f), src: new TextDecoder().decode(readFileSync(new URL(String(f), SRC))) }));
  it('never « Nanga def », « Jërëjëf » spelt the French way, « Salam aleykoum »…', () => {
    for (const { f, src } of files) {
      expect(src, f).not.toMatch(/\bnanga\s?def\b|\bnangadef\b|\bmangui\b|dieuredieuf|djerejef|\bjerejef\b|salam\s+aleykoum|\bmagui\b|\bdiam\s+ak\s+diam\b|\bwaw\b/i);
    }
  });
  it('Wolof quoted in the sources keeps French spacing (« Na nga def ? », never « Na nga def? »)', () => {
    const wolofWords = new Set(LEXICON.flatMap(e => e.wo.toLowerCase().split(/[\s,?!-]+/)).filter(w => w.length > 2 && /[àéëóñŋ]|aa|ee|ii|oo|uu/.test(w)));
    const bad: string[] = []; let checked = 0;
    for (const { f, src } of files) for (const m of src.matchAll(/«([^»\n]*)»/g)) {
      const q = m[0];
      if (!q.toLowerCase().split(/[^a-zàéëóñŋ]+/).some(w => wolofWords.has(w))) continue;
      checked++;
      if (/[^\s(][?!]/.test(q) || /«[^\s]/.test(q) || /[^\s]»/.test(q)) bad.push(`${f}: ${q}`);
    }
    expect(checked).toBeGreaterThan(10);
    expect(bad).toEqual([]);
  });
});
