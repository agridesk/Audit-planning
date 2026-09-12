/***********************************************************************
 * WorkspacePlannerAttentionDiagnostic.js
 * BUILD: 2026-09-12_WORKSPACE_PLANNER_ATTENTION_DIAG_R1
 * Read-only diagnostic for planner-attention ordering versus Tracecert demand.
 ***********************************************************************/
var WORKSPACE_PLANNER_ATTENTION_DIAG_BUILD='2026-09-12_WORKSPACE_PLANNER_ATTENTION_DIAG_R1';
function WPAD_clean_(v){return String(v==null?'':v).trim();}
function WPAD_hasTracecert_(scopes){for(var i=0;i<(scopes||[]).length;i++){var s=WPAD_clean_(scopes[i]).toLowerCase().replace(/[^a-z0-9]/g,'');if(s==='florimarktracecert'||s==='florimarktracecet'||s==='florimarktf'||s==='tracecert')return true;}return false;}
function RUN_WORKSPACE_PLANNER_ATTENTION_DIAGNOSTIC(){
  var advisory=ConceptPlanningService_get({from:'2026-09-01',to:'2026-12-31',limit:500,maxCandidates:20});
  var rows=(advisory&&advisory.rows||[]).slice();
  rows.sort(function(a,b){var at=WPAD_clean_(a&&a.planningWindowTo)||'9999-99-99',bt=WPAD_clean_(b&&b.planningWindowTo)||'9999-99-99';if(at!==bt)return at.localeCompare(bt);var ar=a&&a.advisoryState==='READY'?1:0,br=b&&b.advisoryState==='READY'?1:0;if(ar!==br)return ar-br;return WPAD_clean_(a&&a.company).localeCompare(WPAD_clean_(b&&b.company));});
  var trace=rows.filter(function(r){return WPAD_hasTracecert_(r&&r.scopes);}).map(function(r){return{company:r.company,planningWindowFrom:r.planningWindowFrom,planningWindowTo:r.planningWindowTo,urgency:r.urgency,advisoryState:r.advisoryState,scopes:r.scopes,hoursToPlan:r.hoursToPlan};});
  var top=rows.slice(0,12).map(function(r){return{company:r.company,planningWindowFrom:r.planningWindowFrom,planningWindowTo:r.planningWindowTo,urgency:r.urgency,advisoryState:r.advisoryState,scopes:r.scopes,hoursToPlan:r.hoursToPlan};});
  var out={ok:true,build:WORKSPACE_PLANNER_ATTENTION_DIAG_BUILD,total:rows.length,top12:top,tracecert:trace,meta:{readOnly:true,writes:false,ordering:'planningWindowTo asc; blocked before ready only on equal date'}};
  console.info(JSON.stringify(out,null,2));
  return out;
}
