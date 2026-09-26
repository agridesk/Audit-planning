/***********************************************************************
 * FILE: PlanningWorkspaceEntryRoute.js
 * BUILD: 2026-09-26_AMS03_PLANNING_WORKSPACE_ENTRY_ROUTE_R1
 * PURPOSE: Canonical DEV-only authenticated GET owner for Planning Workspace 2.0.
 ***********************************************************************/
var PLANNING_WORKSPACE_ENTRY_ROUTE_BUILD='2026-09-26_AMS03_PLANNING_WORKSPACE_ENTRY_ROUTE_R1';
function PWER_clean_(v){return String(v==null?'':v).trim();}
function PWER_normRole_(v){return PWER_clean_(v).toLowerCase()==='auditor'?'Auditor':'Manager';}
function PWER_js_(v){return JSON.stringify(v==null?'':v).replace(/<\//g,'<\\/');}
function PlanningWorkspaceEntryRoute_render(ctx){
  ctx=ctx||{};
  if(!V5_ENTRY_isDevEnv_())throw new Error('PLANNING_WORKSPACE_DEV_ONLY');
  var role=PWER_normRole_(ctx.role),email=PWER_clean_(ctx.email).toLowerCase(),auditId=PWER_clean_(ctx.auditId);
  var auth={email:email,role:role,token:PWER_clean_(ctx.trustedToken||ctx.token),deviceId:PWER_clean_(ctx.deviceFingerprint||ctx.deviceId),auditId:auditId,action:'planningworkspace'};
  var out=PlanningWorkspaceUi_render(ctx),html=out&&typeof out.getContent==='function'?out.getContent():String(out||''),bootstrap=null;
  if(auditId)bootstrap=PlanningWorkspaceRpc_bootstrap({auditId:auditId,role:role,actorRole:role,actorEmail:email,auditorEmail:role==='Auditor'?email:''});
  var seed='<script>window.__PW_ENTRY_DIRECT_SHELL=true;window.__PW_ENTRY_AUTH='+PWER_js_(auth)+';window.__PW_HTTP_BOOTSTRAP='+(bootstrap?PWER_js_(bootstrap):'null')+';<\/script>';
  return HtmlService.createHtmlOutput(html.replace('</body>',seed+'\n</body>')).setTitle('AMS - Planning Workspace');
}
function PlanningWorkspaceEntryRoute_contract(){return{build:PLANNING_WORKSPACE_ENTRY_ROUTE_BUILD,route:'planningworkspace',authenticatedEntryOwner:'EntryV5',authFunction:'V5_ENTRY_resolve',renderer:'PlanningWorkspaceUi_render',devOnly:true,directDataIndependentShell:true,directShellCarriesAuthContext:true,planningDataBeforeAuth:false,focusedHttpBootstrap:true,serverRenderedInitialBootstrap:true,generalWorkspaceDeferredBootstrap:true,htmlRenderOnAuthenticatedDataPath:false,initialSerialRpcCount:0,initialAuthAndDataSingleRpc:true,authenticatedDataEnvelope:'NATIVE_OBJECT',explicitJsonStringify:false,browserJsonParse:false,newSsot:false};}
