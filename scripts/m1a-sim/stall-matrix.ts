// Deliberate stalling: a player who never initiates, guards and answers what comes (aiming for time-outs and draws), against every roster wrestler.
import './stub';
import fs from 'node:fs';
import { series, type Skill } from './pupil';
import { fighterAttributes } from '../../src/career/career';
import { ROSTER } from '../../src/career/roster';
const STALL: Skill = { reaction: [0.2, 0.3], pace: 1e9, read: 0.9, defend: 0.95, sense: 0.5, counter: 0.9, mash: 0 };
const TRAINED = fighterAttributes({ lamb_skill: 10, lutte: 20, entr_force: 10, entr_saisies: 10, entr_frappe: 10, forme: 40, combats: 15 });
const out: Record<string, Record<string, { win: number; loss: number; draw: number; mean: number }>> = {};
for (const [pn, attrs] of [['fresh', fighterAttributes({ lamb_skill: 1 })], ['trained', TRAINED]] as const) for (const w of ROSTER) {
  const r = series(w.name, STALL, 30, 'classe', 1, attrs);
  (out[pn] ??= {})[w.id] = { win: r.win, loss: r.loss, draw: +(1 - r.win - r.loss).toFixed(3), mean: +r.mean.toFixed(1) };
  console.log(pn.padEnd(8), w.name.padEnd(8), 'L' + w.level, `win ${r.win.toFixed(2)} loss ${r.loss.toFixed(2)} draw ${(1 - r.win - r.loss).toFixed(2)} mean ${r.mean.toFixed(0)} s`);
}
fs.writeFileSync(new URL('./stall-matrix.json', import.meta.url), JSON.stringify(out, null, 1));
