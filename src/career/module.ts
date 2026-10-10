import './career.css';
import type { GameCtx, GameModule, LambEvent } from '../game/modules';
import type { Action, HubWorld } from '../world/types';
import { phoneHooks } from '../ui/phoneHooks';
import { fcfa } from '../ui/hud';
import { assetsOf, netWorth } from '../economy/assets';
import { loadProfile } from '../multiplayer/client';
import { FightNews } from './world';
import {
  ATTRS, BOUTS_MAX, RUNGS, boutPoints, dimensions, fighterAttributes, purseOf, rankOf, recordLine, summary,
  type BoutEntry, type BoutRes, type CareerSave,
} from './career';

/**
 * Career module (docs/CAREER.md): keeps the fight record from every finished bout, pays the purse of ranked bouts,
 * moves the rank on the ladder, adds the écurie drills that feed the fighter attributes, and gives the phone a light
 * profile card (Forme / Richesse / Réputation / Influence) and the arena app its record. Never asks for a career.
 */
const DRILLS: Action[] = [
  { id: 'drill_frappe', label: 'Sac de frappe', detail: 'Frappe et explosivité', seconds: 5, needs: { energie: -8, hygiene: -6 }, counter: 'entr_frappe',
    requires: s => (s.data.needs.energie < 12 ? 'Trop fatigué' : null) },
  { id: 'drill_saisies', label: 'Travail des saisies', detail: 'Technique et équilibre, avec un partenaire', seconds: 5, needs: { energie: -7, hygiene: -5, social: 2 }, counter: 'entr_saisies',
    requires: s => (!s.data.flags.includes('ecurie_baobab') ? 'Parle d’abord à Coach Ablaye' : s.data.needs.energie < 12 ? 'Trop fatigué' : null) },
  { id: 'drill_force', label: 'Gainage et pompes', detail: 'Force et explosivité', seconds: 5, needs: { energie: -9, hygiene: -5 }, counter: 'entr_force',
    requires: s => (s.data.needs.energie < 12 ? 'Trop fatigué' : null) },
];

/**
 * The open door to the arena: a ranked bout at the player's rung, offered at the arena and at the écurie to anyone
 * rested enough — no écurie card, no guided course first (those stay for the arena's regular « Combat classé »).
 * Named « Petit combat de quartier » on the first rung, « Combat du soir · <rang> » after.
 */
const PETIT: Action = { id: 'petit_combat', label: 'Petit combat de quartier', detail: 'Combat classé au premier palier · un cachet si tu combats', seconds: 0, special: 'combat_classe',
  requires: s => (s.data.needs.energie < 20 ? 'Trop fatigué : repose-toi d’abord' : null) };

const RES_WORD: Record<BoutRes, string> = { V: 'Victoire', D: 'Défaite', N: 'Nul', A: 'Abandon' };
let news: FightNews | null = null, labelT = 0;
const playerName = (ctx: GameCtx) => { let st: Storage | null = null; try { st = localStorage; } catch { /* blocked */ } return loadProfile(st, ctx.state.data.guestId).name; };
const HOW: Record<string, string> = { projection: 'projection', decision: 'décision', egalite: 'égalité', abandon: 'abandon' };

function career(ctx: GameCtx): CareerSave {
  const d = ctx.state.data as { career?: CareerSave };
  if (!d.career) d.career = { bouts: [], best: 0 };
  return d.career;
}
const relationsOf = (ctx: GameCtx) => Object.entries(ctx.state.data.rel).filter(([k]) => k.split('|').includes('player')).map(([, v]) => v);
const ventures = (ctx: GameCtx) => assetsOf(ctx.state, 'business').filter(a => a.how === 'owned').length + assetsOf(ctx.state, 'billboard').filter(a => a.how === 'owned').length;
const rank = (ctx: GameCtx) => rankOf(career(ctx).bouts, ctx.day(), ctx.state.data.counters.titres ?? 0);

/** Record one finished bout: points, purse (ranked), best rung; returns the toast lines. */
export function recordBout(ctx: GameCtx, e: Extract<LambEvent, { kind: 'bout' }>): string[] {
  if (e.mode === 'entrainement') return [];
  const c = career(ctx);
  const res: BoutRes = e.outcome === 'abandon' ? 'A' : e.winner === 'player' ? 'V' : e.winner === 'opponent' ? 'D' : 'N';
  const before = rank(ctx);
  const pts = boutPoints(e.mode, res, e.level, e.outcome === 'projection');
  const purse = purseOf(e.mode, res, before.rung, e.level);
  const entry: BoutEntry = { at: ctx.state.data.playedMs, day: ctx.day(), mode: e.mode, opp: e.opponent.name, style: e.opponent.label, level: e.level, res, how: HOW[e.outcome] ?? e.outcome, purse, pts };
  c.bouts.push(entry);
  if (c.bouts.length > BOUTS_MAX) c.bouts.splice(0, c.bouts.length - BOUTS_MAX);
  if (purse) ctx.state.addMoney(purse, `Cachet · combat classé contre ${e.opponent.name}`);
  const after = rank(ctx);
  const lines: string[] = [];
  if (purse) lines.push(`Cachet +${fcfa(purse)}`);
  else if (e.mode === 'amical' && res !== 'A') lines.push('Amical : pas de cachet');
  if (after.rung > before.rung) lines.push(`Nouveau palier : ${after.label} !`);
  else if (after.rung < before.rung) lines.push(`Recul au classement : ${after.label}`);
  else if (pts) lines.push(`Classement ${pts > 0 ? '+' : '−'}${Math.abs(pts)} pts`);
  const h2h = summary(c.bouts.filter(b => b.opp === e.opponent.name));
  if (res === 'D' && h2h.d >= 1 && h2h.bouts >= 1) lines.push(`Revanche à prendre contre ${e.opponent.name}`);
  c.best = Math.max(c.best, after.rung);
  if (news && res !== 'A') news.pending = { before, after, at: ctx.state.data.playedMs };
  ctx.save();
  return lines;
}

/** Rows for the phone's arena app: rank, record, rivalry, purses, attributes, last bouts. */
function arenaRows(ctx: GameCtx): { label: string; value: string }[] {
  const c = career(ctx), s = summary(c.bouts), r = rank(ctx), a = fighterAttributes(ctx.state.data.counters);
  const rows: { label: string; value: string }[] = [
    { label: 'Rang', value: `${r.label} · ${r.score} pts` },
  ];
  if (r.next) rows.push({ label: `Prochain palier : ${r.next.label}`, value: r.next.missing });
  if (c.best > r.rung) rows.push({ label: 'Meilleur palier atteint', value: RUNGS[c.best].label });
  rows.push({ label: 'Palmarès', value: s.bouts || s.ab ? `${s.bouts} combats · ${s.v} V · ${s.d} D · ${s.n} N${s.ab ? ` · ${s.ab} abandon${s.ab > 1 ? 's' : ''}` : ''}` : 'Pas encore de combat' });
  if (s.streak && s.streak.count >= 2 && s.streak.res !== 'N') rows.push({ label: 'Série', value: `${s.streak.count} ${s.streak.res === 'V' ? 'victoires' : 'défaites'} de suite` });
  if (s.rival) rows.push({ label: 'Rivalité', value: `${s.rival.name} · ${s.rival.v} V – ${s.rival.d} D${s.rival.n ? ` – ${s.rival.n} N` : ''}` });
  rows.push({ label: 'Plus gros cachet', value: s.bestPurse ? fcfa(s.bestPurse) : '—' });
  if (s.purses) rows.push({ label: 'Cachets gagnés', value: fcfa(s.purses) });
  rows.push({ label: 'Physique', value: ATTRS.filter(x => ['force', 'endurance', 'explosivite'].includes(x.id)).map(x => `${x.label} ${a[x.id]}`).join(' · ') });
  rows.push({ label: 'Lutte', value: ATTRS.filter(x => !['force', 'endurance', 'explosivite'].includes(x.id)).map(x => `${x.label} ${a[x.id]}`).join(' · ') });
  for (const b of c.bouts.slice(-3).reverse())
    rows.push({ label: `Jour ${b.day} · ${b.mode === 'classe' ? 'classé' : 'amical'}`, value: `${RES_WORD[b.res]} contre ${b.opp} (niv. ${b.level})${b.how && b.res !== 'A' ? `, ${b.how}` : ''}${b.purse ? ` · ${fcfa(b.purse)}` : ''}` });
  return rows;
}

export const careerModule: GameModule = {
  name: 'career',
  init(ctx) {
    news = new FightNews(() => playerName(ctx));
    // The phone's arena app keeps its own rows (discipline, records by mode) after the career rows.
    const base = phoneHooks.arenaProfile;
    phoneHooks.arenaProfile = () => [...arenaRows(ctx), ...(base?.() ?? [])];
    phoneHooks.profileDims = () => dimensions({
      counters: ctx.state.data.counters, netWorth: netWorth(ctx.state), relations: relationsOf(ctx), ventures: ventures(ctx),
      bouts: career(ctx).bouts, rung: rank(ctx).rung,
    }, fcfa).map(d => ({ label: d.label, score: d.score, level: d.level, note: d.note }));
    phoneHooks.profileHeadline = () => {
      const r = rank(ctx), s = summary(career(ctx).bouts);
      return s.bouts || s.ab ? `Lutteur · ${r.label}` : 'Une vie à Dakar';
    };
  },
  hubLoaded(ctx, hub: HubWorld) {
    // The écurie drills sit with Coach Ablaye's session: same place, same sheet, the « ⋯ » quick actions. The open
    // ranked bout is offered at the écurie and at the arena.
    for (const it of hub.interactables) {
      const ecurie = it.actions.some(a => a.special === 'training'), arena = it.actions.some(a => a.special === 'combat_classe' && a.id !== PETIT.id);
      if (!ecurie && !arena) continue;
      const add = [...(ecurie ? DRILLS : []), PETIT].filter(d => !it.actions.some(a => a.id === d.id));
      if (add.length) it.actions = [...it.actions, ...add];
    }
    news?.hubLoaded(ctx, hub);
  },
  update(ctx, dt) {
    const c = career(ctx);
    labelT -= dt;
    if (labelT <= 0) {                                       // the open bout's name and purse follow the rung
      labelT = 1;
      const r = rank(ctx);
      PETIT.label = r.rung === 0 ? 'Petit combat de quartier' : `Combat du soir · ${r.label}`;
      PETIT.detail = `Combat classé · cachet ${fcfa(purseOf('classe', 'V', r.rung, 1))} si tu gagnes, moins sinon`;
    }
    news?.update(ctx, dt, c.bouts.length ? c.bouts[c.bouts.length - 1] : null);
  },
  lamb(ctx, e) {
    if (e.kind === 'bout') return recordBout(ctx, e);
    return [];
  },
  debug: ctx => ({
    career: () => {
      const c = career(ctx), r = rank(ctx);
      return { rank: r, best: c.best, record: summary(c.bouts), bouts: c.bouts.slice(-10), attrs: fighterAttributes(ctx.state.data.counters),
        line: recordLine(c.bouts, r.label, fcfa), dims: phoneHooks.profileDims?.() ?? [] };
    },
    /** Simulate the end of a bout through the same path as a real one (main.ts reports it the same way). */
    poster: () => news?.text ?? '',
    careerArena: () => ctx.world()?.arena ?? null,
    careerBout: (mode: 'amical' | 'classe', winner: 'player' | 'opponent' | null, level = 1, outcome: 'projection' | 'decision' | 'egalite' | 'abandon' = winner ? 'projection' : 'egalite', name = 'Gora') =>
      recordBout(ctx, { kind: 'bout', mode, outcome, winner, opponent: { name, style: 'costaud', label: 'Costaud' }, level }),
  }),
};
