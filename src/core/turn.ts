/** Natural direction changes on foot: the body turns toward the stick, slower the faster it runs, and slows down while
 *  it is still turned away from where it is going (no sliding sideways), then picks its pace back up. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface TurnStep { facing: number; /** 0.3..1: share of the pace kept at this facing error */ keep: number }

export function turnStep(facing: number, want: number, dt: number, speed: number): TurnStep {
  const rate = 14 / (1 + Math.max(0, speed) * 0.2);                 // walk 2 m/s: ~10/s, jog ~7.6/s, sprint ~5.8/s
  const next = facing + wrap(want - facing) * Math.min(1, dt * rate);
  const rem = Math.abs(wrap(want - next));
  if (rem <= 0.35) return { facing: next, keep: 1 };                // under ~20°: full pace
  const t = Math.min(1, (rem - 0.35) / (Math.PI / 2 - 0.35));       // eased to 90° and beyond
  return { facing: next, keep: 1 - 0.7 * t * t * (3 - 2 * t) };
}
