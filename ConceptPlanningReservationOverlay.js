/***********************************************************************
 * ConceptPlanningReservationOverlay.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_OVERLAY_R1
 *
 * PURPOSE
 *   Optional read-only durable Concept Reservation overlay for an already
 *   loaded Concept Planning workspace. Shows preliminary reservations as
 *   coordination constraints without changing canonical Availability.
 *
 * GOVERNANCE
 *   - Audit planning remains final planning SSoT.
 *   - Concept Reservations owns preliminary reservation state only.
 *   - AvailabilityService remains canonical availability owner.
 *   - Reservation overlay never changes eligibility/ranking by itself.
 *   - Final commit always revalidates canonical planning revision + validators.
 *
 * SPEED
 *   - one ConceptReservationReadModel bulk read for visible period
 *   - optional auditor-email filter in memory
 *   - no ConceptPlanning/Availability reads
 *   - no per-audit/per-auditor calls
 ***********************************************************************/

var CONCEPT_PLANNING_RESERVATION_OVERLAY_BUILD='2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_OVERLAY_R1';

function CPRO_clean_(v){return String(v==null?'':v).trim();}
function CPRO_norm_(v){return CPRO_clean_(v).toLowerCase();}
function CPRO_emails_(raw){var a=Array.isArray(raw)?raw:(raw?[raw]:[]),o=[],s={};for(var i=0;i<a.length;i++){var e=CPRO_norm_(a[i]);if(e&&!s[e]){s[e]=1;o.push(e);}}return o;}

function ConceptPlanningReservationOverlay_get(input){
  input=input||{};
  var from=CPRO_clean_(input.from||input.start||input.periodFrom);
  var to=CPRO_clean_(input.to||input.end||input.periodTo);
  if(!from||!to)throw new Error('ConceptPlanningReservationOverlay: from/to required');
  var emails=CPRO_emails_(input.auditorEmails||input.candidateAuditorEmails||input.auditors);
  var emailSet={};for(var i=0;i<emails.length;i++)emailSet[emails[i]]=1;
  if(typeof ConceptReservationReadModel_get!=='function')throw new Error('ConceptPlanningReservationOverlay: ConceptReservationReadModel_get unavailable');
  var perf=(typeof DPL_start_==='function')?DPL_start_('ConceptPlanningReservationOverlay_get',{from:from,to:to,candidateAuditors:emails.length}):null;
  var rm=ConceptReservationReadModel_get({from:from,to:to});
  if(typeof DPL_mark_==='function')DPL_mark_(perf,'reservationBatch',{rows:rm&&rm.rows?rm.rows.length:0});
  var rows=[],byAud={},byAudit={};
  var src=rm&&rm.rows?rm.rows:[];
  for(var r=0;r<src.length;r++){
    var item=src[r]||{},email=CPRO_norm_(item.auditorEmail),auditId=CPRO_clean_(item.auditId);
    if(emails.length&&!emailSet[email])continue;
    rows.push(item);
    if(!byAud[email])byAud[email]=[];byAud[email].push(item);
    if(auditId)byAudit[auditId]=item;
  }
  if(typeof DPL_mark_==='function')DPL_mark_(perf,'filterProject',{returned:rows.length,auditors:Object.keys(byAud).length,audits:Object.keys(byAudit).length});
  var out={success:true,build:CONCEPT_PLANNING_RESERVATION_OVERLAY_BUILD,period:{from:from,to:to},rows:rows,byAuditorEmail:byAud,byAuditId:byAudit,meta:{writes:false,advisoryOnly:true,preliminaryReservationOverlay:true,reservationsAffectCanonicalAvailability:false,reservationsAffectEligibility:false,reservationsAffectRanking:false,commitRevalidationRequired:true,reusesLoadedConceptPlanning:true,conceptPlanningReadPerformed:false,availabilityReadPerformed:false,candidateAuditorsFiltered:emails.length,reservationRowsRead:src.length,reservationRowsReturned:rows.length,preliminaryOwner:'Concept Reservations',canonicalFinalPlanningOwner:'Audit planning',canonicalAvailabilityOwner:'AvailabilityService / Auditor availability'}};
  if(typeof DPL_end_==='function')out.devPerformance=DPL_end_(perf,{rowsRead:src.length,rowsReturned:rows.length,auditors:Object.keys(byAud).length});
  return out;
}
