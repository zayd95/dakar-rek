import type { Pose } from '../actors/character';

/**
 * Procedural poses for the TEMPORARY box character. Every dance and gesture here is a PROVISIONAL
 * PLACEHOLDER MOVEMENT, not a reproduction of a real mbakkou step or preparation gesture. Names, steps and
 * gestures will be replaced by motion validated by Habib and wrestling practitioners (see design doc).
 */
const S = Math.sin;

export interface Emote { id: string; label: string; pose: Pose; seconds: number; reviewed: false }

export const danceA: Pose = (c, t) => {          // side step with alternating raised arms
  const b = S(t * 6);
  c.body.position.y = Math.abs(S(t * 6)) * 0.12; c.body.rotation.set(0, 0, b * 0.12);
  c.legL.rotation.set(Math.max(0, b) * 0.9, 0, -0.15); c.legR.rotation.set(Math.max(0, -b) * 0.9, 0, 0.15);
  c.armL.rotation.set(-2.4 - b * 0.4, 0, -0.3); c.armR.rotation.set(-0.6 + b * 0.4, 0, 0.5);
};
export const danceB: Pose = (c, t) => {          // knees bent, arms out, body bounce
  const b = S(t * 8);
  c.body.position.y = -0.12 + Math.abs(b) * 0.1; c.body.rotation.set(0.15, S(t * 2) * 0.4, 0);
  c.legL.rotation.set(0.5 + b * 0.3, 0, -0.2); c.legR.rotation.set(0.5 - b * 0.3, 0, 0.2);
  c.armL.rotation.set(-0.3, 0, -1.3 + b * 0.3); c.armR.rotation.set(-0.3, 0, 1.3 - b * 0.3);
};
export const celebrate: Pose = (c, t) => {       // jump with both arms up
  const j = Math.max(0, S(t * 7));
  c.body.position.y = j * 0.35; c.legL.rotation.set(j * 0.5, 0, 0); c.legR.rotation.set(j * 0.5, 0, 0);
  c.armL.rotation.set(-2.8, 0, -0.2 - j * 0.3); c.armR.rotation.set(-2.8, 0, 0.2 + j * 0.3); c.body.rotation.set(0, 0, 0);
};
export const crowdCheer: Pose = (c, t) => {      // spectators: arms up, small hops, desynchronised by phase
  const j = Math.max(0, S(t * 6 + (c.group.id % 7)));
  c.body.position.y = j * 0.15; c.armL.rotation.set(-2.5 + j * 0.4, 0, -0.2); c.armR.rotation.set(-2.5 + j * 0.4, 0, 0.2);
  c.legL.rotation.set(0, 0, 0); c.legR.rotation.set(0, 0, 0); c.body.rotation.set(0, 0, 0);
};
export const crowdIdle: Pose = (c, t) => {
  c.body.position.y = 0; c.armL.rotation.set(-0.2 + S(t * 1.5 + c.group.id) * 0.05, 0, 0); c.armR.rotation.set(-0.2, 0, 0);
  c.legL.rotation.set(0, 0, 0); c.legR.rotation.set(0, 0, 0); c.body.rotation.set(0, 0, 0);
};
export const prep: Pose = (c, t) => {            // generic warm-up: crouch, stretch arms, stand
  const k = (S(t * 2.2) + 1) / 2;
  c.body.position.y = -0.35 * k; c.body.rotation.set(0.45 * k, 0, 0);
  c.legL.rotation.set(0.9 * k, 0, -0.1); c.legR.rotation.set(0.9 * k, 0, 0.1);
  c.armL.rotation.set(-1.4 * k - 0.2, 0, -0.6 * (1 - k)); c.armR.rotation.set(-1.4 * k - 0.2, 0, 0.6 * (1 - k));
};
export const drill: Pose = (c, t) => {           // training: stance and grip drill
  const b = S(t * 5);
  c.body.position.y = -0.2; c.body.rotation.set(0.35, b * 0.15, 0);
  c.legL.rotation.set(0.6, 0, -0.35); c.legR.rotation.set(-0.1, 0, 0.35);
  c.armL.rotation.set(-1.3 + b * 0.35, 0, -0.2); c.armR.rotation.set(-1.3 - b * 0.35, 0, 0.2);
};
export const drum: Pose = (c, t) => {            // percussionist
  const b = S(t * 12);
  c.body.position.y = -0.05; c.body.rotation.set(0.15, 0, 0); c.legL.rotation.set(0, 0, 0); c.legR.rotation.set(0, 0, 0);
  c.armL.rotation.set(-0.9 + b * 0.35, 0, 0); c.armR.rotation.set(-0.9 - b * 0.35, 0, 0);
};

export const EMOTES: Emote[] = [
  { id: 'pas1', label: 'Pas de danse 1 (provisoire)', pose: danceA, seconds: 5, reviewed: false },
  { id: 'pas2', label: 'Pas de danse 2 (provisoire)', pose: danceB, seconds: 5, reviewed: false },
  { id: 'fete', label: 'Célébration', pose: celebrate, seconds: 4, reviewed: false },
];
