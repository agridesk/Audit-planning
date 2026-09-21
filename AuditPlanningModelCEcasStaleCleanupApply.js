/**
 * AMS-01.6 Model C — ECAS stale canonical cleanup apply.
 *
 * Purpose:
 * - Remove stale current-batch MPS-ABC obligations that are absent from the
 *   explicit ECAS source batch.
 * - Preserve history: no canonical row is deleted.
 * - Company_Scope is deactivated only when no other open obligation remains
 *   on that Company_Scope.
 * - Stale obligation -> CANCELLED.
 * - Active visit link -> INACTIVE.
 * - Mixed visits are re-projected from their remaining active obligations.
 * - Pending Planning visits that become empty are terminalized in the legacy
 *   compatibility projection as Rejected so they no longer remain plannable.
 *
 * This file is migration/cleanup only. It is not a general runtime owner.
 */
var MODEL_C_ECAS_STALE_CLEANUP_APPLY_BUILD='2026-09-21_AMS_01_6_MODEL_C_ECAS_STALE_CLEANUP_APPLY_R1';

function RUN_MODEL_C_ECAS_STALE_CLEANUP_APPLY(){
  var ss=SpreadsheetApp.getActive();
  var lock=LockService.getScriptLock();
  lock.waitLock(20000);
  var snapshots=[];
  try{
    var readiness=RUN_MODEL_C_ECAS_STALE_CLEANUP_READINESS();
    if(!readiness||readiness.success!==true)throw new Error('Stale cleanup readiness is not green');
    if(Number(readiness.counts&&readiness.counts.staleCanonical||0)!==8)throw new Error('Expected exactly 8 stale canonical obligations, found '+Number(readiness.counts&&readiness.counts.staleCanonical||0));
    if(Number(readiness.counts&&readiness.counts.unsafeVisitStatus||0)!==0)throw new Error('Unsafe visit status present');

    var csSheet=ss.getSheetByName(MODEL_C_SHEETS.COMPANY_SCOPES);
    var obSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
    var lkSheet=ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS);
    var apSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING);
    if(!csSheet||!obSheet||!lkSheet||!apSheet)throw new Error('Required Model C sheet missing');

    snapshots=[
      ModelCScopeOwner_snapshotSheet_(csSheet),
      ModelCScopeOwner_snapshotSheet_(obSheet),
      ModelCScopeOwner_snapshotSheet_(lkSheet),
      ModelCScopeOwner_snapshotSheet_(apSheet)
    ];

    var cs=ModelCMigration_rowsToObjects_(csSheet.getDataRange().getValues());
    var ob=ModelCMigration_rowsToObjects_(obSheet.getDataRange().getValues());
    var lk=ModelCMigration_rowsToObjects_(lkSheet.getDataRange().getValues());
    var csById={},obById={},linkByAudit={};
    cs.forEach(function(x){var id=String(x.Company_Scope_ID||'').trim();if(id)csById[id]=x;});
    ob.forEach(function(x){var id=String(x.Obligation_ID||'').trim();if(id)obById[id]=x;});
    lk.forEach(function(x){var aid=String(x.Audit_ID||'').trim();if(!aid)return;(linkByAudit[aid]||(linkByAudit[aid]=[])).push(x);});

    var staleByOb={};
    (readiness.items||[]).forEach(function(item){staleByOb[String(item.obligationId||'').trim()]=item;});
    var stamp=new Date().toISOString();
    var cancelled=0,linksInactivated=0,scopesDeactivated=0,scopesKeptActive=0,mixedVisitsReprojected=0,emptyVisitsTerminalized=0;
    var affectedAuditIds={};

    Object.keys(staleByOb).forEach(function(obId){
      var item=staleByOb[obId],obligation=obById[obId];
      if(!obligation)throw new Error('Stale obligation missing at apply: '+obId);
      var state=String(obligation.Obligation_State||'').trim().toUpperCase();
      if(['COMPLETED','CANCELLED','REJECTED'].indexOf(state)>=0)throw new Error('Stale obligation already terminal at apply: '+obId);

      obligation.Obligation_State='CANCELLED';
      obligation.Closed_At=stamp;
      obligation.Updated_At=stamp;
      cancelled++;

      lk.forEach(function(link){
        if(String(link.Obligation_ID||'').trim()!==obId)return;
        if(String(link.Link_State||'').trim().toUpperCase()!=='ACTIVE')return;
        link.Link_State='INACTIVE';
        link.Unlinked_At=stamp;
        affectedAuditIds[String(link.Audit_ID||'').trim()]=true;
        linksInactivated++;
      });

      var csId=String(obligation.Company_Scope_ID||'').trim();
      var scope=csById[csId];
      if(!scope)throw new Error('Company_Scope missing for stale obligation '+obId);
      var otherOpenSameScope=ob.some(function(x){
        if(String(x.Company_Scope_ID||'').trim()!==csId)return false;
        if(String(x.Obligation_ID||'').trim()===obId)return false;
        var s=String(x.Obligation_State||'').trim().toUpperCase();
        return ['COMPLETED','CANCELLED','REJECTED'].indexOf(s)<0;
      });
      if(otherOpenSameScope){scopesKeptActive++;}
      else{
        scope.Active='NO';
        scope.Updated_At=stamp;
        scopesDeactivated++;
      }
    });

    ModelCScopeOwner_writeObjects_(csSheet,MODEL_C_SCHEMA.Company_Scopes,cs,['Certificate_Birthday']);
    ModelCScopeOwner_writeObjects_(obSheet,MODEL_C_SCHEMA.Audit_Obligations,ob,['Cycle_Key','Base_Expiry_Date','Effective_Expiry_Date','Planning_Window_From','Planning_Window_To']);
    ModelCScopeOwner_writeObjects_(lkSheet,MODEL_C_SCHEMA.Audit_Visit_Obligations,lk);
    SpreadsheetApp.flush();

    var refreshedOb=ModelCMigration_rowsToObjects_(obSheet.getDataRange().getValues());
    var refreshedLk=ModelCMigration_rowsToObjects_(lkSheet.getDataRange().getValues());
    var refreshedObById={};
    refreshedOb.forEach(function(x){refreshedObById[String(x.Obligation_ID||'').trim()]=x;});

    var apValues=apSheet.getDataRange().getValues();
    var apHeaders=apValues[0]||[];
    var apMap=ModelCFoundation_headerMap_(apHeaders);
    var ixAudit=ModelCEcasVisitMaterialization_header_(apMap,['Audit ID']);
    var ixStatus=ModelCEcasVisitMaterialization_header_(apMap,['Status']);
    if(ixAudit<0||ixStatus<0)throw new Error('Audit planning missing Audit ID or Status');
    var apRowByAudit={};
    for(var r=1;r<apValues.length;r++){
      var aid=String(apValues[r][ixAudit]||'').trim();
      if(aid)apRowByAudit[aid]=r+1;
    }

    Object.keys(affectedAuditIds).forEach(function(auditId){
      if(!auditId)return;
      var activeObs=[];
      refreshedLk.forEach(function(link){
        if(String(link.Audit_ID||'').trim()!==auditId)return;
        if(String(link.Link_State||'').trim().toUpperCase()!=='ACTIVE')return;
        var x=refreshedObById[String(link.Obligation_ID||'').trim()];
        if(!x)return;
        var s=String(x.Obligation_State||'').trim().toUpperCase();
        if(['COMPLETED','CANCELLED','REJECTED'].indexOf(s)>=0)return;
        activeObs.push(x);
      });

      if(activeObs.length){
        var selected={};
        activeObs.forEach(function(x){
          var code=String(x.ScopeCode||'').trim();
          if(!code)return;
          selected[code]={scopeCode:code,formalHours:Number(String(x.Formal_Hours==null?'':x.Formal_Hours).replace(',','.'))||0,recurring:ModelCRecurringConfig_isRecurring_(ss,code)};
        });
        ModelCScopeOwner_projectLegacy_(apSheet,{auditId:auditId},selected,refreshedOb,refreshedLk,ss);
        mixedVisitsReprojected++;
      }else{
        var rowNum=apRowByAudit[auditId];
        if(!rowNum)throw new Error('Audit planning row missing for empty stale visit '+auditId);
        var currentStatus=String(apSheet.getRange(rowNum,ixStatus+1).getValue()||'').trim().toUpperCase().replace(/_/g,' ');
        if(['PENDING PLANNING','PENDING'].indexOf(currentStatus)<0)throw new Error('Empty stale visit is no longer safely terminalizable: '+auditId+' status='+currentStatus);
        apSheet.getRange(rowNum,ixStatus+1).setValue('Rejected');
        emptyVisitsTerminalized++;
      }
    });

    SpreadsheetApp.flush();
    if(typeof __mp_invalidateAuditPlanningPack_==='function')__mp_invalidateAuditPlanningPack_();

    var verifyImport=ModelCEcasAnnualImport_buildPlan_(ss);
    if(!verifyImport||verifyImport.success!==true)throw new Error('Post-cleanup ECAS import preview failed');
    if(Number(verifyImport.counts&&verifyImport.counts.staleCanonicalNotInSource||0)!==0)throw new Error('Post-cleanup stale canonical count is not zero');

    var verifyReadiness=RUN_MODEL_C_ECAS_STALE_CLEANUP_READINESS();
    if(!verifyReadiness||verifyReadiness.success!==true)throw new Error('Post-cleanup stale readiness failed');
    if(Number(verifyReadiness.counts&&verifyReadiness.counts.staleCanonical||0)!==0)throw new Error('Post-cleanup stale readiness still finds stale obligations');

    var out={
      success:true,
      build:MODEL_C_ECAS_STALE_CLEANUP_APPLY_BUILD,
      batchYear:String(verifyImport.batchYear||''),
      writesPerformed:true,
      counts:{
        staleProcessed:Object.keys(staleByOb).length,
        obligationsCancelled:cancelled,
        linksInactivated:linksInactivated,
        scopesDeactivated:scopesDeactivated,
        scopesKeptActive:scopesKeptActive,
        mixedVisitsReprojected:mixedVisitsReprojected,
        emptyVisitsTerminalized:emptyVisitsTerminalized,
        staleRemaining:Number(verifyImport.counts&&verifyImport.counts.staleCanonicalNotInSource||0),
        sourceRows:Number(verifyImport.counts&&verifyImport.counts.sourceRows||0)
      },
      gates:{
        readinessGreen:true,
        historyPreserved:true,
        noCanonicalRowsDeleted:true,
        staleRemainingZero:Number(verifyImport.counts&&verifyImport.counts.staleCanonicalNotInSource||0)===0,
        sourceRowsPreserved:Number(verifyImport.counts&&verifyImport.counts.sourceRows||0)===49,
        emptyVisitsNoLongerPlannable:true,
        mixedVisitsReprojected:true
      },
      errors:[]
    };
    Logger.log(JSON.stringify(out,null,2));
    return out;
  }catch(e){
    for(var i=snapshots.length-1;i>=0;i--){try{ModelCScopeOwner_restoreSnapshot_(snapshots[i]);}catch(ignore){}}
    try{SpreadsheetApp.flush();}catch(ignoreFlush){}
    try{if(typeof __mp_invalidateAuditPlanningPack_==='function')__mp_invalidateAuditPlanningPack_();}catch(ignoreCache){}
    throw e;
  }finally{
    try{lock.releaseLock();}catch(ignoreLock){}
  }
}
