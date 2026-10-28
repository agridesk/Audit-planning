/**
 * DEV ONLY — AMS 2.0 Auditor Accept owner cutover.
 * Explicit editor-run functions; no automatic activation or triggers.
 * Does not modify SWAP, PROD, audit rows, or notification rows.
 */
var AMS_DEV_ACCEPT_OWNER_SCRIPT_ID_20='1AcQe5wV9uGwABV-Tv1ZXVaSEgXGHuI_au-WFzN3fh4M0L8ezHnfH93xb';
var AMS_DEV_ACCEPT_OWNER_SHEET_ID_20='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
var AMS_DEV_ACCEPT_OWNER_PROPERTY_20='AMS_AUDITOR_ACCEPT_CANONICAL_OWNER_20';
function AMS_DEV_AcceptOwnerCheck_20_(){
  var actual=ScriptApp.getScriptId();
  if(actual!==AMS_DEV_ACCEPT_OWNER_SCRIPT_ID_20)throw new Error('CUTOVER_BLOCKED_NOT_DEV_SCRIPT');
  if(typeof ENV_isDev_!=='function'||ENV_isDev_()!==true)throw new Error('CUTOVER_BLOCKED_NOT_DEV_ENV');
  if(typeof Status_applyAction!=='function'||typeof V5_ENTRY_isDevEnv_!=='function'||V5_ENTRY_isDevEnv_()!==true)
    throw new Error('CUTOVER_BLOCKED_GAS_RUNTIME_NOT_VERIFIED');
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss||ss.getId()!==AMS_DEV_ACCEPT_OWNER_SHEET_ID_20)throw new Error('CUTOVER_BLOCKED_NOT_DEV_SPREADSHEET');
  return PropertiesService.getScriptProperties();
}
/** Run before changes. Logs only the fence state, never exposes other properties. */
function RUN_DEV_AUDITOR_ACCEPT_OWNER_READINESS_20(){
  var p=AMS_DEV_AcceptOwnerCheck_20_(),owner=p.getProperty(AMS_DEV_ACCEPT_OWNER_PROPERTY_20)||'GAS_DEFAULT';
  var out={success:true,script:'AMS_DEV',spreadsheet:'AMS_DEV',owner:owner};
  Logger.log(JSON.stringify(out));
  return out;
}
/** Run only AFTER Cloud Run direct route is deployed and exclusive-owner gate verified. */
function RUN_DEV_AUDITOR_ACCEPT_OWNER_ENABLE_20(){
  var p=AMS_DEV_AcceptOwnerCheck_20_();
  if(typeof RUN_DEV_AUDITOR_ACCEPT_OWNER_READINESS_20!=='function')throw new Error('CUTOVER_READINESS_MISSING');
  p.setProperty(AMS_DEV_ACCEPT_OWNER_PROPERTY_20,'CLOUD_RUN');
  if(p.getProperty(AMS_DEV_ACCEPT_OWNER_PROPERTY_20)!=='CLOUD_RUN')throw new Error('CUTOVER_OWNER_PROPERTY_READBACK_FAILED');
  Logger.log('AMS_DEV_AUDITOR_ACCEPT_OWNER_CLOUD_RUN_ENABLED');
  return {success:true,owner:'CLOUD_RUN',warning:'Cloud Run direct Accept must already be enabled; verify live action'};
}
/** Emergency rollback: return Auditor Accept ownership to existing GAS bridge. */
function RUN_DEV_AUDITOR_ACCEPT_OWNER_ROLLBACK_20(){
  var p=AMS_DEV_AcceptOwnerCheck_20_();
  p.deleteProperty(AMS_DEV_ACCEPT_OWNER_PROPERTY_20);
  if(p.getProperty(AMS_DEV_ACCEPT_OWNER_PROPERTY_20))throw new Error('CUTOVER_ROLLBACK_READBACK_FAILED');
  Logger.log('AMS_DEV_AUDITOR_ACCEPT_OWNER_GAS_RESTORED');
  return {success:true,owner:'GAS_DEFAULT'};
}
