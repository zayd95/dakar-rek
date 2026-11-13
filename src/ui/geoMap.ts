import type * as ML from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { HUB_NAMES } from '../world/content';
import { HUB_ANCHORS, cityBounds, cityFitPad, gameToLngLat, hubFootprint, hubToLngLat, inFootprint, linkLineFrom, mapLinks, type MapLink } from '../geo/anchors';
import { HUB_IDS, type HubId } from '../core/types';
import { CITY_HUBS, planTrip, type TripPlan } from '../road/graph';
import { mapBridge, type MapOwned } from './minimap';
export { geoMapHtml, geoCardHtml } from './geoMapHtml';
import { KIND_COLOR, KIND_LABEL, declutter, nightness, type MapPlace } from './minimapMath';
import { pinHtml, remoteCardHtml, takeFocus, type Focus } from './carteState';
import { phoneHooks } from './phoneHooks';

/**
 * The phone's city map (Carte › « Ville »): the whole of Dakar on a MapLibre GL map, with the playable districts, the roads that join them, the player and the vehicles on it.
 * It is the MAP, not the driving engine: the 3D world stays Three.js. Everything about MapLibre is loaded when this tab opens (a lazy chunk: the game's own bundle never carries it) and
 * released when it closes (`map.remove()` frees the WebGL context, the workers and the tiles).
 *
 * Two layers of data, so it always shows something:
 *  • bundled and offline: the coast (Natural Earth, public domain) and the reference roads and landmarks (src/geo/dakarData.ts, hand-placed and approximate), drawn as GeoJSON on a plain style;
 *  • optional and online: a vector basemap built from OpenStreetMap (OpenFreeMap, which is free and keyless; ODbL data, © OpenMapTiles, © OpenStreetMap contributors, always credited on the
 *    map). It replaces the reference layer when its style loads in time; when it does not (offline, blocked, slow) the map keeps the bundled layer and says so.
 * The playable layer (districts, corridors, markers) is always ours and always on top. Labels are DOM markers, not symbol layers: they need no font server, so they work offline too.
 */
const STYLE_URL: string = (typeof window !== 'undefined' && (window as unknown as { __DAKAR_MAP_STYLE?: string }).__DAKAR_MAP_STYLE) || (import.meta.env?.VITE_MAP_STYLE as string | undefined) || 'https://tiles.openfreemap.org/styles/liberty';
const STYLE_TIMEOUT_MS = 6000;
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const km = (m: number) => m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(m / 10) * 10 + ' m';
const short = (h: HubId) => HUB_NAMES[h].split(' · ')[0];
/** From this zoom the places of the district the player is in are drawn. */
const CLOSE_ZOOM = 13.2;

/** Mounts the city map in `host` (the markup above); returns what to call when the tab or the phone closes. */
export function mountGeoMap(host: HTMLElement): () => void {
  const root = host.querySelector<HTMLElement>('#gm'), box = host.querySelector<HTMLElement>('.gm-map'), card = host.querySelector<HTMLElement>('.gm-card'), status = host.querySelector<HTMLElement>('.gm-status');
  if (!root || !box || !card || !status) return () => {};
  let dead = false, map: ML.Map | null = null, timer = 0, online = false, errors = 0;
  const markers: ML.Marker[] = [];
  /** The name labels (districts, roads, quarters): drawn by rank so that none covers another (`fitLabels`). */
  const labs: { el: HTMLElement; ll: [number, number]; rank: number; w: number; h: number; dy: number; on: boolean }[] = [];
  // every listener of this mount: the markup outlives the tab (it is mounted again each time « Ville » opens), so a listener left behind would answer twice
  const life = new AbortController(), sig = { signal: life.signal };
  const dyn: { player?: ML.Marker; owned: ML.Marker[]; places: ML.Marker[]; pin?: ML.Marker } = { owned: [], places: [] };
  let styleEl: HTMLStyleElement | null = null;

  /** The status line over the map: `ms` on screen (0: it stays, for what the player must know to go on). */
  const tell = (t: string, ms = 4000) => { status.textContent = t; status.hidden = !t; if (t && ms) setTimeout(() => { if (status.textContent === t) status.hidden = true; }, ms); };

  void (async () => {
    let ml: typeof ML, css: string, data: typeof import('../geo/dakarData'), land: FeatureCollection, workerUrl: string;
    try {
      [ml, css, data, land, workerUrl] = await Promise.all([
        import('maplibre-gl'),
        import('maplibre-gl/dist/maplibre-gl.css?inline').then(m => m.default as string),
        import('../geo/dakarData'),
        import('../geo/data/land.json').then(m => m.default as unknown as FeatureCollection),
        (window as unknown as { __dakarMapWorkerUrl?: string }).__dakarMapWorkerUrl ? Promise.resolve((window as unknown as { __dakarMapWorkerUrl: string }).__dakarMapWorkerUrl) : import('maplibre-gl/dist/maplibre-gl-worker.mjs?url').then(m => m.default as string),
      ]);
    } catch { if (!dead) tell('La carte de la ville n’a pas pu se charger. Le plan du quartier reste disponible.', 0); return; }
    if (dead) return;
    if (!document.getElementById('maplibre-css')) { styleEl = document.createElement('style'); styleEl.id = 'maplibre-css'; styleEl.textContent = css; document.head.appendChild(styleEl); }
    try { (ml as unknown as { setWorkerUrl(u: string): void }).setWorkerUrl(workerUrl); } catch { /* the library's own default */ }

    const night = nightness(mapBridge.hour) > 0.5;
    box.classList.toggle('night', night);
    try {
      map = new ml.Map({
        // it opens on the whole city: the five districts, apart, each where it lies, and the roads between them (◎ goes to the player)
        container: box, style: offlineStyle(night), bounds: cityBounds(), fitBoundsOptions: { padding: cityFitPad(box.clientHeight) }, minZoom: 9, maxZoom: 17.5, maxBounds: [[-17.75, 14.5], [-17.0, 15.0]],
        attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, pixelRatio: Math.min(2, window.devicePixelRatio || 1), fadeDuration: 0, canvasContextAttributes: { antialias: false },
      } as ML.MapOptions);
    } catch { tell('La carte de la ville demande WebGL, indisponible ici. Le plan du quartier reste disponible.', 0); map = null; return; }
    const m = map;
    m.touchZoomRotate.disableRotation();
    let credit = new ml.AttributionControl({ compact: true, customAttribution: ['Côte : Natural Earth (domaine public)', 'Tracés de jeu : approximatifs'] });
    m.addControl(credit, 'bottom-left');
    (window as unknown as { __geoMap?: unknown }).__geoMap = { map: m, ready: false, get online() { return online; } };

    const overlays = () => {
      if (!m.getStyle()) return;
      if (!online) {
        m.addSource('land', { type: 'geojson', data: land });
        m.addLayer({ id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': night ? '#4b4a42' : '#ece2c6', 'fill-outline-color': night ? '#6a685c' : '#c9bd98' } });
        m.addSource('ref-roads', { type: 'geojson', data: { type: 'FeatureCollection', features: data.REFERENCE_ROADS.roads.map(r => ({ type: 'Feature', properties: { rank: r.rank, name: r.name }, geometry: { type: 'LineString', coordinates: r.pts } })) } });
        m.addLayer({ id: 'ref-roads-casing', type: 'line', source: 'ref-roads', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': night ? '#2a2a2e' : '#b8ad8c', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2, 15, 9] } });
        m.addLayer({ id: 'ref-roads', type: 'line', source: 'ref-roads', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['match', ['get', 'rank'], 'motorway', night ? '#c9a24d' : '#f0b94a', 'trunk', night ? '#9b9b9b' : '#fff7e0', night ? '#8a8a8a' : '#ffffff'], 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 15, 6] } });
      }
      // the playable districts: the footprint of each hub's streets on the map, and the roads that join them
      m.addSource('hubs', { type: 'geojson', data: { type: 'FeatureCollection', features: HUB_IDS.map(id => ({ type: 'Feature', properties: { id }, geometry: { type: 'Polygon', coordinates: [hubFootprint(id)] } })) } });
      m.addLayer({ id: 'hubs-fill', type: 'fill', source: 'hubs', paint: { 'fill-color': '#e8590c', 'fill-opacity': 0.16 } });
      m.addLayer({ id: 'hubs-line', type: 'line', source: 'hubs', paint: { 'line-color': '#e8590c', 'line-width': 1.6, 'line-opacity': 0.85 } });
      // every way the game has between two districts, and only those: the roads (src/road/routes.ts) and the border street where two districts touch (src/transport/hubLink.ts)
      m.addSource('corridors', { type: 'geojson', data: { type: 'FeatureCollection', features: mapLinks().map(k => ({ type: 'Feature', properties: { id: k.id, kind: k.kind }, geometry: { type: 'LineString', coordinates: k.line } })) } });
      m.addLayer({ id: 'corridors-casing', type: 'line', source: 'corridors', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': night ? '#1f1f23' : '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4, 15, 12] } });
      m.addLayer({ id: 'corridors', type: 'line', source: 'corridors', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#e8590c', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2.2, 15, 7] } });
      // the way to drive to the district being looked at (through the districts in between): drawn over the corridors
      m.addSource('route', { type: 'geojson', data: routeData });
      m.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 6, 15, 15] } });
      m.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#1971c2', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 3.4, 15, 9] } });
    };
    let routeData: FeatureCollection = { type: 'FeatureCollection', features: [] };
    /** Draws (or clears) the driving route of a trip plan. */
    const setRoute = (plan: TripPlan | null) => {
      routeData = { type: 'FeatureCollection', features: plan ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: routeLine(plan) } }] : [] };
      try { (m.getSource('route') as ML.GeoJSONSource | undefined)?.setData(routeData); } catch { /* the style is being replaced: overlays() adds it with the data */ }
    };
    m.on('style.load', () => { if (dead) return; try { overlays(); } catch { /* a style change mid-way: the next one adds them */ } });

    const labels = () => {
      for (const k of markers.splice(0)) k.remove();
      labs.length = 0;
      const add = (el: HTMLElement, ll: [number, number], rank: number, onTap?: () => void, above = false) => {
        if (onTap) el.addEventListener('click', e => { e.stopPropagation(); onTap(); });
        markers.push(new ml.Marker({ element: el, anchor: above ? 'bottom' : 'center', offset: above ? [0, -3] : [0, 0] }).setLngLat(ll).addTo(m));
        labs.push({ el, ll, rank, w: 0, h: 0, dy: above ? -1 : 0, on: true });
      };
      // a playable district: its name stands on the top edge of its rectangle, so the rectangle (and the player in it) stays in sight at every zoom
      const here = hubNow();
      for (const id of HUB_IDS) add(div('gm-hub', `<i></i>${esc(short(id))}`), hubToLngLat(id, 0, -HUB_ANCHORS[id].half), id === here ? 110 : 100, () => showHub(id), true);
      for (const k of mapLinks()) add(div('gm-road', '🛣️'), midOf(k.line), 60, () => showLink(k));
      // districts that are planned but not open yet: on the map, dimmed, with no road to them
      for (const h of CITY_HUBS) if (h.status === 'planned') add(div('gm-hub planned', `<i></i>${esc(h.name.split(' · ')[0])}`), h.lngLat, 40, () => showPlanned(h.name));
      // the quarters and places of the bundled layer, when there is no basemap to name them; never a second name for a district that is already on the map
      if (!online) for (const l of data.LANDMARKS) {
        const twin = CITY_HUBS.some(h => h.name.split(' · ').includes(l.name.split(' · ')[0])) || HUB_IDS.some(id => inFootprint(id, l.lngLat));
        if (!twin) add(div(`gm-lab gm-${l.kind}`, esc(l.name)), l.lngLat, l.kind === 'district' ? 20 : 10);
      }
      fitLabels();
    };
    /** Shows each label only where it covers no label that matters more (districts first, then the roads, the planned districts, the quarters): on every move of the map. */
    const fitLabels = () => {
      if (!labs.length) return;
      const keep = declutter(labs.map(l => {
        if (!l.w) { l.w = l.el.offsetWidth; l.h = l.el.offsetHeight; }
        const p = m.project(l.ll);
        return { x: p.x, y: p.y + l.dy * (3 + l.h / 2), w: l.w, h: l.h, rank: l.rank };
      }), 3);
      labs.forEach((l, i) => { if (keep[i] !== l.on) { l.on = keep[i]; l.el.classList.toggle('gm-off', !keep[i]); } });
    };

    const reveal = () => card.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    const hubNow = () => (mapBridge.hub?.id ?? null) as HubId | null;
    let redraw: () => void = () => {};
    const showHub = (id: HubId) => {
      redraw = () => showHub(id);
      card.innerHTML = remoteCardHtml({ kind: 'hub', hub: id }, hubNow());
      const h = hubNow(); setRoute(h && h !== id ? planTrip(h, id) : null);
      reveal();
    };
    const showPlanned = (name: string) => {
      redraw = () => showPlanned(name); setRoute(null);
      card.innerHTML = `<div class="fm-row"><span class="cm-ic" aria-hidden="true">🚧</span><b>${esc(name)}</b><em>À venir</em></div><p class="fm-sub">Ce quartier n’est pas encore ouvert : pas de route pour y aller.</p>`;
      reveal();
    };
    /** A way between two districts: what it is in the game (a road to drive, or two districts that touch), how far it really is (along its line on the map), what it passes. */
    const showLink = (k: MapLink) => {
      redraw = () => showLink(k); setRoute(null);
      const real = k.realMetres >= 9500 ? `${Math.round(k.realMetres / 1000)} km` : km(k.realMetres), via = k.via.map(esc).join(' → ');
      card.innerHTML = `<div class="fm-row"><span class="cm-ic" aria-hidden="true">🛣️</span><b>${esc(short(k.a))} ↔ ${esc(short(k.b))}</b><em>${k.road ? 'Route' : 'Rue'}</em></div>
        ${k.road ? `<p class="fm-sub"><strong>${km(k.road.length)}</strong> à parcourir · ≈ ${real} en vrai</p>` : `<p class="fm-sub">Les deux quartiers se touchent : la rue continue de l’un à l’autre · ≈ ${real} en vrai</p>`}
        <p class="fm-sub">${via ? `Par ${via} · ` : ''}sans chargement</p>`;
      reveal();
    };
    const showPlace = (p: MapPlace) => {
      redraw = () => showPlace(p);
      const dest = mapBridge.destination() === p.id, h = hubNow();
      card.innerHTML = `<div class="fm-row"><span class="fm-dot" style="--c:${KIND_COLOR[p.kind]}"></span><b>${esc(p.name)}</b><em>${KIND_LABEL[p.kind]}</em></div>${p.what.length ? `<p class="fm-sub">${esc(p.what[0])}</p>` : ''}
        <div class="cm-acts"><button type="button" class="ph-btn fm-mark${dest ? ' on' : ''}" data-gm-mark="${esc(p.id)}">${dest ? 'Retirer le repère' : '📍 Marquer'}</button>${h ? pinHtml({ id: p.id, name: p.name, hub: h, icon: '📍' }) : ''}</div>`;
      reveal();
    };
    /**
     * One of the player's own parked vehicles (its icon tapped, or « Localiser »): where it is, and the game's one marker. In the district the player is in the marker goes
     * straight on it; in another district the card is the one of a place over there (the walk that keeps the marker, the directions that end on the vehicle).
     */
    const showCar = (o: MapOwned) => {
      redraw = () => { const now = mapBridge.owned().find(q => q.id === o.id); if (now) showCar(now); else card.innerHTML = ''; };
      const h = hubNow(), f: Focus = { kind: 'point', id: o.id, hub: o.hub, name: o.name, icon: o.icon, x: o.x, z: o.z };
      setRoute(h && h !== o.hub ? planTrip(h, o.hub) : null);
      if (h !== o.hub) { card.innerHTML = remoteCardHtml(f, h); reveal(); return; }
      const marked = mapBridge.destination() === o.id;
      card.innerHTML = `<div class="fm-row"><span class="cm-ic" aria-hidden="true">${esc(o.icon)}</span><b>${esc(o.name)}</b><em>${esc(short(o.hub))}</em></div>
        <p class="fm-sub fm-dist"><strong>${km(Math.hypot(o.x - mapBridge.player.x, o.z - mapBridge.player.z))}</strong> à vol d’oiseau</p>
        <div class="cm-acts"><button type="button" class="ph-btn fm-mark${marked ? ' on' : ''}" data-gm-mark="${esc(o.id)}">${marked ? 'Retirer le repère' : '📍 Marquer'}</button></div>`;
      reveal();
    };
    /** The strip under the map asks for a district, or a place of another district: the map flies there and the card says how to go. */
    const onFocus = (e: Event) => {
      const f = (e as CustomEvent<Focus>).detail;
      if (f.kind === 'point') {                                               // a vehicle: the map goes to the very spot, close enough to tell the street
        const o = mapBridge.owned().find(q => q.id === f.id);
        if (o) showCar(o); else { redraw = () => { card.innerHTML = remoteCardHtml(f, hubNow()); }; redraw(); reveal(); }
        map?.easeTo({ center: gameToLngLat(f.hub, f.x, f.z).lngLat, zoom: Math.max(map.getZoom(), 14.6), duration: 500 });
        return;
      }
      if (f.kind === 'hub') { showHub(f.hub); map?.easeTo({ center: HUB_ANCHORS[f.hub].lngLat, zoom: Math.max(map.getZoom(), 12.5), duration: 500 }); return; }
      redraw = () => { card.innerHTML = remoteCardHtml(f, hubNow()); };
      redraw(); reveal();
      const h = hubNow(); setRoute(h && h !== f.hub ? planTrip(h, f.hub) : null);
      map?.easeTo({ center: HUB_ANCHORS[f.hub].lngLat, zoom: Math.max(map.getZoom(), 12.5), duration: 500 });
    };
    host.addEventListener('carte:focus', onFocus, sig); host.addEventListener('carte:refresh', () => redraw(), sig);
    card.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-gm-mark]'); if (!b) return;
      const id = b.dataset.gmMark!; mapBridge.walkTo(mapBridge.destination() === id ? null : id);
      const p = mapBridge.places.find(q => q.id === id); if (p) showPlace(p); else redraw();
      refresh();
    }, sig);
    card.innerHTML = '<div class="fm-row"><b>Dakar</b></div><p class="fm-sub">Touche un quartier ou une route</p>';

    /** Player, own vehicles, the places of the district you are in and the marked place: cheap, refreshed twice a second while the tab is open. */
    const hub0 = mapBridge.hub;
    const refresh = () => {
      if (!map || dead) return;
      // another district was loaded under the open map: the strip and the cards were written for the one that is gone, the screen draws itself again
      if (mapBridge.hub !== hub0) { host.dispatchEvent(new Event('carte:stale')); return; }
      const p = mapBridge.player, hub = (mapBridge.hub?.id ?? 'pikine') as HubId;
      const w = gameToLngLat(hub, p.x, p.z);
      if (!dyn.player) { dyn.player = new ml.Marker({ element: div('gm-me', '<b></b>'), anchor: 'center', rotationAlignment: 'map' }).setLngLat(w.lngLat).addTo(map); }
      // the arrow points where the player (or the car) faces, as on the district's map; out on a road between districts, along the road's line on this map
      // (the game's road and its real alignment do not bend alike), the way the player is going on it
      let turn = Math.PI - p.facing;
      if (w.kind === 'road' && w.road && w.s !== undefined) {
        const a = w.road.spine.at(Math.max(0, w.s - 2)), b = w.road.spine.at(Math.min(w.road.length, w.s + 2));
        turn = w.bearing + (Math.sin(p.facing) * (b.x - a.x) + Math.cos(p.facing) * (b.z - a.z) < 0 ? Math.PI : 0);
      }
      dyn.player.setLngLat(w.lngLat).setRotation((turn * 180) / Math.PI);
      dyn.player.getElement().classList.toggle('driving', p.driving);
      // own vehicles, wherever they are parked
      const owned = mapBridge.owned();
      while (dyn.owned.length > owned.length) dyn.owned.pop()!.remove();
      owned.forEach((o, i) => {
        const ll = gameToLngLat(o.hub, o.x, o.z).lngLat;
        if (!dyn.owned[i]) {
          const el = div('gm-car', ''); el.setAttribute('role', 'button');
          el.addEventListener('click', e => { e.stopPropagation(); const now = mapBridge.owned()[i]; if (now) showCar(now); });   // (the list is read again: the marker is reused as the vehicles change)
          dyn.owned[i] = new ml.Marker({ element: el, anchor: 'center' }).setLngLat(ll).addTo(map!);
        }
        dyn.owned[i].setLngLat(ll); const el = dyn.owned[i].getElement();
        if (el.textContent !== o.icon) el.textContent = o.icon;
        el.title = o.name; el.dataset.car = o.id; el.setAttribute('aria-label', o.name);
        el.classList.toggle('on', o.id === (phoneHooks.marked?.()?.id ?? null));
      });
      // the places of the district the player is in (rebuilt only when the list changes)
      const list = mapBridge.places, key = hub + ':' + mapBridge.version + ':' + list.map(q => q.id).join();   // (the list is refreshed as modules add their places)
      if ((dyn as { key?: string }).key !== key) {
        (dyn as { key?: string }).key = key;
        for (const k of dyn.places.splice(0)) k.remove();
        for (const pl of list) {
          const el = div('gm-pl', ''); el.style.setProperty('--c', KIND_COLOR[pl.kind]); el.title = pl.name;
          el.addEventListener('click', e => { e.stopPropagation(); showPlace(pl); });
          dyn.places.push(new ml.Marker({ element: el, anchor: 'center' }).setLngLat(hubToLngLat(hub, pl.x, pl.z)).addTo(map));
        }
      }
      // the marked place: where it is in this district; a place marked in another district (a dealer, a shortcut) is pinned on that district
      // …and the marker on one of the player's vehicles (« Localiser ») is pinned on the vehicle itself, in whatever district it stands
      const dest = mapBridge.destination(), dp = dest ? list.find(q => q.id === dest) : null, far = dp ? null : phoneHooks.marked?.() ?? null, car = far ? owned.find(o => o.id === far.id) : null;
      const pll = dp ? hubToLngLat(hub, dp.x, dp.z) : car ? gameToLngLat(car.hub, car.x, car.z).lngLat : far && far.hub !== hub ? HUB_ANCHORS[far.hub].lngLat : null;
      if (pll) { if (!dyn.pin) dyn.pin = new ml.Marker({ element: div('gm-pin', '📍'), anchor: 'bottom' }).setLngLat(pll).addTo(map); dyn.pin.setLngLat(pll); }
      else if (dyn.pin) { dyn.pin.remove(); dyn.pin = undefined; }
    };
    const recenter = () => map?.easeTo({ center: gameToLngLat((mapBridge.hub?.id ?? 'pikine') as HubId, mapBridge.player.x, mapBridge.player.z).lngLat, zoom: Math.max(map.getZoom(), 13), duration: 400 });
    const all = () => map?.fitBounds(cityBounds(), { padding: cityFitPad(box.clientHeight), duration: 400 });
    root.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-gm]'); if (!b) return;
      if (b.dataset.gm === 'me') recenter(); else if (b.dataset.gm === 'in') map?.zoomIn({ duration: 250 }); else if (b.dataset.gm === 'out') map?.zoomOut({ duration: 250 }); else all();
    }, sig);
    const zoomClass = () => root.classList.toggle('gm-close', m.getZoom() >= CLOSE_ZOOM);
    // a tap on the map close in: the nearest place of the district within a fingertip (the dots are small and stand close together)
    m.on('click', e => {
      if (m.getZoom() < CLOSE_ZOOM) return;
      const hub = (mapBridge.hub?.id ?? 'pikine') as HubId;
      let best: MapPlace | null = null, bd = 26 * 26;
      for (const pl of mapBridge.places) { const q = m.project(hubToLngLat(hub, pl.x, pl.z)), dd = (q.x - e.point.x) ** 2 + (q.y - e.point.y) ** 2; if (dd < bd) { bd = dd; best = pl; } }
      if (best) showPlace(best);
    });

    m.once('load', () => {
      if (dead) return;
      labels(); refresh(); zoomClass(); tell('');
      { const w = takeFocus(); if (w) onFocus(new CustomEvent<Focus>('carte:focus', { detail: w })); }      // « Localiser » asked for a point before the screen opened (src/ui/carteState.ts)
      (window as unknown as { __geoMap: { ready: boolean } }).__geoMap.ready = true;
      m.on('zoom', zoomClass); m.on('move', fitLabels);
      timer = window.setInterval(refresh, 500);
      void goOnline(m, ml);
    });
    m.on('error', ev => { errors++; if (online && errors > 12) tell('Fond de carte partiel : connexion lente.'); void ev; });

    /** Tries the vector basemap; keeps the bundled layer if it does not come in time. */
    async function goOnline(mm: ML.Map, lib: typeof ML) {
      if (STYLE_URL === 'off') { tell('Fond de carte hors ligne : repères simplifiés.', 7000); return; }
      try {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), STYLE_TIMEOUT_MS);
        const r = await fetch(STYLE_URL, { signal: ctl.signal, credentials: 'omit' }); clearTimeout(to);
        if (!r.ok) throw new Error(String(r.status));
        const style = await r.json();
        if (dead || !map) return;
        online = true;
        mm.setStyle(style, { diff: false });                                   // style.load re-adds the playable layer on top of the real one
        mm.once('style.load', () => { if (dead) return; labels(); tell('Fond de carte : OpenStreetMap via OpenFreeMap.'); });
        mm.removeControl(credit);
        credit = new lib.AttributionControl({ compact: true, customAttribution: ['Tracés de jeu : approximatifs', '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · Données © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">contributeurs d’OpenStreetMap</a>'] });
        mm.addControl(credit, 'bottom-left');
      } catch {
        online = false; if (!dead) tell('Fond de carte indisponible : repères simplifiés (tracés approximatifs).', 7000);
      }
    }
  })();

  return () => {
    dead = true; clearInterval(timer); life.abort();
    try { for (const k of [...markers, ...dyn.owned, ...dyn.places, dyn.player, dyn.pin]) k?.remove(); } catch { /* */ }
    try { map?.remove(); } catch { /* the context is already gone */ }
    map = null; styleEl?.remove();
    delete (window as unknown as { __geoMap?: unknown }).__geoMap;
    box.replaceChildren();
  };
}

const div = (cls: string, html: string) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return d; };

/** The point half-way along a line of the map (where a road's own marker stands). */
function midOf(line: [number, number][]): [number, number] {
  const d = line.map((p, i) => (i ? Math.hypot(p[0] - line[i - 1][0], p[1] - line[i - 1][1]) : 0)), half = d.reduce((a, b) => a + b, 0) / 2;
  let run = 0;
  for (let i = 1; i < line.length; i++) { if (run + d[i] >= half) { const t = (half - run) / (d[i] || 1); return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t]; } run += d[i]; }
  return line[line.length - 1];
}

/** The drive of a trip plan on the map: district centre → the way to the next district (the road, or the border street) → district centre …, each read in the direction it is driven. */
function routeLine(plan: TripPlan): [number, number][] {
  const out: [number, number][] = [HUB_ANCHORS[plan.from].lngLat];
  for (const l of plan.legs) {
    const link = mapLinks().find(k => k.id === l.edge.id);
    if (link) out.push(...linkLineFrom(link, l.from));
    out.push(HUB_ANCHORS[l.to].lngLat);
  }
  return out;
}

/** A plain style with no data: the bundled layers are added on top of it (a style with no sources needs neither tile servers nor fonts). */
function offlineStyle(night: boolean): ML.StyleSpecification {
  return { version: 8, sources: {}, layers: [{ id: 'sea', type: 'background', paint: { 'background-color': night ? '#1d3347' : '#b9d6ee' } }] };
}
