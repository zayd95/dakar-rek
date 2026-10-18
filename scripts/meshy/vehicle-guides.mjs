// Proportion guides for the three lineup briefs (assets-src/vehicles/briefs.json), to scale from each slot's kit target, plus one picture of the
// three silhouettes on the same ground line so the step up from each car to the next is visible. NOT a Meshy input (text-to-3D takes none) and the
// silhouettes are indicative only: they are what to judge a preview against.
// Usage: node scripts/meshy/vehicle-guides.mjs [outDir=docs/assets/guides]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const out = process.argv[2] ?? 'docs/assets/guides', dir = 'assets-src/vehicles', briefs = JSON.parse(fs.readFileSync(`${dir}/briefs.json`, 'utf8')).briefs;
fs.mkdirSync(out, { recursive: true });
const targets = Object.fromEntries(briefs.map(b => [b.id, JSON.parse(fs.readFileSync(`${dir}/${b.slot.target}`, 'utf8'))]));
const COL = { modern_sedan: '#bfc5cb', sport_sedan: '#5b6068', premium_suv: '#26282b' };

function side(b, T, S, X0, G, fill, extra = true) {
  const L = T.length, fr = T.wheels.find(w => w.z > 0), rr = T.wheels.find(w => w.z < 0), R = fr.r, X = z => X0 + (z + L / 2) * S, Y = y => G - y * S;
  const poly = b.silhouette.map(([z, y]) => `${X(z)},${Y(y)}`).join(' ');
  const arch = w => `<circle cx="${X(w.z)}" cy="${Y(w.y)}" r="${S * (R + 0.07)}" fill="#fff" stroke="#c0392b" stroke-width="2" stroke-dasharray="6 4"/><circle cx="${X(w.z)}" cy="${Y(w.y)}" r="3" fill="#c0392b"/>`;
  return `<rect x="${X(-L / 2)}" y="${Y(T.height)}" width="${L * S}" height="${T.height * S}" fill="none" stroke="#2980b9" stroke-width="1.5" stroke-dasharray="8 5"/>
<polygon points="${poly}" fill="${fill}" stroke="#555" stroke-width="2" fill-opacity="0.92"/>${arch(fr)}${arch(rr)}
${extra ? `<circle cx="${X(T.driver.z)}" cy="${Y(T.cameras.driver.pos[1])}" r="5" fill="#27ae60"/><text x="${X(T.driver.z) + 8}" y="${Y(T.cameras.driver.pos[1]) - 8}" font-size="13" fill="#1e8449">driver's eye ${T.cameras.driver.pos[1]} m</text>` : ''}`;
}
const dim = (x1, y1, x2, y2, t, dy) => `<g stroke="#222" stroke-width="1.5"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line x1="${x1}" y1="${y1 - 7}" x2="${x1}" y2="${y1 + 7}"/><line x1="${x2}" y1="${y2 - 7}" x2="${x2}" y2="${y2 + 7}"/></g><text x="${(x1 + x2) / 2}" y="${y1 + dy}" font-size="15" text-anchor="middle" fill="#222">${t}</text>`;

for (const b of briefs) {
  const T = targets[b.id], S = 190, X0 = 70, G = T.height * S + 100, W = Math.max(1500, Math.round(T.length * S + 260)), Hh = Math.round(G + 235);
  const fr = T.wheels.find(w => w.z > 0), rr = T.wheels.find(w => w.z < 0), X = z => X0 + (z + T.length / 2) * S;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" font-family="sans-serif"><rect width="${W}" height="${Hh}" fill="#fafafa"/>
<text x="20" y="30" font-size="20" font-weight="bold" fill="#222">${b.order}. ${b.title} (stage ${b.stage}): ${b.slot.asset}, side view to scale, front to the right</text>
<text x="20" y="54" font-size="14" fill="#555">${b.role}</text>
<line x1="20" y1="${G}" x2="${W - 20}" y2="${G}" stroke="#555" stroke-width="2"/>${side(b, T, S, X0, G, COL[b.id])}
${dim(X(-T.length / 2), G + 38, X(T.length / 2), G + 38, `${T.length} m long, ${T.width} m wide, ${T.height} m tall`, 22)}
${dim(X(rr.z), G + 80, X(fr.z), G + 80, `wheelbase ${(fr.z - rr.z).toFixed(2)} m, hubs at z ${rr.z.toFixed(2)} / +${fr.z.toFixed(2)}, wheel radius ${fr.r} m`, 22)}
<text x="20" y="${G + 120}" font-size="14" fill="#222">Blue dashed box = the envelope the game's collisions, seats, cameras and wheels were built for. The shape is only indicative. Red = empty wheel arches.</text>
<text x="20" y="${G + 146}" font-size="14" font-weight="bold" fill="#1e8449">Look: ${b.look.join(' · ')}</text>
<text x="20" y="${G + 172}" font-size="14" font-weight="bold" fill="#1e8449">Accept: no wheels, tyres or rims; arches empty and open; length : height : wheelbase within ~10 % of the box; reads as this car from side, front, rear and 3/4.</text>
<text x="20" y="${G + 198}" font-size="14" font-weight="bold" fill="#c0392b">Reject: wheels modelled; the proportions of another car of the lineup; any text, badge, logo or plate; a copy of a real car's signature details.</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(out, `${b.id}.png`));
}
// the three together, one ground line, one scale: the ladder
{
  const S = 150, G = 330, W = Math.round(briefs.reduce((n, b) => n + targets[b.id].length * 150 + 40, 40) + 20), H = 470; let x = 40; const parts = [];
  for (const b of briefs) { const T = targets[b.id]; parts.push(side(b, T, S, x, G, COL[b.id], false)); parts.push(`<text x="${x}" y="${G + 40}" font-size="15" font-weight="bold" fill="#222">${b.order}. ${b.title}</text><text x="${x}" y="${G + 60}" font-size="13" fill="#444">${T.length} × ${T.width} × ${T.height} m · wheels r ${T.wheels[0].r} · ${b.slot.catalogue.split('·')[1]?.trim() ?? ''}</text>`); x += T.length * S + 40; }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="sans-serif"><rect width="${W}" height="${H}" fill="#fafafa"/><text x="40" y="34" font-size="20" font-weight="bold" fill="#222">The lineup to one scale: each car is a visible step up from the one before</text><line x1="20" y1="${G}" x2="${W - 20}" y2="${G}" stroke="#555" stroke-width="2"/>${parts.join('')}<text x="40" y="${H - 20}" font-size="13" fill="#555">Indicative silhouettes on the kit envelopes (blue) of the three catalogue slots; the real bodies come from Meshy, one at a time, each approved before the next.</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(out, 'lineup.png'));
}
console.log('written', out);
