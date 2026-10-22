// Rebuild ONLY the male's defective hand shells. No service, source archive or Blender needed.
// Runs LAST in build-bodies, after low simplification, grip/shave and texture padding.
// Existing wrist cut edges, textures/material, skeleton, inverse binds and animation accessors survive.
// Usage: node scripts/meshy/repair-male-hands.mjs public/assets/meshy/body_m[_low].glb
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as THREE from 'three';
import sharp from 'sharp';
const VERSION = 3, CUT = -.025;
const vec = a => new THREE.Vector3(...a), lerp = (a,b,t) => a+(b-a)*t;
const smooth = t => { t=Math.max(0,Math.min(1,t));return t*t*(3-2*t); };
export async function repairMaleHands(file) {
  if (!/^body_m(?:_low)?\.glb$/.test(path.basename(file))) throw Error('Male-only pass: expected body_m.glb or body_m_low.glb');
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.read(file),root=doc.getRoot();
  const mesh=root.listMeshes().find(m=>m.getName()==='Meshy_Body');
  if(mesh.getExtras().maleHandRepair===VERSION) return {file,alreadyRepaired:true};
  const prim=mesh.listPrimitives()[0],buffer=root.listBuffers()[0],skin=root.listSkins()[0],joints=skin.listJoints();
  const semantics=prim.listSemantics(), attrs=Object.fromEntries(semantics.map(s=>[s,{acc:prim.getAttribute(s),array:Array.from(prim.getAttribute(s).getArray()),size:prim.getAttribute(s).getElementSize()}]));
  const targets=prim.listTargets().map(t=>Object.fromEntries(t.listSemantics().map(s=>[s,{acc:t.getAttribute(s),array:Array.from(t.getAttribute(s).getArray()),size:3}])));
  const P=attrs.POSITION.array, J=attrs.JOINTS_0.array, W=attrs.WEIGHTS_0.array, UV=attrs.TEXCOORD_0.array;
  const originalCount=P.length/3, originalIndices=Array.from(prim.getIndices().getArray());let indices=originalIndices;
  const keepNormal=new Set(),report={file,version:VERSION,before:{vertices:originalCount,triangles:indices.length/3},hands:[]};
  const point=i=>new THREE.Vector3().fromArray(P,i*3);
  const append=(values,morphs=[])=>{const id=P.length/3;for(const s of semantics)attrs[s].array.push(...values[s]);targets.forEach((t,k)=>{for(const s in t)t[s].array.push(...(morphs[k]?.[s]??[0,0,0]));});return id;};
  for(const side of ['L','R']){
    const bone=joints.find(j=>j.getName()==='hand.'+side),handId=joints.indexOf(bone),faId=joints.findIndex(j=>j.getName()==='forearm.'+side);
    const wr=new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(bone.getWorldMatrix())),el=new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(joints[faId].getWorldMatrix()));
    const Y=wr.clone().sub(el).normalize(),N=new THREE.Vector3(side==='L'?-1:1,0,0);N.addScaledVector(Y,-N.dot(Y)).normalize();
    // A points towards the thumb on either hand. Mirror winding, not the rig.
    const A=new THREE.Vector3().crossVectors(Y,N).multiplyScalar(side==='L'?-1:1),flip=new THREE.Matrix4().makeBasis(A,Y,N).determinant()<0;
    const local=i=>{const p=point(i).sub(wr);return [p.dot(A),p.dot(Y),p.dot(N)];};
    const world=p=>wr.clone().addScaledVector(A,p[0]).addScaledVector(Y,p[1]).addScaledVector(N,p[2]).toArray();
    const hw=i=>{let w=0;for(let k=0;k<4;k++)if(J[4*i+k]===handId)w+=W[4*i+k];return w;};
    const candidates=Array.from({length:originalCount},(_,i)=>i).filter(i=>hw(i)>.8&&local(i)[1]>.025);
    if(candidates.length<50)throw Error('Unexpected male topology: no hand region');
    // A real skin texel from this hand, selected well inside its original UV island.
    // Keep the atlas byte-for-byte; a tiny patch avoids projecting the old webbed triangles onto the new fingers.
    // The palm is painted ~2x brighter than the arm, and the studio's skin shader tones each texel against the body's mean skin: one palm texel over the
    // whole hand read chalk-white on light skin tones. Take the candidate texel whose colour is nearest the forearm's own mean.
    const tex=root.listTextures()[0],{data:img,info}=await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const texel=i=>{const x=Math.min(info.width-1,Math.floor(UV[2*i]*info.width)),y=Math.min(info.height-1,Math.floor(UV[2*i+1]*info.height)),o=(y*info.width+x)*3;return[img[o],img[o+1],img[o+2]];};
    const fore=Array.from({length:originalCount},(_,i)=>i).filter(i=>{let w=0;for(let k=0;k<4;k++)if(J[4*i+k]===faId)w+=W[4*i+k];return w>.99&&local(i)[1]<-.03&&local(i)[1]>-.22;}).map(texel);
    if(fore.length<8)throw Error('Unexpected male topology: no forearm skin to match');
    const mean=[0,1,2].map(c=>fore.reduce((a,t)=>a+t[c],0)/fore.length),dist=i=>{const t=texel(i);return Math.hypot(t[0]-mean[0],t[1]-mean[1],t[2]-mean[2]);};
    const uvId=candidates.reduce((best,i)=>dist(i)<dist(best)?i:best,candidates[0]);
    const uv=[UV[2*uvId],UV[2*uvId+1]];
    const edgeCache=new Map(),segments=[];const next=[];let removed=0,clipped=0;
    function intersect(a,b){const key=[Math.min(a,b),Math.max(a,b)].join(':');if(edgeCache.has(key))return edgeCache.get(key);
      const ba=local(a)[1],bb=local(b)[1],t=(CUT-ba)/(bb-ba),v={},ms=targets.map(()=>({}));
      for(const s of semantics){const a0=attrs[s];v[s]=Array.from({length:a0.size},(_,k)=>lerp(a0.array[a*a0.size+k],a0.array[b*a0.size+k],t));}
      const weights=new Map();for(const [id,f]of[[a,1-t],[b,t]])for(let k=0;k<4;k++)if(W[4*id+k]>0)weights.set(J[4*id+k],(weights.get(J[4*id+k])||0)+W[4*id+k]*f);
      const top=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=top.reduce((s,p)=>s+p[1],0);v.JOINTS_0=Array.from({length:4},(_,k)=>top[k]?.[0]||0);v.WEIGHTS_0=Array.from({length:4},(_,k)=>(top[k]?.[1]||0)/sum);
      v.NORMAL=vec(v.NORMAL).normalize().toArray();targets.forEach((tg,k)=>{for(const s in tg)ms[k][s]=[0,1,2].map(c=>lerp(tg[s].array[3*a+c],tg[s].array[3*b+c],t));});
      const id=append(v,ms);edgeCache.set(key,id);return id;
    }
    for(let t=0;t<indices.length;t+=3){const tri=indices.slice(t,t+3);
      // Spatial guard excludes the thigh and torso; the proximal forearm is on the kept side.
      const inRegion=tri.every(i=>{let arm=0;for(let k=0;k<4;k++)if(J[4*i+k]===handId||J[4*i+k]===faId)arm+=W[4*i+k];return arm>.999;});
      if(!inRegion||tri.every(i=>local(i)[1]<=CUT)){next.push(...tri);continue;}
      if(tri.every(i=>local(i)[1]>CUT)){removed++;continue;}
      const poly=[],cross=[];for(let k=0;k<3;k++){const a=tri[k],b=tri[(k+1)%3],ia=local(a)[1]<=CUT,ib=local(b)[1]<=CUT;if(ia)poly.push(a);if(ia!==ib){const id=intersect(a,b);poly.push(id);cross.push(id);}}
      for(let k=1;k<poly.length-1;k++)next.push(poly[0],poly[k],poly[k+1]);if(cross.length===2)segments.push(cross);clipped++;
    }
    indices=next;
    // UV seams carry duplicate cut vertices: weld positions ONLY for ordering the collar loop.
    const key=i=>point(i).toArray().map(x=>Math.round(x*1e7)).join(','),reps=new Map(),adj=new Map();
    for(const [a,b]of segments){const ka=key(a),kb=key(b);if(ka===kb)continue;reps.set(ka,a);reps.set(kb,b);for(const [x,y]of[[ka,kb],[kb,ka]]){if(!adj.has(x))adj.set(x,new Set());adj.get(x).add(y);}}
    if(!adj.size||[...adj.values()].some(n=>n.size!==2))throw Error(`Non-simple wrist cut ${side}: refusing to change the model`);
    const start=[...adj.keys()].sort()[0],loop=[];let prev=null,cur=start;
    do{loop.push(reps.get(cur));const n=[...adj.get(cur)].find(x=>x!==prev);prev=cur;cur=n;if(loop.length>adj.size+1)throw Error('Invalid wrist loop');}while(cur!==start);
    if(loop.length!==adj.size)throw Error('Multiple wrist loops: manual diagnosis needed');
    // Sort around the forearm; the unmodified cut coordinates are the first collar ring.
    loop.sort((a,b)=>Math.atan2(local(a)[2],local(a)[0])-Math.atan2(local(b)[2],local(b)[0]));
    const generated=[];
    function vertex(p,g=p,weights=[handId,1],absolute=false){
      if(!absolute){p=[p[0]-.012,p[1],p[2]-.006];g=[g[0]-.012,g[1],g[2]-.006];}
      const values={};for(const s of semantics)values[s]=Array(attrs[s].size).fill(0);
      values.POSITION=world(p);values.NORMAL=[0,0,0];values.TEXCOORD_0=[uv[0]+p[0]*.012,uv[1]+(p[1]-.06)*.012];values.JOINTS_0=[weights[0],weights[2]??0,0,0];values.WEIGHTS_0=[weights[1],weights[3]??0,0,0];
      const delta=vec(world(g)).sub(vec(values.POSITION)).toArray(),morphs=targets.map((_,k)=>({POSITION:k===0?delta:[0,0,0],NORMAL:[0,0,0]}));const id=append(values,morphs);generated.push(id);return id;
    }
    function face(a,b,c){if(a===b||b===c||c===a)return;if(flip)indices.push(a,c,b);else indices.push(a,b,c);}
    const quad=(a,b,c,d)=>{face(a,b,c);face(a,c,d);};
    // Continuous palm shell: four open knuckle sockets and a side socket for the thumb.
    const xs=[-.037,-.029,-.021,-.018,-.010,-.002,.001,.009,.017,.020,.028,.036],ys=[.030,.040,.052,.064,.076,1];
    const grid=[[],[]],topY=x=>.086+.007*Math.cos((x+.002)/.037*Math.PI*.6)-.004*Math.max(0,-x/.037);
    for(let s=0;s<2;s++)for(let j=0;j<ys.length;j++){grid[s][j]=[];for(let i=0;i<xs.length;i++){
      const y=j===ys.length-1?topY(xs[i]):ys[j],width=j===0?.66:j===1?.83:j===2?.96:1,x=xs[i]*width;
      const depth=(s===0?1:-1)*(.0105+(s===0?.001:.0025)*Math.sin((y-.03)/.065*Math.PI))*Math.sqrt(1-.72*(x/.039)**2);
      grid[s][j][i]=vertex([x,y,depth]);
    }}
    const ny=ys.length,nx=xs.length;
    for(let s=0;s<2;s++)for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){const [a,b,c,d]=[grid[s][j][i],grid[s][j][i+1],grid[s][j+1][i+1],grid[s][j+1][i]];if(s===0)quad(a,b,c,d);else quad(d,c,b,a);}
    // Outer side walls; right rows 1..3 are the thumb socket.
    for(let j=0;j<ny-1;j++){
      quad(grid[1][j][0],grid[0][j][0],grid[0][j+1][0],grid[1][j+1][0]);
      if(j!==1&&j!==2)quad(grid[0][j][nx-1],grid[1][j][nx-1],grid[1][j+1][nx-1],grid[0][j+1][nx-1]);
    }
    for(const i of [2,5,8])quad(grid[0][ny-1][i],grid[0][ny-1][i+1],grid[1][ny-1][i+1],grid[1][ny-1][i]);
    // Finger centreline is arclength parameterised: width never contracts with the fan angle.
    function tube(base,path,gripPath,radius,steps){let ring=base;
      for(let j=1;j<=steps;j++){
        const t=j/steps,p=path(t),g=gripPath(t),prev=path(Math.max(0,t-.001)),after=path(Math.min(1,t+.001)),tangent=vec(after).sub(vec(prev)).normalize(),ng=vec(gripPath(Math.min(1,t+.001))).sub(vec(gripPath(Math.max(0,t-.001)))).normalize();
        // cross-section axes: across finger (A) and perpendicular in its bending plane
        const e1=new THREE.Vector3(1,0,0),e2=new THREE.Vector3().crossVectors(e1,tangent).normalize(),eg2=new THREE.Vector3().crossVectors(e1,ng).normalize();
        const rr=radius*(1-.18*t)*(t>.88?Math.sqrt(Math.max(.03,1-((t-.88)/.125)**2)):1);
        const nr=[];for(let k=0;k<base.length;k++){const a=Math.PI/6+2*Math.PI*k/base.length;nr.push(vertex(vec(p).addScaledVector(e1,Math.cos(a)*rr).addScaledVector(e2,Math.sin(a)*rr*.88).toArray(),vec(g).addScaledVector(e1,Math.cos(a)*rr).addScaledVector(eg2,Math.sin(a)*rr*.88).toArray()));}
        // Ring order is checked geometrically below; one topology for all morph weights.
        for(let k=0;k<ring.length;k++)quad(ring[k],ring[(k+1)%ring.length],nr[(k+1)%ring.length],nr[k]);ring=nr;
      }
      const tip=vertex(path(1.006),gripPath(1.006));for(let k=0;k<ring.length;k++)face(ring[k],ring[(k+1)%ring.length],tip);
    }
    const lengths=[.054,.074,.080,.071],radii=[.0067,.0078,.0082,.0077];
    for(let f=0;f<4;f++){
      const i=f*3,top=ny-1,base=[grid[0][top][i+2],grid[0][top][i+1],grid[0][top][i],grid[1][top][i],grid[1][top][i+1],grid[1][top][i+2]];
      // Rotate the 6-sided ring so k=0 is thumbward; a short socket transition rounds it.
      const x=(xs[i]+xs[i+2])/2,y=topY(x),L=lengths[f],angle=(34+(3-f)*3)*Math.PI/180;
      const path=t=>{const th=angle*t;return[x+(f-1.5)*.002*t,y+L*Math.sin(th)/angle,.001+L*(1-Math.cos(th))/angle];};
      const gp=t=>{const th=L*t/.028;return[x+(f-1.5)*.001*t,y+.028*Math.sin(th),.001+.028*(1-Math.cos(th))];};
      tube(base,path,gp,radii[f],file.includes('_low')?5:12);
    }
    // Thumb branches from the side of the palm; it is not selected by a vertex-position blend.
    const thumbBase=[grid[0][1][nx-1],grid[0][2][nx-1],grid[0][3][nx-1],grid[1][3][nx-1],grid[1][2][nx-1],grid[1][1][nx-1]];
    // The open thumb angles in toward the index. The grip pose then crosses the palm
    // and curves around the bar; the previous outward hook never reached the fingers.
    const thumbPath=t=>[.034-.020*t,.052+.045*t,.002+.002*t*t];
    const bezier=(p0,p1,p2,p3,t)=>p0.map((v,k)=>(1-t)**3*v+3*(1-t)**2*t*p1[k]+3*(1-t)*t*t*p2[k]+t**3*p3[k]);
    const thumbGrip=t=>bezier([.034,.052,.002],[.050,.060,.018],[-.004,.074,.048],[-.010,.088,.031],t);
    let ring=thumbBase;const steps=file.includes('_low')?6:10;
    for(let j=1;j<=steps;j++){
      const t=j/steps,nr=[],p=vec(thumbPath(t)),g=vec(thumbGrip(t)),d=vec(thumbPath(t+.001)).sub(vec(thumbPath(t-.001))).normalize(),dg=vec(thumbGrip(t+.001)).sub(vec(thumbGrip(t-.001))).normalize(),e1=new THREE.Vector3().crossVectors(d,new THREE.Vector3(0,0,1)).normalize(),eg1=new THREE.Vector3().crossVectors(dg,new THREE.Vector3(0,0,1)).normalize(),e2=new THREE.Vector3().crossVectors(e1,d),eg2=new THREE.Vector3().crossVectors(eg1,dg),rr=.010*(1-.28*t)*(t>.88?Math.sqrt(Math.max(.03,1-((t-.88)/.125)**2)):1);
      for(let k=0;k<6;k++){const a=Math.PI/6+2*Math.PI*k/6;nr.push(vertex(p.clone().addScaledVector(e1,Math.cos(a)*rr).addScaledVector(e2,Math.sin(a)*rr).toArray(),g.clone().addScaledVector(eg1,Math.cos(a)*rr).addScaledVector(eg2,Math.sin(a)*rr).toArray()));}
      for(let k=0;k<6;k++)quad(ring[k],ring[(k+1)%6],nr[(k+1)%6],nr[k]);ring=nr;
    }
    const tip=vertex(thumbPath(1.006),thumbGrip(1.006));for(let k=0;k<6;k++)face(ring[k],ring[(k+1)%6],tip);
    // Connect the unchanged cut edge to the palm's proximal rim. Resample only the NEW collar.
    const rim=[...grid[0][0],...grid[1][0].slice().reverse()].sort((a,b)=>Math.atan2(local(a)[2],local(a)[0])-Math.atan2(local(b)[2],local(b)[0]));
    // The collar's first ring is a copy of the wrist cut (same place, weights, normals and morphs) with the skin texel's UV: its quads interpolated the cut's
    // old UVs towards the palm texel and swept the atlas between them (a gold and black band at the wrist). The forearm keeps the cut's own vertices.
    const dupVert=i=>{const v={};for(const s of semantics)v[s]=attrs[s].array.slice(i*attrs[s].size,(i+1)*attrs[s].size);v.TEXCOORD_0=[uv[0],uv[1]];
      const id=append(v,targets.map(t=>Object.fromEntries(Object.keys(t).map(s=>[s,t[s].array.slice(3*i,3*i+3)]))));keepNormal.add(id);return id;};
    const collar=loop.map(dupVert);
    const rings=[collar],collarSteps=file.includes('_low')?1:2;for(let j=1;j<=collarSteps;j++){
      const t=j/(collarSteps+1),rr=[];for(const i of loop){const lp=local(i),angle=Math.atan2(lp[2],lp[0]),x=-.012+Math.cos(angle)*.0245,c=-.006+Math.sin(angle)*.010,pp=[lerp(lp[0],x,smooth(t)),lerp(CUT,.03,t),lerp(lp[2],c,smooth(t))];
        const wh=lerp(hw(i),1,smooth(t)),id=vertex(pp,pp,[handId,wh,faId,1-wh],true);rr.push(id);}
      rings.push(rr);
    }
    for(let j=0;j<rings.length-1;j++)for(let k=0;k<loop.length;k++)quad(rings[j][k],rings[j][(k+1)%loop.length],rings[j+1][(k+1)%loop.length],rings[j+1][k]);
    // Zipper two rings of unequal count, increasing polar angle.
    const last=rings.at(-1),ang=i=>Math.atan2(local(i)[2],local(i)[0]),a=last.map(ang),b=rim.map(ang);a.push(a[0]+2*Math.PI);b.push(b[0]+2*Math.PI);let i=0,j=0;
    while(i<last.length||j<rim.length){if(j===rim.length||(i<last.length&&a[i+1]<b[j+1])){face(last[i%last.length],last[(i+1)%last.length],rim[j%rim.length]);i++;}else{face(last[i%last.length],rim[(j+1)%rim.length],rim[j%rim.length]);j++;}}
    // Consistent winding over the connected replacement, seeded from the outward palm surface.
    // Topology orientation and normal generation are handled after both hands are built.
    const centre=vec(world([-.012,.088,.023])).applyMatrix4(new THREE.Matrix4().fromArray(bone.getWorldMatrix()).invert());
    bone.setExtras({...bone.getExtras(),grip:centre.toArray()});
    report.hands.push({side,removedTriangles:removed,clippedTriangles:clipped,wristBoundaryVertices:loop.length,newVertices:generated.length,uvSample:uv,gripLocal:centre.toArray()});
  }
  // Orient adjacent NEW faces consistently. The retained shell seeds orientation at the collar.
  const posKey=i=>point(i).toArray().map(x=>Math.round(x*1e7)).join(','),edges=new Map(),faces=Array.from({length:indices.length/3},(_,i)=>indices.slice(i*3,i*3+3));
  faces.forEach((f,ti)=>{for(let k=0;k<3;k++){const a=posKey(f[k]),b=posKey(f[(k+1)%3]);if(a===b)continue;const key=[a,b].sort().join('|');if(!edges.has(key))edges.set(key,[]);edges.get(key).push([ti,a<b?1:-1]);}});
  const adjacency=Array.from({length:faces.length},()=>[]);for(const e of edges.values())if(e.length===2){const[[a,da],[b,db]]=e;adjacency[a].push([b,da===db]);adjacency[b].push([a,da===db]);}
  const state=new Int8Array(faces.length);for(let i=0;i<faces.length;i++)if(faces[i].every(v=>v<originalCount))state[i]=1;
  const queue=Array.from({length:faces.length},(_,i)=>i).filter(i=>state[i]);for(let qi=0;qi<queue.length;qi++){const f=queue[qi];for(const [nb,toggle]of adjacency[f])if(!state[nb]){state[nb]=toggle?-state[f]:state[f];queue.push(nb);}}
  if(state.some(s=>s===0))throw Error('Replacement shell disconnected: refusing output');
  faces.forEach((f,i)=>{if(state[i]<0)[f[1],f[2]]=[f[2],f[1]];});indices=faces.flat();
  // Area-weighted smooth normals; existing boundary normals stay byte-identical.
  function normals(morph=false){const out=new Float64Array(P.length),delta=targets[0]?.POSITION?.array;
    const at=i=>{const p=point(i);if(morph&&delta)p.add(new THREE.Vector3().fromArray(delta,3*i));return p;};
    for(const [a,b,c]of faces){if(a<originalCount&&b<originalCount&&c<originalCount)continue;const n=at(b).sub(at(a)).cross(at(c).sub(at(a)));for(const id of[a,b,c])for(let k=0;k<3;k++)out[3*id+k]+=n.getComponent(k);}
    for(let i=originalCount;i<P.length/3;i++){if(keepNormal.has(i))continue;const n=new THREE.Vector3().fromArray(out,3*i).normalize();if(morph){if(targets[0]?.NORMAL)targets[0].NORMAL.array.splice(3*i,3,...n.sub(new THREE.Vector3().fromArray(attrs.NORMAL.array,3*i)).toArray());}else attrs.NORMAL.array.splice(3*i,3,...n.toArray());}
  }normals();normals(true);
  // Drop only unused vertices; retain order and every attribute/morph value of used original vertices.
  const used=new Set(indices),ids=[...used].sort((a,b)=>a-b),remap=new Map(ids.map((id,i)=>[id,i]));
  for(const s of semantics){const a=attrs[s],Type=a.acc.getArray().constructor;const arr=new Type(ids.length*a.size);ids.forEach((id,i)=>arr.set(a.array.slice(id*a.size,(id+1)*a.size),i*a.size));a.acc.setArray(arr);}
  targets.forEach(t=>{for(const s in t){const a=t[s],arr=new Float32Array(ids.length*3);ids.forEach((id,i)=>arr.set(a.array.slice(id*3,id*3+3),i*3));a.acc.setArray(arr);}});
  prim.getIndices().setArray(Uint32Array.from(indices.map(i=>remap.get(i))));mesh.setExtras({...mesh.getExtras(),maleHandRepair:VERSION});
  report.after={vertices:ids.length,triangles:indices.length/3};await io.write(file,doc);report.bytes=fs.statSync(file).size;return report;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))console.log(JSON.stringify(await repairMaleHands(process.argv[2]),null,2));
