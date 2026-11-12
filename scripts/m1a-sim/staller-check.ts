// Minimal-input strategies against the real duel, in the game's DEFAULT làmb (sans frappe: `?lamb2` is off) and in Làmb 2.0 (avec frappe,
// behind the flag): does standing still, or holding Garde, win? Run: npx vite-node scripts/m1a-sim/staller-check.ts [bouts]
import './stub';
import { LambDuel } from '../../src/lamb/duel';
import { STYLES, type StyleId } from '../../src/lamb/rules';
import { rosterOpponent } from '../../src/lamb/opponents';
import { fighterAttributes } from '../../src/career/career';
import type { Input } from '../../src/core/input';
const N = Number(process.argv[2] ?? 20);
type Strategy = 'idle' | 'holdGuard' | 'guardAndBreak';
type Info = Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any
function bout(strategy: Strategy, discipline: 'sans_frappe' | 'avec_frappe', level: number, style: StyleId, rosterName: string, seed: number) {
  const steer = { x: 0, y: 0 };
  const input = { enabled: true, move: () => ({ ...steer }), takeAction: () => false } as unknown as Input;
  const who = discipline === 'avec_frappe' ? rosterOpponent(rosterName, 40) : null;
  const duel = new LambDuel({
    origin: { x: 0, z: 0 }, look: { ngembColor: 'vert', ngembPattern: 'uni', accessories: [] }, input, crowdSize: 0, mode: 'classe', ring: 7.6, discipline, seed,
    style: { ...STYLES[who ? who.wrestler.style as StyleId : style], name: who?.wrestler.name ?? 'X' }, level: who?.level ?? level,
    attrs: who ? fighterAttributes({ lamb_skill: 1 }) : undefined, opponent: who ? { attrs: who.attrs, stand: who.stand, clinch: who.clinch, line: who.line } : undefined,
  });
  let inWindow = false;
  for (let k = 0; k < 60 * 120 && duel.phase !== 'result'; k++) {
    if (strategy !== 'idle') duel.setGuard(true);
    if (strategy === 'guardAndBreak') {
      const i = duel.info() as unknown as Info, open = i.phase === 'clinch' && !!i.clinch?.losing && !!i.clinch?.breakWindow;
      if (open && !inWindow) duel.pressBreak();
      inWindow = open;
    }
    duel.update(1 / 60);
  }
  const r = duel.result;
  return { winner: r?.winner ?? null, outcome: r?.outcome ?? 'none', seconds: r?.seconds ?? 120 };
}
const STYLE_IDS: StyleId[] = ['costaud', 'rapide', 'defensif'];
const ROSTER: [number, string][] = [[1, 'Pape'], [3, 'Assane'], [5, 'Babacar']];
const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);
for (const discipline of ['sans_frappe', 'avec_frappe'] as const) {
  console.log(`\n=== ${discipline === 'sans_frappe' ? 'DEFAULT làmb (sans frappe)' : 'Làmb 2.0 (avec frappe, behind ?lamb2)'}: win / draw / loss, mean seconds, ${N} bouts per cell`);
  for (const strategy of ['idle', 'holdGuard', 'guardAndBreak'] as const) {
    const cells: string[] = [];
    for (const [level, name] of ROSTER) {
      let w = 0, d = 0, l = 0, secs = 0, n = 0;
      const styles = discipline === 'sans_frappe' ? STYLE_IDS : (['costaud'] as StyleId[]);
      for (const style of styles) for (let s = 0; s < N; s++) { const r = bout(strategy, discipline, level, style, name, 1 + s * 101); n++; secs += r.seconds; if (r.winner === 'player') w++; else if (r.winner === 'opponent') l++; else d++; }
      cells.push(`L${level} ${pct(w / n)}/${pct(d / n)}/${pct(l / n)} ${(secs / n).toFixed(0)}s`);
    }
    console.log(strategy.padEnd(14), cells.join('   |   '));
  }
}
