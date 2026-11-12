// Paste in the console of the page on the phone (Chrome remote debugging, chrome://inspect). Samples requestAnimationFrame for `secs` seconds
// while you play (walk, run, turn, stop) and prints frame-time statistics. It needs nothing from the game.
(async (secs = 20) => {
  const dts = []; let last = performance.now(); const end = last + secs * 1000;
  await new Promise(done => { const f = t => { dts.push(t - last); last = t; t < end ? requestAnimationFrame(f) : done(); }; requestAnimationFrame(f); });
  dts.shift(); const s = [...dts].sort((a, b) => a - b), q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const mean = dts.reduce((a, b) => a + b, 0) / dts.length;
  const r = { frames: dts.length, fpsMean: +(1000 / mean).toFixed(1), msMedian: +q(0.5).toFixed(1), msP95: +q(0.95).toFixed(1), msP99: +q(0.99).toFixed(1), msWorst: +s.at(-1).toFixed(1), over33ms_pct: +(100 * dts.filter(d => d > 33.4).length / dts.length).toFixed(1), over50ms_pct: +(100 * dts.filter(d => d > 50).length / dts.length).toFixed(1) };
  const body = window.__dakar?.avatar?.(); if (body) r.body = body;
  const heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null; if (heap) r.heapMB = heap;
  console.log('FRAME PROBE', JSON.stringify(r)); return r;
})();
