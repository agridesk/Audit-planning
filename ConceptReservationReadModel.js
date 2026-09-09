/***********************************************************************
 * ConceptReservationReadModel.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_READ_MODEL_R1
 *
 * PURPOSE
 *   Read-only bounded projection of durable Concept Reservations for a
 *   visible planning period. This is the availability/planner overlay input.
 *
 * PERSISTENCE CONTRACT
 *   Sheet: Concept Reservations
 *   One row per Audit ID. Audit ID is the public/canonical key.
 *   This sheet owns preliminary reservation state only; never final planning.
 *
 * SPEED CONTRACT
 *   - one bulk read
 *   - filter by ACTIVE + visible period before projection
 *   - no per-row reads
 *   - no other service calls
 ***********************************************************************/

var CONCEPT_RESERVATION_READ_BUILD = '2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_READ_MODEL_R1';
var CONCEPT_RESERVATION_SHEET = 'Concept Reservations';

function CRRM_clean_(v){return String(v==null?'':v).trim();}
function CRRM_norm_(v){return CRRM_clean_(v).toLowerCase();}
function CRRM_col_(h,n){var x={};for(var i=0;i<h.length;i++)x[CRRM_norm_(h[i])]=i;for(var j=0;j<n.length;j++){var k=CRRM_norm_(n[j]);if(Object.prototype.hasOwnProperty.call(x,k))return x[k];}return -1;}
function CRRM_blocks_(raw){if(Array.isArray(raw))return raw;var s=CRRM_clean_(raw);if(!s)return[];try{var p=JSON.parse(s);return Array.isArray(p)?p:(p&&Array.isArray(p.blocks)?p.blocks:[]);}catch(e){return[];}}
function CRRM_overlap_(blocks,from,to){for(var i=0;i<blocks.length;i++){var d=CRRM_clean_(blocks[i]&&blocks[i].date);if(d&&d>=from&&d<=to)return true;}return false;}

function ConceptReservationReadModel_get(input){
  input=input||{};
  var from=CRRM_clean_(input.from),to=CRRM_clean_(input.to);
  if(!from||!to)throw new Error('ConceptReservationReadModel: from/to required');
  if(to<from)throw new Error('ConceptReservationReadModel: to before from');
  var perf=(typeof DPL_start_==='function')?DPL_start_('ConceptReservationReadModel_get',{from:from,to:to}):null;
  var sh=SpreadsheetApp.getActive().getSheetByName(CONCEPT_RESERVATION_SHEET);
  if(!sh||sh.getLastRow()<2){var empty={success:true,build:CONCEPT_RESERVATION_READ_BUILD,period:{from:from,to:to},rows:[],byAuditorEmail:{},meta:{sheet:CONCEPT_RESERVATION_SHEET,rowsRead:0,returned:0,writes:false,readOnly:true,canonicalFinalPlanningOwner:'Audit planning'}};if(typeof DPL_end_==='function')empty.devPerformance=DPL_end_(perf,{returned:0});return empty;}
  var vals=sh.getDataRange().getValues();
  if(typeof DPL_mark_==='function')DPL_mark_(perf,'bulkRead',{rows:Math.max(0,vals.length-1),cols:vals[0]?vals[0].length:0});
  var h=vals[0]||[];
  var cId=CRRM_col_(h,['Audit ID','Audit_ID']);
  var cRid=CRRM_col_(h,['Reservation ID','Reservation_ID']);
  var cAud=CRRM_col_(h,['Auditor Email','Auditor_Email']);
  var cName=CRRM_col_(h,['Auditor Name','Auditor_Name']);
  var cBlocks=CRRM_col_(h,['Blocks JSON','Blocks_JSON','Blocks']);
  var cState=CRRM_col_(h,['State']);
  var cRev=CRRM_col_(h,['Source Revision','Source_Revision']);
  if(cId<0||cAud<0||cBlocks<0||cState<0)throw new Error('ConceptReservationReadModel: required columns missing');
  var rows=[],byAud={};
  for(var r=1;r<vals.length;r++){
    var v=vals[r]||[];
    if(CRRM_clean_(v[cState]).toUpperCase()!=='ACTIVE')continue;
    var blocks=CRRM_blocks_(v[cBlocks]);
    if(!CRRM_overlap_(blocks,from,to))continue;
    var email=CRRM_norm_(v[cAud]);
    var item={auditId:CRRM_clean_(v[cId]),reservationId:cRid>=0?CRRM_clean_(v[cRid]):'',auditorEmail:email,auditorName:cName>=0?CRRM_clean_(v[cName]):'',blocks:blocks,state:'ACTIVE',sourceRevision:cRev>=0?CRRM_clean_(v[cRev]):''};
    rows.push(item);if(!byAud[email])byAud[email]=[];byAud[email].push(item);
  }
  if(typeof DPL_mark_==='function')DPL_mark_(perf,'filterProject',{returned:rows.length,auditors:Object.keys(byAud).length});
  var out={success:true,build:CONCEPT_RESERVATION_READ_BUILD,period:{from:from,to:to},rows:rows,byAuditorEmail:byAud,meta:{sheet:CONCEPT_RESERVATION_SHEET,rowsRead:vals.length-1,returned:rows.length,writes:false,readOnly:true,oneBulkRead:true,noPerRowReads:true,preliminaryOnly:true,canonicalFinalPlanningOwner:'Audit planning',canonicalAvailabilityOwner:'AvailabilityService / Auditor availability'}};
  if(typeof DPL_end_==='function')out.devPerformance=DPL_end_(perf,{returned:rows.length,auditors:Object.keys(byAud).length});
  return out;
}
