import type { LngLat } from '../road/routes';

/**
 * The reference layer of the city map when no tiles can be loaded (and, over the tiles, the layer that says what is playable).
 *
 * PROVENANCE, read docs/map/PROVENANCE.md. This is NOT OpenStreetMap data. The coast is Natural Earth (public domain) in ./data/land.json; the roads and landmarks below were placed by hand from
 * public maps and are accurate to about a kilometre: enough to show the shape of the city and where the playable districts and their roads lie, not to navigate by.
 * `scripts/geo/extract-osm.mjs` produces the same kind of layers from a real OpenStreetMap extract (Geofabrik Senegal), in the format of `RoadLayer` below, to replace this file's roads
 * when that extract has been run; nothing else needs to change.
 */
export interface RoadLine { id: string; name: string; rank: 'motorway' | 'trunk' | 'primary'; pts: LngLat[] }
export interface Landmark { id: string; name: string; lngLat: LngLat; kind: 'district' | 'poi' | 'airport' | 'island' }
export interface RoadLayer { source: string; licence: string; roads: RoadLine[] }

export const REFERENCE_ROADS: RoadLayer = {
  source: 'Hand-placed reference (approximate, not extracted data)',
  licence: 'Original work, CC0',
  roads: [
    { id: 'autoroute', name: 'Autoroute Dakar–Diamniadio', rank: 'motorway', pts: [[-17.4440, 14.6840], [-17.4300, 14.6990], [-17.4200, 14.7150], [-17.3950, 14.7400], [-17.3600, 14.7480], [-17.3000, 14.7250]] },
    { id: 'vdn', name: 'VDN (Voie de Dégagement Nord)', rank: 'trunk', pts: [[-17.4640, 14.6980], [-17.4690, 14.7100], [-17.4700, 14.7250], [-17.4710, 14.7400], [-17.4880, 14.7480]] },
    { id: 'corniche', name: 'Corniche Ouest', rank: 'trunk', pts: [[-17.4400, 14.6690], [-17.4690, 14.6790], [-17.4750, 14.6860], [-17.4850, 14.7000], [-17.4950, 14.7190]] },
    { id: 'almadies', name: 'Route des Almadies', rank: 'primary', pts: [[-17.4880, 14.7480], [-17.5090, 14.7470], [-17.5260, 14.7440]] },
    { id: 'rufisque', name: 'Route de Rufisque (RN1)', rank: 'primary', pts: [[-17.4290, 14.7020], [-17.3500, 14.7550], [-17.2700, 14.7150]] },
    { id: 'patte-doie', name: 'Patte d’Oie – Parcelles', rank: 'primary', pts: [[-17.4527, 14.7338], [-17.4350, 14.7560], [-17.4150, 14.7740]] },
    { id: 'cheikh-anta-diop', name: 'Avenue Cheikh Anta Diop', rank: 'primary', pts: [[-17.4530, 14.6930], [-17.4560, 14.7030], [-17.4640, 14.6980]] },
    { id: 'pikine-link', name: 'Route de Pikine', rank: 'primary', pts: [[-17.3930, 14.7540], [-17.4030, 14.7420], [-17.4200, 14.7150]] },
  ],
};

/** Quarters and places the city is known by, to read the map at a glance (approximate positions). `district`: a quarter's name, written at its centre. */
export const LANDMARKS: Landmark[] = [
  { id: 'plateau', name: 'Plateau', lngLat: [-17.4340, 14.6700], kind: 'district' },
  { id: 'medina', name: 'Médina', lngLat: [-17.4520, 14.6850], kind: 'district' },
  { id: 'fann', name: 'Fann · Point E', lngLat: [-17.4600, 14.6900], kind: 'district' },
  { id: 'mermoz', name: 'Mermoz · Sacré-Cœur', lngLat: [-17.4690, 14.7110], kind: 'district' },
  { id: 'ouakam', name: 'Ouakam', lngLat: [-17.4900, 14.7220], kind: 'district' },
  { id: 'yoff', name: 'Yoff', lngLat: [-17.4930, 14.7550], kind: 'district' },
  { id: 'ngor', name: 'Ngor', lngLat: [-17.5120, 14.7500], kind: 'district' },
  { id: 'almadies', name: 'Almadies', lngLat: [-17.5130, 14.7450], kind: 'district' },
  { id: 'hlm', name: 'HLM · Grand Dakar', lngLat: [-17.4400, 14.7050], kind: 'district' },
  { id: 'parcelles', name: 'Parcelles Assainies', lngLat: [-17.4450, 14.7600], kind: 'district' },
  { id: 'guediawaye', name: 'Guédiawaye', lngLat: [-17.4000, 14.7750], kind: 'district' },
  { id: 'pikine', name: 'Pikine', lngLat: [-17.3930, 14.7540], kind: 'district' },
  { id: 'thiaroye', name: 'Thiaroye', lngLat: [-17.3550, 14.7500], kind: 'district' },
  { id: 'independance', name: 'Place de l’Indépendance', lngLat: [-17.4366, 14.6694], kind: 'poi' },
  { id: 'renaissance', name: 'Monument de la Renaissance', lngLat: [-17.4960, 14.7200], kind: 'poi' },
  { id: 'aeroport', name: 'Aéroport L. S. Senghor', lngLat: [-17.4900, 14.7400], kind: 'airport' },
  { id: 'goree', name: 'Île de Gorée', lngLat: [-17.3980, 14.6670], kind: 'island' },
];
