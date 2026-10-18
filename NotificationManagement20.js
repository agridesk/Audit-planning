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

/** Manager-controlled DEV mail mode. Never modifies PROD or recipient address. */
function NotificationManagement20_UpdateDevMode(mode, expected, actorEmail) {
  if(typeof SYS_getEnv_!=='function'||SYS_getEnv_()!=='DEV')throw new Error('DEV_ONLY');
  mode=String(mode||'').trim().toUpperCase();
  expected=String(expected||'').trim().toUpperCase();
  if(['OFF','DRY_RUN','TEST_TO_SELF'].indexOf(mode)<0||['OFF','DRY_RUN','TEST_TO_SELF'].indexOf(expected)<0)throw new Error('INVALID_DEV_MODE');
  var actor=String(actorEmail||'').trim().toLowerCase();
  if(!actor||actor==='undefined'||actor==='null')throw new Error('INVALID_ACTOR_MISSING');
  if(actor.length>254)throw new Error('INVALID_ACTOR_LENGTH');
  if(actor.indexOf('@')<1||actor.lastIndexOf('.')<actor.indexOf('@')+2)throw new Error('INVALID_ACTOR_FORMAT');
  if(actor.indexOf(' ')>=0||actor.indexOf(String.fromCharCode(10))>=0||actor.indexOf(String.fromCharCode(13))>=0)throw new Error('INVALID_ACTOR_WHITESPACE');
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))throw new Error('NOTIFICATION_CONFIG_BUSY');
  try {
    var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName('System_Config');
    if(!sh)throw new Error('SYSTEM_CONFIG_MISSING');
    var rows=sh.getDataRange().getValues();
    var headers=(rows[0]||[]).map(function(x){return String(x||'').trim().toUpperCase();});
    var keyCol=headers.indexOf('KEY'),devCol=headers.indexOf('DEV');
    if(keyCol<0||devCol<0)throw new Error('SYSTEM_CONFIG_SCHEMA_MISMATCH');
    var hits=[];
    for(var i=1;i<rows.length;i++)if(String(rows[i][keyCol]||'').trim().toUpperCase()==='DEV_NOTIFICATION_MODE')hits.push(i);
    if(hits.length!==1)throw new Error('DEV_MODE_NOT_UNIQUE');
    var current=String(rows[hits[0]][devCol]||'').trim().toUpperCase();
    if(current!==expected)throw new Error('CONFIG_CHANGED_RELOAD_REQUIRED');
    if(mode==='TEST_TO_SELF'){
      var recipients=rows.slice(1).filter(function(row){return String(row[keyCol]||'').trim().toUpperCase()==='DEV_TEST_EMAIL';});
      if(recipients.length!==1||!String(recipients[0][devCol]||'').trim())throw new Error('DEV_TEST_EMAIL_REQUIRED');
    }
    if(current===mode)return {ok:true,changed:0,mode:mode};
    var history=ss.getSheetByName('Notification_Change_Log');
    if(!history){history=ss.insertSheet('Notification_Change_Log');history.appendRow(['Timestamp','Actor','EventKey','Field','Before','After','Source']);}
    history.appendRow([new Date(),actor,'SYSTEM_CONFIG','DEV_NOTIFICATION_MODE',current,mode,'AMS_NOTIFICATION_MANAGEMENT_20']);
    sh.getRange(hits[0]+1,devCol+1).setValue(mode);
    if(typeof SYS_CONFIG_EXEC_CACHE_!=='undefined')SYS_CONFIG_EXEC_CACHE_={};
    return {ok:true,changed:1,mode:mode};
  }finally{lock.releaseLock();}
}

/**
 * Manager-editable Notification_Rules. Technical routing and mandatory-reason
 * rules are deliberately excluded. DEV only, optimistic concurrency and audit log.
 */
function NotificationManagement20_UpdateRule(ruleKey, value, expected, actorEmail) {
  if(typeof SYS_getEnv_!=='function'||SYS_getEnv_()!=='DEV')throw new Error('DEV_ONLY');
  var key=String(ruleKey||'').trim().toUpperCase();
  var days=['COMING_UP_DAYS','PENDING_PLANNING_UPCOMING_DAYS','PENDING_PLANNING_URGENT_DAYS','PENDING_PLANNING_CRITICAL_DAYS'];
  var hours=['WEEKLY_MANAGER_SEND_HOUR','WEEKLY_AUDITOR_SEND_HOUR'];
  var weekdays=['WEEKLY_MANAGER_SEND_DAY','WEEKLY_AUDITOR_SEND_DAY'];
  var comments=['COMMENT_ALLOWED_AUDIT_APPROVED','COMMENT_ALLOWED_AUDIT_ACCEPTED','COMMENT_ALLOWED_AUDIT_COMPLETED','COMMENT_ALLOWED_AUDIT_CANCELLED_BY_AUDITOR','COMMENT_ALLOWED_AUDIT_DENIED_BY_AUDITOR'];
  if(days.indexOf(key)<0&&hours.indexOf(key)<0&&weekdays.indexOf(key)<0&&comments.indexOf(key)<0)throw new Error('RULE_NOT_EDITABLE');
  var next=String(value==null?'':value).trim().toUpperCase(),prior=String(expected==null?'':expected).trim().toUpperCase();
  function valid(v){
    if(days.indexOf(key)>=0)return /^\d{1,3}$/.test(v)&&Number(v)>=1&&Number(v)<=365;
    if(hours.indexOf(key)>=0)return /^\d{1,2}$/.test(v)&&Number(v)>=0&&Number(v)<=23;
    if(weekdays.indexOf(key)>=0)return ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].indexOf(v)>=0;
    return v==='YES'||v==='NO';
  }
  if(!valid(next)||!valid(prior))throw new Error('RULE_VALUE_INVALID');
  var actor=String(actorEmail||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actor)||actor.length>254)throw new Error('ACTOR_INVALID');
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))throw new Error('NOTIFICATION_RULE_BUSY');
  try {
    var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName('Notification_Rules');
    if(!sh)throw new Error('RULE_SHEET_MISSING');
    var rows=sh.getDataRange().getValues();
    var head=(rows[0]||[]).map(function(x){return String(x||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');});
    var kcol=head.indexOf('RULEKEY'),vcol=head.indexOf('VALUE'),acol=head.indexOf('ACTIVE');
    if(kcol<0||vcol<0||acol<0)throw new Error('RULE_SCHEMA_MISMATCH');
    var hits=[];
    for(var i=1;i<rows.length;i++)if(String(rows[i][kcol]||'').trim().toUpperCase()===key)hits.push(i);
    if(hits.length!==1)throw new Error('RULE_NOT_UNIQUE');
    var idx=hits[0],row=rows[idx];
    if(String(row[acol]||'').trim().toUpperCase()!=='YES')throw new Error('RULE_INACTIVE');
    var current=String(row[vcol]==null?'':row[vcol]).trim().toUpperCase();
    if(current!==prior)throw new Error('RULE_CHANGED_RELOAD_REQUIRED');
    if(current===next)return {ok:true,changed:0,ruleKey:key};
    var byKey={};
    for(var j=1;j<rows.length;j++){var k=String(rows[j][kcol]||'').trim().toUpperCase();if(k)byKey[k]=String(rows[j][vcol]==null?'':rows[j][vcol]).trim();}
    byKey[key]=next;
    if(days.indexOf(key)>=0){
      var a=Number(byKey.PENDING_PLANNING_UPCOMING_DAYS),b=Number(byKey.PENDING_PLANNING_URGENT_DAYS),c=Number(byKey.PENDING_PLANNING_CRITICAL_DAYS);
      if(!(a<b&&b<c))throw new Error('THRESHOLD_ORDER_INVALID');
    }
    var log=ss.getSheetByName('Notification_Change_Log');
    if(!log){log=ss.insertSheet('Notification_Change_Log');log.appendRow(['Timestamp','Actor','EventKey','Field','Before','After','Source']);}
    log.appendRow([new Date(),actor,key,'RULE_VALUE',current,next,'AMS_NOTIFICATION_RULES_20']);
    sh.getRange(idx+1,vcol+1).setValue(next);
    if(typeof NotificationConfig_ClearCache==='function')NotificationConfig_ClearCache();
    if(typeof NB_InvalidateConfigCache==='function')NB_InvalidateConfigCache();
    return {ok:true,changed:1,ruleKey:key,value:next};
  }finally{lock.releaseLock();}
}
