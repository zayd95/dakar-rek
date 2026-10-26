import { Stride } from '../../src/game/stride';
import { GameState } from '../../src/core/state';
import { newSave } from '../../src/core/save';
import { turnStep } from '../../src/core/turn';

/**
 * The player's body as src/main.ts moves it each frame (the same functions: the stick's pace curve `Stride.analog`, the rate-limited
 * `turnStep`, the speed easing, the ×0.8 per frame when the stick is let go), so football tests run the real pace, turn and stop.
 * `want` is the world yaw the stick points to, `mag` the stick's push 0…1.
 */
export class PlayerBody {
  x = 0; z = 0; facing = 0; speed = 0; vx = 0; vz = 0;
  readonly stride = new Stride(new GameState(newSave(0)));
  at(x: number, z: number, facing = 0) { this.x = x; this.z = z; this.facing = facing; this.speed = 0; this.vx = this.vz = 0; return this; }
  step(want: number, mag: number, dt: number) {
    let keep = 1;
    if (mag > 0.05) { const t = turnStep(this.facing, want, dt, this.speed); this.facing = t.facing; keep = t.keep; }
    const target = (mag > 0.01 ? this.stride.analog(mag, dt) : 0) * keep;
    this.speed += (target - this.speed) * Math.min(1, dt * (target > this.speed ? 6 : 12));
    const px = this.x, pz = this.z;
    if (mag > 0.05) { this.x += Math.sin(this.facing) * this.speed * dt; this.z += Math.cos(this.facing) * this.speed * dt; } else this.speed *= 0.8;
    this.vx = (this.x - px) / dt; this.vz = (this.z - pz) / dt;
  }
}
