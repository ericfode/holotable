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
    const module = { exports: {} };
    modules.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    const requireFromFile = createRequire(filename);
    new Function('require', 'module', 'exports', code)((specifier) => {
        const candidate = path.resolve(path.dirname(filename), `${specifier}.ts`);
        return specifier.startsWith('.') && fs.existsSync(candidate) ? loadTS(candidate) : requireFromFile(specifier);
    }, module, module.exports);
    return module.exports;
}
const { planStructuredCue, structuredCard, structuredDefinition } = loadTS(path.join(__dirname, '../src/effects/structured.ts'));
const { detectCardEffects } = loadTS(path.join(__dirname, '../src/effects/detect.ts'));
const { observedOutcomes } = loadTS(path.join(__dirname, '../src/effects/outcomes.ts'));
const { classifyGame } = loadTS(path.join(__dirname, '../src/data/actions.ts'));
const { CARD_EFFECTS } = loadTS(path.join(__dirname, '../src/effects/catalogue.ts'));
const { showcaseGame } = loadTS(path.join(__dirname, '../src/effects/showcase.ts'));
const { preparePreviewCue, previewSceneKey } = loadTS(path.join(__dirname, '../src/effects/previewStages.ts'));
const index = require('../src/effects/generated/kesselAnimations.json');
const copy = structuredClone;
const source = { id: 'event', n: "I'll Cover For You", s: 'IBH_005' };
const body = { id: 'body', incarnation: 'entry-1', n: 'Wampa', s: 'SOR_164', p: 4, h: 5, d: 0, owner: 'p2' };
function fixture(card = source) {
    const player = name => ({ name, base: { n: 'Base', s: 'SOR_025', hp: 30, d: 0 }, leader: null,
        hand: [], deck: 10, discard: [], ground: [], space: [], res: { ready: 5, total: 5 } });
    const before = { round: 2, phase: 'action', initiative: 'p1', players: { p1: player('A'), p2: player('B') } };
    before.players.p1.hand = [copy(card)]; before.players.p2.ground = [copy(body)];
    const after = copy(before); after.players.p1.hand = []; after.players.p1.discard.push(copy(card)); after.players.p2.ground[0].d = 1;
    const game = { header: { t: 'header', v: 1, seed: 42, engine: null,
        players: [{ id: 'p1', bot: 'A', deck: '' }, { id: 'p2', bot: 'B', deck: '' }] }, end: null,
        steps: [{ t: 'step', n: 0, state: before },
            { t: 'step', n: 1, pid: 'p1', prompt: 'actionWindow', title: 'Choose an action', action: { kind: 'card', id: card.id, label: card.n }, state: copy(before) },
            { t: 'step', n: 2, pid: 'p1', prompt: 'selectCard', title: 'Choose units to deal 1 damage to', action: { kind: 'card', id: body.id, label: body.n }, state: after },
            { t: 'step', n: 3, pid: 'p2', prompt: 'actionWindow', title: 'Choose an action', action: { kind: 'button', label: 'Pass' }, state: copy(after) }] };
    const action = { cls: 'play-event', card, index: 1, until: 2, seat: 'p1', target: null };
    const cue = { definition: structuredDefinition(card), seat: 'p1', source: card, target: null, key: 'sample',
        transition: { before, after }, outcomes: observedOutcomes(game, action) };
    return { game, action, cue, before, after };
}

test('generated index maps seven reusable families and accounts for every definition', async () => {
    assert.equal(index.coverage.totalDefinitions, index.coverage.allCards.routed);
    assert.equal(index.coverage.events.routed, 442);
    assert.equal(index.coverage.events.routed, index.coverage.events.fullyMappedShape + index.coverage.events.partialShape + index.coverage.events.unsupportedShape);
    assert.ok(Object.keys(index.coverage.families).length >= 15);
    const seen = new Map();
    for (const card of index.cards) {
        const printed = JSON.parse(fs.readFileSync(path.join(__dirname, '../forceteki/test/json/Card', `${card.id}.json`)));
        assert.equal(card.name, printed.subtitle ? `${printed.title}: ${printed.subtitle}` : printed.title);
        for (const print of card.prints) { assert.ok(!seen.has(print), `${print} ambiguous`); seen.set(print, card.id); }
    }
    const { classifyAnimation, animationIndex } = await import('../scripts/import-kessel-animations.mjs');
    const sample = index.cards.find(c=>c.id==='open-fire');
    const raw = { schema: 'swu-card-ir/v1', compilerHash: 'compiler', sourceTreeHash: 'tree', cards: [{ ...sample, internalName: sample.id, status:'supported', card:{ types:['event'], title:sample.name, setCodes:[{set:'SOR',number:172}] }, abilities:{card:[sample.ability]} }] };
    assert.equal(animationIndex(raw, Buffer.from('same'), 'revision').cards[0].recipe, 'damage');
    for (const change of [{ then:{} }, { optional:true }, { ifYouDo:{} }, { costs:[{kind:'pay'}] }, { futureBranch:{} }]) {
        const altered=copy(raw.cards[0]);Object.assign(altered.abilities.card[0],change);assert.equal(classifyAnimation(altered).reason,'compound-ability');
    }
    const dynamic=copy(raw.cards[0]);dynamic.abilities.card[0].effect.amount={kind:'query'};assert.equal(classifyAnimation(dynamic).reason,'dynamic-amount');
    const compound=copy(raw.cards[0]);compound.abilities.card[0].effect.then={kind:'draw'};assert.equal(classifyAnimation(compound).reason,'compound-effect');
});

test('unregistered exact prints enter the real event detector with ordinary authored entries migrated to the shared default', () => {
    const { game, action }=fixture(); const saved=copy(game);
    const actions=classifyGame(game); assert.equal(actions[0].cls,'play-event');
    const cue=detectCardEffects(game,actions).get(2);
    assert.equal(cue.definition.id,'structured:ill-cover-for-you'); assert.equal(cue.structured.recipe,'damage');
    assert.equal(cue.outcomes[0].amount,1); assert.deepEqual(game,saved);
    assert.equal(detectCardEffects(game,[{...action,cls:'ability'}]).size,0);
    const open=fixture({id:'event',n:'Open Fire',s:'SOR_172'});
    assert.equal(detectCardEffects(open.game,[open.action]).get(2).structured.recipe,'damage');
});

test('unknown print, absent print, and unresolved live actions never guess a definition', () => {
    assert.equal(structuredCard({n:'Open Fire',s:'SOR_999'}),undefined);
    assert.equal(structuredCard({n:'Open Fire',s:null}),undefined);
    const {game,action}=fixture();game.steps.pop();assert.equal(detectCardEffects(game,[action]).size,0);
});

test('null targets use actual receipts, preserve exact endings, and never evaluate static amounts', () => {
    const {cue}=fixture(); cue.outcomes[0].amount=2;cue.transition.after.players.p2.ground[0].d=2;
    const result=planStructuredCue(cue); assert.equal(result.target,null);assert.equal(result.outcomes[0].amount,2);
    assert.equal(result.transition,cue.transition);assert.equal(result.transition.after,cue.transition.after);
});

for (const id of ['open-fire','repair','vanquish','waylay','keep-fighting']) test(`${id} comparison keeps staged game truth and fresh playback identity`, () => {
    const definition=CARD_EFFECTS.find(c=>c.id===id), before=showcaseGame(definition).steps[0].state;
    const authored=preparePreviewCue({definition,nonce:1},before), shared=preparePreviewCue({definition,nonce:1,structured:true},before);
    assert.deepEqual(shared.transition,authored.transition); assert.ok(shared.outcomes.length,id); assert.equal(shared.structured.fallbacks.length,0);
    const again=preparePreviewCue({definition,nonce:2,structured:true},before);
    assert.notEqual(shared.key,again.key);assert.deepEqual(shared.transition,again.transition);
    assert.notEqual(previewSceneKey({definition,nonce:1}),shared.key);
});

test('modal composition renders witnessed modes and aggregate resources stay count-only', () => {
    const definition=CARD_EFFECTS.find(c=>c.id==='command'), before=showcaseGame(definition).steps[0].state;
    const cue=preparePreviewCue({definition,nonce:1,structured:true},before);
    assert.deepEqual(cue.outcomes.filter(o=>!o.sourceDisposal).map(o=>o.kind).sort(),['buff','defeat']);
    assert.ok(cue.structured.fallbacks.includes('insufficient-physical-evidence:damage'), 'a minimal discard reference proves departure but not lethal damage amount');
    const resupply=CARD_EFFECTS.find(c=>c.id==='resupply'), state=showcaseGame(resupply).steps[0].state;
    const raw=preparePreviewCue({definition:resupply,nonce:1},state);
    raw.outcomes=[{kind:'resource',card:null,seat:'p1',zone:'resources',amount:1}];
    const aggregate=planStructuredCue(raw);
    assert.equal(aggregate.outcomes[0].card,null);assert.equal(aggregate.outcomes[0].fromZone,undefined);
    assert.ok(aggregate.structured.fallbacks.includes('aggregate-only:resource'));
});

test('missing, duplicate, unknown and different-incarnation physical recipients never acquire a rich visual', () => {
    for(const mutate of [
        c=>{delete c.outcomes[0].card.id;},
        c=>{c.transition.before.players.p2.space.push(copy(body));},
        c=>{c.transition.before.players.p2.ground[0].u=[{...body,t:0}];},
        c=>{c.transition.before.players.p1.knownDeck=[copy(body)];},
        c=>{c.transition.after.players.p2.ground[0].cap=[copy(body)];},
        c=>{c.outcomes[0].card={...body,id:'missing'};},
        c=>{c.transition.after.players.p2.ground[0].incarnation='entry-2';},
        c=>{c.outcomes[0].amount=99;},
        c=>{c.outcomes[0].prevented=true;},
        c=>{c.outcomes[0].seat='p1';},
        c=>{c.transition.after.players.p2.ground[0].s='SOR_999';}
    ]) {const cue=copy(fixture().cue);mutate(cue);assert.equal(planStructuredCue(cue).outcomes.filter(o=>o.kind!=='discard').length,0);}
});

test('owner-hand routes use the physical controller origin and actual owner destination', () => {
    const {cue,before,after}=fixture({id:'event',n:'Exploit Confidence',s:'HMW_238'});
    const subject=before.players.p2.ground[0]; subject.owner='p1';subject.p=6;
    after.players.p2.ground=[];after.players.p1.hand=[{id:subject.id,n:subject.n,s:subject.s,owner:'p1'}];
    cue.outcomes=[{kind:'return',card:subject,seat:'p1',zone:'hand',amount:1}];
    const result=planStructuredCue(cue).outcomes[0];assert.equal(result.fromSeat,'p2');assert.equal(result.fromZone,'ground');assert.equal(result.seat,'p1');assert.equal(result.destination,'hand');
});

test('defeat follows observed physical leader transition and ignores the deployed summary alias', () => {
    const {cue,before,after}=fixture({id:'event',n:"Rival's Fall",s:'SHD_079'});
    // Resolve using its authoritative installed print rather than a guessed number.
    cue.source.s=index.cards.find(c=>c.id==='rivals-fall').prints[0];
    before.players.p2.leader={...body,dep:1,x:1};after.players.p2.leader={...body,dep:0,x:1};after.players.p2.ground=[];
    cue.outcomes=[{kind:'defeat',card:copy(body),seat:'p2',zone:'leader',amount:1}];
    let result=planStructuredCue(cue);assert.equal(result.outcomes.filter(o=>o.kind==='defeat').length,1);assert.equal(result.outcomes[0].zone,'leader');assert.equal(result.outcomes[0].leader.dep,0);
    after.players.p2.leader.x=0;assert.equal(planStructuredCue(cue).outcomes.filter(o=>o.kind!=='discard').length,0);
});

test('disappearance and token cessation without a destination never become defeat or damage', () => {
    const {cue,after}=fixture();after.players.p2.ground=[];cue.outcomes=[{kind:'defeat',card:body,seat:'p2',zone:'discard'}];
    assert.equal(planStructuredCue(cue).outcomes.filter(o=>o.kind!=='discard').length,0);
});

test('physical resource entry uses its observed origin and readiness without inventing a face reveal', () => {
    const card={id:'event',n:'Resupply',s:'SOR_126'}, {cue,after}=fixture(card);
    after.players.p1.discard=[];after.players.p1.resources=[{...card,x:1}];after.players.p1.res.total++;
    cue.outcomes=[{kind:'resource',card,seat:'p1',zone:'resources',amount:1}];
    const result=planStructuredCue(cue).outcomes[0];assert.equal(result.fromZone,'hand');assert.equal(result.entersReady,false);assert.equal(result.visibility,undefined);
});


test('source ambiguity suppresses directed attribution while preserving checked recipient effects', () => {
    for(const mutate of [
        c=>{c.source={...c.source,id:undefined};},
        c=>{c.transition.before.players.p1.hand=[];},
        c=>{c.transition.before.players.p2.hand.push(copy(c.source));},
        c=>{c.source={...c.source,n:'Unrelated Event'};}
    ]) {
        const cue=copy(fixture().cue);mutate(cue);const result=planStructuredCue(cue);
        assert.equal(result.structured.sourceKnown,false);assert.ok(result.structured.fallbacks.includes('insufficient-source-evidence'));
        assert.equal(result.outcomes.filter(o=>o.kind==='damage').length,1);
    }
});

test('event source disposal is observed once and never becomes a payment claim', () => {
    const result=planStructuredCue(fixture().cue), disposal=result.outcomes.filter(o=>o.kind==='discard');
    assert.equal(disposal.length,1);assert.equal(disposal[0].card.id,'event');assert.equal(disposal[0].fromZone,'hand');
    assert.ok(!result.outcomes.some(o=>o.kind==='pay'));assert.equal(result.playCost,undefined);
});

// Export a deterministic recorded-format sample for the temporary UI harness, not a claimed engine recording.
module.exports.fixture=fixture;

test('sparse recorded-format selection keeps a nullable target and still identifies actual damage recipients', () => {
    const game=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/structured-replay.json'))), actions=classifyGame(game);
    assert.equal(actions[0].target,null);
    const cue=detectCardEffects(game,actions).get(2);assert.equal(cue.target,null);
    assert.equal(cue.outcomes.find(o=>o.kind==='damage').card.id,'body');
    assert.equal(cue.structured.sourceKnown,true);
});

test('exhaust maps only a real continuing readiness change and leaves wounds untouched', () => {
    const card={id:'event',n:'Evade Arrest',s:'TS26_082'}, {cue,before,after}=fixture(card);
    after.players.p2.ground[0].d=0;after.players.p2.ground[0].x=1;
    cue.outcomes=[{kind:'exhaust',card:copy(body),seat:'p2',zone:'ground',amount:1}];
    let result=planStructuredCue(cue);assert.equal(result.outcomes[0].kind,'exhaust');assert.equal(result.structured.fallbacks.length,0);
    assert.equal(before.players.p2.ground[0].d,after.players.p2.ground[0].d);
    delete after.players.p2.ground[0].x;assert.equal(planStructuredCue(cue).outcomes.filter(o=>o.kind==='exhaust').length,0);
});

test('runtime fixture base identities, HP and event payment agree with installed printed data', () => {
    const game=require('./fixtures/structured-replay.json');
    for(const [seat,name] of [['p1','echo-base'],['p2','capital-city']]) {
        const printed=JSON.parse(fs.readFileSync(path.join(__dirname,'../forceteki/test/json/Card',`${name}.json`)));
        const base=game.steps[0].state.players[seat].base;assert.equal(base.n,printed.title);assert.equal(base.hp,printed.hp);
    }
    const printed=JSON.parse(fs.readFileSync(path.join(__dirname,'../forceteki/test/json/Card/ill-cover-for-you.json')));
    assert.equal(game.steps[0].state.players.p1.res.ready-game.steps[2].state.players.p1.res.ready,printed.cost);
});

const {resolveCardAnimation, routeAnimationCue, defineAnimationOverrides, CARD_ANIMATION_OVERRIDES}=loadTS(path.join(__dirname,'../src/effects/animationResolver.ts'));
test('shared default migrates ordinary legacy entries; bespoke precedence is an explicit exact-print opt-in',()=>{
    let shared=0,overrides=0;
    for(const entry of CARD_EFFECTS){const route=resolveCardAnimation({n:entry.name,s:entry.setCode});if(route.renderer==='shared')shared++;else overrides++;}
    assert.equal(shared,175);assert.equal(overrides,5);assert.equal(CARD_ANIMATION_OVERRIDES.entries.length,5);
    const repair=CARD_EFFECTS.find(c=>c.id==='repair'), before=showcaseGame(repair).steps[0].state, raw=preparePreviewCue({definition:repair,nonce:0},before);
    assert.ok(routeAnimationCue(raw).structured);assert.equal(routeAnimationCue(raw,'legacy').structured,undefined);
    const custom=defineAnimationOverrides([{signatureId:'repair',prints:['SOR_074'],reason:'Explicit reviewed alternate.'}]);
    assert.equal(routeAnimationCue(raw,'default',custom).animationOverride,'repair');
    assert.ok(routeAnimationCue(raw,'shared',custom).structured);
    assert.throws(()=>defineAnimationOverrides([{signatureId:'repair',prints:['SOR_172'],reason:'Wrong print.'}]));
    assert.throws(()=>defineAnimationOverrides([{signatureId:'repair',prints:['SOR_074'],reason:''}]));
    assert.throws(()=>defineAnimationOverrides([...custom.entries,...custom.entries]));
});
for(const demo of require('./fixtures/structured-compositions.cjs'))test(`${demo.title}: unregistered JSON composition through classifier and default detector without special ID registration`,()=>{
    assert.equal(CARD_EFFECTS.some(c=>c.id===demo.id),false);
    const actions=classifyGame(demo.game), cue=detectCardEffects(demo.game,actions).get(2);
    assert.equal(actions[0].target,null);assert.equal(cue.definition.id,`structured:${demo.id}`);
    assert.deepEqual(cue.structured.recipes.sort(),demo.recipes.sort());assert.deepEqual(cue.structured.fallbacks,[]);
    assert.equal(cue.structured.sourceKnown,true);assert.equal(cue.outcomes.filter(o=>o.sourceDisposal).length,1);
    const c=JSON.parse(fs.readFileSync(path.join(__dirname,'../forceteki/test/json/Card',demo.id+'.json')));
    assert.equal(demo.game.steps[0].state.players.p1.res.ready-demo.game.steps[2].state.players.p1.res.ready,c.cost);
});
test('compositional importer flags future fields and dynamic/empty groups instead of overclaiming mapping',async()=>{
    const {compileEffectProgram,summarizeProgram}=await import('../scripts/import-kessel-animations.mjs');
    const draw={kind:'draw',target:'self',amount:{kind:'const',value:1}}, summary=e=>summarizeProgram(compileEffectProgram(e));
    for(const effect of [{kind:'sequence',effects:[]},{kind:'simultaneous'}, {kind:'resolveChoice'}, {kind:'chooseModalEffects',choices:{kind:'query'}}]) assert.ok(summary(effect).unsupported.length);
    for(const effect of [{kind:'sequence',effects:[draw],futureBranch:{}},{kind:'chooseModalEffects',choices:[{label:'A',effect:draw,futureBranch:{}}]},{...draw,futureBranch:{}}]){assert.deepEqual(summary(effect).recipes,['draw']);assert.ok(summary(effect).unsupported.length);}
    assert.deepEqual(summary({kind:'delayedEffect',effect:{kind:'defeat'}}).recipes,[]);
});
test('aggregate deck receipts cannot double-spend a deck decrease or use duplicate/wrong-seat physical origins',()=>{
    for(const mode of ['combined','duplicate','wrong-seat']){
        const {cue,before,after}=fixture();before.players.p1.deck=6;after.players.p1.deck=3;
        after.players.p1.hand=[{id:'a',n:'A',s:null},{id:'b',n:'B',s:null},{id:'c',n:'C',s:null}];
        cue.outcomes=[{kind:'draw',card:null,seat:'p1',zone:'hand',amount:3}];
        if(mode==='combined'){after.players.p1.discard.push(...['d','e','f'].map(id=>({id,n:id,s:null})));cue.outcomes.push({kind:'mill',card:null,seat:'p1',zone:'discard',amount:3});}
        if(mode==='duplicate')before.players.p1.knownDeck=[{id:'a',n:'A',s:null},{id:'a',n:'A',s:null},...['u','v','w','x'].map(id=>({id,n:id,s:null}))];
        if(mode==='wrong-seat')before.players.p2.knownDeck=[{id:'a',n:'A',s:null}];
        assert.equal(planStructuredCue(cue).outcomes.filter(o=>['draw','mill'].includes(o.kind)).length,0,mode);
    }
});
test('control preserves ownership; an Attach heuristic does not suppress an event; recovery does not infer bottom position',()=>{
    const {cue,before,after,game,action}=fixture();after.players.p2.ground=[];after.players.p1.ground=[copy(body)];
    cue.outcomes=[{kind:'control',card:body,seat:'p1',fromSeat:'p2',fromZone:'ground',zone:'ground',ownerSeat:'p2'}];
    const control=planStructuredCue(cue).outcomes[0];assert.equal(control.ownerSeat,'p2');assert.equal(control.seat,'p1');
    assert.equal(detectCardEffects(game,[{...action,cls:'play-upgrade'}]).size,1);
    before.players.p2.ground=[];before.players.p1.discard=[copy(body)];after.players.p1.ground=[];after.players.p1.knownDeck=[copy(body)];
    cue.outcomes=[{kind:'recover',card:body,seat:'p1',zone:'deck',amount:1}];
    const recovery=planStructuredCue(cue).outcomes[0];assert.equal(recovery.destination,undefined);assert.equal(recovery.label,'RECOVERED TO DECK');
});
