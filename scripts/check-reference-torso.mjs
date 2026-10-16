// Continuous actual-game playback, front/rear captures and complete-cycle torso/shoulder measurements.
import { chromium } from 'playwright';
import fs from 'node:fs';
const args=process.argv.slice(2),before=args.includes('--before');
const asset=args.find(a=>a.startsWith('--asset='))?.slice(8);
const [base='http://127.0.0.1:4174/',out='/private/tmp/dakar-reference-torso']=args.filter(a=>!a.startsWith('--'));
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[];
try {
  for(const [view,width,height] of [['portrait',390,844],['landscape',844,390]]) {
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
    await context.addInitScript(()=>localStorage.setItem('dakarrek.quality','low'));
    if(asset)await context.route('**/assets/reference_character.glb',route=>route.fulfill({path:asset,contentType:'model/gltf-binary'}));
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}?debug&reference-character&reference-hour=9&touch`);
    await page.waitForFunction(()=>window.__dakar?.body(),null,{timeout:120000});
    await page.evaluate(()=>{const d=window.__dakar;d.teleport('pikine',-42,-66,Math.PI/2);d.pause(true);d.step(1/60,120);});
    if(view==='portrait')await page.evaluate(()=>{
      const stream=document.getElementById('c').captureStream(30),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:1200000}),chunks=[];
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};window.__motionVideo={stream,recorder,chunks};recorder.start(100);
    });
    const rows=[];
    for(const [label,level] of [['walk',0],['jog',1],['sprint',2]]) {
      await page.evaluate(level=>{const d=window.__dakar;d.pause(true);d.place(-42,-66,Math.PI/2);d.lookYaw(Math.PI/2);d.portrait(3.2,1.2,.35);d.step(1/60,120);d.strideToggle(level);},level);
      await page.keyboard.down('KeyW');await page.evaluate(()=>window.__dakar.step(1/60,90));
      const metrics=await page.evaluate(()=>{
        const d=window.__dakar,b=d.body();let mesh;b.group.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});
        const chest=b.group.getObjectByName('mixamorigSpine2'),rest=chest.quaternion.clone();mesh.skeleton.boneInverses[mesh.skeleton.bones.indexOf(chest)].clone().invert().decompose(b.group.position.clone(),rest,b.group.scale.clone());
        const samples=[],motion=d.motion(),n=Math.ceil(motion.duration/motion.timeScale*120);
        for(let i=0;i<=n;i++){
          d.step(1/120,1);b.group.updateMatrixWorld(true);
          const frame=b.group.getWorldQuaternion(b.group.quaternion.clone()).invert(),q=frame.clone().multiply(chest.getWorldQuaternion(chest.quaternion.clone())).multiply(rest.clone().invert()),e=chest.rotation.clone().setFromQuaternion(q,'YXZ');
          const hip=b.group.getObjectByName('mixamorigHips').getWorldPosition(b.group.position.clone());
          const shoulders=['Left','Right'].map(s=>b.group.getObjectByName('mixamorig'+s+'Arm').getWorldPosition(hip.clone()).sub(hip).applyQuaternion(frame).z);
          samples.push({yaw:e.y*180/Math.PI,roll:e.z*180/Math.PI,shoulders,clip:d.clip()});
        }
        return{yaw:Math.max(...samples.map(s=>Math.abs(s.yaw))),roll:Math.max(...samples.map(s=>Math.abs(s.roll))),throw:Math.max(...[0,1].map(k=>Math.max(...samples.map(s=>s.shoulders[k]))-Math.min(...samples.map(s=>s.shoulders[k])))),clips:[...new Set(samples.map(s=>s.clip))]};
      });
      for(const [angle,side] of [['front',.35],['rear',Math.PI]]) {
        await page.evaluate(side=>{const d=window.__dakar;d.portrait(3.2,1.2,side);d.pause(false);},side);
        await page.waitForTimeout(view==='portrait'?2000:600);
        await page.screenshot({path:`${out}/${view}-${label}-${angle}.png`});
      }
      await page.keyboard.up('KeyW');await page.evaluate(()=>window.__dakar.pause(true));rows.push({label,...metrics});
    }
    if(view==='portrait'){
      const bytes=await page.evaluate(()=>new Promise(resolve=>{const v=window.__motionVideo;v.recorder.onstop=async()=>{const data=await new Blob(v.chunks,{type:'video/webm'}).arrayBuffer();v.stream.getTracks().forEach(t=>t.stop());resolve(Array.from(new Uint8Array(data)));};v.recorder.stop();}));
      fs.writeFileSync(`${out}/continuous-front-rear.webm`,Buffer.from(bytes));
    }
    const expected={walk:'Walk',jog:'Jog',sprint:'Run'};
    const ok=rows.every(r=>r.clips.length===1&&r.clips[0]===expected[r.label])&&!errors.length&&(before?rows.some(r=>r.yaw>30):rows.every(r=>r.yaw<12&&r.roll<7&&r.throw<.08));
    results.push({view,ok,rows,errors});console.log(JSON.stringify(results.at(-1)));await context.close();
  }
}finally{await browser.close();}
fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));if(results.some(r=>!r.ok))process.exitCode=1;
