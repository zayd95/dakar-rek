# City map: data provenance, licences, tile-source terms

What every piece of map data in the game is, where it comes from, under which licence, and what is **not** real survey data. Read this before changing or shipping the map.

## 1. What is in the client

| Data | File | Origin | Licence | Notes |
|---|---|---|---|---|
| Coast of the Cap-Vert peninsula | `src/geo/data/land.json` (0.8 KB) | [Natural Earth](https://www.naturalearthdata.com/) 1:10m *land* (v5.1.1), clipped to Dakar's box, simplified (25 m) | Public domain | Very generalised (a few dozen points). Only the offline fallback; the real coast comes with the basemap when it loads. |
| Reference roads and quarters | `src/geo/dakarData.ts` | **Hand-placed** from public maps by the game's developers | Original work (CC0) | **Not OpenStreetMap, not extracted.** Accurate to about 1 km. Shows the shape of the city when no basemap is available; it is not for navigation. |
| District anchors, road anchors, the scale | `src/geo/anchors.ts`, `src/road/routes.ts` | Hand-placed (see §3) | Original work | Approximate by design. |
| OSM road layer (optional) | `src/geo/data/osm-roads.json` + `.provenance.json` | `scripts/geo/extract-osm.ts` from the Geofabrik Senegal & Gambia extract | **ODbL 1.0**, © OpenStreetMap contributors | **Not present in this branch**: the build sandbox cannot reach OpenStreetMap hosts, so the extraction was written, unit-tested on a fixture, and not run. See §2. |

Nothing else is bundled. In particular the whole of Senegal and the Gambia (about 600 MB of PBF) never ships: the pipeline keeps only the main roads of Dakar's box, a few tens of KB.

## 2. Extraction pipeline (OpenStreetMap, ODbL)

Source: Geofabrik's regional extract, <https://download.geofabrik.de/africa/senegal-and-gambia.html> (`senegal-and-gambia-latest.osm.pbf`, refreshed daily, OpenStreetMap data under the ODbL).

```sh
curl -LO https://download.geofabrik.de/africa/senegal-and-gambia-latest.osm.pbf
osmium extract --bbox=-17.60,14.58,-17.20,14.84 senegal-and-gambia-latest.osm.pbf -o dakar.osm.pbf
osmium tags-filter dakar.osm.pbf w/highway=motorway,motorway_link,trunk,trunk_link,primary,primary_link -o dakar-roads.osm.pbf
osmium export dakar-roads.osm.pbf -f geojson -o dakar-roads.geojson
npx vite-node scripts/geo/extract-osm.ts dakar-roads.geojson --source-date <Geofabrik file date>
```

The script writes `src/geo/data/osm-roads.json` (the `RoadLayer` format of `src/geo/dakarData.ts`: ways clipped to the box, simplified to 12 m, coordinates rounded to ~1 m, each keeping its OSM way id) and `osm-roads.provenance.json` (input name, size and SHA-256, source date, box, tolerance, counts, extraction time, licence). Commit both. To use it, point `REFERENCE_ROADS` in `geoMap.ts` at the extracted layer; nothing else changes.

Obligations of the ODbL that the game meets: the credit « © contributeurs d'OpenStreetMap » is always visible on the map when OSM-derived data is shown (the attribution control, never hidden); the derived road layer is shared under the same licence (it is committed in the repository, which is public to the people who play the build); the licence text is linked from the credit (<https://www.openstreetmap.org/copyright>).

## 3. Anchors and the condensed scale

* Each playable district has **one** anchor: the real place its centre stands for. A district is 260 m across and stands for about 1.3 km of town (5 real metres per game metre). Its buildings are procedural and have **no** exact real-world position: the map shows the footprint of the district's streets as a rectangle, not a cadastre.
* Each road between districts (`src/road/routes.ts`) follows a real alignment, condensed about 9 : 1 (Pikine → Almadies: 13 km real, 1.5 km in game). Anchors pair a node of the game road with the real place it stands for (Patte d'Oie, Foire / VDN, the Yoff–Ngor junction…). A position on the road maps to the real map by arc length between anchors.
* Both are **hand-placed and approximate**. They put things in the right part of the right town and in the right order; they are not survey data and must not be presented as such. The map says so ("Quartiers et routes condensés… Les positions sont approximatives").

## 4. Tile source (online basemap)

* **Default: OpenFreeMap** (<https://openfreemap.org>), vector tiles from OpenStreetMap through OpenMapTiles' schema, served keyless and free, for any use including commercial. Required credit (shown in the map's attribution control): *OpenFreeMap © OpenMapTiles, data from OpenStreetMap*. Style URL: `https://tiles.openfreemap.org/styles/liberty`, overridable at build time (`VITE_MAP_STYLE`) or at run time (`window.__DAKAR_MAP_STYLE`, `off` to never go online).
* **Not used:** `tile.openstreetmap.org`. OpenStreetMap's own tile servers are a volunteer-run service whose usage policy forbids heavy, app-embedded, or commercial use without arrangement; a game must not point at them.
* **Privacy:** when the basemap is used, the player's device requests tiles from OpenFreeMap (so its IP address and the area viewed reach that service). The request is made only when the « Ville » tab is open, with no credentials. Nothing about the player is sent.
* **Production recommendation:** for a shipped game with real traffic, self-host a Protomaps PMTiles extract of Dakar (a few MB, one static file on the game's own host or CDN) and point `VITE_MAP_STYLE` at a style using it: no third-party dependency, no per-request exposure. Terms of OpenFreeMap's hosted service can change; check them before launch.
* **Failure:** if the style does not load within 6 s, or tiles fail, the map keeps the bundled layer and says "Fond de carte indisponible : repères simplifiés".

## 5. MapLibre GL JS

`maplibre-gl` 6.15.0, BSD-3-Clause. Loaded as a lazy chunk (about 300 KB gzip plus a 520 KB worker) only when the « Ville » tab opens; `map.remove()` releases its WebGL context, workers and tiles when the tab or the phone closes. It is the map interface only: the driving world is the Three.js engine.

## 6. What this branch could not do (build sandbox)

The sandbox's network allows only the npm registry, GitHub raw, and Natural Earth's bucket. OpenStreetMap hosts (Geofabrik, Overpass, tile servers, Nominatim), OpenFreeMap and the usual CDNs are blocked. Consequences, stated plainly:

* the OSM extraction **has not been run on real data** (it is tested on a fixture, and its commands are above);
* the road shapes and anchors are therefore hand-placed, not extracted;
* the online basemap **has not been seen rendering** here (the path is tested with a served fixture style; the real OpenFreeMap style is untested);
* no real-iPhone measurement was possible.
