// Rides the Tiak bike along a path in the real game (Playwright), frame by frame with the game paused: `__dakar.step(1/30)` advances
// the whole frame (the bike, the economy, the clock), and the rider presses the game's own keys or the touch pad, so what is
// measured is the real drive model, the real hub and the real input mapping, in game seconds (never wall time).
// « clavier »: W + A/D (the game normalises two keys to 0.707 each). « touch »: the gas pad held, A/D standing in for the stick.
export const STEP = 1 / 30;

/** Puts the bike at the start of `path` facing along it, the player beside it, and mounts. Resolves true when seated. */
export async function mountAt(page, path) {
  const [x0, z0] = path[0], [x1, z1] = path[1] ?? path[0];
  const yaw = Math.atan2(x1 - x0, z1 - z0);
  await page.evaluate(([x, z, yaw]) => {
    const d = window.__dakar;
    d.tiak.place(x, z, yaw);
    d.place(x - Math.sin(yaw) * 1.6, z - Math.cos(yaw) * 1.6, yaw);
  }, [x0, z0, yaw]);
  return page.evaluate(() => { const d = window.__dakar; d.pause(true); d.step(1 / 30, 12); d.act(); d.step(1 / 30, 24); return d.tiak.at()?.driving === true; });
}

/**
 * Rides `path` until the end is within `arrive` m, `until()` (page-side, returns true to stop) says so, or `maxS` game seconds pass.
 * Returns { s: game seconds, played: playedMs delta / 1000, ok, speedMax, frames }.
 */
export function ride(page, path, { style = 'clavier', arrive = 3.0, maxS = 120, until = null } = {}) {
  return page.evaluate(({ path, style, arrive, maxS, until }) => {
    const d = window.__dakar, D = { maxSpeed: 12.5 }, dt = 1 / 30;
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    const held = new Set();
    const key = (code, on) => { if (held.has(code) === on) return; if (on) held.add(code); else held.delete(code); window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code, bubbles: true })); };
    const pad = (cls, on) => { const b = document.querySelector('#ridepad ' + cls); if (b) b.dispatchEvent(new PointerEvent(on ? 'pointerdown' : 'pointerup', { pointerId: cls === '.rp-gas' ? 7 : 8, bubbles: true })); };
    let gas = false, brake = false;
    const end = { x: path[path.length - 1][0], z: path[path.length - 1][1] };
    const startMs = d.state.data.playedMs;
    let seg = 1;
    { const at0 = d.tiak.at(); if (at0) { let k = 0, best = 1e9; path.forEach((q, i) => { const dd = Math.hypot(q[0] - at0.x, q[1] - at0.z); if (dd < best) { best = dd; k = i; } }); seg = Math.max(1, Math.min(path.length - 1, k + 1)); } }   // resume ahead of where the bike is
    let frames = 0, speedMax = 0, stillT = 0, lastKey = d.tourState ? (d.tourState()?.leg ?? 'none') : 'none', lastClock = null;
    const events = [];            // the tour's stops handed over: when (ride seconds) and the tour clock then
    const until_ = until ? new Function('return (' + until + ')')() : null;
    const finish = ok => { for (const k of [...held]) key(k, false); if (gas) pad('.rp-gas', false); if (brake) pad('.rp-brake', false); return { s: +(frames * dt).toFixed(2), played: +((d.state.data.playedMs - startMs) / 1000).toFixed(2), ok, speedMax: +speedMax.toFixed(1), frames, events }; };
    while (frames * dt < maxS) {
      const at = d.tiak.at(); if (!at || !at.driving) return finish(false);
      if (Math.hypot(end.x - at.x, end.z - at.z) < arrive) return finish(true);
      if (until_ && until_()) return finish(true);
      while (seg < path.length - 1 && Math.hypot(path[seg][0] - at.x, path[seg][1] - at.z) < 4.5) seg++;
      let tgt = path[seg], acc = 0;
      for (let k = seg; k < path.length; k++) { const p = k === seg ? [at.x, at.z] : path[k - 1]; acc += Math.hypot(path[k][0] - p[0], path[k][1] - p[1]); tgt = path[k]; if (acc > 7) break; }
      const err = wrap(Math.atan2(tgt[0] - at.x, tgt[1] - at.z) - at.yaw);
      const nxt = path[Math.min(seg + 1, path.length - 1)], cur = path[seg];
      const turn = Math.abs(wrap(Math.atan2(nxt[0] - cur[0], nxt[1] - cur[1]) - Math.atan2(cur[0] - at.x, cur[1] - at.z)));
      const dCorner = Math.hypot(cur[0] - at.x, cur[1] - at.z), dEnd = Math.hypot(end.x - at.x, end.z - at.z);
      const want = Math.min(D.maxSpeed, turn > 1.0 && dCorner < 18 ? 3.5 : turn > 0.5 && dCorner < 14 ? 5.5 : D.maxSpeed, Math.abs(err) > 0.5 ? 4 : D.maxSpeed, Math.max(4, dEnd * 0.9));
      const w = at.speed < want - 0.3 ? 1 : at.speed > want + 1 ? -1 : 0;
      const steerLeft = err > 0.06, steerRight = err < -0.06;
      key('KeyA', steerLeft); key('KeyD', steerRight);
      if (style === 'touch' && at.pad) {
        const g = w > 0, b = w < 0;
        if (g !== gas) { pad('.rp-gas', g); gas = g; } if (b !== brake) { pad('.rp-brake', b); brake = b; }
      } else { key('KeyW', w > 0); key('KeyS', w < 0); }
      d.step(dt, 1); frames++;
      speedMax = Math.max(speedMax, Math.abs(d.tiak.at()?.speed ?? 0));
      if (d.tourState) { const st = d.tourState(), key = st ? st.leg : 'done'; if (key !== lastKey) { events.push({ stop: lastKey, at: +(frames * dt).toFixed(2), clock: lastClock === null ? null : +(lastClock + dt).toFixed(2) }); lastKey = key; } lastClock = st ? st.clock : lastClock; }
      stillT = Math.abs(d.tiak.at()?.speed ?? 0) < 0.3 ? stillT + dt : 0; if (stillT > 4) return finish(false);
    }
    return finish(false);
  }, { path, style, arrive, maxS, until: until ? String(until) : null });
}
