/* engine.js — tournament-agnostic, DOM-free logic.
 * Loads in the browser as window.Engine and in Node via require() (used by tools/validate.js).
 *
 * Inputs everywhere: T = tournament definition (tournaments/*.js), scores = {fixture_id:{a,b}}.
 * A knockout game that ends level looks for a penalty shoot-out score under fixture_id+"_pen".
 */
(function(root,factory){
  if(typeof module==="object"&&module.exports) module.exports=factory();
  else root.Engine=factory();
})(typeof self!=="undefined"?self:this,function(){
"use strict";
const E={};

/* ---------- small helpers ---------- */
function pad(n){return String(n).padStart(2,"0")}
function num(v){ if(v===""||v==null) return null; const n=Number(v); return Number.isFinite(n)?n:null; }
E.ordinal=function(n){ n=Number(n); const s=["th","st","nd","rd"], v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); };
E.arrival=function(time,mins){
  const [h,m]=time.split(":").map(Number);
  let x=h*60+m-(mins==null?30:mins); if(x<0)x=0;
  return pad(Math.floor(x/60))+":"+pad(x%60);
};
E.dayLabel=(T,date)=>(T.days&&T.days[date])||date;
E.gameByNum=(T,n)=>T.games.find(g=>g.n===n);
E.gameById=(T,id)=>T.games.find(g=>g.id===id);
E.groupOf=(T,team)=>Object.keys(T.groups).find(g=>T.groups[g].includes(team));
E.allTeams=T=>Object.values(T.groups).flat();
E.groupGames=(T,group)=>T.games.filter(g=>g.stage==="group"&&g.group===group);
E.knockoutGames=T=>T.games.filter(g=>g.stage!=="group");
E.teamGroupGames=(T,team)=>T.games.filter(g=>g.stage==="group"&&(g.a.team===team||g.b.team===team));
E.sortByTime=(games)=>games.slice().sort((x,y)=>(x.date+x.time).localeCompare(y.date+y.time)||x.n-y.n);

/* ---------- scores & results ---------- */
E.scoreOf=(scores,id)=>{ const s=scores[id]; return {a:s?num(s.a):null,b:s?num(s.b):null}; };
E.played=(scores,g)=>{ const s=E.scoreOf(scores,g.id); return s.a!=null&&s.b!=null; };

// null if not played, else {a,b,winner:'a'|'b'|null,draw,pens:{a,b}|null,needsPens}
E.result=function(T,scores,g){
  const s=E.scoreOf(scores,g.id);
  if(s.a==null||s.b==null) return null;
  if(s.a!==s.b) return {a:s.a,b:s.b,winner:s.a>s.b?"a":"b",draw:false,pens:null,needsPens:false};
  if(g.stage==="group") return {a:s.a,b:s.b,winner:null,draw:true,pens:null,needsPens:false};
  const p=E.scoreOf(scores,g.id+"_pen");
  if(p.a!=null&&p.b!=null&&p.a!==p.b) return {a:s.a,b:s.b,winner:p.a>p.b?"a":"b",draw:false,pens:p,needsPens:false};
  return {a:s.a,b:s.b,winner:null,draw:true,pens:(p.a!=null||p.b!=null)?p:null,needsPens:true};
};
E.decisive=(T,scores,g)=>{const r=E.result(T,scores,g);return !!(r&&r.winner)};

/* ---------- group tables ---------- */
E.stats=function(T,scores,group,gameFilter){
  const pts=T.points||{win:3,draw:1,loss:0};
  const s={}; T.groups[group].forEach(t=>s[t]={team:t,p:0,w:0,d:0,l:0,gf:0,ga:0,gd:0,pts:0});
  E.groupGames(T,group).forEach(g=>{
    if(gameFilter&&!gameFilter(g))return;
    const r=E.result(T,scores,g); if(!r)return;
    const A=s[g.a.team],B=s[g.b.team];
    A.p++;B.p++;A.gf+=r.a;A.ga+=r.b;B.gf+=r.b;B.ga+=r.a;
    if(r.a>r.b){A.w++;B.l++;A.pts+=pts.win;B.pts+=pts.loss}
    else if(r.a<r.b){B.w++;A.l++;B.pts+=pts.win;A.pts+=pts.loss}
    else {A.d++;B.d++;A.pts+=pts.draw;B.pts+=pts.draw}
  });
  Object.values(s).forEach(x=>x.gd=x.gf-x.ga);
  return s;
};

const WA_LEVELS=["head-to-head points","head-to-head goal difference","head-to-head goals scored","overall goal difference","overall goals scored"];

// World Aquatics group tie-break, applied in isolation and re-started for any sub-group that remains tied.
function orderWA(T,scores,group,cluster){
  if(cluster.length<2) return {arr:cluster,provisional:false,level:-1};
  const names=cluster.map(x=>x.team);
  const mini=E.stats(T,scores,group,g=>names.includes(g.a.team)&&names.includes(g.b.team));
  const keys=[t=>mini[t.team].pts,t=>mini[t.team].gd,t=>mini[t.team].gf,t=>t.gd,t=>t.gf];
  for(let k=0;k<keys.length;k++){
    const f=keys[k];
    const sorted=cluster.slice().sort((x,y)=>f(y)-f(x)||x.team.localeCompare(y.team));
    if(new Set(sorted.map(f)).size>1){
      const out=[]; let provisional=false, level=k, i=0;
      while(i<sorted.length){
        let j=i; while(j<sorted.length&&f(sorted[j])===f(sorted[i]))j++;
        const sub=sorted.slice(i,j);
        if(sub.length>1){ const r=orderWA(T,scores,group,sub); out.push(...r.arr); provisional=provisional||r.provisional; level=Math.max(level,r.level); }
        else out.push(sub[0]);
        i=j;
      }
      return {arr:out,provisional,level};
    }
  }
  return {arr:cluster.slice().sort((x,y)=>x.team.localeCompare(y.team)),provisional:true,level:keys.length};
}

function headToHead(T,scores,group,t1,t2){
  const g=E.groupGames(T,group).find(x=>(x.a.team===t1&&x.b.team===t2)||(x.a.team===t2&&x.b.team===t1));
  const r=g?E.result(T,scores,g):null;
  if(!r||r.draw) return 0;
  const winner=r.winner==="a"?g.a.team:g.b.team;
  return winner===t1?-1:1;
}

// Mackenzie-style: head-to-head settles a two-way tie; anything else is provisional (goal difference only as a display aid).
function orderSimple(T,scores,group,cluster){
  if(cluster.length===2){
    const hh=headToHead(T,scores,group,cluster[0].team,cluster[1].team);
    if(hh!==0) return {arr:hh<0?[cluster[0],cluster[1]]:[cluster[1],cluster[0]],provisional:false,level:0};
  }
  return {arr:cluster.slice().sort((x,y)=>y.gd-x.gd||x.team.localeCompare(y.team)),provisional:true,level:1};
}

E.standings=function(T,scores,group){
  const all=Object.values(E.stats(T,scores,group));
  const games=E.groupGames(T,group);
  const complete=games.every(g=>E.played(scores,g));
  const anyPlayed=games.some(g=>E.played(scores,g));
  all.sort((x,y)=>y.pts-x.pts||x.team.localeCompare(y.team));
  const arr=[], notes=[]; let provisional=false, i=0;
  while(i<all.length){
    let j=i; while(j<all.length&&all[j].pts===all[i].pts)j++;
    const cluster=all.slice(i,j);
    if(cluster.length>1 && anyPlayed){
      const res=(T.tiebreak==="wa"?orderWA:orderSimple)(T,scores,group,cluster);
      arr.push(...res.arr);
      if(res.provisional){ provisional=true; notes.push(cluster.map(x=>x.team).join(" / ")+" cannot be separated from the entered scores."); }
      else if(res.level>0 && T.tiebreak==="wa"){ notes.push(cluster.map(x=>x.team).join(" / ")+" separated on "+WA_LEVELS[res.level]+" — confirm with the tournament desk."); }
    } else arr.push(...cluster);
    i=j;
  }
  if(!anyPlayed) provisional=false;
  return {arr,provisional,complete,confirmed:complete&&!provisional,anyPlayed,notes};
};

/* ---------- slot resolution (who plays in a knockout game) ---------- */
// slot: {team} | {group,rank} | {winner:n} | {loser:n}
// returns {team: string|null, confirmed: bool, label: string, detail: string|null, current: string|null}
E.resolveSlot=function(T,scores,slot){
  if(slot.team) return {team:slot.team,confirmed:true,label:slot.team,detail:null,current:slot.team};
  if(slot.group){
    const st=E.standings(T,scores,slot.group);
    const label=E.ordinal(slot.rank)+" Group "+slot.group;
    const cur=st.anyPlayed?(st.arr[slot.rank-1]?st.arr[slot.rank-1].team:null):null;
    if(st.confirmed) return {team:cur,confirmed:true,label,detail:null,current:cur};
    return {team:cur,confirmed:false,label,detail:null,current:cur};
  }
  const want=slot.winner?"winner":"loser", n=slot.winner||slot.loser;
  const g=E.gameByNum(T,n);
  if(!g) return {team:null,confirmed:false,label:"?",detail:"unknown game G#"+n,current:null};
  const p=E.participants(T,scores,g);
  const label=(want==="winner"?"Winner":"Loser")+" of G#"+n;
  const detail=(g.label?g.label+": ":"")+E.slotText(p.a)+" vs "+E.slotText(p.b);
  const r=E.result(T,scores,g);
  if(r&&r.winner){
    const side=want==="winner"?r.winner:(r.winner==="a"?"b":"a");
    const res=p[side];
    if(res.team) return {team:res.team,confirmed:res.confirmed,label,detail,current:res.team};
  }
  return {team:null,confirmed:false,label,detail,current:null};
};
E.participants=(T,scores,g)=>({a:E.resolveSlot(T,scores,g.a),b:E.resolveSlot(T,scores,g.b)});
// Short text for a resolved slot: the team if known, else the placeholder.
E.slotText=function(res){ return res.team?res.team:res.label; };

/* ---------- a tracked team's road through the tournament ---------- */
E.teamRank=function(T,scores,team){
  const group=E.groupOf(T,team);
  const st=E.standings(T,scores,group);
  const rank=st.arr.findIndex(x=>x.team===team)+1;
  return {group,rank,confirmed:st.confirmed,complete:st.complete,provisional:st.provisional,anyPlayed:st.anyPlayed,notes:st.notes};
};
E.entryGame=(T,group,rank)=>T.games.find(g=>g.stage!=="group"&&((g.a.group===group&&g.a.rank===rank)||(g.b.group===group&&g.b.rank===rank)))||null;
E.nextGame=function(T,n,outcome){
  const k=outcome==="win"?"winner":"loser";
  return T.games.find(g=>g.stage!=="group"&&(g.a[k]===n||g.b[k]===n))||null;
};
E.placing=(g,outcome)=>g&&g.places?(outcome==="win"?g.places[0]:g.places[1]):null;

// Walk the bracket from the team's (projected or assumed) group position.
// opts.rank: force a group position; opts.assume: {gameId:"win"|"loss"} local outcomes instead of shared scores.
// Returns {rank, usedRank, steps:[{game,side,me,opp,result,outcome,how,next:{win,loss}}], finalPlacing}
E.walk=function(T,scores,team,opts){
  opts=opts||{};
  const rk=E.teamRank(T,scores,team);
  const rank=opts.rank?Number(opts.rank):rk.rank;
  const steps=[]; let finalPlacing=null;
  let g=E.entryGame(T,rk.group,rank), prev=null, guard=0;
  while(g&&guard++<16){
    const p=E.participants(T,scores,g);
    let side;
    if(!prev) side=(g.a.group===rk.group&&g.a.rank===rank)?"a":"b";
    else { const k=prev.outcome==="win"?"winner":"loser"; side=(g.a[k]===prev.game.n)?"a":"b"; }
    const r=E.result(T,scores,g);
    let outcome=null, how=null;
    if(opts.assume){ outcome=opts.assume[g.id]||null; how=outcome?"assumed":null; }
    else if(r&&r.winner){ outcome=r.winner===side?"win":"loss"; how="score"; }
    else if(r&&r.needsPens){ how="pens-needed"; }
    const nextWin=E.nextGame(T,g.n,"win"), nextLoss=E.nextGame(T,g.n,"loss");
    const step={game:g,side,me:p[side],opp:p[side==="a"?"b":"a"],result:r,outcome,how,
      next:{win:nextWin?{game:nextWin}:{placing:E.placing(g,"win")},loss:nextLoss?{game:nextLoss}:{placing:E.placing(g,"loss")}}};
    steps.push(step);
    if(!outcome) break;
    const nx=step.next[outcome];
    if(nx.game){ prev=step; g=nx.game; }
    else { finalPlacing=nx.placing; g=null; }
  }
  return {rank:rk,usedRank:rank,steps,finalPlacing};
};

// What is the next thing the tracked team does? {kind:"group"|"knockout"|"done", game, step, placing}
E.nextForTeam=function(T,scores,team){
  const pending=E.sortByTime(E.teamGroupGames(T,team)).find(g=>!E.played(scores,g));
  if(pending) return {kind:"group",game:pending};
  const w=E.walk(T,scores,team);
  const step=w.steps.find(s=>!s.outcome);
  if(step) return {kind:"knockout",game:step.game,step,walk:w};
  return {kind:"done",placing:w.finalPlacing,walk:w};
};

/* ---------- bulk result import ---------- */
E.normalise=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
E.aliasMap=function(T){
  const m={};
  E.allTeams(T).forEach(t=>m[E.normalise(t)]=t);
  Object.entries(T.teams||{}).forEach(([t,info])=>{ if(info&&info.full) m[E.normalise(info.full)]=t; });
  Object.entries(T.aliases||{}).forEach(([k,v])=>m[E.normalise(k)]=v);
  return m;
};
// Games where these two teams meet (fixed group games, or knockout games whose slots currently resolve to them).
E.findFixture=function(T,scores,t1,t2){
  const cands=T.games.filter(g=>{
    const p=E.participants(T,scores,g);
    const x=p.a.team||p.a.current, y=p.b.team||p.b.current;
    return (x===t1&&y===t2)||(x===t2&&y===t1);
  });
  if(!cands.length) return null;
  return cands.find(g=>!E.played(scores,g))||cands[cands.length-1];
};
E.parseBulk=function(T,scores,text){
  const aliases=E.aliasMap(T);
  const keys=Object.keys(aliases).sort((a,b)=>b.length-a.length);
  const out=[],errors=[];
  String(text||"").split(/\n+/).map(x=>x.trim()).filter(Boolean).forEach((line,idx)=>{
    const norm=E.normalise(line);
    let la=null,ra=null,lt=null,rt=null;
    for(const a of keys){ if(norm.startsWith(a+" ")){la=a;lt=aliases[a];break;} }
    for(const a of keys){ if(norm.endsWith(" "+a)){ra=a;rt=aliases[a];break;} }
    if(!lt||!rt||lt===rt){ errors.push("Line "+(idx+1)+": couldn't identify both teams — "+line); return; }
    const middle=norm.slice(la.length, norm.length-ra.length).trim();
    const nums=middle.match(/\d+/g);
    if(!nums||nums.length<2){ errors.push("Line "+(idx+1)+": couldn't find two scores — "+line); return; }
    const sa=Number(nums[0]), sb=Number(nums[1]);
    const g=E.findFixture(T,scores,lt,rt);
    if(!g){ errors.push("Line "+(idx+1)+": no fixture (yet) between "+lt+" and "+rt); return; }
    const p=E.participants(T,scores,g);
    const leftIsA=(p.a.team||p.a.current)===lt;
    out.push({game:g,scoreA:leftIsA?sa:sb,scoreB:leftIsA?sb:sa,source:line});
  });
  return {out,errors};
};

return E;
});
