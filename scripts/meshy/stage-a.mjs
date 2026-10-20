// The player-owned car lineup's Meshy runner (assets-src/vehicles/briefs.json): modern sedan (Stage A, first), sport sedan (B), premium SUV (C).
// NOTHING HERE RUNS A PAID STEP WITHOUT TWO THINGS: the brief is `released` in briefs.json (only Stage A is) AND the exact step is approved in the
// environment as MESHY_APPROVED=<brief>:<step>. `plan` (the default) only prints, writes docs/assets/STAGE_A.json and reads the balance.
//
//   node scripts/meshy/stage-a.mjs plan                                                      # all three briefs, steps, caps; free
//   MESHY_APPROVED=modern_sedan:preview node scripts/meshy/stage-a.mjs preview modern_sedan  # 20 credits: the initial preview
//   MESHY_APPROVED=modern_sedan:refine  PREVIEW_ID=<id> node scripts/meshy/stage-a.mjs refine modern_sedan   # 10: only after the preview is approved by eye
//   MESHY_APPROVED=modern_sedan:remesh  TASK_ID=<id>    node scripts/meshy/stage-a.mjs remesh modern_sedan    # 5: only after the refine is approved by eye
//
// Every paid step reads the balance before and after, refuses below its cap, reports what was spent, and writes its task JSON and the GLB to the
// PRIVATE git-excluded folder assets-src/meshy_output/<brief>/ (raw Meshy sources and their signed URLs never go to GitHub). The GLB download is
// written for the CLI's result shape and has not been run against a live task (by design: no spend yet).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '../..'), data = JSON.parse(fs.readFileSync(path.join(repo, 'assets-src/vehicles/briefs.json'), 'utf8'));
const cli = (...a) => { const r = spawnSync('npx', ['-y', '@meshy-ai/cli', ...a], { encoding: 'utf8', maxBuffer: 1 << 26 }); if (r.status !== 0) throw new Error((r.stderr || r.stdout).slice(0, 600)); return JSON.parse(r.stdout); };
const balance = () => cli('api', 'GET', '/balance').balance;
const argsOf = (step, brief, id, save) => ({
  preview: ['text-to-3d', 'create', '--mode', 'preview', '--prompt', brief.prompt, '--target-formats', 'glb', '--save-json', save],
  refine: ['text-to-3d', 'create', '--mode', 'refine', '--preview-task-id', id, '--enable-pbr', 'false', '--texture-resolution', '2k', '--target-formats', 'glb', '--save-json', save],
  remesh: ['remesh', 'create', '--input-task-id', id, '--topology', 'triangle', '--target-polycount', '15000', '--target-formats', 'glb', '--save-json', save],
})[step];
const NEED = { refine: 'PREVIEW_ID', remesh: 'TASK_ID' };

const step = process.argv[2] ?? 'plan';
if (step === 'plan') {
  const plan = {
    note: 'Nothing is generated until a brief is released AND each step is approved: MESHY_APPROVED=<brief>:<step>',
    balance: balance(), private: 'assets-src/meshy_output/<brief>/ (git-excluded)', steps: data.steps,
    briefs: data.briefs.map(b => ({ order: b.order, id: b.id, stage: b.stage, released: b.released, title: b.title, inspiredBy: b.inspiredBy, slot: b.slot, role: b.role, colour: b.colour, promptChars: b.prompt.length, prompt: b.prompt, creditsIfAllApproved: 35, gates: Object.keys(data.steps).map(k => `MESHY_APPROVED=${b.id}:${k}${NEED[k] ? ` ${NEED[k]}=<id>` : ''}`) })),
  };
  fs.writeFileSync(path.join(repo, 'docs/assets/STAGE_A.json'), JSON.stringify(plan, null, 1) + '\n');
  for (const b of plan.briefs) console.log(`${b.order}. ${b.id} (stage ${b.stage}, ${b.released ? 'RELEASED, gated' : 'not released'}) -> catalogue ${b.slot.asset}; 35 credits if every step is approved (20 + 10 + 5)`);
  console.log('balance', plan.balance); process.exit(0);
}
const S = data.steps[step], brief = data.briefs.find(b => b.id === (process.argv[3] ?? 'modern_sedan'));
if (!S || !brief) { console.error('usage: plan | preview|refine|remesh [brief]   briefs: ' + data.briefs.map(b => b.id).join(', ')); process.exit(2); }
if (!brief.released) { console.error(`REFUSED: ${brief.id} (stage ${brief.stage}) is not released. Stage A, the modern sedan, goes first; the others are only briefs.`); process.exit(3); }
if (process.env.MESHY_APPROVED !== `${brief.id}:${step}`) { console.error(`REFUSED: ${brief.id} ${step} costs ${S.credits} credits and is not approved. Set MESHY_APPROVED=${brief.id}:${step}${step === 'preview' ? '' : ' after the previous step was approved by eye'}.`); process.exit(3); }
const id = NEED[step] ? process.env[NEED[step]] : null;
if (NEED[step] && !id) { console.error(`REFUSED: ${NEED[step]} is required.`); process.exit(3); }
const before = balance();
if (before < S.credits) { console.error(`REFUSED: balance ${before} is under the ${S.credits}-credit cap.`); process.exit(3); }
const priv = path.join(repo, 'assets-src/meshy_output', brief.id); fs.mkdirSync(priv, { recursive: true });
console.log(`${brief.id} ${step}: ${S.what}; cap ${S.credits}; balance ${before}`);
const result = cli(...argsOf(step, brief, id, path.join(priv, `${step}-${Date.now()}.json`)));
const after = balance(), spent = before - after;
console.log(JSON.stringify({ brief: brief.id, step, spent, balance: after, withinCap: spent <= S.credits }));
const find = (o, re) => { if (typeof o === 'string') return re.test(o) ? o : null; if (o && typeof o === 'object') for (const v of Object.values(o)) { const r = find(v, re); if (r) return r; } return null; };
const url = find(result?.model_urls ?? result?.result ?? result, /^https?:.*\.glb(\?|$)/);
if (url) { const f = path.join(priv, `${step}.glb`); const r = spawnSync('curl', ['-sSL', '-o', f, url]); console.log(r.status === 0 ? `GLB saved to ${path.relative(repo, f)}` : 'GLB download failed: use the task id'); }
console.log('task id:', find(result, /^[0-9a-f-]{20,}$/) ?? '(see the saved JSON)');
if (spent > S.credits) { console.error(`WARNING: spent ${spent} > cap ${S.credits}`); process.exit(4); }
