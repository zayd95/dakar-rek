// Dedicated local browser integration: actual LambDuel UI, Input and DuelInput.
// No external traffic, renderer/assets, server, gameplay rules or live site probes.
// node scripts/check-duel-input.mjs /tmp/dakar-duel-input-evidence
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve(process.argv[2] ?? '/tmp/dakar-duel-input-evidence');
fs.mkdirSync(out, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const address = server.httpServer.address();
const base = `http://127.0.0.1:${address.port}`;
const results = [];
let browser;
try {
  browser = await chromium.launch({ args: ['--no-sandbox'] });
  for (const [label, touch] of [['desktop', false], ['touch', true]]) {
    const ctx = await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 720 }, hasTouch: touch, isMobile: touch });
    await ctx.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div id="fixture">Duel input integration fixture</div></body></html>' });
      return route.continue();
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(base);
    await page.evaluate(async () => {
      const { LambDuel } = await import('/src/lamb/duel.ts');
      const { Input } = await import('/src/core/input.ts');
      const input = new Input(document.body);
      window.fixture = { input, create: () => {
        const duel = new LambDuel({ x: 0, z: 0 }, { ngembColor: 'rouge', ngembPattern: 'uni', accessories: [] }, input, 0);
        duel.update(2.01); duel.aiThink = 1000;
        window.fixture.duel = duel; return duel;
      } };
      window.fixture.create();
    });
    const check = async (name, fn, arg) => {
      const ok = await page.evaluate(fn, arg);
      results.push({ name: `${label}: ${name}`, ok });
      console.log(ok ? 'PASS' : 'FAIL', `${label}: ${name}`);
      if (!ok) throw new Error(`${label}: ${name}`);
    };
    await page.keyboard.down('KeyG');
    await check('fresh keyboard guard reaches fighter and visible button', () => {
      fixture.duel.update(0); return fixture.duel.me.guard && document.querySelector('[data-k=guard]').classList.contains('on');
    });
    await check('blur releases fighter, button and pending shared/touch grabs immediately', () => {
      fixture.duel.pressGrab(); fixture.input.actionPressed = true;
      window.dispatchEvent(new Event('blur'));
      fixture.duel.update(0);
      return !fixture.duel.me.guard && !document.querySelector('[data-k=guard]').classList.contains('on') && fixture.duel.me.stamina === 100;
    });
    await page.keyboard.up('KeyG'); await page.keyboard.down('KeyG');
    await check('fresh key works after blur', () => { fixture.duel.update(0); return fixture.duel.me.guard; });
    await page.keyboard.up('KeyG');
    await check('hidden resets without replay when visible again', () => {
      fixture.duel.setGuard(true); fixture.duel.pressGrab(); fixture.input.actionPressed = true;
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      fixture.duel.pressGrab(); fixture.duel.setGuard(true); fixture.duel.update(0);
      const clean = !fixture.duel.me.guard && fixture.duel.me.stamina === 100 && !document.querySelector('[data-k=guard]').classList.contains('on');
      delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); fixture.duel.update(0);
      return clean && fixture.duel.me.stamina === 100;
    });
    for (const type of ['pointercancel', 'lostpointercapture']) {
      await check(`${type} resets guard style and pending grab`, type => {
        const guard = document.querySelector('[data-k=guard]'), grab = document.querySelector('[data-k=grab]');
        guard.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, button: 0, bubbles: true }));
        grab.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 8, button: 0, bubbles: true }));
        fixture.input.actionPressed = true;
        guard.dispatchEvent(new PointerEvent(type, { pointerId: 7, bubbles: true }));
        fixture.duel.update(0);
        return !fixture.duel.me.guard && !guard.classList.contains('on') && fixture.duel.me.stamina === 100;
      }, type);
    }
    for (const kind of ['input', 'textarea', 'select', 'editable', 'editable-descendant']) {
      await page.evaluate(kind => {
        const el = document.createElement(kind === 'editable' || kind === 'editable-descendant' ? 'div' : kind);
        if (kind.startsWith('editable')) el.setAttribute('contenteditable', '');
        if (kind === 'editable-descendant') el.appendChild(document.createElement('span')).textContent = 'editable child';
        el.id = 'form-fixture'; document.body.appendChild(el); el.focus();
      }, kind);
      await page.keyboard.press('KeyG'); await page.keyboard.press('KeyE'); await page.keyboard.press('Space');
      await check(`${kind} cannot trigger guard or shared grab`, () => {
        const el = document.querySelector('#form-fixture');
        (el.firstElementChild ?? el).dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true }));
        fixture.duel.update(0);
        return !fixture.duel.me.guard && fixture.duel.me.stamina === 100 && !document.querySelector('[data-k=guard]').classList.contains('on');
      });
      await page.evaluate(() => document.querySelector('#form-fixture').remove());
    }
    const grab = page.locator('[data-k=grab]');
    if (touch) await grab.tap(); else await grab.click();
    await check('fresh real button press consumes exactly one grab after interruptions', () => {
      fixture.duel.update(0); const spent = fixture.duel.me.stamina === 78;
      fixture.duel.me.busy = 0; fixture.duel.update(0); return spent && fixture.duel.me.stamina === 78;
    });
    await check('dispose detaches UI and old controls, replacement receives one grab', () => {
      const old = fixture.duel, oldGuard = document.querySelector('[data-k=guard]'), oldGrab = document.querySelector('[data-k=grab]');
      old.dispose(); old.dispose(); fixture.create();
      oldGuard.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 4, button: 0 }));
      oldGrab.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 5, button: 0 }));
      document.querySelector('[data-k=grab]').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 6, button: 0 }));
      fixture.duel.update(0);
      return !old.controls.guardHeld && !oldGuard.classList.contains('on') && document.querySelectorAll('.duel-ui').length === 1 && fixture.duel.me.stamina === 78;
    });
    await page.screenshot({ path: path.join(out, `${label}-duel-input-fixture.png`) });
    results.push({ name: `${label}: no browser runtime errors`, ok: errors.length === 0 });
    console.log(errors.length ? 'FAIL' : 'PASS', `${label}: no browser runtime errors`);
    if (errors.length) throw new Error(errors.join('\n'));
    await page.evaluate(() => fixture.duel.dispose());
    await ctx.close();
  }
} finally {
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, limitation: 'Local UI/source-module fixture, synthetic blur/hidden/cancel events; no full-game rendering, physical device or CI claim.' }, null, 2));
  await browser?.close(); await server.close();
}
console.log(`${results.filter(r => r.ok).length}/${results.length} browser checks PASS`);
