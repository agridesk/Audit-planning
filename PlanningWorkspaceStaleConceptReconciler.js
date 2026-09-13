/***********************************************************************
 * PlanningWorkspaceStaleConceptReconciler.js
 * BUILD: 2026-09-13_WORKSPACE_STALE_CONCEPT_RECONCILER_R1
 *
 * PURPOSE
 *   One-time/manual reconciliation for ACTIVE Concept Reservations whose
 *   canonical Audit planning lifecycle has already advanced beyond
 *   Pending Planning.
 *
 * SAFETY
 *   - DRY RUN is default/read-only.
 *   - APPLY only releases lifecycle-stale concepts with a known canonical
 *     non-Pending-Planning status.
 *   - Missing canonical audit/status rows are reported but NOT released.
 *   - Release goes through ConceptReservationCommandService_release only.
 *   - No Audit planning, Availability or lifecycle/status writes.
 ***********************************************************************/
var PLANNING_WORKSPACE_STALE_CONCEPT_RECONCILER_BUILD='2026-09-13_WORKSPACE_STALE_CONCEPT_RECONCILER_R1';
function PWSCR_clean_(v){return String(v==null?'':v).trim();}
function PWSCR_read_(){
  if(typeof ConceptReservationReadModel_get!=='function')throw new Error('PlanningWorkspaceStaleConceptReconciler: ConceptReservationReadModel_get unavailable');
  if(typeof PlanningWorkspaceConceptLifecycle_project!=='function')throw new Error('PlanningWorkspaceStaleConceptReconciler: lifecycle projector unavailable');
  var cr=ConceptReservationReadModel_get({from:'2000-01-01',to:'2099-12-31'});
  var lifecycle=PlanningWorkspaceConceptLifecycle_project(cr&&cr.rows?cr.rows:[]);
  return{source:cr&&cr.rows?cr.rows:[],lifecycle:lifecycle};
}
function PWSCR_candidate_(row){
  row=row||{};
  var id=PWSCR_clean_(row.auditId),status=PWSCR_clean_(row.canonicalStatus),norm=PWSCR_clean_(row.canonicalStatusNormalized),reason=PWSCR_clean_(row.lifecycleReason);
  return{auditId:id,canonicalStatus:status,canonicalStatusNormalized:norm,lifecycleReason:reason,releaseEligible:!!(id&&status&&norm&&norm!=='PENDING_PLANNING'&&reason!=='CANONICAL_AUDIT_OR_STATUS_MISSING')};
}
function PlanningWorkspaceStaleConceptReconciler_run(input){
  input=input||{};
  var apply=input.apply===true;
  var pack=PWSCR_read_(),lc=pack.lifecycle||{},stale=Array.isArray(lc.staleRows)?lc.staleRows:[],items=[],released=0,skipped=0,errors=[];
  for(var i=0;i<stale.length;i++){
    var c=PWSCR_candidate_(stale[i]);
    if(!c.releaseEligible){c.action='SKIP';c.resultReason='NOT_RELEASE_ELIGIBLE';skipped++;items.push(c);continue;}
    if(!apply){c.action='WOULD_RELEASE';c.resultReason='DRY_RUN';items.push(c);continue;}
    try{
      if(typeof ConceptReservationCommandService_release!=='function')throw new Error('ConceptReservationCommandService_release unavailable');
      var rr=ConceptReservationCommandService_release({auditId:c.auditId,reason:'CANONICAL_STATUS_ADVANCED',releasedBy:'workspace-stale-concept-reconciler'});
      c.action=rr&&rr.released===true?'RELEASED':'NOT_RELEASED';
      c.resultReason=PWSCR_clean_(rr&&rr.reason);
      if(rr&&rr.released===true)released++;else skipped++;
    }catch(e){c.action='ERROR';c.resultReason=PWSCR_clean_(e&&e.message||e);errors.push({auditId:c.auditId,error:c.resultReason});}
    items.push(c);
  }
  var out={ok:errors.length===0,build:PLANNING_WORKSPACE_STALE_CONCEPT_RECONCILER_BUILD,mode:apply?'APPLY':'DRY_RUN',sourceActiveCount:pack.source.length,lifecycleActiveCount:lc.activeRows?lc.activeRows.length:0,lifecycleStaleCount:stale.length,releaseEligibleCount:items.filter(function(x){return x.releaseEligible;}).length,released:released,skipped:skipped,errors:errors,items:items,meta:{canonicalLifecycleOwner:'Audit planning',conceptOwner:'Concept Reservations',releaseOwner:'ConceptReservationCommandService_release',missingCanonicalRowsReleased:false,auditPlanningWrites:false,availabilityWrites:false,statusWrites:false,conceptWrites:apply===true,destructive:apply===true}};
  console.log(JSON.stringify(out,null,2));return out;
}
function RUN_PLANNING_WORKSPACE_STALE_CONCEPT_RECONCILER_DRY_RUN(){return PlanningWorkspaceStaleConceptReconciler_run({apply:false});}
function RUN_PLANNING_WORKSPACE_STALE_CONCEPT_RECONCILER_APPLY(){return PlanningWorkspaceStaleConceptReconciler_run({apply:true});}
