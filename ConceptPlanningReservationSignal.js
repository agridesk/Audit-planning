/***********************************************************************
 * ConceptPlanningReservationSignal.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_SIGNAL_R1
 *
 * PURPOSE
 *   Pure projection that lets the loaded Planning Workspace ask whether a
 *   proposed auditor/date block is already preliminarily reserved.
 *
 * GOVERNANCE
 *   - Consumes already loaded Concept Planning Reservation overlay only.
 *   - Zero Sheet/service/RPC reads.
 *   - Does not mutate canonical Availability, eligibility or ranking.
 *   - Same audit may edit its own reservation without self-conflict.
 ***********************************************************************/
var CONCEPT_RESERVATION_SIGNAL_BUILD='2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_SIGNAL_R1';
function CPRS_clean_(v){return String(v==null?'':v).trim();}
function CPRS_norm_(v){return CPRS_clean_(v).toLowerCase();}
function CPRS_blocks_(raw){return Array.isArray(raw)?raw:[];}
function CPRS_overlap_(a,b){
  if(CPRS_clean_(a&&a.date)!==CPRS_clean_(b&&b.date))return false;
  var as=CPRS_clean_(a&&a.start),ae=CPRS_clean_(a&&a.end),bs=CPRS_clean_(b&&b.start),be=CPRS_clean_(b&&b.end);
  if(!as||!ae||!bs||!be)return true;
  return as<be&&bs<ae;
}
function ConceptPlanningReservationSignal_evaluate(input){
  input=input||{};
  var auditor=CPRS_norm_(input.auditorEmail),auditId=CPRS_clean_(input.auditId),blocks=CPRS_blocks_(input.blocks);
  var overlay=input.reservationOverlay||input.overlay||{};
  var rows=Array.isArray(overlay.rows)?overlay.rows:[];
  var conflicts=[];
  for(var i=0;i<rows.length;i++){
    var r=rows[i]||{};
    if(CPRS_norm_(r.auditorEmail)!==auditor)continue;
    if(auditId&&CPRS_clean_(r.auditId)===auditId)continue;
    var rb=CPRS_blocks_(r.blocks),hit=false;
    for(var x=0;x<blocks.length&&!hit;x++)for(var y=0;y<rb.length&&!hit;y++)if(CPRS_overlap_(blocks[x],rb[y]))hit=true;
    if(hit)conflicts.push({auditId:CPRS_clean_(r.auditId),reservationId:CPRS_clean_(r.reservationId),auditorEmail:CPRS_norm_(r.auditorEmail),blocks:rb});
  }
  return {success:true,build:CONCEPT_RESERVATION_SIGNAL_BUILD,signal:conflicts.length?'PRELIMINARY_RESERVED':'CLEAR',conflict:conflicts.length>0,conflicts:conflicts,meta:{writes:false,zeroSheetReads:true,zeroServiceReads:true,zeroRpcReads:true,selfReservationIgnored:true,canonicalAvailabilityMutated:false,eligibilityMutated:false,rankingMutated:false,commitRevalidationRequired:true}};
}
