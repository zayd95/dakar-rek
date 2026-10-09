import { describe, it, expect } from 'vitest';
import { fcfa, splitIcon, toastParts } from '../src/ui/hud';
import { priceClass } from '../src/ui/sheet';

describe('UI helpers (docs/UI.md)', () => {
  it('prices: gains green, costs neutral, marks plain', () => {
    expect(priceClass('+1 200 F')).toBe('gain');
    expect(priceClass('−500 F')).toBe('cost');
    expect(priceClass('-500 F')).toBe('cost');
    expect(priceClass('✓')).toBe('');
    expect(priceClass('1 500 F')).toBe('');
  });
  it('a leading emoji becomes the icon, the rest stays the label', () => {
    expect(splitIcon('✋ Arrêter')).toEqual({ icon: '✋', text: 'Arrêter' });
    expect(splitIcon('🛏️ Dormir')).toEqual({ icon: '🛏️', text: 'Dormir' });
    expect(splitIcon('S’asseoir')).toEqual({ icon: '', text: 'S’asseoir' });
    expect(splitIcon('Jus & Go')).toEqual({ icon: '', text: 'Jus & Go' });
  });
  it('toasts: bits joined by two spaces, amounts as chips', () => {
    expect(toastParts('Jus de bouye frais ✓  −500 F')).toEqual([{ text: 'Jus de bouye frais ✓' }, { text: '−500 F', amount: 'cost' }]);
    expect(toastParts('Débarquer ✓  +3 200 F')[1]).toEqual({ text: '+3 200 F', amount: 'gain' });
    expect(toastParts('Maleekum salaam !')).toEqual([{ text: 'Maleekum salaam !' }]);
  });
  it('amounts in F CFA with grouped thousands, uncapped', () => {
    expect(fcfa(1250000000)).toBe('1 250 000 000 F');
  });
});
