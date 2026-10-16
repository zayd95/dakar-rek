// Actual mobile input plus zero-time pose continuity when an in-progress gait fade is interrupted.
import { chromium } from 'playwright';
import fs from 'node:fs';
const args=process.argv.slice(2),before=args.includes('--before');
const [base='http://127.0.0.1:4174/',out='/private/tmp/dakar-reference-transitions']=args.filter(a=>!a.startsWith('--'));
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[];
try {
  for(const [view,width,height] of [['portrait',390,844],['landscape',844,390]]) {
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
    await context.addInitScript(()=>localStorage.setItem('dakarrek.quality','low'));
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}?debug&reference-character&reference-hour=9&touch`);
    await page.waitForFunction(()=>window.__dakar?.body(),null,{timeout:120000});
    await page.evaluate(()=>{const d=window.__dakar;d.teleport('pikine',-42,-66,Math.PI/2);d.pause(true);d.step(1/120,240);});
    const continuity=await page.evaluate(()=>{
      const b=window.__dakar.body(),bones=[];b.group.traverse(o=>{if(o.isBone)bones.push(o);});
      b.play('Idle',0);b.update(.3);b.play('Walk',.18);b.update(.06);const rows=[];
      for(const name of ['Jog','Walk','Run','Idle','Walk']) {
        const old=bones.map(o=>({q:o.quaternion.clone().normalize(),p:o.position.clone()}));
        b.play(name,.18);b.update(0);
        rows.push({clip:name,angle:Math.max(...bones.map((o,i)=>o.quaternion.clone().normalize().angleTo(old[i].q)*180/Math.PI)),position:Math.max(...bones.map((o,i)=>o.position.distanceTo(old[i].p)))});
        b.update(.04);
      }
      return rows;
    });
    const input=await page.evaluate(()=>{
      const d=window.__dakar,b=d.body();d.step(1/120,240);const rows=[];
      const key=on=>window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code:'KeyW',key:'w',bubbles:true}));
      for(const [label,level,on,frames]of [['start-sprint',2,true,120],['walk',0,true,60],['jog',1,true,60],['run',2,true,60],...Array.from({length:12},(_,i)=>['rapid-'+i,i%3,true,6]),['stop',0,false,120]]) {
        d.strideToggle(level);key(on);const weights=[],clips=new Set();
        for(let i=0;i<frames;i++) {d.step(1/120,1);weights.push([...b.actions.values()].filter(a=>a.isScheduled()).reduce((s,a)=>s+a.getEffectiveWeight(),0));clips.add(d.clip());}
        rows.push({label,minWeight:Math.min(...weights),maxWeight:Math.max(...weights),clips:[...clips]});
      }
      return rows;
    });
    await page.evaluate(()=>{const d=window.__dakar;d.place(-42,-66,Math.PI/2);d.lookYaw(Math.PI/2);d.strideToggle(0);d.step(1/120,240);});
    if(view==='portrait')await page.evaluate(()=>{
      const stream=document.getElementById('c').captureStream(30),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:1200000}),chunks=[];
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};window.__transitionVideo={stream,recorder,chunks};recorder.start(100);
    });
    for(const [side,angle]of [['front',.35],['rear',Math.PI]]) {
      await page.evaluate(angle=>{const d=window.__dakar;d.portrait(3.2,1.2,angle);d.pause(false);},angle);
      await page.keyboard.down('KeyW');
      for(const [label,level,delay]of [['jog',1,900],['sprint',2,900],['walk',0,120],['jog',1,120],['sprint',2,120]]) {
        await page.evaluate(level=>window.__dakar.strideToggle(level),level);await page.waitForTimeout(delay);
        if(label==='sprint')await page.screenshot({path:`${out}/${view}-${side}-${delay===900?'sprint':'interrupted'}.png`});
      }
      await page.keyboard.up('KeyW');await page.waitForTimeout(800);
      await page.screenshot({path:`${out}/${view}-${side}-stopped.png`});
    }
    if(view==='portrait') {
      const bytes=await page.evaluate(()=>new Promise(resolve=>{const v=window.__transitionVideo;v.recorder.onstop=async()=>{const data=await new Blob(v.chunks,{type:'video/webm'}).arrayBuffer();v.stream.getTracks().forEach(t=>t.stop());resolve(Array.from(new Uint8Array(data)));};v.recorder.stop();}));
      fs.writeFileSync(`${out}/continuous-transitions.webm`,Buffer.from(bytes));
    }
    const maxWeight=Math.max(...input.map(r=>r.maxWeight)),minWeight=Math.min(...input.map(r=>r.minWeight)),maxAngle=Math.max(...continuity.map(r=>r.angle)),maxPosition=Math.max(...continuity.map(r=>r.position));
    const ok=!errors.length&&(before?maxWeight>1.05&&maxAngle>.01:Math.abs(maxWeight-1)<1e-5&&Math.abs(minWeight-1)<1e-5&&maxAngle<.001&&maxPosition<1e-6);
    results.push({view,ok,maxWeight,minWeight,maxAngle,maxPosition,continuity,input,errors});console.log(JSON.stringify({view,ok,maxWeight,minWeight,maxAngle,maxPosition,errors}));await context.close();
  }
}finally{await browser.close();}
fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2)+'\n');if(results.some(r=>!r.ok))process.exitCode=1;
