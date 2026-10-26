// M3 « Join the match » (docs/districts/M3-CORNICHE.md): the golden path, played with the REAL touch controls in one session (video recorded).
// The Corniche at 17:30: the evening's footballers play on the pitch. The player walks to the touchline, sees the match, taps « Rejoindre le match »,
// picks « Jouer » (Babou introduces himself), and plays: the stick runs to the ball, the ball at the foot is dribbled toward the goal, « Frappe »
// held and released shoots. The short match ends (first to 3, four minutes at most): the result card, the regulars' words, the record kept once.
// « Rejouer »: a second match, played to its end. Then « L'ataya avec Babou »: he comes to the touchline, the ataya. A save and a reload: the
// record is there, nothing counted twice. A later city day (labelled debug shortcut): Babou knows the player again. The player joins once more
// and walks off the pitch mid-match: nothing recorded, the NPCs play on, the controls are the ordinary ones again.
// Debug hooks: the hour, the player put near the pitch (labelled), the next city day, reading state.
// Usage: node scripts/check-match-journey.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import { realTouch, walkTo } from './lib/realTouch.mjs';

const [base = 'http://127.0.0.1:4640/', out = '/tmp/claude-0/m3/journey'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let failed = 0, total = 0; const T = { timeout: 300000 };
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${detail}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: process.env.NOVIDEO ? undefined : { dir: out, size: { width: 390, height: 844 } } });
await context.addInitScript(() => { try { localStorage.setItem('dakarrek.quality', 'low'); } catch { /* */ } });
const page = await context.newPage(); page.setDefaultTimeout(300000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const d = (fn, a) => page.evaluate(fn, a);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let shotN = 0; const shot = async n => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${String(++shotN).padStart(2, '0')}-${n}.png` }); };
const M = () => d(() => window.__dakar.match3());
const ready = async () => { await page.waitForFunction(() => window.__dakar?.pos && window.__dakar.pos().hub && window.__dakar.match3, null, T); };
const items = () => d(() => [...document.querySelectorAll('#modal.on .item')].map(e => ({ text: e.textContent.replace(/\s+/g, ' ').trim(), off: e.classList.contains('dis') })).filter(i => i.text !== '✕'));
const sheet = () => d(() => { const m = document.querySelector('#modal.on'); return m ? m.textContent.replace(/\s+/g, ' ').trim() : null; });
async function tapItem(re) {
  const rowAt = () => d(r => { const e = [...document.querySelectorAll('#modal.on .item')].find(x => new RegExp(r).test(x.textContent.replace(/\s+/g, ' ').trim())); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, re);
  const before = await sheet();
  for (let n = 0; n < 2; n++) {
    let box = await rowAt();
    for (let k = 0; k < 10 && box; k++) { await page.waitForTimeout(120); const again = await rowAt(); if (again && Math.abs(again.x - box.x) < 0.5 && Math.abs(again.y - box.y) < 0.5) break; box = again; }
    if (!box) { if (n) return; throw new Error(`no sheet row matches /${re}/: ${JSON.stringify(await items())}`); }
    await t.down(5, box.x, box.y); await page.waitForTimeout(60); await t.up(5); await page.waitForTimeout(700);
    if ((await sheet()) !== before) return;
    log(`tap on /${re}/ not taken, once more`);
  }
}
/** The action button for a focus id: tapped once it is offered. */
async function act(id, ms = 12000) {
  const ok = await page.waitForFunction(i => window.__dakar.focus()?.id === i, id, { timeout: ms }).then(() => true, () => false);
  if (ok) { await t.tap('#act'); await page.waitForTimeout(900); }
  return ok;
}
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
/** How far beyond the touchline the player walks to leave the match (m): beyond the 6 m the match lets them stray. */
const LEAVE_TEST = 12;

/**
 * Plays the player's match with the thumbs until it ends (or `ms` of real time): the stick toward the ball, then, with the ball at the foot, toward
 * the goal attacked (the dribble carries it); within shooting range « Frappe » is held and released. Returns what the thumbs did.
 */
async function playMatch({ ms = 1500000, stopAfter = Infinity } = {}) {
  const j = await t.centre('#joy'), R = 46, t0 = Date.now(), did = { shots: 0, aims: 0 };
  let down = false, lastShot = 0;
  while (Date.now() - t0 < ms) {
    const s = await d(() => { const A = window.__dakar, m = A.match3(), f = A.football(); return { m, p: A.pos(), pitch: f.pitch, shotBtn: !!document.getElementById('kickShot')?.classList.contains('on') }; });
    if (!s.m.me || s.m.me.t > stopAfter) break;
    const dir = s.m.me.team === 0 ? 1 : -1, gx = s.pitch.x + dir * s.pitch.hx, gz = s.pitch.z;
    const atFoot = s.m.me.inReach, toGoal = Math.hypot(gx - s.p.x, gz - s.p.z);
    const tx = atFoot ? gx : s.m.ball.x, tz = atFoot ? gz : s.m.ball.z;
    const a = wrap(Math.atan2(tx - s.p.x, tz - s.p.z) - s.p.cam);
    if (!down) { await t.down(3, j.x, j.y); down = true; }
    await t.move(3, j.x - Math.sin(a) * R, j.y - Math.cos(a) * R, 1);
    did.aims++;
    if (atFoot && toGoal < 13 && s.shotBtn && Date.now() - lastShot > 1500) {
      const b = await t.centre('#kickShot'); await t.down(4, b.x, b.y); await page.waitForTimeout(550); await t.up(4);
      did.shots++; lastShot = Date.now();
    }
    await page.waitForTimeout(90);
  }
  if (down) await t.up(3);
  return did;
}

log('boot');
await page.goto(`${base}?debug&touch&heure=17.5`, { timeout: 180000 });
await ready();
let t = await realTouch(page);
await d(() => window.__dakar.teleport('corniche', -84, -3, 0));                       // (set-up: on the Corniche street north of the pitch, about 16 m from its grass)
await page.waitForFunction(() => window.__dakar.pos().hub === 'corniche' && window.__dakar.pos().mode === 'play', null, T);
await page.waitForTimeout(2000);
const P = (await d(() => window.__dakar.football())).pitch;
const c0 = await M();
check('a new save: no match played, nothing of the regulars remembered', c0 && Object.keys(c0.counters).length === 0, JSON.stringify(c0?.counters));

// ---------------------------------------------------------------- 1. arrive: the evening's match is on; the touchline; « Rejoindre le match »
log('to the pitch');
await walkTo(page, t, P.x - 6, P.z - P.hz - 2.5, { tol: 1, ms: 90000 });
await page.waitForFunction(() => window.__dakar.football().active, null, { timeout: 120000 }).catch(() => {});
const f1 = await d(() => window.__dakar.football()), m1 = await M();
check('the evening’s footballers are playing: two teams on the pitch, the ball moving; the regulars among them', f1.active && f1.teams[0] >= 2 && f1.teams[1] >= 2 && !!m1.regulars.babou && !!m1.regulars.khadim, JSON.stringify({ teams: f1.teams, regs: m1.regulars }));
await shot('touchline-match-on');
check('« Rejoindre le match » at the touchline', await act('football:join'));
const offer = await items(), m1b = await M();
check('the offer: play with a team, the short match’s rules; Babou introduces himself', offer.length === 2 && /^\W*Jouer/.test(offer[0].text) && /premier à 3 buts/.test(offer[0].text) && /Pas maintenant/.test(offer[1].text) && m1b.said.some(l => /Babou: .*Moi c’est Babou/.test(l)), JSON.stringify({ offer, said: m1b.said }));
await shot('join-offer');
await tapItem('^\\W*Jouer');
const j1 = await M();
check('in the match: the player on a team, 0–0, the regulars met (the save remembers them), a side of five kept to five', !!j1.me && j1.score[0] === 0 && j1.score[1] === 0 && j1.counters.ft_babou_met > 0 && j1.counters.ft_khadim_met > 0 && j1.teams[j1.me.team] <= 5, JSON.stringify({ me: j1.me, teams: j1.teams, c: j1.counters }));

// ---------------------------------------------------------------- 2. play the match to its end
log('match 1');
const did1 = await playMatch();
await page.waitForTimeout(1500);
await shot('match1-result');
const r1 = await M();
const card1 = r1.cards[0];
check('the match ran to its end (first to 3, or four minutes): the result recorded once', r1.finished === 1 && r1.results.length === 1 && r1.counters.ft_matches === 1 && r1.counters.ft_match_recorded === 1, JSON.stringify({ results: r1.results, c: r1.counters, did: did1 }));
check('the player played: touches of the ball, shots with « Frappe »', (r1.mine?.length ?? 0) > 0 || (card1 && /Tes tirs: [1-9]/.test(card1.rows.join(' '))), JSON.stringify({ mine: r1.mine, card: card1 }));
check('the result card: Victoire / Défaite / Match nul with the score, the player’s goals, passes and shots, their record', !!card1 && /^(Victoire|Défaite|Match nul) \d–\d$/.test(card1.title) && card1.rows.some(r => /^Tes buts: \d/.test(r)) && card1.rows.some(r => /^Tes matchs: 1 joué/.test(r)), JSON.stringify(card1));
check('the regulars say something about the match (Babou, Khadim)', r1.said.some(l => /^Babou: /.test(l) && /(Bien joué|Égalité|prochaine fois)/.test(l)) && r1.said.some(l => /^Khadim: /.test(l)), JSON.stringify(r1.said.slice(-3)));
const end1 = await items();
check('the end sheet: « Rejouer », « L’ataya avec Babou », « Partir »', end1.some(i => /^\W*Rejouer/.test(i.text)) && end1.some(i => /ataya avec Babou/.test(i.text)) && end1.some(i => /^\W*Partir/.test(i.text)), JSON.stringify(end1));
check('no money moved', (await d(() => window.__dakar.state.data.ledger.length)) === 0);

// ---------------------------------------------------------------- 3. « Rejouer »: a second match to its end, then the ataya with Babou
log('rematch');
await tapItem('^\\W*Rejouer');
const j2 = await M();
check('« Rejouer »: a new match at once, 0–0', !!j2.me && j2.joined === 2 && j2.score[0] === 0 && j2.score[1] === 0, JSON.stringify({ me: j2.me, score: j2.score }));
const did2 = await playMatch();
await page.waitForTimeout(1500);
const r2 = await M();
check('the second match recorded as a second match (two in all, no double count)', r2.finished === 2 && r2.counters.ft_matches === 2 && r2.counters.ft_match_recorded === 2, JSON.stringify({ c: r2.counters, did: did2 }));
await shot('match2-result');
await tapItem('ataya avec Babou');
await page.waitForFunction(() => { const m = window.__dakar.match3(); return m.bench && m.regulars.babou?.bench; }, null, { timeout: 15000 }).catch(() => {});
const spot = (await M()).benchAt;
if (spot) await walkTo(page, t, spot.x + 1.2, spot.z - 0.6, { tol: 0.9, ms: 60000 });   // to the touchline where he waits
await page.waitForFunction(s => { const o = window.__dakar.match3().regulars.babou; return o && Math.hypot(o.x - s.x, o.z - s.z) < 0.6; }, spot ?? { x: 0, z: 0 }, { timeout: 30000 }).catch(() => {});
const o = (await M()).regulars.babou, me = await d(() => window.__dakar.pos());
check('Babou comes off to the touchline on the street side, the player joins him there', !!o && o.bench && !!spot && Math.hypot(o.x - me.x, o.z - me.z) < 3, JSON.stringify({ o, spot, me: [me.x, me.z] }));
await shot('ataya-babou');
check('« L’ataya avec Babou »', await act('football:babou', 15000));
const a1 = await M();
check('the ataya: a glass at the touchline, the match told over; the save remembers it', a1.said.some(l => /ataya/.test(l)) && a1.counters.ft_ataya === 1, JSON.stringify({ said: a1.said.slice(-1), c: a1.counters }));
await page.waitForTimeout(8000);
check('Babou goes back on the pitch afterwards', !(await M()).bench);

// ---------------------------------------------------------------- 4. save, reload: the record kept, nothing twice; a later day: recognised
log('reload');
const before = (await M()).counters;
await d(() => window.__dakar.save?.());
await page.reload(); await ready(); t = await realTouch(page);
await page.waitForFunction(() => window.__dakar.pos().mode === 'play', null, T);
await page.waitForTimeout(2500);
const re = await M();
check('reloaded: the matches, goals, the regulars’ memory and the ataya are kept, nothing counted twice', ['ft_matches', 'ft_match_recorded', 'ft_goals', 'ft_babou_met', 'ft_khadim_met', 'ft_ataya', 'ft_last'].every(k => re.counters[k] === before[k]), JSON.stringify({ before, after: re.counters }));
check('the same day: no « te revoilà »', re.recognised === 0);
const day = await d(() => window.__dakar.nextDay(1));                                   // (debug shortcut, labelled: the later city day a journey cannot wait for)
await d(() => window.__dakar.setHour?.(17.5));
const p2 = await d(() => window.__dakar.pos());
if (Math.hypot(p2.x - P.x, p2.z - P.z) > 40) await d(([x, z]) => window.__dakar.place(x, z, Math.PI), [P.x - 6, P.z - P.hz - 18]);   // (set-up: back by the pitch if the reload put the player elsewhere)
await walkTo(page, t, P.x - 4, P.z - P.hz - 2.5, { tol: 1, ms: 90000 });
await page.waitForFunction(() => window.__dakar.match3().recognised > 0, null, { timeout: 60000 }).catch(() => {});
const rec = await M();
check('a later day at the pitch: Babou knows the player again (once), naming their last match', rec.recognised === 1 && rec.said.some(l => /^Babou: .*(buteur|Te revoilà)/.test(l)) && rec.counters.ft_babou_seen_day === day + 1, JSON.stringify({ said: rec.said.slice(-1), day, seen: rec.counters.ft_babou_seen_day }));
await shot('recognised');

// ---------------------------------------------------------------- 5. join again, walk off mid-match: nothing recorded, ordinary controls again
log('join and walk off');
await act('football:join');
await tapItem('^\\W*Jouer');
await playMatch({ ms: 30000, stopAfter: 12 });
const mid = await M();
await walkTo(page, t, P.x, P.z - P.hz - LEAVE_TEST, { tol: 1.5, ms: 60000 });
await page.waitForTimeout(1500);
const off = await M(), f5 = await d(() => window.__dakar.football());
check('walked off the pitch mid-match: the match goes on without the player, nothing recorded', !off.me && off.left >= 1 && off.counters.ft_matches === 2 && f5.active, JSON.stringify({ mid: mid.me, left: off.left, c: off.counters }));
const ctl = await d(() => ({ mode: window.__dakar.pos().mode, joy: !!document.querySelector('#joy'), shot: !!document.getElementById('kickShot')?.classList.contains('on') }));
check('the controls are the ordinary ones again: playing, the stick, no « Frappe » button', ctl.mode === 'play' && ctl.joy && !ctl.shot, JSON.stringify(ctl));
await shot('walked-off');

check('no page errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
console.log(`${total - failed}/${total} checks passed`);
await context.close(); await browser.close();
process.exit(failed ? 1 : 0);
