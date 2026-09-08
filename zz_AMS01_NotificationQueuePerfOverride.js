/**
 * FILE: zz_AMS01_NotificationQueuePerfOverride.js
 * BUILD: AMS01_NOTIFICATION_QUEUE_PERF_ZZ_20260908_R1
 * DEV-only late-load override for notification queue hot-path performance.
 *
 * R8 duplicate semantics remain HASH-ONLY.
 * Instead of reading up to 200 full queue rows, this reads only PayloadHash
 * for the recent window and fetches Status only when an exact hash matches.
 * No queue/write/delivery semantics change.
 */
var AMS01_NOTIFICATION_QUEUE_PERF_ZZ_BUILD='AMS01_NOTIFICATION_QUEUE_PERF_ZZ_20260908_R1';

function NB_recentQueueDuplicate_(sh,hash,eventCode,recipientEmail,auditId){
  var t0=Date.now();
  var out={found:false};
  if(!sh||!hash) return out;
  try{
    var lastRow=sh.getLastRow();
    if(lastRow<2) return out;

    var lastCol=Math.max(1,sh.getLastColumn());
    var hdr=sh.getRange(1,1,1,lastCol).getDisplayValues()[0]||[];
    var hashCol=-1,statusCol=-1;
    for(var i=0;i<hdr.length;i++){
      var h=String(hdr[i]||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
      if(hashCol<0&&(h==='payloadhash'||h==='hash'||h==='queuehash')) hashCol=i+1;
      if(statusCol<0&&h==='status') statusCol=i+1;
    }
    if(hashCol<1) return out;

    var startRow=Math.max(2,lastRow-199);
    var count=lastRow-startRow+1;
    var vals=sh.getRange(startRow,hashCol,count,1).getDisplayValues();
    var target=String(hash||'').trim();
    for(var r=vals.length-1;r>=0;r--){
      if(String((vals[r]&&vals[r][0])||'').trim()!==target) continue;
      var rowNum=startRow+r;
      var status='';
      if(statusCol>0){
        try{status=String(sh.getRange(rowNum,statusCol).getDisplayValue()||'').trim();}catch(eStatus){}
      }
      out={found:true,row:rowNum,status:status,match:'PAYLOAD_HASH'};
      break;
    }
  }catch(e){
    try{Logger.log('[AMS01_QUEUE_DUP_ERROR] '+String(e&&e.message?e.message:e));}catch(_e){}
  }
  try{Logger.log('[AMS01_QUEUE_DUP] '+JSON.stringify({build:AMS01_NOTIFICATION_QUEUE_PERF_ZZ_BUILD,found:!!out.found,wallMs:Date.now()-t0}));}catch(eLog){}
  return out;
}

function AMS01_NotificationQueuePerfZZStatus(){
  var ss=SpreadsheetApp.getActiveSpreadsheet()||SpreadsheetApp.getActive();
  var sh=ss&&ss.getSheetByName('Notification Queue');
  var t0=Date.now();
  var r=NB_recentQueueDuplicate_(sh,'__AMS01_NO_MATCH__','','','');
  return {success:true,active:true,build:AMS01_NOTIFICATION_QUEUE_PERF_ZZ_BUILD,wallMs:Date.now()-t0,found:!!(r&&r.found)};
}
