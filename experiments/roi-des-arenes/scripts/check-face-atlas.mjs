// Integration checks: geometry equivalence, seam integrity and the actual walker.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {clone} from 'three/examples/jsm/utils/SkeletonUtils.js';
const {applyFaceAtlas,applyTexturedFeatures,applyFaceSkin}=await import(pathToFileURL(process.argv[2]).href);
const {Locomotion}=await import(pathToFileURL(process.argv[3]).href);
const bytes=await readFile(new URL('../public/assets/anatomy-study.glb',import.meta.url));
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const atlas=JSON.parse(await readFile(new URL('../public/assets/face-atlas.json',import.meta.url),'utf8'));
const checks=[],samples=[];
function make(heavy,detail){
 const root=new THREE.Group();root.scale.setScalar(1.07);const model=clone(gltf.scene);root.add(model);
 let body;const rest=new Map(),restPositions=new Map();
 model.traverse(o=>{if(o.isBone){rest.set(o,o.quaternion.clone());restPositions.set(o,o.position.clone());}if(o.isSkinnedMesh){o.morphTargetInfluences.fill(0);o.morphTargetInfluences[heavy?1:0]=1;}if(o.name==='Body')body=o;});
 if(detail){body.geometry=applyFaceAtlas(body.geometry,atlas);applyTexturedFeatures(model,{skin:new THREE.Texture(),eyes:new THREE.Texture(),brows:new THREE.Texture(),lashes:new THREE.Texture(),atlas});}
 const walker=new Locomotion({root,body,rest,restPositions});walker.reset();return {root,model,body,rest,restPositions,walker};
}
const source=gltf.scene.getObjectByName('Body').geometry, remapped=applyFaceAtlas(source,atlas);
for(const [name,a] of Object.entries(source.attributes)){
 const b=remapped.getAttribute(name);assert.equal(b.itemSize,a.itemSize);assert.equal(b.normalized,a.normalized);
 atlas.source_vertices.forEach((old,i)=>{for(let j=0;j<a.itemSize;j++)assert.equal(b.getComponent(i,j),a.getComponent(old,j));});
}
for(const [name,targets] of Object.entries(source.morphAttributes))targets.forEach((a,k)=>{
 const b=remapped.morphAttributes[name][k];atlas.source_vertices.forEach((old,i)=>{for(let j=0;j<a.itemSize;j++)assert.equal(b.getComponent(i,j),a.getComponent(old,j));});
});
assert.equal(remapped.index.count,source.index.count);
for(let i=0;i<source.index.count;i++)assert.equal(atlas.source_vertices[remapped.index.getX(i)],source.index.getX(i));
assert.equal(remapped.getAttribute('faceUv').count,6965);
checks.push({name:'Every position/normal/color/skin/morph component and every original triangle retained exactly after 643 UV seam copies',passed:true});
assert.throws(()=>applyFaceAtlas(source,{...atlas,study_sha256:'other'}));
assert.throws(()=>applyFaceAtlas(source,{...atlas,uv:[NaN,...atlas.uv.slice(1)]}));
assert.throws(()=>applyFaceAtlas(source,{...atlas,indices:[atlas.indices[1],...atlas.indices.slice(1)]}));
checks.push({name:'Mismatched asset, invalid UV and changed topology rejected',passed:true});
for(const heavy of [false,true]){
 const plain=make(heavy,false),detailed=make(heavy,true);let maxTrajectoryError=0,maxSkinError=0;
 for(let frame=0;frame<180;frame++){
   const angle=frame<60?0:frame<120?Math.PI/2:Math.PI;const input=frame<150?new THREE.Vector3(Math.sin(angle),0,Math.cos(angle)):new THREE.Vector3();
   plain.walker.setInput(input);detailed.walker.setInput(input);plain.walker.update(1/60);detailed.walker.update(1/60);
   maxTrajectoryError=Math.max(maxTrajectoryError,plain.root.position.distanceTo(detailed.root.position));
   plain.root.updateMatrixWorld(true);detailed.root.updateMatrixWorld(true);plain.body.skeleton.update();detailed.body.skeleton.update();
   for(const old of [24,1579,1765,3530,3773,6151]){
     const a=plain.body.getVertexPosition(old,new THREE.Vector3()),b=detailed.body.getVertexPosition(old,new THREE.Vector3());maxSkinError=Math.max(maxSkinError,a.distanceTo(b));
   }
   assert.ok(detailed.model.getObjectByName('Eyes').skeleton.bones.every((b,i)=>b===detailed.body.skeleton.bones[i]), 'Eye bone references match the body rig');
 }
 assert.ok(maxTrajectoryError<1e-10);assert.ok(maxSkinError<1e-10);
 detailed.walker.restore();detailed.restPositions.forEach((p,b)=>assert.deepEqual(b.position.toArray(),p.toArray()));
 checks.push({name:`${heavy?'Heavy':'Athletic'} identical turn/stop trajectory, identical morphed/skinned face anchors and rig restoration`,passed:true});
 samples.push({heavy,maxTrajectoryError,maxSkinError,vertices:detailed.body.geometry.attributes.position.count,eyesUV:detailed.model.getObjectByName('Eyes').geometry.attributes.uv.count});
}
const materials=[new THREE.MeshStandardMaterial(),new THREE.MeshStandardMaterial()];
const shaders=materials.map((material,i)=>{
 applyFaceSkin(material,new THREE.Texture(),i===1);
 const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>'};
 material.onBeforeCompile(shader,undefined);return shader;
});
assert.notEqual(shaders[0].fragmentShader,shaders[1].fragmentShader);
assert.notEqual(materials[0].customProgramCacheKey(),materials[1].customProgramCacheKey());
checks.push({name:'Distinct emitted per-profile skin shaders have distinct program cache keys',passed:true});
const report={timestamp:new Date().toISOString(),checks,passed:checks.length,samples};await writeFile(new URL('../evidence/WEB-004-face-integration.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
