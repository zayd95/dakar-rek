// Lightweight production protocol smoke check; no game build or credentials needed.
// This checks networking, not rendered avatars, gameplay, load or phone FPS.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const base = new URL(process.env.DAKAR_GAME_URL || 'https://dakar-rek.habibjallow95.workers.dev/');
assert.ok(base.protocol === 'https:' || (base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname)), 'Use HTTPS or a local test server');
assert.ok(!base.username && !base.password && !base.search, 'Game URL must not contain credentials or query parameters');
const room = Number(process.env.DAKAR_OPS_ROOM || 128);
assert.ok(Number.isInteger(room) && room >= 1 && room <= 128, 'Invalid diagnostic room');
const reportPath = process.env.DAKAR_OPS_REPORT || 'shots/ops/latest.json';
const report = { source: base.origin, startedAt: new Date().toISOString(), kind: 'protocol-smoke', room, checks: [], build: null, ok: false };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const connections = new Set();

async function check(name, run) {
  const started = performance.now();
  try {
    await run();
    report.checks.push({ name, ok: true, durationMs: Math.round(performance.now() - started) });
    console.log(`PASS: ${name}`);
  } catch (error) {
    report.checks.push({ name, ok: false, error: error.message, durationMs: Math.round(performance.now() - started) });
    console.error(`FAIL: ${name}: ${error.message}`);
    throw error;
  }
}

async function json(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  assert.ok(response.ok, `HTTP ${response.status}`);
  return response.json();
}

async function retryHTTP(run) {
  try { return await run(); }
  catch { await sleep(2000); return run(); }
}

class Connection {
  constructor(hub) {
    const url = new URL('/api/presence', base);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.search = new URLSearchParams({ hub, room: String(room), name: 'Diagnostic reseau', look: '0' }).toString();
    this.messages = [];
    this.failure = null;
    this.closed = null;
    this.ws = new WebSocket(url);
    connections.add(this);
    this.ws.addEventListener('message', event => {
      try { this.messages.push(JSON.parse(event.data)); }
      catch { this.failure = new Error('Invalid JSON from presence server'); }
    });
    this.ws.addEventListener('error', () => { this.failure = new Error('WebSocket transport error'); });
    this.ws.addEventListener('close', event => { this.closed = event.code; });
  }
  async wait(predicate, label, timeout = 15000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const match = this.messages.find(predicate);
      if (match) return match;
      if (this.failure) throw this.failure;
      if (this.closed !== null) throw new Error(`WebSocket closed (${this.closed}) before ${label}`);
      await sleep(30);
    }
    throw new Error(`Timeout: ${label}`);
  }
  async ready(hub) {
    const welcome = await this.wait(message => message.type === 'welcome', 'welcome');
    assert.equal(welcome.version, 1, 'Protocol version');
    assert.equal(welcome.hub, hub);
    assert.equal(welcome.room, room, 'Diagnostic invitation room');
    assert.ok(typeof welcome.id === 'string' && welcome.id.length > 0);
    this.id = welcome.id;
  }
  move(clip = 'Walk', x = -4) {
    this.ws.send(JSON.stringify({ type: 'move', x, y: 0, z: -30, yaw: 0, speed: 1, space: 'street', clip }));
  }
  async close() {
    if (this.ws.readyState < WebSocket.CLOSING) this.ws.close();
    const deadline = Date.now() + 3000;
    while (this.ws.readyState !== WebSocket.CLOSED && Date.now() < deadline) await sleep(20);
    connections.delete(this);
  }
}

try {
  await check('game HTML is available', () => retryHTTP(async () => {
    const response = await fetch(base, { signal: AbortSignal.timeout(15000) });
    assert.ok(response.ok, `HTTP ${response.status}`);
    assert.ok(response.headers.get('content-type')?.includes('text/html'), 'Expected HTML');
    const html = await response.text();
    assert.match(html, /<script\b[^>]*\btype=["']module["']/i, 'Expected built game module');
  }));
  await check('health protocol and room capacity', () => retryHTTP(async () => {
    const health = await json(new URL('/api/health', base));
    assert.equal(health.ok, true);
    assert.equal(health.protocol, 1);
    assert.equal(health.roomCapacity, 24);
  }));

  for (const hub of ['pikine', 'plateau', 'corniche', 'almadies']) {
    let a, b, reconnect;
    try {
      await check(`two clients and movement: ${hub}`, async () => {
        a = new Connection(hub); await a.ready(hub);
        b = new Connection(hub); await b.ready(hub);
        assert.notEqual(a.id, b.id);
        a.move(); b.move('Idle', -3);
        const peer = await b.wait(message => message.type === 'peer' && message.peer.id === a.id && message.peer.x === -4 && message.peer.clip === 'Walk', 'peer movement');
        assert.equal(peer.peer.x, -4);
        assert.equal(peer.peer.clip, 'Walk');
        await a.wait(message => message.type === 'peer' && message.peer.id === b.id && message.peer.x === -3 && message.peer.clip === 'Idle', 'return movement');
      });
      if (hub === 'pikine') {
        await check('emote replicated', async () => {
          a.move('Dance_A');
          await b.wait(message => message.type === 'peer' && message.peer.id === a.id && message.peer.clip === 'Dance_A', 'emote');
        });
        await check('disconnect and rejoin remove old presence', async () => {
          const oldId = a.id;
          await a.close();
          await b.wait(message => message.type === 'leave' && message.id === oldId, 'old peer leaves');
          reconnect = new Connection(hub); await reconnect.ready(hub);
          assert.notEqual(reconnect.id, oldId);
          reconnect.move('Walk', -2);
          await b.wait(message => message.type === 'peer' && message.peer.id === reconnect.id && message.peer.x === -2, 'reconnected peer');
          await reconnect.close();
        });
        await check('malformed movement is rejected', async () => {
          b.ws.send(JSON.stringify({ type: 'move', x: 'NaN' }));
          const deadline = Date.now() + 15000;
          while (b.closed === null && Date.now() < deadline) await sleep(30);
          assert.equal(b.closed, 1008, 'Expected invalid message close');
        });
      }
    } finally {
      await reconnect?.close(); await a?.close(); await b?.close();
    }
  }

  // Optional authenticated GitHub read; never prints the credential.
  if (process.env.GITHUB_TOKEN) {
    await check('latest production branch Cloudflare build', async () => {
      const repository = process.env.GITHUB_REPOSITORY || 'zayd95/dakar-rek';
      const branch = process.env.DAKAR_PRODUCTION_BRANCH || 'codex/launch-controls';
      const headers = { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' };
      const commit = await json(`https://api.github.com/repos/${repository}/commits/${encodeURIComponent(branch)}`, headers);
      const runs = await json(`https://api.github.com/repos/${repository}/commits/${commit.sha}/check-runs`, headers);
      const builds = runs.check_runs.filter(run => run.name === 'Workers Builds: dakar-rek').sort((a, b) => b.id - a.id);
      const latest = builds[0];
      report.build = { branch, commit: commit.sha, status: latest?.status || 'not-reported', conclusion: latest?.conclusion || null, url: latest?.details_url || null };
      // A pending/missing build does not prove the currently live game is down.
      if (latest?.status === 'completed') assert.ok(['success', 'neutral', 'skipped'].includes(latest.conclusion), `Latest Cloudflare build: ${latest.conclusion}`);
    });
  }
  report.ok = true;
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  for (const connection of connections) await connection.close();
  report.completedAt = new Date().toISOString();
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`Result: ${report.ok ? 'PASS' : 'FAIL'}; ${report.checks.filter(check => check.ok).length}/${report.checks.length} checks. Report: ${reportPath}`);
}
