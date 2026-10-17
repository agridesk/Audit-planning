/**
 * Canonical Notifications 2.0 GAS configuration writer.
 * DEV only. Existing sheet schemas are preserved; no destructive migration.
 * Run under an authorized GAS execution identity, never from a public web app.
 */
function NotificationManagement20_UpdateEvent(eventKey, changes, expected) {
  if(typeof SYS_getEnv_!=='function'||SYS_getEnv_()!=='DEV')throw new Error('DEV_ONLY');
  var key=String(eventKey||'').trim().toUpperCase();
  if(!/^[A-Z][A-Z0-9_]{1,100}$/.test(key))throw new Error('INVALID_EVENT_KEY');
  if(!changes||typeof changes!=='object'||Array.isArray(changes))throw new Error('INVALID_CHANGES');
  var keys=Object.keys(changes);
  if(!keys.length||keys.length>2||keys.some(function(k){return k!=='ACTIVE'&&k!=='SEND_EMAIL';}))throw new Error('FIELD_NOT_EDITABLE');
  if(!expected||typeof expected!=='object')throw new Error('EXPECTED_VALUES_REQUIRED');
  keys.forEach(function(k){if(typeof changes[k]!=='boolean'||typeof expected[k]!=='boolean')throw new Error('BOOLEAN_REQUIRED');});
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))throw new Error('NOTIFICATION_CONFIG_BUSY');
  try {
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    var sh=ss.getSheetByName('Notification_Config');
    if(!sh)throw new Error('CONFIG_SHEET_MISSING');
    var rows=sh.getDataRange().getValues();
    var head=rows[0].map(function(x){return String(x||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');});
    var keyCol=head.indexOf('EVENTKEY');
    var activeCol=head.indexOf('ACTIVE'),sendCol=head.indexOf('SENDEMAIL');
    if(keyCol<0||activeCol<0||sendCol<0)throw new Error('CONFIG_SCHEMA_MISMATCH');
    var found=[];
    for(var i=1;i<rows.length;i++)if(String(rows[i][keyCol]||'').trim().toUpperCase()===key)found.push(i);
    if(found.length!==1)throw new Error(found.length?'DUPLICATE_EVENT':'EVENT_NOT_FOUND');
    var rowIndex=found[0],row=rows[rowIndex];
    var cols={ACTIVE:activeCol,SEND_EMAIL:sendCol};
    function yes(v){return v===true||['TRUE','YES','1','ON'].indexOf(String(v||'').trim().toUpperCase())>=0;}
    keys.forEach(function(k){if(yes(row[cols[k]])!==expected[k])throw new Error('CONFIG_CHANGED_RELOAD_REQUIRED');});
    var actor=String(Session.getEffectiveUser().getEmail()||'').trim();
    if(!actor)throw new Error('ACTOR_IDENTITY_REQUIRED');
    var history=ss.getSheetByName('Notification_Change_Log');
    if(!history){history=ss.insertSheet('Notification_Change_Log');history.appendRow(['Timestamp','Actor','EventKey','Field','Before','After','Source']);}
    var updates=keys.filter(function(k){return yes(row[cols[k]])!==changes[k];});
    if(!updates.length)return {ok:true,changed:0,eventKey:key};
    var previous=updates.map(function(k){return yes(row[cols[k]]);});
    // Log before writes: if logging fails, no configuration changes occur.
    var records=updates.map(function(k,i){return [new Date(),actor,key,k,String(previous[i]),String(changes[k]),'AMS_NOTIFICATION_MANAGEMENT_20'];});
    var first=history.getLastRow()+1;
    history.getRange(first,1,records.length,7).setValues(records);
    try{
      updates.forEach(function(k){sh.getRange(rowIndex+1,cols[k]+1).setValue(changes[k]?'YES':'NO');});
    }catch(e){
      updates.forEach(function(k,i){try{sh.getRange(rowIndex+1,cols[k]+1).setValue(previous[i]?'YES':'NO');}catch(rollbackError){}});
      throw e;
    }
    if(typeof NotificationConfig_ClearCache==='function')NotificationConfig_ClearCache();
    if(typeof NB_InvalidateConfigCache==='function')NB_InvalidateConfigCache();
    return {ok:true,changed:updates.length,eventKey:key};
  }finally{lock.releaseLock();}
}
