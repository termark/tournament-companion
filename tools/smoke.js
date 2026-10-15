#!/usr/bin/env node
/* tools/smoke.js — loads index.html in jsdom with a stubbed Supabase client and drives every view.
 *   npm i jsdom   (anywhere on NODE_PATH)   then:   node tools/smoke.js [tournament-id]
 */
const fs=require("fs"), path=require("path");
const {JSDOM,VirtualConsole,ResourceLoader}=require("jsdom");
const root=path.resolve(__dirname,"..");
const only=process.argv[2]||"";

// Serve the repo's own files from disk (query strings stripped), nothing from the network.
class LocalLoader extends ResourceLoader{
  fetch(url){
    const u=new URL(url);
    if(u.protocol!=="file:") return Promise.resolve(Buffer.from(""));
    return Promise.resolve(fs.readFileSync(decodeURIComponent(u.pathname)));
  }
}

let failures=0, checks=0;
function ok(c,m){checks++;if(!c){failures++;console.log("  FAIL: "+m);}}

// In-memory stand-in for the Supabase table so editor flows run end to end.
function fakeSupabase(){
  const table={};
  const api={
    auth:{
      _user:null,
      async getSession(){return {data:{session:api.auth._user?{user:api.auth._user}:null}}},
      async signInWithPassword({email}){api.auth._user={email};return {data:{user:api.auth._user},error:null}},
      async signOut(){api.auth._user=null}
    },
    from(){return {
      select:async()=>({data:Object.values(table),error:null}),
      upsert:async(rows)=>{ (Array.isArray(rows)?rows:[rows]).forEach(r=>table[r.fixture_id]=r); return {error:null}; }
    }},
    _table:table
  };
  return {createClient:()=>api,_api:api};
}

async function run(tid){
  const html=fs.readFileSync(path.join(root,"index.html"),"utf8").replace(/<script src="https:[^"]+"><\/script>/,"");
  const vc=new VirtualConsole(); const errors=[]; vc.on("jsdomError",e=>errors.push(e.message)); vc.sendTo(console,{omitJSDOMErrors:true});
  const dom=new JSDOM(html,{runScripts:"dangerously",resources:new LocalLoader(),url:"file://"+path.join(root,"index.html")+"?t="+tid,virtualConsole:vc,beforeParse(w){ w.supabase=fakeSupabase(); w.alert=m=>{w._alerts=(w._alerts||[]);w._alerts.push(m)}; w.confirm=()=>true; w.print=()=>{}; }});
  const w=dom.window, d=w.document;
  await new Promise(r=>w.addEventListener("load",r));
  await new Promise(r=>setTimeout(r,300)); // tournament script + first sync
  ok(errors.length===0,"no script errors: "+errors.join(" | "));
  const T=w.TOURNAMENT, E=w.Engine;
  ok(T&&T.id===tid,"tournament loaded: "+tid);
  console.log("== "+tid+" — "+d.title);
  ok(d.title===T.pageTitle,"document title set");
  ok(d.querySelectorAll(".tab").length===(T.tracked.length>1?T.tracked.length+4:4),"tabs generated");
  const text=()=>d.body.textContent;
  const click=sel=>{ const el=d.querySelector(sel); ok(!!el,"element exists: "+sel); if(el)el.click(); };

  // team view with nothing played
  click('.tab[data-view="T:'+T.tracked[0].key+'"]');
  ok(!d.getElementById("teamView").classList.contains("hidden"),"team view visible");
  ok(d.getElementById("poolSchedule").querySelectorAll(".match").length===3,"3 group matches listed");
  ok(/Next game/.test(text()),"next game card shown");
  ok(d.getElementById("entryTable").querySelectorAll("tbody tr").length===4,"entry table has 4 positions");
  if(T.pools){
    const maps=[...d.querySelectorAll('#poolSchedule a[href*="google.com/maps"]')];
    ok(maps.length===3,"map link on each group game");
    ok(maps.every(a=>/query=-?\d+\.\d+%2C\d+\.\d+/.test(a.href)),"map links carry coordinates");
    ok(d.querySelector('#nextGame a[href*="google.com/maps"]'),"map link on the next-game card");
    ok(d.querySelectorAll('#eventsCard a[href*="google.com/maps"]').length===Object.keys(T.pools).length,"programme lists every pool with a map link");
  }
  ok(/has not started/.test(d.getElementById("projection").textContent),"projection explains group not started");
  ok(d.querySelectorAll("#poolSchedule input:disabled").length===6,"score inputs disabled for public");

  // sign in as editor and enter a result through the UI
  click("#authButton"); d.getElementById("authEmail").value="editor@example.com"; d.getElementById("authPassword").value="x"; click("#loginButton");
  await new Promise(r=>setTimeout(r,50));
  ok(d.getElementById("authState").textContent==="Editor mode","editor mode after sign in");
  const g=E.sortByTime(E.teamGroupGames(T,T.tracked[0].team))[0];
  const inputs=d.querySelectorAll(`#poolSchedule input[onchange*="${g.id}"]`);
  ok(inputs.length===2&&!inputs[0].disabled,"editor inputs enabled");
  inputs[0].value="4"; inputs[0].dispatchEvent(new w.Event("change")); await new Promise(r=>setTimeout(r,50));
  inputs[1].value="1"; inputs[1].dispatchEvent(new w.Event("change")); await new Promise(r=>setTimeout(r,80));
  ok(w.supabase._api._table[g.id]&&w.supabase._api._table[g.id].score_a===4&&w.supabase._api._table[g.id].score_b===1,"score upserted to (fake) Supabase");
  ok(/Won 4–1|Lost 1–4/.test(d.getElementById("poolSchedule").textContent),"result tag rendered from my team's point of view");
  ok(/Current projection/.test(d.getElementById("projection").textContent),"projection shown once a game is played");

  // results view: bulk import a knockout-shaped line should fail before groups settle, group line should pass
  click('.tab[data-view="RESULTS"]');
  ok(d.getElementById("knockoutResults").querySelectorAll(".fixtureEntry").length===E.knockoutGames(T).length,"all knockout games listed");
  const g2=E.groupGames(T,Object.keys(T.groups)[1])[0];
  d.getElementById("bulkInput").value=`${g2.a.team} 2-2 ${g2.b.team}\nNobody 1-0 ${g2.b.team}`;
  click("#previewImport");
  ok(/1 recognised result/.test(d.getElementById("importPreview").textContent),"bulk preview recognises one line");
  ok(/couldn't identify/.test(d.getElementById("importPreview").textContent),"bulk preview flags the bad line");
  click("#applyImport"); await new Promise(r=>setTimeout(r,80));
  ok(w.supabase._api._table[g2.id]&&w.supabase._api._table[g2.id].score_a===2,"bulk import written");

  // play the whole tournament through Supabase rows, then check the team view reaches a final placing
  const scores={};
  T.games.forEach((x,i)=>{ let a=(i*7)%6, b=(i*5)%6; if(x.stage!=="group"&&a===b){a++;} scores[x.id]={a,b}; });
  Object.entries(scores).forEach(([id,s])=>w.supabase._api._table[id]={fixture_id:id,score_a:s.a,score_b:s.b});
  await w.loadSharedScores(false); await new Promise(r=>setTimeout(r,50));
  click('.tab[data-view="T:'+T.tracked[0].key+'"]');
  ok(/Final placing: \d+(st|nd|rd|th)/.test(d.getElementById("knockoutOutput").textContent),"full tournament: final placing shown");
  ok(/Tournament complete/.test(d.getElementById("nextGame").textContent),"full tournament: next card says complete");
  ok(/Confirmed: \d(st|nd|rd|th) in Group/.test(d.getElementById("projection").textContent)||/provisional/i.test(d.getElementById("tieNotice").textContent),"full tournament: group position confirmed or flagged");

  // level knockout score → shoot-out inputs appear, then entering pens advances the bracket
  const w1=E.walk(T,E.sortByTime([]).length?{}:Object.fromEntries(Object.entries(scores)),T.tracked[0].team);
  const ko=w1.steps[0].game;
  w.supabase._api._table[ko.id]={fixture_id:ko.id,score_a:3,score_b:3};
  await w.loadSharedScores(false); await new Promise(r=>setTimeout(r,50));
  ok(d.querySelector(`#knockoutOutput input[onchange*="${ko.id}_pen"]`),"level score shows shoot-out inputs");
  ok(/shoot-out/.test(d.getElementById("knockoutOutput").textContent),"shoot-out notice shown");
  w.supabase._api._table[ko.id+"_pen"]={fixture_id:ko.id+"_pen",score_a:4,score_b:2};
  await w.loadSharedScores(false); await new Promise(r=>setTimeout(r,50));
  ok(/pens 4–2|pens 2–4/.test(d.getElementById("knockoutOutput").textContent),"shoot-out result rendered");
  ok(/Final placing/.test(d.getElementById("knockoutOutput").textContent),"bracket advanced past the shoot-out");

  // bracket view: every knockout game drawn, my path highlighted, group minis present
  click('.tab[data-view="BRACKET"]');
  ok(!d.getElementById("bracketView").classList.contains("hidden"),"bracket view visible");
  ok(d.querySelectorAll("#bracketView [data-game]").length===E.knockoutGames(T).length,"bracket draws every knockout game");
  ok(d.querySelectorAll("#bracketView .bk-mine").length>0,"bracket highlights the tracked team's path");
  ok(d.querySelectorAll("#bracketGroups .groupMini").length===Object.keys(T.groups).length,"group panels rendered");
  ok(d.querySelector("#bracketMain svg"),"championship svg present");
  // click "2nd in Group D" → its entry game and winning route light up, hint names the game
  const grpD=Object.keys(T.groups)[3], entry=E.entryGame(T,grpD,2);
  w.selectGroupPos(grpD,2);
  ok(d.querySelector(`#bracketView [data-game="${entry.id}"].bk-sel`),"selecting 2nd in Group D highlights its entry game");
  ok(d.querySelectorAll("#bracketView .bk-game.bk-sel").length>=2,"winning route from the entry game highlighted");
  ok(new RegExp(entry.label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).test(d.getElementById("bracketHint").textContent),"hint names the entry game");
  ok(d.querySelector("#bracketGroups .gm.sel"),"group row shows as selected");
  w.selectGroupPos(grpD,2);
  ok(!d.querySelector("#bracketView .bk-sel")&&d.getElementById("bracketHint").classList.contains("hidden"),"second click clears the selection");

  // simple planner
  click('.tab[data-view="SIMPLE"]');
  d.getElementById("simplePos").value="2"; d.getElementById("simplePos").dispatchEvent(new w.Event("change"));
  ok(/2nd in Group/.test(d.getElementById("simpleOutput").textContent),"simple planner: position applied");
  const sel=d.querySelector("#simpleOutput select");
  ok(!!sel,"simple planner: result selector present");
  sel.value="win"; sel.dispatchEvent(new w.Event("change"));
  ok(d.querySelectorAll("#simpleOutput select").length===2,"simple planner: next game appears after a win");
  ok(/Assumed win/.test(d.getElementById("simpleOutput").textContent),"simple planner: assumed result tagged");

  // all view (multi-team only)
  if(T.tracked.length>1){ click('.tab[data-view="ALL"]'); ok(d.getElementById("allTimeline").querySelectorAll(".match").length>=6,"all view lists both teams"); }

  // sign out → inputs disabled again
  click("#signOutButton"); await new Promise(r=>setTimeout(r,50));
  click('.tab[data-view="RESULTS"]');
  ok(d.querySelectorAll("#allResults input:not(:disabled)").length===0,"inputs disabled after sign out");
  ok(errors.length===0,"still no script errors");
  w.close();
}

(async()=>{
  const reg=(()=>{const window={};new Function("window",fs.readFileSync(path.join(root,"tournaments/registry.js"),"utf8"))(window);return window.TOURNAMENT_REGISTRY})();
  for(const r of reg){ if(only&&r.id!==only)continue; await run(r.id); }
  console.log(failures?"\n"+failures+" failure(s)":"\nall "+checks+" smoke checks passed");
  process.exit(failures?1:0);
})();
