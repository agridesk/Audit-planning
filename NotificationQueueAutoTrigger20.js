/**
 * AMS Notifications 2.0: DEV queue scheduler and diagnostics.
 * A deployed Apps Script time trigger survives Cloud Run restarts.
 */
function NotificationQueue20_InstallDevTrigger() {
  if (typeof SYS_getEnv_ !== 'function' || SYS_getEnv_() !== 'DEV') throw new Error('DEV_ONLY');
  var handler='NotificationSender_RunDigest10M';
  var triggers=ScriptApp.getProjectTriggers();
  var existing=triggers.filter(function(t){return t.getHandlerFunction()===handler;});
  if(!existing.length) ScriptApp.newTrigger(handler).timeBased().everyMinutes(1).create();
  var active=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()===handler;});
  var processed=NotificationSender_RunDigest10M();
  return {ok:active.length>0&&processed.success===true,environment:'DEV',handler:handler,triggerCount:active.length,created:!existing.length,processed:processed};
}
function NotificationQueue20_DiagnoseDev() {
  if (typeof SYS_getEnv_ !== 'function' || SYS_getEnv_() !== 'DEV') throw new Error('DEV_ONLY');
  var triggerCount=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='NotificationSender_RunDigest10M';}).length;
  var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Notification Queue');
  if(!sh)throw new Error('MISSING_QUEUE');
  var values=sh.getDataRange().getValues(),states={},pending=[];
  for(var i=1;i<values.length;i++){
    var k=String(values[i][1]||'').trim();states[k]=(states[k]||0)+1;
    if(k==='PENDING')pending.push({row:i+1,event:String(values[i][2]||''),auditId:String(values[i][4]||'')});
  }
  return{ok:true,environment:'DEV',triggerCount:triggerCount,states:states,pending:pending.slice(-25)};
}
function NotificationQueue20_ProcessDevNow(){
  if (typeof SYS_getEnv_ !== 'function' || SYS_getEnv_() !== 'DEV') throw new Error('DEV_ONLY');
  return NotificationSender_RunDigest10M();
}
