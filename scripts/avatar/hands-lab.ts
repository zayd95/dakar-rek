// Local diagnostic viewer. Crops the draw indices only, never the saved model.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Humanoid, preloadHumanoid } from '../../src/actors/humanoid';
import { loadPlayerBody } from '../../src/actors/playerBody';
import { STUDIO_LIGHT } from '../../src/ui/studioStage';
const q = new URLSearchParams(location.search), cell = +(q.get('cell') || 360);
const wholeArm = q.has('wholeArm'), armOnly = q.has('armOnly');
const renderer = new THREE.WebGLRenderer({canvas:document.querySelector('canvas')!,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setSize(cell*3,cell*2);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
const scene=new THREE.Scene();scene.background=new THREE.Color('#29313e');for(const l of STUDIO_LIGHT())scene.add(l);
const url=q.get('file') || `${q.has('before')?'/_before/':'/'}assets/meshy/body_m.glb`, raw=await new GLTFLoader().loadAsync(url);
let group:THREE.Object3D=raw.scene, h:Humanoid|undefined;
const clip=q.get('clip')||'rest';
if(clip!=='rest'){
 await preloadHumanoid();
 const id=await loadPlayerBody('homme',q.has('low'),q.has('before')?'/_before/':'/'); h=new Humanoid(undefined,id);h.fullRate=true; h.setAppearance({hair:'natural',skin:2,outfit:0,color:1});group=h.group;
 const speed=({Walk:1.4,Jog:3,Run:5.5} as Record<string,number>)[clip]||0;
 if(!speed && clip!=='Idle')h.hold=clip as never;
 for(let i=0;i<Math.round(+(q.get('time')||1.2)*60);i++){group.position.z+=speed/60;h.animate(1/60,speed);}group.position.set(0,0,0);
}
scene.add(group);group.updateMatrixWorld(true);
const mesh:THREE.SkinnedMesh[]=[];group.traverse(o=>{if((o as THREE.SkinnedMesh).isSkinnedMesh)mesh.push(o as THREE.SkinnedMesh);else if((o as THREE.Mesh).isMesh)o.visible=false;});
const originals=mesh.map(m=>m.geometry);
function bone(side:string){return group.getObjectByName('hand.'+side)||group.getObjectByName('hand'+side)!;}
const frames:Record<string,{along:THREE.Vector3;normal:THREE.Vector3;across:THREE.Vector3}>= {};
// Rest frame is taken from the raw rig, then transported through the animated hand bone.
for(const side of ['L','R']){
 const b=(raw.scene.getObjectByName('hand.'+side)||raw.scene.getObjectByName('hand'+side))!,f=(raw.scene.getObjectByName('forearm.'+side)||raw.scene.getObjectByName('forearm'+side))!;
 raw.scene.updateMatrixWorld(true);const wr=b.getWorldPosition(new THREE.Vector3()),el=f.getWorldPosition(new THREE.Vector3());
 const along=wr.sub(el).normalize(),normal=new THREE.Vector3(side==='L'?-1:1,0,0);normal.addScaledVector(along,-normal.dot(along)).normalize();const across=new THREE.Vector3().crossVectors(along,normal),inv=b.getWorldQuaternion(new THREE.Quaternion()).invert();
 frames[side]={along:along.applyQuaternion(inv),normal:normal.applyQuaternion(inv),across:across.applyQuaternion(inv)};
}
const cam=new THREE.OrthographicCamera(...(wholeArm?[-.28,.28,.28,-.28,.001,10]:[-.125,.125,.125,-.125,.001,10]));
renderer.setScissorTest(true);
const metrics:any[]=[];
for(const [si,side]of ['L','R'].entries()){
 for(const [mi,m]of mesh.entries()){
 const g=originals[mi],js=g.getAttribute('skinIndex'),ws=g.getAttribute('skinWeight'),armNames=['shoulder.','upper_arm.','forearm.','hand.'].map(n=>(n+side).replace('.','')),ids=m.skeleton.bones.map((b,i)=>armNames.includes(b.name.replace('.',''))?i:-1).filter(i=>i>=0),handIds=m.skeleton.bones.map((b,i)=>b.name.replace('.','')==='hand'+side?i:-1).filter(i=>i>=0),index=g.index!,keep:number[]=[];
 if(armOnly)for(let t=0;t<index.count;t+=3){const tri=[index.getX(t),index.getX(t+1),index.getX(t+2)];if(tri.every(v=>[0,1,2,3].some(k=>ids.includes(js.getComponent(v,k))&&ws.getComponent(v,k)>.05)))keep.push(...tri);}
 else if(!wholeArm)for(let t=0;t<index.count;t+=3){const tri=[index.getX(t),index.getX(t+1),index.getX(t+2)];if(tri.some(v=>[0,1,2,3].some(k=>handIds.includes(js.getComponent(v,k))&&ws.getComponent(v,k)>.05)))keep.push(...tri);}
 m.geometry=g.clone();if(armOnly||!wholeArm)m.geometry.setIndex(keep);if(q.has('clay'))m.material=new THREE.MeshLambertMaterial({color:0xbb8c6c,wireframe:q.has('wire')});
 }
 const b=bone(side),rot=b.getWorldQuaternion(new THREE.Quaternion()),wr=b.getWorldPosition(new THREE.Vector3()),f=frames[side],along=f.along.clone().applyQuaternion(rot),normal=f.normal.clone().applyQuaternion(rot),across=f.across.clone().applyQuaternion(rot);
 const elbow=group.getObjectByName('forearm.'+side)||group.getObjectByName('forearm'+side)!,target=wholeArm?wr.clone().add(elbow.getWorldPosition(new THREE.Vector3())).multiplyScalar(.5):wr.clone().addScaledVector(along,.078);
 for(const[vi,view]of ['palm','back','profile'].entries()){
 const dir=view==='palm'?normal.clone():view==='back'?normal.clone().negate():across.clone();cam.up.copy(along).negate();cam.position.copy(target).addScaledVector(dir,.4);cam.lookAt(target);cam.updateMatrixWorld();
 renderer.setViewport(vi*cell,(1-si)*cell,cell,cell);renderer.setScissor(vi*cell,(1-si)*cell,cell,cell);renderer.render(scene,cam);
 }
 metrics.push({side,wrist:wr.toArray(),frame:{along:along.toArray(),normal:normal.toArray()}});
}
Object.assign(window,{__ready:true,__hands:{renderer,scene,group,h,metrics}});
