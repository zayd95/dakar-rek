// A/B bench of the evening's moments in node, read as scripts/check-perf-evening.mjs reads them (docs/PERF_EVENING.md « Wave 5: the outflow »).
// One process per (build, city day, preset): a fresh process is a fresh browser run (cold JIT, cold caches). The builds alternate
// on each day so that a drift of the machine's load does not favour one of them. It only needs node and vitest: no browser.
//
//   node scripts/perf-outflow.mjs run    --out DIR --build base=/path/to/base --build new=/path/to/new [--q low] [--days 4,11,18,25] [--settle 55,90] [--frames 270]
//   node scripts/perf-outflow.mjs report --out DIR [--q low] [--moment 23:00]
//
// `run` writes DIR/<label>-<q>-d<day>-s<settle>.json (tests/perf.outflow.test.ts: the check's readings per window of 90 frames and every
// frame's update). `report` prints, per build and moment: the first window's reading (the one the check takes: mean, p90, worst), every
// window's reading, and the frames over 4 / 8 ms of the update (the OS-preempted ones left out, and counted apart).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [cmd, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf('--' + k); return i >= 0 ? rest[i + 1] : d; };
const all = k => rest.flatMap((a, i) => (a === '--' + k ? [rest[i + 1]] : []));
const out = opt('out', '.');
const q = opt('q', 'low');

if (cmd === 'run') {
  const builds = all('build').map(b => b.split('='));
  const days = opt('days', '4,11,18,25').split(',').map(Number);
  const settles = opt('settle', '55').split(',').map(Number);
  const frames = opt('frames', '270');
  fs.mkdirSync(out, { recursive: true });
  let flip = 0;
  for (const settle of settles) for (const day of days) {
    const order = flip++ % 2 ? [...builds].reverse() : builds;
    for (const [label, dir] of order) {
      const file = path.join(out, `${label}-${q}-d${day}-s${settle}.json`);
      if (fs.existsSync(file) && !rest.includes('--force')) continue;
      const t0 = Date.now();
      const r = spawnSync('nice', ['-n', '19', 'npx', 'vitest', 'run', 'tests/perf.outflow.test.ts'], {
        cwd: dir, encoding: 'utf8',
        env: { ...process.env, PERF: '1', PERF_Q: q, PERF_DAY: String(day), PERF_SETTLE: String(settle), PERF_FRAMES: frames, PERF_OUT: file },
      });
      console.log(`${label} ${q} day ${day} settle ${settle}: ${r.status === 0 ? 'ok' : 'FAILED ' + (r.stdout + r.stderr).slice(-300)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
  }
} else if (cmd === 'report') {
  const moment = opt('moment', '23:00');
  const files = fs.readdirSync(out).filter(f => f.endsWith('.json') && f.includes(`-${q}-d`));
  const by = {};
  for (const f of files) {
    const label = f.split('-')[0];
    let j; try { j = JSON.parse(fs.readFileSync(path.join(out, f), 'utf8')); } catch { continue; }
    const m = j.moments?.find(x => x.moment.startsWith(moment)); if (!m) continue;
    (by[label] ??= []).push({ f, day: j.day, settle: j.settle, m });
  }
  const r2 = x => Math.round(x * 100) / 100;
  const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  const mean = xs => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const line = (xs) => `n ${String(xs.length).padStart(3)}  mean ${r2(mean(xs))}  p50 ${r2(pct(xs, 0.5))}  p90 ${r2(pct(xs, 0.9))}  worst ${r2(Math.max(...xs))}`;
  console.log(`${q} ${moment}`);
  for (const [label, runs] of Object.entries(by)) {
    const first = runs.map(r => r.m.windows[0]?.update).filter(x => x !== undefined);
    const every = runs.flatMap(r => r.m.windows.map(w => w.update));
    let n = 0, o4 = 0, o8 = 0, p4 = 0, p8 = 0, np = 0;
    for (const r of runs) { const t = r.m.trace; for (let i = 0; i < t.upd.length; i++) { if (t.pre[i]) { np++; if (t.upd[i] > 4) p4++; if (t.upd[i] > 8) p8++; } else { n++; if (t.upd[i] > 4) o4++; if (t.upd[i] > 8) o8++; } } }
    const per = k => (100 * k / Math.max(1, n)).toFixed(1) + '%';
    console.log(`${label.padEnd(8)} first window   ${line(first)}\n${''.padEnd(8)} every window   ${line(every)}\n${''.padEnd(8)} frames (not preempted) ${n}: > 4 ms ${o4} (${per(o4)}), > 8 ms ${o8}; preempted ${np}: > 4 ms ${p4}, > 8 ms ${p8}; mean frame ${r2(mean(runs.flatMap(r => r.m.trace.upd.filter((_, i) => !r.m.trace.pre[i]))))}`);
  }
  const labels = Object.keys(by);
  if (labels.length >= 2) {
    console.log('\nper run (first window, ms):');
    const keys = [...new Set(Object.values(by).flat().map(r => `d${r.day}-s${r.settle}`))].sort();
    for (const k of keys) console.log(k.padEnd(10), labels.map(l => { const r = by[l].find(x => `d${x.day}-s${x.settle}` === k); return `${l} ${r ? r2(r.m.windows[0]?.update ?? NaN) : '-'}`; }).join('   '));
    // per section (first windows), mean over the runs
    const secs = new Set(); for (const l of labels) for (const r of by[l]) for (const k of Object.keys(r.m.windows[0]?.sections ?? {})) secs.add(k);
    const avg = (l, k) => mean(by[l].map(r => r.m.windows[0]?.sections[k] ?? 0));
    const rows = [...secs].map(k => [k, ...labels.map(l => avg(l, k))]).filter(r => Math.max(...r.slice(1)) > 0.04).sort((a, b) => b[1] - a[1]);
    console.log('\nsections of the first window, mean over the runs:\n' + ''.padEnd(34) + labels.map(l => l.padStart(8)).join(''));
    for (const r of rows) console.log(String(r[0]).padEnd(34) + r.slice(1).map(v => r2(v).toFixed(2).padStart(8)).join(''));
  }
} else {
  console.log('usage: node scripts/perf-outflow.mjs run|report --out DIR ... (see the header of this file)');
}
