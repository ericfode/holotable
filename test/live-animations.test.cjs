const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { createRequire } = require('node:module');
const ts = require('typescript5');
const modules = new Map();
function loadTS(filename) {
    filename = path.resolve(filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} }; modules.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
    } }).outputText;
    const requireFromFile = createRequire(filename);
    new Function('require', 'module', 'exports', code)(specifier => {
        if (specifier.startsWith('.')) {
            const candidate = ['.ts', '.tsx'].map(extension => path.resolve(path.dirname(filename), specifier + extension)).find(fs.existsSync);
            if (candidate) return loadTS(candidate);
        }
        return requireFromFile(specifier);
    }, module, module.exports);
    return module.exports;
}
const {liveCardEffects}=loadTS(path.join(__dirname,'../src/effects/live.ts'));
const {createSettingsStore,releaseSettingsStore}=loadTS(path.join(__dirname,'../src/lib/settings.ts'));
const demos=require('./fixtures/semantic-vocabulary.cjs');
const move=(source,n=1)=>({t:'move',n,seat:'p1',kind:'card',label:source.n,card:source});
for(const demo of demos)test(`live ${demo.title}: shared vocabulary uses witnessed receipt and physical identity`,()=>{
    const before=demo.game.steps[0].state,after=demo.game.steps[2].state,source=before.players.p1.hand[0];
    const cue=liveCardEffects().move(before,after,move(source));
    assert.ok(cue?.structured);assert.equal(cue.target,null);assert.equal(cue.source.id,source.id);
    const receipt=cue.outcomes.find(o=>o.kind===demo.kind);assert.ok(receipt);assert.equal(receipt.card.id,after.players.p2.ground[0].id);
});
test('live multi-choice event waits for actual receipt; repeat action gets a new playback key',()=>{
    const demo=demos.find(d=>d.id==='repair'),before=demo.game.steps[0].state,after=demo.game.steps[2].state,source=before.players.p1.hand[0];
    const tracker=liveCardEffects();assert.equal(tracker.move(before,before,move(source)),null);
    const cue=tracker.move(before,after,{...move(source,2),card:after.players.p2.ground[0]});
    assert.ok(cue.outcomes.some(o=>o.kind==='heal'&&o.amount===3));
    const repeat=tracker.move(before,after,move(source,3));assert.notEqual(repeat.key,cue.key);
});
test('live unknown sources, attacks, resourcing and interrupted target choices produce no invented effect',()=>{
    const before=demos[0].game.steps[0].state,after=demos[0].game.steps[2].state,source=before.players.p1.hand[0],tracker=liveCardEffects();
    assert.equal(tracker.move(before,after,move({...source,id:'unknown'})),null);
    assert.equal(tracker.move(before,after,move(before.players.p2.ground[0])),null);
    const resources=structuredClone(after);resources.players.p1.resources=[source];
    assert.equal(tracker.move(before,resources,move(source)),null);
    assert.equal(tracker.move(before,before,move(source)),null);tracker.clear();
    assert.equal(tracker.move(before,after,{...move(source),card:undefined}),null);
});
test('animation defaults on, explicit off persists; older saved settings preserve on default',()=>{
    const values=new Map(),old=global.localStorage;global.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
    const stores=[];
    try {
        const fresh=createSettingsStore('demo');stores.push(fresh);assert.equal(fresh.getState().effects,true);
        fresh.getState().setEffects(false);const restored=createSettingsStore('demo');stores.push(restored);assert.equal(restored.getState().effects,false);
        restored.getState().setEffects(true);assert.equal(JSON.parse(values.get('demo')).effects,true);
        values.set('old',JSON.stringify({art:false}));const legacy=createSettingsStore('old');stores.push(legacy);assert.equal(legacy.getState().effects,true);
    } finally {stores.forEach(releaseSettingsStore);global.localStorage=old;}
});
for (const mutation of ['round','phase','print','duplicate']) test(`live rejects ${mutation} contradiction coherently carried with successful damage`,()=>{
    const before=demos[0].game.steps[0].state,after=structuredClone(demos[0].game.steps[2].state),source=before.players.p1.hand[0];
    if(mutation==='round')after.round++;
    if(mutation==='phase')after.phase='regroup';
    if(mutation==='print')after.players.p1.discard[0].s='SOR_999';
    if(mutation==='duplicate')after.players.p1.discard.push({...after.players.p1.discard[0]});
    assert.equal(liveCardEffects().move(before,after,move(source)),null);
});
test('boundary interruption clears a pending choice before a later successful receipt',()=>{
    const before=demos[0].game.steps[0].state,after=demos[0].game.steps[2].state,source=before.players.p1.hand[0],tracker=liveCardEffects();
    assert.equal(tracker.move(before,before,move(source)),null);
    assert.equal(tracker.move(before,{...before,round:before.round+1},{...move(source),card:undefined}),null);
    assert.equal(tracker.move(before,after,{...move(source),card:undefined}),null);
});
