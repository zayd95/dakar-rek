import { Cfg, runJobs, SH } from './lifestyles';
const C: Cfg = { name: 'v', variety: 0, varietyCap: 0, polyOld: false, gp: 0.95, qual: () => 0.85 };
console.log('single-shift specialist, no variety, competent play (gesture pay ×0.95), 60 min, real durations');
const rows = Object.values(SH).map(sh => { const r = runJobs(C, () => sh, 60); return { id: sh.id, g: sh.g ? 'gesture' : 'plain', pay: sh.pay, secs: +sh.secs.toFixed(1), en: sh.en, perHour: r.actPerHour, shifts: r.shifts, perShift: Math.round(r.actPerHour * 3600 / 3600 / (r.shifts / 1)) }; });
rows.sort((a, b) => b.perHour - a.perHour);
for (const r of rows) console.log(r.id.padEnd(10), r.g.padEnd(8), String(r.pay).padStart(5), 'F', String(r.secs).padStart(5), 's', 'en', String(r.en).padStart(3), '→', String(Math.round(r.perHour / 1000)).padStart(4), 'k/h', ' ', (r.perHour / rows.find(x => x.id === 'meca')!.perHour).toFixed(2) + '× meca');
const med = rows.map(r => r.perHour).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
console.log('median', Math.round(med / 1000), 'k/h; max/median', (rows[0].perHour / med).toFixed(2), '; min/median', (rows.at(-1)!.perHour / med).toFixed(2));
