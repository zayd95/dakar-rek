import { afterEach, describe, expect, it } from 'vitest';
import { setMuted } from '../src/core/audioSettings';
import { SOUND_CHECKS, soundBlocked, soundTest } from '../src/ui/soundTest';

describe('« Tester le son » (src/ui/soundTest.ts)', () => {
  afterEach(() => setMuted(false));
  it('offers every vehicle sound the game makes, and a plain test tone', () => {
    expect(SOUND_CHECKS.map(([k]) => k)).toEqual(['start', 'idle', 'accel', 'horn', 'tap', 'impact', 'bip']);
  });
  it('says why nothing can play, in words: the game\'s sound switched off first, then no gesture yet', () => {
    setMuted(true);
    expect(soundBlocked(false)).toMatch(/coupé/);
    setMuted(false);
    expect(soundBlocked(false)).toMatch(/geste/);                                        // no touch has reached this page yet (the iPhone rule)
  });
  it('a refused check plays nothing and leaves nothing running', () => {
    setMuted(true);
    expect(soundTest.play('accel')).toMatch(/coupé/);
    expect(soundTest.busy).toBeNull();
  });
  it('the panel always has its five lines', () => {
    expect(soundTest.status().map(r => r.label)).toEqual(['Son du jeu', 'Audio du téléphone', 'Enregistrements', 'Mode silencieux', 'Envoyé au haut-parleur']);
  });
});
