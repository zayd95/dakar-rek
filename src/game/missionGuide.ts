import type { HubId } from '../core/types';

/**
 * The way-finding pin for a task in hand (an errand for Pape Sarr, a VTC passenger to pick up or drop off): the module that owns the task says where
 * to go and, when that is in another district, what the goal line should say. src/main.ts `guideTarget` asks here after the player's own destination.
 */
export interface MissionTarget {
  name: string; hub: HubId; x: number; z: number; /** The goal line (« 🚘 … »), shown in any district. */ hint?: string;
  /** A job's target is marked as that job everywhere (src/ui/jobMarks.ts: a VTC ride green with a car, a delivery orange with a parcel). */
  job?: 'vtc' | 'delivery';
  /** Heading of the kerb where a car stops for it (a VTC pick-up or drop-off): its bay is drawn on the road. */
  yaw?: number;
}
const providers: (() => MissionTarget | null)[] = [];
export const addMissionGuide = (f: () => MissionTarget | null) => { providers.push(f); };
/** The first task in hand with a target (in any district). */
export function missionTarget(): MissionTarget | null { for (const f of providers) { const t = f(); if (t) return t; } return null; }
