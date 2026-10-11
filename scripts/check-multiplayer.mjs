// Runs real Workers/Durable Objects locally and checks two browsers + room overflow.
// Usage: npm run check:online [-- http://existing-worker-url/]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const checks = [];
function check(name, ok, detail = '') { checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`, detail); assert.ok(ok, name); }
let base = process.argv[2], worker, logs = '';
let browser;
const sockets = [], contexts = [];
try {
  if (!base) {
    const portServer = net.createServer(); await new Promise(r => portServer.listen(0, '127.0.0.1', r));
    const port = portServer.address().port; await new Promise(r => portServer.close(r));
    base = `http://127.0.0.1:${port}/`;
    worker = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port)], { env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [worker.stdout, worker.stderr]) stream.on('data', b => { logs = (logs + b).slice(-12000); });
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (worker.exitCode !== null) throw new Error(`Worker exited: ${logs}`);
      try { if ((await fetch(new URL('/api/health', base))).ok) break; } catch { /* starting */ }
      await sleep(250);
    }
  }
  const health = await (await fetch(new URL('/api/health', base))).json();
  check('worker health and protocol', health.ok && health.protocol === 1 && health.roomCapacity === 24);
  browser = await chromium.launch({
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(process.env.DAKAR_BROWSER_PROXY ? { proxy: { server: process.env.DAKAR_BROWSER_PROXY } } : {}),
  });
  const pageErrors = [];
  for (const [i, viewport] of [[0, { width: 390, height: 844 }], [1, { width: 1280, height: 720 }]]) {
    const ctx = await browser.newContext({ viewport, hasTouch: i === 0, isMobile: i === 0,
      ignoreHTTPSErrors: process.env.DAKAR_TEST_PROXY_TLS === 'true',
    }); contexts.push(ctx);
    await ctx.addInitScript(i => { localStorage.setItem('dakarrek.quality', 'low'); localStorage.setItem('dakarrek.presence.profile', JSON.stringify({ name: i ? 'Awa' : 'Moussa', look: i ? 1 : 0 })); }, i);
    const page = await ctx.newPage(); page.on('pageerror', e => pageErrors.push(e.message));
    const t0 = Date.now();
    await page.goto(`${base}?debug${i === 0 ? '&touch' : ''}`);
    // The second page boots while the first one renders on the same CPU (software WebGL): on a 2-core runner its world
    // build alone took 39 s. Booting is not what is checked here, so it gets room; the time is logged to watch it.
    await page.waitForFunction(() => window.__dakar?.presence().status === 'online', null, { timeout: 120000 });
    console.log(`page ${i} online after ${Date.now() - t0} ms`);
  }
  const [a, b] = contexts.map(c => c.pages()[0]);
  await a.waitForFunction(() => window.__dakar.presence().peers.length === 1);
  await b.waitForFunction(() => window.__dakar.presence().peers.length === 1);
  check('two independent clients see each other', (await a.evaluate(() => window.__dakar.presence().count)) === 2 && (await b.evaluate(() => window.__dakar.presence().count)) === 2);
  await a.waitForFunction(() => window.__dakar.presence().visible === 1);
  check('remote avatar rendered on phone', (await a.evaluate(() => window.__dakar.presence().visible)) === 1);
  await a.evaluate(() => window.__dakar.place(-4, -30, 0));
  await b.waitForFunction(() => window.__dakar.presence().peers.some(p => p.name === 'Moussa' && Math.abs(p.x + 4) < 0.2 && Math.abs(p.z + 30) < 0.2));
  check('movement replicated', true);
  // who supports whom (src/arena/supporters.ts): A wears the Baobab scarf, B sees it on A's avatar (presence `fan` only)
  {
    const idA = await a.evaluate(() => window.__dakar.presence().id);
    await a.evaluate(() => window.__dakar.supportersWear('echarpe_baobab'));
    const fanSeen = await b.waitForFunction(id => { const p = window.__dakar.presence(), peer = p.peers.find(x => x.id === id); return peer?.fan?.e === 'baobab' && peer.fan.k === 'scarf' && p.gear?.[id] === 'baobab:scarf'; }, idA, { timeout: 30000 }).then(() => true).catch(() => false);
    const seen = await b.evaluate(id => { const p = window.__dakar.presence(); return { fan: p.peers.find(x => x.id === id)?.fan ?? null, keys: Object.keys(p.peers.find(x => x.id === id) ?? {}), gear: p.gear }; }, idA);
    check('écurie colours: B sees the Baobab scarf A wears (presence fan, on the avatar), and no price or inventory with it', fanSeen && !seen.keys.some(k => /price|wallet|owned|inventory|assets/.test(k)), JSON.stringify(seen));
  }
  await a.click('#presenceBtn'); await a.fill('#presenceName', 'Mame Moussa');
  check('typing a name keeps the menu open', await a.locator('#modal.on').count() === 1);
  await a.getByRole('button', { name: 'Enregistrer mon profil', exact: true }).click();
  await b.waitForFunction(() => window.__dakar.presence().peers.some(p => p.name === 'Mame Moussa'));
  check('profile update reconnects without a duplicate player', (await b.evaluate(() => window.__dakar.presence().peers.length)) === 1);
  await a.evaluate(() => window.__dakar.emote(0));
  await b.waitForFunction(() => window.__dakar.presence().peers.some(p => p.clip === 'Dance_A'));
  check('emote pose shared with the second player', true);
  await a.evaluate(() => window.__dakar.enter('home'));
  await a.waitForFunction(() => window.__dakar.pos().x > 900);
  await b.waitForFunction(() => window.__dakar.presence().visible === 0);
  check('personal home hides the guest avatar from the street', true);
  await a.evaluate(() => window.__dakar.exit());
  await b.waitForFunction(() => window.__dakar.presence().visible === 1);
  for (const page of [a, b]) { await page.evaluate(() => window.__dakar.enter('maiga')); await page.waitForFunction(() => window.__dakar.pos().x > 900); }
  await a.waitForFunction(() => window.__dakar.presence().visible === 1);
  check('public Maiga interior is shared', true);
  for (const page of [a, b]) { await page.evaluate(() => window.__dakar.exit()); await page.waitForFunction(() => window.__dakar.pos().x < 900); }
  for (const hub of ['plateau', 'corniche', 'almadies', 'pikine']) {
    await a.evaluate(hub => window.__dakar.teleport(hub), hub);
    if (hub !== 'pikine') await b.waitForFunction(() => window.__dakar.presence().peers.length === 0);
    await b.evaluate(hub => window.__dakar.teleport(hub), hub);
    await a.waitForFunction(() => window.__dakar.presence().peers.length === 1);
    await b.waitForFunction(() => window.__dakar.presence().peers.length === 1);
    check(`hub membership follows travel: ${hub}`, (await a.evaluate(() => window.__dakar.pos().hub)) === hub);
  }
  const before = await a.evaluate(() => ({ id: window.__dakar.presence().id, wallet: window.__dakar.state.wallet }));
  await contexts[0].setOffline(true);
  await a.waitForFunction(() => window.__dakar.presence().status === 'offline');
  await contexts[0].setOffline(false);
  await a.waitForFunction(() => window.__dakar.presence().status === 'online');
  await b.waitForFunction(() => window.__dakar.presence().peers.length === 1);
  check('network reconnect keeps local money and no duplicate peer', (await a.evaluate(() => window.__dakar.state.wallet)) === before.wallet);
  await a.evaluate(() => { window.__dakar.setHour(16); window.__dakar.place(-6, -30, 0); });
  await b.evaluate(() => { window.__dakar.setHour(16); window.__dakar.place(-3, -26, Math.PI); });
  await a.waitForFunction(() => window.__dakar.presence().peers.some(p => Math.abs(p.x + 3) < 0.2 && Math.abs(p.z + 26) < 0.2));
  await sleep(500);
  await fs.mkdir('shots/multiplayer', { recursive: true });
  await a.screenshot({ path: 'shots/multiplayer/phone-online.png' }); await b.screenshot({ path: 'shots/multiplayer/desktop-online.png' });
  // friends at the arena (src/arena/together.ts): two players seated in the stands see each other seated, one cheers,
  // and they watch one bout — the one who sat down later joins the show of the one already there, phase and second
  {
    const ids = { a: await a.evaluate(() => window.__dakar.presence().id), b: await b.evaluate(() => window.__dakar.presence().id) };
    const day = await a.evaluate(() => window.__dakar.arena.info()?.day);
    for (const page of [a, b]) await page.evaluate(d => { const D = window.__dakar; D.setHour(18); D.state.data.counters.arena_ticket_day = d; D.arena.speed(4); }, day);
    const centre = await a.evaluate(() => window.__dakar.arena.info().centre);
    const sitNear = (page, x, z) => page.evaluate(([x, z]) => { const D = window.__dakar, s = D.arena.freeSeat(x, z); return s && D.sit(s.id) === s.id ? s : null; }, [x, z]);
    const seatA = await sitNear(a, centre.x + 15.5, centre.z + 6);
    check('arena: the first player takes a place in the stands', !!seatA, JSON.stringify(seatA));
    // the second one sits down later, once the first one's show is clearly ahead (past the stands filling, a couple of
    // seconds into the preliminaries or further): the later one must join the earlier one's show, never by chance
    const ahead = await a.waitForFunction(() => { const i = window.__dakar.arena.info(); return ['prelims', 'entrance', 'bout', 'result', 'leaving'].includes(i.phase) && (i.phase !== 'prelims' || i.prelims.i > 0 || i.t >= 2); }, null, { timeout: 120000 }).then(() => true).catch(() => false);
    const aheadAt = await a.evaluate(() => { const i = window.__dakar.arena.info(); return [i.phase, i.prelims.i, i.t]; });
    // the second one sees the first seated there (their place held on this device too), then sits beside them
    const heldOnB = await b.waitForFunction(([id, seat]) => window.__dakar.together().held[seat] === id, [ids.a, seatA.id], { timeout: 60000 }).then(() => true).catch(() => false);
    const seatB = await sitNear(b, seatA.x + 0.4, seatA.z - 0.4);
    check('arena: the second player sees that place taken and sits beside them', heldOnB && !!seatB && seatB.id !== seatA.id, JSON.stringify({ heldOnB, seatB }));
    const seen = async (page, id, clip) => page.waitForFunction(([id, clip]) => { const p = window.__dakar.presence(); return p.peers.some(x => x.id === id && x.clip === clip) && p.poses[id] === clip; }, [id, clip], { timeout: 60000 }).then(() => true).catch(() => false);
    const both = [await seen(a, ids.b, 'Sit'), await seen(b, ids.a, 'Sit')];
    const ys = await b.evaluate(id => window.__dakar.presence().peers.find(x => x.id === id)?.y, ids.a);
    check('arena: each sees the other seated in the stands', both.every(Boolean) && Math.abs(ys - (seatA.top - 0.48)) < 0.05, JSON.stringify({ both, y: ys, top: seatA.top }));
    // one show: the later one (who sat down behind) joined the earlier one's show, and both are on the same phase, a
    // couple of seconds apart at most
    let same = null;
    for (const until = Date.now() + 180000; Date.now() < until && !same;) {
      const [ia, ib, tb] = [await a.evaluate(() => window.__dakar.arena.info()), await b.evaluate(() => window.__dakar.arena.info()), await b.evaluate(() => window.__dakar.together())];
      // the same phase, the same preliminary when it is one of them (src/arena/undercard.ts), a couple of seconds apart
      if (tb.follows >= 1 && ia.phase === ib.phase && ['prelims', 'entrance', 'bout', 'result', 'leaving'].includes(ia.phase) && (ia.phase !== 'prelims' || ia.prelims.i === ib.prelims.i) && Math.abs(ia.t - ib.t) < 3)
        same = { a: [ia.phase, ia.prelims.i, ia.t], b: [ib.phase, ib.prelims.i, ib.t] };
      else await sleep(400);
    }
    const followed = await b.evaluate(() => window.__dakar.together());
    check('arena: the later one joined the earlier one\'s show: same phase and time', ahead && !!same && followed.follows >= 1, JSON.stringify({ aheadAt, same, followed }));
    check('arena: a seated player cheers (stands up, arms up) and the other sees it', await a.evaluate(() => window.__dakar.cheer(5)) && await seen(b, ids.a, 'Celebrate'));
    // in the stands too, B sees A's colours; A wears Baobab's: in a Baobab section (B–C) the neighbours answered the cheer
    const sup = await a.evaluate(() => window.__dakar.supporters());
    const colours = await b.waitForFunction(id => window.__dakar.presence().gear?.[id] === 'baobab:scarf', ids.a, { timeout: 30000 }).then(() => true).catch(() => false);
    check('arena: B sees A\'s scarf in the stands; in Baobab\'s section « Encourager » made the neighbours answer', colours && (sup.sectionEcurie !== 'baobab' || sup.answered >= 1), JSON.stringify(sup));
    await b.screenshot({ path: 'shots/multiplayer/desktop-arena-together.png' });
    // on to the main event (the first one skips the rest of the preliminaries; the second one follows)
    await a.evaluate(() => { if (['filling', 'prelims'].includes(window.__dakar.arena.info().phase)) window.__dakar.arena.go('entrance'); });
    let result = null;
    for (const until = Date.now() + 240000; Date.now() < until && !result;) {
      const [ra, rb] = [await a.evaluate(() => window.__dakar.arena.info().result), await b.evaluate(() => window.__dakar.arena.info().result)];
      if (ra && ra === rb) result = ra; else await sleep(500);
    }
    check('arena: one result for both', !!result, result ?? '');
    for (const [page, x, z, yaw] of [[a, -6, -30, 0], [b, -3, -26, Math.PI]]) await page.evaluate(([x, z, yaw]) => { const D = window.__dakar; D.stand(); D.arena.speed(1); D.setHour(16); D.place(x, z, yaw); }, [x, z, yaw]);
    await a.waitForFunction(() => window.__dakar.presence().peers.some(p => Math.abs(p.x + 3) < 0.2 && Math.abs(p.z + 26) < 0.2));
  }
  // a friend who is tonight's main event themselves (src/arena/myGala.ts): their presence says so (arena.m = 1). A raw
  // client plays them here (their own device, on a gala evening, is check-arena-fighter.mjs): the player in the stands
  // sees their name on the card, their entrance and « Combat en cours », never a simulated ceremony or duel, their pose in
  // the ring and the real result they send; nothing of it is recorded here; the server refuses any other value for `m`.
  // Every step is reached through the show's own state (the debug API, the friend's presence), never by waiting on this
  // device's game clock: on a slow runner it runs far behind the real one (the frame's dt is capped at 0.1 s).
  {
    const info = () => b.evaluate(() => window.__dakar.arena.info());
    // a known state first: the evening before is closed (its result phase may still be running, the fête is long), then a
    // fresh evening, the next day, its doors open
    await b.evaluate(() => { const D = window.__dakar; D.stand(); if (!['idle', 'over'].includes(D.arena.info().phase)) D.arena.go('over'); });
    const closed = await b.waitForFunction(() => ['idle', 'over'].includes(window.__dakar.arena.info()?.phase), null, { timeout: 30000 }).then(() => true).catch(() => false);
    const day = (await info()).day + 1;
    await b.evaluate(d => { const D = window.__dakar; D.arena.day(d); D.setHour(18); D.state.data.counters.arena_ticket_day = d; D.arena.speed(1); }, day);
    const fresh = await b.waitForFunction(d => { const i = window.__dakar.arena.info(); return i.day === d && i.phase === 'idle' && i.street === 'doors' && !i.galaDone; }, day, { timeout: 30000 }).then(() => true).catch(() => false);
    await b.evaluate(() => {
      window.__toasts = []; const box = document.getElementById('toast');
      new MutationObserver(() => { for (const c of box.children) { const m = c.dataset?.msg; if (m && !window.__toasts.includes(m)) window.__toasts.push(m); } }).observe(box, { childList: true });
    });
    const centre = (await info()).centre;
    const seatM = await b.evaluate(([x, z]) => { const D = window.__dakar, s = D.arena.freeSeat(x, z); return s && D.sit(s.id) === s.id ? s : null; }, [centre.x + 15.5, centre.z + 6]);
    const running = await b.waitForFunction(() => ['filling', 'prelims'].includes(window.__dakar.arena.info()?.phase), null, { timeout: 60000 }).then(() => true).catch(() => false);
    const i0 = await info();
    check('arena, a friend\'s own gala: the evening before closed, a fresh one starts with the player seated', closed && fresh && !!seatM && running && i0.prelims.n >= 1,
      JSON.stringify({ closed, fresh, seat: seatM?.id, phase: i0.phase, day: i0.day, prelims: i0.prelims.n }));
    const REC = 'Adversaires réputés · 7-2 · Écurie Baobab';
    const ndiaga = await connect({ hub: 'pikine', name: 'Ndiaga', rec: REC });
    const nid = ndiaga.welcome.id;
    const send = (dx, dz, arena, clip = 'Idle') => ndiaga.ws.send(JSON.stringify({ type: 'move', x: centre.x + dx, y: 0.1, z: centre.z + dz, yaw: 0, speed: 0, space: 'street', clip, arena }));
    // in their corner inside the walls, their own show past its last preliminary: tonight's main event is them
    const last = i0.prelims.n - 1;
    send(6, 6, { d: day, p: 2, t: 120, i: last, m: 1 });
    const known = await b.waitForFunction(id => window.__dakar.together().main === id && window.__dakar.arena.info().remote?.name === 'Ndiaga', nid, { timeout: 30000 }).then(() => true).catch(() => false);
    const r0 = (await info()).remote;
    check('arena, a friend\'s own gala: their presence makes them tonight\'s main event here, with their public record line', known && r0?.rec === REC, JSON.stringify(r0));
    // this show joins theirs past the last preliminary, then waits for their entrance: the card names them, and the
    // show's own time goes on (a few more seconds) without its entrance starting
    const waiting = await b.waitForFunction(() => /Ndiaga, combat de la soirée/.test(window.__dakar.arena.info().card), null, { timeout: 60000 }).then(() => true).catch(() => false);
    const t0 = (await info()).t;
    const onward = await b.waitForFunction(t0 => window.__dakar.arena.info().t >= t0 + 3 || window.__dakar.arena.info().phase !== 'prelims', t0, { timeout: 60000 }).then(() => true).catch(() => false);
    const w1 = await info();
    check('arena, a friend\'s own gala: after the preliminaries the stands wait for their entrance (not this device\'s clock)', waiting && onward && w1.phase === 'prelims' && w1.prelims.i === last && w1.t >= t0 + 3,
      JSON.stringify({ phase: w1.phase, i: w1.prelims.i, t: [t0, w1.t], card: w1.card }));
    // their entrance, 40 s in (past the ceremony's own 33 s): the card and the announcer name them (with their public
    // line), nobody is drawn walking out for them, and this show does not go on to a bout by its clock
    send(4, 4, { d: day, p: 3, t: 40, m: 1 }, 'Walk');
    const entered = await b.waitForFunction(() => window.__dakar.arena.info().phase === 'entrance', null, { timeout: 30000 }).then(() => true).catch(() => false);
    const heard = await b.waitForFunction(rec => window.__toasts.some(t => t.includes(`voici Ndiaga ! (${rec})`)), REC, { timeout: 15000 }).then(() => true).catch(() => false);
    const [e1, toastsB] = [await info(), await b.evaluate(() => window.__toasts.slice())];
    check('arena, a friend\'s own gala: « Entrée de Ndiaga », the announcer calls them with their public line, no wrestler simulated, the card\'s people wait in their corners',
      entered && heard && /Entrée de Ndiaga/.test(e1.card) && !e1.ceremony && e1.entrance === 0 && e1.people?.quiet === true,
      JSON.stringify({ card: e1.card, ceremony: e1.ceremony, entrance: e1.entrance, quiet: e1.people?.quiet, toasts: toastsB.filter(t => /Ndiaga/.test(t)) }));
    const te = e1.t;
    await b.waitForFunction(te => window.__dakar.arena.info().t >= te + 2 || window.__dakar.arena.info().phase !== 'entrance', te, { timeout: 60000 }).catch(() => {});
    const e2 = await info();
    check('arena, a friend\'s own gala: past the ceremony\'s time their bout still waits for them (not this device\'s clock)', e2.phase === 'entrance' && e2.t >= 33, JSON.stringify({ phase: e2.phase, t: e2.t }));
    // their bout: in the ring in a fighting stance; the card says « Combat en cours : Ndiaga »; no duel is simulated here
    send(1.5, 0, { d: day, p: 4, t: 0, m: 1 }, 'Stance');
    const inBout = await b.waitForFunction(id => window.__dakar.arena.info().phase === 'bout' && window.__dakar.presence().peers.some(p => p.id === id && p.clip === 'Stance'), nid, { timeout: 30000 }).then(() => true).catch(() => false);
    const [b1, pb] = [await info(), await b.evaluate(id => { const p = window.__dakar.presence(); return { peer: p.peers.find(x => x.id === id), pose: p.poses[id] ?? null }; }, nid)];
    check('arena, a friend\'s own gala: « Combat en cours : Ndiaga », seen in the ring in a fighting stance, no duel simulated here',
      inBout && /Combat en cours : Ndiaga/.test(b1.card) && b1.bout === null && !!pb.peer && Math.hypot(pb.peer.x - centre.x, pb.peer.z - centre.z) < 3,
      JSON.stringify({ card: b1.card, bout: b1.bout, pose: pb.pose, at: pb.peer && [+(pb.peer.x - centre.x).toFixed(2), +(pb.peer.z - centre.z).toFixed(2)] }));
    await b.screenshot({ path: 'shots/multiplayer/desktop-friend-main-event.png' });
    // their real result, as they send it, once: told here, applauded by the whole crowd, recorded nowhere on this device
    const galas0 = await b.evaluate(() => window.__dakar.state.data.career?.galas?.length ?? 0);
    send(1.5, 0, { d: day, p: 5, t: 0, m: 1, w: 1, o: 0 }, 'Celebrate');
    const told = await b.waitForFunction(() => /Ndiaga l’emporte par chute/.test(window.__dakar.arena.info().result), null, { timeout: 30000 }).then(() => true).catch(() => false);
    const [r1, galas1] = [await info(), await b.evaluate(() => window.__dakar.state.data.career?.galas?.length ?? 0)];
    check('arena, a friend\'s own gala: their real result as they sent it (« Ndiaga l’emporte par chute ! »), nobody\'s corner here runs onto the sand, nothing recorded here',
      told && r1.people?.won === null && !r1.party && galas1 === galas0, JSON.stringify({ result: r1.result, phase: r1.phase, won: r1.people?.won, party: !!r1.party, galas: [galas0, galas1] }));
    // the field takes only the value 1: anything else closes the socket
    const refusedM = new Promise(resolve => ndiaga.ws.addEventListener('close', e => resolve(e.code), { once: true }));
    send(1.5, 0, { d: day, p: 5, t: 1, m: 2 });
    check('server refuses any other value for « tonight\'s main event » (arena.m = 2)', await refusedM === 1008);
    // back to the street, this evening closed too (a known state for what follows)
    await b.evaluate(() => { const D = window.__dakar; D.stand(); if (!['idle', 'over'].includes(D.arena.info().phase)) D.arena.go('over'); D.arena.day(null); D.arena.speed(1); D.setHour(16); D.place(-3, -26, Math.PI); });
    await a.waitForFunction(() => window.__dakar.presence().peers.some(p => Math.abs(p.x + 3) < 0.2 && Math.abs(p.z + 26) < 0.2));
  }
  function connect(params) {
    return new Promise((resolve, reject) => {
      const url = new URL('/api/presence', base); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.search = new URLSearchParams(params).toString();
      const ws = new WebSocket(url); sockets.push(ws);
      const timer = setTimeout(() => reject(new Error('WebSocket welcome timeout')), 10000);
      ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.type === 'welcome') { clearTimeout(timer); resolve({ ws, welcome: m }); } });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WebSocket error')); }, { once: true });
    });
  }
  // held poses travel: a player lying on a bed, sitting on a mat, kneeling or riding is drawn so; anything else is refused
  const fatou = await connect({ hub: 'pikine', name: 'Fatou' });
  for (const clip of ['Lie', 'SitFloor', 'Kneel', 'Ride']) {
    fatou.ws.send(JSON.stringify({ type: 'move', x: -4, y: 0.62, z: -24, yaw: 0, speed: 0, space: 'street', clip }));
    const seen = await b.waitForFunction(c => { const p = window.__dakar.presence(); return p.peers.some(x => x.name === 'Fatou' && x.clip === c) && Object.values(p.poses).includes(c); }, clip, { timeout: 30000 }).then(() => true).catch(() => false);
    check(`remote pose shown: ${clip}`, seen, JSON.stringify(await b.evaluate(() => window.__dakar.presence().poses)));
    if (clip === 'Lie') await b.screenshot({ path: 'shots/multiplayer/desktop-remote-lying.png' });
  }
  // a remote player's colours travel as two words (écurie, item); B draws them on the avatar
  fatou.ws.send(JSON.stringify({ type: 'move', x: -4, y: 0.1, z: -24, yaw: 0, speed: 0, space: 'street', clip: 'Idle', fan: { e: 'teranga', k: 'flag' } }));
  const flagSeen = await b.waitForFunction(() => { const p = window.__dakar.presence(), f = p.peers.find(x => x.name === 'Fatou'); return f?.fan?.e === 'teranga' && f.fan.k === 'flag' && p.gear?.[f.id] === 'teranga:flag'; }, null, { timeout: 30000 }).then(() => true).catch(() => false);
  check('remote colours shown: a Teranga flag in Fatou\'s hand', flagSeen, JSON.stringify(await b.evaluate(() => window.__dakar.presence().gear)));
  // anything else in that field (a price, what is owned) closes the socket
  const ibou = await connect({ hub: 'pikine', name: 'Ibou' });
  const priced = new Promise(resolve => ibou.ws.addEventListener('close', e => resolve(e.code), { once: true }));
  ibou.ws.send(JSON.stringify({ type: 'move', x: -5, y: 0.1, z: -24, yaw: 0, speed: 0, space: 'street', clip: 'Idle', fan: { e: 'baobab', k: 'scarf', price: 2000 } }));
  check('server refuses the colours field with a price in it', await priced === 1008);
  const refused = new Promise(resolve => fatou.ws.addEventListener('close', e => resolve(e.code), { once: true }));
  fatou.ws.send(JSON.stringify({ type: 'move', x: -4, y: 0.1, z: -24, yaw: 0, speed: 0, space: 'street', clip: 'Fall_Back' }));
  check('server refuses a pose outside the list', await refused === 1008);
  await b.waitForFunction(() => !window.__dakar.presence().peers.some(x => x.name === 'Fatou'), null, { timeout: 30000 }).catch(() => {});
  const joined = await Promise.all(Array.from({ length: 25 }, (_, i) => connect({ hub: 'pikine', name: `Guest ${i}` })));
  check('full room automatically opens another group', joined.some(s => s.welcome.room === 2) && joined.every(s => s.welcome.count <= 24));
  const invalid = joined.at(-1).ws;
  const closed = new Promise(resolve => invalid.addEventListener('close', e => resolve(e.code), { once: true }));
  invalid.send(JSON.stringify({ type: 'move', x: 'NaN', y: 0, z: 0, yaw: 0, speed: 0, space: 'street', clip: 'Idle' }));
  check('server rejects malformed positions', await closed === 1008);
  check('no browser page errors', pageErrors.length === 0, pageErrors.join(' | '));
  await fs.writeFile('shots/multiplayer/results.json', JSON.stringify(checks, null, 2));
} catch (error) { console.error(error); if (logs) console.error(logs); process.exitCode = 1; }
finally { for (const ws of sockets) ws.close(); for (const ctx of contexts) await ctx.close(); await browser?.close(); worker?.kill('SIGTERM'); }
