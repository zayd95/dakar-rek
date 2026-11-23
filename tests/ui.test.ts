import { describe, it, expect } from 'vitest';
import { bubbleX, fcfa, goalParts, splitIcon, toastParts } from '../src/ui/hud';
import { priceClass } from '../src/ui/sheet';

describe('UI helpers (docs/UI.md)', () => {
  it('prices: gains green, costs neutral, marks plain', () => {
    expect(priceClass('+1 200 F')).toBe('gain');
    expect(priceClass('−500 F')).toBe('cost');
    expect(priceClass('-500 F')).toBe('cost');
    expect(priceClass('✓')).toBe('');
    expect(priceClass('1 500 F')).toBe('');
    expect(priceClass('Payer')).toBe('pay');                     // the price is in the row's label, said first
    expect(priceClass('Payeur')).toBe('');
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
  it('amounts in F CFA with grouped thousands, uncapped (economy format)', () => {
    expect(fcfa(1250000000).replace(/\s/g, ' ')).toBe('1 250 000 000 F');
    expect(toastParts('Achat ✓  ' + '−' + fcfa(25000))[1].amount).toBe('cost');
    expect(priceClass('+' + fcfa(1200))).toBe('gain');
  });
  it('a bubble with its reason stays on screen on a phone in portrait, its tail still pointing at the target', () => {
    const W = 390, half = Math.min(140, W * 0.39);
    expect(bubbleX(195, half, W)).toEqual({ x: 195, tail: 0 });                                   // centred: nothing moves
    for (const x of [-19, 0, 30, 120, 270, 360, 409]) {                                           // the target may be 5 % off screen
      const b = bubbleX(x, half, W);
      expect(b.x - half).toBeGreaterThanOrEqual(8); expect(b.x + half).toBeLessThanOrEqual(W - 8);
      expect(Math.abs(b.tail)).toBeLessThanOrEqual(half - 16);                                    // the tail stays on the card
      if (Math.abs(x - b.x) <= half - 16) expect(b.x + b.tail).toBe(Math.round(x));               // and points at the target when it can
    }
    expect(bubbleX(50, 300, 390).x).toBe(195);                                                    // wider than the screen: centred
  });
  it('the goal line: a distance at its end goes to its own slot (never wrapped from its number)', () => {
    expect(goalParts('Billet en poche : entre par la porte de l’arène · 6 m')).toEqual({ text: 'Billet en poche : entre par la porte de l’arène', dist: '6 m' });
    expect(goalParts('Après le combat : Dibiterie Chez Pathé, ouvert jusqu’à 2 h · 49 m')).toEqual({ text: 'Après le combat : Dibiterie Chez Pathé, ouvert jusqu’à 2 h', dist: '49 m' });
    expect(goalParts('Parle à Tonton Ibou, devant ta chambre (Pikine).')).toEqual({ text: 'Parle à Tonton Ibou, devant ta chambre (Pikine).', dist: '' });
    expect(goalParts('Ton billet au guichet · 1 000 F')).toEqual({ text: 'Ton billet au guichet · 1 000 F', dist: '' });
  });
});
