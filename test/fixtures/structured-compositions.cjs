// Synthetic presentation fixtures, never claimed as engine recordings. IDs occur only in test/demo data.
const baseline = require('./structured-replay.json');
const printed = id => require('../../forceteki/test/json/Card/' + id + '.json');
module.exports = ['maim', 'perseverance', 'grassroots-resistance'].map(id => {
    const card = printed(id), game = structuredClone(baseline);
    const source = {id:'event', n:card.title, s:`${card.setId.set}_${String(card.setId.number).padStart(3,'0')}`};
    for (const [i,step] of game.steps.entries()) {
        const p=step.state.players.p1, q=step.state.players.p2;
        p.hand=i<2?[source]:[];p.discard=i<2?[]:[source];p.res={ready:8-(i<2?0:card.cost),total:8};
        p.base={id:'baseA',n:id==='perseverance'?'Capital City':'Echo Base',s:id==='perseverance'?'SOR_020':'SOR_024',hp:30,d:id==='grassroots-resistance'?(i<2?6:3):0};
        if(id==='grassroots-resistance')p.leader={id:'leaderA',n:'Luke Skywalker: Faithful Friend',s:'SOR_005',dep:0,x:0};
        const body=q.ground[0];body.d=id==='perseverance'?(i<2?3:0):i<2?0:id==='maim'?1:3;
        if(id==='maim'&&i>=2)body.x=1;
        if(id==='perseverance'&&i>=2)body.u=[{id:'new-shield',n:'Shield',s:null,t:1}];
    }
    game.steps[1].action={kind:'card',id:'event',label:card.title};
    game.steps[2].title=card.text;game.steps[2].action={kind:'button',label:'Done'};
    return {id,title:card.title,game,recipes:id==='maim'?['damage','exhaust']:id==='perseverance'?['heal','shield']:['damage','heal']};
});
