// Real locomotion on touch layouts: shoulder posture and matched quarter-cycle captures.
import { chromium } from 'playwright';
import fs from 'node:fs';
const args=process.argv.slice(2),before=args.includes('--before');
const [base='http://127.0.0.1:4174/',out='/private/tmp/dakar-reference-shoulders']=args.filter(a=>!a.startsWith('--'));
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
    const rows=[];
    for(const [label,level,clip] of [['walk',0,'Walk'],['jog',1,'Jog'],['sprint',2,'Run']]) {
      await page.evaluate(level=>{const d=window.__dakar;d.place(-42,-66,Math.PI/2);d.lookYaw(Math.PI/2);d.portrait(3.2,1.2,.35);d.step(1/60,90);d.strideToggle(level);},level);
      await page.keyboard.down('KeyW');
      await page.evaluate(()=>window.__dakar.step(1/60,90));
      const samples=await page.evaluate(()=>{
        const d=window.__dakar,b=d.body(),rows=[];
        for(let i=0;i<100;i++) {
          d.step(1/120,1);b.group.updateMatrixWorld(true);
          const row={clip:d.clip(),time:d.motion().time};
          for(const side of ['Left','Right']) {
            const shoulder=b.group.getObjectByName('mixamorig'+side+'Shoulder'),arm=b.group.getObjectByName('mixamorig'+side+'Arm');
            const p=b.group.position.clone(),q=p.clone();shoulder.getWorldPosition(p);arm.getWorldPosition(q);row[side]=q.y-p.y;
          }
          rows.push(row);
        }
        return rows;
      });
      // Matched poses after the sample window, followed by quarter-cycle advances at 120 Hz.
      for(let phase=0;phase<4;phase++) {
        await page.evaluate(phase=>{const d=window.__dakar;if(phase)d.step(1/120,Math.round(d.motion().duration/d.motion().timeScale*30));d.render();},phase);
        await page.screenshot({path:`${out}/${view}-${label}-${phase}.png`});
      }
      await page.keyboard.up('KeyW');await page.evaluate(()=>window.__dakar.step(1/60,120));
      rows.push({label,clip,minimum:Math.min(...samples.flatMap(r=>[r.Left,r.Right])),maximum:Math.max(...samples.flatMap(r=>[r.Left,r.Right])),allClips:[...new Set(samples.map(r=>r.clip))]});
    }
    const ok=rows.every(r=>r.allClips.length===1&&r.allClips[0]===r.clip&&(before?r.maximum>0:r.maximum<-.04&&r.minimum>-.18))&&!errors.length;
    results.push({view,ok,rows,errors});console.log(JSON.stringify(results.at(-1)));await c.close();
  }
}finally{await browser.close();}
fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));
if(results.some(r=>!r.ok))process.exitCode=1;
