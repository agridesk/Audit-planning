/***********************************************************************
 * ConceptReservationCommandService.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_COMMAND_R1
 *
 * PURPOSE
 *   Persistence command boundary for durable Concept Reservations.
 *   Owns only the preliminary Concept Reservations sheet.
 *
 * GOVERNANCE
 *   - Audit planning remains final planning SSoT.
 *   - AvailabilityService remains availability SSoT.
 *   - StatusMachine/lifecycle untouched.
 *   - Audit ID is the only business key.
 *   - Upsert requires sourceRevision and rechecks current Audit planning
 *     revision under Platform lock before writing the preliminary reservation.
 *   - Release is explicit; no TTL/automatic expiry.
 *   - One row per Audit ID; repeated upsert replaces the preliminary record.
 *
 * SPEED
 *   - targeted Audit planning revision read only
 *   - one Concept Reservations lookup/write under lock
 *   - no full Audit planning scan
 ***********************************************************************/

var CONCEPT_RESERVATION_COMMAND_BUILD = '2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_COMMAND_R1';
var CONCEPT_RESERVATION_HEADERS = [
  'Audit ID','Reservation ID','Auditor Email','Auditor Name','Blocks JSON','State',
  'Source Revision','Purpose','Note','Created By','Created At','Updated At',
  'Released By','Released At','Release Reason'
];

function CRCS_clean_(v){return String(v==null?'':v).trim();}
function CRCS_norm_(v){return CRCS_clean_(v).toLowerCase();}
function CRCS_now_(){return Utilities.formatDate(new Date(),Session.getScriptTimeZone(),"yyyy-MM-dd'T'HH:mm:ss");}

function CRCS_sheet_(createIfMissing){
  var ss=SpreadsheetApp.getActive();
  var sh=ss.getSheetByName(CONCEPT_RESERVATION_SHEET||'Concept Reservations');
  if(!sh&&createIfMissing===true){
    sh=ss.insertSheet(CONCEPT_RESERVATION_SHEET||'Concept Reservations');
    sh.getRange(1,1,1,CONCEPT_RESERVATION_HEADERS.length).setValues([CONCEPT_RESERVATION_HEADERS]);
  }
  return sh;
}

function CRCS_headerMap_(sh){
  if(!sh)return{};
  var last=Math.max(sh.getLastColumn(),CONCEPT_RESERVATION_HEADERS.length);
  var h=sh.getRange(1,1,1,last).getValues()[0]||[];
  var m={};for(var i=0;i<h.length;i++)m[CRCS_norm_(h[i])]=i+1;return m;
}

function CRCS_findRow_(sh,auditId){
  if(!sh||sh.getLastRow()<2)return 0;
  var map=CRCS_headerMap_(sh),col=map['audit id'];
  if(!col)throw new Error('ConceptReservationCommandService: Audit ID column missing');
  var finder=sh.getRange(2,col,sh.getLastRow()-1,1).createTextFinder(auditId).matchEntireCell(true).findNext();
  return finder?finder.getRow():0;
}

function CRCS_rowValues_(r){
  return [
    r.auditId,r.reservationId,r.auditorEmail,r.auditorName,JSON.stringify(r.blocks||[]),r.state,
    r.sourceRevision,r.purpose||'PRELIMINARY_COMPANY_CONFIRMATION',r.note||'',r.createdBy||'',r.createdAt||'',r.updatedAt||'',
    r.releasedBy||'',r.releasedAt||'',r.releaseReason||''
  ];
}

function CRCS_revisionGuard_(auditId,sourceRevision){
  var rr=PlanningRevisionTokenService_get({auditId:auditId});
  var g=PlanningOptimisticRevisionGuard_evaluate({auditId:auditId,expectedRevision:sourceRevision,currentRevision:rr&&rr.revision});
  return {revision:rr,guard:g};
}

function ConceptReservationCommandService_upsert(input){
  input=input||{};
  if(typeof Platform_withLock!=='function')throw new Error('ConceptReservationCommandService: Platform_withLock unavailable');
  if(typeof PlanningRevisionTokenService_get!=='function'||typeof PlanningOptimisticRevisionGuard_evaluate!=='function')throw new Error('ConceptReservationCommandService: revision dependencies unavailable');
  var built=ConceptReservationService_build(input);
  var r=built.reservation;
  var now=CRCS_clean_(input.updatedAt||input.createdAt)||CRCS_now_();
  r.createdAt=CRCS_clean_(input.createdAt)||now;
  r.updatedAt=now;
  var dryRun=input.dryRun===true;
  return Platform_withLock('concept-reservation:'+r.auditId,function(){
    var rg=CRCS_revisionGuard_(r.auditId,r.sourceRevision);
    if(!rg.guard||rg.guard.accepted!==true){
      return {success:true,build:CONCEPT_RESERVATION_COMMAND_BUILD,saved:false,reason:'REVISION_CONFLICT',reservation:r,revision:rg.revision,revisionGuard:rg.guard,meta:{writes:false,dryRun:dryRun,finalPlanningWrites:false,availabilityWrites:false,statusWrites:false}};
    }
    if(dryRun){
      return {success:true,build:CONCEPT_RESERVATION_COMMAND_BUILD,saved:false,reason:'DRY_RUN_VALID',reservation:r,revision:rg.revision,revisionGuard:rg.guard,meta:{writes:false,dryRun:true,finalPlanningWrites:false,availabilityWrites:false,statusWrites:false}};
    }
    var sh=CRCS_sheet_(true);
    var row=CRCS_findRow_(sh,r.auditId);
    var vals=CRCS_rowValues_(r);
    if(row){sh.getRange(row,1,1,vals.length).setValues([vals]);}
    else{row=sh.getLastRow()+1;sh.getRange(row,1,1,vals.length).setValues([vals]);}
    return {success:true,build:CONCEPT_RESERVATION_COMMAND_BUILD,saved:true,reason:'SAVED',rowNumber:row,reservation:r,revision:rg.revision,revisionGuard:rg.guard,meta:{writes:true,dryRun:false,preliminaryOnly:true,finalPlanningWrites:false,availabilityWrites:false,statusWrites:false,oneRowPerAuditId:true}};
  },Math.max(500,Math.min(10000,Number(input.lockWaitMs||3000)||3000)));
}

function ConceptReservationCommandService_release(input){
  input=input||{};
  var auditId=CRCS_clean_(input.auditId);if(!auditId)throw new Error('ConceptReservationCommandService: auditId required');
  var dryRun=input.dryRun===true;
  return Platform_withLock('concept-reservation:'+auditId,function(){
    var sh=CRCS_sheet_(false);if(!sh)return{success:true,build:CONCEPT_RESERVATION_COMMAND_BUILD,released:false,reason:'NOT_FOUND',meta:{writes:false,dryRun:dryRun}};
    var row=CRCS_findRow_(sh,auditId);if(!row)return{success:true,build:CONCEPT_RESERVATION_COMMAND_BUILD,released:false,reason:'NOT_FOUND',meta:{writes:false,dryRun:dryRun}};
    var map=CRCS_headerMap_(sh);
    var now=CRCS_clean_(input.releasedAt)||CRCS_now_();
    if(dryRun)return{success:true,build:CONCEPT_RESERVATION_COMMAND_BUILD,released:false,reason:'DRY_RUN_VALID',rowNumber:row,meta:{writes:false,dryRun:true}};
    sh.getRange(row,map['state']).setValue('RELEASED');
    if(map['released by'])sh.getRange(row,map['released by']).setValue(CRCS_norm_(input.releasedBy));
    if(map['released at'])sh.getRange(row,map['released at']).setValue(now);
    if(map['release reason'])sh.getRange(row,map['release reason']).setValue(CRCS_clean_(input.reason||'MANUAL_RELEASE'));
    if(map['updated at'])sh.getRange(row,map['updated at']).setValue(now);
    return{success:true,build:CONCEPT_RESERVATION_COMMAND_BUILD,released:true,reason:'RELEASED',rowNumber:row,meta:{writes:true,dryRun:false,preliminaryOnly:true,finalPlanningWrites:false,availabilityWrites:false,statusWrites:false}};
  },Math.max(500,Math.min(10000,Number(input.lockWaitMs||3000)||3000)));
}
