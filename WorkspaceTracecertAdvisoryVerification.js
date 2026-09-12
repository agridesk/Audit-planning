/***********************************************************************
 * WorkspaceTracecertAdvisoryVerification.js
 * BUILD: 2026-09-12_WORKSPACE_TRACECERT_ADVISORY_VERIFY_R1
 * Read-only end-to-end verification that refreshed canonical eligibility
 * reaches Concept Planning / Planning Workspace advisory candidates.
 ***********************************************************************/
var WORKSPACE_TRACECERT_ADVISORY_VERIFY_BUILD='2026-09-12_WORKSPACE_TRACECERT_ADVISORY_VERIFY_R1';
function WTAV_clean_(v){return String(v==null?'':v).trim();}
function WTAV_norm_(v){return WTAV_clean_(v).toLowerCase();}
function RUN_WORKSPACE_TRACECERT_ADVISORY_VERIFICATION(){
  var res=ConceptPlanningService_get({from:'2026-01-01',to:'2026-12-31',limit:500,maxCandidates:20});
  var rows=(res&&res.rows)||[],trace=[],fail=0;
  for(var i=0;i<rows.length;i++){
    var r=rows[i]||[],scopes=Array.isArray(r.scopes)?r.scopes:[];
    var isTrace=scopes.some(function(s){return WTAV_norm_(s).indexOf('tracecert')>=0;});
    if(!isTrace)continue;
    var candidates=Array.isArray(r.candidateAuditors)?r.candidateAuditors:[];
    var leen=candidates.some(function(a){return WTAV_norm_(a&&a.email)==='leen@agriqa.es'||WTAV_norm_(a&&a.name)==='leen klaassen';});
    if(!leen)fail++;
    trace.push({auditId:WTAV_clean_(r.auditId),company:WTAV_clean_(r.company),advisoryState:WTAV_clean_(r.advisoryState),advisoryReason:WTAV_clean_(r.advisoryReason),candidateCount:candidates.length,leenPresent:leen,candidates:candidates.map(function(a){return WTAV_clean_(a&&a.name)||WTAV_clean_(a&&a.email);})});
  }
  var out={ok:trace.length>0&&fail===0,build:WORKSPACE_TRACECERT_ADVISORY_VERIFY_BUILD,tracecertAudits:trace.length,failedLeenMembership:fail,rows:trace,meta:{readOnly:true,writes:false,canonicalFlow:'Eligibility_Cache batch -> ConceptPlanningService -> Workspace advisory',period:'2026-01-01..2026-12-31'}};
  console.log(JSON.stringify(out,null,2));return out;
}
