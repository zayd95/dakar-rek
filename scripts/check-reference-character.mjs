// Actual player in the real game. CHROMIUM=... node scripts/check-reference-character.mjs [url] [out]
import { chromium } from 'playwright';
import fs from 'node:fs';
const args=process.argv.slice(2),baseline=args.includes('--baseline');
const [base='http://127.0.0.1:4173/', out='docs/screenshots/reference-character'] = args.filter(a=>!a.startsWith('--'));
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[];
try {
  for(const [view,width,height] of [['portrait',390,844],['landscape',844,390]]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
    await context.addInitScript(()=>localStorage.setItem('dakarrek.quality','low'));
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}?debug&touch${baseline?'':'&reference-character&reference-hour=9'}`);
    await page.waitForFunction(()=>window.__dakar?.body(),null,{timeout:120000});
    if(!baseline)await page.waitForFunction(()=>document.getElementById('place').textContent.includes('09:00'));
    await page.evaluate(()=>{const d=window.__dakar;d.teleport('pikine',-42,-66,Math.PI/2);d.setHour(9);});
    await page.waitForTimeout(800);
    await page.evaluate(()=>{const d=window.__dakar;d.pause(true);d.step(1/60,120);d.render();});
    if(!baseline){
      const ground=await page.evaluate(()=>{
        const d=window.__dakar,b=d.body();let mesh;b.group.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});
        const ids=[],attr=mesh.geometry.attributes.position;for(let i=0;i<attr.count;i++)if(attr.getY(i)<.014)ids.push(i);
        const rows=[];
        for(const [z,floor] of [[-66,.08],[-68,.12],[-72,.14]]){
          d.place(-42,z,Math.PI/2);d.step(1/60,120);b.group.updateMatrixWorld(true);mesh.skeleton.update();
          const point=b.group.position.clone();let sole=Infinity;
          for(const i of ids){mesh.getVertexPosition(i,point);point.applyMatrix4(mesh.matrixWorld);sole=Math.min(sole,point.y);}
          rows.push({z,floor,sole,error:sole-floor});
        }
        d.place(-42,-66,Math.PI/2);d.setHour(9);d.step(1/60,120);d.render();return rows;
      });
      results.push({view,ground});
    }
    await page.screenshot({path:`${out}/${view}-street.png`});
    for(const [label,dist,h,side] of [['face',1.1,1.61,.35],['body',3.2,1.35,.35],['profile',3.2,1.35,1.4],['hands',1.25,1.02,1.0]]){
      await page.evaluate(([dist,h,side])=>{const d=window.__dakar;d.portrait(dist,h,side);d.step(1/60,1);d.render();},[dist,h,side]);
      await page.screenshot({path:`${out}/${view}-${label}.png`});
    }
    if(baseline){results.push({view,baseline:true,errors});await context.close();continue;}
    const touch=await page.evaluate(()=>{
      const d=window.__dakar;d.place(-42,-66,Math.PI/2);d.strideToggle(0);d.step(1/60,90);
      const before=d.pos(),r=document.getElementById('joy').getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      const fire=(type,py)=>(document.elementFromPoint(x,py)??document.body).dispatchEvent(new PointerEvent(type,{pointerId:71,pointerType:'touch',clientX:x,clientY:py,bubbles:true}));
      fire('pointerdown',y);fire('pointermove',y-50);d.step(1/60,90);
      const after=d.pos(),clip=d.clip();fire('pointercancel',y-50);d.step(1/60,90);
      return{distance:Math.hypot(after.x-before.x,after.z-before.z),clip,stopped:d.clip()};
    });
    results.push({view,touch});
    for(const [label,level] of [['walk',0],['jog',1],['sprint',2]]){
      await page.evaluate(level=>{const d=window.__dakar;d.place(-42,-66,Math.PI/2);d.lookYaw(Math.PI/2);d.strideToggle(level);d.portrait(3.2,1.2,.35);},level);
      await page.keyboard.down('KeyW');
      await page.evaluate(()=>{window.__dakar.step(1/60,90);window.__dakar.render();});
      const info=await page.evaluate(()=>({clip:window.__dakar.clip(),speed:window.__dakar.stride().speed,motion:window.__dakar.motion()}));
      await page.screenshot({path:`${out}/${view}-${label}.png`});
      results.push({view,label,...info});
      await page.keyboard.up('KeyW');
      await page.evaluate(()=>window.__dakar.step(1/60,90));
    }
    const turning={};
    // End at the same facing/camera for both directions, making the stepping comparison readable.
    for(const [direction,startYaw] of [['left',Math.PI],['right',0]]){
      turning[direction]=await page.evaluate(startYaw=>{const d=window.__dakar;d.place(-42,-66,startYaw);d.step(1/60,90);d.place(-42,-66,Math.PI/2);d.portrait(3.2,1.2,.35);d.step(1/60,25);d.render();return d.clip();},startYaw);
      await page.screenshot({path:`${out}/${view}-turn${direction==='right'?'-right':''}.png`});
    }
    const seat=await page.evaluate(()=>{const d=window.__dakar,s=d.seatsHere().find(s=>s.kind==='bench'&&!s.occupant);if(!s)throw new Error('No free bench');d.sit(s.id);d.portrait(3.2,.8,.4);d.step(1/60,90);d.render();return{id:d.seated(),top:s.top,clip:d.clip()};});
    await page.screenshot({path:`${out}/${view}-sit.png`});
    const metrics=await page.evaluate(()=>{const b=window.__dakar.body();let meshes=0,vertices=0,bones=0;b.group.traverse(o=>{if(o.isSkinnedMesh){meshes++;vertices+=o.geometry.attributes.position.count;bones=o.skeleton.bones.length;}});return{meshes,vertices,bones,clip:window.__dakar.clip(),clock:document.getElementById('place').textContent,calls:window.__dakar.three.renderer.info.render.calls,quiet:window.__dakar.quiet().over};});
    await page.locator('#presenceBtn').click();
    const fixedProfile=(await page.locator('#presenceLooks').count())===0 && await page.getByText('Tenue fixe : t-shirt écru et pantalon vert.',{exact:true}).isVisible();
    results.push({view,turning,seat,metrics,fixedProfile,errors});console.log(JSON.stringify(results.filter(r=>r.view===view)));
    await context.close();
  }
}finally{await browser.close();}
fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));
const expected={walk:'Walk',jog:'Jog',sprint:'Run'};
if(results.some(r=>r.errors?.length||r.ground?.some(g=>Math.abs(g.error)>.007)||r.touch&&(r.touch.distance<1||r.touch.clip!=='Walk'||r.touch.stopped!=='Idle')||r.label&&r.clip!==expected[r.label]||r.metrics&&(!r.metrics.clock.includes('09:00')||!r.fixedProfile||r.metrics.meshes!==1||r.metrics.bones!==52||r.metrics.quiet.length||r.seat.clip!=='Sit'||r.turning.left!=='TurnLeft'||r.turning.right!=='TurnRight')))process.exitCode=1;
