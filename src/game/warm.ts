/**
 * Work that can be done before the moment it is needed (docs/PERF_EVENING.md « The outflow »). The first time a model is
 * made, a body dressed, a route planned or a clip bound costs 3-10 ms, in the frame that happens to need it: a hitch the
 * player feels, and the profiler's moving average (92 % old, 8 % new) keeps it for twenty frames. A lane lists its
 * first-time jobs when its hub loads, one small job each (never more than a few milliseconds), and runs a few of them a
 * frame while the first seconds go by; what is made then is the same as what would have been made later, from the same
 * caches.
 */
export class WarmQueue {
  private jobs: (() => void)[] = [];
  /** Jobs still to run. */
  get size() { return this.jobs.length; }
  add(...jobs: (() => void)[]) { for (const j of jobs) this.jobs.push(j); }
  clear() { this.jobs.length = 0; }
  /**
   * This frame's share: jobs in the order they were added, at most `max` of them, and none started once `ms` milliseconds have
   * gone (the first always runs). Returns how many are left.
   */
  run(max = 1, ms = Infinity, now: () => number = () => performance.now()): number {
    const t0 = ms === Infinity ? 0 : now();
    for (let k = 0; k < max && this.jobs.length; k++) {
      if (k > 0 && now() - t0 >= ms) break;
      this.jobs.shift()!();
    }
    return this.jobs.length;
  }
}
