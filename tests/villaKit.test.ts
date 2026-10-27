import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { stubCanvas } from './hubstub';
import { digestCompound, type CompoundDigest } from './helpers/compoundDigest';
import { buildVillaCompound } from '../src/world/villaCompound';

/**
 * LD2.0-D round 2, lane R2-E: the Almadies villa kit (src/kits/almadiesVilla.ts). The villa as it stands on its lot stays exactly as it was:
 * tests/fixtures/villaCompoundOwn.json is the digest (tests/helpers/compoundDigest.ts) of everything the compound drew on its lot once the main entrance
 * was built (commit « the main entrance », before the kit), at both qualities.
 */
stubCanvas();
const FIX = 'tests/fixtures/villaCompoundOwn.json';
const now = { full: digestCompound(buildVillaCompound, false), lite: digestCompound(buildVillaCompound, true) };
// (pinned once, before the kit: UPDATE_VILLA_KIT_FIXTURE=1 npx vitest run tests/villaKit.test.ts writes it again)
if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.UPDATE_VILLA_KIT_FIXTURE === '1') writeFileSync(FIX, JSON.stringify(now, null, 1) + '\n');
const was = JSON.parse(new TextDecoder().decode(readFileSync(FIX))) as Record<'full' | 'lite', CompoundDigest>;

describe('the villa built from the kit', () => {
  for (const q of ['full', 'lite'] as const) it(`(${q}) is the villa as it was, primitive for primitive, box for box`, () => {
    expect(now[q].batches).toEqual(was[q].batches);
    expect(now[q].meshes).toEqual(was[q].meshes);
    expect(now[q].colliders).toEqual(was[q].colliders);
    expect(now[q].canopies).toEqual(was[q].canopies);
    expect(now[q].keepClear).toEqual(was[q].keepClear);
    expect(now[q].pools).toEqual(was[q].pools);
    expect(now[q].heli).toEqual(was[q].heli);
  });
});
