// Quotes, without spending, what the proposed Meshy generations would cost: `meshy make --dry-run` prints the steps and the estimate and
// "exits without calling the API". The balance is read (GET /balance, free) before and after to prove nothing was spent.
// Usage: node scripts/meshy/quote-assets.mjs [out=docs/assets/MESHY_QUOTES.json]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const out = process.argv[2] ?? 'docs/assets/MESHY_QUOTES.json';
const cli = (...a) => { const r = spawnSync('npx', ['-y', '@meshy-ai/cli', ...a], { encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return JSON.parse(r.stdout); };
const briefs = JSON.parse(fs.readFileSync('assets-src/vehicles/briefs.json', 'utf8')).briefs;   // the three player-owned cars: prompts live there
const ITEMS = [
  // ---- vehicles (body without wheels: the four wheels are separate, shared and animated by the game)
  ...briefs.map(b => ({ id: b.id, group: 'vehicle', for: `${b.title} (stage ${b.stage}) -> catalogue ${b.slot.asset}`, prompt: b.prompt })),
  // ---- distinctive Senegalese furniture and accessories (not ordinary chairs and tables: those come free from the Kenney / Quaternius packs)
  { id: 'attaya_set', group: 'furniture', for: 'Service à attaya complet (brass tray, teapots, glasses, charcoal stove): the home’s tea ritual, premium', prompt: 'A Senegalese attaya tea set on a round brass tray: small charcoal stove, two enamel teapots, six small glasses, low poly game prop, warm brass' },
  { id: 'tabouret_sculpte', group: 'furniture', for: 'Tabouret sculpté en bois (a seat people can use)', prompt: 'A low carved wooden stool from West Africa, solid dark wood, simple geometric carved base, game prop' },
  { id: 'canari_support', group: 'furniture', for: 'Canari d’eau sur son support (decor)', prompt: 'A large terracotta water jar (canari) with a wooden lid sitting on a three-legged iron stand, West African household, game prop' },
  { id: 'pilon_mortier', group: 'furniture', for: 'Pilon et mortier en bois (decor, kitchen)', prompt: 'A large wooden mortar with a tall wooden pestle, West African kitchen, game prop' },
  { id: 'calebasses', group: 'furniture', for: 'Calebasses empilées (decor)', prompt: 'A stack of three decorated calabash bowls with a ladle, West African, game prop' },
  { id: 'fanal_laiton', group: 'furniture', for: 'Fanal en laiton (a lamp)', prompt: 'A brass lantern (fanal) with a glass chimney and a carrying handle, West African, standing on the floor, game prop' },
];
const before = cli('api', 'GET', '/balance');
const quotes = ITEMS.map(it => { const q = cli('make', it.prompt, '--dry-run'); return { ...it, steps: q.steps, makeEstimate: q.estimated_credits }; });
const after = cli('api', 'GET', '/balance');
const REMESH = 5;   // observed price of a remesh on our earlier tasks (the CLI's make does not include it)
const rows = quotes.map(q => ({ ...q, withRemesh: q.makeEstimate + REMESH }));
const sum = g => rows.filter(r => r.group === g).reduce((s, r) => s + r.withRemesh, 0);
const result = { date: new Date().toISOString(), balanceBefore: before.balance, balanceAfter: after.balance, spent: before.balance - after.balance, remeshCredits: REMESH, rows, totals: { vehicleBodies: sum('vehicle'), furniture: sum('furniture'), all: sum('vehicle') + sum('furniture') } };
fs.mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
fs.writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
for (const r of rows) console.log(r.id.padEnd(18), r.steps.map(s => `${s.action} ${s.estimated_credits}`).join(' + '), `+ remesh ${REMESH} =`, r.withRemesh);
console.log('totals', result.totals, '| balance', before.balance, '->', after.balance, '(spent', result.spent + ')');
