/***********************************************************************
 * FILE: AcceptedNotificationAuditPlanningRecovery.js
 * BUILD: 2026-09-17_ACCEPTED_NOTIFICATION_AP_RECOVERY_R1
 *
 * PURPOSE
 * Recovery path for ACCEPT notifications when the historical lifecycle
 * trail row is absent. Uses canonical Audit planning status plus durable
 * auditor-decision metadata written by AuditLifecycleService.
 * Queue-only repair; never changes lifecycle, planning or availability.
 ***********************************************************************/
var ANAPR_BUILD='2026-09-17_ACCEPTED_NOTIFICATION_AP_RECOVERY_R1';

function RUN_ACCEPTED_NOTIFICATION_AP_RECOVERY_14D_DRYRUN(){return AcceptedNotificationAuditPlanningRecovery_Run_({lookbackDays:14,dryRun:true,maxRepairs:100});}
function RUN_ACCEPTED_NOTIFICATION_AP_RECOVERY_14D(){return AcceptedNotificationAuditPlanningRecovery_Run_({lookbackDays:14,dryRun:false,maxRepairs:100});}

function ANAPR_clean_(v){return String(v==null?'':v).trim();}
function ANAPR_norm_(v){return ANAPR_clean_(v).replace(/[–—−]/g,'-').replace(/\u00A0/g,' ').replace(/[\u200B-\u200D\uFEFF]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function ANAPR_header_(hdr,names){var m={};for(var i=0;i<(hdr||[]).length;i++){var k=ANAPR_norm_(hdr[i]);if(k&&m[k]===undefined)m[k]=i;}for(var n=0;n<(names||[]).length;n++){var w=ANAPR_norm_(names[n]);if(Object.prototype.hasOwnProperty.call(m,w))return m[w];}return-1;}
function ANAPR_date_(v){if(v instanceof Date&&!isNaN(v.getTime()))return v;var s=ANAPR_clean_(v);if(!s)return null;var d=new Date(s);return isNaN(d.getTime())?null:d;}

function AcceptedNotificationAuditPlanningRecovery_Find_(ss,lookbackDays,auditIdFilter){
  var sh=ss.getSheetByName('Audit planning');if(!sh)throw new Error("Missing sheet 'Audit planning'");
  var lr=sh.getLastRow(),lc=sh.getLastColumn();if(lr<2||lc<1)return[];
  var vals=sh.getRange(1,1,lr,lc).getValues(),hdr=vals[0]||[];
  var cId=ANAPR_header_(hdr,['Audit ID','Audit_ID','AuditId']);
  var cStatus=ANAPR_header_(hdr,['Status']);
  var cDecision=ANAPR_header_(hdr,['Last auditor decision']);
  var cStamp=ANAPR_header_(hdr,['Last auditor decision timestamp']);
  if(cId<0||cStatus<0||cDecision<0||cStamp<0)throw new Error('Required accepted-recovery columns missing');
  var cutoff=Date.now()-Math.max(1,Number(lookbackDays||14))*86400000,out=[];
  for(var r=1;r<vals.length;r++){
    var row=vals[r]||[],id=ANAPR_clean_(row[cId]);if(!id)continue;
    if(auditIdFilter&&id!==auditIdFilter)continue;
    if(ANAPR_norm_(row[cStatus])!=='accepted')continue;
    if(ANAPR_norm_(row[cDecision])!=='accept')continue;
    var ts=ANAPR_date_(row[cStamp]);if(!ts||ts.getTime()<cutoff)continue;
    out.push({auditId:id,rowNumber:r+1,timestamp:ts.toISOString(),source:'AUDIT_PLANNING_AUDITOR_DECISION'});
  }
  out.sort(function(a,b){return a.timestamp.localeCompare(b.timestamp);});return out;
}

function AcceptedNotificationAuditPlanningRecovery_Run_(opts){
  opts=opts||{};var started=Date.now(),dryRun=opts.dryRun===true,lookbackDays=Math.max(1,Number(opts.lookbackDays||14)),maxRepairs=Math.max(1,Number(opts.maxRepairs||100)),auditIdFilter=ANAPR_clean_(opts.auditId),out={ok:true,build:ANAPR_BUILD,dryRun:dryRun,lookbackDays:lookbackDays,scannedAccepted:0,candidates:0,repaired:0,skipped:0,unresolved:0,errors:[],items:[]};
  try{
    if(typeof AcceptedNotificationReconciler_LoadQueue_!=='function'||typeof AcceptedNotificationReconciler_GetRequiredEventState_!=='function'||typeof AcceptedNotificationReconciler_LoadAuditContext_!=='function')throw new Error('NotificationAcceptedReconciler helpers unavailable');
    if(typeof StatusNotificationBridge_Dispatch_!=='function')throw new Error('StatusNotificationBridge_Dispatch_ unavailable');
    var ss=SpreadsheetApp.getActiveSpreadsheet()||SpreadsheetApp.getActive();if(!ss)throw new Error('Active spreadsheet unavailable');
    var qsh=ss.getSheetByName('Notification Queue');if(!qsh)throw new Error("Missing sheet 'Notification Queue'");
    var queue=AcceptedNotificationReconciler_LoadQueue_(qsh),events=AcceptedNotificationAuditPlanningRecovery_Find_(ss,lookbackDays,auditIdFilter);out.scannedAccepted=events.length;
    for(var i=0;i<events.length;i++){
      if(out.repaired>=maxRepairs)break;var ev=events[i],id=ev.auditId,before=AcceptedNotificationReconciler_GetRequiredEventState_(queue,id);
      if(before.complete){out.skipped++;out.items.push({auditId:id,action:'SKIP',reason:'REQUIRED_QUEUE_EVENTS_PRESENT',source:ev.source,state:before});continue;}
      out.candidates++;
      if(dryRun){out.items.push({auditId:id,action:'DRYRUN_REPAIR_NEEDED',source:ev.source,auditPlanningRow:ev.rowNumber,timestamp:ev.timestamp,state:before});continue;}
      try{
        var ctx=AcceptedNotificationReconciler_LoadAuditContext_(id);if(!ctx||!ctx.found)throw new Error('Audit planning row not found for auditId='+id);
        var payload={actorRole:'AUDITOR',action:'ACCEPT',source:'AcceptedNotificationAuditPlanningRecovery',reconciledFromAuditPlanningRow:ev.rowNumber};
        var result={success:true,auditId:id,beforeStatus:'APPROVED',beforeStatusDisplay:'Approved',afterStatus:'ACCEPTED',afterStatusDisplay:'Accepted',newStatus:'Accepted'};
        var bridge=StatusNotificationBridge_Dispatch_('ACCEPT','AUDITOR',ctx,payload,result);
        var fresh=AcceptedNotificationReconciler_LoadQueue_(qsh),after=AcceptedNotificationReconciler_GetRequiredEventState_(fresh,id);queue=fresh;
        if(after.complete){out.repaired++;out.items.push({auditId:id,action:'REPAIRED',source:ev.source,beforeState:before,afterState:after,bridgeResult:bridge||null});}
        else{out.unresolved++;out.items.push({auditId:id,action:'UNRESOLVED',source:ev.source,beforeState:before,afterState:after,bridgeResult:bridge||null});}
      }catch(e){out.unresolved++;out.errors.push({auditId:id,message:ANAPR_clean_(e&&e.message||e)});}
    }
  }catch(e0){out.ok=false;out.errors.push({message:ANAPR_clean_(e0&&e0.message||e0)});}
  if(out.errors.length||out.unresolved)out.ok=false;out.durationMs=Date.now()-started;Logger.log(JSON.stringify(out,null,2));return out;
}

function RUN_ACCEPTED_NOTIFICATION_AP_RECOVERY_REGRESSION(){
  var hdr=['Audit ID','Status','Last auditor decision','Last auditor decision timestamp'];
  var out={ok:ANAPR_header_(hdr,['Audit ID'])===0&&ANAPR_header_(hdr,['Status'])===1&&ANAPR_header_(hdr,['Last auditor decision'])===2&&ANAPR_header_(hdr,['Last auditor decision timestamp'])===3,build:ANAPR_BUILD,meta:{queueOnly:true,lifecycleWrites:false,planningWrites:false,availabilityWrites:false,canonicalEvidence:['Audit planning.Status','Audit planning.Last auditor decision','Audit planning.Last auditor decision timestamp']}};
  Logger.log(JSON.stringify(out,null,2));return out;
}
