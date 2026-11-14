/**
 * Test links for preview builds only: `?heure=17.5` holds the city clock at that hour (the evening match at the
 * Corniche pitch plays for as long as the page stays open), `?argent=1000000` tops the device wallet up to that amount.
 * Honoured on local dev and on Cloudflare preview hosts (`<branch>-dakar-rek.<account>.workers.dev`), never on the
 * production host: a preview has its own origin, so its wallet is not the production save.
 */
export interface TestParams { hour: number | null; money: number | null; /** `?avatar=homme|femme|v4|choisir`: forces the player's body for the session, or shows the New Game choice in a `?debug` run (which skips it by default). */ avatar: 'homme' | 'femme' | 'v4' | 'choose' | null; /** `?meteo=pluie|apres|couvert|soleil`: holds the weather (the rain of the Pikine gare is seen on demand). */ weather: 'rain' | 'after' | 'overcast' | 'sun' | null; /** `?intro`: plays the opening fly-in at this start, whatever the device has seen and in a `?debug` run too (src/game/opening.ts, scripts/check-opening.mjs). */ intro: boolean; /** `?pouce`: keeps « Coups de pouce » on in a `?debug` run, which has it off otherwise (src/economy/pouce.ts `pouceWanted`, scripts/check-coups-de-pouce.mjs). */ pouce: boolean }

const PREVIEW_HOST = /^[a-z0-9-]+-dakar-rek\.[a-z0-9-]+\.workers\.dev$/;
/**
 * An offline preview build (`VITE_PREVIEW_TEST=true`, set only by whoever builds one) served where the page cannot receive a query string, such as a private
 * claude.ai artifact: it is a test host by construction and carries its test link in `VITE_PREVIEW_SEARCH` (e.g. `?argent=200000000`). The preview has its own
 * origin, so its wallet is never a production save, and a production build sets neither variable.
 */
const PREVIEW_BUILD = import.meta.env.VITE_PREVIEW_TEST === 'true';

export function isTestHost(hostname: string): boolean {
  return PREVIEW_BUILD || hostname === 'localhost' || hostname === '127.0.0.1' || PREVIEW_HOST.test(hostname);
}

/**
 * What the `?debug` API (`window.__dakar`, src/main.ts) keeps on a host that is not a test host: the public game. `?debug` works on every host (the
 * public smoke test, scripts/check-public-smoke.mjs, moves through the published build with it), but only these hooks exist there — the ones that read
 * the game (position, camera, focus, presence, the frame's cost) and the moves of that smoke test (a district, the phone). Nothing that makes money
 * or value or changes the economy or a save's progress (the game state itself, `giveMoney`, jobs completed, rent, loans, purchases, story choices,
 * the modules' check hooks): those stay on test hosts, like `?argent=`.
 */
export const PUBLIC_DEBUG_HOOKS: readonly string[] = [
  'hubs', 'pos', 'camera', 'camInfo', 'focus', 'nearestInteractable', 'presence', 'drawCalls', 'tris', 'perfOn', 'perf', 'crossMs', 'textures', 'hudTicks', 'cityDay',
  'teleport', 'phone', 'phoneInfo', 'phoneClose',
];

/** The `?debug` API for this host: all of it on a test host, only `PUBLIC_DEBUG_HOOKS` elsewhere. */
export function debugApiFor<T extends Record<string, unknown>>(hostname: string, api: T): Partial<T> {
  if (isTestHost(hostname)) return api;
  const out: Record<string, unknown> = {};
  for (const k of PUBLIC_DEBUG_HOOKS) if (k in api) out[k] = api[k];
  return out as Partial<T>;
}

export function readTestParams(hostname: string, search: string): TestParams {
  const none: TestParams = { hour: null, money: null, avatar: null, weather: null, intro: false, pouce: false };
  if (!isTestHost(hostname)) return none;
  const q = new URLSearchParams(PREVIEW_BUILD ? import.meta.env.VITE_PREVIEW_SEARCH ?? '' : '');      // a preview build's own link, which a query of the page can still override
  for (const [k, v] of new URLSearchParams(search)) q.set(k, v);
  const h = Number(q.get('heure'));
  const m = Number(q.get('argent'));
  return {
    hour: q.has('heure') && Number.isFinite(h) && h >= 0 && h < 24 ? h : null,
    money: q.has('argent') && Number.isFinite(m) && m > 0 ? Math.min(Math.floor(m), 1e12) : null,
    avatar: ({ homme: 'homme', femme: 'femme', v4: 'v4', choisir: 'choose' } as const)[q.get('avatar') as 'homme'] ?? null,
    weather: ({ pluie: 'rain', apres: 'after', couvert: 'overcast', soleil: 'sun' } as const)[q.get('meteo') as 'pluie'] ?? null,
    intro: q.has('intro'),
    pouce: q.has('pouce'),
  };
}
