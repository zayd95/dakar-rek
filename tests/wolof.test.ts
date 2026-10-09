import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  LEXICON, find, lex, byTag, replyTo, greetingAt, greetingPair, farewellAt, pick, seedHash,
  wo, say, quote, glossed, glossesShown, setGlossesShown, withHourGreeting, HOUR_GREETING,
} from '../src/i18n/wolof';

const SRC = new URL('../src/', import.meta.url);
const text = (path: string) => new TextDecoder().decode(readFileSync(new URL(path, SRC)));
const sources = readdirSync(SRC, { recursive: true }).filter(f => f.endsWith('.ts')).map(f => ({ f, src: text(f) }));

describe('Wolof lexicon', () => {
  it('every entry has Wolof, a French gloss and at least one tag', () => {
    expect(LEXICON.length).toBeGreaterThanOrEqual(80);
    for (const e of LEXICON) {
      expect(e.wo.trim(), JSON.stringify(e)).not.toBe('');
      expect(e.fr.trim(), e.wo).not.toBe('');
      expect(e.tags.length, e.wo).toBeGreaterThan(0);
      expect(e.wo, 'NFC').toBe(e.wo.normalize('NFC'));
    }
  });
  it('has no duplicates, and every usual answer is itself an entry', () => {
    const keys = LEXICON.map(e => e.wo.toLowerCase().replace(/[\s?!.]+$/, ''));
    expect(new Set(keys).size).toBe(keys.length);
    for (const e of LEXICON) if (e.reply) expect(find(e.reply), `${e.wo} → ${e.reply}`).not.toBeNull();
    expect(replyTo('Salaam aleekum')?.wo).toBe('Maleekum salaam');
    expect(replyTo('Jërëjëf')?.wo).toBe('Ñoo ko bokk');
    expect(replyTo('Lu bees ?')?.wo).toBe('Dara');
  });
  it('covers the everyday registers', () => {
    for (const tag of ['greeting', 'reply', 'thanks', 'farewell', 'yesno', 'ask', 'invite', 'market', 'food', 'attaya', 'work', 'money', 'encourage', 'lamb', 'weather', 'family', 'blessing', 'chat'] as const) {
      expect(byTag(tag).length, tag).toBeGreaterThanOrEqual(2);
    }
  });
  it('is written in the CLAD Latin alphabet (no French-style spellings)', () => {
    for (const e of LEXICON) {
      expect(e.wo, e.wo).toMatch(/^[a-zA-ZàéëóñŋÑŊÀÉËÓ ,?!-]+$/);
      expect(e.wo, e.wo).not.toMatch(/ou|ch|dj|tch|gn/i);
    }
  });
  it('keeps out the Pulaar, Sérère and Diola placeholders that were removed', () => {
    for (const e of LEXICON) expect(`${e.wo} ${e.fr}`).not.toMatch(/jaa?raama|on jaraama|mbaddo|TODO/i);
    for (const { f, src } of sources) {
      expect(src, f).not.toMatch(/Jaaraama|TODO\(Habib\)|à relire par Habib|brouillon à valider par Habib|en cours de relecture/);
    }
  });
  it('every phrase the game says through the library is in the lexicon', () => {
    const used: string[] = [];
    for (const { src } of sources) {
      for (const m of src.matchAll(/\b(?:say|quote|lex)\('([^']+)'\)/g)) used.push(m[1]);
      for (const m of src.matchAll(/\bex\(([^)]*)\)/g)) for (const s of m[1].matchAll(/'([^']+)'/g)) used.push(s[1]);
    }
    expect(used.length).toBeGreaterThan(60);
    expect(used.filter(u => !find(u))).toEqual([]);
  });
});

describe('greetings', () => {
  it('picks the greeting by the hour of the day', () => {
    expect(greetingAt(5).wo).toBe('Na nga fanaane ?');
    expect(greetingAt(8.5).wo).toBe('Na nga fanaane ?');
    expect(greetingAt(11.9).wo).toBe('Na nga fanaane ?');
    expect(greetingAt(12).wo).toBe('Na nga def ?');
    expect(greetingAt(16.5).wo).toBe('Na nga def ?');
    expect(greetingAt(17).wo).toBe('Na nga yendoo ?');
    expect(greetingAt(23).wo).toBe('Na nga yendoo ?');
    expect(greetingAt(2).wo).toBe('Na nga yendoo ?');
    expect(greetingAt(32).wo).toBe('Na nga fanaane ?');     // 8 h the next day
  });
  it('pairs a greeting with its answer, and says goodbye by the hour', () => {
    expect(greetingPair(8)).toEqual({ ask: lex('Na nga fanaane ?'), reply: lex('Jàmm rekk') });
    expect(greetingPair(14).reply.wo).toBe('Maa ngi fi rekk');
    expect(farewellAt(10).wo).toBe('Ba ci kanam');
    expect(farewellAt(22).wo).toBe('Fanaanal ak jàmm');
  });
  it('fills the greeting of the hour into a line', () => {
    const line = `${HOUR_GREETING} Le quartier est calme.`;
    expect(glossed(withHourGreeting(line, 9), true)).toBe('Na nga fanaane ? (bien dormi ?) Le quartier est calme.');
    expect(glossed(withHourGreeting(line, 21), false)).toBe('Na nga yendoo ? Le quartier est calme.');
    expect(withHourGreeting('Sans salut.', 9)).toBe('Sans salut.');
  });
});

describe('seeded choice', () => {
  it('the same seed gives the same expression, with the asked tag', () => {
    for (const seed of ['ibou', 'mame:3', 42]) {
      const a = pick('encourage', seed);
      expect(pick('encourage', seed)).toBe(a);
      expect(a.tags).toContain('encourage');
    }
    expect(seedHash('ibou')).toBe(seedHash('ibou'));
    const seen = new Set(Array.from({ length: 40 }, (_, k) => pick('news', `npc${k}`).wo));
    expect(seen.size).toBeGreaterThan(2);                   // seeds spread over the list
  });
});

describe('glosses', () => {
  const was = glossesShown();
  afterEach(() => setGlossesShown(was));
  it('renders « Wolof (français) » inline, and hides the French when glosses are off', () => {
    expect(glossed(wo('Jërëjëf', 'merci'), true)).toBe('Jërëjëf (merci)');
    expect(glossed(wo('Jërëjëf', 'merci'), false)).toBe('Jërëjëf');
    expect(glossed(wo('Waaw'), true)).toBe('Waaw');
    expect(glossed(`${say('Toogal')}, ${say('sama doom')} !`, true)).toBe('Toogal (assieds-toi), sama doom (mon enfant) !');
    expect(glossed(`${say('Toogal')}, ${say('sama doom')} !`, false)).toBe('Toogal, sama doom !');
    expect(glossed(`Tu vas me dire ${quote('Wàññi ko tuuti')} ?`, true)).toBe('Tu vas me dire « Wàññi ko tuuti » (baisse un peu) ?');
    expect(glossed('Texte sans wolof (avec parenthèses).', false)).toBe('Texte sans wolof (avec parenthèses).');
  });
  it('the setting switches every line at display time', () => {
    const line = `${say('Dalal ak jàmm')} ! Entre.`;
    setGlossesShown(false);
    expect(glossesShown()).toBe(false);
    expect(glossed(line)).toBe('Dalal ak jàmm ! Entre.');
    setGlossesShown(true);
    expect(glossed(line)).toBe('Dalal ak jàmm (bienvenue) ! Entre.');
  });
  it('an unknown phrase is said as written, without a made-up gloss', () => {
    expect(find('Bonjour')).toBeNull();
    expect(glossed(say('Bonjour'), true)).toBe('Bonjour');
  });
});
