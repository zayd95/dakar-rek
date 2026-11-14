import * as THREE from 'three';

// Original, mesh-local surface detail: no downloaded textures or identity data.
export function surfaceMaterial(color: string, kind: 'skin' | 'hair' | 'fabric') {
  const material = new THREE.MeshStandardMaterial({ color, roughness: kind === 'skin' ? .76 : .96 });
  const frequency = kind === 'skin' ? 620 : kind === 'hair' ? 470 : 300;
  const depth = kind === 'skin' ? .000035 : kind === 'hair' ? .00025 : .00012;
  material.customProgramCacheKey = () => `study-surface-v1-${kind}`;
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vStudySurface;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStudySurface = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vStudySurface;
      float studyHash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
      float studyNoise(vec3 p) {
        vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(studyHash(i),studyHash(i+vec3(1,0,0)),f.x),mix(studyHash(i+vec3(0,1,0)),studyHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(studyHash(i+vec3(0,0,1)),studyHash(i+vec3(1,0,1)),f.x),mix(studyHash(i+vec3(0,1,1)),studyHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
    `).replace('#include <color_fragment>', `#include <color_fragment>
      float studyDetail = studyNoise(vStudySurface * ${frequency.toFixed(1)});
      diffuseColor.rgb *= ${kind === 'hair' ? '0.75 + 0.35 * studyDetail' : '0.975 + 0.05 * studyNoise(vStudySurface * 45.0)'};
    `).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      // Screen derivatives perturb the view-space normal, following the skinned surface.
      vec3 sx=dFdx(-vViewPosition), sy=dFdy(-vViewPosition);
      vec3 rx=cross(sy,normal), ry=cross(normal,sx);
      float det=dot(sx,rx);
      vec2 dh=vec2(dFdx(studyDetail),dFdy(studyDetail))*${depth.toFixed(6)};
      normal=normalize(abs(det)*normal-sign(det)*(dh.x*rx+dh.y*ry));
    `);
  };
  return material;
}

// A thin original scalp layer cut from reviewed anatomy. Every attribute and
// morph is interpolated at the hairline; the layer shares the exact body rig.
export function shortHair(body: THREE.SkinnedMesh) {
  const source = body.geometry;
  const pos = source.getAttribute('position');
  const norm = source.getAttribute('normal');
  const skinI = source.getAttribute('skinIndex'), skinW = source.getAttribute('skinWeight');
  const morphP = source.morphAttributes.position, morphN = source.morphAttributes.normal;
  type V = { p: THREE.Vector3; n: THREE.Vector3; dp: THREE.Vector3[]; dn: THREE.Vector3[]; skin: Map<number, number> };
  const read = (i: number): V => {
    const skin = new Map<number, number>();
    for(let j=0;j<4;j++) skin.set(skinI.getComponent(i,j),(skin.get(skinI.getComponent(i,j)) || 0)+skinW.getComponent(i,j));
    return { p:new THREE.Vector3().fromBufferAttribute(pos,i),n:new THREE.Vector3().fromBufferAttribute(norm,i),
      dp:morphP.map(a=>new THREE.Vector3().fromBufferAttribute(a,i)),dn:morphN.map(a=>new THREE.Vector3().fromBufferAttribute(a,i)),skin };
  };
  const lerp=(a:V,b:V,t:number):V=>{
    const skin=new Map<number,number>(); a.skin.forEach((w,j)=>skin.set(j,w*(1-t))); b.skin.forEach((w,j)=>skin.set(j,(skin.get(j)||0)+w*t));
    return {p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t),dp:a.dp.map((d,i)=>d.clone().lerp(b.dp[i],t)),dn:a.dn.map((d,i)=>d.clone().lerp(b.dn[i],t)),skin};
  };
  const actual=(v:V)=>v.dp.reduce((p,d,i)=>p.addScaledVector(d,body.morphTargetInfluences![i]),v.p.clone());
  // Front hairline higher than nape; taper above the ears, never onto the face.
  const signed=(v:V)=>{ const p=actual(v); const front=THREE.MathUtils.smoothstep(p.z,.025,.115);
    return p.y-(1.655+.077*front+.042*THREE.MathUtils.smoothstep(Math.abs(p.x),.04,.085)*(1-front)); };
  const data:number[]=[], normals:number[]=[], indices:number[]=[], weights:number[]=[];
  const targets=morphP.map(()=>[] as number[]), targetNormals=morphN.map(()=>[] as number[]);
  const emit=(v:V)=>{
    const n=v.n.clone().normalize(); const thickness=.004;
    data.push(...v.p.clone().addScaledVector(n,thickness).toArray()); normals.push(...n.toArray());
    v.dp.forEach((d,i)=>{const dn=v.n.clone().add(v.dn[i]).normalize().sub(n); targets[i].push(...d.clone().addScaledVector(dn,thickness).toArray()); targetNormals[i].push(...dn.toArray());});
    const skin=[...v.skin].sort((a,b)=>b[1]-a[1]).slice(0,4);const total=skin.reduce((s,[,w])=>s+w,0);
    for(let j=0;j<4;j++){indices.push(skin[j]?.[0]||0);weights.push((skin[j]?.[1]||0)/total);}
  };
  for(let i=0;i<source.index!.count;i+=3){
    const triangle=[source.index!.getX(i),source.index!.getX(i+1),source.index!.getX(i+2)].map(read);
    if(triangle.some(v=>v.p.y<1.60))continue;
    const polygon:V[]=[];
    triangle.forEach((b,j)=>{const a=triangle[(j+2)%3], ah=signed(a),bh=signed(b);
      if((ah>=0)!==(bh>=0)){
        // Hairline is nonlinear; bisect its intersection rather than approximate a plane.
        let lo=0,hi=1;for(let k=0;k<18;k++){const mid=(lo+hi)/2;if((signed(lerp(a,b,mid))>=0)===(ah>=0))lo=mid;else hi=mid;}
        polygon.push(lerp(a,b,(lo+hi)/2));
      }
      if(bh>=0)polygon.push(b);
    });
    for(let j=1;j+1<polygon.length;j++)[polygon[0],polygon[j],polygon[j+1]].forEach(emit);
  }
  const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(data,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  geometry.morphTargetsRelative=true;geometry.morphAttributes.position=targets.map(d=>new THREE.Float32BufferAttribute(d,3));geometry.morphAttributes.normal=targetNormals.map(d=>new THREE.Float32BufferAttribute(d,3));
  const material=surfaceMaterial('#10100e','hair');material.side=THREE.DoubleSide;
  const hair=new THREE.SkinnedMesh(geometry,material);hair.name='OriginalShortHair';hair.bind(body.skeleton,body.bindMatrix);
  hair.morphTargetInfluences=[...body.morphTargetInfluences!];hair.morphTargetDictionary={...body.morphTargetDictionary};hair.castShadow=true;hair.frustumCulled=false;body.parent!.add(hair);
  return material;
}

export function finishEyes(model: THREE.Object3D) {
  const head=model.getObjectByName('Head'), eyes=model.getObjectByName('Eyes') as THREE.SkinnedMesh;
  if(!head || !eyes)return [];
  model.updateMatrixWorld(true);eyes.skeleton.update();
  const materials:THREE.MeshStandardMaterial[]=[];
  for(const sign of [-1,1]){
    // Measure the actual morphed surface separately for each physique.
    const front=new THREE.Vector3(0,0,-Infinity), sample=new THREE.Vector3();
    for(let i=0;i<eyes.geometry.getAttribute('position').count;i++){
      eyes.getVertexPosition(i,sample);eyes.localToWorld(sample);
      if(sample.x*sign>0 && sample.z>front.z)front.copy(sample);
    }
    const layers=[{r:.0064,color:'#21180f',roughness:.5},{r:.0056,color:'#513322',roughness:.4},{r:.0027,color:'#090b09',roughness:.2}];
    layers.forEach((layer,i)=>{
      const material=new THREE.MeshStandardMaterial({color:layer.color,roughness:layer.roughness});
      // Concentric surface patches follow the eye curvature rather than float as discs.
      const vertices:number[]=[], indices:number[]=[];const rings=5,segments=32,radius=.015;
      for(let ring=0;ring<=rings;ring++)for(let j=0;j<=segments;j++){
        const r=layer.r*ring/rings,a=j/segments*Math.PI*2;
        const point=new THREE.Vector3(front.x+r*Math.cos(a),front.y+r*Math.sin(a),front.z+Math.sqrt(radius*radius-r*r)-radius+.0003+i*.00008);
        vertices.push(...head.worldToLocal(point).toArray());
      }
      for(let ring=0;ring<rings;ring++)for(let j=0;j<segments;j++){
        const a=ring*(segments+1)+j,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1);
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
      const eye=new THREE.Mesh(geometry,material);eye.name=`StudyEye${sign}_${i}`;head.add(eye);materials.push(material);
    });
  }
  return materials;
}

export function finishBrows(model: THREE.Object3D) {
  const brows=model.getObjectByName('Brows') as THREE.SkinnedMesh;
  if(!brows)return undefined;
  // Original fitted strip coordinate, based on inspected neutral brow boundaries.
  const envelope=[[.010,1.689,.007],[.017,1.6895,.0075],[.028,1.6903,.0062],[.040,1.6907,.0057],[.047,1.6907,.005],[.054,1.6874,.0028],[.060,1.6853,.0018]];
  const positions=brows.geometry.getAttribute('position'),coords:number[]=[];
  for(let i=0;i<positions.count;i++){
    const x=Math.abs(positions.getX(i));let j=0;while(j+1<envelope.length-1&&x>envelope[j+1][0])j++;
    const a=envelope[j],b=envelope[j+1],t=THREE.MathUtils.clamp((x-a[0])/(b[0]-a[0]),0,1);
    const centre=THREE.MathUtils.lerp(a[1],b[1],t),width=THREE.MathUtils.lerp(a[2],b[2],t);
    coords.push((x-.010)/.050,(positions.getY(i)-centre)/width+.5);
  }
  brows.geometry.setAttribute('studyBrowUv',new THREE.Float32BufferAttribute(coords,2));
  const material=new THREE.MeshStandardMaterial({color:'#2c231b',roughness:.96,alphaTest:.5,alphaToCoverage:true});
  material.customProgramCacheKey=()=> 'original-brow-band-v1';
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 studyBrowUv; varying vec2 vStudyBrow;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvStudyBrow=studyBrowUv;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vStudyBrow;')
      .replace('#include <alphatest_fragment>',`float band=1.0-smoothstep(.18,.29,abs(vStudyBrow.y-.5));
        float taper=smoothstep(0.0,.10,vStudyBrow.x)*(1.0-smoothstep(.84,1.0,vStudyBrow.x));
        diffuseColor.a *= band*taper*(.90+.10*sin(vStudyBrow.x*260.0+vStudyBrow.y*13.0));
        #include <alphatest_fragment>`);
  };
  brows.material=material;brows.castShadow=false;
  // These untextured source cards read as heavy eyeliner; omit them in this pass.
  const lashes=model.getObjectByName('Lashes');if(lashes)lashes.visible=false;
  return material;
}
