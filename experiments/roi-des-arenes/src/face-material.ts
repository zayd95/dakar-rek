import * as THREE from 'three';

export type FaceAtlas = { study_sha256: string; original_vertices: number; source_vertices: number[]; uv: number[]; indices: number[] };
export type FaceAssets = { atlas: FaceAtlas; skin: THREE.Texture; eyes: THREE.Texture; brows: THREE.Texture; lashes: THREE.Texture };

// Only split UV seams; every resulting vertex is an exact copy of retained
// position/normal/color/skin/morph attributes. No new anatomy or bone transform.
export function applyFaceAtlas(source: THREE.BufferGeometry, atlas: FaceAtlas) {
  const count=source.getAttribute('position').count;
  if(atlas.study_sha256!=='990f1806a19e940e66b67a1482dcda8509a90e206cae948bbf89f6b4274d9257' || atlas.original_vertices!==count || atlas.uv.length!==atlas.source_vertices.length*2 || atlas.indices.length!==source.index!.count)throw new Error('Face atlas does not match retained geometry');
  if(!atlas.source_vertices.every(i=>Number.isInteger(i)&&i>=0&&i<count) || !atlas.uv.every(v=>Number.isFinite(v)&&v>=0&&v<=1) || !atlas.indices.every((v,i)=>Number.isInteger(v)&&v>=0&&v<atlas.source_vertices.length&&atlas.source_vertices[v]===source.index!.getX(i)))throw new Error('Invalid face atlas seam mapping');
  const duplicate=(a:THREE.BufferAttribute|THREE.InterleavedBufferAttribute)=>{
    const data=a.array;
    const Constructor=data.constructor as {new(size:number):THREE.TypedArray};
    const output=new Constructor(atlas.source_vertices.length*a.itemSize);
    atlas.source_vertices.forEach((original,i)=>{for(let j=0;j<a.itemSize;j++)output[i*a.itemSize+j]=a.getComponent(original,j);});
    // Retained arrays are non-normalized float/ushort; reject an incompatible future asset.
    if(a.normalized)throw new Error('Unexpected normalized face attribute');
    return new THREE.BufferAttribute(output,a.itemSize);
  };
  const geometry=new THREE.BufferGeometry();
  for(const [name,a] of Object.entries(source.attributes))geometry.setAttribute(name,duplicate(a));
  for(const [name,targets] of Object.entries(source.morphAttributes))geometry.morphAttributes[name]=targets.map(duplicate);
  geometry.morphTargetsRelative=source.morphTargetsRelative;
  geometry.setAttribute('faceUv',new THREE.Float32BufferAttribute(atlas.uv,2));geometry.setIndex(atlas.indices);
  return geometry;
}

export async function loadFaceAssets(base: string): Promise<FaceAssets> {
  const loader=new THREE.TextureLoader();
  const texture=async(name:string)=>{const t=await loader.loadAsync(base+name);t.flipY=false;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;};
  const atlasPromise=fetch(base+'face-atlas.json').then(r=>{if(!r.ok)throw new Error('Face atlas unavailable');return r.json() as Promise<FaceAtlas>;});
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    const result=await Promise.race([
      Promise.all([atlasPromise,texture('skin_m.png'),texture('eye_brown.png'),texture('brows.png'),texture('lashes.png')]),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Face detail loading timed out')),6000);})
    ]);
    const [atlas,skin,eyes,brows,lashes]=result;return {atlas,skin,eyes,brows,lashes};
  } finally {clearTimeout(timer);}
}

export function applyFaceSkin(material: THREE.MeshStandardMaterial, texture: THREE.Texture, heavy: boolean) {
  const prior=material.onBeforeCompile.bind(material);
  const priorKey=material.customProgramCacheKey();
  const detail={value:1};material.userData.faceDetail=detail;
  material.customProgramCacheKey=()=>priorKey+`-licensed-face-v1-${heavy ? 'heavy' : 'athletic'}`;
  material.onBeforeCompile=(shader,renderer)=>{
    prior(shader,renderer);
    shader.uniforms.studyFaceTexture={value:texture};shader.uniforms.studyFaceDetail=detail;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 faceUv; varying vec2 vStudyFaceUv;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvStudyFaceUv=faceUv;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D studyFaceTexture; uniform float studyFaceDetail; varying vec2 vStudyFaceUv;')
      .replace('#include <color_fragment>',`#include <color_fragment>
        float faceBlend=smoothstep(1.50,1.60,vStudySurface.y)*studyFaceDetail;
        vec3 faceAlbedo=texture2D(studyFaceTexture,vStudyFaceUv).rgb;
        diffuseColor.rgb=mix(diffuseColor.rgb,faceAlbedo*${heavy?'vec3(.88,.88,.88)':'vec3(1.0)'},faceBlend);
      `)
      .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor,.62,faceBlend);
      `);
  };
}

export function applyTexturedFeatures(model:THREE.Object3D,assets:FaceAssets) {
  const materials:THREE.MeshStandardMaterial[]=[];
  for(const [name,map] of [['Eyes',assets.eyes],['Brows',assets.brows],['Lashes',assets.lashes]] as const){
    const mesh=model.getObjectByName(name) as THREE.SkinnedMesh;if(!mesh)throw new Error('Face component missing');
    const material=name==='Eyes'
      ? new THREE.MeshPhysicalMaterial({color:'#eee8dc',map,roughness:.20,clearcoat:.65,clearcoatRoughness:.06,ior:1.38})
      : new THREE.MeshStandardMaterial({color:'#c6bcb0',map,roughness:.92,alphaTest:name==='Brows'?.25:.45,alphaToCoverage:true,side:THREE.DoubleSide});
    if(name==='Eyes'){
      // Preserve the licensed iris strands, reducing the atlas's strong red saturation.
      material.customProgramCacheKey=()=> 'muted-brown-eye-v1';
      material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        vec3 eyeSample=diffuseColor.rgb;
        float pigment=step(eyeSample.g*1.45,eyeSample.r)*step(eyeSample.b*1.5,eyeSample.r);
        float irisValue=dot(eyeSample,vec3(.2126,.7152,.0722));
        diffuseColor.rgb=mix(eyeSample,vec3(irisValue*.95,irisValue*.72,irisValue*.50),pigment*.90);
      `);};
    }
    if(name==='Lashes'){
      material.customProgramCacheKey=()=> 'restrained-upper-lashes-v1';
      material.onBeforeCompile=shader=>{
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float vLashHeight;')
          .replace('#include <begin_vertex>','#include <begin_vertex>\nvLashHeight=position.y;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vLashHeight;')
          .replace('#include <alphatest_fragment>','diffuseColor.a*=smoothstep(1.676,1.680,vLashHeight);\n#include <alphatest_fragment>');
      };
    }
    mesh.material=material;mesh.visible=true;mesh.castShadow=false;materials.push(material);
  }
  return materials;
}
