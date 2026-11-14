import { fcfaText } from '../economy/format';

/**
 * « Autour de moi » (1.0.1, the phone's screen src/ui/phone/apps/around.ts): what the player can do right here, right now, ONE action a row, the nearest
 * first, in short French. The page is a pure assembly (`aroundPage`, tests/aroundPage.test.ts) of live facts the module gathers (src/game/around.ts
 * `aroundFacts`): nothing is invented, a section with nothing in it is left out, and the online rows (Grand Camp, friends) say « Hors ligne » once when
 * the account is not connected while the rest works.
 *
 *  - Tiak Tiak: the run in hand (« Y aller »), else the district's offers now (route, kind, pay, how far the pick-up is) with « Accepter », the board's own.
 *  - Grand Camp: the district's open matches (organizer, fee, places left) with « Voir », and « Organiser »; the actions only where the phone has the app.
 *  - Amis en ligne: the players the account knows who are online now, and where as far as they share it: « Rejoindre » when it is known, else « Message ».
 *  - Lieux: the living places open now, what is happening there and how far, « Y aller » (the walking marker).
 *  - Activités: what the district's places offer now: « Commencer » where the player stands, else « Y aller ».
 */
export type AroundAct =
  | { kind: 'tiak'; id: string }
  | { kind: 'job' }
  | { kind: 'camp'; match: string }
  | { kind: 'organise' }
  | { kind: 'message'; tag: string; name: string }
  | { kind: 'join'; tag: string }
  | { kind: 'go'; key: string }
  | { kind: 'start'; key: string };

export interface AroundRow {
  key: string; icon: string; label: string;
  detail?: string;
  /** Why the action cannot be done now (the button is greyed, the reason said in red). */
  why?: string;
  act?: { label: string; do: AroundAct; disabled?: boolean };
}
export type AroundSectionId = 'tiak' | 'camp' | 'amis' | 'enligne' | 'lieux' | 'activites';
export interface AroundSection { id: AroundSectionId; title: string; rows: AroundRow[] }

/** What the game knows now (src/game/around.ts gathers it; distances in metres from where the player stands, null when not known). */
export interface AroundInput {
  /** The account: connected now, a build with a server that is not connected now, or none in this build (no online rows at all). */
  net: 'online' | 'offline' | null;
  /** The delivery in hand: its route, its next step (« Colis à prendre : Chez Mame »), how far that is. */
  job: { title: string; next: string; dist: number | null } | null;
  tiak: { id: string; title: string; type: string; pay: number; dist: number | null; why: string | null }[];
  /** The district's open lobbies (null: not known yet); whether the phone can show a match and organize one. */
  camp: { matches: { match: string; org: string; fee: number; left: number }[] | null; view: boolean; organise: boolean } | null;
  /** Online now. `dist`: in sight, in this presence room; `district`: in another district, as their account shares it; `sameDistrict`: here, out of sight. */
  friends: { tag: string; name: string; dist: number | null; district: string | null; sameDistrict: boolean }[];
  places: { key: string; icon: string; name: string; line: string; dist: number | null; here: boolean }[];
  activities: { key: string; icon: string; label: string; place: string; dist: number | null; here: boolean; start: boolean; why: string | null }[];
}

/** How many rows a section shows at most: the nearest. */
export const AROUND_LIMIT = { tiak: 5, camp: 3, amis: 5, lieux: 8, activites: 5 } as const;
/** How often the screen asks the server again while it is shown (ms), never while it is not. */
export const AROUND_REFRESH_MS = 5000;

/** « à 80 m », « à 1,2 km », « à côté » (rounded to 10 m: the list does not change at every step). */
export function away(m: number): string {
  if (m < 15) return 'à côté';
  const r = Math.round(m / 10) * 10;
  if (r < 1000) return `à ${r} m`;
  return `à ${(m / 1000).toFixed(1).replace('.', ',')} km`;
}
/** « 17 h », « 19 h 15 ». */
export const hourText = (h: number) => { const w = ((h % 24) + 24) % 24, hh = Math.floor(w), mm = Math.round((w - hh) * 60); return mm ? `${hh} h ${String(mm).padStart(2, '0')}` : `${hh} h`; };
/** How full a living place is, from its share of people at this hour (src/venues/lifePlans.ts windows). */
export const crowdWord = (share: number) => (share >= 0.9 ? 'plein' : share >= 0.4 ? 'du monde' : share > 0 ? 'quelques personnes' : 'calme');
/** « Gratuit » or the fee. */
const fee = (n: number) => (n > 0 ? fcfaText(n) : 'Gratuit');
const places = (n: number) => `${n} place${n > 1 ? 's' : ''}`;
const join = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' · ');
/** Nearest first; what has no distance after, by name. */
function nearest<T extends { dist: number | null }>(list: readonly T[], name: (x: T) => string): T[] {
  return [...list].sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity) || name(a).localeCompare(name(b), 'fr'));
}

/** The page (pure): the sections in their order, each nearest first and capped, the empty ones left out. */
export function aroundPage(i: AroundInput): AroundSection[] {
  const out: AroundSection[] = [];
  // ---------------------------------------------------------------- Tiak Tiak: the run in hand, else the district's offers now
  const tiak: AroundRow[] = [];
  if (i.job) tiak.push({ key: 'job', icon: '📦', label: `En cours · ${i.job.title}`, detail: join(i.job.next, i.job.dist !== null && away(i.job.dist)), act: { label: 'Y aller', do: { kind: 'job' } } });
  else for (const o of nearest(i.tiak, o => o.title).slice(0, AROUND_LIMIT.tiak)) {
    tiak.push({ key: `tiak:${o.id}`, icon: '🛵', label: o.title, detail: join(o.type, fcfaText(o.pay), o.dist !== null && `départ ${away(o.dist)}`),
      ...(o.why ? { why: o.why } : {}), act: { label: 'Accepter', do: { kind: 'tiak', id: o.id }, ...(o.why ? { disabled: true } : {}) } });
  }
  if (tiak.length) out.push({ id: 'tiak', title: 'Tiak Tiak', rows: tiak });
  // ---------------------------------------------------------------- online: « Hors ligne » once, or Grand Camp and the friends
  if (i.net === 'offline') out.push({ id: 'enligne', title: 'En ligne', rows: [{ key: 'offline', icon: '📵', label: 'Hors ligne', detail: 'Grand Camp et amis reviennent avec la connexion' }] });
  else if (i.net === 'online') {
    const camp: AroundRow[] = [];
    if (i.camp) {
      for (const m of (i.camp.matches ?? []).slice(0, AROUND_LIMIT.camp)) {
        camp.push({ key: `camp:${m.match}`, icon: '⚽', label: `Match de ${m.org}`, detail: join(fee(m.fee), places(m.left)), ...(i.camp.view ? { act: { label: 'Voir', do: { kind: 'camp', match: m.match } } } : {}) });
      }
      if (i.camp.organise) camp.push({ key: 'camp:new', icon: '📣', label: 'Organiser un match', detail: camp.length ? 'Ton droit d’entrée, tes équipes' : 'Aucun match ouvert dans le quartier', act: { label: 'Organiser', do: { kind: 'organise' } } });
    }
    if (camp.length) out.push({ id: 'camp', title: 'Grand Camp', rows: camp });
    const amis: AroundRow[] = nearest(i.friends, f => f.name).slice(0, AROUND_LIMIT.amis).map(f => {
      const where = f.dist !== null ? away(f.dist) : f.district ? `à ${f.district}` : f.sameDistrict ? 'dans le quartier' : 'en ligne';
      const known = f.dist !== null || !!f.district || f.sameDistrict;
      return { key: `ami:${f.tag}`, icon: '🟢', label: f.name, detail: where, act: known ? { label: 'Rejoindre', do: { kind: 'join', tag: f.tag } } : { label: 'Message', do: { kind: 'message', tag: f.tag, name: f.name } } };
    });
    if (amis.length) out.push({ id: 'amis', title: 'Amis en ligne', rows: amis });
  }
  // ---------------------------------------------------------------- places open now, and what is going on there
  const lieux: AroundRow[] = nearest(i.places, p => p.name).slice(0, AROUND_LIMIT.lieux).map(p => ({
    key: `lieu:${p.key}`, icon: p.icon, label: p.name, detail: join(p.line, p.here ? 'tu y es' : p.dist !== null && away(p.dist)),
    ...(p.here ? {} : { act: { label: 'Y aller', do: { kind: 'go', key: p.key } as AroundAct } }),
  }));
  if (lieux.length) out.push({ id: 'lieux', title: 'Lieux', rows: lieux });
  // ---------------------------------------------------------------- what the district's places offer now
  // (there already, with nothing the phone can start: the action button in the street is the way, not a row)
  const acts: AroundRow[] = nearest(i.activities.filter(a => !a.here || a.start), a => a.label).slice(0, AROUND_LIMIT.activites).map(a => {
    const why = a.here ? a.why : null;                                  // away from it, the reason it waits for is the place's own (go there first)
    return {
      key: `act:${a.key}`, icon: a.icon, label: a.label, detail: join(a.place, a.here ? 'tu y es' : a.dist !== null && away(a.dist)), ...(why ? { why } : {}),
      act: a.here ? { label: 'Commencer', do: { kind: 'start', key: a.key }, ...(why ? { disabled: true } : {}) } : { label: 'Y aller', do: { kind: 'go', key: a.key } },
    };
  });
  if (acts.length) out.push({ id: 'activites', title: 'Activités', rows: acts });
  return out;
}

/** What the page says, row by row, for the checks and the screen's « has it changed? » (one string). */
export const aroundKey = (page: readonly AroundSection[]) => page.map(s => `${s.id}[${s.rows.map(r => `${r.key}|${r.label}|${r.detail ?? ''}|${r.why ?? ''}|${r.act ? `${r.act.label}${r.act.disabled ? '!' : ''}` : ''}`).join(';')}]`).join('');
