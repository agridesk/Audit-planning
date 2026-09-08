/**
 * FILE: zz_AMS01_PlanSingleWritePerfOverride.js
 * BUILD: AMS01_PLAN_SINGLE_WRITE_PERF_ZZ_20260908_R1
 * DEV-only PLAN optimization.
 *
 * Purpose:
 * - Collapse PLAN core row mutation + lifecycle metadata stamps into one Audit planning row write.
 * - Preserve canonical Status_validateAndBuildPlanning_, transition outcome,
 *   lifecycle invalidation and lifecycle audit-trail side effects.
 * - Preserve Date - Planned text format safeguard.
 *
 * No status, planning, availability or notification decision semantics changed.
 */
var AMS01_PLAN_SINGLE_WRITE_PERF_ZZ_BUILD='AMS01_PLAN_SINGLE_WRITE_PERF_ZZ_20260908_R1';

(function(){
  if(typeof Status_applyPlan_!=='function') return;

  function clean_(v){ return String(v==null?'':v).trim(); }
  function idx_(hdr,candidates){
    if(typeof lifecycle_findHeaderIndex_==='function') return lifecycle_findHeaderIndex_(hdr,candidates);
    candidates=Array.isArray(candidates)?candidates:[candidates];
    var norm=function(x){return clean_(x).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();};
    var wanted={};
    for(var i=0;i<candidates.length;i++) wanted[norm(candidates[i])]=true;
    for(var j=0;j<(hdr||[]).length;j++) if(wanted[norm(hdr[j])]) return j;
    return -1;
  }
  function stamp_(){
    if(typeof lifecycle_nowStamp_==='function') return lifecycle_nowStamp_();
    return Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm:ss');
  }
  function lifecycleResult_(ctx,transition,actor,payload,stamp,statusSinceWritten,managerMetadataWritten,auditorMetadataWritten){
    var lcCtx={
      auditId:ctx.auditId,
      action:'PLAN',
      actorRole:actor,
      actorEmail:payload&&payload.actorEmail||'',
      beforeStatus:transition.beforeStatus,
      beforeStatusDisplay:transition.beforeStatusDisplay,
      afterStatus:transition.afterStatus,
      afterStatusDisplay:transition.afterStatusDisplay,
      reason:payload&&(payload.reason||payload.comment||payload.managerComment||''),
      source:'CoreStatusMachine.Status_applyPlan_',
      sheet:ctx.sheet,
      rowIndex:ctx.rowIndex,
      headers:ctx.hdr,
      row:ctx.row,
      payload:payload||{}
    };
    var invalidation={success:true,skipped:true};
    var auditTrail={success:true,skipped:true};
    try{ if(typeof Lifecycle_invalidateAfterLifecycleChange_==='function') invalidation=Lifecycle_invalidateAfterLifecycleChange_(lcCtx); }catch(e1){ invalidation={success:false,message:String(e1&&e1.message?e1.message:e1)}; }
    try{ if(typeof Lifecycle_emitAuditTrail_==='function') auditTrail=Lifecycle_emitAuditTrail_(lcCtx,stamp); }catch(e2){ auditTrail={success:false,message:String(e2&&e2.message?e2.message:e2)}; }
    return {
      success:true,
      build:AMS01_PLAN_SINGLE_WRITE_PERF_ZZ_BUILD,
      auditId:ctx.auditId,
      action:'PLAN',
      actorRole:actor,
      source:'CoreStatusMachine.Status_applyPlan_',
      beforeStatus:transition.beforeStatusDisplay||transition.beforeStatus||'',
      afterStatus:transition.afterStatusDisplay||transition.afterStatus||'',
      statusChanged:true,
      managerMetadataWritten:!!managerMetadataWritten,
      auditorMetadataWritten:!!auditorMetadataWritten,
      statusSinceWritten:!!statusSinceWritten,
      invalidation:invalidation,
      auditTrail:auditTrail,
      warnings:[]
    };
  }

  Status_applyPlan_=function(ctx,transition,payload,actorFromDispatcher,actionFromDispatcher){
    var t0=Date.now();
    payload=payload||{};
    var actor=Status_normalizeRole_(payload.actorRole||payload.role||actorFromDispatcher||'');
    var res=Status_validateAndBuildPlanning_(payload);
    if(!res.success) return res;

    var row=(ctx.row||[]).slice();
    while(row.length<ctx.hdr.length) row.push('');

    if(ctx.col.json>=0) row[ctx.col.json]=JSON.stringify(res.json);
    if(ctx.col.assigned>=0) row[ctx.col.assigned]=payload.auditorEmail||payload.auditorName||'';
    if(ctx.col.planned>=0) row[ctx.col.planned]=res.json.blocks[0].date;
    if(ctx.col.hours>=0) row[ctx.col.hours]=res.json.totalPlannedHours;

    var effectiveAfterStatusDisplay=transition.afterStatusDisplay;
    if(actor===ROLE.MANAGER) effectiveAfterStatusDisplay='Approved';
    else if(actor===ROLE.AUDITOR) effectiveAfterStatusDisplay='Pending Approval';

    row[ctx.col.status]=effectiveAfterStatusDisplay;
    if(ctx.col.approved>=0){
      row[ctx.col.approved]=(actor===ROLE.MANAGER)
        ? Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd')
        : '';
    }

    var stamp=stamp_();
    var statusSinceWritten=false;
    var managerMetadataWritten=false;
    var auditorMetadataWritten=false;

    var iStatusSince=idx_(ctx.hdr,['Status since']);
    if(iStatusSince>=0){ row[iStatusSince]=stamp; statusSinceWritten=true; }

    var reason=clean_(payload.reason||payload.comment||payload.managerComment||'');
    if(actor===ROLE.MANAGER){
      var iDecision=idx_(ctx.hdr,['Last manager decision']);
      var iDecisionTs=idx_(ctx.hdr,['Last decision timestamp']);
      var iMgrComment=idx_(ctx.hdr,['Manager comment (last)']);
      if(iDecision>=0){ row[iDecision]='PLAN'; managerMetadataWritten=true; }
      if(iDecisionTs>=0){ row[iDecisionTs]=stamp; managerMetadataWritten=true; }
      if(iMgrComment>=0){ row[iMgrComment]=reason; managerMetadataWritten=true; }
    }else if(actor===ROLE.AUDITOR){
      var iAudDecision=idx_(ctx.hdr,['Last auditor decision']);
      var iAudTs=idx_(ctx.hdr,['Last auditor decision timestamp']);
      var iAudComment=idx_(ctx.hdr,['Auditor comment (last)']);
      if(iAudDecision>=0){ row[iAudDecision]='PLAN'; auditorMetadataWritten=true; }
      if(iAudTs>=0){ row[iAudTs]=stamp; auditorMetadataWritten=true; }
      if(iAudComment>=0){ row[iAudComment]=reason; auditorMetadataWritten=true; }
    }

    if(ctx.col.planned>=0 && res.json.blocks[0] && res.json.blocks[0].date){
      ctx.sheet.getRange(ctx.rowIndex,ctx.col.planned+1).setNumberFormat('@');
    }
    ctx.sheet.getRange(ctx.rowIndex,1,1,row.length).setValues([row]);

    var effectiveTransition={
      beforeStatus:transition.beforeStatus,
      beforeStatusDisplay:transition.beforeStatusDisplay,
      afterStatus:Status_normalizeStatus_(effectiveAfterStatusDisplay),
      afterStatusDisplay:effectiveAfterStatusDisplay
    };

    var lifecycle=lifecycleResult_(ctx,effectiveTransition,actorFromDispatcher||actor,payload,stamp,statusSinceWritten,managerMetadataWritten,auditorMetadataWritten);
    Status_invalidateAuditPlanningPack_();

    var actionResult=Status_buildActionResult_(effectiveTransition,{
      action:ACTION.PLAN,
      auditId:ctx.auditId,
      planningJson:JSON.stringify(res.json),
      plannedDate:res.json.blocks[0].date,
      assignedTo:payload.auditorEmail||payload.auditorName||'',
      hoursPlanned:res.json.totalPlannedHours
    });
    actionResult.lifecycle=lifecycle;
    actionResult.metadataWritten=!!(managerMetadataWritten||auditorMetadataWritten||statusSinceWritten);
    actionResult.ams01SingleWrite={build:AMS01_PLAN_SINGLE_WRITE_PERF_ZZ_BUILD,ms:Date.now()-t0};
    try{ Logger.log('[AMS01_PLAN_SINGLE_WRITE] '+JSON.stringify(actionResult.ams01SingleWrite)); }catch(eLog){}
    return actionResult;
  };
})();

function AMS01_PlanSingleWritePerfStatus(){
  return {success:true,active:true,build:AMS01_PLAN_SINGLE_WRITE_PERF_ZZ_BUILD};
}
