/**
 * Weekly auditor digest with pending SWAP acknowledgements.
 * Dedicated runner: replace the existing weekly trigger function with
 * runAuditorWeeklyAlertSwap20. Do not run both runners.
 */
function runAuditorWeeklyAlertSwap20(options) {
 options=options||{};
 var props=PropertiesService.getScriptProperties();
 if(String(props.getProperty('AMS_ENV')||'').toUpperCase()!=='DEV')throw Error('SWAP20_WEEKLY_DEV_ONLY');
 var ss=SpreadsheetApp.getActiveSpreadsheet();
 if(String(props.getProperty('V5_SSOT_SPREADSHEET_ID')||'')!==ss.getId())throw Error('SWAP20_WEEKLY_SSOT_MISMATCH');
 var cfg=NotificationConfig_GetWeeklyAuditorConfig(),settings=cfg.settings||nra2_loadSettings_(ss);
 var recipients=nra2_getAuditorRecipients_(ss,settings);
 var preview=runAuditorWeeklyAlert({previewOnly:true});
 if(!preview||preview.ok!==true)throw Error('WEEKLY_BASE_PREVIEW_FAILED');
 var byUid={};
 (preview.results||[]).forEach(function(r){if(r.previewOnly&&r.auditorUid)byUid[String(r.auditorUid)]=r;});
 var proposals=nra2_swap20WeeklyProposals_(),result=[];
 recipients.forEach(function(rec){
  if(!rec||!rec.uid||!rec.email)return;
  var uid=String(rec.uid),base=byUid[uid],swaps=[];
  proposals.forEach(function(p){
   if(p.requiredAuditorUids.indexOf(uid)<0||p.acknowledgedAuditorUids.indexOf(uid)>=0)return;
   swaps.push(p);
  });
  if(!base&&!swaps.length)return;
  var html=base?String(base.htmlBody||''):nra2_swap20WeeklyEmptyBase_(rec.name);
  if(swaps.length)html=nra2_swap20WeeklyInsert_(html,swaps);
  var subject=base?base.subject:'Weekly audit actions - '+rec.name+' - '+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'dd-MM-yyyy');
  if(options.previewOnly===true){
   result.push({auditorUid:uid,recipient:rec.email,previewOnly:true,subject:subject,htmlBody:html,pendingSwap:swaps.length});
   return;
  }
  var queued=nrm2_queueWeeklyMail_(ss,{
   eventKey:'WEEKLY_AUDITOR_DIGEST',digestGroup:'AUDITOR_WEEKLY',
   recipient:rec.email,subject:subject,body:'See HTML version',htmlBody:html,
   fromName:settings.DEFAULT_FROM_NAME||'Audit Management System',
   replyTo:settings.DEFAULT_REPLY_TO||'',
   meta:{source:'runAuditorWeeklyAlertSwap20',auditorUid:uid,
    auditorName:rec.name,counts:{pendingSwap:swaps.length}}
  });
  result.push({auditorUid:uid,recipient:rec.email,queued:!!queued.ok,
   queueRow:queued.row||'',error:queued.error||'',pendingSwap:swaps.length});
 });
 return {ok:true,previewOnly:options.previewOnly===true,results:result};
}
function nra2_swap20WeeklyProposals_(){
 var props=PropertiesService.getScriptProperties().getProperties(),out=[];
 Object.keys(props).forEach(function(k){
  if(k.indexOf('AMS_SWAP20_PROPOSAL_')!==0)return;
  var p;try{p=JSON.parse(props[k]);}catch(e){throw Error('SWAP20_WEEKLY_INVALID_PROPOSAL');}
  if(!p||['AWAITING_ACKNOWLEDGEMENT','ESCALATED'].indexOf(p.status)<0)return;
  if(!Array.isArray(p.requiredAuditorUids)||!Array.isArray(p.acknowledgedAuditorUids))throw Error('SWAP20_WEEKLY_INVALID_UIDS');
  out.push(p);
 });
 return out.sort(function(a,b){return String(a.createdAt||'').localeCompare(String(b.createdAt||''));});
}
function nra2_swap20WeeklyEmptyBase_(name){
 return '<div style="font-family:Arial,sans-serif;font-size:13px;color:#24292f;">'
 +'<h2>Weekly audit actions</h2><p>Hello '+nra2_safe_(name)+'</p></div>';
}
function nra2_swap20WeeklyInsert_(html,proposals){
 var section='<div style="font-family:Arial,sans-serif;margin:16px 0 22px;">'
 +'<h3>Pending SWAP requests ('+proposals.length+')</h3>'
 +'<p>The manager has proposed exchanging audit dates. Please acknowledge or decline in the Auditor Portal.</p>';
 function fmt(blocks){
  return Array.isArray(blocks)?blocks.map(function(b){
   return nra2_safe_(String(b.date||'')+' '+String(b.start||'')+'-'+String(b.end||''));
  }).join('; '):'';
 }
 proposals.forEach(function(p){
  section+='<p><strong>'+nra2_safe_(p.auditA)+' / '+nra2_safe_(p.auditB)+'</strong>'
   +'<br>Proposed audit A: '+fmt(p.blocksA)
   +'<br>Proposed audit B: '+fmt(p.blocksB)
   +'<br><strong>Action: acknowledge or decline in the Auditor Portal</strong></p>';
 });
 section+='</div>';
 var marker='<p style="margin-top:18px;color:#57606a;">This is an automated weekly report';
 var pos=html.indexOf(marker);
 return pos>=0?html.slice(0,pos)+section+html.slice(pos):html+section;
}
