// @ts-ignore -- a Node built-in: the Vite configs run in Node, and the project has no @types/node
import { execSync } from 'node:child_process';
declare const process: { env: Record<string, string | undefined> };
/** `<short commit>-<yyyymmdd>` (`+` when the work tree has changes), or BUILD_ID from the environment (src/core/build.ts shows it). */
export function buildId(): string {
  if (process.env.BUILD_ID) return process.env.BUILD_ID;
  try {
    const sha = execSync('git rev-parse --short=8 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execSync('git status --porcelain --untracked-files=no', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() ? '+' : '';
    return `${sha}${dirty}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  } catch { return 'local'; }
}
