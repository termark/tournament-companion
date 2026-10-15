#!/usr/bin/env node
/* tools/validate.js — checks every tournament in tournaments/registry.js
 *
 *   node tools/validate.js            # all tournaments
 *   node tools/validate.js <id>       # one tournament
 *
 * Structural checks (ids, round-robin completeness, every group position enters the
 * bracket exactly once, every winner/loser is consumed exactly once, placings cover
 * 1..N) plus random full-tournament simulations through the real engine, plus
 * hand-transcribed expectations for the tracked teams' routes.
 */
const fs=require("fs"), path=require("path"), vm=require("vm");
const root=path.resolve(__dirname,"..");
const E=require(path.join(root,"js","engine.js"));
const B=require(path.join(root,"js","bracket.js"));

function loadWindowScript(file){ const window={}; vm.runInNewContext(fs.readFileSync(path.join(root,file),"utf8"),{window}); return window; }
const registry=loadWindowScript("tournaments/registry.js").TOURNAMENT_REGISTRY;
// every data file is validated, listed in the registry or not (unlisted ones are regression cases)
const dataFiles=fs.readdirSync(path.join(root,"tournaments")).filter(f=>f.endsWith(".js")&&f!=="registry.js").map(f=>"tournaments/"+f);

let failures=0, checks=0;
function ok(cond,msg){ checks++; if(!cond){ failures++; console.log("  FAIL: "+msg); } }
function eq(a,b,msg){ ok(a===b,msg+" (got "+JSON.stringify(a)+", expected "+JSON.stringify(b)+")"); }

/* ---------- hand-transcribed expectations (second, independent reading of the PDFs) ---------- */
// Saints Invitational 2026 Junior Girls — Herschel (Group D). Keys are game numbers; "P<n>" = final placing.
const SAINTS_HERSCHEL={
  team:"Herschel",
  entry:{1:36,2:28,3:26,4:31},
  firstOpp:{1:"Winner of G#27",2:"3rd Group C",3:"2nd Group C",4:"Loser of G#27"},
  next:{
    36:{win:44,loss:42},44:{win:52,loss:51},42:{win:50,loss:49},
    52:{win:"P1",loss:"P2"},51:{win:"P3",loss:"P4"},50:{win:"P5",loss:"P6"},49:{win:"P7",loss:"P8"},
    28:{win:34,loss:32},34:{win:43,loss:41},43:{win:52,loss:51},41:{win:50,loss:49},
    32:{win:40,loss:38},40:{win:48,loss:47},38:{win:46,loss:45},
    48:{win:"P9",loss:"P10"},47:{win:"P11",loss:"P12"},46:{win:"P13",loss:"P14"},45:{win:"P15",loss:"P16"},
    26:{win:33,loss:30},33:{win:43,loss:41},30:{win:39,loss:37},39:{win:48,loss:47},37:{win:46,loss:45},
    31:{win:40,loss:38}
  },
  when:{
    36:["2026-10-17","12:45","Olympic North"],44:["2026-10-17","17:15","Main Polo Pool"],42:["2026-10-17","16:30","Olympic North"],
    52:["2026-10-18","12:15","Main Polo Pool"],51:["2026-10-18","10:15","Main Polo Pool"],50:["2026-10-18","10:15","Olympic North"],
    49:["2026-10-18","10:15","Olympic South"],28:["2026-10-17","09:00","Olympic North"],34:["2026-10-17","12:45","Olympic South"],
    32:["2026-10-17","11:15","Olympic South"],43:["2026-10-17","16:30","Main Polo Pool"],41:["2026-10-17","16:30","Olympic South"],
    40:["2026-10-17","15:00","Olympic North"],38:["2026-10-17","14:15","Olympic South"],48:["2026-10-18","08:45","Main Polo Pool"],
    47:["2026-10-18","08:45","Olympic North"],46:["2026-10-18","08:45","Olympic South"],45:["2026-10-18","07:15","Main Polo Pool"],
    26:["2026-10-17","08:15","Olympic North"],33:["2026-10-17","12:00","Main Polo Pool"],30:["2026-10-17","10:30","Olympic North"],
    39:["2026-10-17","15:00","Olympic South"],37:["2026-10-17","13:30","Main Polo Pool"],31:["2026-10-17","10:30","Olympic South"]
  },
  groupGames:[["2026-10-16","09:30","Olympic North","St Mary's Waverley"],["2026-10-16","13:30","Main Polo Pool","St Dominic's"],["2026-10-16","16:50","Main Polo Pool","Our Lady of Fatima"]]
};
// Mackenzie Cup 2026 — the `routes` table from the original single-page app (v0.8.5), per Herschel team and group rank.
const MACKENZIE_ROUTES={
  "Herschel A":{
    1:{qf:["Sat 12 Sep","16:30","Cup QF3","C",2],qfWin:["Sun 13 Sep","08:30","Cup SF2"],qfLoss:["Sun 13 Sep","09:30","Plate SF2"],winWin:["Sun 13 Sep","13:20","Cup Final"],winLoss:["Sun 13 Sep","10:00","Cup 3rd/4th"],lossWin:["Sun 13 Sep","13:00","Plate Final"],lossLoss:["Sun 13 Sep","11:30","Plate 3rd/4th"]},
    2:{qf:["Sat 12 Sep","15:30","Cup QF1","C",1],qfWin:["Sun 13 Sep","08:00","Cup SF1"],qfLoss:["Sun 13 Sep","09:00","Plate SF1"],winWin:["Sun 13 Sep","13:20","Cup Final"],winLoss:["Sun 13 Sep","10:00","Cup 3rd/4th"],lossWin:["Sun 13 Sep","13:00","Plate Final"],lossLoss:["Sun 13 Sep","11:30","Plate 3rd/4th"]},
    3:{qf:["Sat 12 Sep","14:30","Bowl QF3","C",4],qfWin:["Sat 12 Sep","18:00","Bowl SF2"],qfLoss:["Sat 12 Sep","19:00","Shield SF2"],winWin:["Sun 13 Sep","12:30","Bowl Final"],winLoss:["Sun 13 Sep","11:00","Bowl 3rd/4th"],lossWin:["Sun 13 Sep","12:00","Shield Final"],lossLoss:["Sun 13 Sep","10:30","Shield 3rd/4th"]},
    4:{qf:["Sat 12 Sep","13:30","Bowl QF1","C",3],qfWin:["Sat 12 Sep","17:30","Bowl SF1"],qfLoss:["Sat 12 Sep","18:30","Shield SF1"],winWin:["Sun 13 Sep","12:30","Bowl Final"],winLoss:["Sun 13 Sep","11:00","Bowl 3rd/4th"],lossWin:["Sun 13 Sep","12:00","Shield Final"],lossLoss:["Sun 13 Sep","10:30","Shield 3rd/4th"]}
  },
  "Herschel B":{
    1:{qf:["Sat 12 Sep","16:00","Cup QF2","B",2],qfWin:["Sun 13 Sep","08:00","Cup SF1"],qfLoss:["Sun 13 Sep","09:00","Plate SF1"],winWin:["Sun 13 Sep","13:20","Cup Final"],winLoss:["Sun 13 Sep","10:00","Cup 3rd/4th"],lossWin:["Sun 13 Sep","13:00","Plate Final"],lossLoss:["Sun 13 Sep","11:30","Plate 3rd/4th"]},
    2:{qf:["Sat 12 Sep","17:00","Cup QF4","B",1],qfWin:["Sun 13 Sep","08:30","Cup SF2"],qfLoss:["Sun 13 Sep","09:30","Plate SF2"],winWin:["Sun 13 Sep","13:20","Cup Final"],winLoss:["Sun 13 Sep","10:00","Cup 3rd/4th"],lossWin:["Sun 13 Sep","13:00","Plate Final"],lossLoss:["Sun 13 Sep","11:30","Plate 3rd/4th"]},
    3:{qf:["Sat 12 Sep","14:00","Bowl QF2","B",4],qfWin:["Sat 12 Sep","17:30","Bowl SF1"],qfLoss:["Sat 12 Sep","18:30","Shield SF1"],winWin:["Sun 13 Sep","12:30","Bowl Final"],winLoss:["Sun 13 Sep","11:00","Bowl 3rd/4th"],lossWin:["Sun 13 Sep","12:00","Shield Final"],lossLoss:["Sun 13 Sep","10:30","Shield 3rd/4th"]},
    4:{qf:["Sat 12 Sep","15:00","Bowl QF4","B",3],qfWin:["Sat 12 Sep","18:00","Bowl SF2"],qfLoss:["Sat 12 Sep","19:00","Shield SF2"],winWin:["Sun 13 Sep","12:30","Bowl Final"],winLoss:["Sun 13 Sep","11:00","Bowl 3rd/4th"],lossWin:["Sun 13 Sep","12:00","Shield Final"],lossLoss:["Sun 13 Sep","10:30","Shield 3rd/4th"]}
  }
};

/* ---------- structural checks ---------- */
function structural(T){
  const teams=E.allTeams(T), nTeams=teams.length;
  ok(new Set(teams).size===nTeams,"teams appear in exactly one group");
  ok(new Set(T.games.map(g=>g.id)).size===T.games.length,"game ids are unique");
  const nums=T.games.map(g=>g.n);
  ok(new Set(nums).size===nums.length,"game numbers are unique");
  ok(Math.min(...nums)===1&&Math.max(...nums)===T.games.length,"game numbers run 1.."+T.games.length);
  T.games.forEach(g=>{ ok(/^\d{4}-\d{2}-\d{2}$/.test(g.date)&&/^\d{2}:\d{2}$/.test(g.time),"G#"+g.n+" has date/time"); ok(!!T.days[g.date],"G#"+g.n+" date "+g.date+" has a day label"); });
  (T.tracked||[]).forEach(t=>ok(teams.includes(t.team),"tracked team exists: "+t.team));

  // Round robin
  Object.keys(T.groups).forEach(grp=>{
    const gs=E.groupGames(T,grp), members=T.groups[grp];
    eq(gs.length,members.length*(members.length-1)/2,"Group "+grp+" game count");
    members.forEach(t=>eq(gs.filter(g=>g.a.team===t||g.b.team===t).length,members.length-1,"Group "+grp+": "+t+" games"));
    gs.forEach(g=>ok(members.includes(g.a.team)&&members.includes(g.b.team)&&g.a.team!==g.b.team,"G#"+g.n+" teams belong to Group "+grp));
    const pairs=new Set(gs.map(g=>[g.a.team,g.b.team].sort().join("|")));
    eq(pairs.size,gs.length,"Group "+grp+": each pair meets once");
  });

  // Knockout slots
  const kos=E.knockoutGames(T);
  const rankUse={}, winUse={}, loseUse={};
  kos.forEach(g=>{
    [g.a,g.b].forEach(s=>{
      if(s.group){ ok(T.groups[s.group]&&s.rank>=1&&s.rank<=T.groups[s.group].length,"G#"+g.n+" slot group/rank valid"); rankUse[s.group+s.rank]=(rankUse[s.group+s.rank]||0)+1; }
      else if(s.winner||s.loser){
        const ref=E.gameByNum(T,s.winner||s.loser);
        ok(!!ref,"G#"+g.n+" references existing game");
        if(ref){
          ok(ref.stage!=="group","G#"+g.n+" references a knockout game");
          ok(ref.n<g.n,"G#"+g.n+" references an earlier game number");
          ok((ref.date+ref.time)<(g.date+g.time),"G#"+g.n+" is played after G#"+ref.n);
          if(s.winner)winUse[ref.n]=(winUse[ref.n]||0)+1; else loseUse[ref.n]=(loseUse[ref.n]||0)+1;
        }
      } else ok(false,"G#"+g.n+" has an unknown slot shape "+JSON.stringify(s));
    });
  });
  Object.keys(T.groups).forEach(grp=>T.groups[grp].forEach((_,i)=>eq(rankUse[grp+(i+1)]||0,1,E.ordinal(i+1)+" Group "+grp+" enters the bracket exactly once")));
  kos.forEach(g=>{
    if(g.places){ eq(winUse[g.n]||0,0,"placing game G#"+g.n+" winner not reused"); eq(loseUse[g.n]||0,0,"placing game G#"+g.n+" loser not reused"); }
    else { eq(winUse[g.n]||0,1,"G#"+g.n+" winner consumed exactly once"); eq(loseUse[g.n]||0,1,"G#"+g.n+" loser consumed exactly once"); }
  });
  const places=kos.filter(g=>g.places).flatMap(g=>g.places).sort((a,b)=>a-b);
  eq(places.join(","),Array.from({length:nTeams},(_,i)=>i+1).join(","),"placings cover 1.."+nTeams+" exactly once");
}

/* ---------- simulation ---------- */
function rng(seed){ let s=seed>>>0; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
function simulate(T,seed,withPens){
  const r=rng(seed), scores={};
  T.games.filter(g=>g.stage==="group").forEach(g=>{ scores[g.id]={a:Math.floor(r()*8),b:Math.floor(r()*8)}; });
  E.sortByTime(E.knockoutGames(T)).forEach(g=>{
    let a=Math.floor(r()*8), b=Math.floor(r()*8);
    if(a===b){ if(withPens) scores[g.id+"_pen"]={a:3,b:r()<.5?2:4}; else { if(r()<.5)a++; else b++; } }
    scores[g.id]={a,b};
  });
  return scores;
}
function simulation(T){
  const nTeams=E.allTeams(T).length;
  let provisionalSeeds=0;
  for(let seed=1;seed<=300;seed++){
    const scores=simulate(T,seed,seed%3===0);
    const placing={};
    E.knockoutGames(T).filter(g=>g.places).forEach(g=>{
      const p=E.participants(T,scores,g), res=E.result(T,scores,g);
      ok(res&&res.winner,"seed "+seed+": G#"+g.n+" decisive");
      if(!res||!res.winner)return;
      const w=res.winner==="a"?p.a:p.b, l=res.winner==="a"?p.b:p.a;
      ok(w.team&&l.team,"seed "+seed+": G#"+g.n+" participants resolve");
      placing[g.places[0]]=w.team; placing[g.places[1]]=l.team;
    });
    const placed=Object.values(placing);
    eq(placed.length,nTeams,"seed "+seed+": every placing filled");
    eq(new Set(placed).size,nTeams,"seed "+seed+": placings are distinct teams");
    if(Object.keys(T.groups).some(g=>E.standings(T,scores,g).provisional)) provisionalSeeds++;
    (T.tracked||[]).forEach(t=>{
      const w=E.walk(T,scores,t.team);
      ok(w.finalPlacing!=null,"seed "+seed+": "+t.team+" walk reaches a placing");
      eq(placing[w.finalPlacing],t.team,"seed "+seed+": "+t.team+" walk placing matches bracket placing");
      eq(E.nextForTeam(T,scores,t.team).kind,"done","seed "+seed+": "+t.team+" is done");
      // every step's opponent must be a real team other than us
      w.steps.forEach(s=>ok(s.opp.team&&s.opp.team!==t.team&&s.me.team===t.team,"seed "+seed+": step G#"+s.game.n+" sides resolve"));
    });
  }
  console.log("  simulations: 300 seeds, "+provisionalSeeds+" with an unresolvable group tie (standings flagged provisional)");

  // Partial state: only group games played → the walk shows the first knockout game with both branches.
  const scores={};
  T.games.filter(g=>g.stage==="group").forEach((g,i)=>{ scores[g.id]={a:(i*7)%5,b:(i*3)%4}; });
  (T.tracked||[]).forEach(t=>{
    const nx=E.nextForTeam(T,scores,t.team);
    eq(nx.kind,"knockout",t.team+": next is a knockout game after the group stage");
    const w=E.walk(T,scores,t.team);
    eq(w.steps.length,1,t.team+": one pending step");
    ok(w.steps[0].next.win&&w.steps[0].next.loss,t.team+": both branches present");
    eq(w.steps[0].outcome,null,t.team+": pending step has no outcome");
  });
  // Nothing played → next is the first group game, slots show placeholders.
  const nx=E.nextForTeam(T,{},(T.tracked||[])[0].team);
  eq(nx.kind,"group","nothing played: next is a group game");
  const first=E.knockoutGames(T)[0], p=E.participants(T,{},first);
  ok(p.a.team===null&&p.b.team===null&&p.a.label&&p.b.label,"nothing played: knockout slots are placeholders");
}

/* ---------- bulk parser ---------- */
function bulk(T){
  const t=T.tracked[0].team, g=E.teamGroupGames(T,t)[0];
  const other=g.a.team===t?g.b.team:g.a.team;
  const p=E.parseBulk(T,{},t+" 5-3 "+other+"\n"+other.toUpperCase()+" 2 2 "+t+"\nNobody 1-0 "+t);
  eq(p.out.length,2,"bulk: two lines parsed");
  eq(p.errors.length,1,"bulk: one unknown team flagged");
  eq(p.out[0].game.id,g.id,"bulk: matched the right fixture");
  const sa=g.a.team===t?5:3, sb=g.a.team===t?3:5;
  ok(p.out[0].scoreA===sa&&p.out[0].scoreB===sb,"bulk: scores oriented to fixture sides");
  ok(p.out[1].scoreA===2&&p.out[1].scoreB===2,"bulk: reversed order handled");
}

/* ---------- a results page copied from MyComLink (verbatim shape seen 15 Oct 2026) ---------- */
function mycomlink(T){
  if(T.id!=="saints-invitational-2026-junior-girls") return;
  const page=[
    "Team Sport Results","Criteria: Saints Water Polo Invitational Junior Girls","Entry 1 to 6 of the 6 matching your selection criteria","Page 1 of 1","",
    "Fri, 16-Oct-2026 :: Water Polo","",
    "09:30\tGroup D :: Saints Olympic North\t\t\tdetails","Herschel 13A\t9\t-\t15\tSt Mary's Waverley 13A","",
    "09:30\tGroup B :: Saints Olympic South\t\t\tdetails","Umhlali Ballito 13A\t4\t-\t4\tRoedean 13A","",
    "10:10\tGroup A :: Saints Olympic South\t\t\tdetails","St. Mary's DSG 13A\t6\t-\t2\tChisipite 13A","",
    "08:50\tGroup A :: Saints Polo Pool\t\t\tdetails","Stingray Academy 13A\tWin\t-\tForfeit\tDurban Girls' 13A","",
    "10:10\tGroup C :: Saints Polo Pool\t\t\tdetails","Chelsea 13A\t3\t-\t7\tReddam Bedfordview 13A","",
    "09:30\tGroup C :: Saints Polo Pool\t\t\tdetails","Wynberg Girls' 13A\t5\t-\t1\tFalcon College 13A","",
    "Home About Results Fixtures News Events Organisations Get Involved Contact Us",
    "© 2012-2026, MyComLink : Users of the MyComLink website are assumed to have read and agreed to our Terms and Conditions"
  ].join("\n");
  const p=E.parseBulk(T,{},page);
  eq(p.errors.length,0,"mycomlink: no unrecognised lines ("+p.errors.join(" | ")+")");
  eq(p.out.length,6,"mycomlink: six results parsed");
  const by={}; p.out.forEach(x=>by[x.game.n]=x);
  ok(by[4]&&by[4].scoreA===9&&by[4].scoreB===15,"mycomlink: G4 Herschel 9-15 St Mary's Waverley");
  ok(by[2]&&by[2].scoreA===4&&by[2].scoreB===4,"mycomlink: G2 Umhlali 4-4 Roedean");
  ok(by[5]&&by[5].scoreA===6&&by[5].scoreB===2,"mycomlink: G5 DSG Kloof 6-2 Chisipite");
  ok(by[1]&&by[1].scoreA===1&&by[1].scoreB===0,"mycomlink: G1 forfeit → 1-0 to Stingray");
  ok(by[7]&&by[7].scoreA===3&&by[7].scoreB===7,"mycomlink: G7 Chelsea 3-7 Reddam");
  ok(by[3]&&by[3].scoreA===5&&by[3].scoreB===1,"mycomlink: G3 Wynberg 5-1 Falcon");
  ok(p.out.every(x=>x.feedRow),"mycomlink: every copied row is tagged as a feed row");
  const hand=E.parseBulk(T,{},"Herschel 5-3 St Dominic's\nKingsmead 2 2 Roedean");
  eq(hand.out.length,2,"hand-typed lines still parse for editors");
  ok(hand.out.every(x=>!x.feedRow),"hand-typed lines are not tagged as feed rows");
  // every team name mycomlink uses maps to one of ours
  const names=["Stingray Academy","Durban Girls'","Umhlali Ballito","Roedean","Wynberg Girls'","Falcon College","Herschel","St Mary's Waverley","St. Mary's DSG","Chisipite","Kingsmead","Hellenic Academy","Chelsea","Reddam Bedfordview","Our Lady of Fatima","St Dominic's"];
  const aliases=E.aliasMap(T);
  names.forEach(n=>ok(!!aliases[E.normalise(n)],"mycomlink name resolves: "+n));
  eq(new Set(names.map(n=>aliases[E.normalise(n)])).size,16,"mycomlink names map to 16 distinct teams");
  ok(T.external&&T.external.game(4)==="https://www.mycomlink.co.za/fixture.php?i=83381","mycomlink: G4 → fixture 83381");
  ok(T.external.game(52)==="https://www.mycomlink.co.za/fixture.php?i=83429","mycomlink: G52 → fixture 83429");
}

/* ---------- tie-break behaviour ---------- */
function tiebreak(T){
  const grp=Object.keys(T.groups)[0], [t1,t2,t3,t4]=T.groups[grp];
  const gs=E.groupGames(T,grp);
  const find=(x,y)=>gs.find(g=>(g.a.team===x&&g.b.team===y)||(g.a.team===y&&g.b.team===x));
  const set=(scores,x,y,sx,sy)=>{ const g=find(x,y); scores[g.id]=g.a.team===x?{a:sx,b:sy}:{a:sy,b:sx}; };
  // t1 and t2 both beat t3 and t4; t1 beat t2 head-to-head → t1 first, confirmed.
  const s={};
  set(s,t1,t2,3,2); set(s,t1,t3,5,0); set(s,t1,t4,4,0); set(s,t2,t3,2,0); set(s,t2,t4,1,0); set(s,t3,t4,1,0);
  const st=E.standings(T,s,grp);
  eq(st.arr[0].team,t1,"tie-break: head-to-head winner first");
  eq(st.arr[1].team,t2,"tie-break: head-to-head loser second");
  ok(st.complete&&st.confirmed,"tie-break: two-way head-to-head is confirmed");
  // drawn head-to-head between the top two
  set(s,t1,t2,2,2);
  const st2=E.standings(T,s,grp);
  if(T.tiebreak==="wa"){ eq(st2.arr[0].team,t1,"wa: overall goal difference settles a drawn head-to-head"); ok(!st2.provisional,"wa: resolved, not provisional"); ok(st2.notes.length>0,"wa: tie-break note present"); }
  else { ok(st2.provisional,"simple: drawn head-to-head is provisional"); }
}

/* ---------- expectations ---------- */
function expectSaints(T){
  const X=SAINTS_HERSCHEL, t=X.team;
  const gg=E.sortByTime(E.teamGroupGames(T,t));
  eq(gg.length,3,"Herschel plays 3 group games");
  X.groupGames.forEach((exp,i)=>{
    const g=gg[i], opp=g.a.team===t?g.b.team:g.a.team;
    eq([g.date,g.time,g.pool,opp].join("|"),exp.join("|"),"Herschel group game "+(i+1));
  });
  for(let rank=1;rank<=4;rank++){
    const entry=E.entryGame(T,"D",rank);
    eq(entry&&entry.n,X.entry[rank],"Herschel rank "+rank+" entry game");
    const w0=E.walk(T,{},t,{rank,assume:{}});
    eq(w0.steps[0].opp.label,X.firstOpp[rank],"Herschel rank "+rank+" first opponent placeholder");
    // enumerate every win/loss sequence from this entry and compare each hop with the expectation table
    const explore=(assume,gameNum,depth)=>{
      const exp=X.next[gameNum];
      ok(!!exp,"expectation exists for G#"+gameNum);
      if(!exp||depth>6)return;
      ["win","loss"].forEach(outcome=>{
        const a=Object.assign({},assume,{[E.gameByNum(T,gameNum).id]:outcome});
        const w=E.walk(T,{},t,{rank,assume:a});
        const last=w.steps[w.steps.length-1];
        const expected=exp[outcome];
        if(typeof expected==="string"){
          eq(w.finalPlacing,Number(expected.slice(1)),"rank "+rank+": G#"+gameNum+" "+outcome+" → placing");
        } else {
          eq(last.game.n,expected,"rank "+rank+": G#"+gameNum+" "+outcome+" → next game");
          const when=X.when[expected];
          eq([last.game.date,last.game.time,last.game.pool].join("|"),when.join("|"),"G#"+expected+" date/time/pool");
          explore(a,expected,depth+1);
        }
      });
    };
    const when=X.when[X.entry[rank]];
    eq([entry.date,entry.time,entry.pool].join("|"),when.join("|"),"G#"+entry.n+" date/time/pool");
    explore({},X.entry[rank],0);
  }
}
function expectMackenzie(T){
  Object.entries(MACKENZIE_ROUTES).forEach(([team,byRank])=>{
    const grp=E.groupOf(T,team);
    Object.entries(byRank).forEach(([rank,R])=>{
      rank=Number(rank);
      const w=E.walk(T,{},team,{rank,assume:{}});
      const qf=w.steps[0];
      eq([E.dayLabel(T,qf.game.date),qf.game.time,qf.game.label].join("|"),R.qf.slice(0,3).join("|"),team+" rank "+rank+" QF");
      eq(qf.opp.label,E.ordinal(R.qf[4])+" Group "+R.qf[3],team+" rank "+rank+" QF opponent");
      const chk=(assume,key)=>{
        const ww=E.walk(T,{},team,{rank,assume});
        const last=ww.steps[ww.steps.length-1];
        eq([E.dayLabel(T,last.game.date),last.game.time,last.game.label].join("|"),R[key].join("|"),team+" rank "+rank+" "+key);
        return last.game.id;
      };
      const qfId=qf.game.id;
      const winId=chk({[qfId]:"win"},"qfWin"), lossId=chk({[qfId]:"loss"},"qfLoss");
      chk({[qfId]:"win",[winId]:"win"},"winWin"); chk({[qfId]:"win",[winId]:"loss"},"winLoss");
      chk({[qfId]:"loss",[lossId]:"win"},"lossWin"); chk({[qfId]:"loss",[lossId]:"loss"},"lossLoss");
    });
  });
  // original fixture ids preserved
  ok(E.gameById(T,"A_2026-09-11_1600")&&E.gameById(T,"D_2026-09-12_0800"),"Mackenzie: original Supabase fixture ids preserved");
}

/* ---------- brackets ---------- */
function brackets(T){
  const kos=E.knockoutGames(T);
  const champ=B.championship(T);
  ok(!!champ,"a final is defined");
  [{},simulate(T,7,false)].forEach((scores,i)=>{
    const all=B.all(T,scores,{team:T.tracked[0].team});
    const svg=all.map(x=>x.svg).join("");
    ok(all.length>0&&all[0].final,"brackets render ("+(i?"full":"empty")+")");
    kos.forEach(g=>ok(svg.includes('data-game="'+g.id+'"'),"G#"+g.n+" appears in a bracket ("+(i?"full":"empty")+")"));
    const ids=svg.match(/data-game="[^"]+"/g)||[];
    eq(ids.length,kos.length,"every knockout game drawn exactly once ("+(i?"full":"empty")+")");
    all.forEach(x=>{ const m=x.svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/); ok(m&&Number(m[1])>0&&Number(m[2])>0,x.title+": positive viewBox"); });
  });
  // a played final shows the winner on the row of the team that won
  const scores=simulate(T,11,true);
  const svg=B.championshipSVG(T,scores,{});
  const r=E.result(T,scores,champ), p=E.participants(T,scores,champ);
  const winner=r.winner==="a"?p.a.team:p.b.team;
  ok(new RegExp('class="bk-row[^"]*won[^"]*"[^>]*>'+winner.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").slice(0,21)).test(svg),"final: winner row marked won");
}

/* ---------- run ---------- */
const only=process.argv[2];
dataFiles.forEach(file=>{
  const T=loadWindowScript(file).TOURNAMENT;
  if(only&&T.id!==only)return;
  const listed=registry.some(r=>r.id===T.id);
  console.log("== "+T.id+" ("+T.games.length+" games, "+E.allTeams(T).length+" teams"+(listed?"":", not in registry")+")");
  const before=failures;
  structural(T); simulation(T); bulk(T); tiebreak(T); brackets(T); mycomlink(T);
  if(T.id==="saints-invitational-2026-junior-girls") expectSaints(T);
  if(T.id==="mackenzie-cup-2026") expectMackenzie(T);
  console.log("  "+(failures===before?"OK":"FAILED")+" — "+checks+" checks so far");
});
console.log(failures?("\n"+failures+" failure(s)"):"\nall "+checks+" checks passed");
process.exit(failures?1:0);
