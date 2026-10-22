// Rebuild ONLY the male's defective hand shells. No service, source archive or Blender needed.
// Runs LAST in build-bodies, after low simplification, grip/shave and texture padding.
// Existing wrist cut edges, textures/material, skeleton, inverse binds and animation accessors survive.
//  - Shape: an adult male's hand (palm 75 mm wide, fingers 15 to 18.5 mm wide with a 2 mm web, a thumb that leaves the palm's side socket); the digits' centrelines are checked
//    against their radii, open and closed on the bar, and the build refuses a pair that touches. Fingertips close into hemispheres. Slivers cut at the wrist are dropped, so the
//    mesh gains no non-manifold edge (scripts/meshy/audit-male-hands.mjs).
//  - Colour: the atlas is untouched. The hand is mapped, smoothly and without a seam, onto an all-skin patch of the atlas that matches what the forearm shows at the wrist
//    (the forearm's triangles are sampled, not only its vertices), and the wrist collar takes, vertex by vertex, the patch texel nearest to its forearm vertex's own texel.
// Usage: node scripts/meshy/repair-male-hands.mjs public/assets/meshy/body_m[_low].glb
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as THREE from 'three';
import sharp from 'sharp';
const VERSION = 4, CUT = -.025;
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
  const wkey=i=>[0,1,2].map(k=>Math.round(P[3*i+k]*1e5)).join(',');
  const append=(values,morphs=[])=>{const id=P.length/3;for(const s of semantics)attrs[s].array.push(...values[s]);targets.forEach((t,k)=>{for(const s in t)t[s].array.push(...(morphs[k]?.[s]??[0,0,0]));});return id;};
  // The atlas is a patchwork of Meshy islands and the old hand's UVs are scattered across all of it: nothing of it can be fitted to the new fingers. The new hand is
  // mapped smoothly (a seam would be a ring) onto a small all-skin rectangle of the atlas that has the forearm's own colour and real shading, and the wrist collar picks,
  // vertex by vertex, the patch texel nearest to the colour its forearm vertex shows: forearm and hand meet in the same colour, for every tone the shader re-tones them to.
  const {data:img,info}=await sharp(Buffer.from(root.listTextures()[0].getImage())).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const texelAt=(u,v)=>{const x=Math.min(info.width-1,Math.floor(u*info.width)),y=Math.min(info.height-1,Math.floor(v*info.height)),o=(y*info.width+x)*3;return[img[o],img[o+1],img[o+2]];};
  const texel=i=>texelAt(UV[2*i],UV[2*i+1]),colourDist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  // What the forearm shows near the wrist is what its triangles sweep across the atlas, not its vertices' texels: sample the triangles (area weighted), both arms.
  const jointFrame=side=>{const m=n=>new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(joints.find(j=>j.getName()===n).getWorldMatrix()));const wr=m('hand.'+side),el=m('forearm.'+side);return{wr,Y:wr.clone().sub(el).normalize()};};
  const foreSamples=[],foreVerts=[];
  for(const side of ['L','R']){
    const {wr,Y}=jointFrame(side),faId=joints.findIndex(j=>j.getName()==='forearm.'+side),fw=i=>{let w=0;for(let k=0;k<4;k++)if(J[4*i+k]===faId)w+=W[4*i+k];return w;},ay=i=>point(i).sub(wr).dot(Y);
    for(let t=0;t<originalIndices.length;t+=3){const tri=originalIndices.slice(t,t+3);if(!tri.every(i=>fw(i)>.9&&ay(i)<CUT+.06))continue;
      const [a,b,c]=tri.map(point);
      for(let m=0;m<12;m++)for(let n=0;n<12-m;n++){const u=(m+.5)/12,v=(n+.5)/12,w=1-u-v,y=a.dot(Y)*w+b.dot(Y)*u+c.dot(Y)*v-wr.dot(Y);
        if(y>CUT||y<-.065)continue;const x=[0,1].map(k=>UV[2*tri[0]+k]*w+UV[2*tri[1]+k]*u+UV[2*tri[2]+k]*v);foreSamples.push({c:texelAt(x[0],x[1]),w:1});}
    }
    for(let i=0;i<originalCount;i++)if(fw(i)>.99&&ay(i)<CUT+.002&&ay(i)>-.065)foreVerts.push(texel(i));
  }
  if(foreSamples.length<60)throw Error('Unexpected male topology: no forearm skin to match');
  const sw=foreSamples.reduce((a,x)=>a+x.w,0),foreMean=[0,1,2].map(c=>foreSamples.reduce((a,x)=>a+x.c[c]*x.w,0)/sw);
  const PATCH=Math.max(16,Math.round(40*info.width/1024)),patch=(()=>{let best=null;
    const step=Math.max(2,PATCH/10)|0;for(let y0=0;y0+PATCH<=info.height;y0+=step)for(let x0=0;x0+PATCH<=info.width;x0+=step){
      let n=0,bad=0;const sum=[0,0,0],sq=[0,0,0];
      for(let j=0;j<PATCH;j+=2)for(let i=0;i<PATCH;i+=2){const o=((y0+j)*info.width+x0+i)*3;n++;if(Math.hypot(img[o]-foreMean[0],img[o+1]-foreMean[1],img[o+2]-foreMean[2])>60)bad++;for(let c=0;c<3;c++){sum[c]+=img[o+c];sq[c]+=img[o+c]**2;}}
      if(bad)continue;const m=sum.map(v=>v/n),dev=colourDist(m,foreMean),sd=Math.sqrt(sq.reduce((a,v,c)=>a+v/n-m[c]**2,0)/3);
      // nearest to the forearm's colour, with some grain left in it (a flat patch would be a flat hand)
      const score=dev+Math.max(0,4-sd)*2+Math.max(0,sd-9)*1.5;if(!best||score<best.score)best={x0,y0,score,dev,sd};}
    if(!best)throw Error('No skin patch found in the atlas');return best;})();
  const patchTexels=[];for(let j=2;j<PATCH-2;j++)for(let i=2;i<PATCH-2;i++){const x=patch.x0+i,y=patch.y0+j;patchTexels.push({u:(x+.5)/info.width,v:(y+.5)/info.height,c:texelAt((x+.5)/info.width,(y+.5)/info.height),d:Math.hypot(i-PATCH/2,j-PATCH/2)});}
  const patchC=[(patch.x0+PATCH/2)/info.width,(patch.y0+PATCH/2)/info.height],patchHalf=(PATCH/2-3)/info.width;
  // folded (mirrored) so the mapping never leaves the patch and never jumps
  const tri=x=>Math.abs((((x+1)%4)+4)%4-2)-1;
  const uvOf=p=>[patchC[0]+patchHalf*tri((p[0]+.6*p[2])/.055),patchC[1]+patchHalf*tri((p[1]-.065+.35*p[2]-.3*p[0])/.11)];
  report.skinPatch={x:patch.x0,y:patch.y0,size:PATCH,forearmMean:foreMean.map(Math.round),forearmVertexMean:[0,1,2].map(c=>Math.round(foreVerts.reduce((a,t)=>a+t[c],0)/foreVerts.length)),patchDeviation:+patch.dev.toFixed(2),patchGrain:+patch.sd.toFixed(2)};
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
      for(let k=1;k<poly.length-1;k++){const f=[poly[0],poly[k],poly[k+1]];
        // a cut through a vertex (or along a UV seam's twin) leaves slivers with two vertices in one place: no area, but an extra face on their edge
        if(new Set(f.map(wkey)).size===3)next.push(...f);}if(cross.length===2)segments.push(cross);clipped++;
    }
    indices=next;
    // UV seams carry duplicate cut vertices: weld positions ONLY for ordering the collar loop.
    const key=wkey,reps=new Map(),adj=new Map();
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
      values.POSITION=world(p);values.NORMAL=[0,0,0];values.TEXCOORD_0=uvOf(p);values.JOINTS_0=[weights[0],weights[2]??0,0,0];values.WEIGHTS_0=[weights[1],weights[3]??0,0,0];
      const delta=vec(world(g)).sub(vec(values.POSITION)).toArray(),morphs=targets.map((_,k)=>({POSITION:k===0?delta:[0,0,0],NORMAL:[0,0,0]}));const id=append(values,morphs);generated.push(id);return id;
    }
    function face(a,b,c){if(a===b||b===c||c===a)return;if(flip)indices.push(a,c,b);else indices.push(a,b,c);}
    const quad=(a,b,c,d)=>{face(a,b,c);face(a,c,d);};
    // Hand proportions of an adult male (metres; design space: x towards the thumb, y along the forearm, z towards the palm). The fingers are 15 to 18.5 mm wide with a
    // 2 mm web between them and fan out a little towards their tips; the four fingers and the thumb are checked below not to touch, at rest and closed on the bar.
    const radii=[.0075,.0086,.0093,.0088],lengths=[.056,.076,.082,.073],gap=.0022,splay=.0018,taper=.12,GRIP_R=.028;
    const total=2*radii.reduce((a,r)=>a+r,0)+3*gap,HW=total/2,xs=[],fingerX=[];let xc=-HW;
    for(let f=0;f<4;f++){xs.push(xc,xc+radii[f],xc+2*radii[f]);fingerX.push(xc+radii[f]);xc+=2*radii[f]+gap;}
    const ys=[.030,.040,.052,.064,.076,1],topY=x=>.086+.007*Math.cos((x+.002)/HW*Math.PI*.6)-.004*Math.max(0,-x/HW);
    // Continuous palm shell: four open knuckle sockets and a side socket for the thumb.
    const grid=[[],[]],gp=[[],[]];
    for(let s=0;s<2;s++)for(let j=0;j<ys.length;j++){grid[s][j]=[];gp[s][j]=[];for(let i=0;i<xs.length;i++){
      const y=j===ys.length-1?topY(xs[i]):ys[j],width=j===0?.66:j===1?.83:j===2?.96:1,x=xs[i]*width;
      const depth=(s===0?1:-1)*(.0105+(s===0?.001:.0025)*Math.sin((y-.03)/.065*Math.PI))*(1-.22*smooth((y-.066)/.027))*Math.sqrt(1-.72*(x/(HW+.002))**2);   // (the knuckle line rounds off to the fingers' own thickness)
      gp[s][j][i]=[x,y,depth];grid[s][j][i]=vertex([x,y,depth]);
    }}
    const ny=ys.length,nx=xs.length;
    for(let s=0;s<2;s++)for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){const [a,b,c,d]=[grid[s][j][i],grid[s][j][i+1],grid[s][j+1][i+1],grid[s][j+1][i]];if(s===0)quad(a,b,c,d);else quad(d,c,b,a);}
    // Outer side walls; right rows 1..3 are the thumb socket.
    for(let j=0;j<ny-1;j++){
      quad(grid[1][j][0],grid[0][j][0],grid[0][j+1][0],grid[1][j+1][0]);
      if(j!==1&&j!==2)quad(grid[0][j][nx-1],grid[1][j][nx-1],grid[1][j+1][nx-1],grid[0][j+1][nx-1]);
    }
    for(const i of [2,5,8])quad(grid[0][ny-1][i],grid[0][ny-1][i+1],grid[1][ny-1][i+1],grid[1][ny-1][i]);
    const low=file.includes('_low'),X=new THREE.Vector3(1,0,0);
    // A digit is a tube whose last rings close into a hemisphere (no point, no flat end): rings [t, radius factor] along a centreline that is given twice, open and closed on the bar.
    const dome=low?[40,75]:[22,44,66,83];
    const plan=(tc,steps)=>[...Array(steps).keys()].map(j=>[tc*(j+1)/steps,1]).concat(dome.map(d=>[tc+(1-tc)*Math.sin(d*Math.PI/180),Math.cos(d*Math.PI/180)]));
    function close(ring,tip){for(let k=0;k<ring.length;k++)face(ring[k],ring[(k+1)%ring.length],tip);}
    const dir=(path,t)=>vec(path(Math.min(1,t+.001))).sub(vec(path(Math.max(0,t-.001)))).normalize();
    function finger(f,base){
      const L=lengths[f],angle=(34+(3-f)*3)*Math.PI/180,x=fingerX[f],y=topY(x),rr=t=>radii[f]*(1-taper*Math.min(t,1));
      const path=t=>{const th=angle*t;return[x+(f-1.5)*splay*t,y+L*Math.sin(th)/angle,.001+L*(1-Math.cos(th))/angle];};
      const grip=t=>{const th=L*t/GRIP_R;return[x+(f-1.5)*.001*t,y+GRIP_R*Math.sin(th),.001+GRIP_R*(1-Math.cos(th))];};
      const tc=1-rr(1)/L;let ring=base;
      for(const [t,fac] of plan(tc,low?5:12)){
        const p=path(t),g=grip(t),e2=new THREE.Vector3().crossVectors(X,dir(path,t)).normalize(),eg2=new THREE.Vector3().crossVectors(X,dir(grip,t)).normalize(),r=rr(Math.min(t,tc))*fac,nr=[];
        for(let k=0;k<base.length;k++){const a=Math.PI/6+2*Math.PI*k/base.length;nr.push(vertex(vec(p).addScaledVector(X,Math.cos(a)*r).addScaledVector(e2,Math.sin(a)*r*.88).toArray(),vec(g).addScaledVector(X,Math.cos(a)*r).addScaledVector(eg2,Math.sin(a)*r*.88).toArray()));}
        for(let k=0;k<ring.length;k++)quad(ring[k],ring[(k+1)%ring.length],nr[(k+1)%ring.length],nr[k]);ring=nr;
      }
      close(ring,vertex(path(1),grip(1)));
      return{path,grip,r:rr};
    }
    const digits=[];
    for(let f=0;f<4;f++){const i=f*3,top=ny-1;digits.push(finger(f,[grid[0][top][i+2],grid[0][top][i+1],grid[0][top][i],grid[1][top][i],grid[1][top][i+1],grid[1][top][i+2]]));}
    // Thumb: leaves the palm's side socket straight out (no ledge), thickens over the thenar, then points forward alongside the index and, closed, crosses the palm to the bar.
    const sock=[[0,1],[0,2],[0,3],[1,3],[1,2],[1,1]].map(([s,j])=>gp[s][j][nx-1]),thumbBase=[[0,1],[0,2],[0,3],[1,3],[1,2],[1,1]].map(([s,j])=>grid[s][j][nx-1]);
    const c0=[0,1,2].map(c=>sock.reduce((a,q)=>a+q[c],0)/6),offs=sock.map(q=>q.map((v,c)=>v-c0[c])),r0=offs.reduce((a,o)=>a+Math.hypot(...o),0)/6,thumbAng=offs.map(o=>Math.atan2(o[2],o[1]));
    const bezier=(p0,p1,p2,p3,t)=>p0.map((v,k)=>(1-t)**3*v+3*(1-t)**2*t*p1[k]+3*(1-t)*t*t*p2[k]+t**3*p3[k]);
    const thumbPath=t=>bezier(c0,[c0[0]+.006,c0[1]+.014,c0[2]+.004],[.047,.078,.011],[.046,.103,.013],t);
    const thumbGrip=t=>bezier(c0,[c0[0]+.018,c0[1]+.006,c0[2]+.006],[-.004,.074,.048],[-.010,.088,.031],t);
    const thumbR=t=>lerp(r0,.0102,smooth(t/.25))*(1-.16*smooth((t-.25)/.75));
    let tcThumb=1;{let len=0,prev=vec(thumbPath(1));for(let t=1;t>0&&len<thumbR(1);t-=.002){const q=vec(thumbPath(t));len+=q.distanceTo(prev);prev=q;tcThumb=t;}}
    {let ring=thumbBase;
      for(const [t,fac] of plan(tcThumb,low?6:10)){
        const q=new THREE.Quaternion().setFromUnitVectors(X,dir(thumbPath,t)),qg=new THREE.Quaternion().setFromUnitVectors(X,dir(thumbGrip,t)),s=thumbR(Math.min(t,tcThumb))*fac,m=smooth(t/.3),nr=[];
        for(let k=0;k<6;k++){
          const o=[0,1,2].map(c=>lerp(offs[k][c],c===0?0:r0*(c===1?Math.cos(thumbAng[k]):Math.sin(thumbAng[k])),m)*s/r0),off=vec(o);
          nr.push(vertex(vec(thumbPath(t)).add(off.clone().applyQuaternion(q)).toArray(),vec(thumbGrip(t)).add(off.clone().applyQuaternion(qg)).toArray()));
        }
        for(let k=0;k<6;k++)quad(ring[k],ring[(k+1)%6],nr[(k+1)%6],nr[k]);ring=nr;
      }
      close(ring,vertex(thumbPath(1),thumbGrip(1)));
    }
    digits.push({path:thumbPath,grip:thumbGrip,r:thumbR});
    // The digits must not touch or cross: centrelines against the radii, open and closed (the first tenth of a digit is its own socket in the palm).
    const names=['pinky','ring','middle','index','thumb'];
    for(const pose of ['path','grip']){
      const pts=digits.map(d=>Array.from({length:41},(_,k)=>({p:vec(d[pose](k/40)),r:d.r(k/40),t:k/40})));
      for(let a=0;a<5;a++)for(let b=a+1;b<5;b++){
        let min=1e9;for(const u of pts[a])for(const v of pts[b])if(u.t>.12&&v.t>.12||(a<4&&b<4))min=Math.min(min,u.p.distanceTo(v.p)-u.r-v.r);
        const key=`${names[a]}-${names[b]}:${pose==='path'?'rest':'grip'}`;(report.clearance??={})[key]=+(min*1e3).toFixed(2);
        // millimetres of flesh between two digits; fingers never touch, the thumb may rest against the closed fingers but never cut through them
        if(min<(pose==='path'?.0005:b===4?-.0015:.0003))throw Error(`Digits ${key} intersect (${(min*1e3).toFixed(2)} mm)`);
      }
    }
    // Connect the unchanged cut edge to the palm's proximal rim. Resample only the NEW collar.
    const rim=[...grid[0][0],...grid[1][0].slice().reverse()].sort((a,b)=>Math.atan2(local(a)[2],local(a)[0])-Math.atan2(local(b)[2],local(b)[0]));
    // The collar's first ring is a copy of the wrist cut (same place, weights, normals and morphs) with the skin texel's UV: its quads interpolated the cut's
    // old UVs towards the palm texel and swept the atlas between them (a gold and black band at the wrist). The forearm keeps the cut's own vertices.
    const nearestSkin=c=>{let b=patchTexels[0],bs=1e9;for(const t of patchTexels){const sc=colourDist(t.c,c)+.15*t.d;if(sc<bs){bs=sc;b=t;}}return[b.u,b.v];};
    const dupVert=i=>{const v={};for(const s of semantics)v[s]=attrs[s].array.slice(i*attrs[s].size,(i+1)*attrs[s].size);v.TEXCOORD_0=nearestSkin(texel(i));
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
    report.hands.push({side,removedTriangles:removed,clippedTriangles:clipped,wristBoundaryVertices:loop.length,newVertices:generated.length,gripLocal:centre.toArray()});
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
    for(const [a,b,c]of faces){if(a<originalCount&&b<originalCount&&c<originalCount)continue;const pa=at(a),pb=at(b),pc=at(c),n=pb.clone().sub(pa).cross(pc.clone().sub(pa)).normalize();
      // weighted by the corner's angle: a sliver of a quad must not decide the normal of the vertex it shares with a tube (the web between thumb and palm)
      for(const [id,u,v]of[[a,pb,pc],[b,pc,pa],[c,pa,pb]]){const p0=id===a?pa:id===b?pb:pc,w=Math.acos(Math.max(-1,Math.min(1,u.clone().sub(p0).normalize().dot(v.clone().sub(p0).normalize()))))||0;for(let k=0;k<3;k++)out[3*id+k]+=n.getComponent(k)*w;}}
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
