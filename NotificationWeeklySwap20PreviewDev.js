/** DEV-only read-only preview of the actual weekly auditor digest, including pending SWAP actions. */
function RUN_PREVIEW_WEEKLY_AUDITOR_SWAP20_DEV_20261024(){
 var p=PropertiesService.getScriptProperties();
 if(String(p.getProperty('AMS_ENV')||'').toUpperCase()!=='DEV'||
 String(p.getProperty('V5_SSOT_SPREADSHEET_ID')||'')!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')throw Error('DEV_ONLY');
 var result=runAuditorWeeklyAlertSwap20({previewOnly:true});
 if(!result||result.ok!==true||result.previewOnly!==true)throw Error('PREVIEW_FAILED');
 var summary={ok:true,readOnly:true,queued:false,sent:false,auditors:[]};
 (result.results||[]).forEach(function(x){
  summary.auditors.push({auditorUid:x.auditorUid,recipient:x.recipient,pendingSwap:x.pendingSwap,
   subject:x.subject,htmlContainsSwap:String(x.htmlBody||'').indexOf('Pending SWAP requests')>=0});
 });
 Logger.log(JSON.stringify(summary));return summary;
}
