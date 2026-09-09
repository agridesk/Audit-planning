/***********************************************************************
 * PlanningWorkspaceRpc.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_2_0_RPC_R2_EDITOR_REVISION
 * Browser-facing RPC boundary. Thin delegation only.
 ***********************************************************************/
var PLANNING_WORKSPACE_RPC_BUILD='2026-09-09_PLANNING_WORKSPACE_2_0_RPC_R2_EDITOR_REVISION';
function PWR_clean_(v){return String(v==null?'':v).trim();}
function PWR_envelope_(action,fn){var started=Date.now();try{var data=fn();return{ok:true,build:PLANNING_WORKSPACE_RPC_BUILD,action:action,data:data,error:null,durationMs:Date.now()-started};}catch(e){return{ok:false,build:PLANNING_WORKSPACE_RPC_BUILD,action:action,data:null,error:{message:String(e&&e.message||e)},durationMs:Date.now()-started};}}
function PlanningWorkspaceRpc_bootstrap(input){input=input||{};return PWR_envelope_('bootstrap',function(){var advisory=PlanningWorkspaceService_getAdvisory(input),overlayInput={from:input.from||input.start||input.periodFrom||'',to:input.to||input.end||input.periodTo||'',auditorEmails:input.auditorEmails||[],auditIds:input.auditIds||[]};var overlays=PlanningWorkspaceService_getOverlays(overlayInput);return{advisory:advisory,overlays:overlays,meta:{coarseGrained:true,uiBootstrap:true,serviceFacadeOnly:true}};});}
function PlanningWorkspaceRpc_getRevision(input){input=input||{};return PWR_envelope_('getRevision',function(){var auditId=PWR_clean_(input.auditId);if(!auditId)throw new Error('auditId required');return PlanningRevisionTokenService_get({auditId:auditId});});}
function PlanningWorkspaceRpc_saveConcept(input){return PWR_envelope_('saveConcept',function(){return PlanningWorkspaceService_saveConcept(input||{});});}
function PlanningWorkspaceRpc_releaseConcept(input){return PWR_envelope_('releaseConcept',function(){return PlanningWorkspaceService_releaseConcept(input||{});});}
function PlanningWorkspaceRpc_commit(input){return PWR_envelope_('commit',function(){return PlanningWorkspaceService_commit(input||{});});}
function PlanningWorkspaceRpc_contract(){return{build:PLANNING_WORKSPACE_RPC_BUILD,endpoints:['PlanningWorkspaceRpc_bootstrap','PlanningWorkspaceRpc_getRevision','PlanningWorkspaceRpc_saveConcept','PlanningWorkspaceRpc_releaseConcept','PlanningWorkspaceRpc_commit'],meta:{browserFacing:true,coarseGrained:true,directSheetReads:false,directSheetWrites:false,canonicalOwnersBypassed:false,newSsot:false,revisionOwner:'PlanningRevisionTokenService'}};}
