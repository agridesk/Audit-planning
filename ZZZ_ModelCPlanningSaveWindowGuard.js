/**
 * AMS-01.6 — canonical planning-window SAVE guard.
 *
 * Purpose:
 * - enforce the effective Model C planning window before Availability writeback;
 * - hard-block invalid/partial/conflicting canonical windows;
 * - hard-block any planned block outside the effective visit intersection;
 * - preserve AvailabilityService as availability owner after window validation.
 *
 * This file intentionally owns the deployed V5_availabilityValidate_ bridge.
 * The older bridge in ManagerPlanningBackend_CORE_SPLIT remains compatibility
 * code only. This file is prefixed ZZZ so the canonical bridge is loaded last
 * in the current GAS project file order; runtime acceptance below proves the
 * effective owner before this change is considered accepted.
 */
var MODEL_C_PLANNING_SAVE_WINDOW_GUARD_BUILD='2026-09-21_AMS_01_6_MODEL_C_PLANNING_SAVE_WINDOW_GUARD_R1';

function ModelCPlanningSaveWindowGuard_text_(v){
  return String(v===null||v===undefined?'':v).trim();
}

function ModelCPlanningSaveWindowGuard_row_(ss,auditId){
  auditId=ModelCPlanningSaveWindowGuard_text_(auditId);
  if(!auditId)return null;
  if(typeof __mp_getAuditPlanningRow_==='function'){
    var pack=__mp_getAuditPlanningRow_(ss,auditId);
    if(pack&&pack.row)return{hdr:pack.hdr||[],row:pack.row||[],rowNumber:pack.rowNumber||0};
  }
  var sh=ss.getSheetByName('Audit planning');
  if(!sh)return null;
  var values=sh.getDataRange().getValues();
  if(!values.length)return null;
  var hdr=values[0]||[];
  var ix=ModelCRuntime_headerIndex_(hdr,['Audit ID']);
  if(ix<0)return null;
  for(var r=1;r<values.length;r++){
    if(ModelCPlanningSaveWindowGuard_text_(values[r][ix])===auditId)return{hdr:hdr,row:values[r],rowNumber:r+1};
  }
  return null;
}

function ModelCPlanningSaveWindowGuard_validate_(auditId,blocks){
  var ss=SpreadsheetApp.getActive();
  auditId=ModelCPlanningSaveWindowGuard_text_(auditId);
  blocks=Array.isArray(blocks)?blocks:[];
  if(!auditId)return{success:false,hardBlock:true,build:MODEL_C_PLANNING_SAVE_WINDOW_GUARD_BUILD,reason:'MISSING_AUDIT_ID',message:'Missing auditId'};
  if(!blocks.length)return{success:false,hardBlock:true,build:MODEL_C_PLANNING_SAVE_WINDOW_GUARD_BUILD,reason:'NO_PLANNING_BLOCKS',message:'At least one planning block is required'};

  var pack=ModelCPlanningSaveWindowGuard_row_(ss,auditId);
  if(!pack)return{success:false,hardBlock:true,build:MODEL_C_PLANNING_SAVE_WINDOW_GUARD_BUILD,reason:'AUDIT_NOT_FOUND',message:'Audit not found: '+auditId};
  if(typeof ModelCRuntime_resolvePlanningWindow_!=='function')return{success:false,hardBlock:true,build:MODEL_C_PLANNING_SAVE_WINDOW_GUARD_BUILD,reason:'CANONICAL_WINDOW_OWNER_MISSING',message:'Canonical Model C planning-window owner unavailable'};

  var win=ModelCRuntime_resolvePlanningWindow_(ss,pack.hdr,pack.row);
  if(!win||win.success!==true||win.hardBlock===true){
    return{
      success:false,
      hardBlock:true,
      build:MODEL_C_PLANNING_SAVE_WINDOW_GUARD_BUILD,
      reason:ModelCPlanningSaveWindowGuard_text_(win&&win.reason)||'CANONICAL_WINDOW_INVALID',
      message:'Planning blocked by canonical Model C planning window',
      window:win||null
    };
  }

  var from=ModelCPlanningSaveWindowGuard_text_(win.startDate);
  var to=ModelCPlanningSaveWindowGuard_text_(win.endDate);
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(from)||!/^20\d{2}-\d{2}-\d{2}$/.test(to)||from>to){
    return{success:false,hardBlock:true,build:MODEL_C_PLANNING_SAVE_WINDOW_GUARD_BUILD,reason:'CANONICAL_WINDOW_INVALID_DATES',message:'Canonical planning window is invalid',window:win};
  }

  var outside=[];
  for(var i=0;i<blocks.length;i++){
    var d=ModelCPlanningSaveWindowGuard_text_(blocks[i]&&blocks[i].date);
    if(!/^20\d{2}-\d{2}-\d{2}$/.test(d)){
      outside.push({index:i,date:d,reason:'INVALID_BLOCK_DATE'});
      continue;
    }
    if(d<from||d>to)outside.push({index:i,date:d,reason:'OUTSIDE_CANONICAL_WINDOW'});
  }
  if(outside.length){
    return{
      success:false,
      hardBlock:true,
      build:MODEL_C_PLANNING_SAVE_WINDOW_GUARD_BUILD,
      reason:'BLOCK_OUTSIDE_CANONICAL_PLANNING_WINDOW',
      message:'Planning date falls outside the canonical planning window '+from+' to '+to,
      startDate:from,
      endDate:to,
      invalidBlocks:outside,
      window:win
    };
  }

  return{success:true,hardBlock:false,build:MODEL_C_PLANNING_SAVE_WINDOW_GUARD_BUILD,reason:'CANONICAL_WINDOW_OK',startDate:from,endDate:to,window:win};
}

/** Canonical deployed bridge used by saveManagerPlanning before writeback. */
function V5_availabilityValidate_(auditId,auditorEmail,auditorName,blocks){
  var guard=ModelCPlanningSaveWindowGuard_validate_(auditId,blocks);
  if(!guard||guard.success!==true)return guard;
  if(typeof AvailabilityService==='undefined'||!AvailabilityService||typeof AvailabilityService.validate!=='function'){
    return{success:false,hardBlock:true,build:MODEL_C_PLANNING_SAVE_WINDOW_GUARD_BUILD,reason:'AVAILABILITY_SERVICE_MISSING',message:'AvailabilityService.validate unavailable'};
  }
  var availability=AvailabilityService.validate(auditId,auditorEmail,auditorName,blocks);
  if(availability&&typeof availability==='object')availability.modelCPlanningWindowGuard={build:MODEL_C_PLANNING_SAVE_WINDOW_GUARD_BUILD,startDate:guard.startDate,endDate:guard.endDate,passed:true};
  return availability;
}

function RUN_MODEL_C_PLANNING_SAVE_WINDOW_GUARD_ACCEPTANCE(){
  var ss=SpreadsheetApp.getActive();
  var importPlan=ModelCEcasAnnualImport_buildPlan_(ss);
  var out={success:false,build:MODEL_C_PLANNING_SAVE_WINDOW_GUARD_BUILD,readOnly:true,writesPerformed:false,auditId:'',counts:{sourceRows:Number(importPlan&&importPlan.counts&&importPlan.counts.sourceRows||0),candidateAudits:0},gates:{},errors:[]};
  if(!importPlan||importPlan.success!==true){out.errors.push('ECAS import preview is not clean');Logger.log(JSON.stringify(out,null,2));return out;}

  var sourceUid={};
  (importPlan.actions||[]).forEach(function(a){if(a.companyUid&&a.action!=='STALE_CANONICAL_NOT_IN_SOURCE')sourceUid[String(a.companyUid)]=true;});
  var obSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS),lkSheet=ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS);
  if(!obSheet||!lkSheet){out.errors.push('Model C sheets missing');Logger.log(JSON.stringify(out,null,2));return out;}
  var obs=ModelCMigration_rowsToObjects_(obSheet.getDataRange().getValues()),links=ModelCMigration_rowsToObjects_(lkSheet.getDataRange().getValues()),obById={},auditObs={};
  obs.forEach(function(o){obById[String(o.Obligation_ID||'')]=o;});
  links.forEach(function(l){if(String(l.Link_State||'').toUpperCase()!=='ACTIVE')return;var o=obById[String(l.Obligation_ID||'')];if(!o)return;var st=String(o.Obligation_State||'').toUpperCase();if(st==='COMPLETED'||st==='CANCELLED'||st==='REJECTED')return;(auditObs[String(l.Audit_ID||'')]||(auditObs[String(l.Audit_ID||'')]=[])).push(o);});

  Object.keys(auditObs).some(function(aid){
    var list=auditObs[aid]||[],hasSourceAbc=false,hasRecurring=false;
    list.forEach(function(o){if(String(o.ScopeCode||'').toUpperCase()==='MPS-ABC'&&String(o.Trigger_Source||'').toUpperCase()==='ECAS'&&String(o.Cycle_Key||'')===String(importPlan.batchYear)&&sourceUid[String(o.Company_UID||'')])hasSourceAbc=true;if(ModelCRecurringConfig_isRecurring_(ss,String(o.ScopeCode||''))===true)hasRecurring=true;});
    if(hasSourceAbc&&!hasRecurring){out.counts.candidateAudits++;if(!out.auditId)out.auditId=aid;}
    return false;
  });
  if(!out.auditId){out.errors.push('No source-backed non-recurring-only ECAS audit found');Logger.log(JSON.stringify(out,null,2));return out;}

  var guard=ModelCPlanningSaveWindowGuard_validate_(out.auditId,[{date:'2027-01-01',start:'09:00',end:'10:00'}]);
  var bridge=V5_availabilityValidate_(out.auditId,'nobody@example.invalid','nobody',[{date:'2027-01-01',start:'09:00',end:'10:00'}]);
  out.gates.directGuardHardBlocks=!!(guard&&guard.success===false&&guard.hardBlock===true&&guard.reason==='BLOCK_OUTSIDE_CANONICAL_PLANNING_WINDOW');
  out.gates.deployedV5BridgeHardBlocks=!!(bridge&&bridge.success===false&&bridge.hardBlock===true&&bridge.reason==='BLOCK_OUTSIDE_CANONICAL_PLANNING_WINDOW');
  out.gates.effectiveWindowIsBatchYear=!!(guard&&guard.startDate===String(importPlan.batchYear)+'-01-01'&&guard.endDate===String(importPlan.batchYear)+'-12-31');
  out.gates.noAvailabilityWriteAttempted=out.gates.deployedV5BridgeHardBlocks;
  out.gates.readOnly=true;
  out.success=out.errors.length===0&&Object.keys(out.gates).every(function(k){return out.gates[k]===true;});
  Logger.log(JSON.stringify(out,null,2));
  if(!out.success)throw new Error('Model C planning SAVE-window guard acceptance failed');
  return out;
}
