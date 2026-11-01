const clean=x=>String(x??'').trim();
const key=x=>clean(x).toLowerCase().replace(/[^a-z0-9]/g,'');
const col=(h,n)=>h.findIndex(x=>n.some(y=>key(x)===key(y)));
const sent=new Set(['SENT','DELIVERED']);
const events=new Set(['ECAS_AUDIT_APPROVAL_DIGEST','ECAS_AUDIT_CHANGED_DIGEST']);
export function findVerifiedEcasReceipt20({auditId,queueRows,expectedRecipient}){
 if(!clean(auditId)||!clean(expectedRecipient)||!Array.isArray(queueRows)||!queueRows.length)throw Error('ECAS_RECEIPT_INPUT_INVALID');
 const h=queueRows[0],idx={status:col(h,['Status','State']),event:col(h,['Type','Event Type','Event','EventType']),recipient:col(h,['Recipient','Recipient Email','Email']),audit:col(h,['Audit ID','Audit_ID']),hash:col(h,['PayloadHash','Hash','Dedup Hash','Idempotency Key']),payload:col(h,['Reserved','Payload JSON','Payload','Metadata'])};
 if(Object.values(idx).some(v=>v<0))throw Error('ECAS_RECEIPT_SCHEMA_UNVERIFIED');
 const matches=[];
 for(let i=1;i<queueRows.length;i++){
  const r=queueRows[i];if(!sent.has(clean(r[idx.status]).toUpperCase())||!events.has(clean(r[idx.event]).toUpperCase())||clean(r[idx.audit])!==auditId||clean(r[idx.recipient]).toLowerCase()!==clean(expectedRecipient).toLowerCase())continue;
  const receipt=clean(r[idx.hash]);if(!receipt)continue;
  let raw;try{raw=JSON.parse(clean(r[idx.payload]));}catch{continue}
  const p=raw?.payload||raw;
  if(clean(p.auditId)!==auditId||!clean(p.company)||!clean(p.mpsNumber)||!clean(p.auditorUid)||!Array.isArray(p.scopes)||!p.scopes.length||!Array.isArray(p.blocks)||!p.blocks.length||!Number.isFinite(Number(p.plannedHours))||Number(p.plannedHours)<=0)continue;
  matches.push({receipt,sourceRow:i+1,eventType:clean(r[idx.event]),recipientEmail:clean(r[idx.recipient]),schedule:{auditId,date:clean(p.blocks[0].date),auditorUid:clean(p.auditorUid),auditorName:clean(p.auditorName),company:clean(p.company),mpsNumber:clean(p.mpsNumber),scopes:p.scopes.map(clean),hours:Number(p.plannedHours),blocks:p.blocks}});
 }
 if(matches.length!==1)return{verified:false,reason:matches.length?'ECAS_RECEIPT_AMBIGUOUS':'NO_SENT_ECAS_RECEIPT',matches:matches.length};
 return{verified:true,...matches[0]};
}
