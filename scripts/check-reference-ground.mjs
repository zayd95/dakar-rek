// Compare the actual exported soles with independently raycast rendered street geometry.
import { chromium } from 'playwright';
import fs from 'node:fs';
const args=process.argv.slice(2),before=args.includes('--before');
const [base='http://127.0.0.1:4174/',out='/private/tmp/dakar-reference-ground']=args.filter(a=>!a.startsWith('--'));
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[];
try {
  for(const [view,width,height]of [['portrait',390,844],['landscape',844,390]]) {
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
    await context.addInitScript(()=>localStorage.setItem('dakarrek.quality','low'));
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}?debug&reference-character&reference-hour=9&touch`);
    await page.waitForFunction(()=>window.__dakar?.body(),null,{timeout:120000});
    await page.evaluate(()=>{const d=window.__dakar;d.teleport('pikine',-42,-66,Math.PI/2);d.pause(true);d.step(1/60,120);});
    const rows=[];
    for(const [label,x,z]of [['road',-42,-60],['sidewalk',-42,-66],['curb',-42,-65],['block',-42,-72],['sand',-31.3374,-66],['junction',-60,-60]]) {
      const row=await page.evaluate(([label,x,z])=>{
        const d=window.__dakar,b=d.body();d.place(x,z,Math.PI/2);d.step(1/60,180);b.group.updateMatrixWorld(true);
        let mesh;b.group.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});mesh.skeleton.update();
        const point=b.group.position.clone(),attr=mesh.geometry.attributes.position;let sole=Infinity;
        for(let i=0;i<attr.count;i++)if(attr.getY(i)<.014){mesh.getVertexPosition(i,point);point.applyMatrix4(mesh.matrixWorld);sole=Math.min(sole,point.y);}
        const floor=.5-d.sightline([x,.5,z],[x,-.3,z],true).hit;
        return{label,x,z,sole,floor,error:sole-floor};
      },[label,x,z]);rows.push(row);
      if(label==='sidewalk'||label==='sand')for(const [part,dist,h]of [['body',3.2,1.2],['shoes',1.05,.2]]) {
        await page.evaluate(([dist,h])=>{const d=window.__dakar;d.portrait(dist,h,.35);d.step(1/60,1);d.render();},[dist,h]);
        await page.screenshot({path:`${out}/${view}-${label}-${part}.png`});
      }
    }
    await page.evaluate(()=>{const d=window.__dakar;d.place(-42,-66,Math.PI/2);d.lookYaw(Math.PI/2);d.strideToggle(1);d.step(1/60,120);});
    await page.keyboard.down('KeyW');await page.evaluate(()=>window.__dakar.step(1/60,150));await page.keyboard.up('KeyW');
    const stopped=await page.evaluate(()=>{
      const d=window.__dakar,b=d.body();d.step(1/60,120);b.group.updateMatrixWorld(true);let mesh;b.group.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});mesh.skeleton.update();
      const p=b.group.position.clone(),attr=mesh.geometry.attributes.position;let sole=Infinity,penetration=0;
      for(let i=0;i<attr.count;i++)if(attr.getY(i)<.014){mesh.getVertexPosition(i,p);p.applyMatrix4(mesh.matrixWorld);sole=Math.min(sole,p.y);penetration=Math.max(penetration,.5-d.sightline([p.x,.5,p.z],[p.x,-.3,p.z],true).hit-p.y);}
      const pos=d.pos(),floor=.5-d.sightline([pos.x,.5,pos.z],[pos.x,-.3,pos.z],true).hit;d.portrait(3.2,1.2,.35);d.step(1/60,1);d.render();return{pos,clip:d.clip(),sole,floor,error:sole-floor,penetration};
    });await page.screenshot({path:`${out}/${view}-stopped.png`});
    const ok=!errors.length&&stopped.clip==='Idle'&&(before?rows.some(r=>r.error<-.05):rows.every(r=>Math.abs(r.error)<.007)&&Math.abs(stopped.error)<.007&&stopped.penetration<.007);
    results.push({view,ok,rows,stopped,errors});console.log(JSON.stringify(results.at(-1)));await context.close();
  }
}finally{await browser.close();}
fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2)+'\n');if(results.some(r=>!r.ok))process.exitCode=1;
