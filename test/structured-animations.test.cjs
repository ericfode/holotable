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
    assert.equal(index.coverage.totalDefinitions, index.coverage.mappedDefinitions + Object.values(index.coverage.excluded).reduce((a,b)=>a+b,0));
    assert.deepEqual(Object.keys(index.coverage.families).sort(), ['damage','defeat','exhaust','heal','ready','resource','return']);
    const seen = new Map();
    for (const card of index.cards) {
        const printed = JSON.parse(fs.readFileSync(path.join(__dirname, '../forceteki/test/json/Card', `${card.id}.json`)));
        assert.equal(card.name, printed.title);
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

test('unregistered exact prints enter the real event detector without replacing authored signatures', () => {
    const { game, action }=fixture(); const saved=copy(game);
    const actions=classifyGame(game); assert.equal(actions[0].cls,'play-event');
    const cue=detectCardEffects(game,actions).get(2);
    assert.equal(cue.definition.id,'structured:ill-cover-for-you'); assert.equal(cue.structured.recipe,'damage');
    assert.equal(cue.outcomes[0].amount,1); assert.deepEqual(game,saved);
    assert.equal(detectCardEffects(game,[{...action,cls:'ability'}]).size,0);
    const open=fixture({id:'event',n:'Open Fire',s:'SOR_172'});
    assert.equal(detectCardEffects(open.game,[open.action]).get(2).structured,undefined);
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

test('unsupported modal and aggregate-only resource outcomes surface explicit fallback reasons', () => {
    for(const [id,reason] of [['command','unsupported-definition'],['resupply','insufficient-physical-evidence:resource']]) {
        const definition=CARD_EFFECTS.find(c=>c.id===id),before=showcaseGame(definition).steps[0].state;
        const cue=preparePreviewCue({definition,nonce:1,structured:true},before);
        assert.deepEqual(cue.outcomes,[]);assert.ok(cue.structured.fallbacks.includes(reason));assert.notDeepEqual(cue.transition.before,cue.transition.after);
    }
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
