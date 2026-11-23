// Builds the private Meshy archive (never pushed: it holds ~200 MB of raw downloads) and verifies it.
// Usage: node scripts/meshy/make-archive.mjs   (run from the repo root; needs assets-src/meshy_output)
// The archive: raw Meshy outputs, optimised GLBs, sanitised task snapshots (signed URLs removed), prompts,
// a SHA-256 manifest, the reproduction scripts and notes. Output: private-archive/meshy-<date>/ and a .tar.gz.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const DATE = '20261017';
const OUT = `private-archive/meshy-${DATE}`;
const base = JSON.parse(fs.readFileSync('docs/meshy/MESHY_ASSETS_MANIFEST.json', 'utf8'));
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

// extra files copied in on every run (scripts, notes, proof output, current converted bodies)
const EXTRA = [
  ['scripts/meshy', 'scripts'], ['docs/meshy', 'notes'], ['proof/meshy', 'proof'],
];
for (const [from, to] of EXTRA) if (fs.existsSync(from)) fs.cpSync(from, path.join(OUT, to), { recursive: true, filter: s => !/node_modules|\.tar\.gz$/.test(s) });

const files = walk(OUT).filter(f => !/(MANIFEST\.json|SHA256SUMS)$/.test(f)).sort();
const manifest = {
  archive: `meshy-${DATE}`, createdUtc: new Date().toISOString(),
  warning: 'Raw Meshy downloads are about 200 MB and are NOT in git. Signed temporary download URLs are deliberately absent. This copy lives on one machine until it is copied to durable storage and its checksums verified independently.',
  meshy: base.meshy, characters: base.characters.map(c => ({ id: c.id, prompt: c.prompt, ...(c.texturePrompt ? { texturePrompt: c.texturePrompt } : {}), promptSource: c.promptSource, creditsTotal: c.creditsTotal, tasks: c.tasks })),
  tools: { node: process.version, meshyCli: '0.4.0', gltfTransform: '4.5.1', sharp: '0.35.5', three: '0.169.x' },
  files: files.map(f => ({ path: path.relative(OUT, f), bytes: fs.statSync(f).size, sha256: sha(f) })),
};
fs.writeFileSync(path.join(OUT, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(OUT, 'SHA256SUMS'), manifest.files.map(f => `${f.sha256}  ${f.path}`).join('\n') + '\n');

const tar = `private-archive/meshy-${DATE}.tar.gz`;
execFileSync('tar', ['-czf', tar, '-C', 'private-archive', `meshy-${DATE}`]);
fs.writeFileSync(`${tar}.sha256`, `${sha(tar)}  meshy-${DATE}.tar.gz\n`);

// verification: tarball readable, extracted copy matches SHA256SUMS
const tmp = fs.mkdtempSync('/tmp/claude-0/meshy-verify-');
execFileSync('tar', ['-xzf', tar, '-C', tmp]);
execFileSync('sha256sum', ['-c', 'SHA256SUMS'], { cwd: path.join(tmp, `meshy-${DATE}`), stdio: 'pipe' });
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${files.length} files, ${(fs.statSync(tar).size / 1e6).toFixed(1)} MB tar.gz, sha256 ${sha(tar)}, extraction + checksum verification passed`);
