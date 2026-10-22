// AMS 2.0 issue #45 — durable, deterministic combined Visit audit-trail intents.
// Only called AFTER confirmed canonical commit, while the caller holds GAS ScriptLock.
// No operational e-mail is sent; rows are AUDIT_TRAIL events in Notification Queue.
var MODEL_C_COMBINED_VISIT_TRAIL20_BUILD='2026-10-22_ISSUE45_AUDIT_TRAIL_R1';
function MCCVT20_clean_(v){return String(v==null?'':v).trim();}
function MCCVT20_hash_(input){
 var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,String(input||'')),out='';
 for(var i=0;i<bytes.length;i++){var n=bytes[i]<0?bytes[i]+256:bytes[i],s=n.toString(16);out+=(s.length===1?'0':'')+s;}
 return out;
}
function ModelCCombinedVisitTrail20_emit(input){
 input=input||{};
 var id=MCCVT20_clean_(input.targetAuditId),sources=Array.isArray(input.sourceAuditIds)?input.sourceAuditIds.map(MCCVT20_clean_).filter(Boolean):[],
  obligations=Array.isArray(input.obligationIds)?input.obligationIds.map(MCCVT20_clean_).filter(Boolean):[],
  actor=MCCVT20_clean_(input.actorEmail),company=MCCVT20_clean_(input.company);
 if(!id||!sources.length||!obligations.length||!actor)throw Error('COMBINED_TRAIL_REQUIRED_FIELDS');
 var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss&&ss.getSheetByName('Notification Queue');
 if(!sh)throw Error('COMBINED_TRAIL_QUEUE_UNAVAILABLE');
 var now=new Date(),time=Utilities.formatDate(now,ss.getSpreadsheetTimeZone(),'yyyy-MM-dd HH:mm'),stamp=now.toISOString();
 var batchKey=id+'|'+sources.slice().sort().join(',')+'|'+obligations.slice().sort().join(',');
 var events=[{type:'VISIT_COMPOSITION_CHANGED',auditId:id,sourceAuditIds:sources,obligationIds:obligations}];
 sources.forEach(function(source){events.push({type:'VISIT_SOURCE_PROJECTION_RETIRED',auditId:source,targetAuditId:id});});
 var added=0,existing=0;
 for(var i=0;i<events.length;i++){
  var ev=events[i],hash=MCCVT20_hash_('AMS_ISSUE45|'+ev.type+'|'+batchKey+'|'+ev.auditId);
  var last=sh.getLastRow(),duplicate=false;
  if(last>=2){var hits=sh.getRange(2,11,last-1,1).createTextFinder(hash).matchEntireCell(true).findNext();duplicate=!!hits;}
  if(duplicate){existing++;continue;}
  var payload={type:ev.type,auditId:ev.auditId,targetAuditId:ev.targetAuditId||id,company:company,
    actorEmail:actor,actorRole:'MANAGER',sourceAuditIds:ev.sourceAuditIds||sources,
    obligationIds:ev.obligationIds||obligations,source:'GAS_MODEL_C_COMBINED_VISIT',timestamp:stamp};
  var title='[TRAIL] '+ev.type+' :: '+ev.auditId;
  sh.appendRow([time,'AUDIT_TRAIL',ev.type,'',ev.auditId,company,title,JSON.stringify(payload),0,'',hash,'',JSON.stringify({payload:payload})]);
  added++;
 }
 return{success:true,added:added,alreadyPresent:existing,expected:events.length,readOnly:false,
  deduplicated:existing>0,build:MODEL_C_COMBINED_VISIT_TRAIL20_BUILD};
}
