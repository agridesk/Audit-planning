/***********************************************************************
 * WorkspacePlannerAttentionScopeVerification.js
 * BUILD: 2026-09-12_WORKSPACE_ATTENTION_SCOPE_VERIFY_R1
 * Read-only verification for Workspace attention ordering and Tracecert
 * scope-filter alias compatibility.
 ***********************************************************************/
var WORKSPACE_ATTENTION_SCOPE_VERIFY_BUILD='2026-09-12_WORKSPACE_ATTENTION_SCOPE_VERIFY_R1';
function WPASV_clean_(v){return String(v==null?'':v).trim();}
function WPASV_priority_(x){return{wt:WPASV_clean_(x&&x.planningWindowTo)||'9999-12-31',wf:WPASV_clean_(x&&x.planningWindowFrom)||'9999-12-31',state:x&&x.advisoryState==='READY'?1:0};}
function WPASV_compare_(a,b){var ap=WPASV_priority_(a),bp=WPASV_priority_(b);if(ap.wt!==bp.wt)return ap.wt.localeCompare(bp.wt);if(ap.wf!==bp.wf)return ap.wf.localeCompare(bp.wf);if(ap.state!==bp.state)return ap.state-bp.state;return WPASV_clean_(a.company||a.auditId).localeCompare(WPASV_clean_(b.company||b.auditId));}
function RUN_WORKSPACE_PLANNER_ATTENTION_SCOPE_VERIFICATION(){
  var base={from:'2026-09-01',to:'2026-12-31',limit:500,maxCandidates:20};
  var all=ConceptPlanningService_get(base)||{};
  var rows=Array.isArray(all.rows)?all.rows:[];
  var top12=rows.slice().sort(WPASV_compare_).slice(0,12);
  var topNames=top12.map(function(x){return WPASV_clean_(x.company);});
  var scoped=ConceptPlanningService_get({from:base.from,to:base.to,scope:'tracecert',limit:500,maxCandidates:20})||{};
  var scopeRows=Array.isArray(scoped.rows)?scoped.rows:[];
  var scopeNames=scopeRows.map(function(x){return WPASV_clean_(x.company);});
  var coplantTop=topNames.indexOf('Coplant')>=0;
  var fresasTop=topNames.indexOf('Viveros Las Fresas')>=0;
  var tracecertOnly=scopeRows.length>0&&scopeRows.every(function(x){return (x.scopes||[]).some(function(s){return WPASV_clean_(s).toLowerCase()==='florimark tracecert';});});
  var out={
    ok:coplantTop&&fresasTop&&tracecertOnly,
    build:WORKSPACE_ATTENTION_SCOPE_VERIFY_BUILD,
    attentionLimit:12,
    top12:top12.map(function(x){return{company:WPASV_clean_(x.company),planningWindowTo:WPASV_clean_(x.planningWindowTo),scopes:x.scopes||[],advisoryState:WPASV_clean_(x.advisoryState)};}),
    coplantInTop12:coplantTop,
    viverosLasFresasInTop12:fresasTop,
    tracecertScopeFilterCount:scopeRows.length,
    tracecertScopeFilterOnlyTracecert:tracecertOnly,
    tracecertScopeFilterCompanies:scopeNames,
    meta:{readOnly:true,writes:false,attentionOrdering:'planningWindowTo, planningWindowFrom, blocker state',scopeInput:'tracecert'}
  };
  console.info(JSON.stringify(out,null,2));
  return out;
}
