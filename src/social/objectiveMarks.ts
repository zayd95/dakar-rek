import type { Beat } from './beats';
import type { Step } from '../economy/progress';

/**
 * Which things the player's current objective points at, so a menu can mark the actions that belong to it with a gold star
 * (src/ui/sheet.ts). Pure: it reads the leads the game already computes (src/social/beats.ts `leads`: the story beat of a person, or an
 * economic step), never an action's name.
 * - a beat points at its person (`npcs`): the story item of that person's menu is the objective itself;
 * - an economic step points at a kind of place action (`specials`, the `special` of an Action): the Tiak Tiak pick-up for « first
 *   delivery », the furniture shop for « buy ».
 */
export interface ObjectiveMarks { npcs: ReadonlySet<string>; specials: ReadonlySet<string> }

const STEP_SPECIALS: Record<string, string> = { goal_tiak: 'jobs', goal_pickup: 'jobs', goal_deliver: 'jobs', goal_buy: 'shop' };

/** The marks of the current objective: the first lead (the one the goal line and the Carnet suggest), or nothing. */
export function objectiveMarks(lead: Beat | Step | null | undefined): ObjectiveMarks {
  const npcs = new Set<string>(), specials = new Set<string>();
  if (lead) {
    if ('npc' in lead) npcs.add(lead.npc);
    else if (STEP_SPECIALS[lead.id]) specials.add(STEP_SPECIALS[lead.id]);
  }
  return { npcs, specials };
}

/** Whether an action belongs to the current objective: its `special` kind is one a step points at. */
export const isObjectiveAction = (a: { id?: string; special?: string }, m: ObjectiveMarks) => !!a.special && m.specials.has(a.special);
