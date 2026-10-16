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
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {SemanticVocabulary}=loadTS(path.join(__dirname,'../src/effects/semanticVocabulary.tsx'));
const {StructuredSignature}=loadTS(path.join(__dirname,'../src/effects/structuredSignature.tsx'));
const {strikeProgress,gatherPoint,sharedSemanticMotion}=loadTS(path.join(__dirname,'../src/effects/semanticMotion.ts'));
const {classifyGame}=loadTS(path.join(__dirname,'../src/data/actions.ts'));
const {detectCardEffects}=loadTS(path.join(__dirname,'../src/effects/detect.ts'));
const demos=require('./fixtures/semantic-vocabulary.cjs');
const box={x:140,y:170,w:100,h:150,sx:1.3,sy:1.8,exact:true,counters:{hp:{x:178,y:230,w:20,h:20},power:{x:102,y:230,w:20,h:20}}};
const source={...box,x:600,y:510},placed=outcome=>({outcome,box,from:box,to:box,key:'sample',slot:0});
const render=(outcome,p=.3,sourceKnown=true)=>renderToStaticMarkup(React.createElement(SemanticVocabulary,{source,placed:placed(outcome),p,sourceKnown}));
for(const demo of demos)test(`${demo.title} actual default outcome receives ${demo.motion}, with no universal beam`,()=>{
    const saved=structuredClone(demo.game),actions=classifyGame(demo.game),cue=detectCardEffects(demo.game,actions).get(2);
    const effect=cue.outcomes.find(o=>o.kind===demo.kind);assert.ok(effect);assert.equal(cue.structured.sourceKnown,true);assert.deepEqual(cue.structured.fallbacks,[]);
    const svg=render(effect);assert.match(svg,new RegExp(`data-semantic-motion="${demo.motion}"`));assert.doesNotMatch(svg,/ce-beam|ce-shock-ring/);
    assert.equal(svg.includes('data-semantic-projectile="strike"'),demo.kind==='damage');
    assert.deepEqual(demo.game,saved);assert.equal(cue.outcomes.filter(o=>o.kind===demo.kind).length,1);
});
test('motion itself distinguishes a committed strike from a slowing curved gathering',()=>{
    const early=strikeProgress(.22),middle=strikeProgress(.28),late=strikeProgress(.34);
    assert.ok(late.head-middle.head>middle.head-early.head,'strike accelerates into recipient');
    assert.equal(strikeProgress(0).visible,false);assert.equal(strikeProgress(1).visible,false);
    const a=gatherPoint(.2,1,100,150),b=gatherPoint(.5,1,100,150),c=gatherPoint(.8,1,100,150);
    assert.ok(Math.abs(b.x-a.x)>Math.abs(c.x-b.x),'restorative gathering slows as it converges');
    assert.ok(Math.abs(gatherPoint(1,-1,100,150).x)<1e-9);assert.equal(gatherPoint(1,-1,100,150).y,-12);assert.ok(gatherPoint(.5,-1,100,150).x<0);
    const shapes=demos.map(d=>render({kind:d.kind,seat:'p2',card:{id:'body',n:'Wampa',s:'SOR_164'}},.46));
    for(const [i,meaning]of ['angular-impact','enclosing-shell','gathering-mend','ascending-steps'].entries())assert.match(shapes[i],new RegExp(`data-semantic-arrival="${meaning}"`));
});
test('missing or explicit physical damage origin retains a local hit without inventing event travel',()=>{
    const damage={kind:'damage',seat:'p2',card:{id:'body',n:'Wampa',s:'SOR_164'},amount:1};
    assert.match(render(damage),/data-semantic-projectile/);
    for(const svg of [render(damage,.3,false),render({...damage,sourceCard:{id:'unit-source',n:'Marine',s:'SOR_095'}})]){assert.doesNotMatch(svg,/data-semantic-projectile/);assert.match(svg,/angular-impact/);}
});
test('static shield/buff definitions cannot create enhancement visuals without actual outcome changes',()=>{
    for(const demo of demos.filter(d=>['shield','buff'].includes(d.kind))){
        const game=structuredClone(demo.game);game.steps[2].state.players.p2.ground=structuredClone(game.steps[0].state.players.p2.ground);game.steps[3].state=structuredClone(game.steps[2].state);
        const cue=detectCardEffects(game,classifyGame(game)).get(2);assert.ok(!cue.outcomes.some(o=>o.kind===demo.kind));
        const svg=renderToStaticMarkup(React.createElement(StructuredSignature,{geometry:{source,outcomes:cue.outcomes.map(placed)},p:.5,sourceKnown:true}));
        assert.doesNotMatch(svg,/data-semantic-motion/);
    }
    assert.equal(sharedSemanticMotion('attack'),undefined,'existing attack protocol is not admitted by a visual family');
    assert.equal(sharedSemanticMotion('create'),undefined);
});
test('screen-space shapes and clearance remain finite at mobile aspect ratios and reverse seeks',()=>{
    const outcome={kind:'shield',card:{id:'body',n:'Wampa',s:'SOR_164'},seat:'p2',amount:1};
    for(const p of [0,.18,.46,.9,.46,.18]){
        const svg=renderToStaticMarkup(React.createElement(SemanticVocabulary,{source,placed:{...placed(outcome),box:{...box,sx:.36,sy:2.1}},p,sourceKnown:true,zones:{base:{...box,stat:{x:500,y:40,w:30,h:25}}}}));
        assert.doesNotMatch(svg,/NaN|Infinity/);assert.match(svg,/maskUnits="userSpaceOnUse"/);assert.match(svg,/scale\(2\.7777777777777777 0\.47619047619047616\)/);
    }
    assert.equal(render(outcome,.46),render(outcome,.46),'no timers/randomness or accumulated state');
});

test('one shared vocabulary names action roles across impact, support, state, movement and control',()=>{
    const {sharedEffectRole}=loadTS(path.join(__dirname,'../src/effects/semanticMotion.ts'));
    assert.equal(sharedEffectRole('damage'),'impact');assert.equal(sharedEffectRole('shield'),'protection');assert.equal(sharedEffectRole('heal'),'restoration');assert.equal(sharedEffectRole('buff'),'enhancement');
    for(const kind of ['draw','discard','mill','return','recover','play'])assert.equal(sharedEffectRole(kind),'movement');
    assert.equal(sharedEffectRole('control'),'control');assert.notEqual(sharedEffectRole('defeat'),sharedEffectRole('damage'));assert.notEqual(sharedEffectRole('debuff'),sharedEffectRole('damage'));
    const control={kind:'control',card:{id:'body',n:'Wampa',s:'SOR_164'},seat:'p1',fromSeat:'p2',zone:'ground',unit:{n:'Wampa',s:'SOR_164',p:4,h:5,d:0}};
    const svg=renderToStaticMarkup(React.createElement(StructuredSignature,{geometry:{source,outcomes:[{...placed(control),from:box,to:{...box,y:450}}]},p:.5,sourceKnown:true}));
    assert.match(svg,/data-semantic-role="control" data-semantic-motion="control-transfer"/);assert.doesNotMatch(svg,/data-semantic-projectile|angular-impact|enclosing-shell/);
});

test('control transfer carries the same body with actual current power, wounds and HP',()=>{
    const unit={id:'same-body',n:'Wampa',s:'SOR_164',p:6,h:7,d:3,x:1,owner:'p2',incarnation:'continuing-entry'};
    const outcome={kind:'control',card:unit,unit,seat:'p1',ownerSeat:'p2',fromSeat:'p2',zone:'ground'};
    const draw=p=>renderToStaticMarkup(React.createElement(StructuredSignature,{geometry:{source,outcomes:[{...placed(outcome),from:box,to:{...box,y:450}}]},p,sourceKnown:true}));
    for(const p of [.3,.72,.9]){
        const svg=draw(p);assert.match(svg,/data-semantic-control-stat="hp"[^>]*>4<\/text>/);assert.match(svg,/data-semantic-control-stat="power"[^>]*>6<\/text>/);assert.match(svg,/data-semantic-control-stat="wounds"[^>]*>3<\/text>/);
        assert.doesNotMatch(svg,/data-semantic-projectile/);
    }
    assert.equal(unit.owner,'p2');assert.equal(unit.incarnation,'continuing-entry');
});
