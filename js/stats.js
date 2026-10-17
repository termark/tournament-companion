/* stats.js — tournament statistics from entered results. No DOM; window.Stats in the browser, module in Node. */
(function(root,factory){
  if(typeof module==="object"&&module.exports) module.exports=factory(require("./engine.js"));
  else root.Stats=factory(root.Engine);
})(typeof self!=="undefined"?self:this,function(E){
"use strict";
const S={};

// Every played game with both participants known, from each side's point of view.
S.teamGames=function(T,scores){
  const by={}; E.allTeams(T).forEach(t=>by[t]=[]);
  T.games.forEach(g=>{
    const r=E.result(T,scores,g); if(!r) return;
    const p=E.participants(T,scores,g); if(!p.a.team||!p.b.team) return;
    const base={game:g,label:g.stage==="group"?"Group "+g.group:g.label,stage:g.stage,date:g.date,time:g.time,pens:r.pens};
    by[p.a.team].push({...base,gf:r.a,ga:r.b,opp:p.b.team,won:r.winner==="a",lost:r.winner==="b",draw:r.draw&&!r.winner,penWin:r.pens&&r.winner==="a",penLoss:r.pens&&r.winner==="b"});
    by[p.b.team].push({...base,gf:r.b,ga:r.a,opp:p.a.team,won:r.winner==="b",lost:r.winner==="a",draw:r.draw&&!r.winner,penWin:r.pens&&r.winner==="b",penLoss:r.pens&&r.winner==="a"});
  });
  return by;
};

S.table=function(T,scores){
  const by=S.teamGames(T,scores);
  const rows=Object.entries(by).map(([team,gs])=>{
    const gf=gs.reduce((s,x)=>s+x.gf,0), ga=gs.reduce((s,x)=>s+x.ga,0);
    const w=gs.filter(x=>x.won).length, l=gs.filter(x=>x.lost).length, d=gs.filter(x=>x.draw).length;
    const best=gs.slice().sort((a,b)=>(b.gf-b.ga)-(a.gf-a.ga))[0]||null;
    const worst=gs.slice().sort((a,b)=>(a.gf-a.ga)-(b.gf-b.ga))[0]||null;
    return {team,group:E.groupOf(T,team),p:gs.length,w,d,l,gf,ga,gd:gf-ga,avgF:gs.length?gf/gs.length:0,avgA:gs.length?ga/gs.length:0,
      cleanSheets:gs.filter(x=>x.ga===0).length,bigWins:gs.filter(x=>x.gf-x.ga>=10).length,best,worst,games:gs,unbeaten:l===0&&gs.length>0};
  });
  rows.sort((a,b)=>b.gd-a.gd||b.gf-a.gf||a.team.localeCompare(b.team));
  return rows;
};

S.overview=function(T,scores){
  const played=T.games.filter(g=>E.result(T,scores,g));
  const totals=played.map(g=>{const r=E.result(T,scores,g);return {g,sum:r.a+r.b,margin:Math.abs(r.a-r.b),r};});
  const goals=totals.reduce((s,x)=>s+x.sum,0);
  const byMargin=k=>totals.filter(x=>k(x.margin)).length;
  const hi=totals.slice().sort((a,b)=>b.sum-a.sum)[0]||null, big=totals.slice().sort((a,b)=>b.margin-a.margin)[0]||null;
  const closest=totals.filter(x=>x.margin<=1).sort((a,b)=>a.margin-b.margin||b.sum-a.sum);
  return {games:played.length,total:T.games.length,goals,avg:played.length?goals/played.length:0,
    draws:byMargin(m=>m===0),byOne:byMargin(m=>m===1),byTwoThree:byMargin(m=>m>=2&&m<=3),tenPlus:byMargin(m=>m>=10),
    highest:hi,biggest:big,closest:closest.slice(0,5),shootouts:totals.filter(x=>x.r.pens).length};
};

// Compare two teams: common opponents, Saturday-only form, record vs top-N teams by GD.
S.compare=function(T,scores,teamA,teamB,topN){
  const by=S.teamGames(T,scores), tab=S.table(T,scores);
  const top=new Set(tab.slice(0,topN||6).map(r=>r.team));
  const ga=by[teamA]||[], gb=by[teamB]||[];
  const common=ga.filter(x=>gb.some(y=>y.opp===x.opp)).map(x=>({opp:x.opp,a:x,b:gb.find(y=>y.opp===x.opp)}));
  const vsTop=t=>(by[t]||[]).filter(x=>top.has(x.opp)&&x.opp!==teamA&&x.opp!==teamB);
  const knock=t=>(by[t]||[]).filter(x=>x.stage!=="group");
  const sum=gs=>({gf:gs.reduce((s,x)=>s+x.gf,0),ga:gs.reduce((s,x)=>s+x.ga,0),n:gs.length});
  const rowA=tab.find(r=>r.team===teamA), rowB=tab.find(r=>r.team===teamB);
  const h2h=ga.filter(x=>x.opp===teamB);
  return {a:rowA,b:rowB,common,vsTopA:vsTop(teamA),vsTopB:vsTop(teamB),knockA:sum(knock(teamA)),knockB:sum(knock(teamB)),h2h,topN:topN||6};
};

S.fmt1=x=>(Math.round(x*10)/10).toFixed(1);
return S;
});
