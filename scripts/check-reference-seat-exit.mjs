// Actual bench exit, repeated taps, joystick interruption and travel cleanup on the reference player.
import { chromium } from 'playwright';
import fs from 'node:fs';
const [base='http://127.0.0.1:4174/',out='/private/tmp/dakar-reference-seat-exit']=process.argv.slice(2);
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[];
try {
  for(const [view,width,height] of [['portrait',390,844],['landscape',844,390]]) {
    const c=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
    await c.addInitScript(()=>localStorage.setItem('dakarrek.quality','low'));
    const page=await c.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}?debug&reference-character&reference-hour=9&touch`);
    await page.waitForFunction(()=>window.__dakar?.body(),null,{timeout:120000});
    await page.evaluate(()=>{const d=window.__dakar;d.teleport('pikine',-42,-66,Math.PI/2);d.pause(true);d.setHour(9);d.step(1/60,120);});
    const sit=()=>page.evaluate(()=>{const d=window.__dakar,s=d.seatsHere().find(s=>s.kind==='bench'&&!s.occupant);if(!s)throw Error('No free bench');d.sit(s.id);d.portrait(3.2,.8,.4);d.step(1/60,120);d.render();return s.id;});
    const id=await sit();await page.screenshot({path:`${out}/${view}-seated.png`});
    const trajectory=await page.evaluate(()=>{
      const d=window.__dakar,id=d.seated(),before=d.pos(),rows=[];let mesh;d.body().group.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});const ids=[],attr=mesh.geometry.attributes.position;for(let i=0;i<attr.count;i++)if(attr.getY(i)<.014)ids.push(i);d.stand();
      for(let i=0;i<90;i++){
        if(i===20)d.stand(); // a repeated action must not restart the rise
        d.step(1/60,1);
        d.body().group.updateMatrixWorld(true);mesh.skeleton.update();const point=d.body().group.position.clone();let sole=Infinity;for(const v of ids){mesh.getVertexPosition(v,point);point.applyMatrix4(mesh.matrixWorld);sole=Math.min(sole,point.y);}
        rows.push({frame:i+1,sole,pos:d.pos(),clip:d.clip(),time:d.motion().time,seated:d.seated(),occupant:d.seatsHere().find(s=>s.id===id)?.occupant});
      }
      return{before,rows};
    });
    // Replay only for the matched captures; assertions above use every frame of the actual exit.
    await sit();await page.evaluate(()=>{window.__dakar.stand();window.__dakar.step(1/60,1);window.__dakar.render();});
    await page.screenshot({path:`${out}/${view}-stand-start.png`});
    await page.evaluate(()=>{window.__dakar.step(1/60,25);window.__dakar.render();});
    await page.screenshot({path:`${out}/${view}-stand-middle.png`});
    await page.evaluate(()=>{window.__dakar.step(1/60,60);window.__dakar.render();});
    await page.screenshot({path:`${out}/${view}-stand-end.png`});
    await sit();
    const interrupt=await page.evaluate(()=>{
      const d=window.__dakar,id=d.seated();d.stand();d.step(1/60,15);
      const r=document.getElementById('joy').getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      const fire=(type,py)=>(document.elementFromPoint(x,py)??document.body).dispatchEvent(new PointerEvent(type,{pointerId:91,pointerType:'touch',clientX:x,clientY:py,bubbles:true}));
      fire('pointerdown',y);fire('pointermove',y-50);d.step(1/60,1);const firstFrameSeated=d.seated();d.step(1/60,19);
      const result={firstFrameSeated,seated:d.seated(),clip:d.clip(),occupant:d.seatsHere().find(s=>s.id===id)?.occupant};
      fire('pointercancel',y-50);d.step(1/60,90);return result;
    });
    await sit();
    const travel=await page.evaluate(()=>{const d=window.__dakar;d.stand();d.step(1/60,15);d.teleport('corniche',0,0,0);d.step(1/60,120);return{hub:d.pos().hub,seated:d.seated(),clip:d.clip()};});
    const points=[trajectory.before,...trajectory.rows.map(r=>r.pos)],steps=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.z-points[i].z));
    const start=trajectory.rows[0],middle=trajectory.rows[25],end=trajectory.rows.at(-1),maxStep=Math.max(...steps),maxGroundError=Math.max(...trajectory.rows.slice(12).map(r=>Math.abs(r.sole-.14))); // selected city bench is on the 140 mm block slab
    const ok=start.seated===id&&start.occupant==='player'&&start.clip==='SitExit'&&steps[0]<.01&&maxStep<.04&&maxGroundError<.012&&middle.clip==='SitExit'&&middle.seated===id&&trajectory.rows[21].time>trajectory.rows[19].time&&end.seated===null&&end.occupant===null&&end.clip==='Idle'&&trajectory.rows.slice(63).every(r=>r.clip==='Idle')&&interrupt.firstFrameSeated===null&&interrupt.seated===null&&interrupt.occupant===null&&interrupt.clip==='Walk'&&travel.hub==='corniche'&&travel.seated===null&&travel.clip==='Idle'&&!errors.length;
    results.push({view,ok,firstStep:steps[0],maxStep,maxGroundError,postRiseClips:[...new Set(trajectory.rows.slice(63).map(r=>r.clip))],worstGround:trajectory.rows.slice(12).sort((a,b)=>Math.abs(b.sole-.14)-Math.abs(a.sole-.14))[0],start,middle,end,interrupt,travel,errors});
    console.log(JSON.stringify(results.at(-1)));await c.close();
  }
}finally{await browser.close();}
fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));
if(results.some(r=>!r.ok))process.exitCode=1;
