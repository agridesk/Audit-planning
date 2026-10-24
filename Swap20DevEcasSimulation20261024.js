// DEV-only SWAP combined ECAS dry-run. Never queues, sends, or creates delivery receipts.
function RUN_SIMULATE_SWAP20_COMBINED_ECAS_DEV_20261024(){
 var p=PropertiesService.getScriptProperties(),id='SWAP20_aded19c574a940b398b8c1ded84ff9e9';
 if(String(p.getProperty('AMS_ENV')||'')!=='DEV'||String(p.getProperty('V5_SSOT_SPREADSHEET_ID')||'')!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')throw Error('DEV_ONLY');
 var proposal=Swap20Store_read_(id),history=Swap20Journal_history_(id);
 if(!proposal||proposal.status!=='APPLIED'||proposal.canonicalCommitVerified!==true||!history.length||history[history.length-1].stage!=='COMMITTED')throw Error('SWAP_NOT_COMMITTED');
 if(Swap20_verifyCommittedReconciliationLocked_(history,proposal)!==true)throw Error('CANONICAL_MISMATCH');
 var before=history[0].payload.canonical,headers=before.headers.map(function(v){return String(v||'').toLowerCase().replace(/[ _-]/g,'');}),ix=headers.indexOf('planningjson');
 if(ix<0||!before.rows||before.rows.length!==2)throw Error('BEFORE_IMAGE_INVALID');
 var sh=SpreadsheetApp.openById(p.getProperty('V5_SSOT_SPREADSHEET_ID')).getSheetByName(NotificationConfig_GetQueueSheetName());
 var rows=sh.getRange(2,1,Math.max(1,sh.getLastRow()-1),13).getValues(),items=[],ids=[proposal.auditA,proposal.auditB];
 for(var i=0;i<2;i++){
  var image=before.rows[i],aid=ids[i],old=JSON.parse(String(image.values[ix]||'{}')),blocks=old.blocks||[];
  if(image.auditId!==aid||!blocks.length)throw Error('ORIGINAL_SCHEDULE_INVALID_'+i);
  var digest=ECAS20_receiptDigest_(blocks),candidates=[];
  for(var j=0;j<rows.length;j++){
   var r=rows[j];
   if(String(r[4])!==aid||String(r[2])!=='ECAS_AUDIT_APPROVAL_DIGEST'||String(r[1])!=='SENT_DEV_REDIRECT')continue;
   candidates.push({row:j+2,sentAt:String(r[11]||''),body:String(r[7]||'')});
  }
  var prior=blocks.map(function(b){return String(b.date)+' '+String(b.start)+'-'+String(b.end);});
  var matches=candidates.filter(function(c){return blocks.every(function(b){var d=String(b.date),parts=d.split('-'),day=parts.length===3?parts[2]+'-'+parts[1]+'-'+parts[0]:d;return c.body.indexOf(day)>=0&&c.body.indexOf(String(b.start))>=0&&c.body.indexOf(String(b.end))>=0;});});
  var next=i===0?proposal.blocksA:proposal.blocksB;
  items.push({auditId:aid,prior:prior,next:next.map(function(b){return String(b.date)+' '+String(b.start)+'-'+String(b.end);}),priorPlanningDigest:digest,redirectedQueueRows:candidates.map(function(c){return c.row;}),matchingRedirectRows:matches.map(function(c){return c.row;}),testEvidenceOnly:true});
 }
 var result={ok:items.every(function(x){return x.matchingRedirectRows.length>0;}),simulation:true,noQueueWrite:true,noEmail:true,noReceiptWrite:true,operationId:id,eventKey:'ECAS_AUDIT_CHANGED_DIGEST',combined:true,recipientCount:1,ecasComment:proposal.ecasComment,items:items,liveDeliveryAllowed:false};
 Logger.log(JSON.stringify(result));return result;
}
