/***********************************************************************
 * ConceptReservationCommitReleaseBridge.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_COMMIT_RELEASE_BRIDGE_R1
 *
 * PURPOSE
 *   Release a matching Concept Reservation only AFTER canonical planning
 *   commit succeeds, while caller keeps the existing planning commit lock.
 *
 * GOVERNANCE
 *   - No nested Platform lock.
 *   - Concept Reservations remains preliminary coordination state only.
 *   - Audit planning / Availability / Status are never written here.
 *   - Failed canonical commit must never call this bridge.
 ***********************************************************************/
var CONCEPT_RESERVATION_COMMIT_RELEASE_BRIDGE_BUILD='2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_COMMIT_RELEASE_BRIDGE_R1';
function CRCRB_clean_(v){return String(v==null?'':v).trim();}
function CRCRB_norm_(v){return CRCRB_clean_(v).toLowerCase();}
function ConceptReservationCommitReleaseBridge_releaseLocked(input){
  input=input||{};
  var auditId=CRCRB_clean_(input.auditId);
  if(!auditId)throw new Error('ConceptReservationCommitReleaseBridge: auditId required');
  var dryRun=input.dryRun===true;
  if(typeof CRCS_sheet_!=='function'||typeof CRCS_findRow_!=='function'||typeof CRCS_headerMap_!=='function'||typeof CRCS_now_!=='function')throw new Error('ConceptReservationCommitReleaseBridge: ConceptReservationCommandService helpers unavailable');
  var sh=CRCS_sheet_(false);
  if(!sh)return{success:true,build:CONCEPT_RESERVATION_COMMIT_RELEASE_BRIDGE_BUILD,released:false,reason:'NOT_FOUND',meta:{writes:false,dryRun:dryRun,callerOwnsLock:true,nestedLock:false,finalPlanningWrites:false,availabilityWrites:false,statusWrites:false}};
  var row=CRCS_findRow_(sh,auditId);
  if(!row)return{success:true,build:CONCEPT_RESERVATION_COMMIT_RELEASE_BRIDGE_BUILD,released:false,reason:'NOT_FOUND',meta:{writes:false,dryRun:dryRun,callerOwnsLock:true,nestedLock:false,finalPlanningWrites:false,availabilityWrites:false,statusWrites:false}};
  var map=CRCS_headerMap_(sh),now=CRCRB_clean_(input.releasedAt)||CRCS_now_();
  if(dryRun)return{success:true,build:CONCEPT_RESERVATION_COMMIT_RELEASE_BRIDGE_BUILD,released:false,reason:'DRY_RUN_VALID',rowNumber:row,meta:{writes:false,dryRun:true,callerOwnsLock:true,nestedLock:false,finalPlanningWrites:false,availabilityWrites:false,statusWrites:false}};
  sh.getRange(row,map['state']).setValue('RELEASED');
  if(map['released by'])sh.getRange(row,map['released by']).setValue(CRCRB_norm_(input.releasedBy));
  if(map['released at'])sh.getRange(row,map['released at']).setValue(now);
  if(map['release reason'])sh.getRange(row,map['release reason']).setValue(CRCRB_clean_(input.reason||'CANONICAL_COMMIT'));
  if(map['updated at'])sh.getRange(row,map['updated at']).setValue(now);
  return{success:true,build:CONCEPT_RESERVATION_COMMIT_RELEASE_BRIDGE_BUILD,released:true,reason:'RELEASED',rowNumber:row,meta:{writes:true,dryRun:false,callerOwnsLock:true,nestedLock:false,preliminaryOnly:true,finalPlanningWrites:false,availabilityWrites:false,statusWrites:false}};
}
