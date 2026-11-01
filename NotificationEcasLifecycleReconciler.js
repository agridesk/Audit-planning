// AMS #88: explicit DEV-only replay of durable lifecycle trail to ECAS outbox.
// Does not enable flags or send email directly.
function RUN_ECAS20_RECONCILE_DEV_(){
 var props=PropertiesService.getScriptProperties(),env=String(props.getProperty('AMS_ENV')||props.getProperty('ENVIRONMENT')||'').trim().toUpperCase();
 if(env!=='DEV')throw Error('ECAS_RECONCILE_DEV_ONLY');
 if(String(props.getProperty('ECAS20_CHANGE_CANCEL_ENABLED')||'').toUpperCase()!=='YES')return{ok:true,skipped:true,reason:'FEATURE_DISABLED'};
 var ss=SpreadsheetApp.getActiveSpreadsheet(),q=ss.getSheetByName('Notification Queue'),ap=ss.getSheetByName('Audit planning'),rej=ss.getSheetByName('Rejected audits');
 if(!q||!ap||!rej)throw Error('ECAS_RECONCILE_SOURCE_MISSING');
 var rows=q.getDataRange().getValues(),header=rows[0].map(function(x){return String(x||'').toLowerCase().replace(/[^a-z0-9]/g,'');});
 var type=header.indexOf('type'),audit=header.indexOf('auditid'),reserved=header.indexOf('reserved'),status=header.indexOf('status');
 if([type,audit,reserved,status].some(function(x){return x<0;}))throw Error('ECAS_RECONCILE_QUEUE_SCHEMA_INVALID');
 var ah=ap.getDataRange().getValues(),rh=rej.getDataRange().getValues();
 function index(h,name){return h[0].map(function(x){return String(x||'').toLowerCase().replace(/[^a-z0-9]/g,'');}).indexOf(name);}
 var ai=index(ah,'auditid'),as=index(ah,'status'),ri=index(rh,'auditid');if(ai<0||as<0||ri<0)throw Error('ECAS_RECONCILE_CANONICAL_SCHEMA_INVALID');
 var pending=new Map(),skipped=0;
 for(var i=1;i<rows.length;i++){
  var r=rows[i];if(String(r[type]||'')!=='LIFECYCLE_STATUS_CHANGED'||String(r[status]||'')!=='AUDIT_TRAIL')continue;
  var p;try{var raw=JSON.parse(String(r[reserved]||''));p=raw.payload||raw;}catch(e){skipped++;continue;}
  var action=String(p.action||'').toUpperCase(),id=String(p.auditId||'').trim(),reason=String(p.reason||'').trim();
  if((action!=='CANCEL'&&action!=='REJECT')||!id||!reason||id!==String(r[audit]||'').trim())continue;
  var live=ah.slice(1).filter(function(x){return String(x[ai]||'').trim()===id;}),archived=rh.slice(1).some(function(x){return String(x[ri]||'').trim()===id;});
  if(action==='CANCEL'&&(live.length!==1||String(live[0][as]||'').toLowerCase().replace(/[ _-]/g,'')!=='pendingplanning')){skipped++;continue;}
  if(action==='REJECT'&&(live.length||!archived)){skipped++;continue;}
  var key=id+'|'+action;
  if(pending.has(key)){pending.delete(key);skipped++;continue;} // Ambiguous multiple transitions; never guess.
  pending.set(key,{action:action,auditId:id,reason:reason,afterStatus:action==='CANCEL'?'PENDING_PLANNING':'REJECTED'});
 }
 var attempted=0,queued=0,failures=[];
 pending.forEach(function(item){if(attempted>=50)return;attempted++;
  try{var result=ECAS20_QueueCommittedLifecycle_(item.action,{auditId:item.auditId},{reason:item.reason},{success:true,afterStatus:item.afterStatus});if(result&&result.queued)queued++;else failures.push({auditId:item.auditId,reason:result&&result.reason||'NOT_QUEUED'});}
  catch(e){failures.push({auditId:item.auditId,reason:String(e&&e.message||e)});}
 });
 return{ok:failures.length===0,readOnly:false,devOnly:true,attempted:attempted,queued:queued,skipped:skipped,failures:failures};
}
