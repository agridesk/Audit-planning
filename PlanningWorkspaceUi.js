/***********************************************************************
 * PlanningWorkspaceUi.js
 * BUILD: 2026-09-11_AMS01_2_PLANNING_WORKSPACE_UI_R3_ADVISORY_SEED_ONLY
 *
 * PERFORMANCE
 * - DEV route seeds only the default-period advisory in the doGet render.
 * - Availability + Concept overlays are deliberately excluded from server
 *   render so they cannot block first HTML delivery / first usable paint.
 * - Browser loads overlays separately after the seeded advisory is painted.
 * - No new cache, no writes, no new source of truth.
 ***********************************************************************/
var PLANNING_WORKSPACE_UI_RENDERER_BUILD='2026-09-11_AMS01_2_PLANNING_WORKSPACE_UI_R3_ADVISORY_SEED_ONLY';

function PWUI_isoDate_(d,tz){return Utilities.formatDate(d,tz,'yyyy-MM-dd');}
function PWUI_defaultPeriod_(){
  var ss=SpreadsheetApp.getActive();
  var tz=(ss&&ss.getSpreadsheetTimeZone&&ss.getSpreadsheetTimeZone())||Session.getScriptTimeZone()||'Europe/Amsterdam';
  var now=new Date();
  var y=Number(Utilities.formatDate(now,tz,'yyyy'));
  var m=Number(Utilities.formatDate(now,tz,'M'))-1;
  var from=new Date(y,m,1,12,0,0,0);
  var to=new Date(y,m+4,0,12,0,0,0);
  return{from:PWUI_isoDate_(from,tz),to:PWUI_isoDate_(to,tz),timezone:tz};
}
function PWUI_candidateEmails_(advisory){
  var rows=advisory&&Array.isArray(advisory.rows)?advisory.rows:[],out=[],seen={};
  for(var i=0;i<rows.length;i++){
    var c=rows[i]&&Array.isArray(rows[i].candidateAuditors)?rows[i].candidateAuditors:[];
    for(var j=0;j<c.length;j++){
      var e=String(c[j]&&c[j].email||'').trim().toLowerCase();
      if(e&&!seen[e]){seen[e]=1;out.push(e);}
    }
  }
  return out;
}
function PWUI_seed_(ctx){
  var period=PWUI_defaultPeriod_(),started=Date.now();
  try{
    var advisory=PlanningWorkspaceService_getAdvisory({from:period.from,to:period.to});
    var emails=PWUI_candidateEmails_(advisory);
    return{ok:true,period:period,data:{advisory:advisory,overlays:null},meta:{serverSeed:true,advisorySeedOnly:true,overlaysDeferred:true,readOnly:true,candidateAuditors:emails.length,serverSeedMs:Date.now()-started,env:String(ctx&&ctx.env||'DEV')}};
  }catch(e){
    return{ok:false,period:period,data:null,error:{message:String(e&&e.message||e)},meta:{serverSeed:true,advisorySeedOnly:true,overlaysDeferred:true,readOnly:true,serverSeedMs:Date.now()-started,env:String(ctx&&ctx.env||'DEV')}};
  }
}
function PlanningWorkspaceUi_render(ctx){
  ctx=ctx||{};
  var t=HtmlService.createTemplateFromFile('PlanningWorkspace');
  var seed=PWUI_seed_(ctx);
  t.__seedJson=JSON.stringify(seed).replace(/<\//g,'<\\/');
  t.__seedFrom=seed&&seed.period?seed.period.from:'';
  t.__seedTo=seed&&seed.period?seed.period.to:'';
  return t.evaluate().setTitle('AMS - Planning Workspace');
}
function PlanningWorkspaceUi_contract(){return{
  build:PLANNING_WORKSPACE_UI_RENDERER_BUILD,
  template:'PlanningWorkspace',
  clientInclude:'PlanningWorkspaceClient.js',
  evaluatedTemplate:true,
  serverSeed:true,
  advisorySeedOnly:true,
  overlaysDeferred:true,
  seedReadOnly:true,
  directSheetReads:false,
  directSheetWrites:false,
  newSsot:false
};}
