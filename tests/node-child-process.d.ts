// The project has no @types/node; one test decodes the shipped music with ffmpeg to check its beat map (skipped without ffmpeg).
declare module 'node:child_process' {
  export function execFileSync(file: string, args: string[], options?: { stdio?: string | string[]; maxBuffer?: number }): Uint8Array & { byteOffset: number; byteLength: number; buffer: ArrayBuffer };
}
