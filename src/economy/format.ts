/** Same format as the HUD's fcfa() (src/ui/hud.ts: narrow no-break space between thousands, no-break space before F),
 * without importing the DOM-side module into pure logic. */
export const fcfaText = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f') + '\u00a0F';
