/***********************************************************************
 * PlanningWorkspaceRpc.js
 * BUILD: 2026-09-11_AMS01_2_PLANNING_WORKSPACE_RPC_R3_STAGE_DIAGNOSTICS
 *
 * Browser-facing RPC boundary. Thin delegation only.
 * Stage timings are diagnostic only; they never own business truth.
 ***********************************************************************/
var PLANNING_WORKSPACE_RPC_BUILD='2026-09-11_AMS01_2_PLANNING_WORKSPACE_RPC_R3_STAGE_DIAGNOSTICS';
function PWR_clean_(v){return String(v==null?'':v).trim();}
function PWR_normEmail_(v){return PWR_clean_(v).toLowerCase();}
function PWR_envelope_(action,fn){var started=Date.now();try{var data=fn();return{ok:true,build:PLANNING_WORKSPACE_RPC_BUILD,action:action,data:data,error:null,durationMs:Date.now()-started};}catch(e){return{ok:false,build:PLANNING_WORKSPACE_RPC_BUILD,action:action,data:null,error:{message:String(e&&e.message||e)},durationMs:Date.now()-started};}}
function PWR_candidateEmails_(advisory){var out=[],seen={};var rows=advisory&&Array.isArray(advisory.rows)?advisory.rows:[];for(var i=0;i<rows.length;i++){var candidates=rows[i]&&Array.isArray(rows[i].candidateAuditors)?rows[i].candidateAuditors:[];for(var c=0;c<candidates.length;c++){var e=PWR_normEmail_(candidates[c]&&candidates[c].email);if(e&&!seen[e]){seen[e]=1;out.push(e);}}}return out;}
function PWR_overlayInput_(input,auditorEmails){input=input||{};return{from:input.from||input.start||input.periodFrom||'',to:input.to||input.end||input.periodTo||'',auditorEmails:Array.isArray(auditorEmails)?auditorEmails:(input.auditorEmails||[]),auditIds:input.auditIds||[]};}
function PlanningWorkspaceRpc_getAdvisory(input){input=input||{};return PWR_envelope_('getAdvisory',function(){return PlanningWorkspaceService_getAdvisory(input);});}
function PlanningWorkspaceRpc_getOverlays(input){input=input||{};return PWR_envelope_('getOverlays',function(){return PlanningWorkspaceService_getOverlays(PWR_overlayInput_(input,input.auditorEmails||[]));});}
function PlanningWorkspaceRpc_bootstrap(input){
  input=input||{};
  return PWR_envelope_('bootstrap',function(){
    var t0=Date.now();
    var advisory=PlanningWorkspaceService_getAdvisory(input);
    var t1=Date.now();
    var candidateEmails=PWR_candidateEmails_(advisory);
    var t2=Date.now();
    var overlays=PlanningWorkspaceService_getOverlays(PWR_overlayInput_(input,candidateEmails));
    var t3=Date.now();
    return{
      advisory:advisory,
      overlays:overlays,
      meta:{
        coarseGrained:true,
        uiBootstrap:true,
        serviceFacadeOnly:true,
        candidateAuditors:candidateEmails.length,
        overlayBoundedToCandidates:true,
        stageMs:{
          advisory:t1-t0,
          candidateProjection:t2-t1,
          overlays:t3-t2,
          serverTotal:t3-t0
        }
      }
    };
  });
}
function PlanningWorkspaceRpc_saveConcept(input){return PWR_envelope_('saveConcept',function(){return PlanningWorkspaceService_saveConcept(input||{});});}
function PlanningWorkspaceRpc_releaseConcept(input){return PWR_envelope_('releaseConcept',function(){return PlanningWorkspaceService_releaseConcept(input||{});});}
function PlanningWorkspaceRpc_commit(input){return PWR_envelope_('commit',function(){return PlanningWorkspaceService_commit(input||{});});}
function PlanningWorkspaceRpc_contract(){return{build:PLANNING_WORKSPACE_RPC_BUILD,endpoints:['PlanningWorkspaceRpc_getAdvisory','PlanningWorkspaceRpc_getOverlays','PlanningWorkspaceRpc_bootstrap','PlanningWorkspaceRpc_saveConcept','PlanningWorkspaceRpc_releaseConcept','PlanningWorkspaceRpc_commit'],meta:{browserFacing:true,coarseGrained:true,singleDecisionRpc:true,stageDiagnostics:true,overlayBoundedToCandidates:true,directSheetReads:false,directSheetWrites:false,canonicalOwnersBypassed:false,newSsot:false}};}
