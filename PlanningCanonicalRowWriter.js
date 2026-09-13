/***********************************************************************
 * PlanningCanonicalRowWriter.js
 * BUILD: 2026-09-13_ROADMAP_2_4_CANONICAL_ROW_WRITER_R2_PREVALIDATE
 *
 * Canonical Audit planning row validation + write boundary.
 * Availability remains owned by PlanningCanonicalAvailabilityAdapter.
 *
 * R2:
 *   - exposes a read-only validation step for callers that must validate
 *     before mutating Availability;
 *   - returns concrete hard-block codes/messages including planned vs
 *     required hours;
 *   - execute may reuse a validation result while the caller holds the same
 *     planning lock, avoiding a second validation scan.
 ***********************************************************************/
var PLANNING_CANONICAL_ROW_WRITER_BUILD='2026-09-13_ROADMAP_2_4_CANONICAL_ROW_WRITER_R2_PREVALIDATE';

function PCRW_clean_(v){return String(v==null?'':v).trim();}
function PCRW_roundHours_(v){return Math.round((Number(v)||0)*100)/100;}
function PCRW_reason_(arr,fallback){
  if(Array.isArray(arr)&&arr.length){
    var first=arr[0]||{};
    if(PCRW_clean_(first.reason))return PCRW_clean_(first.reason);
  }
  return fallback||'Planning validation failed';
}
function PCRW_fail_(code,message,plannedHours,requiredHours,hard,soft){
  return{
    success:false,
    code:code||'PLANNING_VALIDATION_FAILED',
    reason:code||'PLANNING_VALIDATION_FAILED',
    message:message||'Planning validation failed',
    plannedHours:PCRW_roundHours_(plannedHours),
    requiredHours:PCRW_roundHours_(requiredHours),
    softConflicts:Array.isArray(soft)?soft:[],
    hardConflicts:Array.isArray(hard)?hard:[],
    meta:{writes:false,readOnly:true,validationOnly:true,build:PLANNING_CANONICAL_ROW_WRITER_BUILD}
  };
}

function PlanningCanonicalRowWriter_validate(rowInfo,transition,opts){
  opts=opts||{};
  var nb=normalizeBlocks_(opts.blocks||[]);
  var reqH=Number(rowInfo&&rowInfo.requiredHours||0);
  if(nb.hard.length){
    return PCRW_fail_('INVALID_PLANNING_BLOCKS',PCRW_reason_(nb.hard,'Invalid planning block(s)'),0,reqH,nb.hard,[]);
  }

  var blocksN=nb.blocks;
  var sumH=blocksN.reduce(function(a,b){return a+Number(b.hours||0);},0);
  if(sumH<reqH){
    var hoursHard=[{date:null,reason:'Planned hours '+PCRW_roundHours_(sumH)+' are below required '+PCRW_roundHours_(reqH)+' hours'}];
    return PCRW_fail_('PLANNED_HOURS_BELOW_REQUIRED',hoursHard[0].reason,sumH,reqH,hoursHard,[]);
  }

  var auditorOwner=PCRW_clean_(opts.auditorEmail||opts.auditorName);
  if(!auditorOwner){
    return PCRW_fail_('AUDITOR_OWNER_MISSING','Missing auditor owner for planning',sumH,reqH,[],[]);
  }

  var hard=checkHardConflicts_(rowInfo.ctx,rowInfo,blocksN,auditorOwner,opts.auditId);
  if(hard.length){
    return PCRW_fail_('PLANNING_HARD_CONFLICT',PCRW_reason_(hard,'Planning hard conflict'),sumH,reqH,hard,[]);
  }

  var softObj=checkSoftConflicts_(rowInfo.ctx,rowInfo,blocksN,auditorOwner,{allowWeekend:opts.allowWeekend!==false});
  if(softObj.hard.length){
    return PCRW_fail_('PLANNING_SOFT_RULE_ESCALATED',PCRW_reason_(softObj.hard,'Planning rule blocks this schedule'),sumH,reqH,softObj.hard,softObj.soft);
  }

  return{
    success:true,
    code:'OK',
    reason:'VALIDATION_OK',
    message:'Planning validation OK',
    blocks:blocksN,
    auditorOwner:auditorOwner,
    plannedHours:PCRW_roundHours_(sumH),
    requiredHours:PCRW_roundHours_(reqH),
    softConflicts:softObj.soft||[],
    hardConflicts:[],
    meta:{writes:false,readOnly:true,validationOnly:true,build:PLANNING_CANONICAL_ROW_WRITER_BUILD}
  };
}

function PlanningCanonicalRowWriter_execute(rowInfo,transition,opts){
  opts=opts||{};
  var validation=opts.prevalidated&&opts.prevalidated.success===true?opts.prevalidated:PlanningCanonicalRowWriter_validate(rowInfo,transition,opts);
  if(!validation||validation.success!==true)return validation||PCRW_fail_('PLANNING_VALIDATION_FAILED','Planning validation failed',0,Number(rowInfo&&rowInfo.requiredHours||0),[],[]);

  var blocksN=validation.blocks||[];
  var reqH=Number(validation.requiredHours||0);
  var sumH=Number(validation.plannedHours||0);
  var auditorOwner=validation.auditorOwner||PCRW_clean_(opts.auditorEmail||opts.auditorName);
  var planningJson={
    blocks:blocksN,
    totalPlannedHours:sumH,
    auditorEmail:opts.auditorEmail||'',
    auditorName:opts.auditorName||''
  };

  var row=rowInfo.row.slice();
  while(row.length<rowInfo.ctx.hdr.length)row.push('');
  if(rowInfo.ctx.colJson>0)row[rowInfo.ctx.colJson-1]=JSON.stringify(planningJson);
  if(rowInfo.ctx.colAssigned>0)row[rowInfo.ctx.colAssigned-1]=auditorOwner;
  if(rowInfo.ctx.colDatePlanned>0)row[rowInfo.ctx.colDatePlanned-1]=blocksN[0].date;
  if(rowInfo.ctx.colStatus>0)row[rowInfo.ctx.colStatus-1]=transition.afterStatusDisplay;
  rowInfo.ctx.sh.getRange(rowInfo.rowIndex,1,1,row.length).setValues([row]);
  Planning_invalidate_();

  return{
    success:true,
    code:'OK',
    action:opts.isReschedule?'RESCHEDULE':'PLAN',
    auditId:PCRW_clean_(opts.auditId),
    beforeStatus:transition.beforeStatus,
    beforeStatusDisplay:transition.beforeStatusDisplay,
    newStatus:transition.afterStatusDisplay,
    afterStatus:transition.afterStatus,
    afterStatusDisplay:transition.afterStatusDisplay,
    planningJson:JSON.stringify(planningJson),
    plannedDate:blocksN[0].date,
    plannedDates:blocksN.map(function(b){return b.date;}),
    assignedTo:auditorOwner,
    hoursPlanned:sumH,
    plannedHours:sumH,
    requiredHours:reqH,
    softConflicts:validation.softConflicts||[],
    hardConflicts:[],
    meta:{availabilityWrites:false,canonicalAvailabilityHandledBy:'PlanningCanonicalAvailabilityAdapter',prevalidated:opts.prevalidated&&opts.prevalidated.success===true,build:PLANNING_CANONICAL_ROW_WRITER_BUILD}
  };
}
