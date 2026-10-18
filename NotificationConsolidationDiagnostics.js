/**
 * AMS DEV notification configuration consolidation audit.
 * Read-only. No schema mutation, no sheet deletion, no outbound mail.
 * Run RUN_NOTIFICATION_CONSOLIDATION_AUDIT from this GAS file.
 */
function RUN_NOTIFICATION_CONSOLIDATION_AUDIT() {
  var env=typeof SYS_getEnv_==='function'?String(SYS_getEnv_()||'').toUpperCase():'UNKNOWN';
  if(env!=='DEV')throw new Error('DEV_ONLY');
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  // Environment labels alone are insufficient: prohibit diagnostics against PROD workbook.
  if(!ss || ss.getId()!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')throw new Error('DEV_SPREADSHEET_ID_MISMATCH');
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
  var legacyRuntimeLastRun=legacy.values.LAST_RUN_AT||'';
  var legacyRuntimeLastSuccess=legacy.values.LAST_SUCCESS_AT||'';
  var runtimeStateClass='LEGACY_SNAPSHOT_NOT_CANONICAL';
  var retiredEventActive=deniedEvent&&deniedEvent.active==='YES';
  var out={
    ok:true,environment:env,
    legacySheetRetirementReady:false,
    migrationVerified:mismatches.length===0,
    blockers:['PROD_LEGACY_READ_COMPATIBILITY','LEGACY_RUNTIME_STATE_OWNER_UNVERIFIED','TEMPLATE_RUNTIME_REFERENCES_UNVERIFIED'],
    migratedSettings:{checked:comparisons.length,mismatches:mismatches,allMatch:mismatches.length===0},
    runtimeState:{keys:runtimePresence,classification:runtimeStateClass,lastRunAt:legacyRuntimeLastRun,lastSuccessAt:legacyRuntimeLastSuccess,note:'Legacy runner timestamps are not proof of a current runner; keep operational status separate from config.'},
    obsoleteAuditorDenied:{rulePresent:Object.prototype.hasOwnProperty.call(rules.values,'COMMENT_ALLOWED_AUDIT_DENIED_BY_AUDITOR'),event:deniedEvent,stillEnabledInLegacyConfig:retiredEventActive,policy:'Historical event preserved; no new writes should use it.'},
    templates:{rows:templateCount,usageVerified:false,policy:'Do not retire without code-path validation.'},
    duplicates:{notificationSettings:legacy.duplicates,systemConfig:sysDuplicates,notificationRules:rules.duplicates},
    recommendation:'Keep Notification_Settings read-only for now. No deletion or destructive migration authorized.'
  };
  Logger.log(JSON.stringify(out));return out;
}

/**
 * Read-only DEV scheduler inventory. ScriptApp exposes only triggers visible
 * to the executing account; absence does not prove that other owners have none.
 * Never creates/deletes triggers, sends mail or mutates a sheet.
 */
function RUN_NOTIFICATION_TRIGGER_INVENTORY() {
  var env=typeof SYS_getEnv_==='function'?String(SYS_getEnv_()||'').toUpperCase():'UNKNOWN';
  if(env!=='DEV')throw new Error('DEV_ONLY');
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss||ss.getId()!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')throw new Error('DEV_SPREADSHEET_ID_MISMATCH');
  var managed={
    NotificationSender_RunDigest10M:'DIGEST',
    NotificationSenderV5_RunDigest10M:'LEGACY_DIGEST',
    runManagerWeeklyAlert:'WEEKLY_MANAGER',
    runAuditorWeeklyAlert:'WEEKLY_AUDITOR'
  };
  var found=[],otherCount=0;
  var triggers=ScriptApp.getProjectTriggers();
  for(var i=0;i<triggers.length;i++){
    var handler=String(triggers[i].getHandlerFunction()||'').trim();
    if(!Object.prototype.hasOwnProperty.call(managed,handler)){otherCount++;continue;}
    found.push({
      handler:handler,
      category:managed[handler],
      source:typeof triggers[i].getTriggerSource==='function'?String(triggers[i].getTriggerSource()):'',
      eventType:typeof triggers[i].getEventType==='function'?String(triggers[i].getEventType()):''
    });
  }
  var counts={};
  for(var j=0;j<found.length;j++)counts[found[j].handler]=(counts[found[j].handler]||0)+1;
  var duplicates=Object.keys(counts).filter(function(k){return counts[k]>1;});
  var out={
    ok:true,environment:env,readOnly:true,
    visibility:'CURRENT_EXECUTING_ACCOUNT_ONLY',
    managedTriggers:found,managedCount:found.length,otherTriggerCount:otherCount,
    duplicateManagedHandlers:duplicates,
    legacyDigestPresent:!!counts.NotificationSenderV5_RunDigest10M,
    digestTriggerVisible:!!counts.NotificationSender_RunDigest10M,
    weeklyManagerTriggerVisible:!!counts.runManagerWeeklyAlert,
    weeklyAuditorTriggerVisible:!!counts.runAuditorWeeklyAlert,
    lastRunVerified:false,
    note:'Trigger existence is not evidence of execution or delivery. Other accounts may own invisible triggers. LAST_RUN_* in Notification_Settings is a legacy snapshot.'
  };
  Logger.log(JSON.stringify(out));return out;
}

/**
 * Comprehensive read-only DEV notification operations report.
 * One invocation combines configuration migration, scheduler inventory,
 * queue/log statistics and renderer ownership. No mail or mutation.
 */
function RUN_NOTIFICATION_CONSOLIDATION_FULL_AUDIT() {
  var config=RUN_NOTIFICATION_CONSOLIDATION_AUDIT();
  var triggers=RUN_NOTIFICATION_TRIGGER_INVENTORY();
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var now=Date.now();
  function sheetSummary(name) {
    var sh=ss.getSheetByName(name);
    if(!sh)return {present:false,rows:0,headers:[],statusCounts:{},dateColumns:[]};
    var lastRow=sh.getLastRow(),lastCol=sh.getLastColumn();
    if(!lastRow||!lastCol)return {present:true,rows:0,headers:[],statusCounts:{},dateColumns:[]};
    var head=sh.getRange(1,1,1,lastCol).getValues()[0].map(function(v){return String(v==null?'':v).trim();});
    var upper=head.map(function(v){return v.toUpperCase().replace(/\s+/g,'_');});
    var statusIndex=-1;
    for(var i=0;i<upper.length;i++)if(['STATUS','QUEUE_STATUS','DELIVERY_STATUS','SEND_STATUS'].indexOf(upper[i])>=0){statusIndex=i;break;}
    var counts={},sampleLimit=20000;
    if(statusIndex>=0&&lastRow>1){
      var n=Math.min(lastRow-1,sampleLimit);
      var cells=sh.getRange(lastRow-n+1,statusIndex+1,n,1).getValues();
      for(var j=0;j<cells.length;j++){
        var value=String(cells[j][0]==null?'':cells[j][0]).trim().toUpperCase()||'(BLANK)';
        counts[value]=(counts[value]||0)+1;
      }
    }
    var dateColumns=[];
    for(var k=0;k<upper.length;k++)if(/(?:DATE|TIME|_AT|TIMESTAMP)/.test(upper[k]))dateColumns.push(head[k]);
    return {
      present:true,rows:Math.max(0,lastRow-1),
      headers:head,statusColumn:statusIndex>=0?head[statusIndex]:'',
      statusCounts:counts,statusSampleRows:statusIndex>=0?Math.min(lastRow-1,sampleLimit):0,
      statusSampleTruncated:statusIndex>=0&&lastRow-1>sampleLimit,
      dateColumns:dateColumns
    };
  }
  var queue=sheetSummary('Notification Queue');
  var log=sheetSummary('Notification log');
  var changeLog=sheetSummary('Notification_Change_Log');
  var templates=sheetSummary('Notification_Templates');
  var result={
    ok:true,environment:'DEV',readOnly:true,generatedAt:new Date(now).toISOString(),
    configMigrationVerified:config.migrationVerified,
    legacySheetRetirementReady:false,
    blockers:config.blockers,
    scheduler:triggers,
    freshness:RUN_NOTIFICATION_OPERATIONS_EVIDENCE(triggers),
    operations:{queue:queue,deliveryLog:log,configurationChangeLog:changeLog},
    templates:{sheet:templates,rendererSourceOfTruth:'GAS NotificationRenderer_*.js and NotificationBuilder.js',runtimeIndependenceVerified:false},
    lastRunVerified:false,
    limitations:[
      'Trigger visibility is restricted to the executing GAS account.',
      'Queue/log rows and statuses do not prove scheduler execution without timestamp correlation.',
      'No outbound message is sent by this audit.',
      'This report does not establish PROD migration readiness.'
    ]
  };
  Logger.log(JSON.stringify(result));return result;
}

/**
 * Read-only DEV notification operational evidence.
 * Reports timestamp freshness and visible scheduler coverage without assuming
 * that sent queue records prove a specific trigger executed.
 */
function RUN_NOTIFICATION_OPERATIONS_EVIDENCE(knownTriggers) {
  var env=typeof SYS_getEnv_==='function'?String(SYS_getEnv_()||'').toUpperCase():'UNKNOWN';
  if(env!=='DEV')throw new Error('DEV_ONLY');
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss||ss.getId()!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')throw new Error('DEV_SPREADSHEET_ID_MISMATCH');
  function inspect(name,dateHeaders){
    var sh=ss.getSheetByName(name);
    if(!sh)return {present:false};
    var nr=sh.getLastRow(),nc=sh.getLastColumn();
    if(nr<1||nc<1)return {present:true,rows:0};
    var headers=sh.getRange(1,1,1,nc).getValues()[0].map(function(x){return String(x||'').trim().toUpperCase();});
    var cols=dateHeaders.map(function(h){return {header:h,index:headers.indexOf(h.toUpperCase())};}).filter(function(x){return x.index>=0;});
    var output={present:true,rows:Math.max(0,nr-1),columns:{},sampleLimit:20000};
    for(var i=0;i<cols.length;i++){
      var n=Math.min(nr-1,20000),dates=n?sh.getRange(nr-n+1,cols[i].index+1,n,1).getValues():[];
      var latest=null,valid=0,invalid=0;
      for(var j=0;j<dates.length;j++){
        var raw=dates[j][0];if(raw===''||raw===null)continue;
        var ms=raw instanceof Date?raw.getTime():Date.parse(String(raw));
        if(!isFinite(ms)){invalid++;continue;}
        valid++;if(latest===null||ms>latest)latest=ms;
      }
      output.columns[cols[i].header]={
        validTimestamps:valid,unparseableTimestamps:invalid,
        latestAt:latest===null?null:new Date(latest).toISOString(),
        ageMinutes:latest===null?null:Math.round((Date.now()-latest)/60000),
        sampleTruncated:n<nr-1
      };
    }
    return output;
  }
  var triggers=knownTriggers||RUN_NOTIFICATION_TRIGGER_INVENTORY();
  var result={
    ok:true,environment:'DEV',readOnly:true,
    queue:inspect('Notification Queue',['TimestampCreated','TimestampSent']),
    deliveryLog:inspect('Notification log',['Timestamp']),
    changeLog:inspect('Notification_Change_Log',['Timestamp']),
    visibleScheduler:triggers,
    operationalState:'EVIDENCE_ONLY_NOT_EXECUTION_PROOF',
    missingVisibleWeeklyTriggers:!triggers.weeklyManagerTriggerVisible||!triggers.weeklyAuditorTriggerVisible,
    schedulerCoverage:{digestVisible:triggers.digestTriggerVisible,managerWeeklyVisible:triggers.weeklyManagerTriggerVisible,auditorWeeklyVisible:triggers.weeklyAuditorTriggerVisible,duplicates:triggers.duplicateManagedHandlers,visibility:triggers.visibility},
    interpretation:'Timestamp freshness is activity evidence only; no inference of scheduler ownership, successful delivery or expected weekly trigger activation.',
    caution:'Weekly triggers may be intentionally disabled by event/rule policy or owned by another account. Do not create them automatically.',
    noSheetDeletionAuthorized:true
  };
  Logger.log(JSON.stringify(result));return result;
}
