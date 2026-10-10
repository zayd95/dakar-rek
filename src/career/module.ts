import './career.css';
import type { GameCtx, GameModule, LambEvent } from '../game/modules';
import type { Action, HubWorld } from '../world/types';
import { phoneHooks } from '../ui/phoneHooks';
import { fcfa } from '../ui/hud';
import { assetsOf, netWorth } from '../economy/assets';
import { loadProfile } from '../multiplayer/client';
import { FightNews, resultText } from './world';
import { arenaFighter } from '../arena/fighter';
import { posters } from '../arena/posters';
import { STYLES } from '../lamb/rules';
import { setBillSource, type Bill } from '../arena/program';
import { setRecordSource } from '../arena/ceremony';
import {
  ATTRS, BOUTS_MAX, RUNGS, boutPoints, dimensions, fighterAttributes, publicRecord, purseOf, rankOf, recordLine, summary,
  type BoutEntry, type BoutRes, type CareerSave,
} from './career';
import {
  GALA_RUNG, TITLE_IDLE_DAYS, TITLE_RUNG, beltOf, cardOf, galaBlock, isFightDay, ladderAt, mainEvent, opponentFor, placeOf, titleBout, wrestlerById,
  type Ladder, type Standing,
} from './roster';

/**
 * Career module (docs/CAREER.md): keeps the fight record from every finished bout, pays the purse of ranked bouts,
 * moves the rank on the ladder, adds the écurie drills that feed the fighter attributes, and gives the phone a light
 * profile card (Forme / Richesse / Réputation / Influence) and the arena app its record. Never asks for a career.
 */
const DRILLS: Action[] = [
  { id: 'drill_frappe', label: 'Sac de frappe', detail: 'Frappe et explosivité', seconds: 5, icon: '🥊', needs: { energie: -8, hygiene: -6 }, counter: 'entr_frappe',
    requires: s => (s.data.needs.energie < 12 ? 'Trop fatigué' : null) },
  { id: 'drill_saisies', label: 'Travail des saisies', detail: 'Technique et équilibre, avec un partenaire', seconds: 5, icon: '🤼', needs: { energie: -7, hygiene: -5, social: 2 }, counter: 'entr_saisies',
    requires: s => (!s.data.flags.includes('ecurie_baobab') ? 'Parle d’abord à Coach Ablaye' : s.data.needs.energie < 12 ? 'Trop fatigué' : null) },
  { id: 'drill_force', label: 'Gainage et pompes', detail: 'Force et explosivité', seconds: 5, icon: '💪', needs: { energie: -9, hygiene: -5 }, counter: 'entr_force',
    requires: s => (s.data.needs.energie < 12 ? 'Trop fatigué' : null) },
];

/**
 * The open door to the arena: a ranked bout at the player's rung, offered at the arena and at the écurie to anyone
 * rested enough — no écurie card, no guided course first (those stay for the arena's regular « Combat classé »).
 * Named « Petit combat de quartier » on the first rung, « Combat du soir · <rang> » after. It does not start the duel
 * at once: the fighter's evening begins (src/arena/fighter.ts: « Entrée des lutteurs » → tunnel → corner → ring → duel),
 * against the ranked opponent of the moment (same rotation as the arena's « Combat classé »).
 */
const PETIT: Action = { id: 'petit_combat', label: 'Petit combat de quartier', detail: 'Combat classé au premier palier · un cachet si tu combats', seconds: 0, quiet: true, icon: '🤼',
  steps: [{ label: 'Inscription', primitive: 'enter', then: () => signUp() }],
  requires: s => (arenaFighter.pending() ? 'Ton combat de ce soir est déjà prévu' : s.data.needs.energie < 20 ? 'Trop fatigué : repose-toi d’abord' : null) };
const foughtTonight = (ctx: GameCtx) => career(ctx).bouts.some(b => b.day === ctx.day() && (b.kind === 'gala' || b.kind === 'title'));
const blockOf = (ctx: GameCtx, kind: 'gala' | 'title') =>
  galaBlock(kind, { day: ctx.day(), hour: ctx.hour(), pending: arenaFighter.pending(), energie: ctx.state.data.needs.energie, foughtTonight: foughtTonight(ctx) });
/** A place on tonight's gala card (Friday–Sunday), from Adversaires réputés: a named opponent, double purse. */
const GALA_PLACE: Action = { id: 'gala_place', label: 'Place au gala', detail: 'Un combat sur la carte du soir', seconds: 0, quiet: true, icon: '🏟️',
  steps: [{ label: 'Inscription au gala', primitive: 'enter', then: () => signUp('gala') }],
  visible: () => { const c = ctxRef; return !!c && isFightDay(c.day()) && rank(c).rung >= GALA_RUNG; },
  requires: () => (ctxRef ? blockOf(ctxRef, 'gala') : null) };
/** The belt at the Sunday gala: a challenge from Contender (or for a vacant belt), a defence for the champion. */
const TITLE: Action = { id: 'title_bout', label: 'Combat pour le titre', detail: 'La ceinture de l’Arène de Pikine', seconds: 0, quiet: true, icon: '🏆',
  steps: [{ label: 'Inscription', primitive: 'enter', then: () => signUp('title') }],
  visible: () => { const c = ctxRef; return !!c && !!titleOffer(c); },
  requires: () => (ctxRef ? blockOf(ctxRef, 'title') : null) };

let ctxRef: GameCtx | null = null;
/** Tonight's gala place or title bout, once signed up for (the duel comes at the ring, against this wrestler). */
let signed: { day: number; kind: 'gala' | 'title'; opp: string } | null = null;

/** The city's ladder on a day (src/career/roster.ts), kept until a bout or a watched gala changes it. */
const ladders = new Map<number, Ladder>();
let ladderSig = '';
function ladder(ctx: GameCtx, day = ctx.day()): Ladder {
  const c = career(ctx), last = c.bouts[c.bouts.length - 1];
  const g = c.galas?.[c.galas.length - 1], sig = `${c.bouts.length}|${last?.at ?? 0}|${c.galas?.length ?? 0}|${g?.day ?? 0}|${g?.winner ?? ''}`;
  if (sig !== ladderSig) { ladderSig = sig; ladders.clear(); }
  let l = ladders.get(day);
  if (!l) { if (ladders.size >= 4) ladders.clear(); l = ladderAt(day, c.bouts, c.galas ?? []); ladders.set(day, l); }
  return l;
}
const ecurieOf = (ctx: GameCtx) => (ctx.state.data.flags.includes('ecurie_baobab') ? 'Baobab' : null);
/** Tonight's main event (its two wrestlers are not offered as the player's gala opponent). */
const mainIds = (ctx: GameCtx) => (isFightDay(ctx.day()) ? mainEvent(ladder(ctx), ctx.day()) : []);
const rankedCount = (ctx: GameCtx) => career(ctx).bouts.filter(b => b.mode === 'classe').length;
/** The ranked opponent of the moment: the roster wrestler closest to the player's points, rotating with the bouts. */
const rankedOpponent = (ctx: GameCtx): Standing => opponentFor(ladder(ctx), rank(ctx).score, rankedCount(ctx));
/** The gala's opponent: a notch above the open bouts, never one of the main event. */
const galaOpponent = (ctx: GameCtx): Standing => opponentFor(ladder(ctx), rank(ctx).score + 40, rankedCount(ctx), mainIds(ctx));
const titleOffer = (ctx: GameCtx) => titleBout(ladder(ctx), ctx.day(), rank(ctx).rung >= TITLE_RUNG);

/** Sign up for tonight's bout: the fighter's path starts (the duel comes at the ring, against the named wrestler). */
function signUp(kind?: 'gala' | 'title') {
  const ctx = ctxRef; if (!ctx) return;
  const block = kind ? blockOf(ctx, kind) : null;
  if (block) { ctx.toast(block); return; }
  const opp = kind === 'title' ? titleOffer(ctx)?.opp : kind === 'gala' ? galaOpponent(ctx) : rankedOpponent(ctx);
  if (!opp) { ctx.toast('Pas de combat pour le titre ouvert ce soir'); return; }
  signed = kind ? { day: ctx.day(), kind, opp: opp.id } : null;
  if (!arenaFighter.begin({ mode: 'classe', style: opp.style, opponent: opp.name })) { signed = null; ctx.toast('Ton combat de ce soir est déjà prévu'); return; }
  if (kind) ctx.toast(kind === 'title' ? `Combat pour le titre contre ${opp.name}, ce soir` : `Ta place au gala : contre ${opp.name}, ce soir`);
}

const RES_WORD: Record<BoutRes, string> = { V: 'Victoire', D: 'Défaite', N: 'Nul', A: 'Abandon' };
let news: FightNews | null = null, labelT = 0;
const playerName = (ctx: GameCtx) => { let st: Storage | null = null; try { st = localStorage; } catch { /* blocked */ } return loadProfile(st, ctx.state.data.guestId).name; };
const HOW: Record<string, string> = { projection: 'projection', decision: 'décision', egalite: 'égalité', abandon: 'abandon' };

function career(ctx: GameCtx): CareerSave {
  const d = ctx.state.data as { career?: CareerSave };
  if (!d.career) d.career = { bouts: [], best: 0, galas: [] };
  return d.career;
}
const relationsOf = (ctx: GameCtx) => Object.entries(ctx.state.data.rel).filter(([k]) => k.split('|').includes('player')).map(([, v]) => v);
const ventures = (ctx: GameCtx) => assetsOf(ctx.state, 'business').filter(a => a.how === 'owned').length + assetsOf(ctx.state, 'billboard').filter(a => a.how === 'owned').length;
const belt = (ctx: GameCtx) => beltOf(ladder(ctx), ctx.day());
const rank = (ctx: GameCtx) => rankOf(career(ctx).bouts, ctx.day(), belt(ctx));
/** The bill of an evening for the posters and the arena show: the ladder's card, or the player's own title bout. */
function billOf(ctx: GameCtx, day: number): Bill {
  const s = signed && signed.day === day && signed.kind === 'title' ? wrestlerById(signed.opp) : undefined;
  if (s) return { left: { id: 'player', name: playerName(ctx), ecurie: ecurieOf(ctx) ?? 'indépendant' }, right: { id: s.id, name: s.name, ecurie: s.ecurie ?? 'indépendant' }, title: true };
  return cardOf(ladder(ctx, day), day);
}
let recSent: string | null | undefined;
/** The public line under the player's name for others (presence `rec`), sent when it changes. */
function syncRecord(ctx: GameCtx) {
  const rec = publicRecord(career(ctx).bouts, rank(ctx).label, ecurieOf(ctx));
  if (rec !== recSent) { recSent = rec; ctx.setPublicRecord(rec); }
}

/** Record one finished bout: points, purse (ranked), best rung; returns the toast lines. */
export function recordBout(ctx: GameCtx, e: Extract<LambEvent, { kind: 'bout' }>): string[] {
  if (e.mode === 'entrainement') return [];
  const c = career(ctx);
  const res: BoutRes = e.outcome === 'abandon' ? 'A' : e.winner === 'player' ? 'V' : e.winner === 'opponent' ? 'D' : 'N';
  const before = rank(ctx), beltBefore = belt(ctx);
  // a gala place or a title bout signed up for tonight, against this wrestler
  const kind = signed && signed.day === ctx.day() && e.mode === 'classe' && wrestlerById(signed.opp)?.name === e.opponent.name ? signed.kind : undefined;
  if (e.mode === 'classe') signed = null;
  const pts = boutPoints(e.mode, res, e.level, e.outcome === 'projection', kind);
  const purse = purseOf(e.mode, res, before.rung, e.level, kind);
  const entry: BoutEntry = { at: ctx.state.data.playedMs, day: ctx.day(), mode: e.mode, opp: e.opponent.name, style: e.opponent.label, level: e.level, res, how: HOW[e.outcome] ?? e.outcome, purse, pts, ...(kind ? { kind } : {}) };
  c.bouts.push(entry);
  if (c.bouts.length > BOUTS_MAX) c.bouts.splice(0, c.bouts.length - BOUTS_MAX);
  if (purse) ctx.state.addMoney(purse, `Cachet · ${kind === 'title' ? 'combat pour le titre' : kind === 'gala' ? 'gala' : 'combat classé'} contre ${e.opponent.name}`);
  const after = rank(ctx), beltAfter = belt(ctx);
  const lines: string[] = [];
  if (beltAfter.held && !beltBefore.held) lines.push('Ceinture de champion de l’Arène de Pikine !');
  else if (beltBefore.held && !beltAfter.held) lines.push(`${e.opponent.name} te prend la ceinture`);
  else if (beltAfter.held && beltAfter.defences > beltBefore.defences) lines.push(`Ceinture défendue (${beltAfter.defences})`);
  if (purse) lines.push(`Cachet +${fcfa(purse)}`);
  else if (e.mode === 'amical' && res !== 'A') lines.push('Amical : pas de cachet');
  if (after.rung > before.rung) lines.push(`Nouveau palier : ${after.label} !`);
  else if (after.rung < before.rung) lines.push(`Recul au classement : ${after.label}`);
  else if (pts) lines.push(`Classement ${pts > 0 ? '+' : '−'}${Math.abs(pts)} pts`);
  const h2h = summary(c.bouts.filter(b => b.opp === e.opponent.name));
  if (res === 'D' && h2h.d >= 1 && h2h.bouts >= 1) lines.push(`Revanche à prendre contre ${e.opponent.name}`);
  c.best = Math.max(c.best, after.rung);
  if (news && res !== 'A') news.pending = { before, after, at: ctx.state.data.playedMs };
  // the city's fight posters print the result for two days (src/arena/posters.ts)
  const text = resultText(entry, playerName(ctx));
  if (text) posters.setResult(entry.day, text);
  syncRecord(ctx);
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
  // the city's ladder: where the player stands among the roster, the belt, tonight's card
  const l = ladder(ctx), day = ctx.day(), place = placeOf(l, r.score), b = belt(ctx);
  rows.push({ label: `Classement de la ville · saison ${l.season + 1}`, value: `${place}${place === 1 ? 'er' : 'e'} sur ${l.table.length + 1} · en tête : ${l.table.slice(0, 2).map(s => `${s.name} ${s.pts}`).join(', ')}` });
  const holder = l.title.holder === 'player' ? 'toi' : l.title.holder ? wrestlerById(l.title.holder)?.name ?? '—' : 'vacante';
  const held = l.title.holder && l.title.holder !== 'player' && l.title.defences ? ` · ${l.title.defences} défense${l.title.defences > 1 ? 's' : ''}` : '';
  rows.push({ label: 'Ceinture', value: b.held ? `à toi · ${b.defences} défense${b.defences > 1 ? 's' : ''} · à remettre en jeu avant le jour ${l.title.last + TITLE_IDLE_DAYS}` : `${holder}${held}` });
  if (isFightDay(day)) { const c2 = billOf(ctx, day); rows.push({ label: c2.title ? 'Ce soir · titre en jeu' : 'Ce soir au gala', value: `${c2.left.name} – ${c2.right.name}` }); }
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
    ctxRef = ctx;
    news = new FightNews(() => playerName(ctx));
    // the posters and the arena show name each evening's real card; the main event the player watched is remembered
    setBillSource(day => billOf(ctx, day), (day, winner) => {
      if (!isFightDay(day) || winner === 'player') return;
      const c = career(ctx);
      c.galas = [...(c.galas ?? []).filter(g => g.day !== day), { day, winner }].slice(-60);
      ctx.save();
    });
    // the announcer of the wrestlers' entrance reads each one's season record from the city's ladder (src/arena/ceremony.ts)
    setRecordSource((id, _name, day) => { const st = ladder(ctx, day).table.find(x => x.id === id); return st ? { v: st.v, d: st.d, n: st.n } : null; });
    syncRecord(ctx);
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
      const add = [...(ecurie ? DRILLS : []), PETIT, ...(arena ? [GALA_PLACE, TITLE] : [])].filter(d => !it.actions.some(a => a.id === d.id));
      if (add.length) it.actions = [...it.actions, ...add];
    }
    news?.hubLoaded(ctx, hub);
  },
  update(ctx, dt) {
    const c = career(ctx);
    labelT -= dt;
    if (signed && (signed.day !== ctx.day() || !arenaFighter.pending())) signed = null;     // the evening went by, or given up
    if (labelT <= 0) {                                       // the bouts' names and purses follow the rung and the ladder
      labelT = 1;
      const r = rank(ctx), o = rankedOpponent(ctx);
      PETIT.label = r.rung === 0 ? 'Petit combat de quartier' : `Combat du soir · ${r.label}`;
      PETIT.detail = `Contre ${o.name} (${STYLES[o.style].label}, niv. ${o.level}) · cachet ${fcfa(purseOf('classe', 'V', r.rung, o.level))} si tu gagnes`;
      if (r.rung >= GALA_RUNG && isFightDay(ctx.day())) {
        const g = galaOpponent(ctx);
        GALA_PLACE.label = `Place au gala · contre ${g.name}`;
        GALA_PLACE.detail = `${STYLES[g.style].label}, niv. ${g.level} · cachet ${fcfa(purseOf('classe', 'V', r.rung, g.level, 'gala'))} si tu gagnes`;
      }
      const t = titleOffer(ctx);
      if (t) {
        TITLE.label = `${t.defence ? 'Défendre la ceinture' : 'Combat pour le titre'} · contre ${t.opp.name}`;
        TITLE.detail = `Gala du dimanche · cachet ${fcfa(purseOf('classe', 'V', Math.max(r.rung, TITLE_RUNG), t.opp.level, 'title'))} si tu gagnes`;
      }
      syncRecord(ctx);
    }
    news?.update(ctx, dt, c.bouts.length ? c.bouts[c.bouts.length - 1] : null);
  },
  lamb(ctx, e) {
    if (e.kind === 'bout') return recordBout(ctx, e);
    return [];
  },
  /** Ranked bouts face the city's roster: tonight's signed-up gala or title opponent, else the closest on the ladder. */
  opponent(ctx, mode) {
    if (mode !== 'classe') return null;
    const s = signed && signed.day === ctx.day() ? wrestlerById(signed.opp) : undefined;
    const o = s ?? rankedOpponent(ctx);
    return { name: o.name, style: o.style, level: o.level };
  },
  debug: ctx => ({
    career: () => {
      const c = career(ctx), r = rank(ctx);
      return { rank: r, best: c.best, record: summary(c.bouts), bouts: c.bouts.slice(-10), attrs: fighterAttributes(ctx.state.data.counters),
        line: recordLine(c.bouts, r.label, fcfa), rec: publicRecord(c.bouts, r.label, ecurieOf(ctx)), dims: phoneHooks.profileDims?.() ?? [] };
    },
    /** Simulate the end of a bout through the same path as a real one (main.ts reports it the same way). */
    poster: () => news?.text ?? '',
    careerArena: () => ctx.world()?.arena ?? null,
    /** The city's ladder on a day (table, belt, the card) and tonight's sign-up (for the checks). */
    careerLadder: (day = ctx.day()) => { const l = ladder(ctx, day); return { table: l.table, title: l.title, season: l.season, card: billOf(ctx, day), signed, belt: belt(ctx), rank: rank(ctx) }; },
    careerSign: (kind?: 'gala' | 'title') => { signUp(kind); return signed; },
    careerBout: (mode: 'amical' | 'classe', winner: 'player' | 'opponent' | null, level = 1, outcome: 'projection' | 'decision' | 'egalite' | 'abandon' = winner ? 'projection' : 'egalite', name = 'Gora') =>
      recordBout(ctx, { kind: 'bout', mode, outcome, winner, opponent: { name, style: 'costaud', label: 'Costaud' }, level }),
  }),
};
