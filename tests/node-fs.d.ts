// The project has no @types/node; the tests only need these calls to read shipped assets and sources.
declare module 'node:fs' {
  export function readFileSync(path: URL | string): Uint8Array;
  export function readdirSync(path: URL | string, options: { recursive: true }): string[];
}
