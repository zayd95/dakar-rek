import type { SaveData } from '../core/types';
import { clamp } from '../core/rng';
import { START_LINKS, castById } from './cast';

export const PLAYER = 'player';
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Persistent relationship store on top of the save. Offline time never changes it (no decay). */
export class Relations {
  constructor(private d: SaveData) {}

  level(a: string, b: string = PLAYER): number {
    const k = pairKey(a, b);
    if (k in this.d.rel) return this.d.rel[k];
    const link = START_LINKS.find(([x, y]) => pairKey(x, y) === k);
    return link ? link[2] : 0;
  }
  change(a: string, b: string, delta: number) {
    this.d.rel[pairKey(a, b)] = clamp(this.level(a, b) + delta, -100, 100);
  }
  has(flag: string) { return this.d.flags.includes(flag); }
  set(flag: string) { if (!this.has(flag)) this.d.flags.push(flag); }
  beatDone(id: string) { return id in this.d.beats; }

  static label(level: number): string {
    return level <= -40 ? 'rival' : level < -5 ? 'tendu' : level < 10 ? 'connaissance' : level < 35 ? 'sympathie' : level < 65 ? 'ami' : 'proche';
  }

  /** NPC–NPC links for the journal, with current levels. */
  links(): { a: string; b: string; level: number; note: string }[] {
    return START_LINKS.map(([a, b, , note]) => ({ a: castById(a)!.name, b: castById(b)!.name, level: this.level(a, b), note }));
  }
}
