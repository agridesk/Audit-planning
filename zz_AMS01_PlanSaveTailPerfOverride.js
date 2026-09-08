/**
 * FILE: zz_AMS01_PlanSaveTailPerfOverride.js
 * BUILD: AMS01_PLAN_SAVE_TAIL_PERF_ZZ_20260908_R2
 * DEV-only late-load optimization/instrumentation for real PLAN saves.
 *
 * Changes:
 * - Successful PLAN notification BEFORE/AFTER diagnostics no longer append
 *   synchronously to Diagnostics_Log. Logger evidence remains. Failure diagnostics
 *   and all non-PLAN diagnostics retain canonical behavior.
 * - Lifecycle metadata writes are grouped by contiguous columns to reduce
 *   Spreadsheet service calls while preserving exactly the same cell values.
 * - Adds timing around availability validate/writeback, Status_applyPlan_, the
 *   complete lifecycle side-effect call and lifecycle audit-trail append so the
 *   next normal DEV PLAN save identifies any remaining hot tail.
 *
 * No status, transition, planning, availability, queue, audit-trail or cache truth
 * is changed.
 */
var AMS01_PLAN_SAVE_TAIL_PERF_ZZ_BUILD='AMS01_PLAN_SAVE_TAIL_PERF_ZZ_20260908_R2';

(function(){
  function log_(tag,obj){
    try{ Logger.log(tag+' '+JSON.stringify(obj||{})); }catch(e){}
  }

  if(typeof Status_diagLog_==='function'){
    var canonicalStatusDiag_=Status_diagLog_;
    Status_diagLog_=function(diagType,auditId,details){
      var action=String((details&&details.action)||'').trim().toUpperCase();
      var type=String(diagType||'').trim();
      if(action==='PLAN'&&(type==='STATUS_NOTIFY_BEFORE_BRIDGE'||type==='STATUS_NOTIFY_AFTER_BRIDGE')){
        log_('[AMS01_PLAN_DIAG_SKIP]',{build:AMS01_PLAN_SAVE_TAIL_PERF_ZZ_BUILD,type:type,auditId:String(auditId||'').trim(),action:action});
        return {success:true,skipped:true,reason:'AMS01_PLAN_SUCCESS_DIAGNOSTIC_LOGGER_ONLY',build:AMS01_PLAN_SAVE_TAIL_PERF_ZZ_BUILD};
      }
      return canonicalStatusDiag_(diagType,auditId,details);
    };
  }

  if(typeof lifecycle_writeUpdates_==='function'){
    lifecycle_writeUpdates_=function(sheet,rowIndex,updates,label){
      updates=updates||[];
      if(!sheet||!rowIndex) return {success:false,written:false,warning:'Missing sheet target for '+label};
      if(!updates.length) return {success:true,written:false,warning:'No matching columns for '+label};
      var t0=Date.now();
      try{
        var sorted=updates.slice().sort(function(a,b){return Number(a.col||0)-Number(b.col||0);});
        var groups=[];
        var current=[];
        for(var i=0;i<sorted.length;i++){
          var u=sorted[i]||{};
          if(!current.length||Number(u.col)===Number(current[current.length-1].col)+1){
            current.push(u);
          }else{
            groups.push(current); current=[u];
          }
        }
        if(current.length) groups.push(current);
        for(var g=0;g<groups.length;g++){
          var grp=groups[g];
          var first=Number(grp[0].col);
          if(grp.length===1){
            sheet.getRange(rowIndex,first).setValue(grp[0].value);
          }else{
            var vals=[grp.map(function(x){return x.value;})];
            sheet.getRange(rowIndex,first,1,grp.length).setValues(vals);
          }
        }
        log_('[AMS01_LIFECYCLE_WRITE]',{build:AMS01_PLAN_SAVE_TAIL_PERF_ZZ_BUILD,label:String(label||''),updates:updates.length,groups:groups.length,ms:Date.now()-t0});
        return {success:true,written:true,count:updates.length,groups:groups.length,build:AMS01_PLAN_SAVE_TAIL_PERF_ZZ_BUILD};
      }catch(e){
        return {success:false,written:false,warning:'Write failed for '+label+': '+String(e&&e.message?e.message:e)};
      }
    };
  }

  if(typeof AS_availabilityValidate_==='function'){
    var canonicalAvailValidate_=AS_availabilityValidate_;
    AS_availabilityValidate_=function(){
      var t0=Date.now();
      var res=canonicalAvailValidate_.apply(this,arguments);
      log_('[AMS01_PLAN_AVAIL_VALIDATE]',{build:AMS01_PLAN_SAVE_TAIL_PERF_ZZ_BUILD,ms:Date.now()-t0,success:!!(res&&res.success!==false)});
      return res;
    };
  }

  if(typeof AS_availabilityWriteBack_==='function'){
    var canonicalAvailWrite_=AS_availabilityWriteBack_;
    AS_availabilityWriteBack_=function(){
      var t0=Date.now();
      var res=canonicalAvailWrite_.apply(this,arguments);
      log_('[AMS01_PLAN_AVAIL_WRITE]',{build:AMS01_PLAN_SAVE_TAIL_PERF_ZZ_BUILD,ms:Date.now()-t0,success:!!(res&&res.success!==false)});
      return res;
    };
  }

  if(typeof managerV5_appendAuditTrailToNotificationQueue_==='function'){
    var canonicalAuditTrail_=managerV5_appendAuditTrailToNotificationQueue_;
    managerV5_appendAuditTrailToNotificationQueue_=function(){
      var t0=Date.now();
      var res=canonicalAuditTrail_.apply(this,arguments);
      log_('[AMS01_PLAN_AUDIT_TRAIL]',{build:AMS01_PLAN_SAVE_TAIL_PERF_ZZ_BUILD,ms:Date.now()-t0,success:!!(res&&res.success!==false)});
      return res;
    };
  }

  if(typeof Lifecycle_onStatusChanged_==='function'){
    var canonicalLifecycle_=Lifecycle_onStatusChanged_;
    Lifecycle_onStatusChanged_=function(ctx){
      var t0=Date.now();
      var res=canonicalLifecycle_.apply(this,arguments);
      var action=String((ctx&&ctx.action)||'').trim().toUpperCase();
      if(action==='PLAN'){
        log_('[AMS01_PLAN_LIFECYCLE]',{build:AMS01_PLAN_SAVE_TAIL_PERF_ZZ_BUILD,ms:Date.now()-t0,success:!!(res&&res.success!==false),statusSinceWritten:!!(res&&res.statusSinceWritten),managerMetadataWritten:!!(res&&res.managerMetadataWritten)});
      }
      return res;
    };
  }

  if(typeof Status_applyPlan_==='function'){
    var canonicalApplyPlan_=Status_applyPlan_;
    Status_applyPlan_=function(){
      var t0=Date.now();
      var res=canonicalApplyPlan_.apply(this,arguments);
      log_('[AMS01_PLAN_STATUS_CORE]',{build:AMS01_PLAN_SAVE_TAIL_PERF_ZZ_BUILD,ms:Date.now()-t0,success:!!(res&&res.success!==false)});
      return res;
    };
  }
})();

function AMS01_PlanSaveTailPerfStatus(){
  return {success:true,active:true,build:AMS01_PLAN_SAVE_TAIL_PERF_ZZ_BUILD};
}
