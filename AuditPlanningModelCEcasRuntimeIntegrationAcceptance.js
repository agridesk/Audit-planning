/**
 * AMS-01.6 Model C — ECAS MPS-ABC runtime integration acceptance.
 * Read-only. Verifies that every source-backed open ECAS obligation for the
 * explicit batch is materialized, has an effective Model C planning window,
 * and resolves Toolkit cycle-year from canonical Model C data.
 */
var MODEL_C_ECAS_RUNTIME_INTEGRATION_ACCEPTANCE_BUILD='2026-09-21_AMS_01_6_MODEL_C_ECAS_RUNTIME_INTEGRATION_ACCEPTANCE_R1';

function RUN_MODEL_C_ECAS_RUNTIME_INTEGRATION_ACCEPTANCE(){
  var ss=SpreadsheetApp.getActive();
  var importPlan=ModelCEcasAnnualImport_buildPlan_(ss);
  var out={
    success:false,
    build:MODEL_C_ECAS_RUNTIME_INTEGRATION_ACCEPTANCE_BUILD,
    batchYear:String(importPlan&&importPlan.batchYear||''),
    readOnly:true,
    writesPerformed:false,
    counts:{
      sourceRows:0,
      sourceBackedOpenObligations:0,
      linkedVisits:0,
      planningWindowResolved:0,
      cycleFallbackWindows:0,
      explicitWindows:0,
      planningWindowHardBlocks:0,
      toolkitCycleResolved:0,
      toolkitCycleMismatches:0,
      missingAuditPlanningRows:0,
      companyMismatches:0
    },
    gates:{},
    errors:[],
    invalid:[]
  };

  if(!importPlan||importPlan.success!==true){
    out.errors.push('ECAS import preview is not clean');
    Logger.log(JSON.stringify(out,null,2));
    throw new Error(out.errors.join('; '));
  }
  out.counts.sourceRows=Number(importPlan.counts&&importPlan.counts.sourceRows||0);

  var sourceUid={};
  (importPlan.actions||[]).forEach(function(a){
    if(a.companyUid&&a.action!=='STALE_CANONICAL_NOT_IN_SOURCE')sourceUid[String(a.companyUid)]=true;
  });

  var obSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
  var lkSheet=ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS);
  var apSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING);
  if(!obSheet||!lkSheet||!apSheet){
    out.errors.push('Required Model C sheet missing');
    Logger.log(JSON.stringify(out,null,2));
    throw new Error(out.errors.join('; '));
  }

  var obligations=ModelCMigration_rowsToObjects_(obSheet.getDataRange().getValues());
  var links=ModelCMigration_rowsToObjects_(lkSheet.getDataRange().getValues());
  var apValues=apSheet.getDataRange().getValues();
  var apHeaders=apValues[0]||[];
  var apMap=ModelCFoundation_headerMap_(apHeaders);
  var ixAudit=ModelCEcasVisitMaterialization_header_(apMap,['Audit ID']);
  var ixCompany=ModelCEcasVisitMaterialization_header_(apMap,['Company_UID','Company UID']);
  if(ixAudit<0||ixCompany<0){
    out.errors.push('Audit planning missing Audit ID or Company_UID');
    Logger.log(JSON.stringify(out,null,2));
    throw new Error(out.errors.join('; '));
  }

  var apByAudit={};
  for(var r=1;r<apValues.length;r++){
    var auditId=String(apValues[r][ixAudit]||'').trim();
    if(auditId)apByAudit[auditId]={row:apValues[r],companyUid:String(apValues[r][ixCompany]||'').trim()};
  }

  var activeLinksByOb={};
  links.forEach(function(link){
    if(String(link.Link_State||'').trim().toUpperCase()!=='ACTIVE')return;
    var obId=String(link.Obligation_ID||'').trim();
    if(!obId)return;
    (activeLinksByOb[obId]||(activeLinksByOb[obId]=[])).push(link);
  });

  obligations.forEach(function(ob){
    var scope=String(ob.ScopeCode||'').trim().toUpperCase();
    var trigger=String(ob.Trigger_Source||'').trim().toUpperCase();
    var cycle=String(ob.Cycle_Key||'').trim();
    var state=String(ob.Obligation_State||'').trim().toUpperCase();
    var uid=String(ob.Company_UID||'').trim();
    if(scope!=='MPS-ABC'||trigger!=='ECAS'||cycle!==out.batchYear||['COMPLETED','CANCELLED','REJECTED'].indexOf(state)>=0||!sourceUid[uid])return;

    out.counts.sourceBackedOpenObligations++;
    var own=activeLinksByOb[String(ob.Obligation_ID||'')]||[];
    if(own.length!==1){
      out.invalid.push({obligationId:String(ob.Obligation_ID||''),reason:'ACTIVE_LINK_COUNT_'+own.length});
      return;
    }

    var auditId=String(own[0].Audit_ID||'').trim();
    out.counts.linkedVisits++;
    var ap=apByAudit[auditId];
    if(!ap){
      out.counts.missingAuditPlanningRows++;
      out.invalid.push({obligationId:String(ob.Obligation_ID||''),auditId:auditId,reason:'AUDIT_PLANNING_ROW_MISSING'});
      return;
    }
    if(ap.companyUid&&ap.companyUid!==uid){
      out.counts.companyMismatches++;
      out.invalid.push({obligationId:String(ob.Obligation_ID||''),auditId:auditId,reason:'COMPANY_MISMATCH'});
    }

    var win=ModelCRuntime_resolvePlanningWindow_(ss,apHeaders,ap.row);
    if(win&&win.success===true&&!win.hardBlock){
      out.counts.planningWindowResolved++;
      var ownWindow=(win.scopeWindows||[]).filter(function(x){return String(x.scope||'').trim().toUpperCase()==='MPS-ABC';})[0]||null;
      if(ownWindow&&String(ownWindow.mode||'')==='NON_RECURRING_CYCLE_YEAR_FALLBACK')out.counts.cycleFallbackWindows++;
      else if(ownWindow)out.counts.explicitWindows++;
    }else{
      if(win&&win.hardBlock)out.counts.planningWindowHardBlocks++;
      out.invalid.push({obligationId:String(ob.Obligation_ID||''),auditId:auditId,reason:'PLANNING_WINDOW_'+String(win&&win.reason||'UNRESOLVED')});
    }

    var toolkitYear=ModelCToolkitCycle_yearForAudit_(ss,auditId);
    if(Number(toolkitYear)===Number(out.batchYear))out.counts.toolkitCycleResolved++;
    else{
      out.counts.toolkitCycleMismatches++;
      out.invalid.push({obligationId:String(ob.Obligation_ID||''),auditId:auditId,reason:'TOOLKIT_CYCLE_MISMATCH',expected:Number(out.batchYear),actual:toolkitYear});
    }
  });

  out.gates.sourceBackedCountMatchesSource=out.counts.sourceBackedOpenObligations===out.counts.sourceRows;
  out.gates.allSourceBackedOpenLinked=out.counts.linkedVisits===out.counts.sourceBackedOpenObligations;
  out.gates.allPlanningWindowsResolved=out.counts.planningWindowResolved===out.counts.sourceBackedOpenObligations;
  out.gates.noPlanningWindowHardBlocks=out.counts.planningWindowHardBlocks===0;
  out.gates.allToolkitCyclesCanonical=out.counts.toolkitCycleResolved===out.counts.sourceBackedOpenObligations&&out.counts.toolkitCycleMismatches===0;
  out.gates.allAuditPlanningRowsExist=out.counts.missingAuditPlanningRows===0;
  out.gates.companyConsistent=out.counts.companyMismatches===0;
  out.gates.readOnly=true;
  out.success=out.errors.length===0&&out.invalid.length===0&&Object.keys(out.gates).every(function(k){return out.gates[k]===true;});
  Logger.log(JSON.stringify(out,null,2));
  if(!out.success)throw new Error('ECAS runtime integration acceptance failed: '+out.invalid.slice(0,10).map(function(x){return x.reason;}).join(', '));
  return out;
}
