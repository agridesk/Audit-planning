// Scope Management 2.0 — DEV-only controlled version bootstrap.
// Requires explicit Manager authorization, explicit version IDs and confirmation.
// Creates ScopeVersions only when absent; never changes Config_Scopes or audits.
function ScopeVersion20_initializeDev_(versionIdsByScope,reason,confirmation){
  if(typeof V5_ENTRY_readProjectEnv_!=='function'||V5_ENTRY_readProjectEnv_()!=='DEV')throw new Error('DEV_ONLY');
  var actor=String(V5_getCallerEmail_()||'').trim().toLowerCase();
  if(typeof ScopeManagement20_authorizeManager_!=='function'||!ScopeManagement20_authorizeManager_(actor))throw new Error('MANAGER_ACCESS_DENIED');
  if(confirmation!=='INITIALIZE_SCOPE_VERSIONS_DEV')throw new Error('EXPLICIT_CONFIRMATION_REQUIRED');
  if(!String(reason||'').trim())throw new Error('CHANGE_REASON_REQUIRED');
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))throw new Error('SCOPE_VERSION_LOCK_BUSY');
  try{
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    if(ss.getSheetByName('ScopeVersions'))throw new Error('SCOPE_VERSIONS_ALREADY_EXISTS');
    var plan=ScopeVersion20_bootstrapPlan_(ss,versionIdsByScope);
    if(!plan.success)throw new Error('BOOTSTRAP_INVALID: '+plan.errors.join('; '));
    var headers=SCOPE_VERSION_20_HEADERS.slice(),timestamp=new Date().toISOString();
    var rows=plan.proposedRows.map(function(r){return headers.map(function(h){
      if(h==='Created_At')return timestamp;
      if(h==='Created_By')return actor;
      if(h==='Change_Reason')return String(reason).trim();
      return r[h]===undefined?'':r[h];
    });});
    var sh=ss.insertSheet('ScopeVersions');
    try{
      sh.getRange(1,1,1,headers.length).setValues([headers]);
      if(rows.length)sh.getRange(2,1,rows.length,headers.length).setValues(rows);
      sh.setFrozenRows(1);
      var verification=ScopeVersion20_read_(ss);
      if(!verification.success||verification.rows.length!==rows.length)throw new Error('BOOTSTRAP_POST_WRITE_VALIDATION_FAILED');
    }catch(e){
      ss.deleteSheet(sh);
      throw e;
    }
    return {success:true,devOnly:true,createdSheet:'ScopeVersions',versionsCreated:rows.length,actor:actor,createdAt:timestamp};
  }finally{lock.releaseLock();}
}
