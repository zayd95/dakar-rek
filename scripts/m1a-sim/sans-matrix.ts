// Bout results and lengths in the game's DEFAULT làmb (sans frappe) for three headless players of different skill, against each roster
// wrestler's style and level (the default bout takes only the style and the level from the roster). Writes sans-matrix.json (same shape as
// duel-matrix.json, which is Làmb 2.0). Run: npx vite-node scripts/m1a-sim/sans-matrix.ts [bouts]
import './stub';
import fs from 'node:fs';
import { LambDuel } from '../../src/lamb/duel';
import { STYLES, type StyleId } from '../../src/lamb/rules';
import { ROSTER } from '../../src/career/roster';
import { rng } from '../../src/core/rng';
import type { Input } from '../../src/core/input';
const N = Number(process.argv[2] ?? 25);
interface Skill { react: [number, number]; pace: number; defend: number; tap: number; breakP: number }
const SKILLS: Record<string, Skill> = {
  novice: { react: [0.45, 0.8], pace: 1.2, defend: 0.4, tap: 3, breakP: 0.4 },
  decent: { react: [0.3, 0.5], pace: 0.9, defend: 0.7, tap: 5, breakP: 0.7 },
  expert: { react: [0.18, 0.3], pace: 0.7, defend: 0.9, tap: 7, breakP: 0.9 },
};
type Info = Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any
function bout(sk: Skill, style: StyleId, level: number, seed: number) {
  const steer = { x: 0, y: 0 };
  const input = { enabled: true, move: () => ({ ...steer }), takeAction: () => false } as unknown as Input;
  const duel = new LambDuel({ origin: { x: 0, z: 0 }, look: { ngembColor: 'vert', ngembPattern: 'uni', accessories: [] }, input, crowdSize: 0, mode: 'classe', ring: 7.6, discipline: 'sans_frappe', seed, style: { ...STYLES[style], name: 'X' }, level });
  const r = rng((seed * 7919 + 17) >>> 0 || 1), between = (a: number, b: number) => a + r() * (b - a);
  const DT = 1 / 60;
  let t = 0, nextGrab = 2, guardUntil = 0, reactAt = -1, tapAt = 0, breakAt = -1, wasWind = false, wasWin = false;
  for (let k = 0; k < 60 * 120 && duel.phase !== 'result'; k++, t += DT) {
    const i = duel.info() as unknown as Info;
    steer.x = 0; steer.y = 0;
    duel.setGuard(t < guardUntil);
    if (i.phase === 'fight') {
      if (i.windup && !wasWind) reactAt = t + between(...sk.react);
      wasWind = !!i.windup;
      if (reactAt >= 0 && t >= reactAt) { reactAt = -1; if (r() < sk.defend) guardUntil = t + 0.8; }
      if (i.dist > 1.4) {
        const p = duel.fighterPoints(), me = { x: p[1][0], z: p[1][2] }, ai = { x: p[4][0], z: p[4][2] }, ax = duel.axes();
        const dx = ai.x - me.x, dz = ai.z - me.z, len = Math.hypot(dx, dz) || 1;
        steer.x = (dx / len) * ax.right.x + (dz / len) * ax.right.z; steer.y = (dx / len) * ax.fwd.x + (dz / len) * ax.fwd.z;
      } else if (t >= nextGrab && t >= guardUntil) { duel.pressGrab(); nextGrab = t + sk.pace * between(0.7, 1.3); }
    } else if (i.phase === 'clinch') {
      if (t >= tapAt) { duel.pressGrab(); tapAt = t + 1 / sk.tap * between(0.7, 1.3); }
      const win = !!i.clinch?.losing && !!i.clinch?.breakWindow;
      if (win && !wasWin) breakAt = t + between(...sk.react);
      wasWin = win;
      if (breakAt >= 0 && t >= breakAt) { breakAt = -1; if (r() < sk.breakP) duel.pressBreak(); }
    }
    duel.update(DT);
  }
  const res = duel.result;
  return { winner: res?.winner ?? null, seconds: res?.seconds ?? 120 };
}
const out: Record<string, Record<string, Record<string, { win: number; loss: number; draw: number; mean: number; median: number }>>> = { fresh: {}, trained: {} };
for (const [name, sk] of Object.entries(SKILLS)) for (const w of ROSTER) {
  const rs = Array.from({ length: N }, (_, s) => bout(sk, w.style as StyleId, w.level, 1 + s * 101));
  const secs = rs.map(x => x.seconds).sort((a, b) => a - b);
  const cell = { win: rs.filter(x => x.winner === 'player').length / N, loss: rs.filter(x => x.winner === 'opponent').length / N, draw: rs.filter(x => x.winner === null).length / N, mean: +(secs.reduce((a, b) => a + b, 0) / N).toFixed(1), median: +secs[Math.floor(N / 2)].toFixed(1) };
  for (const prof of ['fresh', 'trained']) ((out[prof] ??= {})[name] ??= {})[w.id] = cell;      // no attributes in the default làmb: same for both
  console.log(name.padEnd(7), w.name.padEnd(8), 'L' + w.level, w.style.padEnd(9), `win ${cell.win.toFixed(2)} draw ${cell.draw.toFixed(2)} loss ${cell.loss.toFixed(2)} mean ${cell.mean} s`);
}
fs.writeFileSync(new URL('./sans-matrix.json', import.meta.url), JSON.stringify(out, null, 1));
