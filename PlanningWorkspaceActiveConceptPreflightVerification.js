/***********************************************************************
 * PlanningWorkspaceActiveConceptPreflightVerification.js
 * BUILD: 2026-09-13_WORKSPACE_ACTIVE_CONCEPT_PREFLIGHT_VERIFY_R1
 *
 * Read-only verification of currently active Workspace concepts against
 * canonical revision/preflight + StatusMachine PLAN transition.
 ***********************************************************************/
var PLANNING_WORKSPACE_ACTIVE_CONCEPT_PREFLIGHT_VERIFY_BUILD='2026-09-13_WORKSPACE_ACTIVE_CONCEPT_PREFLIGHT_VERIFY_R1';
function PWACP_clean_(v){return String(v==null?'':v).trim();}
function RUN_PLANNING_WORKSPACE_ACTIVE_CONCEPT_PREFLIGHT_VERIFICATION(){
  var from='2026-01-01',to='2027-12-31';
  if(typeof ConceptReservationReadModel_get!=='function')throw new Error('ConceptReservationReadModel_get unavailable');
  if(typeof PlanningWorkspaceConceptLifecycle_project!=='function')throw new Error('PlanningWorkspaceConceptLifecycle_project unavailable');
  if(typeof PlanningCommitGateService_evaluate!=='function')throw new Error('PlanningCommitGateService_evaluate unavailable');
  if(typeof Status_applyTransition_!=='function')throw new Error('Status_applyTransition_ unavailable');
  var cr=ConceptReservationReadModel_get({from:from,to:to})||{},lc=PlanningWorkspaceConceptLifecycle_project(cr.rows||[]),active=lc.activeRows||[],items=[];
  for(var i=0;i<active.length;i++){
    var r=active[i]||{},transition=Status_applyTransition_({status:r.canonicalStatus||'Pending Planning',action:'PLAN',role:'MANAGER'}),gate=null,error='';
    try{gate=PlanningCommitGateService_evaluate({auditId:PWACP_clean_(r.auditId),expectedRevision:PWACP_clean_(r.sourceRevision),auditorEmail:PWACP_clean_(r.auditorEmail),auditorName:PWACP_clean_(r.auditorName),blocks:Array.isArray(r.blocks)?r.blocks:[]});}catch(e){error=String(e&&e.message||e);}
    items.push({auditId:PWACP_clean_(r.auditId),auditorEmail:PWACP_clean_(r.auditorEmail),canonicalStatus:PWACP_clean_(r.canonicalStatus),blockCount:Array.isArray(r.blocks)?r.blocks.length:0,statusTransitionAllowed:!!(transition&&transition.ok),statusTransitionTarget:PWACP_clean_(transition&&transition.afterStatusDisplay),gateCanCommit:!!(gate&&gate.canCommit===true),gateReason:PWACP_clean_(gate&&gate.reason),revisionAccepted:!!(gate&&gate.revisionAccepted===true),preflightLevel:PWACP_clean_(gate&&gate.preflight&&gate.preflight.overallLevel),preflightReason:PWACP_clean_(gate&&gate.preflight&&gate.preflight.decisionReason),error:error});
  }
  var result={ok:true,build:PLANNING_WORKSPACE_ACTIVE_CONCEPT_PREFLIGHT_VERIFY_BUILD,activeCount:active.length,staleCount:(lc.staleRows||[]).length,items:items,meta:{nonDestructive:true,spreadsheetReads:true,spreadsheetWrites:false,planningWrites:false,availabilityWrites:false,statusWrites:false,conceptWrites:false,noNewSsot:true}};
  Logger.log(JSON.stringify(result,null,2));
  return result;
}
