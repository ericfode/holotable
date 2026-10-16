// Four legal synthetic presentation examples sharing the same physical target and table geometry.
const baseline=require('./structured-replay.json');
const printed=id=>require('../../forceteki/test/json/Card/'+id+'.json');
const available=[...printed('capital-city').aspects,...printed('boba-fett#collecting-the-bounty').aspects];
module.exports=[['open-fire','damage','strike'],['moment-of-peace','shield','protect'],['repair','heal','restore'],['tactical-advantage','buff','uplift']].map(([id,kind,motion])=>{
    const card=printed(id),game=structuredClone(baseline),print=card.setCodes[0],source={id:'event',n:card.title,s:`${print.set}_${String(print.number).padStart(3,'0')}`};
    const paid=card.cost+2*card.aspects.filter(a=>!available.includes(a)).length;
    for(const [i,step] of game.steps.entries()){
        const a=step.state.players.p1,b=step.state.players.p2,u=b.ground[0];
        a.base={id:'baseA',n:'Capital City',s:'SOR_020',hp:30,d:0};a.res={ready:8-(i<2?0:paid),total:8};a.hand=i<2?[source]:[];a.discard=i<2?[]:[source];
        u.d=kind==='heal'?(i<2?3:0):kind==='damage'&&i>=2?4:0;
        if(kind==='shield'&&i>=2)u.u=[{id:'new-shield',n:'Shield',s:null,t:1}];
        if(kind==='buff'&&i>=2){u.p=6;u.h=7;u.status=[{kind:'buff',label:'+2/+2 · PHASE',duration:'phase'}];}
    }
    game.steps[1].action={kind:'card',id:'event',label:card.title};game.steps[2].title=card.text;game.steps[2].action={kind:'button',label:'Done'};
    return {id,title:card.title,kind,motion,game,paid};
});
