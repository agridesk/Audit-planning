/***********************************************************************
 * PlanningWorkspaceRpc.js
 * BUILD: 2026-09-11_AMS01_2_PLANNING_WORKSPACE_RPC_R2_SPLIT_FIRST_PAINT
 *
 * Browser-facing RPC boundary. Thin delegation only.
 *
 * AMS-01.2 PERFORMANCE
 * - Demand/advisory and overlays can be requested separately.
 * - Workspace can become usable after advisory first paint instead of waiting
 *   for Availability + Concept overlays.
 * - Overlay request is bounded to candidate auditors derived from advisory.
 * - Existing bootstrap endpoint remains for compatibility/regression.
 ***********************************************************************/
var PLANNING_WORKSPACE_RPC_BUILD='2026-09-11_AMS01_2_PLANNING_WORKSPACE_RPC_R2_SPLIT_FIRST_PAINT';
function PWR_clean_(v){return String(v==null?'':v).trim();}
function PWR_normEmail_(v){return PWR_clean_(v).toLowerCase();}
function PWR_envelope_(action,fn){var started=Date.now();try{var data=fn();return{ok:true,build:PLANNING_WORKSPACE_RPC_BUILD,action:action,data:data,error:null,durationMs:Date.now()-started};}catch(e){return{ok:false,build:PLANNING_WORKSPACE_RPC_BUILD,action:action,data:null,error:{message:String(e&&e.message||e)},durationMs:Date.now()-started};}}
function PWR_candidateEmails_(advisory){var out=[],seen={};var rows=advisory&&Array.isArray(advisory.rows)?advisory.rows:[];for(var i=0;i<rows.length;i++){var candidates=rows[i]&&Array.isArray(rows[i].candidateAuditors)?rows[i].candidateAuditors:[];for(var c=0;c<candidates.length;c++){var e=PWR_normEmail_(candidates[c]&&candidates[c].email);if(e&&!seen[e]){seen[e]=1;out.push(e);}}}return out;}
function PWR_overlayInput_(input,auditorEmails){input=input||{};return{from:input.from||input.start||input.periodFrom||'',to:input.to||input.end||input.periodTo||'',auditorEmails:Array.isArray(auditorEmails)?auditorEmails:(input.auditorEmails||[]),auditIds:input.auditIds||[]};}
function PlanningWorkspaceRpc_getAdvisory(input){input=input||{};return PWR_envelope_('getAdvisory',function(){return PlanningWorkspaceService_getAdvisory(input);});}
function PlanningWorkspaceRpc_getOverlays(input){input=input||{};return PWR_envelope_('getOverlays',function(){return PlanningWorkspaceService_getOverlays(PWR_overlayInput_(input,input.auditorEmails||[]));});}
function PlanningWorkspaceRpc_bootstrap(input){input=input||{};return PWR_envelope_('bootstrap',function(){var advisory=PlanningWorkspaceService_getAdvisory(input);var candidateEmails=PWR_candidateEmails_(advisory);var overlays=PlanningWorkspaceService_getOverlays(PWR_overlayInput_(input,candidateEmails));return{advisory:advisory,overlays:overlays,meta:{coarseGrained:true,uiBootstrap:true,serviceFacadeOnly:true,candidateAuditors: candidateEmails.length,overlayBoundedToCandidates:true}};});}
function PlanningWorkspaceRpc_saveConcept(input){return PWR_envelope_('saveConcept',function(){return PlanningWorkspaceService_saveConcept(input||{});});}
function PlanningWorkspaceRpc_releaseConcept(input){return PWR_envelope_('releaseConcept',function(){return PlanningWorkspaceService_releaseConcept(input||{});});}
function PlanningWorkspaceRpc_commit(input){return PWR_envelope_('commit',function(){return PlanningWorkspaceService_commit(input||{});});}
function PlanningWorkspaceRpc_contract(){return{build:PLANNING_WORKSPACE_RPC_BUILD,endpoints:['PlanningWorkspaceRpc_getAdvisory','PlanningWorkspaceRpc_getOverlays','PlanningWorkspaceRpc_bootstrap','PlanningWorkspaceRpc_saveConcept','PlanningWorkspaceRpc_releaseConcept','PlanningWorkspaceRpc_commit'],meta:{browserFacing:true,coarseGrained:true,splitFirstPaint:true,overlayBoundedToCandidates:true,directSheetReads:false,directSheetWrites:false,canonicalOwnersBypassed:false,newSsot:false}};}
