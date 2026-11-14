// Numerical integration checks on the actual retained model, rig and finish modules.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {clone} from 'three/examples/jsm/utils/SkeletonUtils.js';
const {shortHair,finishEyes,finishBrows}=await import(pathToFileURL(process.argv[2]).href);
const {Locomotion}=await import(pathToFileURL(process.argv[3]).href);
const bytes=await readFile(new URL('../public/assets/anatomy-study.glb',import.meta.url));
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const checks=[],samples=[];
for(const heavy of [false,true]){
  const root=new THREE.Group(),model=clone(gltf.scene);root.add(model);
  const rest=new Map(),restPositions=new Map();let body;
  model.traverse(o=>{if(o.isBone){rest.set(o,o.quaternion.clone());restPositions.set(o,o.position.clone());}if(o.isSkinnedMesh){o.morphTargetInfluences.fill(0);o.morphTargetInfluences[heavy?1:0]=1;}if(o.name==='Body')body=o;});
  const snapshot={}; for(const [key,a] of Object.entries(body.geometry.attributes))snapshot[key]=[...a.array];
  shortHair(body);finishEyes(model);finishBrows(model);
  assert.equal(model.getObjectByName('Lashes').visible,false);
  assert.ok([...model.getObjectByName('Brows').geometry.getAttribute('studyBrowUv').array].every(Number.isFinite));
  for(const [key,data] of Object.entries(snapshot))assert.deepEqual([...body.geometry.attributes[key].array],data);
  const hair=model.getObjectByName('OriginalShortHair');assert.ok(hair.geometry.attributes.position.count>300);assert.equal(hair.skeleton,body.skeleton);
  for(let i=0;i<hair.geometry.attributes.position.count;i++){
    let sum=0;for(let j=0;j<4;j++)sum+=hair.geometry.attributes.skinWeight.getComponent(i,j);
    assert.ok(Math.abs(sum-1)<1e-6);assert.ok(Number.isFinite(hair.geometry.attributes.position.getX(i)));
  }
  assert.deepEqual(hair.morphTargetInfluences,body.morphTargetInfluences);
  const eyes=model.getObjectByName('Eyes'),head=model.getObjectByName('Head'),eyeSamples=[];
  model.updateMatrixWorld(true);eyes.skeleton.update();
  for(const sign of [-1,1]){
    const front=new THREE.Vector3(0,0,-Infinity),v=new THREE.Vector3();
    for(let i=0;i<eyes.geometry.attributes.position.count;i++){eyes.getVertexPosition(i,v);eyes.localToWorld(v);if(v.x*sign>0&&v.z>front.z)front.copy(v);}
    const pupil=model.getObjectByName(`StudyEye${sign}_2`);const centre=pupil.localToWorld(new THREE.Vector3().fromBufferAttribute(pupil.geometry.attributes.position,0));
    assert.ok(Math.abs(centre.x-front.x)<1e-6);assert.ok(Math.abs(centre.y-front.y)<1e-6);assert.ok(Math.abs(centre.z-front.z-.00046)<1e-6);
    eyeSamples.push({front:front.toArray(),pupil:centre.toArray()});
  }
  checks.push({name:`${heavy?'Heavy':'Athletic'} immutable body, finite normalized shared-rig hair, per-morph curved eye seating`,passed:true});
  root.scale.setScalar(1.07);const walker=new Locomotion({root,body,rest,restPositions});walker.reset();
  const pupil=model.getObjectByName('StudyEye1_2');const expectedLocal=pupil.geometry.attributes.position.array.slice(0,3);let maxAttachmentError=0;
  for(let frame=0;frame<120;frame++){
    walker.setInput(new THREE.Vector3(Math.sin(frame/60),0,Math.cos(frame/60)));walker.update(1/60);root.updateMatrixWorld(true);body.skeleton.update();
    const actual=pupil.localToWorld(new THREE.Vector3(...expectedLocal));const expected=head.localToWorld(new THREE.Vector3(...expectedLocal));maxAttachmentError=Math.max(maxAttachmentError,actual.distanceTo(expected));
    for(let i=0;i<hair.geometry.attributes.position.count;i+=23){const v=hair.getVertexPosition(i,new THREE.Vector3());assert.ok(v.toArray().every(Number.isFinite));}
  }
  assert.ok(maxAttachmentError<1e-10);walker.restore();restPositions.forEach((p,b)=>assert.deepEqual(b.position.toArray(),p.toArray()));
  checks.push({name:`${heavy?'Heavy':'Athletic'} walking attachment, finite skinned scalp and exact rig restoration`,passed:true});
  samples.push({heavy,hairTriangles:hair.geometry.attributes.position.count/3,eyeSamples,maxAttachmentError});
}
const report={timestamp:new Date().toISOString(),checks,samples,passed:checks.length};await writeFile(new URL('../evidence/character-finish.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:checks.length,samples},null,2));
