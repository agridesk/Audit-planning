/**
 * DEV ONLY — AMS 2.0 Auditor Accept owner cutover.
 * Explicit editor-run functions; no automatic activation or triggers.
 * Does not modify SWAP, PROD, audit rows, or notification rows.
 */
var AMS_DEV_ACCEPT_OWNER_SCRIPT_ID_20='1AcQe5wV9uGwABV-Tv1ZXVaSEgXGHuI_au-WFzN3fh4M0L8ezHnfH93xb';
var AMS_DEV_ACCEPT_OWNER_SHEET_ID_20='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
var AMS_DEV_ACCEPT_OWNER_PROPERTY_20='AMS_AUDITOR_ACCEPT_CANONICAL_OWNER_20';
/**
 * Read-only diagnostic for editor executions. No properties changed.
 * Explicitly logs environment guard results; never relabel PROD as DEV.
 */
function RUN_DEV_AUDITOR_ACCEPT_OWNER_DIAGNOSTIC_20(){
  var props=PropertiesService.getScriptProperties();
  var envValue=String(props.getProperty('AUDIT_RUNTIME_ENV')||'').trim();
  var scriptId=ScriptApp.getScriptId();
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sheetId=ss?ss.getId():'';
  var envIsDev='UNAVAILABLE',entryIsDev='UNAVAILABLE',runtimeEnv='UNAVAILABLE';
  try{if(typeof ENV_isDev_==='function')envIsDev=ENV_isDev_();}catch(e){envIsDev='ERROR: '+e.message;}
  try{if(typeof V5_ENTRY_isDevEnv_==='function')entryIsDev=V5_ENTRY_isDevEnv_();}catch(e){entryIsDev='ERROR: '+e.message;}
  try{if(typeof V5_ENTRY_readProjectEnv_==='function')runtimeEnv=V5_ENTRY_readProjectEnv_();}catch(e){runtimeEnv='ERROR: '+e.message;}
  var out={scriptIdMatches:scriptId===AMS_DEV_ACCEPT_OWNER_SCRIPT_ID_20,
    sheetIdMatches:sheetId===AMS_DEV_ACCEPT_OWNER_SHEET_ID_20,
    runtimeProperty:envValue||'MISSING',runtimeEnv:runtimeEnv,
    envIsDev:envIsDev,entryIsDev:entryIsDev,
    currentOwner:props.getProperty(AMS_DEV_ACCEPT_OWNER_PROPERTY_20)||'GAS_DEFAULT'};
  Logger.log(JSON.stringify(out));return out;
}
function AMS_DEV_AcceptOwnerCheck_20_(){
  var actual=ScriptApp.getScriptId();
  if(actual!==AMS_DEV_ACCEPT_OWNER_SCRIPT_ID_20)throw new Error('CUTOVER_BLOCKED_NOT_DEV_SCRIPT');
  if(typeof V5_ENTRY_isDevEnv_!=='function'||V5_ENTRY_isDevEnv_()!==true)throw new Error('CUTOVER_BLOCKED_NOT_DEV_ENV');
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
