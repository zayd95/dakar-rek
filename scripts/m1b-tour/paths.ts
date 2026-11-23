// Writes scripts/m1b-tour/paths.json: the free paths of the Tiak bike between the pick-up and the two stops of the Pikine tour
// (pick-up → each stop, and between the stops), with the headless riders' times. check-tiak-tour.mjs rides them in the browser.
// Usage: COLLIDERS=scripts/m1b-tour/colliders.json npx vite-node scripts/m1b-tour/paths.ts
process.env.LEGS_LIB = '1';
import fs from 'node:fs';
const L = await import('./legs');
const { TOURS } = await import('../../src/economy/tour');
const t = TOURS[0];
const at = (frag: string) => { const p = L.place(frag); return { x: p.x, z: p.z }; };
const pts = { pickup: at(t.pickup.frag), agence: at(t.stops[0].place.frag), dames: at(t.stops[1].place.frag) };
const out: Record<string, unknown> = { tour: t.id, places: pts };
const leg = (name: string, a: { x: number; z: number }, b: { x: number; z: number }) => {
  const path = L.plan(a, b)!;
  const touch = L.ride(path, 'touch'), clavier = L.ride(path, 'clavier');
  out[name] = { path: path.map(p => [+p.x.toFixed(2), +p.z.toFixed(2)]), touch, clavier };
  console.log(name.padEnd(16), 'path', path.length, 'pts | touch', touch.s, 's', touch.m, 'm bumps', touch.bumps, '| clavier', clavier.s, 's bumps', clavier.bumps);
};
leg('pickup>agence', pts.pickup, pts.agence);
leg('pickup>dames', pts.pickup, pts.dames);
leg('agence>dames', pts.agence, pts.dames);
leg('dames>agence', pts.dames, pts.agence);
fs.writeFileSync(new URL('./paths.json', import.meta.url), JSON.stringify(out, null, 1));

// the whole tour in one ride (no stop at the first stop): pick-up → first stop → second stop, as the player rides it
const chain = (a: string, b: string) => [...(out[a] as { path: number[][] }).path, ...(out[b] as { path: number[][] }).path.slice(1)];
for (const [name, a, b] of [['tour:agence-first', 'pickup>agence', 'agence>dames'], ['tour:dames-first', 'pickup>dames', 'dames>agence']] as const) {
  const path = chain(a, b).map(([x, z]) => ({ x, z }));
  const touch = L.ride(path, 'touch'), clavier = L.ride(path, 'clavier');
  out[name] = { path: path.map(p => [p.x, p.z]), touch, clavier };
  console.log(name.padEnd(18), 'path', path.length, 'pts | touch', touch.s, 's bumps', touch.bumps, 'ok', touch.ok, '| clavier', clavier.s, 's bumps', clavier.bumps, 'ok', clavier.ok);
}
fs.writeFileSync(new URL('./paths.json', import.meta.url), JSON.stringify(out, null, 1));
