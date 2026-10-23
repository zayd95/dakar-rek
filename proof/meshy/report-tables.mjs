// Prints the proof's tables (markdown) from docs/meshy/proof/results.json, so the report quotes the measurements and nothing else.
import fs from 'node:fs';
const r = JSON.parse(fs.readFileSync('docs/meshy/proof/results.json', 'utf8'));
const ids = Object.keys(r.cases), label = { v4_m: 'v4 male (control)', v4_f: 'v4 female (control)', meshy_m: 'Meshy homme', meshy_f: 'Meshy femme' };
const cm = x => (x * 100).toFixed(1);
const row = (name, f) => `| ${name} | ${ids.map(i => f(r.cases[i])).join(' | ')} |`;
const head = first => `| ${first} | ${ids.map(i => label[i]).join(' | ')} |\n|---|${ids.map(() => '---').join('|')}|`;
const out = [];
out.push('### On foot (soles against the ground while planted, cm; negative = below the ground)\n', head('Speed'));
for (const sp of ['walk', 'jog', 'run']) {
  out.push(row(`${sp}: sole 5th percentile / median`, c => `${cm(c.onFoot[sp].soleClearance_m.p5)} / ${cm(c.onFoot[sp].soleClearance_m.median)}`));
  out.push(row(`${sp}: deepest sole`, c => `${cm(-c.onFoot[sp].penetrationMax_m)}`));
  out.push(row(`${sp}: arm swing L / R (cm)`, c => `${cm(c.onFoot[sp].armSwing_m.L)} / ${cm(c.onFoot[sp].armSwing_m.R)}`));
  out.push(row(`${sp}: foot slip, gait's own count (cm)`, c => `${cm(c.onFoot[sp].footSlip_m.L)} / ${cm(c.onFoot[sp].footSlip_m.R)}`));
}
out.push('\n### Sit and stand (chair convention, seat top 0.46 m)\n', head('Measure'));
out.push(row('buttocks/thighs against the seat top (cm)', c => cm(c.sitStand.seated.seatContact_m)));
out.push(row('soles against the floor (cm)', c => cm(c.sitStand.seated.feetToFloor_m)));
out.push(row('thigh slope (deg)', c => c.sitStand.seated.thighSlope_deg));
out.push(row('after standing: hips / feet back to the start (cm)', c => `${cm(c.sitStand.backToStanding.hips_m)} / ${cm(c.sitStand.backToStanding.feet_m)} (${c.sitStand.backToStanding.clip})`));
out.push('\n### Riding the 125 cc moto (5 seeds, the repo\'s own test: palm tip within 10 cm of a grip, foot within 12 cm of a peg)\n', head('Measure'));
out.push(row('palm tip to grip, median / worst (cm)', c => `${cm(c.ride.palmTipToGrip_m.median)} / ${cm(c.ride.palmTipToGrip_m.max)}`));
out.push(row('nearest hand vertex to grip, worst (cm)', c => cm(c.ride.handMeshToGrip_m.max)));
out.push(row('foot bone to peg, worst (cm)', c => cm(c.ride.footBoneToPeg_m.max)));
out.push(row('nearest foot vertex to peg, worst (cm)', c => cm(c.ride.footMeshToPeg_m.max)));
out.push('\n### Gestures and held objects\n', head('Measure'));
out.push(row('hand to mouth: fingers to the mouth, mesh (cm)', c => cm(c.gestures.fingersToMeshMouth_m)));
out.push(row('hand to mouth: fingers to the game\'s mouth point (cm)', c => cm(c.gestures.fingersToGameMouth_m)));
out.push(row('arms up: hand height L / R (m)', c => c.gestures.armsUpHandY_m.join(' / ')));
out.push(row('held cup: grip point to nearest hand vertex (cm)', c => cm(c.gestures.heldObject.gripToNearestHandVertex_m)));
out.push('\n### Transitions: fastest-moving point of the body surface (m/s; same clips, so equal values mean no new pop)\n', head('Transition'));
for (const ph of Object.keys(r.cases[ids[0]].transitions)) out.push(row(ph, c => c.transitions[ph].maxSpeed_mps));
out.push('\n### Cost of one body\n', head('Measure'));
out.push(row('draw calls', c => c.cost.drawCallsPerBody));
out.push(row('triangles', c => c.cost.trianglesPerBody));
out.push(row('skinned vertices', c => c.cost.skinnedVertices));
out.push(row('bones', c => c.cost.bones));
out.push(row('texture memory with mipmaps (MB)', c => c.cost.textureMB));
out.push(row('JS per body per frame, gait on (ms; this machine)', c => c.cost.jsMsPerBodyPerFrame));
out.push(row('40 bodies: draw calls / triangles', c => `${c.cost.crowd40.drawCalls} / ${c.cost.crowd40.triangles}`));
out.push('\n### Switching and fallback\n', '```json', JSON.stringify(r.switching, null, 1), '```');
if (r.lodVariants) { out.push('\n### Free low-detail variants\n', '```json', JSON.stringify(r.lodVariants, (k, v) => (k === 'rows' || k === 'seeds' ? undefined : v), 1), '```'); }
out.push('\n### Load\n', '```json', JSON.stringify(r.init, null, 1), '```');
console.log(out.join('\n'));
