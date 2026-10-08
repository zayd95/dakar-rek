/** Same format as the HUD's fcfa() (src/ui/hud.ts), without importing the DOM-side module into pure logic. */
export const fcfaText = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F';
