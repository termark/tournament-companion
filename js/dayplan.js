/* dayplan.js — when will the tracked team be busy on each day, and how sure can we be?
 *
 * Enumerates every path the team can still take: each group position it can still finish in,
 * then win/loss at every knockout game along the way. Each path has a weight; the weight of a
 * time slot is the summed weight of the paths in which the team is at the pool during that slot
 * (game time plus `arriveMinutes` before it). Scores already entered prune the tree.
 *
 * Weights are deliberately simple and explained in the UI:
 *   - group positions: equal across the positions still reachable (or the single confirmed one)
 *   - knockout outcomes: 50/50 unless the result is already in
 * No DOM; runs in the browser (window.DayPlan) and in Node (tools).
 */
(function(root,factory){
  if(typeof module==="object"&&module.exports) module.exports=factory(require("./engine.js"));
  else root.DayPlan=factory(root.Engine);
})(typeof self!=="undefined"?self:this,function(E){
"use strict";
const D={};
const toMin=t=>{const [h,m]=t.split(":").map(Number);return h*60+m;};
const fromMin=m=>String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
D.GAME_MINUTES=35;      // 4×5 min stop-start plus breaks: a game occupies ~35 min of pool time
D.SLOT=15;              // timeline resolution in minutes

// Which group positions can the team still finish in? Confirmed → [rank]; otherwise every rank
// not excluded by points already banked (a cheap bound: max points reachable vs min points others have).
D.possibleRanks=function(T,scores,team){
  const rk=E.teamRank(T,scores,team);
  if(rk.confirmed) return [rk.rank];
  const group=rk.group, teams=T.groups[group], pts=T.points||{win:3,draw:1,loss:0};
  const st=E.stats(T,scores,group);
  const left=t=>E.groupGames(T,group).filter(g=>!E.played(scores,g)&&(g.a.team===t||g.b.team===t)).length;
  const maxPts=t=>st[t].pts+left(t)*pts.win, minPts=t=>st[t].pts;
  const n=teams.length, ranks=[];
  // rank r is possible if at least (r-1) others can finish above us and at least (n-r) others can finish below us
  const canBeAbove=teams.filter(t=>t!==team&&maxPts(t)>=minPts(team)).length;
  const canBeBelow=teams.filter(t=>t!==team&&minPts(t)<=maxPts(team)).length;
  for(let r=1;r<=n;r++){ if(canBeAbove>=r-1&&canBeBelow>=n-r) ranks.push(r); }
  return ranks.length?ranks:[rk.rank];
};

// All remaining paths: [{weight, games:[{game,side}], placing}]
D.paths=function(T,scores,team){
  const out=[];
  const ranks=D.possibleRanks(T,scores,team);
  const rk=E.teamRank(T,scores,team);
  ranks.forEach(rank=>{
    const w0=1/ranks.length;
    const walk=(g,prev,weight,acc)=>{
      if(!g){ out.push({weight,games:acc,placing:null}); return; }
      const p=E.participants(T,scores,g);
      let side;
      if(!prev) side=(g.a.group===rk.group&&g.a.rank===rank)?"a":"b";
      else { const k=prev.outcome==="win"?"winner":"loser"; side=(g.a[k]===prev.game.n)?"a":"b"; }
      const r=E.result(T,scores,g);
      const outcomes=(r&&r.winner)?[{o:r.winner===side?"win":"loss",w:1}]:[{o:"win",w:.5},{o:"loss",w:.5}];
      outcomes.forEach(({o,w})=>{
        const nx=E.nextGame(T,g.n,o);
        const step={game:g,side,outcome:o};
        if(nx) walk(nx,step,weight*w,acc.concat([step]));
        else out.push({weight:weight*w,games:acc.concat([step]),placing:E.placing(g,o)});
      });
    };
    walk(E.entryGame(T,rk.group,rank),null,w0,[]);
  });
  // group games are fixed and belong to every path
  const groupGames=E.teamGroupGames(T,team).map(g=>({game:g,side:g.a.team===team?"a":"b",outcome:null}));
  out.forEach(p=>{ p.games=groupGames.concat(p.games); });
  return out;
};

// Per day: slots with busy probability, plus the games that can fall on that day with their probability.
D.day=function(T,scores,team,date){
  const paths=D.paths(T,scores,team);
  const arrive=T.arriveMinutes==null?30:T.arriveMinutes;
  const dayGames={};                        // game id -> {game, prob}
  const total=paths.reduce((s,p)=>s+p.weight,0)||1;
  const allDay=T.games.filter(g=>g.date===date);
  const first=Math.min(...allDay.map(g=>toMin(g.time)))-arrive, last=Math.max(...allDay.map(g=>toMin(g.time)))+D.GAME_MINUTES;
  const start=Math.floor(first/60)*60, end=Math.ceil(last/60)*60;
  const slots=[]; for(let m=start;m<end;m+=D.SLOT) slots.push({from:m,to:m+D.SLOT,busy:0,games:new Set()});
  paths.forEach(p=>{
    const seen=new Set();
    p.games.forEach(s=>{
      if(s.game.date!==date||seen.has(s.game.id)) return; seen.add(s.game.id);
      const g=s.game, a=toMin(g.time)-arrive, b=toMin(g.time)+D.GAME_MINUTES;
      dayGames[g.id]=dayGames[g.id]||{game:g,prob:0}; dayGames[g.id].prob+=p.weight/total;
      slots.forEach(sl=>{ if(sl.from<b&&sl.to>a){ sl.busy+=p.weight/total; sl.games.add(g.id); } });
    });
  });
  // a path might include the same game twice? no; but two games can overlap in a slot — cap at 1
  slots.forEach(sl=>{ sl.busy=Math.min(1,sl.busy); sl.games=[...sl.games]; });
  // free windows: maximal runs of slots with busy below a threshold
  const windows=(thr)=>{
    const out=[]; let cur=null;
    slots.forEach(sl=>{
      const free=sl.busy<thr;
      if(free&&!cur) cur={from:sl.from,to:sl.to,maxBusy:sl.busy};
      else if(free){ cur.to=sl.to; cur.maxBusy=Math.max(cur.maxBusy,sl.busy); }
      else if(cur){ out.push(cur); cur=null; }
    });
    if(cur) out.push(cur);
    return out.filter(w=>w.to-w.from>=45).map(w=>({...w,label:fromMin(w.from)+"–"+fromMin(w.to),minutes:w.to-w.from}));
  };
  const games=Object.values(dayGames).sort((x,y)=>toMin(x.game.time)-toMin(y.game.time));
  const certain=games.filter(x=>x.prob>0.999);
  return {date,slots,games,certain,paths:paths.length,
    windows:{sure:windows(0.0001),likely:windows(0.2501),maybe:windows(0.5001)},
    fmt:fromMin};
};

// Days that still have anything for this team (today or later), in order.
D.days=function(T,scores,team){
  const paths=D.paths(T,scores,team);
  const dates=new Set(); paths.forEach(p=>p.games.forEach(s=>dates.add(s.game.date)));
  return [...dates].sort();
};
D.fmt=fromMin;
return D;
});
