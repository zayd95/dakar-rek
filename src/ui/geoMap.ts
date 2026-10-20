import type * as ML from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { HUB_NAMES } from '../world/content';
import { HUB_ANCHORS, gameToLngLat, hubToLngLat, roadToLngLat } from '../geo/anchors';
import { HUB_IDS, type HubId } from '../core/types';
import { ROADS } from '../road/routes';
import { mapBridge } from './minimap';
export { geoMapHtml } from './geoMapHtml';
import { KIND_COLOR, KIND_LABEL, nightness, type MapPlace } from './minimapMath';

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
const OWNED_ICON: Record<string, string> = { jakarta: '🏍️', tiak: '🛵', compacte: '🚗', berline: '🚘', tout_terrain: '🚙' };

/** Mounts the city map in `host` (the markup above); returns what to call when the tab or the phone closes. */
export function mountGeoMap(host: HTMLElement): () => void {
  const root = host.querySelector<HTMLElement>('#gm'), box = host.querySelector<HTMLElement>('.gm-map'), card = host.querySelector<HTMLElement>('.gm-card'), status = host.querySelector<HTMLElement>('.gm-status');
  if (!root || !box || !card || !status) return () => {};
  let dead = false, map: ML.Map | null = null, timer = 0, online = false, errors = 0;
  const markers: ML.Marker[] = [];
  const dyn: { player?: ML.Marker; owned: ML.Marker[]; places: ML.Marker[]; pin?: ML.Marker } = { owned: [], places: [] };
  let styleEl: HTMLStyleElement | null = null;

  const tell = (t: string, keep = false) => { status.textContent = t; status.hidden = !t; if (t && !keep) setTimeout(() => { if (status.textContent === t) status.hidden = true; }, 4000); };

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
    } catch { if (!dead) tell('La carte de la ville n’a pas pu se charger. Le plan du quartier reste disponible.', true); return; }
    if (dead) return;
    if (!document.getElementById('maplibre-css')) { styleEl = document.createElement('style'); styleEl.id = 'maplibre-css'; styleEl.textContent = css; document.head.appendChild(styleEl); }
    try { (ml as unknown as { setWorkerUrl(u: string): void }).setWorkerUrl(workerUrl); } catch { /* the library's own default */ }

    const here = gameToLngLat((mapBridge.hub?.id ?? 'pikine') as HubId, mapBridge.player.x, mapBridge.player.z);
    const night = nightness(mapBridge.hour) > 0.5;
    box.classList.toggle('night', night);
    try {
      map = new ml.Map({
        container: box, style: offlineStyle(night), center: here.lngLat, zoom: 12.4, minZoom: 9, maxZoom: 17.5, maxBounds: [[-17.75, 14.5], [-17.0, 15.0]],
        attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, pixelRatio: Math.min(2, window.devicePixelRatio || 1), fadeDuration: 0, canvasContextAttributes: { antialias: false },
      } as ML.MapOptions);
    } catch { tell('La carte de la ville demande WebGL, indisponible ici. Le plan du quartier reste disponible.', true); map = null; return; }
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
      m.addSource('hubs', { type: 'geojson', data: { type: 'FeatureCollection', features: HUB_IDS.map(id => ({ type: 'Feature', properties: { id }, geometry: { type: 'Polygon', coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([sx, sz]) => hubToLngLat(id, sx * HUB_ANCHORS[id].half, sz * HUB_ANCHORS[id].half))] } })) } });
      m.addLayer({ id: 'hubs-fill', type: 'fill', source: 'hubs', paint: { 'fill-color': '#e8590c', 'fill-opacity': 0.16 } });
      m.addLayer({ id: 'hubs-line', type: 'line', source: 'hubs', paint: { 'line-color': '#e8590c', 'line-width': 1.6, 'line-opacity': 0.85 } });
      m.addSource('corridors', { type: 'geojson', data: { type: 'FeatureCollection', features: ROADS.map(r => ({ type: 'Feature', properties: { id: r.id }, geometry: { type: 'LineString', coordinates: sampleRoad(r) } })) } });
      m.addLayer({ id: 'corridors-casing', type: 'line', source: 'corridors', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': night ? '#1f1f23' : '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4, 15, 12] } });
      m.addLayer({ id: 'corridors', type: 'line', source: 'corridors', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#e8590c', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2.2, 15, 7] } });
    };
    m.on('style.load', () => { if (dead) return; try { overlays(); } catch { /* a style change mid-way: the next one adds them */ } });

    const labels = () => {
      for (const k of markers.splice(0)) k.remove();
      const add = (el: HTMLElement, ll: [number, number], onTap?: () => void) => {
        if (onTap) el.addEventListener('click', e => { e.stopPropagation(); onTap(); });
        markers.push(new ml.Marker({ element: el, anchor: 'center' }).setLngLat(ll).addTo(m));
      };
      if (!online) for (const l of data.LANDMARKS) add(div(`gm-lab gm-${l.kind}`, esc(l.name)), l.lngLat);
      for (const id of HUB_IDS) add(div('gm-hub', `<i></i>${esc(HUB_NAMES[id].split(' · ')[0])}`), HUB_ANCHORS[id].lngLat, () => showHub(id));
      for (const r of ROADS) { const mid = roadToLngLat(r, r.length / 2).lngLat; add(div('gm-road', '🛣️'), mid, () => showRoad(r)); }
    };

    const showHub = (id: HubId) => {
      const cur = mapBridge.hub?.id === id, roads = ROADS.filter(r => r.touches(id));
      const rows = roads.map(r => `<p>🛣️ Route vers <b>${esc(HUB_NAMES[r.other(id)].split(' · ')[0])}</b> : ${km(r.length)} à parcourir (environ ${Math.round(r.length * 9 / 1000)} km dans la vraie ville)</p>`).join('');
      card.innerHTML = `<div class="fm-row"><b>${esc(HUB_NAMES[id])}</b><em>${cur ? 'Tu es ici' : 'Quartier jouable'}</em></div>${rows || '<p>Pas encore de route pour s’y rendre au volant : prends le taxi ou le bus depuis le plan du quartier.</p>'}`;
    };
    const showRoad = (r: (typeof ROADS)[number]) => {
      const via = r.anchorS.slice(1, -1).map(a => esc(a.name)).join(' → ');
      card.innerHTML = `<div class="fm-row"><b>${esc(HUB_NAMES[r.def.a].split(' · ')[0])} ↔ ${esc(HUB_NAMES[r.def.b].split(' · ')[0])}</b><em>Route</em></div>
        <p>${km(r.length)} à parcourir, environ ${Math.round(r.length * 9 / 1000)} km dans la vraie ville. Passe par ${via}.</p><p>Au volant de ta voiture ou de ta moto : pas d’écran de chargement, tu peux t’arrêter, descendre et repartir.</p>`;
    };
    const showPlace = (p: MapPlace) => {
      const dest = mapBridge.destination() === p.id;
      card.innerHTML = `<div class="fm-row"><span class="fm-dot" style="--c:${KIND_COLOR[p.kind]}"></span><b>${esc(p.name)}</b><em>${KIND_LABEL[p.kind]}</em></div>${p.what.length ? `<p>${esc(p.what.join(' · '))}</p>` : ''}
        <button type="button" class="ph-btn fm-mark" data-gm-mark="${esc(p.id)}">${dest ? 'Retirer le repère' : 'Marquer'}</button>`;
    };
    card.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-gm-mark]'); if (!b) return;
      const id = b.dataset.gmMark!; mapBridge.walkTo(mapBridge.destination() === id ? null : id);
      const p = mapBridge.places.find(q => q.id === id); if (p) showPlace(p);
      refresh();
    });
    card.innerHTML = '<p>Touche un quartier, une route ou un lieu.</p>';

    /** Player, own vehicles, the places of the district you are in and the marked place: cheap, refreshed twice a second while the tab is open. */
    const refresh = () => {
      if (!map || dead) return;
      const p = mapBridge.player, hub = (mapBridge.hub?.id ?? 'pikine') as HubId;
      const w = gameToLngLat(hub, p.x, p.z);
      if (!dyn.player) { dyn.player = new ml.Marker({ element: div('gm-me', '<b></b>'), anchor: 'center', rotationAlignment: 'map' }).setLngLat(w.lngLat).addTo(map); }
      dyn.player.setLngLat(w.lngLat).setRotation(((Math.PI - p.yaw) * 180) / Math.PI);
      dyn.player.getElement().classList.toggle('driving', p.driving);
      // own vehicles, wherever they are parked
      const owned = mapBridge.owned();
      while (dyn.owned.length > owned.length) dyn.owned.pop()!.remove();
      owned.forEach((o, i) => {
        const ll = gameToLngLat(o.hub, o.x, o.z).lngLat;
        if (!dyn.owned[i]) dyn.owned[i] = new ml.Marker({ element: div('gm-car', ''), anchor: 'center' }).setLngLat(ll).addTo(map!);
        dyn.owned[i].setLngLat(ll); const el = dyn.owned[i].getElement(); el.textContent = OWNED_ICON[o.asset] ?? '🚗'; el.title = o.name;
      });
      // the places of the district the player is in (rebuilt only when the list changes)
      const list = mapBridge.places, key = hub + ':' + list.length + ':' + mapBridge.version;
      if ((dyn as { key?: string }).key !== key) {
        (dyn as { key?: string }).key = key;
        for (const k of dyn.places.splice(0)) k.remove();
        for (const pl of list) {
          const el = div('gm-pl', ''); el.style.setProperty('--c', KIND_COLOR[pl.kind]); el.title = pl.name;
          el.addEventListener('click', e => { e.stopPropagation(); showPlace(pl); });
          dyn.places.push(new ml.Marker({ element: el, anchor: 'center' }).setLngLat(hubToLngLat(hub, pl.x, pl.z)).addTo(map));
        }
      }
      const dest = mapBridge.destination(), dp = dest ? list.find(q => q.id === dest) : null;
      if (dp) { const pll = hubToLngLat(hub, dp.x, dp.z); if (!dyn.pin) dyn.pin = new ml.Marker({ element: div('gm-pin', '📍'), anchor: 'bottom' }).setLngLat(pll).addTo(map); dyn.pin.setLngLat(pll); }
      else if (dyn.pin) { dyn.pin.remove(); dyn.pin = undefined; }
    };
    const recenter = () => map?.easeTo({ center: gameToLngLat((mapBridge.hub?.id ?? 'pikine') as HubId, mapBridge.player.x, mapBridge.player.z).lngLat, zoom: Math.max(map.getZoom(), 13), duration: 400 });
    const all = () => map?.fitBounds([[-17.55, 14.64], [-17.34, 14.78]], { padding: 24, duration: 400 });
    root.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-gm]'); if (!b) return; if (b.dataset.gm === 'me') recenter(); else all(); });
    const zoomClass = () => root.classList.toggle('gm-close', m.getZoom() >= 13.2);

    m.once('load', () => {
      if (dead) return;
      labels(); refresh(); zoomClass(); tell('');
      (window as unknown as { __geoMap: { ready: boolean } }).__geoMap.ready = true;
      m.on('zoom', zoomClass);
      timer = window.setInterval(refresh, 500);
      void goOnline(m, ml);
    });
    m.on('error', ev => { errors++; if (online && errors > 12) tell('Fond de carte partiel : connexion lente.'); void ev; });

    /** Tries the vector basemap; keeps the bundled layer if it does not come in time. */
    async function goOnline(mm: ML.Map, lib: typeof ML) {
      if (STYLE_URL === 'off') { tell('Fond de carte hors ligne : repères simplifiés.', true); return; }
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
        online = false; if (!dead) tell('Fond de carte indisponible : repères simplifiés (tracés approximatifs).', true);
      }
    }
  })();

  return () => {
    dead = true; clearInterval(timer);
    try { for (const k of [...markers, ...dyn.owned, ...dyn.places, dyn.player, dyn.pin]) k?.remove(); } catch { /* */ }
    try { map?.remove(); } catch { /* the context is already gone */ }
    map = null; styleEl?.remove();
    delete (window as unknown as { __geoMap?: unknown }).__geoMap;
    box.replaceChildren();
  };
}

const div = (cls: string, html: string) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return d; };

/** The road's centre line on the map, every ~12 game metres. */
function sampleRoad(r: (typeof ROADS)[number]): [number, number][] {
  const out: [number, number][] = [];
  for (let s = 0; s < r.length; s += 12) out.push(roadToLngLat(r, s).lngLat);
  out.push(roadToLngLat(r, r.length).lngLat);
  return out;
}

/** A plain style with no data: the bundled layers are added on top of it (a style with no sources needs neither tile servers nor fonts). */
function offlineStyle(night: boolean): ML.StyleSpecification {
  return { version: 8, sources: {}, layers: [{ id: 'sea', type: 'background', paint: { 'background-color': night ? '#1d3347' : '#b9d6ee' } }] };
}
