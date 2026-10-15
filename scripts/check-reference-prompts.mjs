// Nearby world labels must leave the reference body clear while the thumb action stays usable.
import { chromium } from 'playwright';
import fs from 'node:fs';
const args=process.argv.slice(2),before=args.includes('--before');
const [base='http://127.0.0.1:4174/',out='/private/tmp/dakar-reference-prompts']=args.filter(a=>!a.startsWith('--'));
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
    await page.evaluate(()=>{
      const d=window.__dakar;d.teleport('pikine',-42,-66,Math.PI/2);d.pause(true);d.setHour(9);d.step(1/60,120);
      const s=d.seatsHere().find(s=>s.kind==='bench'&&!s.occupant);d.sit(s.id);d.step(1/60,120);d.stand();d.step(1/60,90);
    });
    const rows=[];
    for(const [label,side] of [['front',.4],['side',1.6],['back',3.2]]) {
      await page.evaluate(side=>{const d=window.__dakar;d.portrait(3.2,.8,side);d.step(1/60,1);d.render();},side);
      await page.locator('#wprompt').evaluate(w=>Promise.all(w.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{}))));
      const row=await page.evaluate(()=>{
        const d=window.__dakar,renderer=d.three.renderer,render=renderer.render;let camera;
        renderer.render=function(scene,cam){camera=cam;return render.call(this,scene,cam);};d.render();renderer.render=render;
        let mesh;d.body().group.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});mesh.updateMatrixWorld(true);mesh.skeleton.update();
        const body={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity},p=d.body().group.position.clone();
        for(let i=0;i<mesh.geometry.attributes.position.count;i++) {
          mesh.getVertexPosition(i,p);p.applyMatrix4(mesh.matrixWorld).project(camera);
          const x=(p.x*.5+.5)*innerWidth,y=(-p.y*.5+.5)*innerHeight;
          body.left=Math.min(body.left,x);body.right=Math.max(body.right,x);body.top=Math.min(body.top,y);body.bottom=Math.max(body.bottom,y);
        }
        const w=document.getElementById('wprompt'),r=w.firstElementChild.getBoundingClientRect(),bubble={left:r.left,top:r.top,right:r.right,bottom:r.bottom};
        const overlap=Math.max(0,Math.min(body.right,bubble.right)-Math.max(body.left,bubble.left))*Math.max(0,Math.min(body.bottom,bubble.bottom)-Math.max(body.top,bubble.top));
        return{body,bubble,overlap,visible:Number(getComputedStyle(w).opacity)>.01,on:w.classList.contains('on'),opacity:getComputedStyle(w).opacity,focus:d.focus(),action:document.getElementById('act').textContent,clock:document.getElementById('place').textContent};
      });
      rows.push({label,...row});
      await page.screenshot({path:`${out}/${view}-${label}.png`});
    }
    // Hidden labels must leave the primary touch action available.
    await page.evaluate(()=>{window.__dakar.portrait(3.2,.8,.4);window.__dakar.step(1/60,1);});
    await page.locator('#act').tap();await page.evaluate(()=>window.__dakar.step(1/60,120));
    const seated=await page.evaluate(()=>({id:window.__dakar.seated(),clip:window.__dakar.clip()}));
    const ok=rows.every(r=>r.clock.includes('09:00')&&r.focus?.kind==='seat'&&r.action.includes("S’asseoir"))&&!!seated.id&&seated.clip==='Sit'&&!errors.length&&(before?rows.some(r=>r.visible&&r.overlap>0):rows.every(r=>!r.visible||r.overlap===0&&r.bubble.left>=7&&r.bubble.right<=width-7)&&rows.some(r=>r.visible));
    results.push({view,ok,rows,seated,errors});console.log(JSON.stringify(results.at(-1)));await c.close();
  }
}finally{await browser.close();}
fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));
if(results.some(r=>!r.ok))process.exitCode=1;
