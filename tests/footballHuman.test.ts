import { describe, expect, it } from 'vitest';
import { HUMAN_ASK_REACH, HUMAN_KEEP, HUMAN_REACH, Match, PITCH } from '../src/game/footballSim';

/** M3 « Join the match » (src/game/footballSim.ts, the human player): the player on the NPC match's pitch, placed from their own body. */
const H = 99;
/** `n` NPCs a side (a keeper from 3) and the human on team 0, who kicks off. */
function match(n: number, seed = 11) {
  const m = new Match(seed);
  let id = 0;
  for (const team of [0, 1] as const) for (let i = 0; i < n; i++) m.add({ id: id++, team, keeper: n >= 3 && i === 0, x: (team ? 1 : -1) * (4 + i * 3), z: -8 + i * 4 });
  m.add({ id: H, team: 0, human: true, x: -6, z: 6 });
  m.reset(0);
  return m;
}
/** A thumb that runs to the ball at 5.5 m/s and, with the ball at the foot, shoots in range or passes now and then. */
function thumb(m: Match, dt: number, opts: { shoot?: boolean; pass?: boolean; still?: boolean; run?: number } = {}) {
  const p = m.get(H)!, b = m.ball;
  let vx = 0, vz = 0, yaw = p.yaw;
  if (!opts.still) {
    const dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz);
    if (d > 0.35) { const s = Math.min(opts.run ?? 5.5, d / dt); vx = (dx / d) * s; vz = (dz / d) * s; yaw = Math.atan2(dx, dz); }
  }
  m.setHuman(H, p.x + vx * dt, p.z + vz * dt, vx, vz, yaw);
  if (m.humanInReach(H, 0)) {
    const toGoal = Math.hypot(PITCH.hx - b.x, b.z);
    if (opts.shoot && toGoal < 13) m.humanAsk(H, 'shot', 0.8);
    else if (opts.pass && m.humanReceiver(p)) m.humanAsk(H, 'pass');
  }
}

describe('M3 · the player in the NPC match', () => {
  it('the match never moves the player: where the thumb put them, they are', () => {
    const m = match(2);
    for (let i = 0; i < 300; i++) { m.setHuman(H, -3, 2, 0, 0, 0); m.step(1 / 30); expect([m.get(H)!.x, m.get(H)!.z]).toEqual([-3, 2]); }
  });

  it('never the taker of a kick-off, a restart or the fetch: a standing player never stalls the match', () => {
    const m = match(2);
    const takers = new Set<number>();
    for (let i = 0; i < 30 * 240; i++) { thumb(m, 1 / 30, { still: true }); m.step(1 / 30); takers.add(m.taker); takers.add(m.fetcher); }
    expect(takers.has(H)).toBe(false);
    expect(m.stats.kickoffs).toBeGreaterThanOrEqual(1);
    expect(m.stats.contacts).toBeGreaterThan(40);                       // play goes on round a player who just stands
  });

  it('running to the ball, the player touches it: dribbles and traps, every touch a contact of the match', () => {
    const m = match(2);
    for (let i = 0; i < 30 * 120; i++) { thumb(m, 1 / 30); m.step(1 / 30); }
    const mine = m.log.filter(c => c.who === H);
    expect(mine.length).toBeGreaterThan(5);
    expect(mine.filter(c => c.kind === 'touch' || c.kind === 'trap').every(c => c.reach <= HUMAN_REACH + 1e-9)).toBe(true);
    expect(mine.every(c => c.reach <= HUMAN_ASK_REACH + 1e-9)).toBe(true);
    expect(new Set(mine.map(c => c.kind)).has('touch')).toBe(true);
  });

  it('a pass asked for goes to a teammate ahead, and the match counts it', () => {
    const m = match(3);
    let passed = 0;
    for (let i = 0; i < 30 * 180 && !passed; i++) { thumb(m, 1 / 30, { pass: true }); m.step(1 / 30); passed = m.log.filter(c => c.who === H && c.kind === 'pass' && c.to >= 0).length; }
    expect(passed).toBeGreaterThan(0);
    const rec = m.log.find(c => c.who === H && c.kind === 'pass' && c.to >= 0)!;
    expect(m.get(rec.to)!.team).toBe(0);
  });

  it('a shot asked for in range: on its way to the goal, and the player can score (the goal is his)', () => {
    let scored = false, shots = 0;
    for (let seed = 1; seed <= 6 && !scored; seed++) {
      const m = match(2, seed);
      for (let i = 0; i < 30 * 240 && !scored; i++) {
        thumb(m, 1 / 30, { shoot: true }); m.step(1 / 30);
        const g = m.events.find(e => e.kind === 'goal' && e.who === H); if (g) scored = true;
      }
      shots += m.log.filter(c => c.who === H && c.kind === 'shot').length;
    }
    expect(shots).toBeGreaterThan(0);
    expect(scored).toBe(true);
  });

  it('a shot asked with the ball just ahead (beyond a dribble’s reach, within the kick’s) is played at once, toward the goal', () => {
    const m = match(2);
    for (let i = 0; i < 30 * 8 && m.phase !== 'play'; i++) m.step(1 / 30);
    m.ball.x = 2; m.ball.z = 0; m.ball.vx = 0; m.ball.vz = 0; m.ball.vh = 0;
    for (const q of m.players) if (!q.human) { q.x = q.team ? 12 : -12; q.z = q.team ? 10 : -10; q.tx = q.x; q.tz = q.z; q.kick = null; }
    m.setHuman(H, 2 - 0.34 - (HUMAN_REACH + 0.1), 0.13, 0, 0, Math.PI / 2);   // the ball just beyond the control model's reach, within the kick's
    expect(m.humanInReach(H, 0)).toBe(false);
    m.humanAsk(H, 'shot', 0.7);
    m.setHuman(H, 2 - 0.34 - (HUMAN_REACH + 0.1), 0.13, 0, 0, Math.PI / 2); m.step(1 / 30);
    const shot = m.log.find(c => c.who === H && c.kind === 'shot');
    expect(shot).toBeTruthy();
    expect(m.ball.vx).toBeGreaterThan(8);                                       // on its way to the goal at +x
  });

  it('the ball a dribble pushed ahead is still the player’s (the buttons stay up); a pass asked then goes on the next touch', () => {
    const m = match(3);
    for (let i = 0; i < 30 * 120 && !(m.last === H && m.phase === 'play'); i++) { thumb(m, 1 / 30); m.step(1 / 30); }
    expect(m.last).toBe(H);
    const b = m.ball, place = (back: number) => { const p = m.get(H)!, a = Math.atan2(b.x - p.x, b.z - p.z); m.setHuman(H, b.x - Math.sin(a) * back, b.z - Math.cos(a) * back, 0, 0, a); };
    place(2.6);                                                                     // a step behind: out of the instant reach, still theirs
    expect(m.humanInReach(H, 0.9)).toBe(false);
    expect(m.humanHas(H)).toBe(true);
    place(HUMAN_KEEP + 0.6);
    expect(m.humanHas(H)).toBe(false);                                              // too far: not theirs any more
    place(2.6);
    m.humanAsk(H, 'pass');
    for (let i = 0; i < 36 && !m.log.some(c => c.who === H && c.kind === 'pass'); i++) { thumb(m, 1 / 30); m.step(1 / 30); }
    expect(m.log.some(c => c.who === H && c.kind === 'pass')).toBe(true);
  });

  it('removed mid-match (the player walks off): the NPCs play on, nothing waits for them', () => {
    const m = match(2);
    for (let i = 0; i < 30 * 30; i++) { thumb(m, 1 / 30); m.step(1 / 30); }
    m.remove(H);
    const c0 = m.stats.contacts;
    for (let i = 0; i < 30 * 60; i++) m.step(1 / 30);
    expect(m.stats.contacts).toBeGreaterThan(c0 + 10);
    expect(m.get(H)).toBeNull();
  });
});
