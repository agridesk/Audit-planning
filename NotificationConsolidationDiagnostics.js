/**
 * AMS DEV notification configuration consolidation audit.
 * Read-only. No schema mutation, no sheet deletion, no outbound mail.
 * Run RUN_NOTIFICATION_CONSOLIDATION_AUDIT from this GAS file.
 */
function RUN_NOTIFICATION_CONSOLIDATION_AUDIT() {
  var env=typeof SYS_getEnv_==='function'?String(SYS_getEnv_()||'').toUpperCase():'UNKNOWN';
  if(env!=='DEV')throw new Error('DEV_ONLY');
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  function read(name,keyHeader,valueHeader){
    var sh=ss.getSheetByName(name);if(!sh)throw new Error('MISSING_SHEET_'+name);
    var rows=sh.getDataRange().getValues();
    var header=(rows[0]||[]).map(function(v){return String(v||'').trim().toUpperCase();});
    var keyIndex=header.indexOf(keyHeader),valueIndex=header.indexOf(valueHeader);
    if(keyIndex<0||valueIndex<0)throw new Error('INVALID_SCHEMA_'+name);
    var map={},duplicates=[];
    for(var i=1;i<rows.length;i++){
      var key=String(rows[i][keyIndex]||'').trim().toUpperCase();
      if(!key)continue;
      if(Object.prototype.hasOwnProperty.call(map,key))duplicates.push(key);
      map[key]=String(rows[i][valueIndex]==null?'':rows[i][valueIndex]).trim();
    }
    return {values:map,duplicates:duplicates};
  }
  var legacy=read('Notification_Settings','SETTING_KEY','SETTING_VALUE');
  var sysSheet=ss.getSheetByName('System_Config');
  if(!sysSheet)throw new Error('MISSING_SHEET_System_Config');
  var sysRows=sysSheet.getDataRange().getValues();
  var sysHeader=(sysRows[0]||[]).map(function(v){return String(v||'').trim().toUpperCase();});
  var devIndex=sysHeader.indexOf('DEV'),keyIndex=sysHeader.indexOf('KEY');
  if(devIndex<0||keyIndex<0)throw new Error('INVALID_SCHEMA_System_Config');
  var sys={},sysDuplicates=[];
  for(var j=1;j<sysRows.length;j++){
    var key=String(sysRows[j][keyIndex]||'').trim().toUpperCase();if(!key)continue;
    if(Object.prototype.hasOwnProperty.call(sys,key))sysDuplicates.push(key);
    sys[key]=String(sysRows[j][devIndex]==null?'':sysRows[j][devIndex]).trim();
  }
  var migrated=['DEFAULT_FROM_EMAIL','DEFAULT_FROM_NAME','DEFAULT_REPLY_TO','DEFAULT_BUFFER_MINUTES','RUNNER_ENABLED','RUNNER_FREQUENCY_MINUTES','QUEUE_RETENTION_DAYS','MAIL_PROVIDER','TEST_MODE','TEST_RECIPIENT'];
  var comparisons=migrated.map(function(key){
    var current=sys[key]||'',prior=legacy.values[key]||'';
    return {key:key,systemConfigPresent:!!current,legacyPresent:!!prior,equal:!!current&&current===prior};
  });
  var runtime=['LAST_RUN_AT','LAST_SUCCESS_AT','LAST_ERROR','LAST_RUN_RESULT_JSON','LAST_RUN_NOTE'];
  var runtimePresence=runtime.map(function(key){return {key:key,present:Object.prototype.hasOwnProperty.call(legacy.values,key),populated:!!legacy.values[key]};});
  var rules=read('Notification_Rules','RULE_KEY','VALUE');
  var eventSheet=ss.getSheetByName('Notification_Config');
  var eventRows=eventSheet?eventSheet.getDataRange().getValues():[];
  var eh=(eventRows[0]||[]).map(function(v){return String(v||'').trim().toUpperCase();});
  var eventKeyCol=eh.indexOf('EVENT_KEY'),eventActiveCol=eh.indexOf('ACTIVE');
  var deniedEvent=null;
  for(var k=1;k<eventRows.length;k++)if(String(eventRows[k][eventKeyCol]||'').trim().toUpperCase()==='AUDIT_DENIED_BY_AUDITOR'){
    deniedEvent={present:true,active:String(eventRows[k][eventActiveCol]||'').trim().toUpperCase()};
  }
  var templateSheet=ss.getSheetByName('Notification_Templates');
  var templateCount=templateSheet?Math.max(0,templateSheet.getLastRow()-1):0;
  var mismatches=comparisons.filter(function(c){return !c.equal;});
  var out={
    ok:true,environment:env,
    legacySheetRetirementReady:false,
    migratedSettings:{checked:comparisons.length,mismatches:mismatches,allMatch:mismatches.length===0},
    runtimeState:{keys:runtimePresence,note:'Legacy runtime fields need a separately validated owner before retiring Notification_Settings.'},
    obsoleteAuditorDenied:{rulePresent:Object.prototype.hasOwnProperty.call(rules.values,'COMMENT_ALLOWED_AUDIT_DENIED_BY_AUDITOR'),event:deniedEvent,policy:'Historical event preserved; no new writes should use it.'},
    templates:{rows:templateCount,usageVerified:false,policy:'Do not retire without code-path validation.'},
    duplicates:{notificationSettings:legacy.duplicates,systemConfig:sysDuplicates,notificationRules:rules.duplicates},
    recommendation:'Keep Notification_Settings read-only for now. No deletion or destructive migration authorized.'
  };
  Logger.log(JSON.stringify(out));return out;
}
