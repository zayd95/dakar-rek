import { GameState } from '../core/state';
import { newSave } from '../core/save';
import type { SaveData } from '../core/types';
import { addOwned, holding, moveIn, placedIn, settleFurniture } from '../economy/assets';
import { furnitureSpec, homeSpec, specOf } from '../economy/catalog';
import { layoutOf, whyNot } from '../economy/placement';
import { BAYS, FRONT_DOOR, LEVELS, VILLA_ID, onLot, type VillaLevel } from '../housing/villa';
import { park } from '../transport/owned';

/**
 * LD2.0-D lane V-E: the owner's private showcase (docs/ld2/LD2_D.md, decision 10) — its own save, never the player's.
 *
 *  - `ShowcaseStorage`: the browser's storage seen through a prefix. Every key the game reads or writes through it (the save under its schema's key, its
 *    backups, the import markers, the device preferences main.ts keeps beside it) lives under `dakarrek.vitrine/…`: the player's real save
 *    (`dakarrek.guest.save.v6`, src/core/save.ts) is never read, written or removed by the showcase (tests/showcase.test.ts).
 *  - `showcaseSave()`: the game the showcase opens on the first time: the villa of the Almadies owned and made the principal residence, a few prestige
 *    pieces set up in its rooms, the Lamane Sport (`tout_terrain`) parked in the villa's first bay, a comfortable wallet, the player at the front door.
 * Only src/showcase/start.ts uses this, and only in a build made with VITE_OWNER_SHOWCASE=1.
 */
export const SHOWCASE_PREFIX = 'dakarrek.vitrine/';
export const SHOWCASE_WALLET = 60_000_000;
/**
 * THE showcase's furnishing, in one plain list (the integration swaps the catalogue ids for the « Collection Almadies » line): each piece by its catalogue id
 * (src/economy/catalog.ts, today's ids), the villa's level it stands on (src/housing/villa.ts LEVELS) and its place on that level in the house's plan
 * coordinates (x, z: metres from the lot's centre, +z toward the street; rot: quarter turns, 0 faces +z). It is stored unfolded (x + the level's dx,
 * src/housing/villa.ts), as every placement of the villa is. A place the villa's plan refuses (the open-plan house before lane V-S's three levels) is
 * left to the game's own settling (src/economy/assets.ts settleFurniture): the piece goes to a room of its kind.
 */
export const SHOWCASE_FURNITURE: readonly { id: string; level: VillaLevel; x: number; z: number; rot: number }[] = [
  { id: 'canape_angle_velours', level: 'rdc', x: -5.2, z: -3.6, rot: 0 },
  { id: 'tapis_soie', level: 'rdc', x: -5.2, z: -1.8, rot: 0 },
  { id: 'table_basse_sculptee', level: 'rdc', x: -5.2, z: -1.8, rot: 0 },
  { id: 'mur_tv', level: 'rdc', x: -5.2, z: 0.9, rot: 2 },
  { id: 'lustre', level: 'rdc', x: -5.2, z: -1.8, rot: 0 },
  { id: 'salle_manger_marbre', level: 'rdc', x: 1.2, z: -2.6, rot: 0 },
  { id: 'toile_artiste', level: 'rdc', x: 1.2, z: -4.8, rot: 0 },
  { id: 'bain_soleil_teck', level: 'rdc', x: 7.2, z: -8.2, rot: 3 },
  { id: 'parasol_deporte', level: 'rdc', x: 8.8, z: -9.6, rot: 0 },
  { id: 'lit_baldaquin', level: 'etage', x: -4.5, z: -2.8, rot: 0 },
];

export class ShowcaseStorage implements Storage {
  constructor(private readonly real: Storage, private readonly prefix = SHOWCASE_PREFIX) {}
  private keys() { const out: string[] = []; for (let i = 0; i < this.real.length; i++) { const k = this.real.key(i); if (k?.startsWith(this.prefix)) out.push(k.slice(this.prefix.length)); } return out; }
  get length() { return this.keys().length; }
  key(i: number) { return this.keys()[i] ?? null; }
  getItem(k: string) { return this.real.getItem(this.prefix + k); }
  setItem(k: string, v: string) { this.real.setItem(this.prefix + k, v); }
  removeItem(k: string) { this.real.removeItem(this.prefix + k); }
  clear() { for (const k of this.keys()) this.real.removeItem(this.prefix + k); }
}

/** The showcase's first game. */
export function showcaseSave(now = Date.now()): SaveData {
  const s = new GameState(newSave(now));
  s.data.wallet = SHOWCASE_WALLET;
  const villa = addOwned(s, VILLA_ID, specOf(VILLA_ID)?.price ?? 0);
  moveIn(s, villa.uid, false);
  const layout = layoutOf(homeSpec(VILLA_ID)!);
  for (const p of SHOWCASE_FURNITURE) {
    const f = furnitureSpec(p.id); if (!f) continue;
    const at = { x: p.x + (LEVELS.find(l => l.id === p.level)?.dx ?? 0), z: p.z, rot: p.rot };
    addOwned(s, p.id, f.price ?? 0, { home: villa.uid, at: whyNot(layout, f, at, placedIn(s, villa.uid)) ? null : at });
  }
  settleFurniture(s, villa.uid);
  addOwned(s, 'tout_terrain', specOf('tout_terrain')?.price ?? 0);
  const bay = onLot(BAYS[0].x, BAYS[0].z);
  park(s.data, { asset: 'tout_terrain', hub: 'almadies', x: bay.x, z: bay.z, yaw: BAYS[0].yaw });
  const door = onLot(FRONT_DOOR.x + 0.8, FRONT_DOOR.z + 1.6);
  Object.assign(s.data, { hub: 'almadies', x: door.x, z: door.z, yaw: 0 });
  s.data.flags.push('vitrine');
  return s.data;
}
/** The showcase holds the villa as the principal residence (a check for the start screen). */
export const showcaseReady = (d: SaveData) => { const s = new GameState(d); return !!holding(s, VILLA_ID) && d.assets.home === holding(s, VILLA_ID)!.uid; };
