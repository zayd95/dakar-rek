import type { GameCtx, GameModule } from '../game/modules';
import type { HubWorld } from '../world/types';
import * as P from '../activity/primitives';
import type { PlaceSpec } from '../activity/places';
import { WALL_R, TUNNEL_MOUTH_R } from '../world/geew';
import { PREP_SIDE, prepCornerCentre } from '../world/arenaModules';

/**
 * « Spectateur OU combattant » (Habib's spec §3): the evening of a player who fights tonight, as a sequence of places and
 * cues on the arena's existing pieces — no new mechanics. Someone (the career lane's « Petit combat de quartier ») calls
 * `arenaFighter.begin()`; the player is sent to the « Entrée des lutteurs » behind the arena, walks the wrestlers' tunnel
 * to their écurie's preparation corner, waits a short moment there (their people around, the drums louder), walks to the
 * ring on cue, fights the existing duel (`ctx.startBout`, src/lamb/duel.ts unchanged), then walks back out through the
 * tunnel. Cues (`arenaFighter.onCue`) let the stands react (crowd lane), the people inside gather (venues lane), the sound
 * follow. Fighters need no ticket: the visit's gate controller lets them in (`arenaFighter.pending()`).
 */
export type FighterPhase = 'idle' | 'called' | 'tunnel' | 'prep' | 'ring' | 'bout' | 'return';
/** Moments others react to: sent to the gate, in the tunnel, in the corner, walking out to the ring, the bout, its result, out. */
export type FighterCue = 'called' | 'tunnel' | 'prep' | 'walk-out' | 'bout' | 'result' | 'exit';
export interface FighterBout { mode: 'amical' | 'classe'; style?: string; opponent?: string }

/** Seconds in the corner before the cue to walk out (the player can say « Je suis prêt » sooner). */
export const PREP_SECONDS = 8;

let ctxRef: GameCtx | null = null;
let bout: (FighterBout & { day: number; ecurie: 'baobab' | 'teranga'; member: boolean }) | null = null;
let phase: FighterPhase = 'idle';
/** When the moment in the corner ends (real time: a short pause, whatever the frame rate). */
let prepUntil = 0;
const listeners = new Set<(cue: FighterCue) => void>();
const cue = (c: FighterCue) => { for (const fn of listeners) fn(c); };

/** Where the steps of the path are, for an arena centred on (cx, cz) and the player's corner. */
export function fighterSpots(cx: number, cz: number, ecurie: 'baobab' | 'teranga') {
  const corner = prepCornerCentre(cx, cz, PREP_SIDE[ecurie]);
  return {
    gate: { x: cx, z: cz + WALL_R + 2.6 },                     // outside the wrestlers' gate
    tunnel: { x: cx, z: cz + 19.2 },                           // inside the covered passage
    corner,
    ring: { x: cx, z: cz + 10.4 },                             // the end of the runner, at the sandbags
    inTunnel: (x: number, z: number) => Math.abs(x - cx) < 2.1 && z > cz + TUNNEL_MOUTH_R - 0.5 && z < cz + WALL_R + 0.5,
    outside: (x: number, z: number) => Math.abs(x - cx) < 6 && z > cz + WALL_R + 1.2,
  };
}

export const arenaFighter = {
  /**
   * The player fights tonight at the Arène de Pikine: instead of starting the duel at once, the evening's path begins
   * (« Entrée des lutteurs » → tunnel → corner → ring → duel → tunnel). Returns false if a bout is already on its way.
   */
  begin(b: Partial<FighterBout> = {}): boolean {
    const ctx = ctxRef; if (!ctx || (bout && phase !== 'idle')) return false;
    const member = ctx.state.data.flags.includes('ecurie_baobab');
    bout = { mode: b.mode ?? 'classe', style: b.style, opponent: b.opponent, day: ctx.day(), ecurie: member ? 'baobab' : 'teranga', member };
    refreshSpots(ctx);                                                        // the corner of this bout's écurie, now
    go(ctx, 'called');
    return true;
  },
  /** A bout is on its way for the player (no ticket needed at the gate). */
  pending: () => !!bout && phase !== 'idle',
  phase: () => phase,
  /** The player's corner (écurie side) while a bout is on its way. */
  corner: () => (bout && phase !== 'idle' ? bout.ecurie : null),
  /** Tonight's opponent's name while a bout is on its way (null: none, or not named). */
  opponent: () => (bout && phase !== 'idle' ? bout.opponent ?? null : null),
  /** Listen to the path's moments (the stands react, the entourage gathers…); returns the unsubscribe function. */
  onCue(fn: (c: FighterCue) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  /** Give up tonight's bout before it starts. */
  cancel() { if (ctxRef && phase !== 'bout') { bout = null; go(ctxRef, 'idle'); } },
};

const ids = (hub: string) => ({ gate: `${hub}:arena:lutteurs`, corner: `${hub}:arena:coin`, ring: `${hub}:arena:cercle` });

/** Move to a phase: the walking marker, a word, the cue. */
function go(ctx: GameCtx, next: FighterPhase) {
  phase = next;
  const w = ctx.world(), hub = w?.id ?? 'pikine', id = ids(hub), here = !!w?.arena;
  const corner = bout?.member ? 'ton coin, celui de l’écurie Baobab' : 'ton coin, à côté du tunnel';
  switch (next) {
    case 'called':
      ctx.walkTo(here ? id.gate : null);
      ctx.toast(here ? 'Tu combats ce soir : passe par l’« Entrée des lutteurs », derrière l’arène.' : 'Tu combats ce soir à l’Arène de Pikine : entrée des lutteurs, derrière l’arène.');
      cue('called'); break;
    case 'tunnel':
      ctx.walkTo(id.corner); ctx.toast(`Le tunnel des lutteurs. Rejoins ${corner}.`); cue('tunnel'); break;
    case 'prep':
      ctx.walkTo(null); prepUntil = performance.now() + PREP_SECONDS * 1000;
      ctx.toast('Ton entourage t’entoure, les tambours redoublent. Prépare-toi…'); cue('prep'); break;
    case 'ring':
      ctx.walkTo(id.ring); ctx.toast('C’est l’heure : avance jusqu’au cercle.'); cue('walk-out'); break;
    case 'bout': {
      ctx.walkTo(null); cue('bout');
      const b = bout!;
      const started = ctx.startBout(b.mode, b.style, () => { if (phase === 'bout') go(ctx, 'return'); });
      if (!started) { phase = 'ring'; ctx.toast('Le combat ne peut pas commencer maintenant.'); }
      break;
    }
    case 'return':
      ctx.walkTo(id.gate); ctx.toast('Retour par le tunnel des lutteurs.'); cue('result'); break;
    case 'idle':
      ctx.walkTo(null); break;
  }
}

/** The places of the path (shown only at their moment): the wrestlers' gate, the corner, the ring's edge. */
function places(hub: HubWorld, s: ReturnType<typeof fighterSpots>): PlaceSpec[] {
  const id = ids(hub.id);
  return [
    { id: id.gate, type: 'fighters', name: 'Entrée des lutteurs', space: 'street', anchors: [{ id: 'porte', kind: 'door', x: s.gate.x, z: s.gate.z, radius: 2.4 }], offers: { porte: [
      P.enter({ id: 'entrer', label: 'Entrer · Entrée des lutteurs', detail: 'Ton combat est ce soir', visible: () => phase === 'called',
        then: () => { const c = ctxRef; if (!c) return; c.player.place(s.tunnel.x, s.tunnel.z, Math.PI); go(c, 'tunnel'); } }),
    ] } },
    { id: id.corner, type: 'fighters', name: 'Ton coin', space: 'street', anchors: [{ id: 'coin', kind: 'spot', x: s.corner.x, z: s.corner.z, radius: 2.2 }], offers: { coin: [
      P.use({ id: 'pret', label: 'Je suis prêt', detail: 'Aller au cercle tout de suite', seconds: 0.5, primitive: 'talk', visible: () => phase === 'prep',
        then: () => { if (ctxRef) go(ctxRef, 'ring'); } }),
    ] } },
    { id: id.ring, type: 'fighters', name: 'Le cercle', space: 'street', anchors: [{ id: 'cercle', kind: 'spot', x: s.ring.x, z: s.ring.z, radius: 2.0 }], offers: { cercle: [
      P.enter({ id: 'combat', label: 'Entrer dans le cercle', detail: 'Le combat commence', visible: () => phase === 'ring', then: () => { if (ctxRef) go(ctxRef, 'bout'); } }),
    ] } },
  ];
}

let spots: ReturnType<typeof fighterSpots> | null = null;
let spotsFor: 'baobab' | 'teranga' | null = null;
/** The path's spots for the current bout's écurie (or Baobab's when no bout), in the current hub's arena. */
function refreshSpots(ctx: GameCtx) {
  const a = ctx.world()?.arena, e = bout?.ecurie ?? 'baobab';
  if (a && (!spots || spotsFor !== e)) { spots = fighterSpots(a.cx, a.cz, e); spotsFor = e; }
}

export const fighterModule: GameModule = {
  name: 'arenaFighter',
  init(ctx) { ctxRef = ctx; },
  hubLoaded(ctx, hub) {
    spots = null;
    if (!hub.arena) { if (bout && phase !== 'idle' && phase !== 'bout') phase = 'called'; return; }
    spots = fighterSpots(hub.arena.cx, hub.arena.cz, bout?.ecurie ?? 'baobab'); spotsFor = bout?.ecurie ?? 'baobab';
    const id = ids(hub.id);
    // invisible targets for the walking marker (radius −1: never focused, never in the places directory)
    for (const [k, p, name] of [['gate', spots.gate, 'Entrée des lutteurs'], ['corner', spots.corner, 'Ton coin'], ['ring', spots.ring, 'Le cercle']] as const) {
      hub.interactables.push({ id: id[k], name, kind: 'actions', x: p.x, z: p.z, radius: -1, actions: [] });
    }
    for (const p of places(hub, spots)) ctx.places.add(p);
    if (bout && phase !== 'idle') go(ctx, phase === 'return' ? 'return' : 'called');
  },
  update(ctx) {
    if (!bout || phase === 'idle' || phase === 'bout') return;
    if (ctx.day() !== bout.day && phase === 'called') { bout = null; go(ctx, 'idle'); return; }   // the evening went by
    const w = ctx.world(); if (!w?.arena) return;
    refreshSpots(ctx);
    const p = ctx.player.pos, s = spots!;
    switch (phase) {
      case 'called': if (s.inTunnel(p.x, p.z)) go(ctx, 'tunnel'); break;
      case 'tunnel': if (Math.hypot(p.x - s.corner.x, p.z - s.corner.z) < 2.2) go(ctx, 'prep'); break;
      case 'prep': if (performance.now() >= prepUntil) go(ctx, 'ring'); break;
      case 'ring': if (Math.hypot(p.x - s.ring.x, p.z - s.ring.z) < 1.2 && ctx.mode() === 'play') go(ctx, 'bout'); break;
      case 'return': if (s.outside(p.x, p.z)) { bout = null; go(ctx, 'idle'); ctx.toast('Ba beneen yoon ! La soirée continue dehors.'); cue('exit'); } break;
    }
  },
  debug: ctx => ({
    /** The fighter's path: phase, corner, the steps' positions (always those of tonight's écurie). */
    fighter: () => { refreshSpots(ctx); return { phase, bout, prep: phase === 'prep' ? Math.max(0, +((prepUntil - performance.now()) / 1000).toFixed(1)) : 0, spots: spots ? { gate: spots.gate, tunnel: spots.tunnel, corner: spots.corner, ring: spots.ring } : null }; },
    fighterBegin: (mode: 'amical' | 'classe' = 'classe', style?: string) => arenaFighter.begin({ mode, style }),
    fighterCancel: () => arenaFighter.cancel(),
  }),
};
