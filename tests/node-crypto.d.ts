// The project has no @types/node; tests/patio.test.ts only needs a digest to compare the club recipe's output with the one taken before its variant argument existed.
declare module 'node:crypto' {
  export function createHash(algorithm: string): { update(data: string): { digest(encoding: 'hex'): string } };
}
