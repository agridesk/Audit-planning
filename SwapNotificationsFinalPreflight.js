// DEV-only non-mutating final readiness gate for SWAP 2.0 + Notifications.
function RUN_SWAP_NOTIFICATIONS_FINAL_PREFLIGHT_DEV_20261021() {
 var p=PropertiesService.getScriptProperties();
 var environment=String(p.getProperty('AMS_ENV')||'').toUpperCase();
 if(environment==='PROD'||environment==='PRODUCTION')throw Error('DEV_ONLY_PREFLIGHT');
 var configuredId=String(p.getProperty('V5_SSOT_SPREADSHEET_ID')||'').trim();
 if(configuredId&&configuredId!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')throw Error('DEV_ONLY_PREFLIGHT');
 var ss=SpreadsheetApp.getActiveSpreadsheet();
 var findings=[],info={environmentMarker:environment||'MISSING',configuredSpreadsheetIdMatchesDev:configuredId==='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs'};
 if(environment!=='DEV')findings.push('AMS_ENV_NOT_DEV');
 if(!configuredId)findings.push('V5_SSOT_SPREADSHEET_ID_MISSING');
 var audits=ss.getSheetByName('Audit planning');
 var av=ss.getSheetByName('Auditor Availability')||ss.getSheetByName('Auditor availability');
 var journal=ss.getSheetByName('AMS_Swap_20_Journal');
 if(!audits)findings.push('AUDIT_PLANNING_MISSING');
 if(!av)findings.push('AVAILABILITY_MISSING');
 if(!journal)findings.push('JOURNAL_MISSING');
 if(audits){
  var a=audits.getRange(1,1,1,audits.getLastColumn()).getValues()[0].map(String);
  info.auditRows=audits.getLastRow()-1;
  ['Audit ID','Planning JSON','Date - Planned','Status','Assigned to','Auditor_UID'].forEach(function(k){if(a.indexOf(k)<0)findings.push('AUDIT_HEADER_MISSING:'+k);});
 }
 if(av){
  info.availabilityRows=av.getLastRow();
  info.availabilityColumns=av.getLastColumn();
  if(info.availabilityRows>2000)findings.push('AVAILABILITY_EXCEEDS_2000_ROW_CAP');
  if(info.availabilityColumns>80)findings.push('AVAILABILITY_EXCEEDS_80_COL_CAP');
  var h=av.getRange(1,1,1,av.getLastColumn()).getValues()[0].map(String);
  ['Date','Auditor_Email','Audit_ID_1'].forEach(function(k){if(h.indexOf(k)<0)findings.push('AVAILABILITY_HEADER_MISSING:'+k);});
  var n=Math.min(av.getLastRow(),2001);
  if(n>1){
   var values=av.getRange(2,1,n-1,av.getLastColumn()).getValues();
   var dates=0;
   for(var i=0;i<values.length;i++)for(var j=0;j<values[i].length;j++)
    if(Object.prototype.toString.call(values[i][j])==='[object Date]')dates++;
   info.nativeDateCells=dates;
   if(dates)findings.push('AVAILABILITY_DATE_SERIALIZATION_UNSUPPORTED');
  }
 }
 if(journal){
  var h2=journal.getRange(1,1,1,5).getValues()[0].map(String);
  var expected=['Operation_ID','Sequence','Stage','Recorded_At','Payload_JSON'];
  if(JSON.stringify(h2)!==JSON.stringify(expected))findings.push('JOURNAL_HEADERS_INVALID');
  info.journalEntries=journal.getLastRow()-1;
 }
 info.swapCommitEnabled=String(p.getProperty('AMS_SWAP20_COMMIT_ENABLED')||'')==='true';
 info.ecasChangeCancelEnabled=String(p.getProperty('ECAS20_CHANGE_CANCEL_ENABLED')||'').toUpperCase()==='YES';
 if(info.swapCommitEnabled)findings.push('SWAP_FEATURE_FLAG_ON_BEFORE_FINAL_ACCEPTANCE');
 if(info.ecasChangeCancelEnabled)findings.push('ECAS_FEATURE_FLAG_ON_BEFORE_FINAL_ACCEPTANCE');
 var result={ok:findings.length===0,readOnly:true,readyForTest:findings.length===0,
  readyForProd:false,findings:findings,info:info};
 Logger.log(JSON.stringify(result));
 return result;
}
