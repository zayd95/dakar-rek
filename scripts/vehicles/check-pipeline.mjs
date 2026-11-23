// The vehicle pipeline's own gates, on the stand-in source: a model that would have to be stretched too far is refused unless it is
// declared a stand-in; a source without wheels and without a wheel library is refused. Writes only to a temporary folder.
// Usage: node scripts/vehicles/check-pipeline.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = path.resolve(import.meta.dirname, '../..'), script = path.join(repo, 'scripts/vehicles/prepare-vehicle-glb.mjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glbveh-'));
let failed = 0; const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); if (!ok) failed++; };
const man = (name, extra) => {
  const f = path.join(dir, `${name}.json`);
  fs.writeFileSync(f, JSON.stringify({ id: 't', provenance: {}, source: path.join(repo, 'assets-src/vehicles/sources/kenney-truck-red.glb'), target: path.join(repo, 'assets-src/vehicles/target-compacte.json'), out: path.join(dir, `${name}.glb`), ...extra }));
  return f;
};
const run = f => spawnSync('node', [script, f], { cwd: repo, encoding: 'utf8' });
const strict = run(man('strict', { standIn: false }));
check('a model needing a 1.35 stretch is refused (exit 1, the stretch check fails)', strict.status === 1 && /FAIL\s+body stretch/.test(strict.stdout), `exit ${strict.status}`);
const lenient = run(man('standin', { standIn: true }));
check('the same model declared a stand-in is accepted, and says so', lenient.status === 0 && /STAND-IN/.test(lenient.stdout), `exit ${lenient.status}`);
const side = JSON.parse(fs.readFileSync(path.join(dir, 'standin.json'), 'utf8'));
check('its sidecar lists four separate wheels on the ground and every check passed', side.wheels.length === 4 && side.wheels.every(w => Math.abs(w.bottom) < 0.002) && side.checks.every(c => c.ok));
const noWheels = run(man('nowheels', { standIn: true, wheelNodes: '^nothing-matches$' }));
check('a body without wheels and without a wheel library is refused', noWheels.status === 2 && /no wheel nodes/.test(noWheels.stderr), `exit ${noWheels.status}`);
fs.rmSync(dir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
