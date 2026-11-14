import { describe, expect, it } from 'vitest';
import {
  F, campFormDefault, campInviteText, campSummary, clockText, feeQuote, formFee, formTerms, listingView, lobbyActions, momentOf, moneyLine, parseCampInvite,
  parseFee, quoteLine, resultView, rulesLines, termsLine, type CampAct, type LobbyCtx,
} from '../src/ui/phone/apps/campText';
import { CAMP_FEE_MAX, type CampLobbyView, type CampPlayer, type CampResult } from '../src/multiplayer/campProtocol';
import type { CampMoneyView } from '../src/online/campClient';

/**
 * 1.0.1 Grand Camp: the phone's screens as rules (src/ui/phone/apps/campText.ts): the organizer's form → the terms, the live summary's numbers, which
 * buttons a lobby shows and why one cannot be pressed, every money step in words (never done before the server said so), the result, the moments of
 * a match, and the invitation that travels as an ordinary text message.
 */
const N = (s: string) => s.replace(/[  ]/g, ' ');
const ME = 'aaaaaaaaaaaaaaaa', ORG = 'bbbbbbbbbbbbbbbb', X = 'cccccccccccccccc', M = '0123456789abcdef';
const p = (tag: string, team: 0 | 1, o: Partial<CampPlayer> = {}): CampPlayer => ({ tag, name: tag === ME ? 'Moi' : tag === ORG ? 'Awa' : 'Ibou', look: 1, team, ready: false, hold: 'none', on: true, at: 1, sid: tag === ORG ? 1 : tag === ME ? 2 : 3, ...o });
const lobby = (o: Partial<CampLobbyView> = {}): CampLobbyView => ({
  match: M, state: 'lobby', terms: { fee: 1000, size: 10, dist: 'team', open: false, hub: 'corniche' }, frozen: true, org: ORG, teams: ['Rouge', 'Jaune'],
  players: [p(ORG, 0), p(ME, 1)], pool: 0, full: 10_000, created: 1, closes: 600_001, ...o,
});
const ctx = (o: Partial<LobbyCtx> = {}): LobbyCtx => ({ lobby: lobby(), me: ME, status: 'open', atPitch: true, ...o });
const ids = (l: CampAct[]) => l.map(a => a.id);
const act = (l: CampAct[], id: string) => l.find(a => a.id === id);

describe('Grand Camp form → terms and the live summary', () => {
  it('1 000 F by default, 10 players, equal split, public; the owner’s summary « 10 000 F », « 2 000 F », « Sans commission »', () => {
    const f = campFormDefault();
    expect(f).toMatchObject({ fee: 1000, typed: '', size: 10, dist: 'team', open: true });
    const t = formTerms(f);
    expect(t).toEqual({ ok: true, terms: { fee: 1000, size: 10, dist: 'team', open: true, hub: 'corniche' } });
    expect(campSummary({ fee: 1000, size: 10, dist: 'team' }).map(N)).toEqual(['Cagnotte totale si tous les joueurs participent : 10 000 F', 'Gain par gagnant : 2 000 F', 'Sans commission']);
  });
  it('the chips, a typed amount (spaces, dots, « F »), a free match; too much or not a number is refused with the sentence', () => {
    expect(parseFee('1 500')).toBe(1500); expect(parseFee('1.500 F')).toBe(1500); expect(parseFee('2500f')).toBe(2500); expect(parseFee('0')).toBe(0);
    expect(parseFee('1 000 F')).toBe(1000);
    expect(parseFee(String(CAMP_FEE_MAX))).toBe(CAMP_FEE_MAX); expect(parseFee(String(CAMP_FEE_MAX + 1))).toBeNull();
    expect(parseFee('12,5')).toBeNull(); expect(parseFee('-100')).toBeNull(); expect(parseFee('abc')).toBeNull();
    expect(formFee({ ...campFormDefault(), fee: 5000 })).toEqual({ ok: true, fee: 5000 });
    expect(formFee({ ...campFormDefault(), fee: 5000, typed: '750' })).toEqual({ ok: true, fee: 750 });     // a typed amount wins over the chip
    const big = formFee({ ...campFormDefault(), typed: '300000' }), junk = formFee({ ...campFormDefault(), typed: '12,5' });
    expect(big.ok).toBe(false); expect(!big.ok && N(big.why)).toBe('Au plus 250 000 F par joueur.');
    expect(junk.ok).toBe(false); expect(!junk.ok && junk.why).toMatch(/francs/);
    expect(formTerms({ ...campFormDefault(), typed: 'x' }).ok).toBe(false);
    expect(formTerms({ fee: 0, typed: '', size: 6, dist: 'single', open: false })).toEqual({ ok: true, terms: { fee: 0, size: 6, dist: 'single', open: false, hub: 'corniche' } });
  });
  it('the summary for every size and distribution: the pool is fee × players; a winner gets twice the fee, or the whole pool alone; a free match says so', () => {
    for (const size of [6, 10, 14] as const) for (const fee of [500, 2500, 5000]) {
      const team = campSummary({ fee, size, dist: 'team' }).map(N), single = campSummary({ fee, size, dist: 'single' }).map(N);
      expect(team[0]).toBe(`Cagnotte totale si tous les joueurs participent : ${N(F(fee * size))}`);
      expect(team[1]).toBe(`Gain par gagnant : ${N(F(fee * 2))}`);
      expect(single[1]).toBe(`Gain du gagnant : ${N(F(fee * size))}`);
      // equal teams: both distributions divide the pool exactly (nothing rounded)
      expect((size / 2) * fee * 2).toBe(fee * size);
    }
    expect(campSummary({ fee: 0, size: 14, dist: 'team' }).map(N)).toEqual(['Match gratuit : pas de mise, pas de cagnotte', 'Sans commission']);
    expect(N(termsLine({ fee: 1000, size: 10, dist: 'team', open: false, hub: 'corniche' }))).toBe('Mise 1 000 F · 5 contre 5 · partage égal · privé');
    expect(N(termsLine({ fee: 0, size: 14, dist: 'single', open: true, hub: 'corniche' }))).toBe('Gratuit · 7 contre 7 · un seul gagnant · public');
  });
  it('the rules a player reads before accepting: when the fee is taken and returned, the distribution, a draw, public or private', () => {
    const r = rulesLines({ fee: 1000, size: 10, dist: 'team', open: false, hub: 'corniche' }).map(N).join(' | ');
    expect(r).toMatch(/prise quand tu appuies sur « Prêt »/); expect(r).toMatch(/rendue si tu te retires avant le coup d’envoi/);
    expect(r).toMatch(/2 000 F chacun/); expect(r).toMatch(/Match nul : chaque mise est rendue/); expect(r).toMatch(/Privé : sur invitation/);
    expect(rulesLines({ fee: 1000, size: 6, dist: 'single', open: true, hub: 'corniche' }).join(' ')).toMatch(/meilleur buteur/);
    expect(rulesLines({ fee: 0, size: 6, dist: 'team', open: true, hub: 'corniche' })[0]).toMatch(/gratuit/);
  });
  it('a listing of the district: the organizer, the terms, the places, « Tu es invité » on a private one I am invited to', () => {
    const v = listingView({ match: M, terms: { fee: 1000, size: 10, dist: 'team', open: false, hub: 'corniche' }, org: { tag: ORG, name: 'Awa' }, teams: ['Rouge', 'Jaune'], count: 3, created: 1, closes: 2, invited: true });
    expect(v).toMatchObject({ title: 'Grand Camp de Awa', places: '3/10 joueurs', badge: 'Tu es invité' });
  });
});

describe('Grand Camp lobby: the buttons from the lobby’s state', () => {
  it('not in it: « Rejoindre » (the fee only at « Prêt »), refused with the reason when full or when I am in another match', () => {
    const l = ctx({ me: X });
    expect(ids(lobbyActions(l))).toEqual(['join']);
    expect(N(act(lobbyActions(l), 'join')!.sub!)).toBe('Mise 1 000 F, prise seulement à « Prêt »');
    expect(act(lobbyActions(l), 'join')!.why).toBeUndefined();
    const full = lobby({ terms: { fee: 1000, size: 6, dist: 'team', open: true, hub: 'corniche' }, players: [p(ORG, 0), p(ME, 1), ...['1', '2', '3', '4'].map((k, i) => p(k.repeat(16), (i % 2) as 0 | 1))] });
    expect(act(lobbyActions(ctx({ lobby: full, me: X })), 'join')!.why).toBe('Le match est complet.');
    expect(act(lobbyActions(ctx({ me: X, elsewhere: true })), 'join')!.why).toMatch(/déjà inscrit/);
  });
  it('a member, not ready: « Prêt » needs the pitch — away from it « Aller au terrain » comes first and « Prêt » says why', () => {
    const at = lobbyActions(ctx());
    expect(ids(at)).toEqual(['ready', 'team', 'leave']);
    expect(act(at, 'ready')).toMatchObject({ kind: 'primary' }); expect(act(at, 'ready')!.why).toBeUndefined();
    expect(N(act(at, 'ready')!.sub!)).toBe('Ta mise de 1 000 F sera prise');
    const away = lobbyActions(ctx({ atPitch: false }));
    expect(ids(away)).toEqual(['go', 'ready', 'team', 'leave']);
    expect(act(away, 'go')).toMatchObject({ label: 'Aller au terrain', kind: 'primary' });
    expect(act(away, 'ready')!.why).toBe('Va d’abord au terrain de la Corniche.');
  });
  it('the fee pending → « Mise en attente… » greyed, no team change; held → « Pas prêt » (the fee given back) and « Changer d’équipe » says why', () => {
    const pend = lobbyActions(ctx({ lobby: lobby({ players: [p(ORG, 0), p(ME, 1, { hold: 'pending' })] }) }));
    expect(act(pend, 'ready')).toMatchObject({ label: 'Mise en attente…', why: 'En attente de la réponse du serveur.' });
    expect(act(pend, 'team')!.why).toBe('Passe « Pas prêt » d’abord.');
    const held = lobbyActions(ctx({ lobby: lobby({ players: [p(ORG, 0), p(ME, 1, { hold: 'held', ready: true })], pool: 1000 }) }));
    expect(ids(held)).toEqual(['unready', 'team', 'leave']);
    expect(N(act(held, 'unready')!.sub!)).toBe('Ta mise de 1 000 F t’est rendue');
    expect(N(act(held, 'leave')!.sub!)).toBe('Ta mise de 1 000 F t’est rendue');
    expect(act(held, 'team')!.why).toBe('Passe « Pas prêt » d’abord.');
    const free = lobbyActions(ctx({ lobby: lobby({ terms: { fee: 0, size: 6, dist: 'team', open: true, hub: 'corniche' }, players: [p(ORG, 0), p(ME, 1, { ready: true })] }) }));
    expect(act(free, 'unready')!.sub).toBeUndefined();
  });
  it('« Changer d’équipe » when the other team is full is refused with its name', () => {
    const l = lobby({ terms: { fee: 1000, size: 6, dist: 'team', open: true, hub: 'corniche' }, players: [p(ORG, 0), p('1'.repeat(16), 0), p('2'.repeat(16), 0), p(ME, 1)] });
    expect(act(lobbyActions(ctx({ lobby: l })), 'team')!.why).toBe('Les Rouge sont au complet.');
  });
  it('the organizer also has « Inviter », « Retirer un joueur », « Annuler le match » (the fees given back when some were taken)', () => {
    const org = lobbyActions(ctx({ me: ORG, lobby: lobby({ pool: 2000 }) }));
    expect(ids(org)).toEqual(['ready', 'team', 'invite', 'remove', 'cancel', 'leave']);
    expect(act(org, 'cancel')).toMatchObject({ kind: 'danger', sub: 'Chaque mise est rendue' });
    const alone = lobbyActions(ctx({ me: ORG, lobby: lobby({ players: [p(ORG, 0)] }) }));
    expect(act(alone, 'remove')!.why).toBe('Personne à retirer.');
  });
  it('reconnecting or a request on its way: every button that talks to the server is greyed with why; « Aller au terrain » still works', () => {
    const r = lobbyActions(ctx({ status: 'reconnecting', atPitch: false }));
    expect(act(r, 'go')!.why).toBeUndefined();
    expect(r.filter(a => a.id !== 'go').every(a => !!a.why)).toBe(true);
    expect(act(r, 'leave')!.why).toBe('Reconnexion…');
    expect(act(lobbyActions(ctx({ busy: true })), 'ready')!.why).toBe('En attente du serveur…');
    expect(act(lobbyActions(ctx({ status: 'closed' })), 'ready')!.why).toBe('Hors ligne pour l’instant.');
  });
  it('during the match: « Retour au terrain » and « Quitter le match » (the team’s result still counts); at the end: nothing but the result', () => {
    const play = lobbyActions(ctx({ lobby: lobby({ state: 'play' }) }));
    expect(ids(play)).toEqual(['play', 'abandon']);
    expect(act(play, 'abandon')!.sub).toMatch(/résultat de ton équipe/);
    expect(lobbyActions(ctx({ lobby: lobby({ state: 'play', players: [p(ORG, 0), p(ME, 1, { gone: true })] }) }))).toEqual([]);
    expect(lobbyActions(ctx({ lobby: lobby({ state: 'over' }) }))).toEqual([]);
    expect(lobbyActions(ctx({ me: X, lobby: lobby({ state: 'play' }) }))).toEqual([]);
  });
});

describe('Grand Camp money steps, as the server said them', () => {
  const m = (o: Partial<CampMoneyView>): CampMoneyView => ({ step: 'hold', state: 'pending', amount: 1000, at: 1, ...o });
  it('pending until the server answered; done with the amount and Teranga Money’s balance it wrote; failed with its French reason', () => {
    expect(moneyLine(m({})).tone).toBe('wait'); expect(N(moneyLine(m({})).text)).toBe('Mise de 1 000 F : en attente du serveur…');
    expect(moneyLine(m({})).text).toContain('F\u00a0: ');                          // a no-break space before « : » (never a colon alone at a line's start)
    expect(N(moneyLine(m({ state: 'done', balance: 4000 })).text)).toBe('Mise prise : 1 000 F · Teranga Money 4 000 F');
    expect(N(moneyLine(m({ state: 'failed', reason: 'insufficient', text: 'Solde insuffisant : Teranga Money ne couvre pas le droit d’entrée.' })).text)).toBe('Mise refusée : Solde insuffisant : Teranga Money ne couvre pas le droit d’entrée.');
    expect(moneyLine(m({ state: 'failed', reason: 'busy' })).text).toMatch(/déjà pris pour un autre match/);
    expect(moneyLine(m({ step: 'release' })).tone).toBe('wait');
    expect(N(moneyLine(m({ step: 'release', state: 'done', why: 'unready' })).text)).toBe('Mise rendue : 1 000 F (« Pas prêt »)');
    expect(N(moneyLine(m({ step: 'release', state: 'done', why: 'drop' })).text)).toBe('Mise rendue : 1 000 F (connexion perdue avant le coup d’envoi)');
    expect(moneyLine(m({ step: 'release', state: 'done', amount: 0 })).text).toBe('Rien n’avait été pris');
    expect(N(moneyLine(m({ step: 'payout', state: 'done', amount: 2000 })).text)).toBe('Gain versé : 2 000 F');
    expect(N(moneyLine(m({ step: 'refund', state: 'done' })).text)).toBe('Mise remboursée : 1 000 F');
  });
  it('the fee at « Prêt »: Teranga Money first, the rest from the wallet; never a negative balance; today’s top-up limit; offline says so', () => {
    expect(feeQuote(1000, 4000, 0)).toEqual({ fromOnline: 1000, fromWallet: 0 });
    expect(feeQuote(1000, 400, 600)).toEqual({ fromOnline: 400, fromWallet: 600 });
    expect(N(quoteLine(feeQuote(1000, 400, 600)))).toBe('400 F de Teranga Money + 600 F du portefeuille');
    expect(N(quoteLine(feeQuote(1000, 0, 5000)))).toBe('1 000 F du portefeuille, par Teranga Money');
    expect(N(feeQuote(1000, 300, 200).why!)).toBe('Solde insuffisant : il te manque 500 F.');
    expect(feeQuote(1000, 0, 5000, 500).why).toMatch(/Limite de recharge/);
    expect(feeQuote(1000, null, 5000).why).toMatch(/pas connecté/);
    expect(feeQuote(0, null, 0)).toEqual({ fromOnline: 0, fromWallet: 0 });
  });
});

describe('Grand Camp result and moments', () => {
  const r = (o: Partial<CampResult>): CampResult => ({ end: 'win', score: [3, 1], winner: 0, dist: 'team', fee: 1000, total: 10_000, payouts: [], money: 'settled', at: 1, ...o });
  it('nothing about money before the server’s result: « en attente »; then the win with my share, the loss, the single winner', () => {
    expect(resultView(null, { me: ME, team: 0, teams: ['Rouge', 'Jaune'] })).toMatchObject({ tone: 'wait', lines: ['Résultat en attente du serveur…', expect.any(String)] });
    const win = resultView(r({ payouts: [{ tag: ME, amount: 2000 }] }), { me: ME, team: 0, teams: ['Rouge', 'Jaune'] });
    expect(win).toMatchObject({ tone: 'win', title: 'Victoire ! Les Rouge gagnent', score: 'Rouge 3 – 1 Jaune' });
    expect(N(win.lines[0])).toBe('Ta part de la cagnotte : 2 000 F');
    const loss = resultView(r({ payouts: [{ tag: ORG, amount: 2000 }] }), { me: ME, team: 1, teams: ['Rouge', 'Jaune'] });
    expect(loss.tone).toBe('lose'); expect(N(loss.lines[0])).toBe('Ta mise de 1 000 F va aux gagnants.');
    const single = resultView(r({ dist: 'single', single: ORG, payouts: [{ tag: ORG, amount: 10_000 }] }), { me: ME, team: 0, teams: ['Rouge', 'Jaune'], names: t => (t === ORG ? 'Awa' : null) });
    expect(N(single.lines[0])).toBe('La cagnotte (10 000 F) va à Awa, meilleur buteur.');
    const mine = resultView(r({ dist: 'single', single: ME, payouts: [{ tag: ME, amount: 10_000 }] }), { me: ME, team: 0, teams: ['Rouge', 'Jaune'] });
    expect(N(mine.lines[0])).toBe('Tu prends toute la cagnotte : 10 000 F');
  });
  it('a draw, a cancel, a stopped match: my fee back (from the result’s own payouts); a free match: nothing to give back', () => {
    const draw = resultView(r({ end: 'draw', winner: null, score: [1, 1], payouts: [{ tag: ME, amount: 1000 }] }), { me: ME, team: 1, teams: ['Rouge', 'Jaune'] });
    expect(draw).toMatchObject({ title: 'Match nul', tone: 'even', score: 'Rouge 1 – 1 Jaune' }); expect(N(draw.lines[0])).toBe('Ta mise t’est rendue : 1 000 F');
    expect(resultView(r({ end: 'cancel', winner: null, payouts: [{ tag: ME, amount: 1000 }] }), { me: ME, team: 1, teams: ['Rouge', 'Jaune'] }).title).toBe('Match annulé');
    expect(resultView(r({ end: 'stopped', winner: null, payouts: [{ tag: ME, amount: 1000 }] }), { me: ME, team: 1, teams: ['Rouge', 'Jaune'] }).title).toBe('Match arrêté par le serveur');
    expect(N(resultView(r({ fee: 0, total: 0, money: 'none' }), { me: ME, team: 0, teams: ['Rouge', 'Jaune'] }).lines[0])).toBe('Match gratuit : pas de gain.');
  });
  it('the band’s clock and the moments: a goal (mine or theirs, an own goal), half time, full time; drops and returns said in a line', () => {
    expect(clockText(0)).toBe('0:00'); expect(clockText(65.9)).toBe('1:05'); expect(clockText(240)).toBe('4:00');
    const name = (sid: number) => ({ 1: 'Awa', 2: 'Moi', 3: 'Ibou' } as Record<number, string>)[sid] ?? null, T = ['Rouge', 'Jaune'] as const;
    expect(momentOf({ n: 5, k: 'goal', c: 300, team: 0, who: 2, sc: [1, 0] }, T, name, 2)).toMatchObject({ big: true, title: 'But ! Tu as marqué', line: 'Rouge 1 – 0 Jaune' });
    expect(momentOf({ n: 6, k: 'goal', c: 400, team: 1, who: 3, sc: [1, 1] }, T, name, 2)).toMatchObject({ title: 'But des Jaune !', line: 'Ibou · Rouge 1 – 1 Jaune' });
    expect(momentOf({ n: 7, k: 'goal', c: 500, team: 1, who: 1, own: true, sc: [1, 2] }, T, name, 2)!.line).toBe('Awa (contre son camp) · Rouge 1 – 2 Jaune');
    expect(momentOf({ n: 8, k: 'half', c: 1200, sc: [1, 2] }, T, name, 2)).toMatchObject({ title: 'Mi-temps', big: true });
    expect(momentOf({ n: 9, k: 'full', c: 2400, sc: [1, 2] }, T, name, 2)).toMatchObject({ title: 'Fin du match', big: true });
    expect(momentOf({ n: 10, k: 'drop', c: 2400, who: 3, team: 1 }, T, name, 2)!.title).toBe('Ibou a perdu la connexion');
    expect(momentOf({ n: 11, k: 'drop', c: 2400, who: 2, team: 1 }, T, name, 2)).toBeNull();          // my own drop: the band says « Reconnexion… »
    expect(momentOf({ n: 12, k: 'pass', c: 2400, who: 3, team: 1 }, T, name, 2)).toBeNull();
  });
});

describe('Grand Camp invitation as an ordinary text message', () => {
  it('reads as plain French for a 1.0 client; a 1.0.1 client finds the match and the words to show', () => {
    const t = campInviteText({ fee: 1000, size: 10 }, M);
    expect(N(t)).toBe(`Je t’invite à mon Grand Camp au terrain de la Corniche : mise 1 000 F, 5 contre 5 · match ${M}`);
    expect([...t].length).toBeLessThan(500);                                                    // the chat's limit
    const back = parseCampInvite(t)!;
    expect(back.match).toBe(M);
    expect(N(back.text)).toBe('Je t’invite à mon Grand Camp au terrain de la Corniche : mise 1 000 F, 5 contre 5');
    expect(N(campInviteText({ fee: 0, size: 14 }, M))).toMatch(/match gratuit, 7 contre 7/);
  });
  it('any other text, or a malformed id, is not an invitation (chat text is never read for meaning beyond this button)', () => {
    expect(parseCampInvite('Salut, on joue au Grand Camp ce soir ?')).toBeNull();
    expect(parseCampInvite('Grand Camp · match 0123')).toBeNull();
    expect(parseCampInvite(`Grand Camp · match ${M.toUpperCase()}`)).toBeNull();
    expect(parseCampInvite(`Je t’invite à mon Grand Camp · match ${M} et autre chose`)).toBeNull();
  });
});
