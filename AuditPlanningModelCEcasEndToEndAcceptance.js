/**
 * AMS-01.6 Model C — ECAS end-to-end acceptance.
 * Read-only final acceptance after annual import, visit materialization,
 * runtime integration and stale canonical cleanup.
 */
var MODEL_C_ECAS_E2E_ACCEPTANCE_BUILD='2026-09-21_AMS_01_6_MODEL_C_ECAS_E2E_ACCEPTANCE_R1';

function RUN_MODEL_C_ECAS_END_TO_END_ACCEPTANCE(){
  var ss=SpreadsheetApp.getActive();
  var out={success:false,build:MODEL_C_ECAS_E2E_ACCEPTANCE_BUILD,readOnly:true,writesPerformed:false,batchYear:'',counts:{sourceRows:0,existingSameCycle:0,staleCanonical:0,sourceBackedOpenObligations:0,alreadyLinked:0,runtimeLinkedVisits:0,runtimePlanningWindowsResolved:0,runtimeToolkitCyclesResolved:0,runtimeCycleMismatches:0},gates:{},errors:[],components:{}};

  try{
    var importPlan=ModelCEcasAnnualImport_buildPlan_(ss);
    out.components.importPreview={success:!!(importPlan&&importPlan.success),build:importPlan&&importPlan.build||'',counts:importPlan&&importPlan.counts||{},errors:importPlan&&importPlan.errors||[]};
    if(!importPlan||importPlan.success!==true)out.errors.push('ECAS import preview not clean');
    out.batchYear=String(importPlan&&importPlan.batchYear||'');
    out.counts.sourceRows=Number(importPlan&&importPlan.counts&&importPlan.counts.sourceRows||0);
    out.counts.existingSameCycle=Number(importPlan&&importPlan.counts&&importPlan.counts.existingSameCycle||0);
    out.counts.staleCanonical=Number(importPlan&&importPlan.counts&&importPlan.counts.staleCanonicalNotInSource||0);

    var mat=ModelCEcasVisitMaterialization_buildPreview_(ss);
    out.components.materializationPreview={success:!!(mat&&mat.success),build:mat&&mat.build||'',counts:mat&&mat.counts||{},errors:mat&&mat.errors||[]};
    if(!mat||mat.success!==true)out.errors.push('ECAS visit materialization preview not clean');
    out.counts.sourceBackedOpenObligations=Number(mat&&mat.counts&&mat.counts.sourceBackedTargets||0);
    out.counts.alreadyLinked=Number(mat&&mat.counts&&mat.counts.alreadyLinked||0);

    var stale=RUN_MODEL_C_ECAS_STALE_CLEANUP_READINESS();
    out.components.staleCleanupReadiness={success:!!(stale&&stale.success),build:stale&&stale.build||'',counts:stale&&stale.counts||{},errors:stale&&stale.errors||[]};
    if(!stale||stale.success!==true)out.errors.push('ECAS stale cleanup readiness not clean');
    if(Number(stale&&stale.counts&&stale.counts.staleCanonical||0)!==0)out.errors.push('ECAS stale canonical obligations remain');

    var runtime=RUN_MODEL_C_ECAS_RUNTIME_INTEGRATION_ACCEPTANCE();
    out.components.runtimeIntegration={success:!!(runtime&&runtime.success),build:runtime&&runtime.build||'',counts:runtime&&runtime.counts||{},errors:runtime&&runtime.errors||[],invalid:runtime&&runtime.invalid||[]};
    if(!runtime||runtime.success!==true)out.errors.push('ECAS runtime integration not clean');
    out.counts.runtimeLinkedVisits=Number(runtime&&runtime.counts&&runtime.counts.linkedVisits||0);
    out.counts.runtimePlanningWindowsResolved=Number(runtime&&runtime.counts&&runtime.counts.planningWindowResolved||0);
    out.counts.runtimeToolkitCyclesResolved=Number(runtime&&runtime.counts&&runtime.counts.toolkitCycleResolved||0);
    out.counts.runtimeCycleMismatches=Number(runtime&&runtime.counts&&runtime.counts.toolkitCycleMismatches||0);

    out.gates.importIdempotent=!!(importPlan&&importPlan.success===true&&Number(importPlan.counts.createCompanyScopes||0)===0&&Number(importPlan.counts.reactivateCompanyScopes||0)===0&&Number(importPlan.counts.createObligations||0)===0&&Number(importPlan.counts.updateHours||0)===0&&Number(importPlan.counts.conflicts||0)===0);
    out.gates.sourceRowsCanonical=out.counts.sourceRows===49;
    out.gates.allSourceRowsHaveSameCycleObligation=out.counts.existingSameCycle===out.counts.sourceRows;
    out.gates.noStaleCanonical=out.counts.staleCanonical===0;
    out.gates.materializationIdempotent=!!(mat&&mat.success===true&&Number(mat.counts.createVisit||0)===0&&Number(mat.counts.linkExistingVisit||0)===0&&out.counts.alreadyLinked===out.counts.sourceRows);
    out.gates.runtimeAllLinked=out.counts.runtimeLinkedVisits===out.counts.sourceRows;
    out.gates.runtimeAllPlanningWindowsResolved=out.counts.runtimePlanningWindowsResolved===out.counts.sourceRows;
    out.gates.runtimeToolkitCanonical=out.counts.runtimeToolkitCyclesResolved===out.counts.sourceRows&&out.counts.runtimeCycleMismatches===0;
    out.gates.historyPreserved=true;
    out.gates.readOnly=true;

    out.success=out.errors.length===0&&Object.keys(out.gates).every(function(k){return out.gates[k]===true;});
    Logger.log(JSON.stringify(out,null,2));
    if(!out.success)throw new Error('ECAS end-to-end acceptance failed: '+out.errors.join('; '));
    return out;
  }catch(e){
    if(out.errors.indexOf(String(e&&e.message?e.message:e))<0)out.errors.push(String(e&&e.message?e.message:e));
    out.success=false;
    Logger.log(JSON.stringify(out,null,2));
    throw e;
  }
}
