// Tournament data: 2026 St Stithians College Water Polo Invitational — Junior Girls' Section
// Source: "2026 Saints Invitational Water Polo Tournament RULES & FIXTURES_GIRLS JUNIOR SECTION
//          Final Version (16x teams)_15 October 2026" (Release Version: 15 OCTOBER 2026)
//
// Slot notation used in `games`:
//   {team:"Name"}            fixed team (group stage)
//   {group:"D", rank:1}      final group position
//   {winner:27} / {loser:27} result of game G#27
//
// Game ids are the Supabase `fixture_id` keys. Keep them stable once results exist.
(function(){
const ID="saints26jg";
const FRI="2026-10-16", SAT="2026-10-17", SUN="2026-10-18";
const MAIN="Main Polo Pool", NORTH="Olympic North", SOUTH="Olympic South";

function grp(n,date,time,pool,group,a,b){
  return {n,id:ID+"_G"+String(n).padStart(2,"0"),date,time,pool,stage:"group",group,a:{team:a},b:{team:b}};
}
function ko(n,date,time,pool,label,a,b,extra){
  return Object.assign({n,id:ID+"_G"+String(n).padStart(2,"0"),date,time,pool,stage:"knockout",label,a,b},extra||{});
}
const G=(group,rank)=>({group,rank});
const W=(n)=>({winner:n});
const L=(n)=>({loser:n});

window.TOURNAMENT={
  id:"saints-invitational-2026-junior-girls",
  shortId:ID,
  name:"Saints Invitational 2026",
  section:"Junior Girls' Section",
  venue:"St Stithians College, Sandton",
  address:"40 Peter Place, Sandton, Gauteng, 2191",
  dates:"Fri 16 – Sun 18 October 2026",
  pdf:"Saints-Invitational-2026-Junior-Girls.pdf",
  // Official results feed on MyComLink (event 12099). Fixture pages are fixture.php?i=<83377 + game number>,
  // verified against all 52 fixtures on 15 Oct 2026. Rows copied from the results list look like
  //   "Herschel 13A	9	-	15	St Mary's Waverley 13A"   — the importer understands that shape.
  external:{
    name:"MyComLink",
    fixtures:"https://www.mycomlink.co.za/fixture_list.php?eid=12099&dlim=~",
    results:"https://www.mycomlink.co.za/result_list.php?eid=12099&dlim=~",
    teamFixtures:"https://www.mycomlink.co.za/fixture_list.php?eid=12099&org=261&agrp=34&dlim=~",
    venue:"https://www.mycomlink.co.za/facility.php?i=10077",
    game:n=>"https://www.mycomlink.co.za/fixture.php?i="+(83377+n),
    suffix:" 13A"
  },
  pdfVersion:"Release version 15 October 2026",
  pageTitle:"Herschel – Saints Invitational 2026",
  logos:{
    tournament:{src:"assets/saints-invitational-logo.png",alt:"Saints Water Polo Invitational",onLight:true},
    team:{src:"assets/herschel-icon-white.svg",alt:"Herschel Girls' School",mark:"assets/herschel-icon.svg"}
  },
  heroTitle:"Herschel Girls' Prep",
  arriveMinutes:30,
  // Side a / side b of every game in the fixtures list = blue caps / white caps
  caps:{a:"Blue caps",b:"White caps"},
  points:{win:2,draw:1,loss:0},
  tiebreak:"wa",
  format:"4 × 5 min quarters, stop-start. Size 3 ball. Short-course pool.",
  poolShort:{[MAIN]:"Main pool",[NORTH]:"Oly North",[SOUTH]:"Oly South"},
  // Pool pins from MyComLink's facility pages (15 Oct 2026). Olympic North and South share one pin.
  pools:{
    [MAIN]: {lat:-26.086108,lng:28.012861,mycomlink:"https://www.mycomlink.co.za/facility.php?i=10074"},
    [NORTH]:{lat:-26.085741,lng:28.012824,mycomlink:"https://www.mycomlink.co.za/facility.php?i=10077"},
    [SOUTH]:{lat:-26.085741,lng:28.012824,mycomlink:"https://www.mycomlink.co.za/facility.php?i=10076"},
    "Prep pool (warm-up)":{lat:-26.086505,lng:28.013107,mycomlink:"https://www.mycomlink.co.za/facility.php?i=10078"}
  },
  venueMap:{lat:-26.086108,lng:28.012861,label:"St Stithians Aquatic Centre"},
  tracked:[{key:"H",team:"Herschel",label:"Herschel",longLabel:"Herschel Girls' Preparatory"}],

  teams:{
    "Chisipite":{full:"Chisipite Junior School",from:"Zimbabwe"},
    "Durban Girls' College":{full:"Durban Girls' College (Senior Primary)",from:"Durban"},
    "DSG Kloof":{full:"St. Mary's DSG Kloof Preparatory",from:"KZN"},
    "Stingray":{full:"Stingray Water Polo Academy (Girls)",from:"Johannesburg"},
    "Hellenic":{full:"Hellenic Academy Primary (Girls)",from:"Zimbabwe"},
    "Kingsmead":{full:"Kingsmead College Junior",from:"Johannesburg"},
    "Roedean":{full:"Roedean School (SA) Junior",from:"Johannesburg"},
    "Umhlali":{full:"Umhlali Preparatory",from:"Ballito"},
    "Chelsea Prep":{full:"Chelsea Preparatory (Girls)",from:"Durban"},
    "Falcon College":{full:"Falcon College Junior (Girls)",from:"Zimbabwe"},
    "Reddam Bedfordview":{full:"Reddam House Bedfordview",from:"Johannesburg"},
    "Wynberg Girls":{full:"Wynberg Girls Junior School",from:"Cape Town"},
    "Herschel":{full:"Herschel Girls' Preparatory",from:"Cape Town"},
    "Our Lady of Fatima":{full:"Our Lady of Fatima Dominican Convent School",from:"Durban"},
    "St Dominic's":{full:"St Dominic's Catholic School For Girls Junior",from:"Boksburg"},
    "St Mary's Waverley":{full:"St Mary's School (Waverley) Preparatory",from:"Johannesburg"}
  },

  // Extra names the bulk importer should recognise (normalised: lowercase, alphanumerics only)
  aliases:{
    "chisipite junior school":"Chisipite",
    "dgc":"Durban Girls' College","durban girls college":"Durban Girls' College","durban girls":"Durban Girls' College",
    "st marys dsg kloof":"DSG Kloof","st mary s dsg kloof":"DSG Kloof","dsg":"DSG Kloof","kloof":"DSG Kloof","st marys dsg":"DSG Kloof",
    "stingray water polo academy":"Stingray","stingrays":"Stingray",
    "hellenic academy":"Hellenic",
    "kingsmead college":"Kingsmead",
    "roedean school":"Roedean",
    "umhlali prep":"Umhlali","umhlali preparatory":"Umhlali",
    "chelsea":"Chelsea Prep","chelsea preparatory":"Chelsea Prep",
    "falcon":"Falcon College","falcon college junior":"Falcon College",
    "reddam":"Reddam Bedfordview","reddam house bedfordview":"Reddam Bedfordview","reddam house":"Reddam Bedfordview",
    "wynberg":"Wynberg Girls","wgjs":"Wynberg Girls","wynberg girls junior":"Wynberg Girls",
    "herschel girls prep":"Herschel","herschel prep":"Herschel","herschel girls preparatory":"Herschel","herschel girls":"Herschel",
    "olf":"Our Lady of Fatima","fatima":"Our Lady of Fatima","our lady of fatima dominican convent":"Our Lady of Fatima",
    "st dominics":"St Dominic's","st dominic s":"St Dominic's","dominics":"St Dominic's",
    "st marys waverley":"St Mary's Waverley","st mary s waverley":"St Mary's Waverley","waverley":"St Mary's Waverley","st marys":"St Mary's Waverley",
    // MyComLink's short names
    "stingray academy":"Stingray","durban girls":"Durban Girls' College","st mary s dsg":"DSG Kloof","umhlali ballito":"Umhlali",
    "hellenic academy":"Hellenic","chelsea":"Chelsea Prep","wynberg girls":"Wynberg Girls"
  },

  groups:{
    A:["Chisipite","Durban Girls' College","DSG Kloof","Stingray"],
    B:["Hellenic","Kingsmead","Roedean","Umhlali"],
    C:["Chelsea Prep","Falcon College","Reddam Bedfordview","Wynberg Girls"],
    D:["Herschel","Our Lady of Fatima","St Dominic's","St Mary's Waverley"]
  },

  days:{[FRI]:"Fri 16 Oct",[SAT]:"Sat 17 Oct",[SUN]:"Sun 18 Oct"},

  games:[
    // ---------------- Friday 16 October — round-robin group stage ----------------
    grp(1, FRI,"08:50",MAIN, "A","Stingray","Durban Girls' College"),
    grp(2, FRI,"09:30",SOUTH,"B","Umhlali","Roedean"),
    grp(3, FRI,"09:30",MAIN, "C","Wynberg Girls","Falcon College"),
    grp(4, FRI,"09:30",NORTH,"D","Herschel","St Mary's Waverley"),
    grp(5, FRI,"10:10",SOUTH,"A","DSG Kloof","Chisipite"),
    grp(6, FRI,"10:10",NORTH,"B","Kingsmead","Hellenic"),
    grp(7, FRI,"10:10",MAIN, "C","Chelsea Prep","Reddam Bedfordview"),
    grp(8, FRI,"10:50",NORTH,"D","Our Lady of Fatima","St Dominic's"),
    grp(9, FRI,"12:50",MAIN, "A","Stingray","Chisipite"),
    grp(10,FRI,"12:50",NORTH,"B","Umhlali","Hellenic"),
    grp(11,FRI,"12:50",SOUTH,"C","Wynberg Girls","Reddam Bedfordview"),
    grp(12,FRI,"13:30",MAIN, "D","Herschel","St Dominic's"),
    grp(13,FRI,"13:30",NORTH,"A","DSG Kloof","Durban Girls' College"),
    grp(14,FRI,"13:30",SOUTH,"B","Kingsmead","Roedean"),
    grp(15,FRI,"14:10",SOUTH,"C","Chelsea Prep","Falcon College"),
    grp(16,FRI,"14:10",NORTH,"D","Our Lady of Fatima","St Mary's Waverley"),
    grp(17,FRI,"16:10",MAIN, "A","Stingray","DSG Kloof"),
    grp(18,FRI,"16:10",SOUTH,"B","Umhlali","Kingsmead"),
    grp(19,FRI,"16:50",NORTH,"C","Wynberg Girls","Chelsea Prep"),
    grp(20,FRI,"16:50",MAIN, "D","Herschel","Our Lady of Fatima"),
    grp(21,FRI,"16:50",SOUTH,"A","Durban Girls' College","Chisipite"),
    grp(22,FRI,"17:30",MAIN, "B","Roedean","Hellenic"),
    grp(23,FRI,"17:30",NORTH,"C","Falcon College","Reddam Bedfordview"),
    grp(24,FRI,"17:30",SOUTH,"D","St Mary's Waverley","St Dominic's"),

    // ---------------- Saturday 17 October — progression games ----------------
    ko(25,SAT,"08:15",MAIN, "Cross-over play-off 1",G("A",2),G("B",3)),
    ko(26,SAT,"08:15",NORTH,"Cross-over play-off 2",G("C",2),G("D",3)),
    ko(27,SAT,"09:00",SOUTH,"Cross-over play-off 3",G("A",3),G("B",2)),
    ko(28,SAT,"09:00",NORTH,"Cross-over play-off 4",G("C",3),G("D",2)),
    ko(29,SAT,"10:30",MAIN, "Qualifier 1",G("C",4),L(25)),
    ko(30,SAT,"10:30",NORTH,"Qualifier 2",G("A",4),L(26)),
    ko(31,SAT,"10:30",SOUTH,"Qualifier 3",G("D",4),L(27)),
    ko(32,SAT,"11:15",SOUTH,"Qualifier 4",G("B",4),L(28)),
    ko(33,SAT,"12:00",MAIN, "Quarter-final 1",G("A",1),W(26)),
    ko(34,SAT,"12:45",SOUTH,"Quarter-final 2",G("B",1),W(28)),
    ko(35,SAT,"12:45",MAIN, "Quarter-final 3",W(25),G("C",1)),
    ko(36,SAT,"12:45",NORTH,"Quarter-final 4",W(27),G("D",1)),
    ko(37,SAT,"13:30",MAIN, "Placing qualifier 1",L(29),L(30)),
    ko(38,SAT,"14:15",SOUTH,"Placing qualifier 2",L(31),L(32)),
    ko(39,SAT,"15:00",SOUTH,"Placing qualifier 3",W(29),W(30)),
    ko(40,SAT,"15:00",NORTH,"Placing qualifier 4",W(31),W(32)),
    ko(41,SAT,"16:30",SOUTH,"Placing qualifier 5",L(33),L(34)),
    ko(42,SAT,"16:30",NORTH,"Placing qualifier 6",L(35),L(36)),
    ko(43,SAT,"16:30",MAIN, "Semi-final 1",W(33),W(34)),
    ko(44,SAT,"17:15",MAIN, "Semi-final 2",W(35),W(36)),

    // ---------------- Sunday 18 October — final placings ----------------
    ko(45,SUN,"07:15",MAIN, "15th / 16th place",L(37),L(38),{places:[15,16]}),
    ko(46,SUN,"08:45",SOUTH,"13th / 14th place",W(37),W(38),{places:[13,14]}),
    ko(47,SUN,"08:45",NORTH,"11th / 12th place",L(39),L(40),{places:[11,12]}),
    ko(48,SUN,"08:45",MAIN, "9th / 10th place",W(39),W(40),{places:[9,10]}),
    ko(49,SUN,"10:15",SOUTH,"7th / 8th place",L(41),L(42),{places:[7,8]}),
    ko(50,SUN,"10:15",NORTH,"5th / 6th place",W(41),W(42),{places:[5,6]}),
    ko(51,SUN,"10:15",MAIN, "3rd / 4th place (bronze)",L(43),L(44),{places:[3,4]}),
    ko(52,SUN,"12:15",MAIN, "FINAL (1st / 2nd)",W(43),W(44),{places:[1,2],final:true})
  ],

  events:[
    {date:FRI,time:"07:00",label:"Opening welcome"},
    {date:FRI,time:"18:00",label:"Herschel U13 parents' dinner",highlight:true,
     detail:"The Higher Ground Restaurant, 40 Peter Place (on the St Stithians grounds). Table booked for the parents who said yes on the WhatsApp group.",
     map:{lat:-26.0812255,lng:28.0105384,label:"The Higher Ground Restaurant"}},
    {date:FRI,time:"18:10",label:"Day end (weather buffer until 21:00)"},
    {date:SAT,time:"18:00",label:"Day end (weather buffer until 21:00)"},
    {date:SUN,time:"12:15",label:"Introduction of girls' finalists, then the FINAL"},
    {date:SUN,time:"13:15",label:"Presentations and closing ceremony",detail:"Aquatic Centre complex"},
    {date:SUN,time:"14:30",label:"Tournament ends"}
  ],

  notes:[
    "Group stage: 2 points for a win, 1 for a draw, 0 for a loss. Drawn group games stand (no shoot-out).",
    "Group ties are broken in isolation under the World Aquatics rules: points, goal difference and goals scored in the games between the tied teams, then overall goal difference and goals scored. The page flags any position it cannot settle from the entered scores as provisional — the Tournament Directors have the final say.",
    "All progression and placing games are decided on the day: a draw goes straight to a penalty shoot-out (3 per team then sudden death; 5 per team in the semi-finals and medal games). Enter the shoot-out score below the match score so the bracket can advance.",
    "Teams in white caps start on the left of the officials' table. Warm-up in the 25 m Preparatory pool (the 'bottom' pool).",
    "Games may be rescheduled for lightning; play can continue until 21:00. In the event of a team not arriving the programme continues unchanged.",
    "Max 14 players; goalkeepers in red caps #1 or #13. One time-out per team in progression games, two in semi-finals and medal games, none in group or placing games."
  ]
};
})();
