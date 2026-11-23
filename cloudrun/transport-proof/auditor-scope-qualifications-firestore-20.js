import {createHash} from 'node:crypto';
import {planAuditorQualificationMigration20} from './auditor-scope-qualifications-migration-plan-20.js';
import {previewAuditorQualificationMigration20} from './auditor-scope-qualifications-migration-20.js';

const DEV_PROJECT='audit-management-system-dev';
const COLLECTION='ams_scope20_auditor_qualifications_20_dev';
const EDIT_EVENTS='ams_scope20_qualification_events_20_dev';
const MANIFEST_ID='migration_manifest';
const PAGE_SIZE=250;
const MAX_AUDITORS=1000;
const enc=encodeURIComponent;
const clean=v=>String(v??'').trim();

function validUid(v){
 return typeof v==='string'&&v.length>0&&v.length<=180&&!v.includes('/')&&v!=='.'&&v!=='..'&&v!==MANIFEST_ID;
}
function encodeValue(v){
 if(v===null)return{nullValue:null};
 if(typeof v==='string')return{stringValue:v};
 if(typeof v==='boolean')return{booleanValue:v};
 if(typeof v==='number'&&Number.isSafeInteger(v))return{integerValue:String(v)};
 if(Array.isArray(v))return{arrayValue:{values:v.map(encodeValue)}};
 if(v&&typeof v==='object')return{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encodeValue(x)]))}};
 throw Error('QUALIFICATION_FIRESTORE_VALUE_INVALID');
}
function decodeValue(v){
 if(!v||typeof v!=='object')throw Error('QUALIFICATION_FIRESTORE_VALUE_CORRUPT');
 if('nullValue'in v)return null;
 if('stringValue'in v)return v.stringValue;
 if('booleanValue'in v)return v.booleanValue;
 if('integerValue'in v)return Number(v.integerValue);
 if('doubleValue'in v)return Number(v.doubleValue);
 if('arrayValue'in v)return(v.arrayValue.values||[]).map(decodeValue);
 if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decodeValue(x)]));
 throw Error('QUALIFICATION_FIRESTORE_VALUE_UNSUPPORTED');
}
function documentId(raw){
 return String(raw?.name||'').split('/').pop()||'';
}
function payload(raw){
 const value=decodeValue(raw?.fields?.payload||{});
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('QUALIFICATION_FIRESTORE_DOCUMENT_CORRUPT');
 return value;
}
export function auditorQualificationRecordsDigest20(records){
 const stable=records.map(r=>({auditorUid:r.auditorUid,qualifiedScopeCodes:[...r.qualifiedScopeCodes].sort()}))
  .sort((a,b)=>a.auditorUid.localeCompare(b.auditorUid));
 return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
function validateRecord(record,id,sourceManifest){
 if(!record||record.auditorUid!==id||!validUid(id)||record.sourceManifest!==sourceManifest
  ||!Array.isArray(record.qualifiedScopeCodes)||record.qualifiedScopeCodes.length>20)throw Error('QUALIFICATION_FIRESTORE_RECORD_INVALID');
 const codes=record.qualifiedScopeCodes;
 if(codes.some(x=>typeof x!=='string'||!x.trim()||x!==x.trim()||x.length>100||x.includes('/'))
  ||new Set(codes.map(x=>x.toLowerCase())).size!==codes.length)throw Error('QUALIFICATION_FIRESTORE_SCOPE_LIST_INVALID');
 return{auditorUid:id,qualifiedScopeCodes:[...codes].sort(),sourceManifest};
}
function validateManifest(value){
 if(value?.state!=='READY'||value.schemaVersion!==1||!Number.isSafeInteger(value.auditorCount)
  ||value.auditorCount<1||value.auditorCount>MAX_AUDITORS
  ||!Number.isSafeInteger(value.grantCount)||value.grantCount<0
  ||typeof value.sourceManifest!=='string'||!/^[a-f0-9]{64}$/.test(value.sourceManifest)
  ||typeof value.contentSha256!=='string'||!/^[a-f0-9]{64}$/.test(value.contentSha256))throw Error('QUALIFICATION_FIRESTORE_MANIFEST_INVALID');
 return value;
}
export function assertAuditorQualificationFirestoreRoster20(auditors,snapshot){
 if(!Array.isArray(auditors)||!auditors.length||!Array.isArray(snapshot?.records))throw Error('QUALIFICATION_FIRESTORE_ROSTER_UNAVAILABLE');
 if(auditors.length>=1000)throw Error('QUALIFICATION_FIRESTORE_ROSTER_INCOMPLETE');
 const header=auditors[0]||[],uidColumns=header.map((x,i)=>clean(x).toLowerCase()==='auditor_uid'?i:-1).filter(i=>i>=0);
 if(!uidColumns.length)throw Error('QUALIFICATION_FIRESTORE_ROSTER_UID_SCHEMA_MISSING');
 if(uidColumns.length!==1)throw Error('QUALIFICATION_FIRESTORE_ROSTER_UID_SCHEMA_INVALID');
 const uidColumn=uidColumns[0];
 if(auditors.slice(1).some(row=>!Array.isArray(row)))throw Error('QUALIFICATION_FIRESTORE_ROSTER_INVALID');
 const uids=auditors.slice(1).filter(row=>Array.isArray(row)&&row.some(x=>clean(x)))
  .map(row=>clean(row[uidColumn]));
 const rosterUids=new Set(uids);
 if(!uids.length||uids.some(x=>!x)||rosterUids.size!==uids.length)throw Error('QUALIFICATION_FIRESTORE_ROSTER_UID_INVALID');
 const stored=snapshot.records.map(row=>clean(row.auditorUid));
 if(stored.length!==uids.length||new Set(stored).size!==stored.length
  ||stored.some(uid=>!rosterUids.has(uid)))throw Error('QUALIFICATION_FIRESTORE_ROSTER_DRIFT');
}
function expectedPrepared(prepared){
 const documents=prepared?.proposedDocuments||prepared?.documents;
 if(!prepared||prepared.ok!==true||!Array.isArray(documents)||!prepared.manifest)throw Error('QUALIFICATION_FIRESTORE_PLAN_INVALID');
 const ids=new Set(),records=documents.map(x=>{
  if(!validUid(x?.id)||ids.has(x.id))throw Error('QUALIFICATION_FIRESTORE_PLAN_UID_INVALID');
  ids.add(x.id);
  return validateRecord(x.record,x.id,prepared.manifest.sourceManifest);
 });
 const manifest=validateManifest(prepared.manifest);
 if(manifest.contentSha256!==manifest.sourceManifest||records.length!==manifest.auditorCount
  ||records.reduce((n,r)=>n+r.qualifiedScopeCodes.length,0)!==manifest.grantCount
  ||auditorQualificationRecordsDigest20(records)!==manifest.contentSha256)throw Error('QUALIFICATION_FIRESTORE_PLAN_MANIFEST_MISMATCH');
 return{records,manifest};
}

export function prepareAuditorQualificationFirestoreMigration20({auditors,catalog,relations}={}){
 // The migration routes read complete columns, then enforce bounded source sizes.
 if((Array.isArray(auditors)&&auditors.length>=1000)||(Array.isArray(catalog)&&catalog.length>=200)
  ||(Array.isArray(relations)&&relations.length>=5000))
  return{ok:false,readOnly:true,writesPerformed:false,writeAuthorized:false,error:'QUALIFICATION_FIRESTORE_SOURCE_TRUNCATED'};
 if(Array.isArray(auditors)&&Array.isArray(auditors[0])&&
    auditors[0].filter(x=>clean(x).toLowerCase()==='auditor_uid').length>1)
  return{ok:false,readOnly:true,writesPerformed:false,writeAuthorized:false,error:'AUDITOR_UID_SCHEMA_INVALID'};
 const migrationPlan=planAuditorQualificationMigration20({auditors,catalog,relations});
 if(!migrationPlan.ok)return{ok:false,readOnly:true,writesPerformed:false,writeAuthorized:false,error:migrationPlan.error||'MIGRATION_PARITY_BLOCKED',migrationPlan};
 const preview=previewAuditorQualificationMigration20({auditors,catalog});
 const header=auditors[0]||[],uidColumn=header.findIndex(x=>clean(x).toLowerCase()==='auditor_uid');
 if(uidColumn<0)return{ok:false,readOnly:true,writesPerformed:false,writeAuthorized:false,error:'AUDITOR_UID_SCHEMA_MISSING'};
 const grants=new Map();
 for(const row of preview.rows){
  const list=grants.get(row.Auditor_UID)||[];
  list.push(row.ScopeCode);
  grants.set(row.Auditor_UID,list);
 }
 const records=[];
 for(const row of auditors.slice(1)){
  if(!row.some(x=>clean(x)))continue;
  const auditorUid=clean(row[uidColumn]);
  if(!validUid(auditorUid))return{ok:false,readOnly:true,writesPerformed:false,writeAuthorized:false,error:'AUDITOR_UID_INVALID'};
  records.push({auditorUid,qualifiedScopeCodes:[...(grants.get(auditorUid)||[])].sort()});
 }
 if(!records.length||records.length>MAX_AUDITORS)return{ok:false,readOnly:true,writesPerformed:false,writeAuthorized:false,error:'AUDITOR_COUNT_OUT_OF_BOUNDS'};
 const sourceManifest=auditorQualificationRecordsDigest20(records);
 const documents=records.sort((a,b)=>a.auditorUid.localeCompare(b.auditorUid)).map(record=>({
  id:record.auditorUid,
  record:{...record,sourceManifest}
 }));
 const grantCount=documents.reduce((n,x)=>n+x.record.qualifiedScopeCodes.length,0);
 const manifest={state:'READY',schemaVersion:1,auditorCount:documents.length,grantCount,sourceManifest,contentSha256:sourceManifest};
 return{
  ok:true,readOnly:true,writesPerformed:false,writeAuthorized:false,
  documentCount:documents.length,grantCount,sourceManifest,
  alreadyPresentCount:migrationPlan.alreadyPresentCount||0,
  proposedDocuments:documents,manifest,legacyParity:migrationPlan.parity
 };
}

export function createAuditorScopeQualificationsFirestore20({projectId,getToken,fetchImpl=fetch}={}){
 if(projectId!==DEV_PROJECT||typeof getToken!=='function'||typeof fetchImpl!=='function')throw Error('QUALIFICATION_FIRESTORE_DEV_CONFIGURATION_REQUIRED');
 const documentsBase=`https://firestore.googleapis.com/v1/projects/${enc(projectId)}/databases/(default)/documents`;
 const base=`${documentsBase}/${COLLECTION}`;
 async function request(url,init={}){
  const token=await getToken();
  if(!token)throw Error('QUALIFICATION_FIRESTORE_AUTH_REQUIRED');
  return fetchImpl(url,{...init,headers:{authorization:`Bearer ${token}`,...(init.body?{'content-type':'application/json'}:{})}});
 }
 async function readRaw(id){
  const r=await request(`${base}/${enc(id)}`);
  if(r.status===404)return null;
  if(!r.ok)throw Error(`QUALIFICATION_FIRESTORE_READ_${r.status}`);
  return r.json();
 }
 async function listRaw(){
  const documents=[],tokens=new Set();
  let pageToken='';
  do{
   const url=new URL(base);url.searchParams.set('pageSize',String(PAGE_SIZE));
   if(pageToken)url.searchParams.set('pageToken',pageToken);
   const r=await request(url.toString());
   if(!r.ok)throw Error(`QUALIFICATION_FIRESTORE_LIST_${r.status}`);
   const page=await r.json();
   documents.push(...(page.documents||[]));
   pageToken=page.nextPageToken||'';
   if(pageToken&&(tokens.has(pageToken)||tokens.size>=100))throw Error('QUALIFICATION_FIRESTORE_PAGINATION_INVALID');
   if(pageToken)tokens.add(pageToken);
   if(documents.length>MAX_AUDITORS+1)throw Error('QUALIFICATION_FIRESTORE_DOCUMENT_COUNT_OUT_OF_BOUNDS');
  }while(pageToken);
  return documents;
 }
 function normalizeDocuments(rawDocuments,manifest){
  const byId=new Map();
  for(const raw of rawDocuments){
   const id=documentId(raw);
   if(id===MANIFEST_ID)continue;
   if(byId.has(id))throw Error('QUALIFICATION_FIRESTORE_DUPLICATE_DOCUMENT');
   byId.set(id,validateRecord(payload(raw),id,manifest.sourceManifest));
  }
  const records=[...byId.values()].sort((a,b)=>a.auditorUid.localeCompare(b.auditorUid));
  if(records.length!==manifest.auditorCount
   ||records.reduce((n,r)=>n+r.qualifiedScopeCodes.length,0)!==manifest.grantCount
   ||auditorQualificationRecordsDigest20(records)!==manifest.contentSha256)throw Error('QUALIFICATION_FIRESTORE_SNAPSHOT_INCOMPLETE_OR_CONFLICTED');
  return records;
 }
 async function readSnapshot(){
  const rawManifest=await readRaw(MANIFEST_ID);
  if(!rawManifest)throw Error('QUALIFICATION_FIRESTORE_MANIFEST_NOT_READY');
  const manifest=validateManifest(payload(rawManifest));
  const documents=await listRaw();
  const records=normalizeDocuments(documents,manifest);
  const relations=[['Auditor_UID','ScopeCode','Qualified']];
  for(const record of records)for(const scopeCode of record.qualifiedScopeCodes)
   relations.push([record.auditorUid,scopeCode,'YES']);
  return{manifest,records,relations};
 }
 async function commit(writes){
  if(!writes.length)return;
  const r=await request(`${documentsBase}:commit`,{method:'POST',body:JSON.stringify({writes})});
  if(!r.ok){
   if([409,412].includes(r.status))throw Error('QUALIFICATION_FIRESTORE_WRITE_CONFLICT_RECONCILE');
   throw Error(`QUALIFICATION_FIRESTORE_WRITE_${r.status}`);
  }
  await r.json();
 }
 async function previewSnapshot(prepared){
  const{records,manifest}=expectedPrepared(prepared);
  const raw=await listRaw();
  const manifestRaw=raw.find(x=>documentId(x)===MANIFEST_ID)||null;
  if(manifestRaw){
   const current=await readSnapshot();
   if(current.manifest.sourceManifest!==manifest.sourceManifest||current.manifest.contentSha256!==manifest.contentSha256)throw Error('QUALIFICATION_FIRESTORE_EXISTING_MANIFEST_CONFLICT');
   return{ready:true,alreadyApplied:true,documentCount:current.records.length,grantCount:current.manifest.grantCount,createCount:0,sourceManifest:manifest.sourceManifest};
  }
  const expected=new Map(records.map(r=>[r.auditorUid,r]));
  for(const item of raw){
   const id=documentId(item);
   if(id===MANIFEST_ID)throw Error('QUALIFICATION_FIRESTORE_MANIFEST_RACE_RECONCILE');
   const value=validateRecord(payload(item),id,manifest.sourceManifest);
   const want=expected.get(id);
   if(!want||JSON.stringify(value)!==JSON.stringify(want))throw Error('QUALIFICATION_FIRESTORE_PARTIAL_STATE_CONFLICT');
  }
  return{
   ready:false,alreadyApplied:false,documentCount:raw.length,
   grantCount:raw.reduce((n,item)=>n+payload(item).qualifiedScopeCodes.length,0),
   createCount:records.length-raw.length,sourceManifest:manifest.sourceManifest
  };
 }
 async function applySnapshot(prepared,{verifySource}={}){
  const{records,manifest}=expectedPrepared(prepared);
  const verifyCurrentSource=async()=>{
   if(typeof verifySource!=='function')return;
   const fresh=expectedPrepared(await verifySource());
   if(fresh.manifest.sourceManifest!==manifest.sourceManifest)throw Error('QUALIFICATION_FIRESTORE_SOURCE_CHANGED_RECONCILE');
  };
  await verifyCurrentSource();
  let raw=await listRaw();
  let manifestRaw=raw.find(x=>documentId(x)===MANIFEST_ID)||null;
  if(manifestRaw){
   const current=await readSnapshot();
   if(current.manifest.sourceManifest!==manifest.sourceManifest||current.manifest.contentSha256!==manifest.contentSha256)throw Error('QUALIFICATION_FIRESTORE_EXISTING_MANIFEST_CONFLICT');
   return{ok:true,written:0,verified:true,unchanged:true,documentCount:current.records.length,grantCount:current.manifest.grantCount};
  }
  const expected=new Map(records.map(r=>[r.auditorUid,r]));
  const existing=new Set();
  for(const item of raw){
   const id=documentId(item);
   if(id===MANIFEST_ID)throw Error('QUALIFICATION_FIRESTORE_MANIFEST_RACE_RECONCILE');
   const value=validateRecord(payload(item),id,manifest.sourceManifest);
   const want=expected.get(id);
   if(!want||JSON.stringify(value)!==JSON.stringify(want))throw Error('QUALIFICATION_FIRESTORE_PARTIAL_STATE_CONFLICT');
   existing.add(id);
  }
  const missing=records.filter(r=>!existing.has(r.auditorUid));
  for(let i=0;i<missing.length;i+=500){
   const batch=missing.slice(i,i+500).map(record=>({
    update:{name:`projects/${DEV_PROJECT}/databases/(default)/documents/${COLLECTION}/${record.auditorUid}`,
     fields:{payload:encodeValue(record)}},
    currentDocument:{exists:false}
   }));
   try{await commit(batch);}catch(e){
    if(/WRITE_(?:CONFLICT|UNCERTAIN)|RECONCILE/.test(String(e?.message)))throw e;
    throw Error('QUALIFICATION_FIRESTORE_WRITE_UNCERTAIN_RECONCILE');
   }
  }
  raw=await listRaw();
  const verified=raw.filter(x=>documentId(x)!==MANIFEST_ID);
  const verifiedRecords=verified.map(x=>validateRecord(payload(x),documentId(x),manifest.sourceManifest)).sort((a,b)=>a.auditorUid.localeCompare(b.auditorUid));
  if(verifiedRecords.length!==records.length||auditorQualificationRecordsDigest20(verifiedRecords)!==manifest.contentSha256)throw Error('QUALIFICATION_FIRESTORE_DOCUMENTS_UNCONFIRMED_RECONCILE');
  await verifyCurrentSource();
  try{
   await commit([{
    update:{name:`projects/${DEV_PROJECT}/databases/(default)/documents/${COLLECTION}/${MANIFEST_ID}`,
     fields:{payload:encodeValue(manifest)}},
    currentDocument:{exists:false}
   }]);
  }catch(e){
   if(/WRITE_(?:CONFLICT|UNCERTAIN)|RECONCILE/.test(String(e?.message)))throw e;
   throw Error('QUALIFICATION_FIRESTORE_MANIFEST_UNCONFIRMED_RECONCILE');
  }
  const complete=await readSnapshot();
  if(complete.manifest.sourceManifest!==manifest.sourceManifest)throw Error('QUALIFICATION_FIRESTORE_MIGRATION_UNCONFIRMED_RECONCILE');
  return{ok:true,written:missing.length,verified:true,unchanged:false,documentCount:complete.records.length,grantCount:complete.manifest.grantCount};
 }
 // Internal primitive only: the caller must authorize the manager and validate
 // the auditor and scope against the current canonical roster and catalog.
 async function editQualification({auditorUid,scopeCode,qualified,expectedQualified,expectedContentSha256,actorUid,operationId}={}){
  if(!validUid(auditorUid)||typeof scopeCode!=='string'||!scopeCode.trim()||scopeCode!==scopeCode.trim()
   ||scopeCode.length>100||scopeCode.includes('/')||typeof qualified!=='boolean'||typeof expectedQualified!=='boolean'
   ||typeof expectedContentSha256!=='string'||!/^[a-f0-9]{64}$/.test(expectedContentSha256)
   ||!validUid(actorUid)||typeof operationId!=='string'||!/^qe_[a-f0-9]{64}$/.test(operationId))
   throw Error('QUALIFICATION_FIRESTORE_EDIT_INVALID');
  const rawManifest=await readRaw(MANIFEST_ID);
  if(!rawManifest)throw Error('QUALIFICATION_FIRESTORE_MANIFEST_NOT_READY');
  const manifest=validateManifest(payload(rawManifest));
  if(manifest.contentSha256!==expectedContentSha256)throw Error('QUALIFICATION_FIRESTORE_EDIT_STALE');
  const raw=await listRaw(),records=normalizeDocuments(raw,manifest);
  const current=records.find(r=>r.auditorUid===auditorUid),document=raw.find(x=>documentId(x)===auditorUid);
  if(!current||!document)throw Error('QUALIFICATION_FIRESTORE_AUDITOR_NOT_FOUND');
  if(current.qualifiedScopeCodes.some(code=>code.toLowerCase()===scopeCode.toLowerCase()&&code!==scopeCode))
   throw Error('QUALIFICATION_FIRESTORE_SCOPE_CODE_CASE_MISMATCH');
  const hasScope=current.qualifiedScopeCodes.includes(scopeCode);
  if(hasScope!==expectedQualified)throw Error('QUALIFICATION_FIRESTORE_EDIT_STALE');
  if(hasScope===qualified)return{ok:true,changed:false,contentSha256:manifest.contentSha256};
  if(!rawManifest.updateTime||!document.updateTime)throw Error('QUALIFICATION_FIRESTORE_EDIT_VERSION_MISSING');
  const updated={...current,qualifiedScopeCodes:qualified?[...current.qualifiedScopeCodes,scopeCode].sort():current.qualifiedScopeCodes.filter(x=>x!==scopeCode)};
  validateRecord(updated,auditorUid,manifest.sourceManifest);
  const updatedRecords=records.map(r=>r.auditorUid===auditorUid?updated:r);
  const nextManifest={...manifest,grantCount:manifest.grantCount+(qualified?1:-1),contentSha256:auditorQualificationRecordsDigest20(updatedRecords)};
  const path=`projects/${DEV_PROJECT}/databases/(default)/documents/${COLLECTION}`;
  const event={operationId,auditorUid,actorUid,scopeCode,previousQualified:hasScope,qualified,
   previousContentSha256:manifest.contentSha256,contentSha256:nextManifest.contentSha256,
   state:'PENDING',createdAt:new Date().toISOString()};
  try{
   await commit([
    {update:{name:`${path}/${auditorUid}`,fields:{payload:encodeValue(updated)}},currentDocument:{updateTime:document.updateTime}},
    {update:{name:`${path}/${MANIFEST_ID}`,fields:{payload:encodeValue(nextManifest)}},currentDocument:{updateTime:rawManifest.updateTime}},
    {update:{name:`projects/${DEV_PROJECT}/databases/(default)/documents/${EDIT_EVENTS}/${operationId}`,fields:{payload:encodeValue(event)}},currentDocument:{exists:false}}
   ]);
  }catch(e){
   if(/WRITE_CONFLICT/.test(String(e?.message)))throw e;
   throw Error('QUALIFICATION_FIRESTORE_EDIT_UNCERTAIN_RECONCILE');
  }
  let verified;
  try{verified=await readSnapshot();}catch{throw Error('QUALIFICATION_FIRESTORE_EDIT_UNCONFIRMED_RECONCILE');}
  if(verified.manifest.contentSha256!==nextManifest.contentSha256)
   throw Error('QUALIFICATION_FIRESTORE_EDIT_UNCONFIRMED_RECONCILE');
  return{ok:true,changed:true,contentSha256:nextManifest.contentSha256};
 }
 function validateEditEvent(raw,operationId){
  const event=payload(raw);
  if(raw?.name!==`projects/${DEV_PROJECT}/databases/(default)/documents/${EDIT_EVENTS}/${operationId}`
   ||event.operationId!==operationId||!validUid(event.auditorUid)||!validUid(event.actorUid)
   ||typeof event.scopeCode!=='string'||!event.scopeCode||event.scopeCode!==event.scopeCode.trim()
   ||event.scopeCode.length>100||event.scopeCode.includes('/')
   ||typeof event.previousQualified!=='boolean'||typeof event.qualified!=='boolean'
   ||event.previousQualified===event.qualified||!['PENDING','PROJECTED'].includes(event.state)
   ||typeof event.previousContentSha256!=='string'||!/^[a-f0-9]{64}$/.test(event.previousContentSha256)
   ||typeof event.contentSha256!=='string'||!/^[a-f0-9]{64}$/.test(event.contentSha256)
   ||typeof event.createdAt!=='string'||!Number.isFinite(Date.parse(event.createdAt))
   ||event.state==='PROJECTED'&&(typeof event.projectedContentSha256!=='string'||!/^[a-f0-9]{64}$/.test(event.projectedContentSha256)
    ||typeof event.projectedAt!=='string'||!Number.isFinite(Date.parse(event.projectedAt))))
   throw Error('QUALIFICATION_FIRESTORE_EVENT_INVALID');
  return{event,updateTime:raw.updateTime};
 }
 async function readEditEventRaw(operationId){
  if(typeof operationId!=='string'||!/^qe_[a-f0-9]{64}$/.test(operationId))throw Error('QUALIFICATION_FIRESTORE_EDIT_INVALID');
  const response=await request(`${documentsBase}/${EDIT_EVENTS}/${operationId}`);
  if(response.status===404)return null;
  if(!response.ok)throw Error(`QUALIFICATION_FIRESTORE_EVENT_READ_${response.status}`);
  return validateEditEvent(await response.json(),operationId);
 }
 async function readEditEvent(operationId){
  return(await readEditEventRaw(operationId))?.event??null;
 }
 async function listEditEvents({pageSize=100,pageToken=''}={}){
  if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>200||typeof pageToken!=='string')
   throw Error('QUALIFICATION_FIRESTORE_EVENT_SCAN_INVALID');
  const url=new URL(`${documentsBase}/${EDIT_EVENTS}`);
  url.searchParams.set('pageSize',String(pageSize));
  if(pageToken)url.searchParams.set('pageToken',pageToken);
  const response=await request(url.toString());
  if(!response.ok)throw Error(`QUALIFICATION_FIRESTORE_EVENT_SCAN_${response.status}`);
  const page=await response.json();
  if(!Array.isArray(page.documents??[])||(page.nextPageToken!==undefined&&typeof page.nextPageToken!=='string'))
   throw Error('QUALIFICATION_FIRESTORE_EVENT_SCAN_CORRUPT');
  const events=(page.documents||[]).map(raw=>{
   const operationId=documentId(raw);
   if(!/^qe_[a-f0-9]{64}$/.test(operationId))throw Error('QUALIFICATION_FIRESTORE_EVENT_INVALID');
   return validateEditEvent(raw,operationId).event;
  });
  if(events.length>pageSize||new Set(events.map(x=>x.operationId)).size!==events.length)
   throw Error('QUALIFICATION_FIRESTORE_EVENT_SCAN_CORRUPT');
  return{events,nextPageToken:page.nextPageToken||null};
 }
 // Only a trusted worker that verified the complete Sheets projection may call this.
 async function acknowledgeEditEvent({operationId,projectedContentSha256}={}){
  if(typeof projectedContentSha256!=='string'||!/^[a-f0-9]{64}$/.test(projectedContentSha256))
   throw Error('QUALIFICATION_FIRESTORE_EVENT_ACK_INVALID');
  const rawEvent=await readEditEventRaw(operationId);
  if(!rawEvent)throw Error('QUALIFICATION_FIRESTORE_EVENT_NOT_FOUND');
  if(rawEvent.event.state==='PROJECTED'){
   if(rawEvent.event.projectedContentSha256!==projectedContentSha256)
    throw Error('QUALIFICATION_FIRESTORE_EVENT_ACK_PROOF_CONFLICT');
   return{acknowledged:true,unchanged:true};
  }
  const rawManifest=await readRaw(MANIFEST_ID);
  if(!rawManifest)throw Error('QUALIFICATION_FIRESTORE_MANIFEST_NOT_READY');
  const manifest=validateManifest(payload(rawManifest));
  if(manifest.contentSha256!==projectedContentSha256)throw Error('QUALIFICATION_FIRESTORE_EVENT_ACK_STALE');
  if(!rawEvent.updateTime||!rawManifest.updateTime)throw Error('QUALIFICATION_FIRESTORE_EVENT_ACK_VERSION_MISSING');
  const event={...rawEvent.event,state:'PROJECTED',projectedContentSha256,projectedAt:new Date().toISOString()};
  try{
   await commit([
    {update:{name:`projects/${DEV_PROJECT}/databases/(default)/documents/${COLLECTION}/${MANIFEST_ID}`,fields:{payload:encodeValue(manifest)}},currentDocument:{updateTime:rawManifest.updateTime}},
    {update:{name:`projects/${DEV_PROJECT}/databases/(default)/documents/${EDIT_EVENTS}/${operationId}`,fields:{payload:encodeValue(event)}},currentDocument:{updateTime:rawEvent.updateTime}}
   ]);
  }catch(e){
   if(/WRITE_CONFLICT/.test(String(e?.message)))throw e;
   throw Error('QUALIFICATION_FIRESTORE_EVENT_ACK_UNCERTAIN_RECONCILE');
  }
  let verified;
  try{verified=await readEditEvent(operationId);}catch{throw Error('QUALIFICATION_FIRESTORE_EVENT_ACK_UNCONFIRMED_RECONCILE');}
  if(verified?.state!=='PROJECTED'||verified.projectedContentSha256!==projectedContentSha256)
   throw Error('QUALIFICATION_FIRESTORE_EVENT_ACK_UNCONFIRMED_RECONCILE');
  return{acknowledged:true,unchanged:false};
 }
 return Object.freeze({readSnapshot,previewSnapshot,applySnapshot,editQualification,readEditEvent,listEditEvents,acknowledgeEditEvent});
}
