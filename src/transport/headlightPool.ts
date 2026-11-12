import { HEADLIGHT_UNIFORMS } from '../world/grain';

/**
 * The light of the player's own headlights on the street, at night (LD2.0-A: at 21–23 h and before dawn the road, its markings and its kerbs were too
 * dark to read while driving). No light source, no shadow, no mesh: the street's own materials (src/world/grain.ts `HEADLIGHT_UNIFORMS`) are lit by a
 * beam from the vehicle's front bumper — the carriageway, the white markings, the kerbs and pavements, the walls beside the road take it as they would
 * a lamp, their own colour times the light — so the markings and the kerbs come out of the dark asphalt. Nothing by day, on foot, or for anyone else's
 * vehicle; the shape of the beam is in the shader (`hlBeam`), its numbers here.
 */
export const HEADLIGHT = {
  /** The lamps' height over the ground (m), how far the beam reaches (m), its half width at the bumper and how fast it widens (m per m ahead). */
  height: 0.7, reach: 38, width: 1.25, spread: 0.3,
  /** The beam's strength at full night (the light added on a surface facing it, × its colour), the warm white of the lamps. */
  strength: 2.0, color: 0xfff0d8,
  /** A motorbike's single lamp: shorter, narrower, weaker. */
  moto: { reach: 26, width: 0.8, spread: 0.22, strength: 1.7 },
} as const;

/** How strong the beam is for a night factor (0 day … 1 night): off in daylight, coming on at dusk. Pure. */
export const beamStrength = (night: number, moto = false) => (moto ? HEADLIGHT.moto.strength : HEADLIGHT.strength) * Math.max(0, Math.min(1, (night - 0.3) / 0.4));

let owner: object | null = null;
const U = HEADLIGHT_UNIFORMS;

export const headlightPool = {
  /**
   * The vehicle `who` drives lights the street this frame: its ground point (x, y, z) heading `yaw`, its front bumper `front` m ahead of it, `night`
   * 0 (day) … 1. Called each frame while the player drives (src/transport/ownedModule.ts); `release` when they stop.
   */
  place(who: object, x: number, y: number, z: number, yaw: number, front: number, night: number, moto = false) {
    const k = beamStrength(night, moto);
    if (k <= 0) { this.release(who); return; }
    owner = who;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), o = moto ? { ...HEADLIGHT, ...HEADLIGHT.moto } : HEADLIGHT;
    U.uHlPos.value.set(x + fx * front, y + HEADLIGHT.height, z + fz * front); U.uHlDir.value.set(fx, fz);
    U.uHlReach.value = o.reach; U.uHlWidth.value.set(o.width, o.spread); U.uHlK.value = k; U.uHlColor.value.setHex(HEADLIGHT.color);
  },
  /** `who` no longer drives (or it is day): the beam goes. */
  release(who: object) { if (owner === who) { U.uHlK.value = 0; owner = null; } },
  /** Checks: the beam now. */
  info: () => ({ on: U.uHlK.value > 0, strength: +U.uHlK.value.toFixed(2), at: U.uHlPos.value.toArray().map(v => +v.toFixed(2)), dir: U.uHlDir.value.toArray().map(v => +v.toFixed(3)), reach: U.uHlReach.value }),
};
