// Local source/asset playback with real Three.js, not a production probe.
// Start npm run dev on 127.0.0.1:5173 first, then run this check.
import { chromium } from 'playwright';
const url = new URL(process.argv[2] ?? 'http://127.0.0.1:5173/');
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Localhost only');
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const context = await browser.newContext({ viewport: { width: 960, height: 640 } });
  await context.route('**/*', route => new URL(route.request().url()).origin === url.origin ? route.continue() : route.abort());
  await context.routeWebSocket('**/*', ws => ws.close());
  const page = await context.newPage();
  // Replace only the HTML response; real source modules and GLB remain served by Vite.
  await context.route(url.href, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
  await page.goto(url.href);
  const results = await page.evaluate(async () => {
    const { preloadHumanoid, humanoidReady } = await import('/src/actors/humanoid.ts');
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { LambDuel } = await import('/src/lamb/duel.ts');
    await preloadHumanoid('/');
    if (!humanoidReady()) throw new Error('Existing exported GLB did not load');
    const renderer = new THREE.WebGLRenderer(); renderer.setSize(960, 640); document.body.append(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x334455);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 3));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshLambertMaterial({ color: 0xd5bb88 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const camera = new THREE.PerspectiveCamera(50, 1.5, 0.1, 100);
    const outcomes = [];
    for (const winner of ['player', 'opponent']) {
      const input = { enabled: false, takeAction: () => false, move: () => ({ x: 0, y: 0 }) };
      const duel = new LambDuel({ x: 0, z: 0 }, { ngembColor: 'blanc', ngembPattern: 'uni', accessories: [] }, input, 0);
      scene.add(duel.group);
      // Fixture the clinch effort, then let the real update compute its outcome.
      duel.phase = 'clinch'; duel.phaseT = 2.19;
      duel.me.effort = winner === 'player' ? 100 : 0;
      duel.ai.effort = winner === 'opponent' ? 100 : 0;
      duel.update(0.02);
      if (duel.winner !== winner || duel.phase !== 'fall') throw new Error(`Wrong fixture outcome ${winner}`);
      const loser = winner === 'player' ? duel.ai.w : duel.me.w;
      const victor = winner === 'player' ? duel.me.w : duel.ai.w;
      if (!loser || !victor) throw new Error('Missing wrestler model');
      const root = loser.group.getObjectByName('root');
      if (!root) throw new Error('Missing exported root');
      const samples = [];
      for (let i = 0; i < 44; i++) {
        const view = duel.update(0.1); camera.position.copy(view.cam); camera.lookAt(view.look); renderer.render(scene, camera);
        if ([6, 12, 24, 42].includes(i)) samples.push({ time: (i + 1) / 10, phase: duel.phase, root: root.position.toArray(), fallTime: loser.current.time, paused: loser.current.paused });
      }
      for (const s of samples) {
        if (Math.abs(s.fallTime - 0.6) > 1e-6 || !s.paused) throw new Error('Fall did not clamp: ' + JSON.stringify(s));
        if (Math.hypot(...s.root.map((v, i) => v - samples[0].root[i])) > 1e-6) throw new Error('Final pose drift');
      }
      if (victor.current.loop !== THREE.LoopRepeat || victor.clipName !== 'Celebrate') throw new Error('Victory loop changed');
      outcomes.push({ winner, samples, rendererCalls: renderer.info.render.calls });
      duel.dispose();
    }
    renderer.dispose();
    return outcomes;
  });
  console.log(JSON.stringify({ status: 'PASS', kind: 'real browser rendered asset playback with controlled duel fixtures', outcomes: results }, null, 2));
} finally { await browser.close(); }
