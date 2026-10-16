/**
 * Test links for preview builds only: `?heure=17.5` holds the city clock at that hour (the evening match at the
 * Corniche pitch plays for as long as the page stays open), `?argent=1000000` tops the device wallet up to that amount.
 * Honoured on local dev and on Cloudflare preview hosts (`<branch>-dakar-rek.<account>.workers.dev`), never on the
 * production host: a preview has its own origin, so its wallet is not the production save.
 */
export interface TestParams { hour: number | null; money: number | null; /** `?meteo=pluie|apres|couvert|soleil`: holds the weather (the rain of the Pikine gare is seen on demand). */ weather: 'rain' | 'after' | 'overcast' | 'sun' | null }

const PREVIEW_HOST = /^[a-z0-9-]+-dakar-rek\.[a-z0-9-]+\.workers\.dev$/;

export function isTestHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || PREVIEW_HOST.test(hostname);
}

export function readTestParams(hostname: string, search: string): TestParams {
  const none: TestParams = { hour: null, money: null, weather: null };
  if (!isTestHost(hostname)) return none;
  const q = new URLSearchParams(search);
  const h = Number(q.get('heure'));
  const m = Number(q.get('argent'));
  return {
    hour: q.has('heure') && Number.isFinite(h) && h >= 0 && h < 24 ? h : null,
    money: q.has('argent') && Number.isFinite(m) && m > 0 ? Math.min(Math.floor(m), 1e12) : null,
    weather: ({ pluie: 'rain', apres: 'after', couvert: 'overcast', soleil: 'sun' } as const)[q.get('meteo') as 'pluie'] ?? null,
  };
}
