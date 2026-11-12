import { it, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { stubCanvas } from './hubstub';
import { digestHub } from './helpers/lotDigest';

/**
 * Writes a hub digest outside some rectangles (the fixtures the street-unchanged tests compare against): only when asked, at the commit the fixture is
 * to describe, e.g. the district's:
 *   WRITE_DIGEST=tests/fixtures/almadiesOutsideDistrict.json DIGEST_RECTS=<rects.json> DIGEST_BASE=<commit> npx vitest run tests/writeDigest.test.ts
 * (the rectangles: a JSON array of { x0, z0, x1, z1 }).
 */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
stubCanvas();
const facade = vi.hoisted(() => ({ depth: 0 }));
vi.mock('../src/housing/villaFacade', async importOriginal => {
  const m = await importOriginal<typeof import('../src/housing/villaFacade')>();
  return { ...m, buildVillaFacade: (...a: Parameters<typeof m.buildVillaFacade>) => { facade.depth++; try { return m.buildVillaFacade(...a); } finally { facade.depth--; } } };
});
it.runIf(!!env.WRITE_DIGEST)('writes the Almadies digest outside the rectangles', async () => {
  const rects = JSON.parse(new TextDecoder().decode(readFileSync(env.DIGEST_RECTS!))), { buildHub } = await import('../src/world/builder');
  const out: Record<string, unknown> = { base: env.DIGEST_BASE ?? '', rects };
  for (const q of ['full', 'lite'] as const) out[q] = await digestHub(() => buildHub('almadies', q === 'lite'), rects, 0.3, () => facade.depth > 0);
  writeFileSync(env.WRITE_DIGEST!, JSON.stringify(out));
}, 180_000);
