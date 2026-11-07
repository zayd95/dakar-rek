// MOBILE-01: builds the private device-playtest preview of an accepted candidate and writes down what it was built from (docs/mobile/MOBILE-01.md).
// Usage:  node scripts/build-preview.mjs --base <full commit of the accepted candidate> [--out dist-preview] [--branch name] [--allow-dirty]
// It refuses to build unless: the work tree is clean (so the build id names the commit exactly), the candidate is an ancestor of HEAD, and every file that differs from the
// candidate is one of the playtest's own (diagnostics, the build config, the docs). It then type-checks, builds with vite.preview.config.ts, and writes into the output folder
//   version.json         the full commits (the playtest's and the candidate's), the files that differ from the candidate, how and when it was built;
//   build-manifest.json  the size and SHA-256 of every file of the build, and one hash over them all, so that what is published can be checked against what was built.
// and next to it <out>.publish.json, the map of files to publish (for the Artifact tool's `files`). Nothing is deployed or uploaded here.
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = n => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
const base = arg('base'), out = arg('out') ?? 'dist-preview', allowDirty = argv.includes('--allow-dirty'), branch = arg('branch');   // (a detached checkout has no branch name: --branch records it)
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const die = m => { console.error(`build-preview: ${m}`); process.exit(1); };

if (!base || !/^[0-9a-f]{40}$/.test(base)) die('--base needs the full 40-character commit of the accepted candidate');
const head = git('rev-parse', 'HEAD');
try { git('merge-base', '--is-ancestor', base, head); } catch { die(`${base.slice(0, 8)} is not an ancestor of HEAD (${head.slice(0, 8)})`); }
const dirty = git('status', '--porcelain', '--untracked-files=no');
if (dirty && !allowDirty) die(`the work tree has uncommitted changes; the build id would not name the commit:\n${dirty}`);

// Only the playtest's own files may differ from the accepted candidate: no gameplay file is allowed to change.
const ALLOWED = [
  /^src\/core\/frameStats\.ts$/, /^src\/core\/build\.ts$/, /^src\/ui\/frameMeter\.ts$/, /^src\/ui\/betaInfo\.ts$/,
  /^src\/main\.ts$/,                                  // only the diagnostics wiring (the hunks are listed in docs/mobile/MOBILE-01.md)
  /^tests\/frameStats\.test\.ts$/, /^vite\.preview\.config\.ts$/, /^scripts\/build-preview\.mjs$/, /^scripts\/check-preview\.mjs$/, /^\.gitignore$/,
  /^docs\/mobile\//, /^docs\/beta\//,
];
const changed = git('diff', '--name-status', base, head).split('\n').filter(Boolean).map(l => { const [status, ...p] = l.split('\t'); return { status, file: p.join('\t') }; });
const outside = changed.filter(c => !ALLOWED.some(r => r.test(c.file)));
if (outside.length) die(`these files differ from the accepted candidate and are not the playtest's own:\n${outside.map(c => `  ${c.status} ${c.file}`).join('\n')}`);
const numstat = git('diff', '--numstat', base, head).split('\n').filter(Boolean);

const short = head.slice(0, 8), day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const env = { ...process.env, VITE_OWNER_SHOWCASE: '1', MOBILE_BASE_COMMIT: base, PREVIEW_OUT: out, BUILD_ID: `${short}${dirty ? '+' : ''}-${day}` };
const run = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: 'inherit', env }); if (r.status !== 0) die(`${cmd} ${args.join(' ')} failed`); };
run('npx', ['tsc', '--noEmit']);
run('npx', ['vite', 'build', '--config', 'vite.preview.config.ts']);

const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else files.push(f); } })(out);
const rel = f => path.relative(out, f).split(path.sep).join('/');
const manifest = files.sort().map(f => ({ path: rel(f), bytes: fs.statSync(f).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') }));
const manifestSha = crypto.createHash('sha256').update(manifest.map(m => `${m.sha256}  ${m.path}`).join('\n')).digest('hex');
const version = {
  name: 'Dakar Rek · playtest preview (MOBILE-01)',
  commit: head, buildId: env.BUILD_ID + '-apercu',
  baseCommit: base, baseIsAcceptedCandidate: 'PR #88 (integration/playable-20261107)',
  branch: branch ?? git('rev-parse', '--abbrev-ref', 'HEAD'),
  builtAtUtc: new Date().toISOString(), node: process.version, dirty: !!dirty,
  showcase: true, measureOnByDefault: true,
  changedFilesVsCandidate: changed.map(c => `${c.status} ${c.file}`), numstatVsCandidate: numstat,
  files: manifest.length, bytes: manifest.reduce((n, m) => n + m.bytes, 0), manifestSha256: manifestSha,
};
fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify(version, null, 2) + '\n');
// (version.json is not in its own manifest: it carries the manifest's hash)
fs.writeFileSync(path.join(out, 'build-manifest.json'), JSON.stringify({ commit: head, manifestSha256: manifestSha, files: manifest }, null, 1) + '\n');
const publish = {};
for (const f of [...files, path.join(out, 'version.json'), path.join(out, 'build-manifest.json')]) publish[rel(f)] = f.split(path.sep).join('/');
delete publish['index.html'];                                // the page itself is passed as file_path
fs.writeFileSync(`${out}.publish.json`, JSON.stringify({ page: `${out}/index.html`, files: publish }, null, 1) + '\n');

console.log(`\nbuild-preview: ${short} (candidate ${base.slice(0, 8)}) -> ${out}/  ${version.files + 2} files, ${(version.bytes / 1048576).toFixed(1)} MB, manifest ${manifestSha.slice(0, 12)}`);
console.log(`differs from the candidate in ${changed.length} files: ${changed.map(c => c.file).join(', ')}`);
