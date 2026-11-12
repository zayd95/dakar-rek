import type { Rhythm } from '../lamb/audio';
import { hasGestured } from './hearing';
import { arenaSound, type Hearing } from './soundscape';

/**
 * The sound of a fight evening around and inside the arena, as src/arena/exterior.ts asks for it every frame: the
 * drummers (by the gate, on the deck inside) and the crowd (the queue's murmur, the stands). The sound itself is the
 * authored làmb soundscape of src/arena/soundscape.ts (sabar loops by phase, crowd beds, one-shots); loudness comes
 * from src/arena/exteriorRules.ts (distance, interiors, the sound setting); the master gain of src/lamb/audio.ts also
 * follows the sound setting. Nothing is created before the player's first tap, click or key (browsers only let an
 * AudioContext play after a user gesture).
 */
export { hasGestured, listenForGesture } from './hearing';
let rhythm: Rhythm = 'gala';
/** The evening's drums change rhythm for a wrestler's bàkk (src/arena/ceremony.ts), then go back ('gala'). */
export function drumRhythm(r?: Rhythm): Rhythm { if (r) rhythm = r; return rhythm; }

/** What exterior.ts knows besides the two loudnesses: the show, where the player is, which side the drummers are on. */
export type HearingExtra = Omit<Hearing, 'drums' | 'murmur' | 'rhythm'>;

export class ExteriorAudio {
  /** Loudness asked for (0..1 each), whatever the audio state. */
  level = { drums: 0, murmur: 0 };

  /** Called every frame with the loudness of each sound (and, near an arena, the rest of what decides it); both at 0 and no show heard: silence. */
  set(drums: number, murmur: number, extra?: HearingExtra) {
    this.level = { drums, murmur };
    arenaSound.update(extra ? { ...extra, drums, murmur, rhythm } : drums > 0 || murmur > 0 ? { ...QUIET, drums, murmur, rhythm } : null);
  }
  /** A new hub, or the evening gone: every loop stops at once. */
  stop() { this.level = { drums: 0, murmur: 0 }; arenaSound.stopWorld(); }

  /** For the checks: what is playing and how loud (the gains' targets), the loops, the bank. */
  info() {
    const s = arenaSound.info();
    return {
      gestured: hasGestured(), playing: !!s.playing.drums, murmuring: !!s.playing.bed, rhythm,
      drums: s.playing.drums ? this.level.drums : 0, murmur: s.playing.bed ? this.level.murmur : 0,
      context: s.context, loop: s.playing.drums, bed: s.playing.bed, sound: s,
    };
  }
}
/** Hearing without an arena's show (the callers that only know the two loudnesses). */
const QUIET: Omit<Hearing, 'drums' | 'murmur' | 'rhythm'> = { phase: 'idle', fighter: null, party: false, within: false, standsDist: 1e9, crowd: 0, pan: 0, occluded: false, indoors: false, muted: false };
