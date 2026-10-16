#!/usr/bin/env node
/** Focused registered UI checks. Uses existing Playwright; installs nothing. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
const args=process.argv.slice(2), option=(key,fallback)=>args.includes(`--${key}`)?args[args.indexOf(`--${key}`)+1]:fallback;
if(args.includes('--help')) { console.log('node scripts/verify-structured-animations.mjs --url http://127.0.0.1:5197 --out DIRECTORY --playwright MODULE_PATH [--browser EXECUTABLE]');process.exit(0); }
const out=path.resolve(option('out','results/structured-animations')), url=option('url','http://127.0.0.1:5197');
const require=createRequire(import.meta.url), {chromium}=require(option('playwright',process.env.PLAYWRIGHT_MODULE??'playwright'));
const start=performance.now(), records=[], errors=[], missing=[];
let failure=null;
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:option('browser',process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE)});
const fixture=JSON.parse(await fs.readFile(new URL('../test/fixtures/structured-replay.json',import.meta.url),'utf8'));
const text=[fixture.header,...fixture.steps,fixture.end].map(x=>JSON.stringify(x)).join('\n')+'\n';
const identity=p=>p.locator('.effects-feature h2');
async function ready(p) {
    await p.evaluate(()=>document.fonts.ready);
    await p.locator('.effects-board img').evaluateAll(imgs=>Promise.race([
        Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(r=>{img.onload=r;img.onerror=r;}))),
        new Promise(r=>setTimeout(r,7000))
    ]));
}
async function snapshot(p) {
    return p.locator('[data-effect-state]').evaluate(el=>({text:el.innerText,cards:[...el.querySelectorAll('[data-effect-card],[data-effect-resource]')].map(c=>({id:c.dataset.effectId,name:c.dataset.effectCard??c.dataset.effectResource,text:c.innerText})).sort((a,b)=>(a.id??'').localeCompare(b.id??''))}));
}
async function settled(p) {await p.locator('[data-effect-state="settled"]').waitFor();assert.equal(await p.locator('.card-effect-overlay').count(),0);assert.equal(await p.locator('div.panel.fixed.z-50').count(),0,'no stale floating inspector');return snapshot(p);}
async function capture(p,file,board=true) {
    const image=await (board?p.locator('.effects-board'):p).screenshot({path:path.join(out,file),animations:'allow',...(board?{style:'nav.sticky { visibility: hidden !important; }'}:{})});
    return {file,sha256:createHash('sha256').update(image).digest('hex')};
}
async function open(p,card,progress=18,shared=true) {
    await p.goto(`${url}/#/effects?card=${card}&progress=${progress}${shared?'&recipes=1':''}`);
    await p.locator(`.card-effect-overlay[data-effect-renderer="${shared?'structured':'signature'}"]`).waitFor();
    assert.ok((await identity(p).innerText()).length);await ready(p);await p.mouse.move(0,0);
}
try {
    for(const viewport of (args.includes('--replay-only')?[]:[{width:1440,height:1250},{width:390,height:844}])) {
        const p=await browser.newPage({viewport});
        p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)missing.push({url:r.url(),status:r.status()});});
        const cards=viewport.width===390?[['waylay','Waylay'],['open-fire','Open Fire']]:[['repair','Repair'],['waylay','Waylay'],['vanquish','Vanquish']];
        for(const [card,title] of cards) {
            const row={card,title,viewport,frames:[]};
            await open(p,card);assert.equal(await identity(p).innerText(),title);
            const before=await snapshot(p);
            if(viewport.width===1440&&card==='repair') {
                await open(p,card,46,false);row.frames.push(await capture(p,'before-repair-board.png'));
                await p.getByRole('button',{name:'Shared JSON recipes',exact:true}).click();
                await p.locator('[data-effect-renderer="structured"]').waitFor();
                assert.equal(await p.getByRole('button',{name:'Shared JSON recipes',exact:true}).getAttribute('aria-pressed'),'true');
            }
            for(const [label,value] of [['Anticipation',18],['Impact',46],['Outcome',72],['Settle',90]]) {
                await p.getByRole('button',{name:label,exact:true}).click();await p.mouse.move(0,0);
                assert.equal(await identity(p).innerText(),title);
                assert.equal(await p.locator('.card-effect-overlay').getAttribute('data-effect-progress'),(value/100).toFixed(4));
                assert.equal(await p.locator('.card-effect-overlay').getAttribute('data-effect-fallbacks'),'');
                row.frames.push(await capture(p,`${card}-${viewport.width}-${value}.png`));
            }
            await p.getByRole('button',{name:'Final board',exact:true}).click();const final=await settled(p);
            await p.getByRole('button',{name:'Anticipation',exact:true}).click();await p.locator('[data-effect-state="animating"]').waitFor();
            assert.deepEqual(await snapshot(p).then(x=>x.cards),before.cards);
            await p.getByRole('button',{name:'Replay effect',exact:true}).click();await p.mouse.move(0,0);
            await p.locator('.card-effect-overlay').waitFor();assert.deepEqual(await settled(p),final);
            row.frames.push(await capture(p,`${card}-${viewport.width}-natural.png`));
            await p.getByRole('button',{name:'Replay effect',exact:true}).click();await p.mouse.move(0,0);await p.locator('.card-effect-overlay').waitFor();
            assert.deepEqual(await settled(p),final);
            row.lifecycle=['final handoff','backseek restores before','natural completion equals final','repeated playback idempotent'];
            row.images=await p.locator('.effects-board img').evaluateAll(imgs=>({total:imgs.length,loaded:imgs.filter(i=>i.complete&&i.naturalWidth>0).length}));
            records.push(row);
        }
        // Switching while the old timeline runs must not overwrite the new ending.
        await open(p,'repair',18);await p.getByRole('button',{name:'Replay effect',exact:true}).click();await p.mouse.move(0,0);
        await p.locator('.effects-card-pick').filter({hasText:'Waylay'}).click();await p.mouse.move(0,0);
        await settled(p);assert.equal(await identity(p).innerText(),'Waylay');
        await p.waitForTimeout(2600);assert.equal(await identity(p).innerText(),'Waylay');assert.equal(await p.locator('.card-effect-overlay').count(),0);
        records.push({viewport,check:'interrupt Repair with Waylay; stale completion does not replace selection',pass:true});
        await p.close();
    }
    const p=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
    p.on('pageerror',e=>errors.push(e.message));
    if(!args.includes('--replay-only')) {
        await open(p,'repair',18);await p.getByRole('button',{name:'Replay effect',exact:true}).click();await p.mouse.move(0,0);await settled(p);
        records.push({check:'reduced-motion natural completion',pass:true});
    }
    // Serve a labelled synthetic replay through the normal HTTP reader and registered GameViewer route.
    await p.route('**/replays/structured-demo/games/direct.jsonl',r=>r.fulfill({status:200,contentType:'application/x-ndjson',body:text}));
    await p.goto(`${url}/#/t/structured-demo/g/direct?step=0`);
    await p.getByRole('button',{name:'Next decision',exact:true}).waitFor();
    await p.getByRole('button',{name:'Next decision',exact:true}).click();await p.mouse.move(0,0);
    await p.getByRole('button',{name:'Next decision',exact:true}).click();await p.mouse.move(0,0);
    await p.locator('.card-effect-overlay[data-effect-renderer="structured"]').waitFor();
    assert.equal(await p.locator('.ce-caption strong').innerText(),"I'll Cover For You");
    const replayFinal=await settled(p);assert.ok(replayFinal.cards.some(c=>c.id==='body'));
    await p.getByRole('button',{name:'Previous decision',exact:true}).click();
    await p.getByRole('button',{name:'Next decision',exact:true}).click();await p.mouse.move(0,0);
    await p.locator('.card-effect-overlay[data-effect-renderer="structured"]').waitFor();assert.deepEqual(await settled(p),replayFinal);
    records.push({check:'unregistered print through HTTP replay reader → classifier → detector → GameViewer; repeat after backseek',pass:true,synthetic:true});
    // A deployed leader has a summary alias and an arena body, but only one physical identity.
    const leaderGame=structuredClone(fixture), event={id:'leader-event',n:'Retaliation',s:'SEC_077'};
    const leader={id:'vader',n:'Darth Vader: Dark Lord of the Sith',s:'SOR_010',p:5,h:7,d:0,x:1,incarnation:'vader-entry',owner:'p2'};
    for(const [i,step] of leaderGame.steps.entries()) {
        const a=step.state.players.p1,b=step.state.players.p2;
        a.leader={id:'luke',n:'Luke Skywalker: Faithful Friend',s:'SOR_005',dep:0,x:0};
        a.hand=i<2?[event]:[];a.discard=i<2?[]:[event];a.res.ready=i<2?5:0;a.base.id='baseA';a.base.d=3;
        b.leader={id:leader.id,n:leader.n,s:leader.s,dep:i<2?1:0,x:1,epic:1};b.ground=i<2?[leader]:[];
        step.state.baseDamagedThisPhase={round:2,phase:'action',damage:[{player:'p1',sourceId:'vader',targetId:'baseA',amount:3}]};
    }
    leaderGame.steps[1].action={kind:'card',id:event.id,label:'retaliation'};
    leaderGame.steps[2].action={kind:'card',id:'vader',label:leader.n};leaderGame.steps[2].title='Choose a unit that dealt damage to a base this phase';
    const leaderText=[leaderGame.header,...leaderGame.steps,leaderGame.end].map(x=>JSON.stringify(x)).join('\n')+'\n';
    await p.route('**/replays/structured-demo/games/leader.jsonl',r=>r.fulfill({status:200,contentType:'application/x-ndjson',body:leaderText}));
    await p.goto(`${url}/#/t/structured-demo/g/leader?step=0`);
    await p.getByRole('button',{name:'Next decision',exact:true}).waitFor();
    await p.getByRole('button',{name:'Next decision',exact:true}).click();await p.mouse.move(0,0);
    await p.getByRole('button',{name:'Next decision',exact:true}).click();await p.mouse.move(0,0);
    await p.locator('.card-effect-overlay[data-effect-renderer="structured"]').waitFor();
    assert.equal(await p.locator('.card-effect-overlay').getAttribute('data-effect-fallbacks'),'');
    await settled(p);assert.equal(await p.locator('[data-effect-seat="p2"] [data-effect-zone="ground"] [data-effect-id="vader"]').count(),0);
    assert.equal(await p.locator('[data-effect-seat="p2"] [data-effect-zone="leader"][data-effect-id="vader"]').count(),1);
    await p.screenshot({path:path.join(out,'leader-natural.png')});
    records.push({check:'synthetic Retaliation: deployed physical leader returns exhausted to leader area, no discard',pass:true,synthetic:true});
    await p.close();assert.deepEqual(errors,[]);
} catch(error) {
    failure={message:error.message,stack:error.stack};throw error;
} finally {
    await fs.writeFile(path.join(out,'runtime.json'),JSON.stringify({url,browser:'installed Chromium headless shell',durationMs:Math.round(performance.now()-start),passed:!failure,failure,records,errors,missing},null,2));
    await browser.close();
}
console.log(`PASS ${records.length} runtime cases, ${Math.round(performance.now()-start)}ms; evidence: ${out}`);
