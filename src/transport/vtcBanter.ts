import { say } from '../i18n/wolof';
import type { DriveEvent } from './driveFeel';

/**
 * What a VTC passenger says about the way the player drives (pure, unit-tested in tests/vtcBanter.test.ts; src/transport/vtc.ts plays it). Every passenger has a temper, and the same
 * driving earns different words from each: « Dawalal ndank » from a nervous one at 60 km/h, « Dama yakamti » from a hurried one when the car crawls, a calm one who only smiles.
 * Lines are Dakar speech: French with Wolof in it (`say` adds the French gloss for those who have glosses on, Réglages › Langue). Several variations for each scenario,
 * and the same one never twice in a row; a passenger does not talk all the time (a pause between two lines, a longer one before the same scenario again).
 */
export type Temper = 'calm' | 'hurried' | 'nervous' | 'chatty';
export const TEMPERS: readonly Temper[] = ['calm', 'hurried', 'nervous', 'chatty'];
export type Scenario = 'fast' | 'veryFast' | 'hardBrake' | 'crash' | 'bump' | 'crawl' | 'stopped' | 'late' | 'smooth' | 'honk' | 'chat';

/** The passenger's temper: by the passenger's own seed, and the hour (the rush hours make people hurried). */
export function temperOf(seed: number, hour: number): Temper {
  const t = TEMPERS[((seed % 4) + 4) % 4], h = ((hour % 24) + 24) % 24;
  return (h >= 7 && h < 9) || (h >= 17 && h < 19) ? (t === 'calm' || t === 'chatty' ? 'hurried' : t) : t;
}

const W = {
  slow: () => say('Dawalal ndank'), hurry: () => say('Dama yakamti'), faster: () => say('Gaawal'), notSoFast: () => say('Bul gaaw'), scared: () => say('Dama tiit'),
  look: () => say('Xoolal'), good: () => say('Baax na'), woy: () => say('Wóoy'), easy: () => say('Ndank ndank'), fine: () => say('Jàmm rekk'), yes: () => say('Waaw'), thanks: () => say('Jërëjëf'),
};
type Table = Record<Scenario, Partial<Record<Temper, (() => string)[]>> & { any: (() => string)[] }>;
/** The lines: for each scenario, by temper, with `any` for the tempers not listed. Functions, so that the glosses follow the setting when the line is spoken. */
export const LINES: Table = {
  fast: {
    nervous: [() => `${W.slow()} ! On n’est pas pressés…`, () => `Eh, doucement ! ${W.scared()}…`, () => `${W.notSoFast()}, s’il te plaît !`, () => `Tu roules vite, là. ${W.slow()}, chef.`],
    calm: [() => `${W.slow()}, chef.`, () => `On a le temps, hein. ${W.easy()}.`, () => `Tranquille… ${W.notSoFast()}.`],
    hurried: [() => `${W.yes()}, ${W.faster()} ! Mais sans tuer personne.`, () => `Voilà, ${W.hurry()}. Continue comme ça.`, () => `C’est bien, ça avance. Mais fais attention.`],
    chatty: [() => `Ha ! Tu conduis comme mon cousin, toi. ${W.slow()} !`, () => `Tu as le pied lourd aujourd’hui ! ${W.slow()}.`, () => `On dirait la Formule 1. ${W.notSoFast()} !`],
    any: [() => `${W.slow()} !`],
  },
  veryFast: {
    nervous: [() => `${W.woy()} ! ${W.slow()} ! ${W.scared()} !`, () => `Arrête, je descends ! ${W.slow()} !`, () => `${W.woy()}, ${W.notSoFast()} ! Je veux arriver vivant !`],
    calm: [() => `${W.slow()} ! Là, c’est trop.`, () => `Hé, hé ! ${W.easy()}, ${W.easy()} !`],
    hurried: [() => `${W.slow()} !… pas à ce point-là, quand même !`, () => `Je suis pressé, pas fou ! ${W.slow()} !`],
    chatty: [() => `${W.woy()} ! Tu veux un trophée ? ${W.slow()} !`, () => `Tu vas me faire perdre mon déjeuner ! ${W.slow()} !`],
    any: [() => `${W.woy()} ! ${W.slow()} !`],
  },
  hardBrake: {
    nervous: [() => `${W.woy()} ! Doucement sur le frein !`, () => `Aïe ! ${W.scared()}…`],
    hurried: [() => `Pourquoi tu freines comme ça ? ${W.hurry()} !`],
    any: [() => `${W.woy()} ! Doucement sur le frein !`, () => `Aïe, mon café !`, () => `Hé ! ${W.easy()} !`, () => `Ma ceinture ! Doucement !`],
  },
  crash: {
    nervous: [() => `${W.woy()} ! ${W.scared()}… Tout va bien ?`, () => `Arrête-toi ! C’était quoi, ça ?`],
    any: [() => `${W.woy()} ! Tout va bien ?`, () => `${W.look()} ! La voiture !`, () => `Ça va ? Personne n’est blessé ?`, () => `Là, tu as touché ! ${W.look()} un peu !`],
  },
  bump: {
    any: [() => `Aïe… ${W.look()} un peu.`, () => `Ce n’est rien, mais fais attention.`, () => `Doucement dans les manœuvres !`],
  },
  crawl: {
    hurried: [() => `${W.hurry()} ! ${W.faster()}, s’il te plaît.`, () => `On n’avance pas, là… ${W.hurry()} !`, () => `Mon rendez-vous ! ${W.faster()} un peu !`, () => `On marche plus vite à pied ! ${W.hurry()}.`],
    calm: [() => `Pas de souci, ${W.good()}. Prends ton temps.`, () => `On n’est pas à une minute près.`],
    nervous: [() => `${W.good()}, comme ça c’est bien… ${W.easy()}.`, () => `Voilà, ${W.fine()}. Roule comme ça.`],
    chatty: [() => `Tu connais le chemin au moins ? ${W.easy()}, hein.`, () => `On fait du tourisme ? ${W.good()}, j’aime bien regarder.`],
    any: [() => `${W.hurry()}…`],
  },
  stopped: {
    hurried: [() => `${W.hurry()} ! On est arrêtés pourquoi ?`, () => `On attend quoi ? ${W.faster()} !`, () => `${W.hurry()}, je te dis !`],
    any: [() => `On est arrêtés ?`, () => `Il y a un souci ?`, () => `On repart quand tu veux.`],
  },
  late: {
    hurried: [() => `On va être en retard… ${W.faster()} !`, () => `${W.hurry()} ! On est déjà en retard.`],
    any: [() => `Ça fait longtemps, quand même…`, () => `On arrive bientôt ?`],
  },
  smooth: {
    nervous: [() => `${W.good()}, comme ça je respire.`, () => `Voilà. ${W.fine()}. Merci de rouler doucement.`],
    calm: [() => `${W.good()}, tu conduis bien.`, () => `Tranquille comme ça, ça me plaît.`],
    hurried: [() => `${W.good()}, ça avance bien.`, () => `Bon rythme. ${W.good()}.`],
    chatty: [() => `Tu as la main, toi ! ${W.good()}.`, () => `Quel conducteur ! Je te mets cinq étoiles.`],
    any: [() => `${W.good()}.`],
  },
  honk: {
    nervous: [() => `Pas besoin de klaxonner à chaque fois, hein…`],
    chatty: [() => `Ils sont fous, ces gens ! Klaxonne, klaxonne !`, () => `Haha, tu leur parles en klaxon !`],
    any: [() => `Eh, ils t’ont entendu, c’est bon.`, () => `Le klaxon, c’est ta langue maternelle ?`],
  },
  chat: {
    chatty: [() => `Il y a du monde aujourd’hui, hein ?`, () => `Tu fais ça depuis longtemps, VTC ? ${W.good()}.`, () => `Ma tante habite par là. Elle fait un thiéboudienne !`, () => `Chaque fois que je prends un VTC, je rencontre quelqu’un de bien.`],
    any: [() => `${W.fine()} ?`],
  },
};

/** The farewell, by how the ride went (a tally of what happened in it). */
export interface RideTally { fast: number; veryFast: number; hardBrake: number; crash: number; bump: number; crawl: number; smooth: number }
export type Quality = 'rough' | 'smooth' | 'slow' | 'plain';
export const qualityOf = (t: RideTally): Quality => (t.crash > 0 || t.veryFast > 0 || t.fast + t.hardBrake >= 3 ? 'rough' : t.crawl >= 2 ? 'slow' : t.smooth >= 1 && t.fast + t.hardBrake === 0 ? 'smooth' : 'plain');
export const FAREWELLS: Record<Quality, (() => string)[]> = {
  rough: [() => `Ouf ! J’ai cru ma dernière heure venue. ${W.thanks()}…`, () => `${W.thanks()}. La prochaine fois, ${W.slow()}, hein !`, () => `Je descends ici, j’ai les jambes qui tremblent. ${W.thanks()}.`],
  smooth: [() => `${W.thanks()}, quel beau trajet ! Je te mets cinq étoiles.`, () => `${W.thanks()}. Voilà comment on conduit à Dakar !`, () => `${W.good()}, tu es mon chauffeur préféré. ${W.thanks()} !`],
  slow: [() => `Enfin arrivés ! ${W.thanks()}.`, () => `${W.thanks()}. La prochaine fois, un peu plus vite, ${W.hurry()} toujours !`],
  plain: [() => `${W.thanks()}, bonne route !`, () => `${W.thanks()}. À la prochaine !`, () => `C’est bon, ${W.thanks()} !`],
};

/** Gaps (ride seconds): between any two lines, before the same scenario again, and before the next bit of small talk. */
export const GAP = { any: 6, same: 16, chat: 45, stopped: 12, crash: 1 };
/** A remark held back by the pause between two lines is still made, if it comes within this many seconds. */
export const HOLD = 5;

const hash = (...n: number[]) => { let h = 2166136261; for (const x of n) { h ^= Math.floor(x) + 0x9e3779b9; h = Math.imul(h, 16777619) >>> 0; } return h; };

/** One passenger's talk during one ride. */
export class Banter {
  /** How many times each scenario has been spoken, and the variation each used last (never the same twice in a row). */
  readonly counts: Partial<Record<Scenario, number>> = {};
  private lastIdx: Partial<Record<Scenario, number>> = {};
  private lastAny = -99; private lastSame: Partial<Record<Scenario, number>> = {};
  private stoppedFor = 0; private smoothFor = 0;
  private held: { sc: Scenario; until: number } | null = null;
  /** The remark held back by the pause, if any (debug). */
  get heldNow() { return this.held ? { ...this.held } : null; }
  /** What the passenger has said (the checks). */
  readonly said: { scenario: Scenario; line: string; at: number }[] = [];
  /** What happened in the ride so far, said or not (it sets the farewell). */
  readonly tally: RideTally = { fast: 0, veryFast: 0, hardBrake: 0, crash: 0, bump: 0, crawl: 0, smooth: 0 };
  constructor(readonly seed: number, readonly temper: Temper) {}

  private pickLine(sc: Scenario): string {
    const t = LINES[sc], list = t[this.temper] ?? t.any, n = (this.counts[sc] ?? 0);
    let i = hash(this.seed, sc.length * 31 + sc.charCodeAt(0), n) % list.length;
    if (list.length > 1 && i === this.lastIdx[sc]) i = (i + 1) % list.length;
    this.lastIdx[sc] = i;
    return list[i]();
  }
  /** Speaks `sc` if the gaps allow it (`now`: the ride's seconds); the line, or null. */
  private speak(sc: Scenario, now: number): string | null {
    const strong = sc === 'crash' || sc === 'veryFast';
    if (now - this.lastAny < (strong ? GAP.crash : GAP.any)) { if (sc === 'fast' || sc === 'hardBrake' || sc === 'crawl') this.held = { sc, until: now + HOLD }; return null; }   // not now: soon, if it still stands
    const same = sc === 'chat' ? GAP.chat : sc === 'stopped' ? GAP.stopped : GAP.same;
    if (!strong && now - (this.lastSame[sc] ?? -99) < same) return null;
    const line = this.pickLine(sc);
    this.counts[sc] = (this.counts[sc] ?? 0) + 1; this.lastAny = this.lastSame[sc] = now; this.said.push({ scenario: sc, line, at: now });
    return line;
  }
  /** A drive event: what the passenger says to it (or null). */
  onEvent(e: DriveEvent, now: number): string | null {
    if (e.kind in this.tally) this.tally[e.kind as keyof RideTally]++;
    if (e.kind !== 'smooth') this.smoothFor = 0;
    switch (e.kind) {
      case 'fast': return this.speak((this.counts.fast ?? 0) >= 2 && this.temper !== 'hurried' ? 'veryFast' : 'fast', now);   // the third time, the words are sharper
      case 'veryFast': return this.speak('veryFast', now);
      case 'hardBrake': return this.speak('hardBrake', now);
      case 'crash': return this.speak('crash', now);
      case 'bump': return this.speak('bump', now);
      case 'crawl': return this.speak('crawl', now);
      case 'smooth': return this.speak('smooth', now);
      case 'honk': return this.temper === 'chatty' || this.temper === 'nervous' ? (((this.counts.honk ?? 0) < 2 || hash(this.seed, now) % 3 === 0) ? this.speak('honk', now) : null) : null;
    }
  }
  /** Each frame: the stop in the road, the lateness, the small talk (a chatty one only, on a smooth stretch). */
  tick(dt: number, now: number, st: { speed: number; late: boolean; atStop: boolean }): string | null {
    const v = Math.abs(st.speed);
    if (this.held) { const h = this.held; if (now > h.until) this.held = null; else if (now - this.lastAny >= GAP.any) { this.held = null; const l = this.speak(h.sc, now); if (l) return l; } }
    this.stoppedFor = v < 0.3 && !st.atStop ? this.stoppedFor + dt : 0;
    if (this.stoppedFor > 12) { this.stoppedFor = 0; return this.speak('stopped', now); }
    if (st.late && v > 1 && this.temper === 'hurried' && (this.counts.late ?? 0) < 3) { const l = this.speak('late', now); if (l) return l; }
    if (this.temper === 'chatty' && v > 4) { this.smoothFor += dt; if (this.smoothFor > 30) { this.smoothFor = 0; return this.speak('chat', now); } }
    return null;
  }
  farewell(tally: RideTally): string { const l = FAREWELLS[qualityOf(tally)], q = qualityOf(tally); return l[hash(this.seed, q.length) % l.length](); }
}
