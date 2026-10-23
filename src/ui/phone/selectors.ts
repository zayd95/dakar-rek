import type { GameState } from '../../core/state';
import type { HubId, SaveData } from '../../core/types';
import { HUB_NAMES } from '../../world/content';
import { CAST } from '../../social/cast';
import { BEATS } from '../../social/beats';
import type { Relations } from '../../social/relations';
import { assetsOf, currentHome, furnitureIn } from '../../economy/assets';
import { homeSpec, specOf } from '../../economy/catalog';
import { openLoans, standing } from '../../economy/credit';
import { PERK_TEXT, STREAK, runLabel, runOf } from '../../economy/streak';
import { routeById } from '../../economy/jobs';
import { phoneHooks } from '../phoneHooks';

/**
 * What the phone reads from the game, as small pure selectors (no DOM): the phone's screens show these, never their own copies of the game's numbers.
 * The streak is the economy's own (src/economy/streak.ts: `runOf`, the milestones, the perks), never a second counter.
 */

const short = (h: HubId) => HUB_NAMES[h].split(' · ')[0];

// ------------------------------------------------------------------ the home the player lives in
/**
 * The residence line of the Profile and the home screen: the « domicile principal » (the home the player lives in: `currentHome`, the uid in
 * `data.assets.home`), its name from the catalogue, where it is, and how it is held. The one place that decides what « chez toi » is.
 */
export function residenceLine(state: GameState): { icon: string; label: string; name: string; where: string; how: string; hub: HubId | null; uid: string; furniture: number } {
  const h = currentHome(state), sp = homeSpec(h.spec);
  const how = h.how === 'owned' ? 'propriétaire' : h.how === 'rented' ? 'en location' : 'prêté par la famille';
  const hub = (sp?.hub ?? null) as HubId | null;
  const name = (sp?.name ?? 'Domicile').split(' · ')[0];
  return { icon: '🏠', label: 'Domicile principal', name, where: sp?.where ?? (hub ? short(hub) : ''), how, hub, uid: h.uid, furniture: furnitureIn(state, h.uid).length };
}

/** The other things held: homes besides the main one, land, billboards, ventures, vehicles (one line each). */
export function holdings(state: GameState): { icon: string; name: string; sub: string; kind: string }[] {
  const main = currentHome(state).uid, ICON: Record<string, string> = { home: '🏠', land: '🌱', billboard: '🪧', business: '🏪', vehicle: '🚗', aircraft: '✈️' };
  return assetsOf(state).filter(a => a.uid !== main && specOf(a.spec)?.kind !== 'furniture').map(a => {
    const sp = specOf(a.spec)!;
    const sub = [sp.where ?? '', a.how === 'rented' ? 'loué' : a.leased ? 'mis en location' : a.how === 'given' ? 'prêté' : 'à toi'].filter(Boolean).join(' · ');
    return { icon: ICON[sp.kind] ?? '🔑', name: sp.name.split(' · ')[0], sub, kind: sp.kind };
  });
}

// ------------------------------------------------------------------ the streak (days worked in a row)
export interface StreakView {
  run: number; best: number; total: number;
  /** Today (the player's day) already counts. */
  today: boolean;
  /** The next milestone (2, 3, 5, 7) and what it opens; null past the last one. */
  next: number | null; nextText: string;
  /** What the run opens now, a line each. */
  open: string[];
  /** « Série 0 j », « 🔥 3 j ». */
  chip: string;
  /** « 3 jours d’affilée ». */
  label: string;
}
export function streakView(d: Pick<SaveData, 'streak' | 'play'>): StreakView {
  const run = runOf(d), next = STREAK.milestones.find(m => m > run) ?? null;
  return {
    run, best: d.streak.best, total: d.streak.total, today: run > 0 && d.streak.last === d.play.day,
    next, nextText: next ? PERK_TEXT[next] : '', open: STREAK.milestones.filter(m => run >= m).map(m => PERK_TEXT[m]),
    chip: streakChip(run), label: runLabel(run),
  };
}
/** The HUD and phone chip: « Série 0 j » when there is no run, else « 🔥 N j ». */
export const streakChip = (run: number) => (run > 0 ? `🔥 ${run} j` : 'Série 0 j');

// ------------------------------------------------------------------ the Profile
/** The people the player has met (the Carnet's rule: a relation that moved, or a story lived with them). */
export function metCount(rel: Relations): number {
  return CAST.filter(c => rel.level(c.id) !== 0 || BEATS.some(b => b.npc === c.id && rel.beatDone(b.id))).length;
}
export const vehicleCount = (state: GameState) => assetsOf(state, 'vehicle').length;

/** The 2–4 short highlights under the Profile's head. */
export function highlights(state: GameState, rel: Relations): { value: number; label: string; go?: string; app?: string }[] {
  const c = state.data.counters, v = vehicleCount(state);
  return [
    { value: c.actions ?? 0, label: 'Activités' },
    { value: metCount(rel), label: 'Relations', go: 'carnet' },                     // who the player knows: the Carnet
    { value: v, label: v > 1 ? 'Véhicules' : 'Véhicule', app: 'biens' },
  ];
}

export const playtime = (ms: number) => { const h = Math.floor(ms / 3_600_000), m = Math.floor(ms / 60_000) % 60; return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`; };

/** The statistics tab: what the player did, the zero ones apart (shown as one quiet line, never a wall of zeros). */
export function statRows(state: GameState): { shown: { icon: string; label: string; value: string }[]; zero: string[] } {
  const d = state.data, c = d.counters;
  const rows: [string, string, number][] = [
    ['🍽️', 'Repas', c.meals ?? 0], ['🧰', 'Petits boulots', c.shifts ?? 0], ['📦', 'Livraisons Tiak Tiak', c.livraisons ?? 0], ['🚖', 'Courses VTC', d.vtc?.trips ?? 0],
    ['🚌', 'Trajets en car rapide', c.trips ?? 0], ['🤼', 'Combats', c.combats ?? 0], ['🏆', 'Victoires', c.victoires ?? 0], ['🚗', 'Véhicules achetés', c.vehicules ?? 0],
    ['🛋️', 'Meubles achetés', c.meubles ?? 0], ['🔑', 'Biens achetés', c.biens ?? 0], ['🏃', 'Séances de sport', c.forme ?? 0], ['🫖', 'Attaya partagés', c.ataya ?? 0],
  ];
  const shown = [{ icon: '⏱️', label: 'Temps de jeu', value: playtime(d.playedMs) }];
  const zero: string[] = [];
  for (const [icon, label, n] of rows) if (n > 0) shown.push({ icon, label, value: n.toLocaleString('fr-FR') }); else zero.push(label);
  return { shown, zero };
}

/** The history tab: what the player has lived, the big steps first reached (derived from the save: nothing is invented, nothing dated that was not). */
export function historyRows(state: GameState, rel: Relations): { icon: string; title: string; sub: string }[] {
  const d = state.data, c = d.counters, out: { icon: string; title: string; sub: string }[] = [];
  const step = (n: number, marks: [number, string][], icon: string, sub: string) => { for (const [at, title] of marks) if (n >= at) out.push({ icon, title, sub }); };
  for (const m of [...d.streak.seen].sort((a, b) => b - a)) out.push({ icon: '🔥', title: `Série de ${m} jours`, sub: PERK_TEXT[m] ?? '' });
  const home = residenceLine(state);
  if (currentHome(state).how !== 'given') out.push({ icon: '🏠', title: `Nouveau domicile : ${home.name}`, sub: home.where });
  step(vehicleCount(state), [[1, 'Premier véhicule']], '🚗', assetsOf(state, 'vehicle').map(a => specOf(a.spec)?.name ?? '').filter(Boolean).join(' · '));
  step(d.vtc?.trips ?? 0, [[25, '25 courses VTC'], [10, '10 courses VTC'], [1, 'Première course VTC']], '🚖', 'Avec ta propre voiture');
  step(c.livraisons ?? 0, [[25, '25 livraisons'], [10, '10 livraisons'], [1, 'Première livraison Tiak Tiak']], '📦', 'Tiak Tiak');
  step(c.victoires ?? 0, [[1, 'Première victoire à la lutte']], '🏆', `${c.victoires ?? 0} victoire${(c.victoires ?? 0) > 1 ? 's' : ''} · ${c.combats ?? 0} combat${(c.combats ?? 0) > 1 ? 's' : ''}`);
  step(c.biens ?? 0, [[1, 'Premier bien acheté']], '🔑', 'Logement, terrain, panneau ou affaire');
  for (const b of BEATS) if (rel.beatDone(b.id)) out.push({ icon: '📖', title: b.title, sub: CAST.find(x => x.id === b.npc)?.name ?? '' });
  return out;
}

/** One line under the name: the career's headline when it has one, the mood. */
export function lifeLine(state: GameState): string {
  const head = phoneHooks.profileHeadline?.() || 'Une vie à Dakar';
  return `${head} · humeur ${state.mood()}`;
}

// ------------------------------------------------------------------ work in hand, debts, the one contextual shortcut
export interface Mission { kind: 'tiak' | 'vtc'; icon: string; title: string; sub: string; pay: number }
/** The job in hand: a Tiak Tiak parcel (or a tour), a VTC passenger. */
export function missionNow(state: GameState): Mission | null {
  const d = state.data, v = d.vtc?.active, j = d.jobs?.active;
  if (v) return { kind: 'vtc', icon: '🚖', title: v.stage === 'pickup' ? `Passager à prendre : ${v.passenger.name}` : `${v.passenger.name} à bord`, sub: v.stage === 'pickup' ? `${v.pickup.name} · ${short(v.from)}` : `Vers ${v.dropoff.name} · ${short(v.to)}`, pay: v.fare };
  if (j) {
    const r = j.tour ? undefined : routeById(j.routeId);
    if (j.tour) return { kind: 'tiak', icon: '📦', title: `Tournée Tiak Tiak · étape ${j.tour.leg + 1}/2`, sub: j.tour.departed ? 'En route' : 'Pars de la boutique', pay: j.pay };
    return { kind: 'tiak', icon: '📦', title: j.stage === 'pickup' ? 'Colis à récupérer' : 'Colis à livrer', sub: r ? (j.stage === 'pickup' ? r.from.name : r.to.name) : '', pay: j.pay };
  }
  return null;
}

/** The debts as they stand on the player's day: what is left in all, the next installment (amount, in how many days), and what is late. */
export function debtsNow(state: GameState): { count: number; left: number; next: number; inDays: number; late: number } | null {
  const loans = openLoans(state.data.loans?.list ?? []); if (!loans.length) return null;
  const day = state.data.play?.day ?? 0;
  let left = 0, late = 0, next = 0, inDays = Infinity;
  for (const l of loans) {
    const s = standing(l, day); left += s.left; late += s.late;
    const n = s.behind > 0 ? 0 : s.nextDay - day;
    if (s.next > 0 && n < inDays) { inDays = n; next = s.next + s.behind; }
  }
  return { count: loans.length, left, next, inDays: Number.isFinite(inDays) ? inDays : 0, late };
}

/** Which privilege the player has already looked at (the day and the run): the shortcut to it shows until then, not all day. */
export const perkKey = (d: Pick<SaveData, 'play' | 'streak'>) => `${d.play.day}:${runOf(d)}`;
export interface Shortcut { id: 'resume-vtc' | 'follow-job' | 'repay' | 'perk' | 'home'; icon: string; label: string; sub: string }
/**
 * The home screen's one contextual shortcut, only when relevant: a job in hand first (resume the VTC ride, follow the parcel), then a debt falling due,
 * then a streak privilege earned today, then going home late at night or worn out. Null most of the time.
 */
export function contextualShortcut(state: GameState, o: { hub: HubId | null; hour: number; homeHub: HubId | null; inside: boolean; perkSeen?: string }): Shortcut | null {
  const m = missionNow(state);
  if (m?.kind === 'vtc') return { id: 'resume-vtc', icon: '🚖', label: 'Reprendre la course VTC', sub: m.title };
  if (m) return { id: 'follow-job', icon: '📦', label: 'Suivre la livraison', sub: m.sub ? `${m.title} · ${m.sub}` : m.title };
  const debt = debtsNow(state);
  if (debt && (debt.late > 0 || (debt.next > 0 && debt.inDays <= 0))) return { id: 'repay', icon: '💳', label: 'Rembourser ce qui est dû', sub: debt.late > 0 ? 'Un remboursement est en retard' : 'Un remboursement tombe aujourd’hui' };
  const s = streakView(state.data);
  if (s.today && STREAK.milestones.includes(s.run) && o.perkSeen !== perkKey(state.data)) return { id: 'perk', icon: '🔥', label: `Série de ${s.run} jours : ton privilège`, sub: PERK_TEXT[s.run] ?? '' };
  const late = o.hour >= 22 || o.hour < 5, tired = (state.data.needs.energie ?? 100) < 25;
  if ((late || tired) && o.homeHub && o.homeHub !== o.hub) return { id: 'home', icon: '🏠', label: 'Rentrer chez moi', sub: `${short(o.homeHub)} · à pied, gratuit` };
  return null;
}
