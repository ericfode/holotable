#!/usr/bin/env node
/** Small synthetic HTTP-replay sample; uses the registered reader/classifier/detector/renderer. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url), args=process.argv.slice(2), arg=(k,d)=>args.includes('--'+k)?args[args.indexOf('--'+k)+1]:d;
const {chromium}=require(arg('playwright','playwright')), demos=require('../test/fixtures/structured-compositions.cjs');
const out=path.resolve(arg('out','results/structured-default')), url=arg('url','http://127.0.0.1:5198'), started=performance.now(), records=[], errors=[];
await fs.mkdir(out,{recursive:true});
const source=await fetch(`${url}/effect-source-manifest.json`).then(r=>r.json());
await fs.writeFile(path.join(out,'source-manifest.json'),JSON.stringify(source,null,2));
const browser=await chromium.launch({headless:true,executablePath:arg('browser',undefined)});
async function snapshot(p){return p.locator('[data-effect-state]').evaluate(el=>({text:el.innerText,cards:[...el.querySelectorAll('[data-effect-card],[data-effect-resource]')].map(c=>({id:c.dataset.effectId,name:c.dataset.effectCard??c.dataset.effectResource,text:c.innerText})).sort((a,b)=>(a.id??'').localeCompare(b.id??''))}));}
async function settled(p){await p.locator('[data-effect-state="settled"]').waitFor();assert.equal(await p.locator('.card-effect-overlay').count(),0);return snapshot(p);}
let failure;
try {
    for(const viewport of [{width:1440,height:1100},{width:390,height:844}]){
        const context=await browser.newContext({viewport,recordVideo:{dir:path.join(out,'video'),size:viewport}}), p=await context.newPage();
        p.on('pageerror',e=>errors.push(e.message));await p.clock.install();
        for(const demo of (viewport.width===390?demos.filter(d=>d.id==='perseverance'):demos)){
            const body=[demo.game.header,...demo.game.steps,demo.game.end].map(x=>JSON.stringify(x)).join('\n')+'\n';
            await p.route(`**/replays/json-demo/games/${demo.id}.jsonl`,r=>r.fulfill({status:200,contentType:'application/x-ndjson',body}));
            await p.goto(`${url}/#/t/json-demo/g/${demo.id}?step=0`);
            await p.getByRole('button',{name:'Next decision',exact:true}).waitFor();
            await p.evaluate(()=>document.fonts.ready);await p.locator('[data-effect-state] img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.complete?null:new Promise(r=>{i.onload=r;i.onerror=r;setTimeout(r,4000)}))));
            const before=await snapshot(p); const frames=[];
            await p.getByRole('button',{name:'Next decision',exact:true}).click();await p.mouse.move(0,0);
            // Freeze the common deterministic clock only for exact beat captures.
            await p.clock.pauseAt(await p.evaluate(()=>Date.now()+100));
            await p.getByRole('button',{name:'Next decision',exact:true}).click();await p.mouse.move(0,0);
            const overlay=p.locator('.card-effect-overlay[data-effect-renderer="structured"]');await overlay.waitFor();
            assert.equal(await p.locator('.ce-caption strong').innerText(),demo.title);
            assert.equal(await overlay.getAttribute('data-effect-fallbacks'),'');
            let advanced=0;
            for(const fraction of [.18,.46,.72,.90]){
                const target=Math.round(fraction*2400);await p.clock.runFor(target-advanced);advanced=target;
                const progress=Number(await overlay.getAttribute('data-effect-progress'));assert.ok(Math.abs(progress-fraction)<.025,`${demo.id} ${progress} vs ${fraction}`);
                if(fraction>=.46){assert.equal(await p.locator('[data-effect-id="body"] .stat.hp').evaluate(el=>el.style.opacity),'0','old HP and nested wound chip are hidden');assert.equal(await p.locator('[data-shared-counter="hp"]').first().innerText(),String(demo.game.steps[2].state.players.p2.ground[0].h-demo.game.steps[2].state.players.p2.ground[0].d));}
                const file=`${demo.id}-${viewport.width}-${Math.round(fraction*100)}.png`, image=await p.locator('[data-effect-state]').screenshot({path:path.join(out,file),style:'nav.sticky {visibility:hidden !important}'});
                frames.push({file,progress,sha256:createHash('sha256').update(image).digest('hex')});
            }
            await p.clock.runFor(500);const final=await settled(p);
            const file=`${demo.id}-${viewport.width}-natural.png`, image=await p.locator('[data-effect-state]').screenshot({path:path.join(out,file),style:'nav.sticky {visibility:hidden !important}'});frames.push({file,sha256:createHash('sha256').update(image).digest('hex')});
            await p.getByRole('button',{name:'Previous decision',exact:true}).click();assert.deepEqual((await snapshot(p)).cards,before.cards);assert.equal(await p.locator('[data-effect-id="body"] .stat.hp').evaluate(el=>el.style.opacity),'','backseek restores ordinary counters');
            await p.getByRole('button',{name:'Next decision',exact:true}).click();await overlay.waitFor();await p.clock.runFor(2600);assert.deepEqual(await settled(p),final);
            records.push({id:demo.id,title:demo.title,viewport,synthetic:true,recipes:demo.recipes,frames,checks:['default route, no query opt-in','null selected target','actual composed outcomes','natural completion','backseek restores before','repeat is idempotent']});
            await p.clock.resume();
        }
        await context.close();
    }
    assert.deepEqual(errors,[]);assert.equal((await fetch(`${url}/effect-source-manifest.json`).then(r=>r.json())).sourceFingerprint,source.sourceFingerprint,'served build remains frozen');
}catch(e){failure={message:e.message,stack:e.stack};throw e;}finally{
    await fs.writeFile(path.join(out,'runtime.json'),JSON.stringify({sourceFingerprint:source.sourceFingerprint,passed:!failure,failure,durationMs:Math.round(performance.now()-started),records,errors},null,2));await browser.close();
}
console.log(`PASS ${records.length} compound default UI cases in ${Math.round(performance.now()-started)}ms; ${out}`);
