/**
 * LD2.0-D: the owner's private showcase (src/showcase/start.ts) is compiled in only when the build is made with VITE_OWNER_SHOWCASE=1 in the shell's
 * environment (`npm run build:showcase`). The value is replaced at build time from the environment alone — never from an .env file (.env.online, CI's) —
 * and is '' otherwise, so the public bundle's `if` is a constant false and the showcase and its texts are left out (tests/showcase.test.ts checks it).
 */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
export const ownerShowcase = () => env.VITE_OWNER_SHOWCASE === '1';
export const showcaseDefine = () => ({ 'import.meta.env.VITE_OWNER_SHOWCASE': JSON.stringify(ownerShowcase() ? '1' : '') });
