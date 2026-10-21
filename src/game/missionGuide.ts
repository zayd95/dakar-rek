import type { HubId } from '../core/types';

/**
 * The way-finding pin for a task in hand (an errand for Pape Sarr, a VTC passenger to pick up or drop off): the module that owns the task says where
 * to go and, when that is in another district, what the goal line should say. src/main.ts `guideTarget` asks here after the player's own destination.
 */
export interface MissionTarget { name: string; hub: HubId; x: number; z: number; /** The goal line (« 🚕 … »), shown in any district. */ hint?: string }
const providers: (() => MissionTarget | null)[] = [];
export const addMissionGuide = (f: () => MissionTarget | null) => { providers.push(f); };
/** The first task in hand with a target (in any district). */
export function missionTarget(): MissionTarget | null { for (const f of providers) { const t = f(); if (t) return t; } return null; }
