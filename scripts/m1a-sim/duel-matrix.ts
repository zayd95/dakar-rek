// Win / draw / loss rates and bout length of headless players against every roster wrestler, in the game's real duel code (ranked mode,
// avec frappe, 90 s round). Writes scripts/m1a-sim/duel-matrix.json for wrestling2.ts. Run: npx vite-node scripts/m1a-sim/duel-matrix.ts [n]
import './stub';
import fs from 'node:fs';
import { series, NOVICE, DECENT, EXPERT } from './pupil';
import { fighterAttributes } from '../../src/career/career';
import { ROSTER } from '../../src/career/roster';
const N = Number(process.argv[2] ?? 30);
const SKILLS = { novice: NOVICE, decent: DECENT, expert: EXPERT } as const;
const FRESH = fighterAttributes({ lamb_skill: 1 });
// about twenty sessions in the écurie, ten of each drill, sparring and some running: what a player who trains has after a few hours
const TRAINED = fighterAttributes({ lamb_skill: 10, lutte: 20, entr_force: 10, entr_saisies: 10, entr_frappe: 10, forme: 40, combats: 15 });
const out: Record<string, Record<string, Record<string, { win: number; loss: number; draw: number; mean: number; median: number }>>> = {};
for (const [pn, attrs] of [['fresh', FRESH], ['trained', TRAINED]] as const) for (const [sn, sk] of Object.entries(SKILLS)) for (const w of ROSTER) {
  const r = series(w.name, sk, N, 'classe', 1, attrs);
  ((out[pn] ??= {})[sn] ??= {})[w.id] = { win: r.win, loss: r.loss, draw: +(1 - r.win - r.loss).toFixed(3), mean: +r.mean.toFixed(1), median: +r.median.toFixed(1) };
  console.log(pn.padEnd(8), sn.padEnd(7), w.name.padEnd(8), 'L' + w.level, `win ${r.win.toFixed(2)} loss ${r.loss.toFixed(2)} draw ${(1 - r.win - r.loss).toFixed(2)} mean ${r.mean.toFixed(0)} s median ${r.median.toFixed(0)} s`);
}
fs.writeFileSync(new URL('./duel-matrix.json', import.meta.url), JSON.stringify(out, null, 1));
