/* app.js — UI + Supabase sync. All tournament logic lives in js/engine.js; all tournament data in tournaments/*.js */
"use strict";
const PAGE_VERSION="1.6.1";
const SUPABASE_URL="https://jjqtyytnegfqqdnrunir.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_MbuwtamlmFg5iVqKsPDSHw_dTDeDmT5";
const E=window.Engine;

let T=null;            // active tournament definition
let scores={};         // shared results keyed by fixture_id (all tournaments; the engine only reads its own ids)
let view="";           // "T:<key>" | "ALL" | "RESULTS" | "SIMPLE"
let simple={team:"",pos:"",assume:{}};
let currentUser=null, lastSync=null, importDraft=[], sb=null, pollTimer=null;

const $=id=>document.getElementById(id);
// localStorage can be missing or throw (private mode, file:// URLs); fall back to memory.
const store=(()=>{ const mem={}; return {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return mem[k]??null; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch(e){ mem[k]=v; } }
};})();
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const LS=k=>"tc_"+T.id+"_"+k;
const tracked=()=>T.tracked||[];
const trackedByKey=k=>tracked().find(t=>t.key===k)||tracked()[0];
const idx=k=>Math.max(0,tracked().findIndex(t=>t.key===k));
const day=g=>E.dayLabel(T,g.date);
const arrive=g=>E.arrival(g.time,T.arriveMinutes);

/* ---------- boot: pick the tournament, load its data file ---------- */
(function boot(){
  const reg=window.TOURNAMENT_REGISTRY||[];
  const want=new URLSearchParams(location.search).get("t");
  const entry=reg.find(r=>r.id===want)||reg[0];
  if(!entry){ $("heroTitle").textContent="No tournament configured"; return; }
  const s=document.createElement("script");
  s.src=entry.file+"?v="+PAGE_VERSION;
  s.onload=()=>init(window.TOURNAMENT,reg,entry);
  s.onerror=()=>{ $("heroTitle").textContent="Could not load "+entry.file; };
  document.head.appendChild(s);
})();

function init(tournament,reg,entry){
  T=tournament;
  document.title=T.pageTitle||T.name;
  view=store.get(LS("view"))||("T:"+tracked()[0].key);
  scores=JSON.parse(store.get(LS("scores"))||"{}");
  simple=Object.assign({team:tracked()[0].key,pos:"",assume:{}},JSON.parse(store.get(LS("simple"))||"{}"));
  if(!trackedByKey(simple.team)) simple.team=tracked()[0].key;

  const L=T.logos||{};
  const tourneyInline=L.tournament?`<img class="heroTourneyInline" src="${esc(L.tournament.src)}?v=${PAGE_VERSION}" alt="${esc(L.tournament.alt||"")}">`:"";
  $("heroTitle").innerHTML=esc(T.heroTitle||tracked()[0].longLabel||tracked()[0].label)+"<br>"+esc(T.name)+tourneyInline;
  if(L.team){ $("heroTeamLogo").innerHTML=`<img src="${esc(L.team.src)}?v=${PAGE_VERSION}" alt="${esc(L.team.alt||"")}">`; $("heroTeamLogo").classList.remove("hidden"); }
  $("heroSub").textContent=[T.section,T.venue,T.dates].filter(Boolean).join(" • ");
  let meta=`<span class="metaPill">${esc(T.pdfVersion||"Official PDF")}</span><span class="metaPill">Page v${PAGE_VERSION}</span>`;
  if(reg.length>1){
    meta+=`<select id="tournamentSwitch" class="noPrint" title="Switch tournament">`+reg.map(r=>`<option value="${esc(r.id)}" ${r.id===entry.id?"selected":""}>${esc(r.name)}</option>`).join("")+`</select>`;
  }
  $("heroMeta").innerHTML=meta;
  if(reg.length>1) $("tournamentSwitch").addEventListener("change",e=>{ location.search="?t="+encodeURIComponent(e.target.value); });

  // tabs
  let tabs=tracked().map(t=>`<button class="tab" data-view="T:${esc(t.key)}">${esc(t.label)}</button>`);
  if(tracked().length>1) tabs.push(`<button class="tab" data-view="ALL">All ${esc(commonLabel())}</button>`);
  tabs.push(`<button class="tab" data-view="BRACKET">Bracket</button>`,`<button class="tab" data-view="RESULTS">Results</button>`,`<button class="tab" data-view="SIMPLE">Simple</button>`);
  $("tabs").innerHTML=tabs.join("");
  document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));
  const validViews=[...tracked().map(t=>"T:"+t.key),"BRACKET","RESULTS","SIMPLE"].concat(tracked().length>1?["ALL"]:[]);
  if(!validViews.includes(view)) view="T:"+tracked()[0].key;

  // simple planner team picker
  $("simpleTeam").innerHTML=tracked().map(t=>`<option value="${esc(t.key)}">${esc(t.longLabel||t.label)}</option>`).join("");
  $("simpleTeamWrap").classList.toggle("hidden",tracked().length<2);
  $("simpleTeam").addEventListener("change",e=>{simple.team=e.target.value;simple.pos="";simple.assume={};saveLocal();renderSimple()});
  $("simplePos").addEventListener("change",e=>{simple.pos=e.target.value;simple.assume={};saveLocal();renderSimple()});

  // static cards
  if(window.Bracket&&!$("bracketCss")){ const st=document.createElement("style"); st.id="bracketCss"; st.textContent=window.Bracket.css; document.head.appendChild(st); }
  $("pdfLink").href=T.pdf;
  if(T.external){
    const x=T.external, btns=$("pdfLink").parentElement;
    const add=(href,label)=>{ if(!href)return; const a=document.createElement("a"); a.className="action secondary"; a.href=href; a.target="_blank"; a.rel="noopener"; a.textContent=label; btns.appendChild(a); };
    add(x.results,(x.name||"Official")+" results"); add(x.teamFixtures||x.fixtures,(x.name||"Official")+" fixtures");
    if(T.venueMap) add(mapsUrl(T.venueMap.lat,T.venueMap.lng,T.venueMap.label),"Venue in Google Maps");
    else add(x.venue,"Venue");
    if(x.results){ $("feedBox").classList.remove("hidden"); $("feedOpen").href=x.results; $("feedTitle").textContent="Update from "+(x.name||"the official results"); }
    const help=$("importHelpExt"); if(help) help.innerHTML=`For scores that are not on ${esc(x.name)} yet (or are wrong there): type them here, one per line. Pasting a copied ${esc(x.name)} page also works.`;
  }
  if(T.pools){
    const pools=Object.entries(T.pools).map(([name,pin])=>`<a class="action secondary" href="${esc(mapsUrl(pin.lat,pin.lng,""))}" target="_blank" rel="noopener">${esc(name)} ↗</a>`).join("");
    const venue=T.venueMap?`<a href="${esc(mapsUrl(T.venueMap.lat,T.venueMap.lng,T.venueMap.label))}" target="_blank" rel="noopener">${esc(T.venueMap.label||T.venue||"Venue")}</a>`:esc(T.venue||"");
    $("events").insertAdjacentHTML("afterend",`<h3>Pools</h3><div class="sub" style="margin-bottom:8px">${venue}${T.address?" • "+esc(T.address):""}</div><div class="btns">${pools}</div><div class="sub">Each button opens that pool's pin in Google Maps.</div>`);
  }
  $("events").innerHTML=(T.events||[]).map(ev=>{
    const map=ev.map?` <a class="extLink" href="${esc(mapsUrl(ev.map.lat,ev.map.lng,ev.map.label))}" target="_blank" rel="noopener">Map ↗</a>`:"";
    return `<div class="match${ev.highlight?" eventHi":""}"><div class="day">${esc(E.dayLabel(T,ev.date))}</div><div class="time">${esc(ev.time)}</div><div><strong>${esc(ev.label)}</strong>${ev.highlight?'<span class="badge hi">Herschel</span>':""}${ev.detail?`<div class="meta">${esc(ev.detail)}${map}</div>`:map}</div></div>`;
  }).join("")||"<div class='sub'>No programme items.</div>";
  $("notes").innerHTML=`<div class="notice warn"><ul class="notes">${(T.notes||[]).map(n=>`<li>${esc(n)}</li>`).join("")}</ul></div>`;
  $("footer").innerHTML=`termark/tournament-companion • ${esc(T.name)} • page v${PAGE_VERSION}<br>Static GitHub Pages app • shared results via Supabase, cached in this browser`;

  $("feedFetch").addEventListener("click",feedFetch);
  $("feedManualToggle").addEventListener("click",()=>{ $("feedManual").classList.toggle("hidden"); });
  $("feedInput").addEventListener("input",feedPreview);
  $("feedInput").addEventListener("paste",()=>setTimeout(feedPreview,0));
  $("feedSubmit").addEventListener("click",feedSubmit);
  $("feedClear").addEventListener("click",()=>{ $("feedInput").value=""; feedDraft=[]; $("feedPreview").classList.add("hidden"); });
  $("previewImport").addEventListener("click",previewBulk);
  $("applyImport").addEventListener("click",applyBulk);
  $("authButton").addEventListener("click",()=>$("authPanel").classList.remove("hidden"));
  $("cancelLoginButton").addEventListener("click",()=>$("authPanel").classList.add("hidden"));
  $("loginButton").addEventListener("click",doLogin);
  $("signOutButton").addEventListener("click",doSignOut);

  render();
  startSupabase();
}
function commonLabel(){
  const labels=tracked().map(t=>t.label);
  const first=labels[0].split(" ")[0];
  return labels.every(l=>l.startsWith(first))?first:"teams";
}

/* ---------- local persistence ---------- */
function saveLocal(){
  store.set(LS("scores"),JSON.stringify(scores));
  store.set(LS("simple"),JSON.stringify(simple));
  store.set(LS("view"),view);
}
function setView(v){view=v;saveLocal();render()}

/* ---------- shared results ---------- */
function startSupabase(){
  if(!window.supabase){ setSyncStatus("Shared results unavailable (offline); showing cached data.",true); updateAuthUI(); return; }
  sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
  (async()=>{
    const {data}=await sb.auth.getSession();
    currentUser=data.session?.user||null;
    updateAuthUI();
    await loadSharedScores();
    pollTimer=setInterval(()=>loadSharedScores(false),20000);
  })();
}
// A paused Supabase project (free tier, idle for a week) refuses every call with a network-style error.
function pausedHint(error){
  const m=(error&&error.message)||String(error);
  return /failed to fetch|network|load failed|503|540|paused/i.test(m)?m+" — the Supabase project is probably paused; restore it in the Supabase dashboard.":m;
}
function setSyncStatus(msg,isError){
  const el=$("syncStatus"); if(!el)return;
  el.textContent=msg+(lastSync&&!isError?" • "+lastSync.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"");
  el.style.color=isError?"var(--red)":"var(--muted)";
}
async function loadSharedScores(showStatus=true){
  if(!sb)return;
  if(showStatus)setSyncStatus("Loading shared results…");
  const {data,error}=await sb.from("match_results").select("fixture_id,score_a,score_b,updated_at");
  if(error){ setSyncStatus("Could not load shared results; showing cached data. "+pausedHint(error),true); return; }
  const fresh={};
  (data||[]).forEach(row=>{ fresh[row.fixture_id]={a:row.score_a==null?"":row.score_a,b:row.score_b==null?"":row.score_b}; });
  scores=fresh; saveLocal(); lastSync=new Date();
  setSyncStatus("Shared results up to date");
  render();
}
async function upsertRows(rows){
  if(!sb) return {error:{message:"offline"}};
  return sb.from("match_results").upsert(rows,{onConflict:"fixture_id"});
}
async function setScore(id,side,v){
  if(!currentUser){ alert("Sign in as an editor to change scores."); render(); return; }
  scores[id]=scores[id]||{a:"",b:""};
  scores[id][side]=v===""?"":Math.max(0,parseInt(v||0));
  saveLocal(); render();
  const row={fixture_id:id,score_a:numOrNull(scores[id].a),score_b:numOrNull(scores[id].b),updated_at:new Date().toISOString()};
  const {error}=await upsertRows(row);
  if(error) setSyncStatus("Save failed: "+error.message,true);
  else { lastSync=new Date(); setSyncStatus("Saved to shared results"); await loadSharedScores(false); }
}
window.setScore=setScore;
const numOrNull=v=>(v===""||v==null)?null:Number(v);

/* ---------- auth ---------- */
function updateAuthUI(){
  const state=$("authState"),btn=$("authButton"),out=$("signOutButton");
  if(currentUser){ state.textContent="Editor mode"; btn.classList.add("hidden"); out.classList.remove("hidden"); }
  else { state.textContent="Public read-only"; btn.classList.remove("hidden"); out.classList.add("hidden"); }
  render();
}
async function doLogin(){
  const email=$("authEmail").value.trim(), password=$("authPassword").value, msg=$("authMessage");
  if(!sb){ msg.textContent="Offline — cannot sign in."; return; }
  msg.textContent="Signing in…";
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  if(error){ msg.textContent=pausedHint(error); return; }
  currentUser=data.user; $("authPanel").classList.add("hidden"); msg.textContent=""; updateAuthUI();
}
async function doSignOut(){ if(sb) await sb.auth.signOut(); currentUser=null; updateAuthUI(); }

/* ---------- shared rendering pieces ---------- */
function capsBadge(side){
  if(!T.caps||!T.caps[side])return "";
  const c=T.caps[side], cls=/blue/i.test(c)?"capsBlue":/white/i.test(c)?"capsWhite":"";
  return `<span class="badge caps ${cls}">${esc(c)}</span>`;
}
function partHTML(res){
  if(res.team&&res.confirmed) return `<strong>${esc(res.team)}</strong>`;
  if(res.team) return `<strong>${esc(res.team)}</strong><span class="badge soft">projected</span>`;
  return `<span class="placeholder">${esc(res.label)}</span>`+(res.detail?`<div class="meta">${esc(res.detail)}</div>`:"");
}
function oppText(res){ // plain text for "vs …"
  if(res.team&&res.confirmed) return res.team;
  if(res.team) return res.team+" (projected)";
  return res.label;
}
function resultTag(g){
  const r=E.result(T,scores,g);
  if(!r)return '<span class="resultTag upcomingTag">Upcoming</span>';
  if(r.draw&&r.needsPens)return `<span class="resultTag pensTag">Level ${r.a}–${r.b} — enter the penalty shoot-out</span>`;
  if(r.draw)return `<span class="resultTag drawTag">Draw ${r.a}–${r.b}</span>`;
  const pens=r.pens?` (pens ${r.pens.a}–${r.pens.b})`:"";
  return `<span class="resultTag drawTag">${r.a}–${r.b}${pens}</span>`;
}
function resultTagFor(g,team){ // coloured from one team's point of view
  const r=E.result(T,scores,g), p=E.participants(T,scores,g);
  if(!r)return '<span class="resultTag upcomingTag">Upcoming</span>';
  if(r.draw&&r.needsPens)return `<span class="resultTag pensTag">Level ${r.a}–${r.b} — shoot-out pending</span>`;
  if(r.draw)return `<span class="resultTag drawTag">Draw ${r.a}–${r.b}</span>`;
  const mySide=(p.a.team||p.a.current)===team?"a":"b";
  const won=r.winner===mySide;
  const mine=mySide==="a"?r.a:r.b, theirs=mySide==="a"?r.b:r.a;
  const pens=r.pens?` (pens ${mySide==="a"?r.pens.a:r.pens.b}–${mySide==="a"?r.pens.b:r.pens.a})`:"";
  return `<span class="resultTag ${won?"winTag":"lossTag"}">${won?"Won":"Lost"} ${mine}–${theirs}${pens}</span>`;
}
function scoreRows(g){
  const p=E.participants(T,scores,g);
  const canEnter=(p.a.team||p.a.current)&&(p.b.team||p.b.current);
  if(!canEnter) return "";
  const dis=currentUser?"":'disabled class="readonly"';
  const sa=E.scoreOf(scores,g.id), r=E.result(T,scores,g);
  const val=v=>v==null?"":v;
  let h=`<div class="scoreRow noPrint">
    <div class="teamLeft">${esc(p.a.team||p.a.current||p.a.label)}</div>
    <input inputmode="numeric" pattern="[0-9]*" placeholder="–" value="${val(sa.a)}" ${dis} onchange="setScore('${g.id}','a',this.value)">
    <div>–</div>
    <input inputmode="numeric" pattern="[0-9]*" placeholder="–" value="${val(sa.b)}" ${dis} onchange="setScore('${g.id}','b',this.value)">
    <div class="teamRight">${esc(p.b.team||p.b.current||p.b.label)}</div>
  </div>`;
  if(g.stage!=="group"&&r&&r.draw){
    const pp=E.scoreOf(scores,g.id+"_pen");
    h+=`<div class="scoreRow pens noPrint">
      <div class="teamLeft">shoot-out</div>
      <input inputmode="numeric" pattern="[0-9]*" placeholder="–" value="${val(pp.a)}" ${dis} onchange="setScore('${g.id}_pen','a',this.value)">
      <div>–</div>
      <input inputmode="numeric" pattern="[0-9]*" placeholder="–" value="${val(pp.b)}" ${dis} onchange="setScore('${g.id}_pen','b',this.value)">
      <div class="teamRight">shoot-out</div>
    </div>`;
  }
  return h;
}
function whereLine(g,extra){
  return [g.pool,extra].filter(Boolean).map(esc).join(" • ");
}
function gameRef(g){ return `G#${g.n}`; }
function mapsUrl(lat,lng,label){ return "https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(label?label+" @"+lat+","+lng:lat+","+lng); }
function mapLink(g){
  const pin=g.pool&&T.pools&&T.pools[g.pool];
  if(pin) return ` <a class="extLink" href="${esc(mapsUrl(pin.lat,pin.lng,""))}" target="_blank" rel="noopener" title="${esc(g.pool)} in Google Maps">Map ↗</a>`;
  if(T.venueMap) return ` <a class="extLink" href="${esc(mapsUrl(T.venueMap.lat,T.venueMap.lng,T.venueMap.label))}" target="_blank" rel="noopener">Map ↗</a>`;
  return "";
}
function extLink(g){
  const x=T.external; if(!x||!x.game) return "";
  return ` <a class="extLink" href="${esc(x.game(g.n))}" target="_blank" rel="noopener">${esc(x.name||"details")} ↗</a>`;
}

/* ---------- next game card ---------- */
function nextGameHTML(keys){
  const cands=[];
  keys.forEach(k=>{
    const t=trackedByKey(k), nx=E.nextForTeam(T,scores,t.team);
    if(nx.kind==="group"){
      const g=nx.game, opp=g.a.team===t.team?g.b.team:g.a.team, side=g.a.team===t.team?"a":"b";
      cands.push({k,t,g,sort:g.date+g.time,title:"vs "+opp,sub:`${day(g)} • ${g.pool||""} ${capsBadge(side)} • arrive by ${arrive(g)}${mapLink(g)}`});
    } else if(nx.kind==="knockout"){
      const s=nx.step, g=s.game;
      const proj=nx.walk.rank.confirmed?"":` <span class="badge soft">based on ${E.ordinal(nx.walk.usedRank)} in Group ${nx.walk.rank.group}${nx.walk.rank.anyPlayed?" (projected)":""}</span>`;
      cands.push({k,t,g,sort:g.date+g.time,title:`${g.label} • vs ${oppText(s.opp)}`,sub:`${day(g)} • ${g.pool||""} ${capsBadge(s.side)} • arrive by ${arrive(g)}${mapLink(g)}${proj}`});
    } else {
      cands.push({k,t,g:null,sort:"9",title:`Tournament complete — finished ${E.ordinal(nx.placing)}`,sub:""});
    }
  });
  cands.sort((a,b)=>a.sort.localeCompare(b.sort));
  const x=cands[0];
  if(!x)return `<div class="nextOpponent">No next match available</div>`;
  const badge=keys.length>1?`<div class="nextTeamBadge"><span class="teamBadge teamBadge${idx(x.k)}">${esc(x.t.label)}</span></div>`:"";
  return `${badge}<div class="nextTime">${x.g?esc(x.g.time):"—"}</div><div class="nextOpponent">${keys.length>1?esc(x.t.label)+" • ":""}${esc(x.title)}</div><div class="sub">${x.sub}</div>`;
}

/* ---------- team view ---------- */
function teamPoolHTML(t){
  return E.sortByTime(E.teamGroupGames(T,t.team)).map(g=>{
    const side=g.a.team===t.team?"a":"b", opp=side==="a"?g.b.team:g.a.team;
    return `<div class="match">
      <div class="day">${esc(day(g))}</div><div class="time">${esc(g.time)}</div>
      <div><strong>vs ${esc(opp)}</strong>${capsBadge(side)}<div class="meta">${whereLine(g,"arrive by "+arrive(g))}${extLink(g)}${mapLink(g)}</div>${resultTagFor(g,t.team)}</div>
      <div class="scoreWrap">${scoreRows(g)}</div>
    </div>`;
  }).join("");
}
function teamMark(team){
  const L=T.logos&&T.logos.team; if(!L||!L.mark||!tracked().some(t=>t.team===team)) return "";
  return `<img class="teamMark" src="${esc(L.mark)}?v=${PAGE_VERSION}" alt="">`;
}
function tableHTML(group){
  const st=E.standings(T,scores,group);
  const mine=tracked().map(t=>t.team);
  return `<div class="tableWrap"><table class="table"><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr></thead><tbody>`+
    st.arr.map((x,i)=>`<tr class="${mine.includes(x.team)?"myRow":""}"><td class="rank">${i+1}</td><td><strong>${teamMark(x.team)}${esc(x.team)}</strong></td><td>${x.p}</td><td>${x.w}</td><td>${x.d}</td><td>${x.l}</td><td>${x.gf}</td><td>${x.ga}</td><td>${x.gd}</td><td><strong>${x.pts}</strong></td></tr>`).join("")+
    `</tbody></table></div>`;
}
function tableNotes(st){
  let h="";
  if(st.provisional) h+=`<div class="notice warn">Standings are provisional: a tie cannot be settled from the entered scores.</div>`;
  st.notes.forEach(n=>{ if(!/cannot be separated/.test(n)) h+=`<div class="notice warn">${esc(n)}</div>`; });
  return h;
}
function stepBlock(s,team){
  const g=s.game;
  return `<div class="match"><div class="day">${esc(day(g))}</div><div class="time">${esc(g.time)}</div>
    <div><strong>${esc(g.label)}</strong><span class="badge">${gameRef(g)}</span>${capsBadge(s.side)}
      <div class="meta">${whereLine(g,"arrive by "+arrive(g))}${extLink(g)}${mapLink(g)}</div>
      <div style="margin-top:6px">vs ${partHTML(s.opp)}</div>
      ${team?resultTagFor(g,team):""}
      ${s.how==="assumed"?`<span class="resultTag ${s.outcome==="win"?"winTag":"lossTag"}">Assumed ${s.outcome}</span>`:""}
    </div>${team?`<div class="scoreWrap">${scoreRows(g)}</div>`:""}</div>`;
}
function branchHTML(nx,outcome){
  if(nx.game){ const g=nx.game; return `${esc(day(g))} • <b>${esc(g.time)}</b><div class="small">${esc(g.label)} • ${esc(g.pool||"")}</div>`; }
  if(nx.placing) return `Finishes <b>${E.ordinal(nx.placing)}</b>`;
  return "—";
}
function outcomesHTML(step){
  return `<div class="routeBox"><div class="routeTitle">After ${esc(step.game.label)}</div><div class="outcomes">
    <div class="outcome ifwin"><strong>If WIN</strong>${branchHTML(step.next.win,"win")}</div>
    <div class="outcome ifloss"><strong>If LOSS</strong>${branchHTML(step.next.loss,"loss")}</div>
  </div></div>`;
}
function walkHTML(w,team){
  let out=w.steps.map(s=>stepBlock(s,team)).join("");
  const last=w.steps[w.steps.length-1];
  if(!last) return `<div class="sub">No knockout route found for ${E.ordinal(w.usedRank)} in Group ${w.rank.group}.</div>`;
  if(!last.outcome){
    if(last.how==="pens-needed") out+=`<div class="notice warn" style="margin-top:8px">${esc(last.game.label)} finished level — enter the penalty shoot-out score to advance the bracket.</div>`;
    out+=outcomesHTML(last);
  } else if(w.finalPlacing){
    out+=`<div class="placingBig">Final placing: ${E.ordinal(w.finalPlacing)}</div>`;
  }
  return out;
}
function entryTableHTML(group,team){
  const rows=[1,2,3,4].map(rank=>{
    const g=E.entryGame(T,group,rank); if(!g)return "";
    const w=E.walk(T,scores,team,{rank,assume:{}});
    const s=w.steps[0];
    return `<tr><td class="rank">${E.ordinal(rank)}</td><td><strong>${esc(g.label)}</strong><div class="meta">${esc(day(g))} ${esc(g.time)} • ${esc(g.pool||"")}</div></td><td>${partHTML(s.opp)}</td></tr>`;
  }).join("");
  return `<div class="tableWrap"><table class="table compact"><thead><tr><th>Finish</th><th>First knockout game</th><th>Opponent</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function projectionHTML(w){
  const rk=w.rank;
  if(!rk.anyPlayed) return `<div><strong>Group ${rk.group} has not started.</strong></div><div class="sub">The route below assumes ${E.ordinal(w.usedRank)} place; see "Where each group position leads" for the other outcomes, or use the Simple planner.</div>`;
  const label=rk.confirmed?"Confirmed":"Current projection";
  return `<div><strong>${label}: ${E.ordinal(w.usedRank)} in Group ${rk.group}</strong></div>
    <div class="sub">${rk.confirmed?"Group positions are final from the entered results.":"This can still change as remaining group results are entered."}</div>`;
}
function renderTeam(t){
  const st=E.standings(T,scores,E.groupOf(T,t.team));
  const group=E.groupOf(T,t.team);
  $("poolTitle").textContent=(t.longLabel||t.label)+" • Group "+group+" matches";
  $("poolSchedule").innerHTML=teamPoolHTML(t);
  $("standingsTitle").textContent="Live Group "+group+" standings";
  $("poolTable").innerHTML=tableHTML(group);
  $("tieNotice").innerHTML=tableNotes(st);
  const w=E.walk(T,scores,t.team);
  $("projection").innerHTML=projectionHTML(w);
  $("knockoutOutput").innerHTML=walkHTML(w,t.team);
  $("entryTable").innerHTML=entryTableHTML(group,t.team);
}

/* ---------- all tracked teams ---------- */
function allHTML(){
  const xs=[];
  tracked().forEach(t=>{
    E.teamGroupGames(T,t.team).forEach(g=>xs.push({t,g,kind:"group"}));
    const nx=E.nextForTeam(T,scores,t.team);
    if(nx.kind==="knockout") xs.push({t,g:nx.step.game,kind:"ko",step:nx.step});
  });
  xs.sort((a,b)=>(a.g.date+a.g.time).localeCompare(b.g.date+b.g.time));
  return xs.map(x=>{
    const i=idx(x.t.key);
    const side=x.kind==="group"?(x.g.a.team===x.t.team?"a":"b"):x.step.side;
    const opp=x.kind==="group"?(side==="a"?x.g.b.team:x.g.a.team):oppText(x.step.opp);
    return `<div class="match allMatch allMatch${i}">
      <div class="day">${esc(day(x.g))}</div><div class="time">${esc(x.g.time)}</div>
      <div><div class="allPrimary"><span class="teamBadge teamBadge${i}">${esc(x.t.label)}</span><strong>${x.kind==="ko"?esc(x.g.label)+" • ":""}vs ${esc(opp)}</strong>${capsBadge(side)}</div>
      <div class="meta">${whereLine(x.g,"arrive by "+arrive(x.g))}${mapLink(x.g)}</div>${resultTagFor(x.g,x.t.team)}</div>
    </div>`;
  }).join("");
}

/* ---------- results view ---------- */
function resultEntry(g){
  const p=E.participants(T,scores,g);
  const title=g.stage==="group"?`${esc(g.a.team)} vs ${esc(g.b.team)}`:`${esc(g.label)}<span class="badge">${gameRef(g)}</span>`;
  const parts=g.stage==="group"?"":`<div style="margin-top:4px">${partHTML(p.a)} <span class="meta" style="display:inline">vs</span> ${partHTML(p.b)}</div>`;
  const sub=[g.stage==="group"?`Group ${g.group} • ${gameRef(g)}`:g.section,g.pool].filter(Boolean).map(esc).join(" • ");
  return `<div class="fixtureEntry">
    <div class="fixtureTop"><div class="day">${esc(day(g))}</div><div class="time">${esc(g.time)}</div><div><div class="fixtureTeams">${title}</div><div class="meta">${sub}${extLink(g)}${mapLink(g)}</div>${parts}</div></div>
    ${scoreRows(g)}
    <div class="statusText">${resultTag(g)}</div>
  </div>`;
}
function resultsHTML(){
  return Object.keys(T.groups).map(grp=>`<div class="resultGroup"><h3>Group ${grp}</h3>${E.sortByTime(E.groupGames(T,grp)).map(resultEntry).join("")}</div>`).join("");
}
function knockoutResultsHTML(){
  const byDay={};
  E.sortByTime(E.knockoutGames(T)).forEach(g=>{(byDay[g.date]=byDay[g.date]||[]).push(g)});
  return Object.keys(byDay).sort().map(d=>`<div class="resultGroup"><h3>${esc(E.dayLabel(T,d))}</h3>${byDay[d].map(resultEntry).join("")}</div>`).join("");
}
function allTablesHTML(){
  return Object.keys(T.groups).map(grp=>{
    const st=E.standings(T,scores,grp);
    return `<div class="resultGroup"><h3>Group ${grp}</h3>${tableHTML(grp)}<div class="sub">${st.complete?"All group games entered.":"Group results incomplete."}</div>${tableNotes(st)}</div>`;
  }).join("");
}

/* ---------- bracket view ---------- */
let bracketSel=null; // {group,rank} chosen in the group panels
function groupMiniHTML(){
  const mine=tracked().map(t=>t.team);
  return Object.keys(T.groups).map(grp=>{
    const st=E.standings(T,scores,grp);
    const gs=window.Bracket?window.Bracket.groupStyle(T,grp):{fg:"",bg:""};
    return `<div class="groupMini" style="--gfg:${gs.fg};--gbg:${gs.bg}"><h3><span class="chip">${grp}</span>Group ${grp}</h3>${st.arr.map((x,i)=>{
      const sel=bracketSel&&bracketSel.group===grp&&bracketSel.rank===i+1;
      return `<div class="gm ${mine.includes(x.team)?"me":""} ${sel?"sel":""}" role="button" tabindex="0" onclick="selectGroupPos('${grp}',${i+1})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectGroupPos('${grp}',${i+1})}"><span class="r">${i+1}</span><span>${teamMark(x.team)}${esc(x.team)}</span><span class="p">${x.p?x.pts+" pts":"–"}</span></div>`;
    }).join("")}${st.provisional?`<div class="meta">provisional</div>`:""}</div>`;
  }).join("");
}
function selectGroupPos(group,rank){
  bracketSel=(bracketSel&&bracketSel.group===group&&bracketSel.rank===rank)?null:{group,rank};
  renderBracket();
}
window.selectGroupPos=selectGroupPos;
// Highlight the game a group position enters, and the route it would take on wins from there.
function applyBracketSelection(){
  const hint=$("bracketHint");
  if(!bracketSel){ hint.classList.add("hidden"); return; }
  const {group,rank}=bracketSel;
  const entry=E.entryGame(T,group,rank);
  if(!entry){ hint.classList.add("hidden"); return; }
  // route on wins: entry → winner's next game → … (that is where the position is heading if it keeps winning)
  const ids=[entry.id]; let g=entry, guard=0;
  while(g&&guard++<10){ const nx=E.nextGame(T,g.n,"win"); if(!nx)break; ids.push(nx.id); g=nx; }
  const svgs=document.querySelectorAll("#bracketMain svg, #bracketPlacings svg");
  let first=null;
  svgs.forEach(svg=>{
    svg.querySelectorAll(".bk-sel").forEach(el=>el.classList.remove("bk-sel"));
    ids.forEach(id=>{ const el=svg.querySelector(`[data-game="${id}"]`); if(el){ el.classList.add("bk-sel"); if(!first)first=el; } });
    // the row for this position inside the entry game
    const en=svg.querySelector(`[data-game="${entry.id}"]`);
    if(en){ const side=(entry.a.group===group&&entry.a.rank===rank)?0:1; const rows=en.querySelectorAll(".bk-row"); if(rows[side])rows[side].classList.add("sel"); }
    // edges along the winning route: an edge is drawn between consecutive games, mark by data attributes
    for(let i=0;i+1<ids.length;i++){ svg.querySelectorAll(`.bk-edge[data-from="${ids[i]}"][data-to="${ids[i+1]}"]`).forEach(e=>e.classList.add("bk-sel")); }
  });
  const st=E.standings(T,scores,group), team=st.anyPlayed&&st.arr[rank-1]?st.arr[rank-1].team:null;
  hint.innerHTML=`<strong>${E.ordinal(rank)} in Group ${esc(group)}</strong>${team?` (currently ${esc(team)}${st.confirmed?"":", projected"})`:""} plays <strong>${esc(entry.label)}</strong> on ${esc(day(entry))} at <strong>${esc(entry.time)}</strong>${entry.pool?" in the "+esc(entry.pool):""}. The orange trail is the route from there on wins.`;
  hint.classList.remove("hidden");
  // bring the entry game into view
  try{
    const en=document.querySelector(`#bracketMain [data-game="${entry.id}"] rect, #bracketPlacings [data-game="${entry.id}"] rect`);
    if(en){ const wrap=en.closest(".bracketWrap"); const bb=en.getBBox(); if(wrap&&wrap.scrollWidth>wrap.clientWidth) wrap.scrollLeft=Math.max(0,bb.x+bb.width/2-wrap.clientWidth/2); }
  }catch(e){}
}
function renderBracket(){
  if(!window.Bracket){ $("bracketMain").innerHTML="<div class='sub'>Bracket module not loaded.</div>"; return; }
  const opts={team:tracked()[0].team};
  $("bracketGroups").innerHTML=groupMiniHTML();
  const all=window.Bracket.all(T,scores,opts);
  const champ=all.find(x=>x.final);
  $("bracketTitle").textContent=champ?"Championship bracket":"Bracket";
  $("bracketMain").innerHTML=champ?champ.svg:"<div class='sub'>No final defined for this tournament.</div>";
  // start scrolled to the tracked team's game when the bracket is wider than the screen
  try{
    const wrap=$("bracketMain"), mine=wrap.querySelector(".bk-mine rect");
    if(mine&&wrap.scrollWidth>wrap.clientWidth){ const bb=mine.getBBox(); wrap.scrollLeft=Math.max(0,bb.x+bb.width/2-wrap.clientWidth/2); }
  }catch(e){}
  $("bracketPlacings").innerHTML=all.filter(x=>!x.final).map(x=>`<div class="resultGroup"><h3>${esc(x.title)}</h3><div class="bracketWrap">${x.svg}</div></div>`).join("")||"<div class='sub'>No placing games.</div>";
  applyBracketSelection();
}

/* ---------- update from the official results feed (any visitor) ---------- */
let feedDraft=[];
// One tap: the fetch-results Edge Function reads the results page server-side with the same parser.
async function feedFetch(){
  const btn=$("feedFetch"), st=$("feedFetchStatus");
  btn.disabled=true; st.style.color="var(--muted)"; st.textContent="Reading "+((T.external&&T.external.name)||"the results page")+"…";
  try{
    const res=await fetch(SUPABASE_URL+"/functions/v1/fetch-results",{method:"POST",headers:{"content-type":"application/json","apikey":SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({tournament:T.id})});
    const body=await res.json().catch(()=>({}));
    if(!res.ok||!body.ok) throw new Error(body.error||("HTTP "+res.status));
    await loadSharedScores(false);
    const when=new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    st.textContent=body.found===0?`No results published yet (${when}).`:`${body.found} result${body.found===1?"":"s"} on ${(T.external&&T.external.name)||"the feed"}, ${body.written} new or changed written (${when}).`;
    setSyncStatus(st.textContent);
  }catch(e){
    st.style.color="var(--red)";
    st.textContent="Automatic update failed ("+(e.message||e)+"). Use “Paste instead” below.";
    $("feedManual").classList.remove("hidden");
  }finally{ btn.disabled=false; }
}
function feedPreview(){
  const text=$("feedInput").value;
  const box=$("feedPreview");
  if(!text.trim()){ box.classList.add("hidden"); feedDraft=[]; return; }
  const p=E.parseBulk(T,scores,text);
  const rows=p.out.filter(x=>x.feedRow);          // only verbatim feed rows may be written without sign-in
  const skipped=p.out.length-rows.length;
  feedDraft=rows.map(x=>{
    const ex=E.scoreOf(scores,x.game.id);
    const same=ex.a===x.scoreA&&ex.b===x.scoreB;
    const changed=(ex.a!=null||ex.b!=null)&&!same;
    return {game:x.game,scoreA:x.scoreA,scoreB:x.scoreB,existingA:ex.a,existingB:ex.b,same,changed};
  });
  box.classList.remove("hidden");
  if(!feedDraft.length){
    box.innerHTML=`<strong>No results recognised in the pasted text.</strong><div class="previewError">Make sure the whole MyComLink results page was copied (Select all → Copy). Lines seen: ${text.split(/\n/).filter(l=>l.trim()).length}.</div>`;
    return;
  }
  const fresh=feedDraft.filter(d=>!d.same);
  const list=feedDraft.map(d=>{
    const p=E.participants(T,scores,d.game);
    const tag=d.same?`<span class="badge soft">already in</span>`:d.changed?`<span class="badge" style="background:#fff8db;color:#8a5a00">changes ${d.existingA}–${d.existingB}</span>`:`<span class="badge" style="background:#dcfce7;color:#166534">new</span>`;
    return `<div class="fixtureEntry"><div class="fixtureTeams">${esc(p.a.team||p.a.current)} <b>${d.scoreA}–${d.scoreB}</b> ${esc(p.b.team||p.b.current)} ${tag}</div><div class="meta">${esc(d.game.stage==="group"?"Group "+d.game.group:d.game.label)} • ${esc(day(d.game))} ${esc(d.game.time)}</div></div>`;
  }).join("");
  box.innerHTML=`<div class="previewOk">${feedDraft.length} result${feedDraft.length===1?"":"s"} found, ${fresh.length} to write</div>${list}`+
    (skipped?`<div class="previewSkipped">${skipped} hand-typed line${skipped===1?"":"s"} ignored — this box only takes rows copied from the results page. Editors can use Quick import below for anything else.</div>`:"")+
    (p.errors.length&&!feedDraft.length?`<div class="previewError">${p.errors.map(esc).join("<br>")}</div>`:"");
}
async function feedSubmit(){
  if(!feedDraft.length) feedPreview();
  const fresh=feedDraft.filter(d=>!d.same);
  if(!fresh.length){ setSyncStatus(feedDraft.length?"Shared results already match the pasted page.":"Nothing to write.",!feedDraft.length); return; }
  const rows=fresh.map(d=>({fixture_id:d.game.id,score_a:Number(d.scoreA),score_b:Number(d.scoreB),updated_at:new Date().toISOString()}));
  $("feedSubmit").disabled=true;
  const {error}=await upsertRows(rows);
  $("feedSubmit").disabled=false;
  if(error){
    const msg=/row-level security|permission|policy|401|403/i.test(error.message)?"Public updates are not switched on yet (Supabase policy). An editor can sign in and use Quick import instead.":error.message;
    setSyncStatus("Update failed: "+msg,true); $("feedPreview").insertAdjacentHTML("beforeend",`<div class="previewError">${esc(msg)}</div>`); return;
  }
  rows.forEach(r=>scores[r.fixture_id]={a:r.score_a,b:r.score_b});
  saveLocal(); lastSync=new Date();
  $("feedInput").value=""; feedDraft=[]; $("feedPreview").classList.add("hidden");
  render();
  await loadSharedScores(false);
  setSyncStatus(`Updated ${rows.length} result${rows.length===1?"":"s"} from ${(T.external&&T.external.name)||"the results page"} — thank you`);
}

/* ---------- bulk import (editors) ---------- */
function buildImportDraft(){
  const p=E.parseBulk(T,scores,$("bulkInput").value);
  importDraft=p.out.map((x,i)=>{
    const existing=E.scoreOf(scores,x.game.id);
    return {id:i,game:x.game,scoreA:x.scoreA,scoreB:x.scoreB,include:true,existingA:existing.a,existingB:existing.b};
  });
  return p;
}
function draftHasConflict(d){ if(d.existingA==null&&d.existingB==null)return false; return d.existingA!==d.scoreA||d.existingB!==d.scoreB; }
function renderImportPreview(errors){
  const box=$("importPreview"); box.classList.remove("hidden");
  if(!importDraft.length){ box.innerHTML="<strong>No recognised results yet.</strong>"+(errors.length?`<div class="previewError">${errors.map(esc).join("<br>")}</div>`:""); return; }
  const rows=importDraft.map(d=>{
    const p=E.participants(T,scores,d.game), conflict=draftHasConflict(d);
    const existing=(d.existingA!=null||d.existingB!=null)?`<div class="previewExisting">Existing: ${d.existingA??"–"}–${d.existingB??"–"}${conflict?" • will overwrite":""}</div>`:`<div class="previewExisting">No existing score • ${esc(d.game.stage==="group"?"Group "+d.game.group:d.game.label)}</div>`;
    return `<tr class="${conflict?"previewConflict":""}">
      <td><input type="checkbox" ${d.include?"checked":""} onchange="toggleDraft(${d.id},this.checked)"></td>
      <td><strong>${esc(p.a.team||p.a.current)}</strong>${existing}</td>
      <td><input type="number" min="0" inputmode="numeric" value="${d.scoreA}" onchange="editDraftScore(${d.id},'A',this.value)"></td>
      <td>–</td>
      <td><input type="number" min="0" inputmode="numeric" value="${d.scoreB}" onchange="editDraftScore(${d.id},'B',this.value)"></td>
      <td><strong>${esc(p.b.team||p.b.current)}</strong></td>
    </tr>`;
  }).join("");
  let h=`<div class="previewOk">${importDraft.length} recognised result${importDraft.length===1?"":"s"}</div>
    <div class="tableWrap"><table class="previewTable"><thead><tr><th>Use</th><th>Team</th><th>Score</th><th></th><th>Score</th><th>Team</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  if(errors.length)h+=`<div class="previewError"><strong>Unrecognised / needs attention:</strong><br>${errors.map(esc).join("<br>")}</div>`;
  box.innerHTML=h;
}
function previewBulk(){ const p=buildImportDraft(); renderImportPreview(p.errors); }
function toggleDraft(id,checked){ const d=importDraft.find(x=>x.id===id); if(d)d.include=checked; }
function editDraftScore(id,side,v){ const d=importDraft.find(x=>x.id===id); if(!d)return; const n=Math.max(0,parseInt(v||0)); if(side==="A")d.scoreA=n; else d.scoreB=n; }
window.toggleDraft=toggleDraft; window.editDraftScore=editDraftScore;
async function applyBulk(){
  if(!currentUser){ alert("Sign in as an editor to apply shared results."); return; }
  if(!importDraft.length){ const p=buildImportDraft(); renderImportPreview(p.errors); if(!importDraft.length)return; }
  const selected=importDraft.filter(x=>x.include);
  if(!selected.length){ alert("No results selected."); return; }
  const rows=selected.map(x=>({fixture_id:x.game.id,score_a:Number(x.scoreA),score_b:Number(x.scoreB),updated_at:new Date().toISOString()}));
  const conflicts=selected.filter(draftHasConflict);
  if(conflicts.length&&!confirm(`${conflicts.length} selected result${conflicts.length===1?"":"s"} will overwrite existing score${conflicts.length===1?"":"s"}. Continue?`))return;
  const {error}=await upsertRows(rows);
  if(error){ setSyncStatus("Bulk import failed: "+error.message,true); return; }
  rows.forEach(r=>scores[r.fixture_id]={a:r.score_a,b:r.score_b});
  saveLocal(); lastSync=new Date();
  setSyncStatus(`Imported ${rows.length} shared result${rows.length===1?"":"s"}`);
  $("bulkInput").value=""; importDraft=[]; $("importPreview").classList.add("hidden");
  render();
}

/* ---------- simple planner (local only) ---------- */
function simplePoolHTML(t){
  return E.sortByTime(E.teamGroupGames(T,t.team)).map(g=>{
    const side=g.a.team===t.team?"a":"b", opp=side==="a"?g.b.team:g.a.team;
    return `<div class="match"><div class="day">${esc(day(g))}</div><div class="time">${esc(g.time)}</div>
      <div><strong>${esc(t.label)} vs ${esc(opp)}</strong>${capsBadge(side)}<div class="meta">${whereLine(g,"arrive by "+arrive(g))}${mapLink(g)}</div></div></div>`;
  }).join("");
}
function simpleOutputHTML(t){
  if(!simple.pos) return "Choose the final group position to see the knockout route.";
  const w=E.walk(T,scores,t.team,{rank:simple.pos,assume:simple.assume});
  let out=`<div><strong>${esc(t.longLabel||t.label)} • ${E.ordinal(simple.pos)} in Group ${E.groupOf(T,t.team)}</strong></div>`;
  w.steps.forEach(s=>{
    out+=stepBlock(s,null);
    out+=`<div class="row noPrint"><label for="sel_${s.game.id}">${esc(s.game.label)} result</label>
      <select id="sel_${s.game.id}" class="inline" onchange="simpleSet('${s.game.id}',this.value)">
        <option value="" ${!s.outcome?"selected":""}>Not played yet</option>
        <option value="win" ${s.outcome==="win"?"selected":""}>Win</option>
        <option value="loss" ${s.outcome==="loss"?"selected":""}>Loss</option>
      </select></div>`;
  });
  const last=w.steps[w.steps.length-1];
  if(last&&!last.outcome) out+=outcomesHTML(last);
  if(w.finalPlacing) out+=`<div class="placingBig">Final placing: ${E.ordinal(w.finalPlacing)}</div>`;
  return out;
}
function simpleSet(gameId,v){
  // clear any assumptions for games later in the path than the one changed
  const t=trackedByKey(simple.team);
  const w=E.walk(T,scores,t.team,{rank:simple.pos,assume:simple.assume});
  const i=w.steps.findIndex(s=>s.game.id===gameId);
  w.steps.slice(i+1).forEach(s=>delete simple.assume[s.game.id]);
  if(v)simple.assume[gameId]=v; else delete simple.assume[gameId];
  saveLocal(); renderSimple();
}
window.simpleSet=simpleSet;
function renderSimple(){
  const t=trackedByKey(simple.team);
  $("simpleTeam").value=t.key; $("simplePos").value=simple.pos||"";
  $("simplePoolSchedule").innerHTML=simplePoolHTML(t);
  $("simpleOutput").innerHTML=simpleOutputHTML(t);
}
function resetSimple(){ simple={team:simple.team,pos:"",assume:{}}; saveLocal(); renderSimple(); }
window.resetSimple=resetSimple;

/* ---------- master render ---------- */
function render(){
  if(!T)return;
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  document.querySelector(".wrap").classList.toggle("wide",view==="BRACKET");
  const isTeam=view.startsWith("T:");
  $("nextCard").classList.toggle("hidden",!(isTeam||view==="ALL"));
  $("teamView").classList.toggle("hidden",!isTeam);
  $("allView").classList.toggle("hidden",view!=="ALL");
  $("resultsView").classList.toggle("hidden",view!=="RESULTS");
  $("bracketView").classList.toggle("hidden",view!=="BRACKET");
  $("simpleView").classList.toggle("hidden",view!=="SIMPLE");
  if(isTeam){ const t=trackedByKey(view.slice(2)); $("nextGame").innerHTML=nextGameHTML([t.key]); renderTeam(t); }
  else if(view==="ALL"){ $("nextGame").innerHTML=nextGameHTML(tracked().map(t=>t.key)); $("allTitle").textContent="All "+commonLabel()+" matches"; $("allTimeline").innerHTML=allHTML(); }
  else if(view==="BRACKET"){ renderBracket(); }
  else if(view==="RESULTS"){ $("allResults").innerHTML=resultsHTML(); $("knockoutResults").innerHTML=knockoutResultsHTML(); $("allTables").innerHTML=allTablesHTML(); }
  else if(view==="SIMPLE"){ renderSimple(); }
}
