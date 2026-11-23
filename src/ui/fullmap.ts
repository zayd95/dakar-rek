import { mapBridge, type MapOwned } from './minimap';
import { JOB, drawJobBadge, jobOf } from './jobMarks';
import { peekFocus, pinHtml, remoteCardHtml, tabsHtml, takeFocus, type Focus } from './carteState';
import { drawArrow, drawIcon, drawRoads, PALETTE } from './minimapDraw';
import { KIND_COLOR, KIND_LABEL, KIND_ORDER, declutter, distText, nightness, routePath, walkTime, whereLabel, type MapPlace, type PlaceKind, type Pt } from './minimapMath';

/**
 * The phone's « Carte » screen, upgraded (src/ui/phone.ts mapHtml): the whole hub on the same static layer as the
 * minimap, north up, pan (drag) and zoom (pinch, wheel, + −), the player live, a legend that filters the places by type,
 * and a tap on a place: its name, what can be done there, the distance and the walking time (2 m/s), and « Marquer »,
 * which sets the game's waypoint (the minimap draws its dotted route, the world markers show the pin).
 */

const hidden = new Set<PlaceKind>();                                   // legend filters (kept while the game runs)
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const TAU = Math.PI * 2;

/** Markup of the map: the canvas, its buttons, the tabs and the type filters laid over it. The caption under it is `fullCardHtml`; the strip is built by the phone. */
export function fullMapHtml(): string {
  const kinds = new Set(mapBridge.places.map(p => p.kind));
  return `<div class="fm" id="fm"><canvas class="fm-cv" aria-label="Carte du quartier"></canvas>
      <div class="cm-top">${tabsHtml()}<button type="button" class="cm-filter" data-fm="filters" aria-expanded="false" aria-controls="cm-pop">Filtres</button></div>
      <div class="cm-pop" id="cm-pop" hidden><div class="fm-legend" role="group" aria-label="Types de lieux">${KIND_ORDER.filter(k => kinds.has(k)).map(k => `<button type="button" class="fm-chip ${hidden.has(k) ? '' : 'on'}" data-kind="${k}" aria-pressed="${!hidden.has(k)}" style="--c:${KIND_COLOR[k]}"><i></i>${KIND_LABEL[k]}</button>`).join('')}</div></div>
      <div class="fm-btns"><button type="button" data-fm="in" aria-label="Zoom avant">+</button><button type="button" data-fm="out" aria-label="Zoom arrière">−</button><button type="button" data-fm="me" aria-label="Me recentrer">◎</button></div></div>`;
}
export const fullCardHtml = () => '<div class="fm-card" data-pane="quartier" aria-live="polite"></div>';

/** Brings the map block of `host` to life; returns what to call when the screen goes away. */
export function mountFullMap(host: HTMLElement): () => void {
  const wrap = host.querySelector<HTMLElement>('#fm'), cv = host.querySelector<HTMLCanvasElement>('.fm-cv'), card = host.querySelector<HTMLElement>('.fm-card');
  const lay = mapBridge.layer, hub = mapBridge.hub;
  if (!wrap || !cv || !card) return () => {};
  if (!lay || !hub) { wrap.hidden = true; card.textContent = 'La carte se charge…'; return () => {}; }
  const g = cv.getContext('2d')!;
  let W = 0, H = 0, dpr = 1;
  const bounds = hub.bounds, span = Math.max(bounds.x1 - bounds.x0, bounds.z1 - bounds.z0) + 30;
  const view = { cx: mapBridge.player.x, cz: mapBridge.player.z, scale: 1 };
  /** One of the player's own vehicles standing in this district, picked (its icon tapped, or « Localiser »): its card, the view on it. */
  let car: MapOwned | null = null;
  let fit = 1, remote: Focus | null = null, selected: MapPlace | null = null, selRoute: { points: Pt[]; length: number } | null = null, note = '', t = 0, timer = 0, raf = 0;
  // every listener of this mount: the canvas outlives the tab (the map is mounted again each time « Quartier » opens), and a listener left on it would pan and draw a second, stale view
  const life = new AbortController(), sig = { signal: life.signal };
  const textW = new Map<string, number>();
  /** The view stays on the player until the map is touched (and again after ◎): a district being loaded places the player a few frames after the map is drawn again. */
  let follow = true;

  const resize = () => {
    const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    if (w === W && h === H) return;
    const first = !W; W = w; H = h; dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    fit = Math.min(W, H) / span;
    if (first) view.scale = fit * 1.6;                                    // opens on the player's surroundings; zoom out for the whole hub
    clampView(); kick();
  };
  const clampView = () => {
    view.scale = Math.max(fit * 0.9, Math.min(fit * 9, view.scale));
    const mx = (bounds.x1 - bounds.x0) / 2 + 20, mz = (bounds.z1 - bounds.z0) / 2 + 20, ox = (bounds.x0 + bounds.x1) / 2, oz = (bounds.z0 + bounds.z1) / 2;
    // the district, and as far as the player is when they are out on a road that leaves it: the view can always reach them
    // …and as far as the vehicle picked, which may have been left out on such a road
    const pl = mapBridge.player, far = car ?? pl;
    view.cx = Math.max(Math.min(ox - mx, pl.x, far.x), Math.min(Math.max(ox + mx, pl.x, far.x), view.cx)); view.cz = Math.max(Math.min(oz - mz, pl.z, far.z), Math.min(Math.max(oz + mz, pl.z, far.z), view.cz));
  };
  const S = (x: number, z: number) => ({ x: W / 2 + (x - view.cx) * view.scale, y: H / 2 + (z - view.cz) * view.scale });
  const world = (sx: number, sy: number) => ({ x: view.cx + (sx - W / 2) / view.scale, z: view.cz + (sy - H / 2) / view.scale });
  const zoomAt = (sx: number, sy: number, k: number) => {
    const w = world(sx, sy); view.scale *= k; clampView();
    view.cx = w.x - (sx - W / 2) / view.scale; view.cz = w.z - (sy - H / 2) / view.scale; clampView(); kick();
  };

  const kick = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  const visible = () => mapBridge.places.filter(p => !hidden.has(p.kind));
  /** The player's own vehicles parked in this district (the one being driven is the player's own arrow). */
  const carsHere = () => mapBridge.owned().filter(o => o.hub === hub.id);

  const draw = () => {
    if (!W) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = PALETTE.void; g.fillRect(0, 0, W, H);
    g.save();
    g.transform(view.scale, 0, 0, view.scale, W / 2 - view.cx * view.scale, H / 2 - view.cz * view.scale);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(lay.canvas, lay.x0, lay.z0, lay.w / lay.K, lay.h / lay.K);
    if (mapBridge.roads) drawRoads(g, mapBridge.roads);                   // the roads that leave the district, past the layer
    g.restore();
    const night = nightness(mapBridge.hour);
    if (night > 0.02) { g.fillStyle = `rgba(8,14,46,${(0.45 * night).toFixed(3)})`; g.fillRect(0, 0, W, H); }
    // routes: the objective's (yellow) and the selected place's (white)
    const dotted = (pts: Pt[], col: string, w: number) => {
      g.beginPath(); pts.forEach((q, i) => { const m = S(q.x, q.z); if (i) g.lineTo(m.x, m.y); else g.moveTo(m.x, m.y); });
      g.lineCap = 'round'; g.lineJoin = 'round'; g.setLineDash([0.5, w * 2.2]); g.lineWidth = w + 3; g.strokeStyle = 'rgba(10,14,18,.7)'; g.stroke();
      g.lineWidth = w; g.strokeStyle = col; g.stroke(); g.setLineDash([]);
    };
    const job = jobOf(mapBridge.guide);
    if (mapBridge.route && mapBridge.guide) dotted(mapBridge.route.points, job ? JOB[job].color : '#ffd23f', 3.4);
    if (selRoute && selected) dotted(selRoute.points, '#f4f6f8', 3);
    // places
    const z = Math.min(1.5, Math.max(0.8, view.scale / (fit * 2.2)));
    const dest = mapBridge.destination();
    const labels: { x: number; y: number; w: number; h: number; rank: number; text: string; sel: boolean }[] = [];
    g.font = '700 11px system-ui, sans-serif';
    for (const p of visible()) {
      const m = S(p.x, p.z); if (m.x < -20 || m.y < -20 || m.x > W + 20 || m.y > H + 20) continue;
      const sel = selected?.id === p.id, r = (p.kind === 'spot' ? 7 : 10) * z * (sel ? 1.25 : 1);
      if (sel || p.id === dest) { g.beginPath(); g.arc(m.x, m.y, r + 5 + 2 * Math.sin(t * 5), 0, TAU); g.fillStyle = 'rgba(255,210,63,.35)'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#ffd23f'; g.stroke(); }
      drawIcon(g, p.kind, m.x, m.y, r, { glyph: p.kind !== 'spot' });
      // every place is named where there is room for its name: the one selected and the one marked first, then what can be used (a shop, a home, a stop…),
      // then the plain spots, which are only named close in
      if (!sel && p.id !== dest && p.kind === 'spot' && view.scale <= fit * 3.2) continue;
      const text = p.name.split(' · ')[0];
      let tw = textW.get(text); if (tw === undefined) { tw = g.measureText(text).width; textW.set(text, tw); }
      labels.push({ x: m.x, y: m.y - r - 9, w: tw + 6, h: 13, rank: sel ? 3 : p.id === dest ? 2 : p.kind === 'spot' ? 0 : 1, text, sel });
    }
    g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
    const room = declutter(labels, 2);
    labels.forEach((l, i) => { if (!room[i]) return; g.lineWidth = 3.5; g.strokeStyle = 'rgba(8,12,16,.92)'; g.strokeText(l.text, l.x, l.y + 4); g.fillStyle = l.sel ? '#ffd23f' : '#f4f6f8'; g.fillText(l.text, l.x, l.y + 4); });
    // the player's own parked vehicles: a pictogram on a white disc (nothing else on the map looks like it), ringed when it is picked or is where the marker stands
    g.font = '15px system-ui, sans-serif'; g.textBaseline = 'middle';
    for (const o of carsHere()) {
      const m = S(o.x, o.z); if (m.x < -20 || m.y < -20 || m.x > W + 20 || m.y > H + 20) continue;
      const on = car?.id === o.id || o.id === dest;
      if (on) { g.beginPath(); g.arc(m.x, m.y, 18 + 2 * Math.sin(t * 5), 0, TAU); g.fillStyle = 'rgba(255,210,63,.35)'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#ffd23f'; g.stroke(); }
      g.beginPath(); g.arc(m.x, m.y, 12, 0, TAU); g.fillStyle = '#f4f6f8'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#0c1115'; g.stroke();
      g.fillStyle = '#0c1115'; g.fillText(o.icon, m.x, m.y + 1);
    }
    g.textBaseline = 'alphabetic';
    // friends, the objective, the player
    for (const f of mapBridge.friends) { const m = S(f.x, f.z); g.beginPath(); g.arc(m.x, m.y, 4.5, 0, TAU); g.fillStyle = '#7CFFB2'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#0c1115'; g.stroke(); }
    const gd = mapBridge.guide;
    if (dest && carsHere().some(o => o.id === dest)) { /* the marker is on a vehicle: its ringed icon is the mark */ }
    else if (gd && !dest && job) { const m = S(gd.x, gd.z); drawJobBadge(g, job, m.x, m.y, 11, 0.5 + 0.5 * Math.sin(t * 5)); }
    else if (gd && !dest) { const m = S(gd.x, gd.z); g.beginPath(); g.arc(m.x, m.y, 7 + 2 * Math.sin(t * 5), 0, TAU); g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#0c1115'; g.stroke(); }
    const pl = mapBridge.player, pm = S(pl.x, pl.z);
    g.beginPath(); g.arc(pm.x, pm.y, 13, 0, TAU); g.fillStyle = 'rgba(255,255,255,.22)'; g.fill();
    drawArrow(g, pm.x, pm.y, Math.PI - pl.facing, 10);
    // north marker (the map is north up) and the scale bar
    g.beginPath(); g.arc(W - 22, 22, 11, 0, TAU); g.fillStyle = '#e8473f'; g.fill(); g.lineWidth = 1.6; g.strokeStyle = '#f4f6f8'; g.stroke();
    g.fillStyle = '#fff'; g.font = '800 12px system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText('N', W - 22, 22.5);
    const bar = [20, 50, 100, 200].find(m => m * view.scale > 48) ?? 200;
    g.fillStyle = 'rgba(8,12,16,.8)'; g.fillRect(10, H - 24, bar * view.scale + 8, 16);
    g.fillStyle = '#f4f6f8'; g.fillRect(14, H - 12, bar * view.scale, 2); g.font = '700 10px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(bar + ' m', 14, H - 15);
  };

  const here = (mapBridge.hub?.id ?? null) as import('../core/types').HubId | null;
  const cardHtml = () => {
    const pl = mapBridge.player;
    if (remote) return remoteCardHtml(remote, here);
    const mk0 = mapBridge.destination(), cv0 = car ?? (selected ? null : carsHere().find(o => o.id === mk0) ?? null);
    if (cv0) {                                                             // one's own vehicle, picked or marked: how far it is, and the one marker of the game
      // (the way kept for the objective is used only once it is the way to this vehicle: it is refreshed a moment after the marker moves)
      const marked = mk0 === cv0.id, rt = mapBridge.route, end = rt?.points[rt.points.length - 1];
      const d = marked && rt && end && Math.hypot(end.x - cv0.x, end.z - cv0.z) < 12 ? rt.length : Math.hypot(cv0.x - pl.x, cv0.z - pl.z);
      return `<div class="fm-row"><span class="cm-ic" aria-hidden="true">${esc(cv0.icon)}</span><b>${esc(cv0.name)}</b><em>${marked ? 'Repère' : 'À toi'}</em></div><p class="fm-sub fm-dist"><strong>${distText(d)}</strong> · 🚶 ${walkTime(d)}</p>
        <div class="cm-acts"><button type="button" class="ph-btn fm-mark${marked ? ' on' : ''}" data-fm="markcar" data-id="${esc(cv0.id)}">${marked ? 'Retirer le repère' : '📍 Marquer'}</button></div>${note ? `<p class="fm-note">${esc(note)}</p>` : ''}`;
    }
    if (!selected) {
      const mk = mapBridge.destination(), mp = mk ? mapBridge.places.find(q => q.id === mk) : null;
      if (mp) { const d = mapBridge.route?.length ?? Math.hypot(mp.x - pl.x, mp.z - pl.z);
        return `<div class="fm-row"><span class="cm-ic" aria-hidden="true">📍</span><b>${esc(mp.name)}</b><em>Repère</em></div><p class="fm-sub"><strong>${distText(d)}</strong> · 🚶 ${walkTime(d)}</p>
          <div class="cm-acts"><button type="button" class="ph-btn" data-fm="clear">Retirer le repère</button></div>`; }
      const w = whereLabel(mapBridge.hubName, mapBridge.places, pl.x, pl.z);
      return `<div class="fm-row"><b>${esc(w.district)}</b></div><p class="fm-sub">${esc(w.street)} · touche un lieu</p>`;
    }
    const p = selected, d = selRoute?.length ?? Math.hypot(p.x - pl.x, p.z - pl.z), marked = mapBridge.destination() === p.id;
    const what = p.what.length ? ` · ${esc(p.what[0])}` : '';
    return `<div class="fm-row"><i class="fm-dot" style="--c:${KIND_COLOR[p.kind]}"></i><b>${esc(p.name)}</b><em>${KIND_LABEL[p.kind]}</em></div>
      <p class="fm-sub fm-dist"><strong>${distText(d)}</strong> · 🚶 ${walkTime(d)}${what}</p>
      <div class="cm-acts"><button type="button" class="ph-btn fm-mark${marked ? ' on' : ''}" data-fm="mark">${marked ? 'Retirer le repère' : '📍 Marquer'}</button>${here ? pinHtml({ id: p.id, name: p.name, hub: here, icon: '📍' }) : ''}</div>${note ? `<p class="fm-note">${esc(note)}</p>` : ''}`;
  };
  let cardKey = '';
  const refreshCard = (force = false) => {
    const html = cardHtml(); if (!force && html === cardKey) return;
    cardKey = html; card.innerHTML = html;
  };

  const select = (p: MapPlace | null) => {
    selected = p; note = ''; remote = null; car = null;
    selRoute = p ? routePath(mapBridge.net(mapBridge.player, p), { x: mapBridge.player.x, z: mapBridge.player.z }, p) : null;
    refreshCard(true); kick();
    if (p) card.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });      // portrait: the card sits under the map
  };

  /** One of the player's vehicles is picked: its card, and (`centre`) the view on it, close enough to see the street it stands in. */
  const pick = (o: MapOwned, centre: boolean) => {
    select(null); car = o; follow = false;
    if (centre) { view.cx = o.x; view.cz = o.z; view.scale = Math.max(view.scale, fit * 2.4); clampView(); }
    refreshCard(true); kick();
    card.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  };

  // ---- pointer: drag to pan, tap to select, pinch and wheel to zoom
  const pts = new Map<number, { x: number; y: number }>();
  let moved = 0, pinch = 0;
  const local = (e: PointerEvent | WheelEvent) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener('pointerdown', e => {
    follow = false;
    e.stopPropagation(); cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, local(e)); moved = 0;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  }, sig);
  cv.addEventListener('pointermove', e => {
    const prev = pts.get(e.pointerId); if (!prev) return;
    const cur = local(e); pts.set(e.pointerId, cur);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch);
      pinch = d; moved = 99;
    } else if (pts.size === 1) {
      moved += Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
      if (moved > 6) { view.cx -= (cur.x - prev.x) / view.scale; view.cz -= (cur.y - prev.y) / view.scale; clampView(); kick(); }
    }
  }, sig);
  const up = (e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return;
    const wasTap = pts.size === 1 && moved <= 6 && e.type === 'pointerup';
    const at = local(e); pts.delete(e.pointerId); if (pts.size < 2) pinch = 0;
    if (!wasTap) return;
    let best: MapPlace | null = null, bd = 22 * 22;
    // one's own vehicle first (its disc is larger than a place's dot, and there are few of them)
    const mine = carsHere().find(o => { const m = S(o.x, o.z); return (m.x - at.x) ** 2 + (m.y - at.y) ** 2 < 20 * 20; });
    if (mine) { pick(mine, false); return; }
    for (const p of visible()) { const m = S(p.x, p.z), d = (m.x - at.x) ** 2 + (m.y - at.y) ** 2; if (d < bd) { bd = d; best = p; } }
    select(best);
  };
  cv.addEventListener('pointerup', up, sig); cv.addEventListener('pointercancel', up, sig);
  cv.addEventListener('wheel', e => { e.preventDefault(); const p = local(e); zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0016)); }, { passive: false, signal: life.signal });

  const onClick = (e: Event) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-fm],[data-kind]'); if (!b || !host.contains(b)) return;
    const k = b.dataset.kind;
    if (k) {
      const kind = k as PlaceKind;
      if (hidden.has(kind)) hidden.delete(kind); else hidden.add(kind);
      b.classList.toggle('on', !hidden.has(kind)); b.setAttribute('aria-pressed', String(!hidden.has(kind)));
      if (selected && hidden.has(selected.kind)) select(null);
      kick(); return;
    }
    switch (b.dataset.fm) {
      case 'in': zoomAt(W / 2, H / 2, 1.5); break;
      case 'out': zoomAt(W / 2, H / 2, 1 / 1.5); break;
      case 'me': follow = true; view.cx = mapBridge.player.x; view.cz = mapBridge.player.z; view.scale = Math.max(view.scale, fit * 1.6); clampView(); kick(); break;
      case 'mark': if (selected) {
        if (mapBridge.destination() === selected.id) { mapBridge.walkTo(null); note = 'Repère retiré'; }
        else { mapBridge.walkTo(selected.id); note = 'Repère placé : suis le trait pointillé'; }
        refreshCard(true); kick();
      } break;
      case 'markcar': {
        const id = b.dataset.id!;
        if (mapBridge.destination() === id) { mapBridge.walkTo(null); note = 'Repère retiré'; car = null; }
        else { mapBridge.walkTo(id); note = 'Repère placé : suis le trait pointillé'; }
        refreshCard(true); kick();
      } break;
      case 'clear': mapBridge.walkTo(null); refreshCard(true); kick(); break;
      case 'filters': { const pop = host.querySelector<HTMLElement>('#cm-pop'); if (pop) { pop.hidden = !pop.hidden; b.setAttribute('aria-expanded', String(!pop.hidden)); } } break;
    }
  };
  host.addEventListener('click', onClick, sig);
  /** The strip under the map asks for a place or a district: this district's places are selected (and centred), anything else gets its card (how far, the button that goes there). */
  const onFocus = (e: Event) => {
    const f = (e as CustomEvent<Focus>).detail, pl = mapBridge.player;
    follow = false;
    if (f.kind === 'place' && f.hub === here) {
      const p = mapBridge.places.find(q => q.id === f.id);
      if (p) {
        if (hidden.delete(p.kind)) { const chip = host.querySelector<HTMLElement>(`.fm-chip[data-kind="${p.kind}"]`); chip?.classList.add('on'); chip?.setAttribute('aria-pressed', 'true'); }
        select(p); view.cx = p.x; view.cz = p.z; view.scale = Math.max(view.scale, fit * 2); clampView(); kick(); return;
      }
    }
    if (f.kind === 'point' && f.hub === here) { const o = carsHere().find(q => q.id === f.id); if (o) { pick(o, true); return; } }
    if (f.kind === 'hub' && f.hub === here) { remote = null; select(null); view.cx = pl.x; view.cz = pl.z; clampView(); kick(); return; }
    remote = f; selected = null; car = null; selRoute = null; refreshCard(true); kick();
  };
  const onRefresh = () => refreshCard(true);
  host.addEventListener('carte:focus', onFocus, sig); host.addEventListener('carte:refresh', onRefresh, sig);
  cv.addEventListener('pointerdown', () => { const pop = host.querySelector<HTMLElement>('#cm-pop'); if (pop && !pop.hidden) { pop.hidden = true; host.querySelector('[data-fm="filters"]')?.setAttribute('aria-expanded', 'false'); } }, sig);

  mapBridge.screenOf = (x, z) => { const r = cv.getBoundingClientRect(), m = S(x, z); return { x: r.left + m.x, y: r.top + m.y }; };
  const ro = new ResizeObserver(resize); ro.observe(cv);
  resize(); refreshCard(true);
  // « Localiser » asked for a point before the screen opened (src/ui/carteState.ts): this map takes it when it is the one that shows it
  { const w = peekFocus(); if (w && W) { takeFocus(); onFocus(new CustomEvent<Focus>('carte:focus', { detail: w })); } }
  timer = window.setInterval(() => {
    // another district was loaded under the open map (a road crossed, a quality change that rebuilds the district): this map is of the one that is gone, the screen draws itself again
    if (mapBridge.hub !== hub || mapBridge.layer !== lay) { host.dispatchEvent(new Event('carte:stale')); return; }
    t += 0.1; resize();
    { const w = peekFocus(); if (w && W) { takeFocus(); onFocus(new CustomEvent<Focus>('carte:focus', { detail: w })); } }   // (the canvas had no size yet when the screen was mounted)
    if (car) { const o = carsHere().find(q => q.id === car!.id); if (!o) car = null; else car = o; }                         // sold, or driven away
    const pl = mapBridge.player;
    if (follow && (view.cx !== pl.x || view.cz !== pl.z)) { view.cx = pl.x; view.cz = pl.z; clampView(); }
    if (selected && (selRoute?.points[0].x !== pl.x || selRoute?.points[0].z !== pl.z) && Math.hypot((selRoute?.points[0].x ?? 0) - pl.x, (selRoute?.points[0].z ?? 0) - pl.z) > 3) { selRoute = routePath(mapBridge.net(pl, selected), { x: pl.x, z: pl.z }, selected); }
    refreshCard(); draw();
  }, 100);
  return () => { mapBridge.screenOf = null; clearInterval(timer); cancelAnimationFrame(raf); ro.disconnect(); life.abort(); };
}
