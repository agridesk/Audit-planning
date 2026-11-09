/**
 * CB extension outbox — isolated DEV, no sending side effects.
 * Each entry is immutable; the reducer derives the latest state on demand.
 * Certification Body identity comes from the exact obligation snapshot.
 */
import {resolveCertificationBody20} from './certification-body-routing-20.mjs';
const str=x=>String(x??'').trim();
const allowed=new Set(['BUFFERED','SUPERSEDED','SUPPRESSED','QUEUED','SENT','TESTED','FAILED','BLOCKED']);
export const CB_EXTENSION_OUTBOX_HEADERS_20=Object.freeze([
 'Event_ID','Operation_ID','Audit_ID','Obligation_ID','Company_UID','ScopeCode',
 'Certification_Body_ID','Action','State_After','Created_At','Not_Before','Status',
 'Notification_Recipient','Delivered_At','Last_Error','Details_JSON'
]);
const required=(rows,headers,label)=>{
 if(!Array.isArray(rows)||!Array.isArray(rows[0])||headers.some(x=>!rows[0].includes(x)))throw Error('CB_OUTBOX_'+label+'_SCHEMA');
 return rows;
};
const rowObject=(head,row)=>Object.fromEntries(head.map((k,i)=>[k,str(row[i])]));
export function prepareCbExtensionEvent20({
 obligationRows,scopeRows,certificationBodies,auditId,companyUid,obligationId,
 operationId,command,expected,previous,company,createdAt
}={}){
 if(!['apply','undo'].includes(command)||![auditId,companyUid,obligationId,operationId].every(str))
  throw Error('CB_OUTBOX_EVENT_IDENTITY_INVALID');
 const rows=required(obligationRows,['Obligation_ID','Company_UID','ScopeCode','Certification_Body_ID','Base_Expiry_Date'],'OBLIGATION');
 const head=rows[0],found=rows.slice(1).filter(r=>str(r[head.indexOf('Obligation_ID')])===obligationId);
 if(found.length!==1)throw Error('CB_OUTBOX_OBLIGATION_NOT_UNIQUE');
 const obligation=rowObject(head,found[0]);
 if(obligation.Company_UID!==companyUid)throw Error('CB_OUTBOX_COMPANY_MISMATCH');
 if(!obligation.Certification_Body_ID)throw Error('CB_OUTBOX_CERTIFICATION_BODY_SNAPSHOT_REQUIRED');
 const body=resolveCertificationBody20({scopeCode:obligation.ScopeCode,
  obligationCbId:obligation.Certification_Body_ID,configScopes:scopeRows,certificationBodies,
  requireDelivery:false});
 const expectedState=command==='apply'?'APPLIED':'NOT_APPLIED';
 if(!expected||Boolean(expected.extensionApplied)!==(expectedState==='APPLIED'))throw Error('CB_OUTBOX_EXPECTED_STATE_MISMATCH');
 const created=new Date(createdAt||new Date().toISOString());
 if(!Number.isFinite(created.getTime()))throw Error('CB_OUTBOX_CREATED_AT_INVALID');
 const iso=created.toISOString(),notBefore=new Date(created.getTime()+10*60000).toISOString();
 const eventId='CB_EXT_'+str(operationId);
 const details={company:str(company),baseExpiry:obligation.Base_Expiry_Date,
  effectiveExpiry:str(expected.effectiveExpiry),scopeCode:obligation.ScopeCode,
  certificationBodyId:body.certificationBodyId,
  previousExpiry:str(previous?.effectiveExpiry||obligation.Effective_Expiry_Date||obligation.Base_Expiry_Date),
  previousWindowFrom:str(previous?.windowFrom||obligation.Planning_Window_From),
  previousWindowTo:str(previous?.windowTo||obligation.Planning_Window_To),
  newWindowFrom:str(expected.windowFrom),newWindowTo:str(expected.windowTo),
  changedAt:iso};
 const values=[eventId,str(operationId),str(auditId),str(obligationId),str(companyUid),
  obligation.ScopeCode,body.certificationBodyId,command.toUpperCase(),expectedState,
  iso,notBefore,'BUFFERED','','','',JSON.stringify(details)];
 return{eventId,values,status:'BUFFERED',notificationReady:body.notificationReady,
  certificationBodyId:body.certificationBodyId,scopeCode:obligation.ScopeCode,notBefore};
}
export function reduceCbExtensionOutbox20({outboxRows,obligationId,currentExtensionApplied,now}={}){
 const values=required(outboxRows,CB_EXTENSION_OUTBOX_HEADERS_20,'QUEUE');
 const h=values[0],rows=values.slice(1).map((row,index)=>({...rowObject(h,row),sheetRow:index+2}))
  .filter(r=>r.Obligation_ID===str(obligationId));
 if(!str(obligationId))throw Error('CB_OUTBOX_OBLIGATION_ID_REQUIRED');
 if(rows.length>10000)throw Error('CB_OUTBOX_SOURCE_TRUNCATED');
 if(rows.some(r=>!allowed.has(r.Status)))throw Error('CB_OUTBOX_INVALID_STATUS');
 const byId=new Set();
 for(const r of rows){
  if(byId.has(r.Event_ID))throw Error('CB_OUTBOX_DUPLICATE_EVENT');
  byId.add(r.Event_ID);
  if(r.State_After!=='APPLIED'&&r.State_After!=='NOT_APPLIED')throw Error('CB_OUTBOX_INVALID_STATE');
  if(!Number.isFinite(Date.parse(r.Created_At))||!Number.isFinite(Date.parse(r.Not_Before)))throw Error('CB_OUTBOX_INVALID_DATE');
  if(Date.parse(r.Not_Before)-Date.parse(r.Created_At)<600000)throw Error('CB_OUTBOX_UNDER_MINIMUM_BUFFER');
 }
 const clock=Date.parse(now||new Date().toISOString());
 if(!Number.isFinite(clock))throw Error('CB_OUTBOX_CLOCK_INVALID');
 const ordered=rows.slice().sort((a,b)=>Date.parse(a.Created_At)-Date.parse(b.Created_At)||a.sheetRow-b.sheetRow);
 const lastDelivered=ordered.filter(r=>['SENT','TESTED'].includes(r.Status)&&r.Delivered_At)
  .sort((a,b)=>Date.parse(a.Delivered_At)-Date.parse(b.Delivered_At)).at(-1);
 const deliveredState=lastDelivered?lastDelivered.State_After:'NOT_APPLIED';
 const currentState=currentExtensionApplied?'APPLIED':'NOT_APPLIED';
 const latest=ordered.at(-1);
 if(!latest)return{action:'NONE',reason:'NO_EXT_EVENTS',deliveredState,currentState};
 if(ordered.some(r=>r.Certification_Body_ID!==latest.Certification_Body_ID||r.ScopeCode!==latest.ScopeCode))
  throw Error('CB_OUTBOX_SCOPE_OR_BODY_CHANGED');
 const pending=ordered.filter(r=>['BUFFERED','FAILED','BLOCKED','QUEUED'].includes(r.Status));
 if(!pending.length)return{action:'NONE',reason:'NO_UNPROCESSED_EVENTS',deliveredState,currentState};
 if(currentState===deliveredState)return{action:'SUPPRESS',eventIds:pending.map(r=>r.Event_ID),reason:'NO_NET_STATE_CHANGE',deliveredState,currentState};
 if(latest.Status==='SENT')throw Error('CB_OUTBOX_LATEST_STATE_UNRECORDED');
 const due=Math.max(Date.parse(latest.Created_At)+600000,Date.parse(latest.Not_Before));
 if(clock<due)return{action:'WAIT',eventIds:pending.map(r=>r.Event_ID),dueAt:new Date(due).toISOString(),deliveredState,currentState};
 return{action:'READY',eventId:latest.Event_ID,obsoleteIds:pending.filter(x=>x.Event_ID!==latest.Event_ID).map(x=>x.Event_ID),
  certificationBodyId:latest.Certification_Body_ID,scopeCode:latest.ScopeCode,
  eventType:currentState==='APPLIED'?'CB_EXTENSION_APPLIED':'CB_EXTENSION_UNDONE',deliveredState,currentState};
}
