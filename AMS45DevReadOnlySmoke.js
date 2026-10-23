// AMS issue #45 - read-only DEV GAS lifecycle/Availability integration preflight.
// No lifecycle action, notifications, Availability reservation or data mutation.
var AMS45_DEV_READ_ONLY_SMOKE_BUILD='2026-10-23_R1';
function RUN_AMS45_DEV_READONLY_SMOKE(){
 var env=typeof V5_ENTRY_isDevEnv_==='function'&&V5_ENTRY_isDevEnv_();
 if(!env)throw Error('AMS45_SMOKE_DEV_ONLY');
 var ss=SpreadsheetApp.getActiveSpreadsheet();
 if(!ss)throw Error('AMS45_SMOKE_NO_SPREADSHEET');
 var required=['Audit planning','Audit_Obligations','Audit_Visit_Obligations','Auditor Availability','Concept Reservations','Rejected audits','Config_Scopes'];
 var missing=required.filter(function(name){return !ss.getSheetByName(name);});
 var owners={
  statusMachine:typeof Status_applyAction==='function',
  planning:typeof PlanningCanonicalCommitService_commit==='function',
  availability:typeof PlanningCanonicalAvailabilityAdapter_reserve==='function'&&typeof PlanningCanonicalAvailabilityAdapter_release==='function',
  combined:typeof ModelCCombinedVisitCanonicalCommit20_execute==='function',
  combinedReconcile:typeof ModelCCombinedVisitReconcile20_run==='function',
  combinedClassifier:typeof ModelCCombinedVisitReconcile20_classify==='function',
  rejectUnlink:typeof ModelCRejectLinkWriter_close_==='function',
  rejectionIntegrity:typeof RUN_MODEL_C_REJECTED_LINK_INTEGRITY_20==='function',
  notifications:typeof StatusNotificationBridge_Dispatch_==='function'
 };
 var unresolved=Object.keys(owners).filter(function(k){return !owners[k];});
 var modelC=null,diagnosticError='';
 if(owners.rejectionIntegrity&&missing.length===0){
  try{modelC=RUN_MODEL_C_REJECTED_LINK_INTEGRITY_20();}
  catch(e){diagnosticError=String(e&&e.message||e).slice(0,180);}
 }
 return{
  success:missing.length===0&&unresolved.length===0&&!diagnosticError,
  build:AMS45_DEV_READ_ONLY_SMOKE_BUILD,
  env:'DEV',readOnly:true,writesPerformed:false,
  ssotId:ss.getId(),missingSheets:missing,
  owners:owners,missingOwners:unresolved,
  modelCIntegrity:modelC,integrityDiagnosticError:diagnosticError,
  integrationStatus:'READ_ONLY_PREFLIGHT_ONLY_NO_LIFECYCLE_WRITE_TESTED'
 };
}
