// Copies the few verses the Grande Mosquée shows, verbatim, from Tanzil's verified Quran text (Simple edition, XML) into
// src/venues/quran.json, with Tanzil's copyright block. Never edit that JSON by hand: re-run this script instead.
//   curl -o tanzil-simple.xml "https://tanzil.net/pub/download/index.php?marks=true&sajdah=true&rub=true&tatweel=true&quranType=simple&outType=xml&agree=true"
//   node scripts/quran-extract.mjs tanzil-simple.xml            (write)
//   node scripts/quran-extract.mjs --verify tanzil-simple.xml   (check the committed JSON against the file, byte for byte)
import fs from 'node:fs';

/** What the mosque shows: whole verses only (sura, first verse, last verse). */
export const WANTED = [
  { id: 'bismillah', sura: 1, from: 1, to: 1, label: 'Sourate Al-Fâtiha (1), verset 1' },
  { id: 'fatiha', sura: 1, from: 1, to: 7, label: 'Sourate Al-Fâtiha (1), versets 1 à 7' },
  { id: 'kursi', sura: 2, from: 255, to: 255, label: 'Âyat al-Kursî · sourate Al-Baqara (2), verset 255' },
  { id: 'ikhlas', sura: 112, from: 1, to: 4, label: 'Sourate Al-Ikhlâs (112), versets 1 à 4' },
];

const verify = process.argv[2] === '--verify';
const src = process.argv[verify ? 3 : 2];
if (!src) { console.error('usage: node scripts/quran-extract.mjs [--verify] <tanzil-simple.xml>'); process.exit(2); }
const xml = fs.readFileSync(src, 'utf8');
const notice = xml.match(/<!--([\s\S]*?)-->/)?.[1];
if (!notice || !/Tanzil Project/.test(notice) || !/CHANGING IT IS NOT ALLOWED/.test(notice)) throw new Error('Tanzil copyright block not found');
const edition = notice.match(/Tanzil Quran Text \(([^)]+)\)/)?.[1];
if (!/^Simple, /.test(edition ?? '')) throw new Error(`expected the Simple edition, got ${edition}`);

const unescape = s => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const suras = new Map();
for (const m of xml.matchAll(/<sura index="(\d+)" name="([^"]*)">([\s\S]*?)<\/sura>/g)) {
  const ayas = new Map();
  for (const a of m[3].matchAll(/<aya index="(\d+)" text="([^"]*)"/g)) ayas.set(+a[1], unescape(a[2]));
  suras.set(+m[1], { name: unescape(m[2]), ayas });
}
if (suras.size !== 114) throw new Error(`expected 114 suras, found ${suras.size}`);

const passages = WANTED.map(w => {
  const s = suras.get(w.sura);
  const verses = [];
  for (let n = w.from; n <= w.to; n++) {
    const text = s.ayas.get(n);
    if (!text) throw new Error(`missing ${w.sura}:${n}`);
    verses.push({ sura: w.sura, aya: n, text });
  }
  return { id: w.id, label: w.label, sura: w.sura, suraName: s.name, verses };
});

const out = {
  source: 'Tanzil Project — https://tanzil.net',
  edition: `Tanzil Quran Text (${edition})`,
  notice: notice.replace(/^\s*\n/, '').replace(/\s+$/, ''),
  passages,
};
const target = new URL('../src/venues/quran.json', import.meta.url);
if (verify) {
  const same = fs.readFileSync(target, 'utf8') === JSON.stringify(out, null, 2) + '\n';
  console.log(same ? 'src/venues/quran.json matches the Tanzil file exactly' : 'src/venues/quran.json DIFFERS from the Tanzil file');
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote src/venues/quran.json: ${passages.map(p => `${p.id} (${p.verses.length})`).join(', ')}`);
