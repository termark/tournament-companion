#!/usr/bin/env node
/* Exercises the two parts of supabase/functions/fetch-results that don't need Supabase:
 * loading engine.js + the data file the way the function does (new Function with a fake window),
 * and turning a MyComLink results-page table into the tab-separated rows the parser expects. */
const fs=require("fs"), path=require("path");
const root=path.resolve(__dirname,"..");
let fails=0, n=0, by6; const ok=(c,m)=>{n++; if(!c){fails++; console.log("  FAIL: "+m);} };

function loadWindowScript(p){ const win={}; new Function("window","self","module",fs.readFileSync(path.join(root,p),"utf8"))(win,win,undefined); return win; }
const E=loadWindowScript("js/engine.js").Engine;
const T=loadWindowScript("tournaments/saints-invitational-2026-junior-girls.js").TOURNAMENT;
ok(E&&typeof E.parseBulk==="function","engine loads through new Function");
ok(T&&T.games.length===52,"data file loads through new Function");

// same function as in index.ts (kept in sync by hand; it is 8 lines)
function htmlToRows(html){
  const cell=s=>s.replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&#39;|&rsquo;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g," ").trim();
  const rows=[];
  for(const tr of html.match(/<tr[\s\S]*?<\/tr>/gi)??[]){
    const cells=(tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi)??[]).map(cell).filter(c=>c!=="");
    if(cells.length) rows.push(cells.join("\t"));
  }
  return rows.join("\n");
}
// A results page in MyComLink's table shape (as observed 15 Oct 2026): a header row per fixture, then the score row.
const html=`<html><body><h1>Team Sport Results</h1><table>
<tr><td colspan="5"><b>Fri, 16-Oct-2026 :: Water Polo</b></td></tr>
<tr><td>09:30</td><td>Group D :: Saints Olympic North</td><td></td><td></td><td><a href="result.php?i=1">details</a></td></tr>
<tr><td>Herschel 13A</td><td>9</td><td>-</td><td>15</td><td>St Mary&#39;s Waverley 13A</td></tr>
<tr><td>09:30</td><td>Group B :: Saints Olympic South</td><td></td><td></td><td><a href="#">details</a></td></tr>
<tr><td>Umhlali Ballito 13A</td><td>4</td><td>-</td><td>4</td><td>Roedean 13A</td></tr>
<tr><td>08:50</td><td>Group A :: Saints Polo Pool</td><td></td><td></td><td><a href="#">details</a></td></tr>
<tr><td>Stingray Academy 13A</td><td>Win</td><td>-</td><td>Forfeit</td><td>Durban Girls&#39; 13A</td></tr>
<tr><td>09:30</td><td>Group B :: Saints Olympic South</td><td></td><td></td><td><a href="#">details</a></td></tr>
<tr><td>Kingsmead 13A</td><td>5 (2)</td><td>-</td><td>5 (3)</td><td>Hellenic Academy 13A</td></tr>
</table><p>Home About Results</p></body></html>`;
const text=htmlToRows(html);
ok(/Herschel 13A\t9\t-\t15\tSt Mary's Waverley 13A/.test(text),"html → tab row (entities decoded)");
const p=E.parseBulk(T,{},text);
ok(p.out.length===4,"four results parsed from the html ("+p.out.length+")");
ok(by6=p.out.find(x=>x.game.n===6),"shoot-out row (5 (2) - 5 (3)) parsed");
ok(by6&&by6.scoreA===5&&by6.scoreB===5&&by6.pens&&by6.pens.a===2&&by6.pens.b===3&&by6.feedRow,"shoot-out row: 5-5, pens 2-3, feed row");
ok(p.out.every(x=>x.feedRow),"all tagged as feed rows");
const by={}; p.out.forEach(x=>by[x.game.n]=x);
ok(by[4]&&by[4].scoreA===9&&by[4].scoreB===15,"G4 9-15");
ok(by[2]&&by[2].scoreA===4&&by[2].scoreB===4,"G2 4-4");
ok(by[1]&&by[1].scoreA===1&&by[1].scoreB===0,"G1 forfeit");
ok(p.errors.length===0,"no parse errors: "+p.errors.join(" | "));
// the function's index.ts contains the same htmlToRows
const ts=fs.readFileSync(path.join(root,"supabase/functions/fetch-results/index.ts"),"utf8");
ok(ts.includes("function htmlToRows")&&ts.includes("x.feedRow")&&ts.includes('"_pen"'),"index.ts carries htmlToRows, the feed-row filter and pens writes");
console.log(fails?fails+" failure(s)":"all "+n+" fetch-results checks passed");
process.exit(fails?1:0);
