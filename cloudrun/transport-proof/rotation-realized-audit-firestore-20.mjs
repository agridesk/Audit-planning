import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {scopeSlotsFromConfig20}=require('./rotation-config-scope-slots-20.cjs');
const {strictAmsCompletedHistory20}=require('./rotation-ams-strict-source-20.cjs');
const COLLECTION='ams_rotation_realized_audits_20_dev';
const LIVE_COLLECTION='ams_rotation_realized_audit_events_20_dev';
const MIGRATIONS='ams_rotation_realized_audit_migrations_20_dev';
const clean=v=>String(v??'').trim();
const normalize=v=>clean(v).toLowerCase().replace(/[\s_-]+/g,'');
const hash=v=>createHash('sha256').update(v).digest('hex');
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const stable=v=>JSON.stringify(v&&typeof v==='object'?(Array.isArray(v)?v:v&&Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]]))):v);
const validRecord=record=>record&&typeof record==='object'&&!Array.isArray(record)&&
 Object.keys(record).sort().join(',')==='auditId,auditorUid,company,companyUid,completedAt,scopeSlots,status,year'&&
 typeof record.auditId==='string'&&record.auditId.length>0&&record.auditId.length<=180&&record.auditId===clean(record.auditId)&&
 typeof record.auditorUid==='string'&&record.auditorUid.length>0&&record.auditorUid.length<=180&&record.auditorUid===clean(record.auditorUid)&&!record.auditorUid.includes('@')&&
 typeof record.companyUid==='string'&&record.companyUid.length>0&&record.companyUid.length<=180&&record.companyUid===clean(record.companyUid)&&
 typeof record.company==='string'&&record.company.length>0&&record.company.length<=200&&record.company===clean(record.company)&&record.status==='Completed'&&
 validDate(record.completedAt)&&
 Number.isSafeInteger(record.year)&&record.year>=2000&&record.year<=new Date().getUTCFullYear()&&record.year===Number(record.completedAt.slice(0,4))&&
 Array.isArray(record.scopeSlots)&&record.scopeSlots.length>0&&new Set(record.scopeSlots).size===record.scopeSlots.length&&record.scopeSlots.every(slot=>/^SCOPE_(?:0[1-9]|1[0-9]|20)$/.test(slot));
export const isValidRotationRealizedAudit20=record=>validRecord(record);
export const rotationRealizedAuditDocumentId20=auditId=>hash(auditId);
const encode=v=>{
 if(v===null)return {nullValue:null};
 if(typeof v==='string')return {stringValue:v};
 if(typeof v==='boolean')return {booleanValue:v};
 if(typeof v==='number'&&Number.isSafeInteger(v))return {integerValue:String(v)};
 if(typeof v==='number'&&Number.isFinite(v))return {doubleValue:v};
 if(Array.isArray(v))return {arrayValue:{values:v.map(encode)}};
 if(v&&typeof v==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};
 throw Error('ROTATION_FIRESTORE_VALUE_INVALID');
};
const decode=v=>{
 if('nullValue'in v)return null;
 if('stringValue'in v)return v.stringValue;
 if('booleanValue'in v)return v.booleanValue;
 if('integerValue'in v)return Number(v.integerValue);
 if('doubleValue'in v)return Number(v.doubleValue);
 if('arrayValue'in v)return (v.arrayValue.values||[]).map(decode);
 if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));
 throw Error('ROTATION_FIRESTORE_VALUE_CORRUPT');
};
function sourceIndex(headers,...names){
 const normalized=headers.map(normalize);
 const found=names.map(normalize).map(n=>normalized.flatMap((x,i)=>x===n?[i]:[])).filter(x=>x.length);
 if(found.some(x=>x.length!==1))throw Error('ROTATION_HISTORY_HEADER_DUPLICATE');
 return found.length?found[0][0]:-1;
}
export function prepareRotationRealizedAuditMigration20({scopeRows,completedRows}={}){
 if(!Array.isArray(scopeRows)||scopeRows.length>100||!Array.isArray(completedRows)||!completedRows.length||completedRows.length>10001)throw Error('ROTATION_HISTORY_SOURCE_INVALID');
 const slots=scopeSlotsFromConfig20(scopeRows);
 const byCode=new Map(Object.entries(slots).map(([slot,code])=>[code,slot]));
 const headers=completedRows[0]||[];
 const companyIndex=sourceIndex(headers,'Company');
 const companyUidIndex=sourceIndex(headers,'Company_UID','Company UID');
 const auditIdIndex=sourceIndex(headers,'Audit ID','Audit_ID');
 const dateIndex=sourceIndex(headers,'Date completed','Completed date');
 const statusIndex=sourceIndex(headers,'Status');
 if([companyIndex,companyUidIndex,auditIdIndex,dateIndex,statusIndex].some(i=>i<0))throw Error('ROTATION_HISTORY_SOURCE_HEADERS_MISSING');
 const sourceRowsById=new Map();
 for(const row of completedRows.slice(1)){
  if(String(row[statusIndex]||'').trim().toLowerCase()!=='completed')continue;
  const auditId=clean(row[auditIdIndex]);
  if(auditId)sourceRowsById.set(auditId,row);
 }
 const events=strictAmsCompletedHistory20(completedRows,{scopeByColumn:slots});
 const records=new Map();
 for(const event of events){
  const row=sourceRowsById.get(event.auditId);
  if(!row)throw Error('ROTATION_HISTORY_SOURCE_ROW_MISSING');
  const completedAt=clean(row[dateIndex]);
  if(!validDate(completedAt))throw Error('ROTATION_HISTORY_DATE_INVALID');
  const year=Number(completedAt.slice(0,4));
  if(year<2000||year>new Date().getUTCFullYear())throw Error('ROTATION_HISTORY_DATE_INVALID');
  const scopeSlot=byCode.get(event.scopeKey);
  if(!scopeSlot)throw Error('ROTATION_HISTORY_SCOPE_UNMAPPED');
  const next={auditId:event.auditId,company:clean(row[companyIndex]),companyUid:clean(row[companyUidIndex]),auditorUid:event.auditorUid,status:'Completed',completedAt,year,scopeSlots:[]};
  if(!next.company||!next.companyUid||!next.auditorUid)throw Error('ROTATION_HISTORY_IDENTITY_INCOMPLETE');
  const prior=records.get(event.auditId);
  if(prior&&(prior.companyUid!==next.companyUid||prior.auditorUid!==next.auditorUid||prior.completedAt!==next.completedAt))throw Error('ROTATION_HISTORY_AUDIT_CONFLICT');
  if(!prior)records.set(event.auditId,next);
  const record=records.get(event.auditId);
  if(record.scopeSlots.includes(scopeSlot))throw Error('ROTATION_HISTORY_SCOPE_DUPLICATE');
  record.scopeSlots.push(scopeSlot);
 }
 const ordered=[...records.values()].map(record=>({...record,scopeSlots:record.scopeSlots.sort()})).sort((a,b)=>a.auditId.localeCompare(b.auditId));
 if(!ordered.length)throw Error('ROTATION_HISTORY_COMPLETED_ROWS_EMPTY');
 const sourceManifest=hash(JSON.stringify([scopeRows,completedRows]));
 return {sourceManifest,recordManifest:hash(stable(ordered)),records:ordered,stats:{completedAudits:ordered.length,scopeEvents:events.length}};
}
export function rotationRealizedAuditRows20(records,scopeRows){
 if(!Array.isArray(records)||!Array.isArray(scopeRows))throw Error('ROTATION_HISTORY_READMODEL_INPUT_INVALID');
 const slots=scopeSlotsFromConfig20(scopeRows);
 const scopeHeaders=Object.keys(slots).sort((a,b)=>Number(a.slice(6))-Number(b.slice(6)));
 const headers=['Company','Company_UID','Auditor_UID','Status','Year','Date completed',...scopeHeaders];
 return [headers,...records.map(record=>{
  if(!record||!Array.isArray(record.scopeSlots))throw Error('ROTATION_HISTORY_DOCUMENT_INVALID');
  return [clean(record.company),clean(record.companyUid),clean(record.auditorUid),clean(record.status),record.year,clean(record.completedAt),...scopeHeaders.map(slot=>record.scopeSlots.includes(slot)?'X':'')];
 })];
}
export function createRotationRealizedAuditFirestoreStore20({projectId,getToken,fetchImpl=fetch}={}){
 if(!/^[a-z][a-z0-9-]{4,62}$/.test(projectId||'')||typeof getToken!=='function'||typeof fetchImpl!=='function')throw Error('ROTATION_FIRESTORE_CONFIG_INVALID');
 const root='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(projectId)+'/databases/(default)/documents';
 const collection=root+'/'+COLLECTION,migration=root+'/'+MIGRATIONS+'/active';
 const resource=(name,id)=>'projects/'+name+'/databases/(default)/documents/'+id;
 const docId=rotationRealizedAuditDocumentId20;
 async function request(url,method='GET',body){
  const token=await getToken();if(!token)throw Error('ROTATION_FIRESTORE_TOKEN_REQUIRED');
  const response=await fetchImpl(url,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return response;
 }
 function decodeDocument(raw){
  if(!raw?.updateTime||!raw.fields?.payload)throw Error('ROTATION_FIRESTORE_DOCUMENT_CORRUPT');
  const value=decode(raw.fields.payload);
  if(!value||typeof value!=='object'||!value.auditId||docId(value.auditId)!==String(raw.name||'').split('/').pop())throw Error('ROTATION_FIRESTORE_DOCUMENT_INVALID');
  return value;
 }
 async function getMigration(){
  const response=await request(migration);
  if(response.status===404)return null;
  if(!response.ok)throw Error('ROTATION_FIRESTORE_MIGRATION_READ_'+response.status);
  const raw=await response.json();
  if(!raw?.updateTime||!raw.fields?.payload)throw Error('ROTATION_FIRESTORE_MIGRATION_CORRUPT');
  const value=decode(raw.fields.payload);
  if(!value||value.auditId!=='active'||value.schemaVersion!==1||!Number.isSafeInteger(value.recordCount)||!/^[0-9a-f]{64}$/.test(value.sourceManifest||'')||!/^[0-9a-f]{64}$/.test(value.recordManifest||''))throw Error('ROTATION_FIRESTORE_MIGRATION_CORRUPT');
  return value;
 }
 async function listCollectionRecords(name){
  const records=[];let pageToken='',pages=0;
  do{
   if(++pages>50)throw Error('ROTATION_FIRESTORE_SCAN_LIMIT');
   const url=new URL(root+'/'+name);url.searchParams.set('pageSize','200');if(pageToken)url.searchParams.set('pageToken',pageToken);
   const response=await request(url.toString());
   if(!response.ok)throw Error('ROTATION_FIRESTORE_LIST_'+response.status);
   const page=await response.json();
   for(const raw of page.documents||[])records.push(decodeDocument(raw));
   if(records.length>10000)throw Error('ROTATION_FIRESTORE_SCAN_LIMIT');
   pageToken=page.nextPageToken||'';
  }while(pageToken);
  return records;
 }
 const listRecords=()=>listCollectionRecords(COLLECTION);
 const listLiveRecords=()=>listCollectionRecords(LIVE_COLLECTION);
 async function preview({records,sourceManifest}={}){
  if(!Array.isArray(records)||!records.length||records.length>10000||records.some(record=>!validRecord(record))||! /^[0-9a-f]{64}$/.test(sourceManifest||''))throw Error('ROTATION_FIRESTORE_PLAN_INVALID');
  const recordManifest=hash(stable([...records].sort((a,b)=>a.auditId.localeCompare(b.auditId))));
  const [existing,migrationRecord]=await Promise.all([listRecords(),getMigration()]);
  if(migrationRecord&&(migrationRecord.sourceManifest!==sourceManifest||migrationRecord.recordManifest!==recordManifest||migrationRecord.recordCount!==records.length))throw Error('ROTATION_FIRESTORE_SOURCE_CHANGED');
  const expected=new Map(records.map(record=>[docId(record.auditId),record]));
  if(expected.size!==records.length)throw Error('ROTATION_FIRESTORE_AUDIT_DUPLICATE');
  let createCount=0,replayCount=0,conflictCount=0,unexpectedCount=0;
  for(const record of existing){
   const id=docId(record.auditId),wanted=expected.get(id);
   if(!wanted){unexpectedCount++;continue;}
   if(stable(record)!==stable(wanted))conflictCount++;
   else replayCount++;
   expected.delete(id);
  }
  createCount=expected.size;
  return {sourceManifest,recordManifest,expectedCount:records.length,existingCount:existing.length,createCount,replayCount,conflictCount,unexpectedCount,ready:conflictCount===0&&unexpectedCount===0};
 }
 async function apply({records,sourceManifest,confirm}={}){
  if(confirm!==true)throw Error('ROTATION_FIRESTORE_CONFIRM_REQUIRED');
  const plan=await preview({records,sourceManifest});
  if(!plan.ready)throw Error('ROTATION_FIRESTORE_PARITY_REQUIRED');
  const existing=new Set((await listRecords()).map(record=>docId(record.auditId)));
  const pending=records.filter(record=>!existing.has(docId(record.auditId)));
  for(let offset=0;offset<pending.length;offset+=400){
   const writes=pending.slice(offset,offset+400).map(record=>({update:{name:resource(projectId,COLLECTION+'/'+docId(record.auditId)),fields:{payload:encode(record)}},currentDocument:{exists:false}}));
   const response=await request(root+':commit','POST',{writes});
   if([409,412].includes(response.status))throw Error('ROTATION_FIRESTORE_CREATE_CONFLICT');
   if(!response.ok)throw Error('ROTATION_FIRESTORE_COMMIT_'+response.status);
  }
  const verified=await listRecords(),byId=new Map(verified.map(record=>[docId(record.auditId),record]));
  if(verified.length!==records.length||records.some(record=>stable(byId.get(docId(record.auditId)))!==stable(record)))throw Error('ROTATION_FIRESTORE_VERIFY_FAILED');
  const migrationRecord={auditId:'active',schemaVersion:1,sourceManifest,recordManifest:plan.recordManifest,recordCount:records.length};
  const current=await getMigration();
  if(current&&(current.recordCount!==migrationRecord.recordCount||current.recordManifest!==migrationRecord.recordManifest))throw Error('ROTATION_FIRESTORE_SOURCE_CHANGED');
  if(!current){
   const response=await request(root+':commit','POST',{writes:[{update:{name:resource(projectId,MIGRATIONS+'/active'),fields:{payload:encode(migrationRecord)}},currentDocument:{exists:false}}]});
   if(!response.ok)throw Error('ROTATION_FIRESTORE_MARKER_'+response.status);
  }
  return {applied:true,sourceManifest,recordCount:records.length,created:plan.createCount,replayed:plan.replayCount};
 }
 async function read(){
  const marker=await getMigration();
  if(!marker)throw Error('ROTATION_FIRESTORE_MIGRATION_NOT_READY');
  const [records,liveRecords]=await Promise.all([listRecords(),listLiveRecords()]);
  if(records.length!==marker.recordCount)throw Error('ROTATION_FIRESTORE_MIGRATION_PARITY_FAILED');
  if(records.some(record=>!validRecord(record)))throw Error('ROTATION_FIRESTORE_RECORD_INVALID');
  const ordered=records.sort((a,b)=>a.auditId.localeCompare(b.auditId));
  if(hash(stable(ordered))!==marker.recordManifest)throw Error('ROTATION_FIRESTORE_MIGRATION_PARITY_FAILED');
  const byAuditId=new Map(ordered.map(record=>[record.auditId,record]));
  for(const record of liveRecords){
   if(!validRecord(record))throw Error('ROTATION_FIRESTORE_RECORD_INVALID');
   const prior=byAuditId.get(record.auditId);
   if(prior&&stable(prior)!==stable(record))throw Error('ROTATION_FIRESTORE_LIVE_CONFLICT');
   byAuditId.set(record.auditId,record);
  }
  return [...byAuditId.values()].sort((a,b)=>a.auditId.localeCompare(b.auditId));
 }
 return Object.freeze({preview,apply,read});
}
