// @ts-ignore -- a Node built-in: the Vite configs run in Node, and the project has no @types/node
import { execSync } from 'node:child_process';
declare const process: { env: Record<string, string | undefined> };
/** `<short commit>-<yyyymmdd>` (`+` when the work tree has changes), or BUILD_ID from the environment (src/core/build.ts shows it). */
/** The full commit being built: Cloudflare Workers Builds names it (the checkout there may be shallow or detached), else git. Empty when neither knows. */
export function buildCommit(): string {
  const ci = process.env.WORKERS_CI_COMMIT_SHA ?? process.env.GITHUB_SHA ?? '';
  if (/^[0-9a-f]{40}$/.test(ci)) return ci;
  try { return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; }
}
export function buildId(): string {
  if (process.env.BUILD_ID) return process.env.BUILD_ID;
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const ci = process.env.WORKERS_CI_COMMIT_SHA ?? '';
  if (/^[0-9a-f]{40}$/.test(ci)) return `${ci.slice(0, 8)}-${day}`;                    // (a CI checkout: the commit it was told to build, never « dirty »)
  try {
    const sha = execSync('git rev-parse --short=8 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execSync('git status --porcelain --untracked-files=no', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() ? '+' : '';
    return `${sha}${dirty}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  } catch { return 'local'; }
}
