/* bracket.js — draws tournament brackets as SVG from the tournament data (no DOM needed).
 *
 * Every knockout game is a node whose two slots either name a team, a group position, or the
 * winner/loser of an earlier game. Following `winner` references backwards from any placing
 * game gives a tree: the final's tree is the championship bracket, the other placing games'
 * trees are the placing brackets. Group positions and `loser` references are the leaves.
 */
(function(root,factory){
  if(typeof module==="object"&&module.exports) module.exports=factory(require("./engine.js"));
  else root.Bracket=factory(root.Engine);
})(typeof self!=="undefined"?self:this,function(E){
"use strict";
const B={};
const BOX_W=212, BOX_H=72, COL_GAP=36, U=86, PAD=10, PAD_TOP=38, ROW=26, HEAD=20, CHIP_W=22, CHIP_H=16;
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const cut=(s,n)=>{ s=String(s); return s.length>n?s.slice(0,n-1)+"…":s; };

// One colour per group, cycled if a tournament has more than eight. Brand blue is kept for the tracked team.
B.palette=[
  {fg:"#9a3412",bg:"#ffedd5"},{fg:"#166534",bg:"#dcfce7"},{fg:"#5b21b6",bg:"#ede9fe"},{fg:"#9f1239",bg:"#ffe4e6"},
  {fg:"#115e59",bg:"#ccfbf1"},{fg:"#075985",bg:"#e0f2fe"},{fg:"#854d0e",bg:"#fef9c3"},{fg:"#334155",bg:"#e2e8f0"}
];
B.groupStyle=function(T,group){ const i=Object.keys(T.groups).indexOf(group); return B.palette[(i<0?7:i)%B.palette.length]; };

B.shortLabel=function(label){
  return String(label||"")
    .replace(/quarter-?final/i,"QF").replace(/semi-?final/i,"SF")
    .replace(/cross-?over play-?off/i,"Cross-over").replace(/placing qualifier/i,"Placing Q")
    .replace(/qualifier/i,"Qualifier").replace(/\s*\(.*?\)\s*/g," ").replace(/\s+/g," ").trim();
};
const ROUND_NAMES={QF:"Quarter-finals",SF:"Semi-finals","Cross-over":"Cross-over play-offs",Qualifier:"Qualifiers","Placing Q":"Placing qualifiers",FINAL:"Final"};
function roundName(labels){
  const names=[...new Set(labels.map(l=>{ const s=B.shortLabel(l).replace(/\s+\d+$/,""); return ROUND_NAMES[s]||s; }))];
  return names.join(" / ");
}

/* ---------- tree construction ---------- */
function child(T,slot){ return slot&&slot.winner?E.gameByNum(T,slot.winner):null; }
function build(T,g,depth){
  const node={g,depth,slots:[child(T,g.a),child(T,g.b)].map(c=>c?build(T,c,depth+1):null)};
  node.units=Math.max(1,node.slots.reduce((u,c)=>u+(c?c.units:0.5),0));
  node.maxDepth=Math.max(depth,...node.slots.filter(Boolean).map(c=>c.maxDepth));
  return node;
}
// assign vertical centres: each node owns a band of units*U starting at y0, children stacked in slot order
function place(node,y0,out){
  let y=y0;
  node.slots.forEach(c=>{ if(c){ place(c,y,out); y+=c.units*U; } else y+=0.5*U; });
  node.y=y0+node.units*U/2;
  out.push(node);
}
B.championship=T=>E.knockoutGames(T).find(g=>g.final||(g.places&&g.places[0]===1))||null;
B.placingGames=T=>E.knockoutGames(T).filter(g=>g.places&&g.places[0]!==1).sort((a,b)=>a.places[0]-b.places[0]);

/* ---------- drawing ---------- */
// What to print on one row: a group chip (letter, colour) or a W/L chip, plus the text.
function rowSpec(T,slot,res){
  if(res.team){
    const grp=E.groupOf(T,res.team), st=grp?B.groupStyle(T,grp):null;
    return {chip:grp||"",chipStyle:st,text:res.team,cls:res.confirmed?"":"projected"};
  }
  if(slot&&slot.group) return {chip:slot.group,chipStyle:B.groupStyle(T,slot.group),text:E.ordinal(slot.rank)+" place",cls:"placeholder"};
  if(slot&&(slot.winner||slot.loser)){
    const ref=E.gameByNum(T,slot.winner||slot.loser);
    if(ref) return {chip:slot.winner?"W":"L",chipStyle:null,text:B.shortLabel(ref.label),cls:"placeholder"};
  }
  return {chip:"",chipStyle:null,text:res.label,cls:"placeholder"};
}
function chipSVG(x,yc,spec){
  if(!spec.chip) return "";
  const st=spec.chipStyle;
  const fill=st?st.bg:"#eef1f5", fg=st?st.fg:"#64748b";
  return `<rect x="${x}" y="${yc-CHIP_H/2}" width="${CHIP_W}" height="${CHIP_H}" rx="4" fill="${fill}"/>`+
         `<text class="bk-chip" x="${x+CHIP_W/2}" y="${yc+3.5}" text-anchor="middle" fill="${fg}">${esc(spec.chip)}</text>`;
}
function boxSVG(T,scores,node,x,ctx){
  const g=node.g, p=E.participants(T,scores,g), r=E.result(T,scores,g);
  const left=x-BOX_W/2, top=node.y-BOX_H/2;
  const mine=ctx.pathIds.has(g.id), isFinal=!!g.final;
  const dayShort=E.dayLabel(T,g.date).split(" ")[0];
  const pool=g.pool?((T.poolShort&&T.poolShort[g.pool])||g.pool):"";
  const header=cut(`${B.shortLabel(g.label)} · ${dayShort} ${g.time}${pool?" · "+pool:""}`,40);
  let h=`<g class="bk-game${mine?" bk-mine":""}${isFinal?" bk-final":""}${r?" bk-played":""}" data-game="${esc(g.id)}">`;
  h+=`<title>${esc(g.label)} — ${esc(E.dayLabel(T,g.date))} ${esc(g.time)}${g.pool?" — "+esc(g.pool):""}</title>`;
  h+=`<rect class="bk-box" x="${left}" y="${top}" width="${BOX_W}" height="${BOX_H}" rx="8"/>`;
  h+=`<text class="bk-head" x="${left+8}" y="${top+14}">${esc(header)}</text>`;
  h+=`<line class="bk-sep" x1="${left}" y1="${top+HEAD}" x2="${left+BOX_W}" y2="${top+HEAD}"/>`;
  ["a","b"].forEach((side,i)=>{
    const res=p[side], spec=rowSpec(T,g[side],res), yc=top+HEAD+ROW*i+ROW/2;
    const won=r&&r.winner===side, lost=r&&r.winner&&r.winner!==side;
    const isMe=ctx.team&&res.team===ctx.team;
    const cls=["bk-row",spec.cls,won?"won":"",lost?"lost":"",isMe?"me":""].filter(Boolean).join(" ");
    if(i===1) h+=`<line class="bk-sep soft" x1="${left+6}" y1="${top+HEAD+ROW}" x2="${left+BOX_W-6}" y2="${top+HEAD+ROW}"/>`;
    h+=chipSVG(left+8,yc,spec);
    const tx=left+8+(spec.chip?CHIP_W+6:0);
    h+=`<text class="${cls}" x="${tx}" y="${yc+4.5}">${esc(cut(spec.text,r?19:24))}</text>`;
    if(r){ const sc=side==="a"?r.a:r.b, pen=r.pens?(side==="a"?r.pens.a:r.pens.b):null; h+=`<text class="bk-score${won?" won":""}" x="${left+BOX_W-8}" y="${yc+4.5}" text-anchor="end">${sc}${pen!=null?` (${pen})`:""}</text>`; }
  });
  h+="</g>";
  return h;
}
function edgeSVG(cx,cy,px,py,mine){
  const midx=(cx+px)/2;
  return `<path class="bk-edge${mine?" bk-mine":""}" d="M${cx} ${cy} H${midx} V${py} H${px}"/>`;
}
function rowY(node,i){ return node.y-BOX_H/2+HEAD+ROW*i+ROW/2; }

// dir=+1: children drawn to the left of the parent (classic left-to-right bracket, root at the right)
// dir=-1: children drawn to the right (mirrored half)
function drawTree(T,scores,node,rootX,dir,ctx){
  const nodes=[]; place(node,ctx.y0,nodes);
  let h="";
  nodes.forEach(n=>{
    n.x=rootX-dir*n.depth*(BOX_W+COL_GAP);
    const col=ctx.cols[n.x]=ctx.cols[n.x]||{labels:[],dates:new Set()};
    col.labels.push(n.g.label); col.dates.add(n.g.date);
  });
  nodes.forEach(n=>{
    n.slots.forEach((c,i)=>{
      if(!c)return;
      const cx=c.x+dir*BOX_W/2, px=n.x-dir*BOX_W/2;
      const mine=ctx.pathIds.has(c.g.id)&&ctx.pathIds.has(n.g.id);
      h+=edgeSVG(cx,c.y,px,rowY(n,i),mine);
    });
  });
  nodes.forEach(n=>{ h+=boxSVG(T,scores,n,n.x,ctx); });
  return h;
}
function ctxFor(T,scores,opts){
  const team=opts&&opts.team||null;
  const pathIds=new Set();
  if(team){ try{ E.walk(T,scores,team).steps.forEach(s=>pathIds.add(s.game.id)); }catch(e){} }
  return {team,pathIds,y0:PAD_TOP,cols:{}};
}
function titlesSVG(T,ctx){
  return Object.entries(ctx.cols).map(([x,col])=>{
    const name=roundName(col.labels);
    const date=col.dates.size===1?E.dayLabel(T,[...col.dates][0]):"";
    return `<text class="bk-round" x="${x}" y="16" text-anchor="middle">${esc(name)}</text>`+
           (date?`<text class="bk-roundDate" x="${x}" y="29" text-anchor="middle">${esc(date)}</text>`:"");
  }).join("");
}
function wrap(w,h,inner){
  return `<svg xmlns="http://www.w3.org/2000/svg" class="bracket" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">${inner}</svg>`;
}

// The championship bracket: final in the middle, one semi-final subtree each side, bronze game underneath.
B.championshipSVG=function(T,scores,opts){
  const final=B.championship(T); if(!final) return "";
  const ctx=ctxFor(T,scores,opts);
  const root=build(T,final,0);
  const [L,R]=root.slots;
  const bronze=E.knockoutGames(T).find(g=>g.places&&g.places[0]===3);
  const depthL=L?L.maxDepth:0, depthR=R?R.maxDepth:0;           // depths measured from the final (depth 0)
  const unitsL=L?L.units:1, unitsR=R?R.units:1, unitsMax=Math.max(unitsL,unitsR);
  const colsL=L?depthL:0, colsR=R?depthR:0;
  const W=PAD*2+(colsL+colsR+1)*BOX_W+(colsL+colsR)*COL_GAP;
  const centreX=PAD+colsL*(BOX_W+COL_GAP)+BOX_W/2;
  const H=PAD_TOP+PAD+unitsMax*U+(bronze?BOX_H+30:0);
  let h="";
  // sub-brackets, each vertically centred
  if(L){ const c=Object.assign({},ctx,{y0:PAD_TOP+(unitsMax-unitsL)*U/2}); L.depth=0; relevel(L,0); h+=drawTree(T,scores,L,centreX-(BOX_W+COL_GAP),+1,c); }
  if(R){ const c=Object.assign({},ctx,{y0:PAD_TOP+(unitsMax-unitsR)*U/2}); R.depth=0; relevel(R,0); h+=drawTree(T,scores,R,centreX+(BOX_W+COL_GAP),-1,c); }
  // the final itself
  ctx.cols[centreX]={labels:[final.label],dates:new Set([final.date])};
  const fnode={g:final,depth:0,slots:[null,null],units:1,y:PAD_TOP+unitsMax*U/2};
  if(L){ h+=edgeSVG(centreX-(BOX_W+COL_GAP)+BOX_W/2,L.y,centreX-BOX_W/2,rowY(fnode,0),ctx.pathIds.has(L.g.id)&&ctx.pathIds.has(final.id)); }
  if(R){ h+=edgeSVG(centreX+(BOX_W+COL_GAP)-BOX_W/2,R.y,centreX+BOX_W/2,rowY(fnode,1),ctx.pathIds.has(R.g.id)&&ctx.pathIds.has(final.id)); }
  h+=boxSVG(T,scores,fnode,centreX,ctx);
  if(bronze){
    const bnode={g:bronze,depth:0,slots:[null,null],units:1,y:PAD_TOP+unitsMax*U+BOX_H/2+14};
    h+=`<text class="bk-caption" x="${centreX}" y="${bnode.y-BOX_H/2-4}" text-anchor="middle">Bronze game</text>`;
    h+=boxSVG(T,scores,bnode,centreX,ctx);
  }
  return wrap(W,H,titlesSVG(T,ctx)+h);
};
function relevel(node,depth){ node.depth=depth; node.slots.forEach(c=>{ if(c)relevel(c,depth+1); }); }

// A placing bracket: classic left-to-right tree ending in the placing game.
B.placingSVG=function(T,scores,game,opts){
  const ctx=ctxFor(T,scores,opts);
  const root=build(T,game,0);
  const cols=root.maxDepth+1;
  const W=PAD*2+cols*BOX_W+(cols-1)*COL_GAP, H=PAD_TOP+PAD+root.units*U;
  const rootX=W-PAD-BOX_W/2;
  const body=drawTree(T,scores,root,rootX,+1,ctx);
  return wrap(W,H,titlesSVG(T,ctx)+body);
};

// Every bracket on the page: championship first, then each placing game in order.
B.all=function(T,scores,opts){
  const out=[];
  const champ=B.championship(T);
  if(champ) out.push({title:champ.label,svg:B.championshipSVG(T,scores,opts),final:true});
  B.placingGames(T).forEach(g=>{
    if(g.places[0]===3) return; // drawn under the final
    out.push({title:g.label,svg:B.placingSVG(T,scores,g,opts)});
  });
  return out;
};

B.css=`
.bracket{display:block;max-width:none}
.bk-box{fill:#fff;stroke:#cfd6e2;stroke-width:1.2}
.bk-played .bk-box{fill:#fafcff}
.bk-mine .bk-box{stroke:#1f3f91;stroke-width:2;fill:#f4f7ff}
.bk-final .bk-box{stroke:#c08a00;stroke-width:2}
.bk-head{font:600 10.5px Inter,system-ui,sans-serif;fill:#687386;letter-spacing:.02em}
.bk-chip{font:800 10px Inter,system-ui,sans-serif;letter-spacing:.02em}
.bk-round{font:800 11px Inter,system-ui,sans-serif;fill:#1f3f91;letter-spacing:.06em;text-transform:uppercase}
.bk-roundDate{font:600 10px Inter,system-ui,sans-serif;fill:#687386}
.bk-sep{stroke:#e5e9f0;stroke-width:1}.bk-sep.soft{stroke:#eef1f5}
.bk-row{font:650 13px Inter,system-ui,sans-serif;fill:#172033}
.bk-row.placeholder{fill:#64748b;font-weight:500}
.bk-row.projected{fill:#334155;font-weight:500}
.bk-row.won{font-weight:800;fill:#0f766e}
.bk-row.lost{fill:#9aa3b5}
.bk-row.me{fill:#1f3f91;font-weight:800}
.bk-score{font:700 12px Inter,system-ui,sans-serif;fill:#687386;font-variant-numeric:tabular-nums}
.bk-score.won{fill:#0f766e}
.bk-edge{fill:none;stroke:#c3cad8;stroke-width:1.6}
.bk-edge.bk-mine{stroke:#1f3f91;stroke-width:2.4}
.bk-caption{font:700 10px Inter,system-ui,sans-serif;fill:#8a5a00;letter-spacing:.08em;text-transform:uppercase}
`;
return B;
});
