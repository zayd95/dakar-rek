// Uses an already installed Playwright runtime, never downloads a browser/package.
// node scripts/check-viewer.mjs /absolute/path/to/playwright http://127.0.0.1:5178/
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2]);
const url = process.argv[3] || 'http://127.0.0.1:5178/';
const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../evidence');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: [
  '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'
] });
const checks = [];
const errors = [];
const warnings = [];
const record = (name, detail = {}) => checks.push({ name, passed: true, ...detail });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
    if (message.type() === 'warning') warnings.push(message.text());
  });
  const response = await page.goto(url);
  assert.equal(response.status(), 200);
  await page.waitForFunction(() => window.__rdaStudy?.().loaded, { timeout: 30000 });
  const state = () => page.evaluate(() => window.__rdaStudy());
  assert.equal((await state()).visibleStudies, 2);
  assert.equal((await state()).garmentCount, 2);
  assert.deepEqual((await state()).studyMorphs, [[1, 0], [0, 1]]);
  record('Two separately morphed, clothed anatomical studies load', await state());
  await page.screenshot({ path: path.join(output, 'desktop-comparison.png'), fullPage: true });
  for (const [label, expected] of [['Face', 'front'], ['Profil', 'side'], ['Dos', 'back'], ['¾', 'quarter']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    assert.equal((await state()).view, expected);
    assert.equal(await page.getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed'), 'true');
    record(`View: ${expected}`);
    await page.screenshot({ path: path.join(output, `comparison-${expected}.png`) });
  }
  await page.locator('[data-profile="athletic"]').click();
  assert.equal((await state()).selected, 'athletic');
  assert.equal((await state()).visibleStudies, 1);
  record('Athletic individual selection');
  await page.locator('[data-profile="heavy"]').click();
  assert.equal((await state()).selected, 'heavy');
  assert.equal((await state()).visibleStudies, 1);
  record('Heavy individual selection');
  await page.getByRole('button', { name: 'Comparer les deux' }).click();
  assert.equal((await state()).visibleStudies, 2);
  record('Return to comparison');
  await page.getByRole('button', { name: 'Anatomie', exact: true }).click();
  assert.equal(await page.locator('[data-pose="anatomy"]').getAttribute('aria-pressed'), 'true');
  await page.screenshot({ path: path.join(output, 'anatomy-pose.png') });
  await page.getByRole('button', { name: 'Au repos', exact: true }).click();
  record('Anatomy and resting pose controls');
  await page.getByLabel('Volume en argile').check();
  await page.screenshot({ path: path.join(output, 'clay-comparison.png') });
  await page.getByLabel('Volume en argile').uncheck();
  await page.getByLabel('Voir le maillage').check();
  await page.screenshot({ path: path.join(output, 'wireframe.png') });
  await page.getByLabel('Voir le maillage').uncheck();
  record('Clay and wireframe switches');
  await page.locator('#rotate').click();
  const beforeRotation = (await state()).camera;
  await page.waitForFunction(before => Math.abs(window.__rdaStudy().camera[0] - before[0]) > .05, beforeRotation);
  await page.locator('#rotate').click();
  assert.equal((await state()).rotating, false);
  record('Rotation starts and stops');
  await page.locator('#stage').focus();
  const beforeArrow = (await state()).camera;
  await page.keyboard.press('ArrowLeft');
  assert.notDeepEqual((await state()).camera, beforeArrow);
  await page.keyboard.press('Home');
  const beforeZoom = (await state()).camera;
  await page.keyboard.press('+');
  assert.notDeepEqual((await state()).camera, beforeZoom);
  record('Focused-stage keyboard orbit, zoom and reset');
  await page.getByRole('button', { name: 'Recentrer la vue' }).click();
  const canvas = await page.locator('canvas').boundingBox();
  const beforeDrag = (await state()).camera;
  await page.mouse.move(canvas.x + canvas.width * .5, canvas.y + canvas.height * .5);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * .7, canvas.y + canvas.height * .5, { steps: 10 });
  await page.mouse.up();
  assert.notDeepEqual((await state()).camera, beforeDrag);
  record('Pointer orbit');
  await page.getByRole('button', { name: 'Face', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector('canvas').clientWidth < 400);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(output, 'phone-layout.png'), fullPage: true });
  record('390×844 viewport fits without horizontal overflow', { deviceTest: false });
  await page.locator('[data-profile="heavy"]').click();
  await page.getByRole('button', { name: 'Profil', exact: true }).click();
  assert.equal((await state()).visibleStudies, 1);
  assert.equal((await state()).view, 'side');
  record('Narrow viewport individual profile controls');
  assert.equal(errors.length, 0, errors.join('\n'));
  record('No normal-path browser errors');
  await context.close();

  const failed = await browser.newContext();
  const failedPage = await failed.newPage();
  await failedPage.route('**/anatomy-study.glb', route => route.abort());
  await failedPage.goto(url);
  await failedPage.getByRole('button', { name: 'Réessayer', exact: true }).waitFor();
  assert.match(await failedPage.locator('#status').innerText(), /chargés/);
  record('Missing model yields actionable retry');
  await failed.close();

  const noGL = await browser.newContext();
  await noGL.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (String(type).includes('webgl')) return null;
      return original.call(this, type, ...args);
    };
  });
  const noGLPage = await noGL.newPage();
  await noGLPage.goto(url);
  await noGLPage.getByRole('button', { name: 'Réessayer', exact: true }).waitFor();
  assert.match(await noGLPage.locator('#status').innerText(), /WebGL/);
  record('Unavailable WebGL yields actionable retry');
  await noGL.close();
  const report = { url, timestamp: new Date().toISOString(), browser: await browser.version(),
    rendering: 'Headless desktop Chrome, SwiftShader; not representative hardware performance',
    checks, errors, warnings, visualGate: 'Awaiting human review', culturalStatus: 'unverified' };
  await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: checks.length, errors, warnings, output }, null, 2));
} finally {
  await browser.close();
}
