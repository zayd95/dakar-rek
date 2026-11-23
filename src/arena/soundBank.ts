/**
 * The arena's authored sound files (public/assets/audio/arena/*.mp3 and manifest.json, ~1.8 MB, made offline by
 * scripts/audio/render-arena.mjs: synthesis, no recordings). The bytes are fetched once, when the arena's sound is first
 * wanted (a fight evening in the hub, a bout); each file is decoded when it is first played and only a few loops stay
 * decoded at once (a decoded loop is ten times its MP3), the one-shots always. A file that fails to load or decode stays
 * silent; nothing else plays instead.
 */
export interface LoopInfo { file: string; period: number; tail: number; bpm?: number; bars?: number; bar?: number }
export interface ArenaManifest { drums: Record<string, LoopInfo>; beds: Record<string, LoopInfo>; shots: Record<string, { file: string; length: number }> }

const BASE = () => `${import.meta.env.BASE_URL}assets/audio/arena/`;
/** Decoded loops kept at once (drums and beds together); the one-shots do not count. */
export const KEEP_LOOPS = 5;

export class ArenaBank {
  manifest: ArenaManifest | null = null;
  private loading: Promise<void> | null = null;
  private raw = new Map<string, Promise<ArrayBuffer | null>>();
  private buffers = new Map<string, AudioBuffer>();
  private decoding = new Set<string>();
  private used = new Map<string, number>();
  readonly failed: string[] = [];
  constructor(private fetcher: (url: string) => Promise<ArrayBuffer | null> = url => fetch(url).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null)) {}

  /** Starts fetching the manifest and every file (once). Harmless without a network. */
  prefetch(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = this.fetcher(`${BASE()}manifest.json`).then(b => {
      if (!b) { this.failed.push('manifest'); return; }
      try { this.manifest = JSON.parse(new TextDecoder().decode(b)) as ArenaManifest; } catch { this.failed.push('manifest'); return; }
      for (const f of this.files()) this.raw.set(f, this.fetcher(`${BASE()}${f}`));
    });
    return this.loading;
  }
  /** Every file of the manifest. */
  files(): string[] {
    const m = this.manifest; if (!m) return [];
    return [...Object.values(m.drums), ...Object.values(m.beds), ...Object.values(m.shots)].map(x => x.file);
  }
  loop(kind: 'drums' | 'beds', id: string): LoopInfo | null { return this.manifest?.[kind][id] ?? null; }

  /** The decoded file, or null (then its decoding is started: ask again next frame). */
  get(ctx: BaseAudioContext, file: string): AudioBuffer | null {
    const b = this.buffers.get(file);
    if (b) { this.used.set(file, ctx.currentTime); return b; }
    if (!this.decoding.has(file) && !this.failed.includes(file)) {
      const bytes = this.raw.get(file); if (!bytes) { void this.prefetch(); return null; }
      this.decoding.add(file);
      void bytes.then(async raw => {
        if (!raw) throw new Error('not fetched');
        const buf = await ctx.decodeAudioData(raw.slice(0));
        this.buffers.set(file, buf); this.used.set(file, ctx.currentTime); this.evict(file);
      }).catch(() => { this.failed.push(file); }).finally(() => this.decoding.delete(file));
    }
    return null;
  }
  /** Keeps at most KEEP_LOOPS decoded loops (the least recently played go; their bytes stay, to decode again). */
  private evict(keep: string) {
    const loops = [...this.buffers.keys()].filter(f => !f.startsWith('shot-'));
    if (loops.length <= KEEP_LOOPS) return;
    loops.filter(f => f !== keep).sort((a, b) => (this.used.get(a) ?? 0) - (this.used.get(b) ?? 0)).slice(0, loops.length - KEEP_LOOPS).forEach(f => this.buffers.delete(f));
  }
  info() { return { manifest: !!this.manifest, fetched: this.raw.size, decoded: [...this.buffers.keys()], failed: [...this.failed] }; }
}
