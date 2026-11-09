/**
 * AMS 2.0 Certification Body extension notifications.
 * Apps Script reconciler owned by the existing NotificationSender lock.
 * No ECAS/default/manager recipient fallback. All identity comes from
 * Config_Scopes -> Certification_Body_ID and Audit_Obligations snapshot.
 * Existing legacy notification families are not modified here.
 */
var CBN20_EVENT_KEYS_=['CB_EXTENSION_APPLIED','CB_EXTENSION_UNDONE'];
var CBN20_OUTBOX='CB_Extension_Outbox';

function CBN20_text_(x){return String(x==null?'':x).trim();}
function CBN20_yes_(x){return /^(yes|true|1)$/i.test(CBN20_text_(x));}
function CBN20_table_(sh,required){
 if(!sh)throw Error('CB_NOTIFICATION_TABLE_MISSING');
 var v=sh.getDataRange().getValues(),h=(v[0]||[]).map(CBN20_text_);
 for(var i=0;i<required.length;i++)if(h.indexOf(required[i])<0)throw Error('CB_NOTIFICATION_SCHEMA_'+required[i]);
 if(v.length>5000)throw Error('CB_NOTIFICATION_SOURCE_LIMIT');
 return{sheet:sh,values:v,head:h,col:function(name){return h.indexOf(name);},
  get:function(row,name){var i=h.indexOf(name);return i<0?'':CBN20_text_(row[i]);}};
}
function CBN20_row_(table,name,value){
 var matches=[];
 for(var i=1;i<table.values.length;i++)if(table.get(table.values[i],name)===value)matches.push({row:table.values[i],number:i+1});
 if(matches.length!==1)throw Error('CB_NOTIFICATION_REFERENCE_MISSING_OR_AMBIGUOUS_'+name);
 return matches[0];
}
function CBN20_eventIdFromQueue_(row){
 var json=CBN20_text_(row[12]);if(!json)return'';
 try{var p=JSON.parse(json);return CBN20_text_(p.cbEventId||(p.payload&&p.payload.cbEventId))}catch(e){return''}
}
function CBN20_template_(table,key,data){
 var matches=table.values.slice(1).filter(function(r){return table.get(r,'TEMPLATE_KEY')===key&&CBN20_yes_(table.get(r,'ACTIVE'));});
 if(matches.length!==1)throw Error('CB_NOTIFICATION_TEMPLATE_UNAVAILABLE');
 var row=matches[0],subject=table.get(row,'SUBJECT_TEMPLATE'),body=table.get(row,'TEXT_BODY');
 if(!subject||!body)throw Error('CB_NOTIFICATION_TEMPLATE_EMPTY');
 var resolve=function(text){
  return text.replace(/\{\{([A-Z_]+)\}\}/g,function(full,k){
   if(!Object.prototype.hasOwnProperty.call(data,k))throw Error('CB_NOTIFICATION_UNKNOWN_PLACEHOLDER_'+k);
   return CBN20_text_(data[k]);
  });
 };
 return{subject:resolve(subject),body:resolve(body)};
}
function CBN20_context_(ss){
 var outbox=CBN20_table_(ss.getSheetByName(CBN20_OUTBOX),[
  'Event_ID','Operation_ID','Audit_ID','Obligation_ID','Company_UID','ScopeCode','Certification_Body_ID','State_After','Created_At','Not_Before','Status','Details_JSON']);
 var obligations=CBN20_table_(ss.getSheetByName('Audit_Obligations'),['Obligation_ID','Company_UID','ScopeCode','Certification_Body_ID','Extension_Applied']);
 var scopes=CBN20_table_(ss.getSheetByName('Config_Scopes'),['ScopeCode','Certification_Body_ID','Active']);
 var bodies=CBN20_table_(ss.getSheetByName('Certification_Bodies'),['Certification_Body_ID','Display_Name','Active','Notification_Email','Email_Verified','Notification_Enabled']);
 var config=CBN20_table_(ss.getSheetByName('Notification_Config'),['EVENT_KEY','ACTIVE','SEND_EMAIL','LOG_ONLY','BUFFER_MINUTES']);
 var templates=CBN20_table_(ss.getSheetByName('Notification_Templates'),['TEMPLATE_KEY','ACTIVE','SUBJECT_TEMPLATE','TEXT_BODY']);
 var queue=CBN20_table_(ss.getSheetByName('Notification Queue'),['Status','Type','Recipient','PayloadHash','Reserved']);
 return{outbox:outbox,obligations:obligations,scopes:scopes,bodies:bodies,config:config,templates:templates,queue:queue};
}
function CBN20_validateRecipient_(context,event,requireDelivery){
 var obligation=CBN20_row_(context.obligations,'Obligation_ID',event.Obligation_ID).row;
 var scope=CBN20_row_(context.scopes,'ScopeCode',event.ScopeCode).row;
 var cid=event.Certification_Body_ID;
 if(!cid||cid!==context.obligations.get(obligation,'Certification_Body_ID')
   ||cid!==context.scopes.get(scope,'Certification_Body_ID')
   ||event.ScopeCode!==context.obligations.get(obligation,'ScopeCode')
   ||event.Company_UID!==context.obligations.get(obligation,'Company_UID'))
  throw Error('CB_NOTIFICATION_IDENTITY_MISMATCH');
 if(!CBN20_yes_(context.scopes.get(scope,'Active')))throw Error('CB_NOTIFICATION_SCOPE_INACTIVE');
 var body=CBN20_row_(context.bodies,'Certification_Body_ID',cid).row;
 var email=context.bodies.get(body,'Notification_Email').toLowerCase();
 if(!CBN20_yes_(context.bodies.get(body,'Active')))throw Error('CB_NOTIFICATION_BODY_INACTIVE');
 if(requireDelivery!==false&&(!CBN20_yes_(context.bodies.get(body,'Email_Verified'))
   ||!CBN20_yes_(context.bodies.get(body,'Notification_Enabled'))
   ||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw Error('CB_NOTIFICATION_RECIPIENT_DISABLED_OR_UNVERIFIED');
 return{email:email,name:context.bodies.get(body,'Display_Name'),
  state:CBN20_yes_(context.obligations.get(obligation,'Extension_Applied'))?'APPLIED':'NOT_APPLIED'};
}
function CBN20_noticeKey_(state){return state==='APPLIED'?'CB_EXTENSION_APPLIED':'CB_EXTENSION_UNDONE'}
function CBN20_set_(table,rowNumber,name,value){table.sheet.getRange(rowNumber,table.col(name)+1).setValue(value);}
function CBN20_suppressQueue_(ctx,eventId,reason){
 for(var i=1;i<ctx.queue.values.length;i++){
  var row=ctx.queue.values[i],id=CBN20_eventIdFromQueue_(row),st=ctx.queue.get(row,'Status');
  if(id===eventId&&(st==='PENDING'||st==='RESERVED')){
   CBN20_set_(ctx.queue,i+1,'Status','SENT_SUPPRESSED');
   ctx.queue.sheet.getRange(i+1,10).setValue(reason);
  }
 }
}
function CBN20_inDev_(){
 var active=SpreadsheetApp.getActiveSpreadsheet();
 // DEV isolation is based on the actual spreadsheet ID, not on a
 // generic DEV column which may also exist in a PROD workbook.
 if(!active||typeof active.getId!=='function'
   ||active.getId()!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')return false;
 var sh=active.getSheetByName('System_Config');
 if(!sh)return false;
 var rows=sh.getDataRange().getValues(),h=rows[0]||[],c=h.indexOf('DEV');
 if(c<0)return false;
 var map={};for(var i=1;i<rows.length;i++)if(CBN20_text_(rows[i][0]))map[CBN20_text_(rows[i][0])]=CBN20_text_(rows[i][c]);
 return map.ENV==='DEV';
}
function CB_Extension_Outbox_ReconcileLocked_(){
 // Cloud Run directly writes only isolated DEV. Never touch PROD via this GAS handler.
 if(!CBN20_inDev_())return{ok:true,skipped:'NON_DEV'};
 var ss=SpreadsheetApp.getActiveSpreadsheet(),ctx=CBN20_context_(ss),h=ctx.outbox.head,byOb={};
 for(var i=1;i<ctx.outbox.values.length;i++){
  var row=ctx.outbox.values[i],ob=ctx.outbox.get(row,'Obligation_ID');if(!ob)continue;
  var item={row:row,rowNumber:i+1};
  if(!byOb[ob])byOb[ob]=[];
  byOb[ob].push(item);
 }
 var result={ok:true,buffered:0,queued:0,suppressed:0,blocked:0,skipped:0};
 for(var oid in byOb)if(Object.prototype.hasOwnProperty.call(byOb,oid)){
  var events=byOb[oid].sort(function(a,b){
   return Date.parse(ctx.outbox.get(a.row,'Created_At'))-Date.parse(ctx.outbox.get(b.row,'Created_At'))||a.rowNumber-b.rowNumber;
  });
  var last=events[events.length-1],latest=Object.fromEntries(h.map(function(key,i){return[key,CBN20_text_(last.row[i])] ;}));
  var sent=events.filter(function(e){return ['SENT','TESTED'].indexOf(ctx.outbox.get(e.row,'Status'))>=0&&ctx.outbox.get(e.row,'Delivered_At');});
  var delivered=sent.length?ctx.outbox.get(sent[sent.length-1].row,'State_After'):'NOT_APPLIED';
  var activeEvents=events.filter(function(e){return ['BUFFERED','BLOCKED','FAILED','QUEUED'].indexOf(ctx.outbox.get(e.row,'Status'))>=0;});
  if(!activeEvents.length)continue;
  try{
   var validated=CBN20_validateRecipient_(ctx,latest,false);
   var state=validated.state;
   if(state===delivered){
    for(var j=0;j<activeEvents.length;j++){
     var e=activeEvents[j],eventId=ctx.outbox.get(e.row,'Event_ID');
     CBN20_suppressQueue_(ctx,eventId,'No net extension change before delivery');
     CBN20_set_(ctx.outbox,e.rowNumber,'Status','SUPPRESSED');result.suppressed++;
    }
    continue;
   }
   if(latest.State_After!==state)throw Error('CB_NOTIFICATION_LATEST_EVENT_STATE_MISMATCH');
   // A later Apply or Undo resets the entire ten-minute buffer, even if
   // the earlier change was already queued but not sent.
   var due=Math.max(Date.parse(latest.Created_At)+600000,Date.parse(latest.Not_Before));
   if(!isFinite(due))throw Error('CB_NOTIFICATION_DATE_INVALID');
   for(var e0=0;e0<activeEvents.length;e0++){
    var older=activeEvents[e0],olderId=ctx.outbox.get(older.row,'Event_ID');
    if(olderId!==latest.Event_ID){
     CBN20_suppressQueue_(ctx,olderId,'Superseded by a newer extension state');
     CBN20_set_(ctx.outbox,older.rowNumber,'Status','SUPERSEDED');
    }
   }
   if(Date.now()<due){result.buffered++;continue;}
   validated=CBN20_validateRecipient_(ctx,latest,true);
   var eventKey=CBN20_noticeKey_(state),cfg=CBN20_row_(ctx.config,'EVENT_KEY',eventKey).row;
   var buffer=Number(ctx.config.get(cfg,'BUFFER_MINUTES'));
   if(!isFinite(buffer)||buffer<10||buffer>1440)throw Error('CB_NOTIFICATION_MIN_BUFFER_10_REQUIRED');
   if(Date.now()<Date.parse(latest.Created_At)+buffer*60000){result.buffered++;continue;}
   if(!CBN20_yes_(ctx.config.get(cfg,'ACTIVE'))||!CBN20_yes_(ctx.config.get(cfg,'SEND_EMAIL'))||CBN20_yes_(ctx.config.get(cfg,'LOG_ONLY')))
    throw Error('CB_NOTIFICATION_EVENT_CONFIG_DISABLED');
   var found=[];
   for(var qr=1;qr<ctx.queue.values.length;qr++)if(CBN20_eventIdFromQueue_(ctx.queue.values[qr])===latest.Event_ID)found.push({row:qr+1,values:ctx.queue.values[qr]});
   if(found.length>1)throw Error('CB_NOTIFICATION_DUPLICATE_QUEUE_INTENT');
   if(found.length===1){
    var st=ctx.queue.get(found[0].values,'Status');
    if(['PENDING','RESERVED','SENT','SENT_DEV_REDIRECT','SENT_SIMULATED'].indexOf(st)>=0){
     CBN20_set_(ctx.outbox,last.rowNumber,'Status',st==='SENT'?'SENT':(st==='SENT_DEV_REDIRECT'||st==='SENT_SIMULATED'?'TESTED':'QUEUED'));
     if(['SENT','SENT_DEV_REDIRECT','SENT_SIMULATED'].indexOf(st)>=0)CBN20_set_(ctx.outbox,last.rowNumber,'Delivered_At',CBN20_text_(found[0].values[11])||new Date().toISOString());
     result.skipped++;continue;
    }
    if(st==='FAILED')throw Error('CB_NOTIFICATION_QUEUE_FAILED');
   }
   var details;try{details=JSON.parse(latest.Details_JSON||'{}')}catch(err){throw Error('CB_NOTIFICATION_DETAILS_JSON_INVALID')}
   var render=CBN20_template_(ctx.templates,eventKey,{
    CERTIFICATION_BODY_NAME:validated.name,COMPANY_NAME:details.company,
    SCOPE_NAME:latest.ScopeCode,BASE_EXPIRY:details.baseExpiry,
    EFFECTIVE_EXPIRY:details.effectiveExpiry
   });
   var now=new Date(),tz=ss.getSpreadsheetTimeZone();
   var stamp=Utilities.formatDate(now,tz,'yyyy-MM-dd HH:mm');
   var payload={eventType:eventKey,eventFamily:'EXTERNAL_OPERATIONAL',rendererProfile:'CB_EXTENSION_TEMPLATE',
    cbEventId:latest.Event_ID,obligationId:oid,scopeCode:latest.ScopeCode,
    certificationBodyId:latest.Certification_Body_ID,stateAfter:state,
    config:{active:true,sendEmail:true,logOnly:false,consolidate:false,bufferMinutes:0,
     templateFamily:'CB_EXTENSION_TEMPLATE',digestGroup:'CB_EXTENSION'}};
   var hash=Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,latest.Event_ID+'|'+validated.email)
    .map(function(x){var z=(x+256)%256;return ('0'+z.toString(16)).slice(-2)}).join('');
   // The queue is append-only. Sender performs a second latest-state and
   // recipient check immediately before any actual mail dispatch.
   ctx.queue.sheet.appendRow([stamp,'PENDING',eventKey,validated.email,
    latest.Audit_ID,details.company,render.subject,render.body,0,'',hash,'',
    JSON.stringify({payload:payload})]);
   CBN20_set_(ctx.outbox,last.rowNumber,'Status','QUEUED');
   result.queued++;
  }catch(err){
   var reason=String(err&&err.message||err).slice(0,240);
   if(ctx.outbox.get(last.row,'Status')!=='QUEUED'){
    CBN20_set_(ctx.outbox,last.rowNumber,'Status','BLOCKED');
    CBN20_set_(ctx.outbox,last.rowNumber,'Last_Error',reason);
   }
   result.blocked++;
  }
 }
 return result;
}
function CB_Extension_Outbox_PreflightSend_(items,recipient){
 // Only this sender guard authorizes actual CB delivery. No override from
 // previously rendered content, legacy ECAS recipients or actor identity.
 if(!CBN20_inDev_())throw Error('CB_NOTIFICATION_NON_DEV_BLOCKED');
 if(!Array.isArray(items)||items.length!==1)throw Error('CB_NOTIFICATION_GROUP_MUST_BE_SINGLE');
 var item=items[0],p=item.payload||{},eventId=CBN20_text_(p.cbEventId);
 if(!eventId||CBN20_EVENT_KEYS_.indexOf(item.eventCode)<0)throw Error('CB_NOTIFICATION_PAYLOAD_INVALID');
 var ctx=CBN20_context_(SpreadsheetApp.getActiveSpreadsheet()),ev=CBN20_row_(ctx.outbox,'Event_ID',eventId);
 var event=Object.fromEntries(ctx.outbox.head.map(function(k,i){return[k,CBN20_text_(ev.row[i])]}));
 if(event.Status!=='QUEUED'||event.State_After!==p.stateAfter||event.Obligation_ID!==p.obligationId
  ||event.ScopeCode!==p.scopeCode||event.Certification_Body_ID!==p.certificationBodyId)
  throw Error('CB_NOTIFICATION_QUEUE_EVENT_MISMATCH');
 var forOb=ctx.outbox.values.slice(1).filter(function(r){return ctx.outbox.get(r,'Obligation_ID')===event.Obligation_ID;});
 if(forOb.length&&ctx.outbox.get(forOb[forOb.length-1],'Event_ID')!==eventId)throw Error('CB_NOTIFICATION_NEWER_CHANGE');
 if(Date.now()<Date.parse(event.Not_Before)||Date.now()<Date.parse(event.Created_At)+600000)throw Error('CB_NOTIFICATION_WAIT_10_MIN');
 var current=CBN20_validateRecipient_(ctx,event);
 if(current.state!==event.State_After||current.email!==CBN20_text_(recipient).toLowerCase())
  throw Error('CB_NOTIFICATION_STALE_STATE_OR_RECIPIENT');
 var config=CBN20_row_(ctx.config,'EVENT_KEY',item.eventCode).row;
 if(!CBN20_yes_(ctx.config.get(config,'ACTIVE'))||!CBN20_yes_(ctx.config.get(config,'SEND_EMAIL'))
   ||CBN20_yes_(ctx.config.get(config,'LOG_ONLY')))
  throw Error('CB_NOTIFICATION_SEND_CONFIG_DISABLED');
 return{ok:true,eventId:eventId};
}
function CB_Extension_Outbox_RecordDelivery_(items,deliveryStatus,sentAt){
 if(!Array.isArray(items))return;
 var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName(CBN20_OUTBOX);
 if(!sh)return;
 var ctx=CBN20_table_(sh,['Event_ID','Status','Delivered_At']);
 for(var i=0;i<items.length;i++){
  var key=CBN20_text_((items[i].payload||{}).cbEventId);if(!key)continue;
  var found=CBN20_row_(ctx,'Event_ID',key);
  var confirmed=deliveryStatus==='SENT',tested=deliveryStatus==='SENT_DEV_REDIRECT'||deliveryStatus==='SENT_SIMULATED';
  if(!confirmed&&!tested)continue;
  CBN20_set_(ctx,found.number,'Status',confirmed?'SENT':'TESTED');
  CBN20_set_(ctx,found.number,'Delivered_At',sentAt||new Date().toISOString());
 }
}
