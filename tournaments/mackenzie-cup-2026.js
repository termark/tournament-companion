// Tournament data: Mackenzie Cup 2026 — U13 Girls (Reddam House Constantia, 11–13 September 2026)
// Source: "Mackenzie Cup Correspondence 2026" PDF (Mackenzie-Cup-2026.pdf).
//
// Group-game ids are kept exactly as the original single-page app wrote them
// ("<group>_<date>_<HHMM>") so the results already stored in Supabase keep showing.
(function(){
const FRI="2026-09-11", SAT="2026-09-12", SUN="2026-09-13";
const OUT="Outdoor Pool", IN="Indoor Pool";
let n=0;
function grp(date,time,pool,group,a,b){
  n++; return {n,id:group+"_"+date+"_"+time.replace(":",""),date,time,pool,stage:"group",group,a:{team:a},b:{team:b}};
}
function ko(date,time,pool,section,label,a,b,extra){
  n++; return Object.assign({n,id:"mc26_"+label.replace(/[^A-Za-z0-9]+/g,""),date,time,pool,stage:"knockout",section,label,a,b},extra||{});
}
const G=(group,rank)=>({group,rank});
const W=(x)=>({winner:x});
const L=(x)=>({loser:x});

window.TOURNAMENT={
  id:"mackenzie-cup-2026",
  shortId:"mc26",
  name:"Mackenzie Cup 2026",
  section:"U13 Girls",
  venue:"Reddam House Constantia",
  address:"Reddam Aquatic Centre, Constantia, Cape Town",
  dates:"Fri 11 – Sun 13 September 2026",
  pdf:"Mackenzie-Cup-2026.pdf",
  pdfVersion:"Mackenzie Cup Correspondence 2026",
  pageTitle:"Herschel U13 – Mackenzie Cup 2026",
  heroTitle:"Herschel U13",
  arriveMinutes:30,
  caps:{a:"White caps",b:"Blue caps"},
  points:{win:3,draw:1,loss:0},
  tiebreak:"simple",
  format:"4 × 5 min quarters running time (final: stop-start).",
  tracked:[
    {key:"A",team:"Herschel A",label:"Herschel A",longLabel:"Herschel U13A"},
    {key:"B",team:"Herschel B",label:"Herschel B",longLabel:"Herschel U13B"}
  ],
  teams:{},
  aliases:{
    "herschel u13a":"Herschel A","herschel u13b":"Herschel B",
    "reddam a":"Reddam Constantia A","reddam b":"Reddam Constantia B",
    "rustenburg":"Rustenburg Girls Junior","bridge house":"Bridge House Prep","oakhill":"Oakhill Prep",
    "st cyps b":"St Cyprians B","st cyps a":"St Cyprians A","sun valley":"Sun Valley Primary"
  },
  groups:{
    A:["Oakhill Prep","St Cyprians B","Herschel A","Springfield"],
    B:["Rhenish","Somerset College","Reddam Constantia B","St Cyprians A"],
    C:["Reddam Constantia A","Rustenburg Girls Junior","Oakhurst","Glenwood House"],
    D:["WGJS","Herschel B","Bridge House Prep","Sun Valley Primary"]
  },
  days:{[FRI]:"Fri 11 Sep",[SAT]:"Sat 12 Sep",[SUN]:"Sun 13 Sep"},
  games:[
    // Friday — all U13 games in the outdoor pool
    grp(FRI,"14:00",OUT,"A","Oakhill Prep","Springfield"),
    grp(FRI,"14:30",OUT,"B","Rhenish","St Cyprians A"),
    grp(FRI,"15:00",OUT,"C","Reddam Constantia A","Glenwood House"),
    grp(FRI,"15:30",OUT,"D","WGJS","Sun Valley Primary"),
    grp(FRI,"16:00",OUT,"A","St Cyprians B","Herschel A"),
    grp(FRI,"16:30",OUT,"B","Somerset College","Reddam Constantia B"),
    grp(FRI,"17:00",OUT,"C","Rustenburg Girls Junior","Oakhurst"),
    grp(FRI,"17:30",OUT,"D","Herschel B","Bridge House Prep"),
    grp(FRI,"18:00",OUT,"A","Springfield","Herschel A"),
    grp(FRI,"18:30",OUT,"B","St Cyprians A","Reddam Constantia B"),
    grp(FRI,"19:00",OUT,"C","Glenwood House","Oakhurst"),
    grp(FRI,"19:30",OUT,"D","Sun Valley Primary","Bridge House Prep"),
    // Saturday
    grp(SAT,"08:00",IN, "D","Herschel B","Sun Valley Primary"),
    grp(SAT,"08:30",IN, "C","Rustenburg Girls Junior","Glenwood House"),
    grp(SAT,"08:00",OUT,"A","Oakhill Prep","St Cyprians B"),
    grp(SAT,"08:30",OUT,"B","Rhenish","Somerset College"),
    grp(SAT,"09:00",OUT,"C","Reddam Constantia A","Rustenburg Girls Junior"),
    grp(SAT,"09:30",OUT,"D","WGJS","Herschel B"),
    grp(SAT,"10:00",OUT,"A","St Cyprians B","Springfield"),
    grp(SAT,"10:30",OUT,"B","Somerset College","St Cyprians A"),
    grp(SAT,"11:00",OUT,"C","Oakhurst","Reddam Constantia A"),
    grp(SAT,"11:30",OUT,"D","Bridge House Prep","WGJS"),
    grp(SAT,"12:00",OUT,"A","Herschel A","Oakhill Prep"),
    grp(SAT,"12:30",OUT,"B","Reddam Constantia B","Rhenish"),
    // Saturday knockouts (n = 25..36)
    ko(SAT,"13:30",OUT,"Bowl","Bowl QF1",G("C",3),G("A",4)),      // 25
    ko(SAT,"14:00",OUT,"Bowl","Bowl QF2",G("D",3),G("B",4)),      // 26
    ko(SAT,"14:30",OUT,"Bowl","Bowl QF3",G("A",3),G("C",4)),      // 27
    ko(SAT,"15:00",OUT,"Bowl","Bowl QF4",G("B",3),G("D",4)),      // 28
    ko(SAT,"15:30",OUT,"Cup","Cup QF1",G("C",1),G("A",2)),        // 29
    ko(SAT,"16:00",OUT,"Cup","Cup QF2",G("D",1),G("B",2)),        // 30
    ko(SAT,"16:30",OUT,"Cup","Cup QF3",G("A",1),G("C",2)),        // 31
    ko(SAT,"17:00",OUT,"Cup","Cup QF4",G("B",1),G("D",2)),        // 32
    ko(SAT,"17:30",OUT,"Bowl","Bowl SF1",W(25),W(26)),            // 33
    ko(SAT,"18:00",OUT,"Bowl","Bowl SF2",W(27),W(28)),            // 34
    ko(SAT,"18:30",OUT,"Shield","Shield SF1",L(25),L(26)),        // 35
    ko(SAT,"19:00",OUT,"Shield","Shield SF2",L(27),L(28)),        // 36
    // Sunday (n = 37..48)
    ko(SUN,"08:00",null,"Cup","Cup SF1",W(29),W(30)),             // 37
    ko(SUN,"08:30",null,"Cup","Cup SF2",W(31),W(32)),             // 38
    ko(SUN,"09:00",null,"Plate","Plate SF1",L(29),L(30)),         // 39
    ko(SUN,"09:30",null,"Plate","Plate SF2",L(31),L(32)),         // 40
    ko(SUN,"10:00",null,"Cup","Cup 3rd/4th",L(37),L(38),{places:[3,4]}),         // 41
    ko(SUN,"10:30",null,"Shield","Shield 3rd/4th",L(35),L(36),{places:[15,16]}), // 42
    ko(SUN,"11:00",null,"Bowl","Bowl 3rd/4th",L(33),L(34),{places:[11,12]}),     // 43
    ko(SUN,"11:30",null,"Plate","Plate 3rd/4th",L(39),L(40),{places:[7,8]}),     // 44
    ko(SUN,"12:00",null,"Shield","Shield Final",W(35),W(36),{places:[13,14]}),   // 45
    ko(SUN,"12:30",null,"Bowl","Bowl Final",W(33),W(34),{places:[9,10]}),        // 46
    ko(SUN,"13:00",null,"Plate","Plate Final",W(39),W(40),{places:[5,6]}),       // 47
    ko(SUN,"13:20",null,"Cup","Cup Final",W(37),W(38),{places:[1,2],final:true}) // 48
  ],
  events:[
    {date:FRI,time:"14:00",label:"U13 games begin"},
    {date:SAT,time:"12:00",label:"Lunch collection (until 14:00)",detail:"Flava Café"},
    {date:SUN,time:"13:20",label:"U13 Girls Final"},
    {date:SUN,time:"15:20",label:"Prize giving",detail:"Dress code: summer uniform and blazers"},
    {date:SUN,time:"15:30",label:"Tournament ends"}
  ],
  notes:[
    "U13 scoring: 3 points for a win, 1 for a draw, 0 for a loss. The official tie-break order is head-to-head, then winner against the top team, then goal difference. Where a tie cannot be resolved safely from the entered data, this page marks the positions as provisional rather than inventing an order.",
    "After the pool stage teams split into Cup and Bowl; all teams then play Cup, Plate, Bowl or Shield games down to final placings.",
    "Be at the pool at least 30 minutes before each game and ready to play as soon as the previous game ends."
  ]
};
})();
