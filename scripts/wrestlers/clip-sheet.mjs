// Contact sheets of the retargeted clips (stick figures, side or front view) as ImageMagick MVG: checks the retarget by eye.
// Usage: OUT=sheet.mvg [T0=s T1=s] node scripts/wrestlers/clip-sheet.mjs id1,id2 [frames] [side|front]  → prints WxH; then
//   (echo "viewbox 0 0 W H"; echo "fill white rectangle 0,0 W,H"; cat sheet.mvg) > full.mvg; convert mvg:full.mvg sheet.png
import fs from 'node:fs'; import * as THREE from 'three'; import { NodeIO } from '@gltf-transform/core';
const san=n=>n.replace(/[.\s]/g,'');
const doc=await new NodeIO().read('public/assets/character_v4.glb'), map=new Map(), top=new THREE.Group();
for(const n of doc.getRoot().listNodes()){const o=new THREE.Object3D();o.name=san(n.getName());o.position.fromArray(n.getTranslation());o.quaternion.fromArray(n.getRotation());map.set(n,o);}
for(const n of doc.getRoot().listNodes())for(const c of n.listChildren())map.get(n).add(map.get(c));
for(const n of doc.getRoot().listNodes())if(!map.get(n).parent)top.add(map.get(n));
const J=JSON.parse(fs.readFileSync('public/assets/wrestlers/combat_clips.json'));
const dec=s=>{const b=Buffer.from(s,'base64');return new Int16Array(b.buffer,b.byteOffset,b.length/2);};
const g=n=>top.getObjectByName(n);
const SEG=[['hips','spine'],['spine','chest'],['chest','neck'],['neck','head'],['chest','upper_armL'],['upper_armL','forearmL'],['forearmL','handL'],['chest','upper_armR'],['upper_armR','forearmR'],['forearmR','handR'],['hips','thighL'],['thighL','shinL'],['shinL','footL'],['hips','thighR'],['thighR','shinR'],['shinR','footR']];
const only=process.argv[2]?process.argv[2].split(','):Object.keys(J.clips), N=+(process.argv[3]||10), view=process.argv[4]||'side';
const W=110,H=200; let svg=''; let row=0;
for(const id of only){const c=J.clips[id];
 svg+=`fill #000 stroke none text 4,${row*H+14} '${id}'\n`;
 for(let i=0;i<N;i++){const t0=+(process.env.T0??0)*c.fps,t1=process.env.T1?+process.env.T1*c.fps:c.frames-1;const f=Math.min(c.frames-1,Math.round(t0+i*(t1-t0)/(N-1)));
  for(const n of J.bones){const a=dec(c.bones[n]);const k=a.length===4?0:f*4;g(n).quaternion.set(a[k]/32767,a[k+1]/32767,a[k+2]/32767,a[k+3]/32767).normalize();}
  const h=dec(c.hips);g('hips').position.set(h[f*3]/1000,h[f*3+1]/1000,h[f*3+2]/1000);top.updateMatrixWorld(true);
  const ox=i*W+W/2, oy=row*H+H-10, s=85;
  const pr=v=> view==='side'?[ox+v.z*s, oy-v.y*s]:[ox+v.x*s, oy-v.y*s];
  svg+=`stroke #bbb stroke-width 1 line ${i*W},${oy} ${i*W+W-6},${oy}\n`;
  for(const [a,b] of SEG){const A=pr(g(a).getWorldPosition(new THREE.Vector3())),B=pr(g(b).getWorldPosition(new THREE.Vector3()));const col=/L$/.test(b)?'#c00':/R$/.test(b)?'#00c':'#000';svg+=`stroke '${col}' stroke-width 3 line ${A[0].toFixed(1)},${A[1].toFixed(1)} ${B[0].toFixed(1)},${B[1].toFixed(1)}\n`;}
  const hd=pr(g('head').getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,0.1,0)));svg+=`fill none stroke #000 stroke-width 2 circle ${hd[0].toFixed(1)},${hd[1].toFixed(1)} ${(hd[0]+8).toFixed(1)},${hd[1].toFixed(1)}\n`;
  svg+=`fill #000 stroke none text ${i*W+3},${row*H+28} '${(f/c.fps).toFixed(2)}s'\n`;}
 row++;}
fs.writeFileSync(process.env.OUT,svg); console.log(`${N*W}x${row*H}`);
