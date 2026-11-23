// One picture of the character studio's evidence (docs/avatar/proof): the first launch on a phone, step by step, the game, the Profile and the edit, then the lab's
// matrices (every hairstyle on both bodies from four sides, the skin tones' extremes at noon and at night, the outfits). Labels under each tile.
// Usage: node scripts/avatar/contact-sheet.mjs [proofDir=docs/avatar/proof] [out=docs/avatar/proof/contact-sheet.jpg]
import sharp from 'sharp';
import fs from 'node:fs';

const dir = process.argv[2] ?? 'docs/avatar/proof', out = process.argv[3] ?? `${dir}/contact-sheet.jpg`;
const PHONE = [
  ['01-welcome', 'Bienvenue · prénom'], ['02-studio-corps', 'Corps'], ['03-studio-peau', 'Peau'], ['03-studio-coiffure', 'Coiffure'], ['03-studio-tenue', 'Tenue'],
  ['04-femme-afro', 'Femme · Afro'], ['04-femme-wrap', 'Femme · Foulard'], ['05-final-look', 'Le choix'], ['06-arrival', 'Arrivée'], ['07-game', 'Pikine, en jeu'],
  ['08-game-close', 'En jeu, de près'], ['09-profile', 'Profil'], ['10-edit', 'Modifier'], ['11-profile-after-edit', 'Profil après'],
];
const WIDE = [['12-studio-375x667', 'iPhone SE 375×667'], ['12-studio-844x390', 'Paysage 844×390']];
const LAB = [['lab-hair-homme', 'Homme : Court · Rasé · Afro · Kufi (face, 3/4, profil, dos)'], ['lab-hair-femme', 'Femme : Locks · Afro · Chignon · Foulard'],
  ['lab-skin-day', 'Clair / Ébène, midi'], ['lab-skin-night', 'Clair / Ébène, nuit'], ['lab-outfits', 'Uni · Rayé · Imprimé, les deux corps']];
const BG = '#11151f', INK = '#f2ece2', PAD = 14, LABEL = 30;
const label = (w, text) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${LABEL}"><rect width="100%" height="100%" fill="${BG}"/><text x="${w / 2}" y="20" font-family="DejaVu Sans, Arial" font-size="15" fill="${INK}" text-anchor="middle">${text.replace(/&/g, '&amp;')}</text></svg>`);
async function tile(file, text, w, h) {
  const img = await sharp(file).resize(w, h, { fit: 'contain', background: BG }).toBuffer();
  return sharp({ create: { width: w, height: h + LABEL, channels: 3, background: BG } }).composite([{ input: img, top: 0, left: 0 }, { input: label(w, text), top: h, left: 0 }]).png().toBuffer();
}
async function row(items, w, h) {
  const tiles = [];
  for (const [n, t] of items) { const f = `${dir}/${n}.png`; if (fs.existsSync(f)) tiles.push(await tile(f, t, w, h)); else console.log('missing', f); }
  return { tiles, w, h: h + LABEL };
}
const rows = [await row(PHONE.slice(0, 7), 230, 498), await row(PHONE.slice(7), 230, 498), await row(WIDE, 470, 240), await row(LAB.slice(0, 2), 760, 760), await row(LAB.slice(2), 500, 600)];
const W = Math.max(...rows.map(r => r.tiles.length * (r.w + PAD) + PAD)), H = rows.reduce((s, r) => s + r.h + PAD, PAD);
const comp = []; let y = PAD;
for (const r of rows) { const total = r.tiles.length * (r.w + PAD) - PAD; let x = Math.round((W - total) / 2); for (const t of r.tiles) { comp.push({ input: t, top: y, left: x }); x += r.w + PAD; } y += r.h + PAD; }
await sharp({ create: { width: W, height: H, channels: 3, background: BG } }).composite(comp).jpeg({ quality: 82 }).toFile(out);
console.log('wrote', out, W, H, (fs.statSync(out).size / 1e6).toFixed(1), 'MB');
