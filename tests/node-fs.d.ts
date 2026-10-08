// The project has no @types/node; the tests only need this one call to read a shipped asset.
declare module 'node:fs' {
  export function readFileSync(path: URL | string): Uint8Array;
}
