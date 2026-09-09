/***********************************************************************
 * ConceptPlanningDateSlotReservationProjection.js
 * BUILD: 2026-09-09_ROADMAP_2_4_DATE_SLOT_RESERVATION_PROJECTION_R1
 *
 * Pure Workspace projection. Combines already-loaded date-slot advisory with
 * already-loaded Concept Reservation overlay. No Sheet/service/RPC reads.
 ***********************************************************************/
var CONCEPT_DATE_SLOT_RESERVATION_BUILD='2026-09-09_ROADMAP_2_4_DATE_SLOT_RESERVATION_PROJECTION_R1';
function CDSRP_clean_(v){return String(v==null?'':v).trim();}
function CDSRP_norm_(v){return CDSRP_clean_(v).toLowerCase();}
function CDSRP_reservationBlocksForDate_(date){return [{date:date,start:'',end:''}];}
function CDSRP_projectAuditors_(auditId,date,auditors,overlay){
  auditors=Array.isArray(auditors)?auditors:[];
  return auditors.map(function(a){
    var x={};Object.keys(a||{}).forEach(function(k){x[k]=a[k];});
    var s=ConceptPlanningReservationSignal_evaluate({auditId:auditId,auditorEmail:a&&a.email,blocks:CDSRP_reservationBlocksForDate_(date),reservationOverlay:overlay});
    x.conceptReservationSignal=s.signal;
    x.preliminarilyReserved=s.conflict===true;
    x.reservationConflicts=s.conflicts||[];
    return x;
  });
}
function ConceptPlanningDateSlotReservationProjection_get(input){
  input=input||{};
  var source=input.dateSlotAdvisory||input.advisory||{};
  var overlay=input.reservationOverlay||{};
  var sourceRows=Array.isArray(source.rows)?source.rows:[];
  var perf=(typeof DPL_start_==='function')?DPL_start_('ConceptPlanningDateSlotReservationProjection_get',{audits:sourceRows.length}):null;
  var reservedCandidates=0,rows=sourceRows.map(function(r){
    var auditId=CDSRP_clean_(r&&r.auditId),out={};Object.keys(r||{}).forEach(function(k){out[k]=r[k];});
    out.slots=(Array.isArray(r&&r.slots)?r.slots:[]).map(function(slot){
      var s={};Object.keys(slot||{}).forEach(function(k){s[k]=slot[k];});
      s.availableAuditors=CDSRP_projectAuditors_(auditId,s.date,s.availableAuditors,overlay);
      s.unknownAuditors=CDSRP_projectAuditors_(auditId,s.date,s.unknownAuditors,overlay);
      var all=s.availableAuditors.concat(s.unknownAuditors);
      var n=all.filter(function(a){return a.preliminarilyReserved===true;}).length;
      reservedCandidates+=n;s.preliminarilyReservedCount=n;
      s.hasPreliminaryReservationConflict=n>0;
      return s;
    });
    return out;
  });
  if(typeof DPL_mark_==='function')DPL_mark_(perf,'projectReservations',{audits:rows.length,reservedCandidates:reservedCandidates});
  var result={success:true,build:CONCEPT_DATE_SLOT_RESERVATION_BUILD,rows:rows,totals:{audits:rows.length,reservedCandidates:reservedCandidates},meta:{writes:false,pureProjection:true,sheetReads:0,serviceReads:0,rpcReads:0,reusesLoadedDateSlotAdvisory:true,reusesLoadedReservationOverlay:true,canonicalAvailabilityMutated:false,eligibilityMutated:false,rankingMutated:false,commitRevalidationRequired:true,preliminaryReservationDoesNotBecomeCanonicalAvailability:true}};
  if(typeof DPL_end_==='function')result.devPerformance=DPL_end_(perf,{audits:rows.length,reservedCandidates:reservedCandidates});
  return result;
}
