// Extracts Dakar's main roads from an OpenStreetMap GeoJSON (see src/geo/osmExtract.ts) into src/geo/data/osm-roads.json, with a provenance record next to it.
// Usage: npx vite-node scripts/geo/extract-osm.ts <dakar-roads.geojson> [--source-date 2026-10-19] [--tolerance 12] [--out src/geo/data/osm-roads.json]
// Produce the input with osmium from the Geofabrik extract of Senegal and the Gambia (docs/map/PROVENANCE.md has the exact commands). Nothing here touches the network.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DAKAR_BBOX, extractRoads, type OsmCollection } from '../../src/geo/osmExtract';

const args = process.argv.slice(2);
const flag = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const input = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') === false || args.indexOf(a) === 0);
if (!input || input.startsWith('--')) { console.error('usage: extract-osm.ts <input.geojson> [--source-date YYYY-MM-DD] [--tolerance m] [--out file]'); process.exit(2); }
const out = flag('out', 'src/geo/data/osm-roads.json')!, tol = Number(flag('tolerance', '12'));
const raw = fs.readFileSync(input);
const fc = JSON.parse(raw.toString('utf8')) as OsmCollection;
const sha = crypto.createHash('sha256').update(raw).digest('hex');
const sourceDate = flag('source-date', 'unknown')!;
const { layer, stats } = extractRoads(fc, { toleranceM: tol, source: `OpenStreetMap via Geofabrik Senegal & Gambia extract, ${sourceDate}` });
fs.writeFileSync(out, JSON.stringify(layer));
const prov = { file: out, bytes: fs.statSync(out).size, input: { name: input, bytes: raw.length, sha256: sha, sourceDate }, bbox: DAKAR_BBOX, toleranceM: tol, extractedAt: new Date().toISOString(), licence: layer.licence, stats };
fs.writeFileSync(out.replace(/\.json$/, '.provenance.json'), JSON.stringify(prov, null, 2) + '\n');
console.log(JSON.stringify(prov, null, 2));
