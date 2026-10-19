/**
 * The recorded sounds of the vehicles (public/assets/audio/vehicles/*.mp3, ~210 KB in all; sources and licences: docs/audio/VEHICLE_SAMPLES.md, built by scripts/audio/build-vehicle-samples.py).
 * The bytes are fetched as soon as the page wants a vehicle's sound (no audio context is needed for that); they are decoded the moment the page's audio context exists (the first gesture),
 * long before the first horn or the first engine start asks for them. A sample that failed to load or decode is simply absent: its voice stays silent, nothing else is touched.
 */
export const SAMPLE_NAMES = ['car-idle', 'car-rev', 'moto-idle', 'horn-car', 'horn-moto', 'crash', 'thud', 'squeal'] as const;
export type SampleName = typeof SAMPLE_NAMES[number];

const url = (n: SampleName) => `${import.meta.env.BASE_URL}assets/audio/vehicles/${n}.mp3`;

export class SampleBank {
  private raw = new Map<SampleName, Promise<ArrayBuffer | null>>();
  private buffers = new Map<SampleName, AudioBuffer>();
  private deciding: Promise<void> | null = null;
  /** Samples that failed to fetch or decode (the diagnostics show them). */
  readonly failed: SampleName[] = [];

  /** Starts fetching every sample (once). Harmless without a network or a browser. */
  prefetch(): void {
    if (this.raw.size || typeof fetch === 'undefined' || typeof window === 'undefined') return;
    for (const n of SAMPLE_NAMES) this.raw.set(n, fetch(url(n)).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null));
  }

  /** Decodes what was fetched into `ctx` (once; the promise resolves when all are done or failed). */
  decode(ctx: BaseAudioContext): Promise<void> {
    this.prefetch();
    return this.deciding ??= Promise.all(SAMPLE_NAMES.map(async n => {
      try {
        const bytes = await this.raw.get(n);
        if (!bytes) throw new Error('not fetched');
        this.buffers.set(n, await ctx.decodeAudioData(bytes.slice(0)));
      } catch { this.failed.push(n); }
    })).then(() => undefined);
  }

  get(n: SampleName): AudioBuffer | null { return this.buffers.get(n) ?? null; }
  get loaded() { return this.buffers.size; }
  get settled() { return this.buffers.size + this.failed.length >= SAMPLE_NAMES.length; }
  /** A bank filled by hand (the tests and the offline render). */
  set(n: SampleName, b: AudioBuffer) { this.buffers.set(n, b); }
}
