// Plans only: applying the cells requires a fenced, verified projection worker.
import {assertAuditorQualificationFirestoreRoster20,auditorQualificationRecordsDigest20} from './auditor-scope-qualifications-firestore-20.js';
import {previewAuditorQualificationMigration20} from './auditor-scope-qualifications-migration-20.js';
import {resolveAuditorScopeQualifications20} from './auditor-scope-qualifications-20.js';

const clean=v=>String(v??'').trim();
const key=v=>clean(v).toLowerCase();
const yes=v=>['x','yes','true','1'].includes(key(v));
const value=(row,i)=>row[i]??'';
const duplicateHeader=header=>header.some((h,i)=>key(h)&&header.findIndex(x=>key(x)===key(h))!==i);
function index(header,name){
 const matches=header.map((x,i)=>key(x)===key(name)?i:-1).filter(i=>i>=0);
 if(matches.length!==1)throw Error('QUALIFICATION_PROJECTION_SCHEMA_INVALID');
 return matches[0];
}

export function planAuditorQualificationSheetsProjection20({snapshot,auditors,catalog,relations}={}){
 assertAuditorQualificationFirestoreRoster20(auditors,snapshot);
 if(!Array.isArray(catalog)||!catalog.length||catalog.length>=200||
    !Array.isArray(relations)||!relations.length||relations.length>=5000)
  throw Error('QUALIFICATION_PROJECTION_SOURCE_INCOMPLETE');
 const legacy=previewAuditorQualificationMigration20({auditors,catalog});
 if(!legacy.ok)throw Error('QUALIFICATION_PROJECTION_LEGACY_SCHEMA_INVALID');
 const ah=auditors[0],ch=catalog[0],rh=relations[0];
 if(!Array.isArray(ah)||!Array.isArray(ch)||duplicateHeader(ah)||duplicateHeader(ch))
  throw Error('QUALIFICATION_PROJECTION_SCHEMA_INVALID');
 if(!Array.isArray(rh)||rh.some((h,i)=>!key(h)||rh.findIndex(x=>key(x)===key(h))!==i))
  throw Error('QUALIFICATION_PROJECTION_RELATION_SCHEMA_INVALID');
 const au=index(ah,'Auditor_UID'),cc=index(ch,'ScopeCode'),cs=index(ch,'SlotKey'),cn=index(ch,'DisplayName');
 const ru=index(rh,'Auditor_UID'),rc=index(rh,'ScopeCode'),rq=index(rh,'Qualified');
 const codes=new Map(),columns=new Map();
 for(const row of catalog.slice(1)){
  const code=clean(row[cc]),matches=[code,clean(row[cs]),clean(row[cn])]
   .map(alias=>ah.findIndex(h=>key(h)===key(alias))).filter(i=>i>=0);
  if(!code||codes.has(key(code))||new Set(matches).size>1)throw Error('QUALIFICATION_PROJECTION_CATALOG_INVALID');
  codes.set(key(code),code);
  if(matches.length)columns.set(code,matches[0]);
 }
 const desired=new Map(),canonicalRelations=[['Auditor_UID','ScopeCode','Qualified']];
 for(const record of snapshot.records){
  if(!Array.isArray(record.qualifiedScopeCodes))throw Error('QUALIFICATION_PROJECTION_SNAPSHOT_INVALID');
  const grants=new Set();
  for(const scope of record.qualifiedScopeCodes){
   const canonical=codes.get(key(scope));
   if(!canonical||canonical!==scope||grants.has(canonical))throw Error('QUALIFICATION_PROJECTION_SNAPSHOT_INVALID');
   grants.add(canonical);canonicalRelations.push([record.auditorUid,canonical,'YES']);
  }
  desired.set(record.auditorUid,grants);
 }
 if(snapshot.manifest?.state!=='READY'||snapshot.manifest.schemaVersion!==1
  ||typeof snapshot.manifest.sourceManifest!=='string'||!/^[a-f0-9]{64}$/.test(snapshot.manifest.sourceManifest)
  ||snapshot.manifest.auditorCount!==snapshot.records.length
  ||snapshot.manifest.grantCount!==canonicalRelations.length-1
  ||snapshot.manifest.contentSha256!==auditorQualificationRecordsDigest20(snapshot.records)
  ||snapshot.records.some(r=>r.sourceManifest!==snapshot.manifest.sourceManifest))
  throw Error('QUALIFICATION_PROJECTION_SNAPSHOT_INVALID');
 resolveAuditorScopeQualifications20({auditors,catalog,relations:canonicalRelations,auditorUid:snapshot.records[0].auditorUid});

 const updates=[],seen=new Set();
 for(let i=1;i<auditors.length;i++){
  const row=auditors[i]||[];
  if(!row.some(x=>clean(x)))continue;
  const uid=clean(row[au]),grants=desired.get(uid);
  if(!grants)throw Error('QUALIFICATION_PROJECTION_ROSTER_DRIFT');
  for(const [code,column] of columns){
   const before=value(row,column),wanted=grants.has(code);
   if(yes(before)!==wanted)updates.push({sheet:'Auditors',row:i+1,column:column+1,expected:before,value:wanted?'x':'',auditorUid:uid,scopeCode:code});
  }
 }
 for(let i=1;i<relations.length;i++){
  const row=relations[i]||[];
  if(!row.some(x=>clean(x)))continue;
  const uid=clean(row[ru]),code=codes.get(key(row[rc])),state=key(row[rq]);
  if(!desired.has(uid)||!code||!['x','yes','true','1','no','false','0',''].includes(state))
   throw Error('QUALIFICATION_PROJECTION_RELATION_INVALID');
  const pair=JSON.stringify([uid,code]);
  if(seen.has(pair))throw Error('QUALIFICATION_PROJECTION_RELATION_DUPLICATE');
  seen.add(pair);
  const wanted=desired.get(uid).has(code),before=value(row,rq);
  if(yes(before)!==wanted)updates.push({sheet:'Auditor_Scope_Qualifications',row:i+1,column:rq+1,expected:before,value:wanted?'YES':'NO',auditorUid:uid,scopeCode:code});
 }
 let nextRow=relations.length+1;
 for(const [uid,grants] of desired)for(const code of grants){
  if(seen.has(JSON.stringify([uid,code])))continue;
  if(nextRow>=5000)throw Error('QUALIFICATION_PROJECTION_ROW_LIMIT');
  for(const [column,v] of [[ru,uid],[rc,code],[rq,'YES']])
   updates.push({sheet:'Auditor_Scope_Qualifications',row:nextRow,column:column+1,expected:'',value:v,auditorUid:uid,scopeCode:code});
  nextRow++;
 }
 return{readOnly:true,writesPerformed:false,updates,unrepresentedScopes:legacy.unrepresentedScopes,sourceContentSha256:snapshot.manifest?.contentSha256||''};
}

// The injected fence must exclude qualification edits and every Sheet writer, including manual edits.
// The lock must remain held on errors containing RECONCILE.
export function createAuditorQualificationSheetsProjector20({withLock,assertFrozen,readInputs,writeCells,eventStore}={}){
 if([withLock,assertFrozen,readInputs,writeCells,eventStore?.listEditEvents,eventStore?.acknowledgeEditEvent].some(fn=>typeof fn!=='function'))
  throw Error('QUALIFICATION_PROJECTOR_CONFIGURATION_INVALID');
 async function pendingEvents(){
  const pending=[],tokens=new Set(),ids=new Set();
  let token='',pages=0;
  do{
   if(++pages>100)throw Error('QUALIFICATION_PROJECTOR_EVENT_SCAN_LIMIT');
   const page=await eventStore.listEditEvents({pageSize:200,pageToken:token});
   if(!Array.isArray(page?.events)||page.events.length>200||
      (page.nextPageToken!=null&&typeof page.nextPageToken!=='string'))
    throw Error('QUALIFICATION_PROJECTOR_EVENT_SCAN_INVALID');
   for(const event of page.events){
    if(!/^qe_[a-f0-9]{64}$/.test(event?.operationId||'')||ids.has(event.operationId)||!['PENDING','PROJECTED'].includes(event.state))
     throw Error('QUALIFICATION_PROJECTOR_EVENT_SCAN_INVALID');
    ids.add(event.operationId);
    if(event.state==='PENDING')pending.push(event.operationId);
   }
   token=page.nextPageToken||'';
   if(token&&tokens.has(token))throw Error('QUALIFICATION_PROJECTOR_EVENT_SCAN_INVALID');
   if(token)tokens.add(token);
  }while(token);
  return pending;
 }
 return Object.freeze({reconcile:()=>withLock(async()=>{
  await assertFrozen();
  const first=planAuditorQualificationSheetsProjection20(await readInputs());
  await assertFrozen();
  const before=planAuditorQualificationSheetsProjection20(await readInputs());
  if(first.sourceContentSha256!==before.sourceContentSha256||
     JSON.stringify(first.updates)!==JSON.stringify(before.updates))
   throw Error('QUALIFICATION_PROJECTOR_SOURCE_CHANGED_RECONCILE');
  if(before.updates.length){
   await assertFrozen();
   // The adapter must use RAW writes and recheck each UID, scope and preimage.
   try{await writeCells(before.updates,{sourceContentSha256:before.sourceContentSha256});}
   catch{throw Error('QUALIFICATION_PROJECTOR_WRITE_UNCERTAIN_RECONCILE');}
  }
  try{
   await assertFrozen();
   const after=planAuditorQualificationSheetsProjection20(await readInputs());
   if(after.sourceContentSha256!==before.sourceContentSha256||after.updates.length)
    throw Error('QUALIFICATION_PROJECTOR_VERIFY_FAILED');
   const pending=await pendingEvents();
   for(const operationId of pending){
    await assertFrozen();
    const result=await eventStore.acknowledgeEditEvent({operationId,projectedContentSha256:before.sourceContentSha256});
    if(result?.acknowledged!==true)throw Error('QUALIFICATION_PROJECTOR_EVENT_ACK_FAILED');
   }
   await assertFrozen();
   const final=planAuditorQualificationSheetsProjection20(await readInputs());
   if(final.sourceContentSha256!==before.sourceContentSha256||final.updates.length||(await pendingEvents()).length)
    throw Error('QUALIFICATION_PROJECTOR_VERIFY_FAILED');
   return{verified:true,updatedCells:before.updates.length,acknowledgedEvents:pending.length,pendingEvents:0};
  }catch{throw Error('QUALIFICATION_PROJECTOR_UNCONFIRMED_RECONCILE');}
 })});
}

export function createAuditorQualificationSheetsProjectionAdapter20({assertFrozen,readInputs,ensureRows,writeRaw}={}){
 if([assertFrozen,readInputs,ensureRows,writeRaw].some(fn=>typeof fn!=='function'))
  throw Error('QUALIFICATION_PROJECTOR_ADAPTER_CONFIGURATION_INVALID');
 const columnName=n=>{
  let name='';
  while(n>0){n--;name=String.fromCharCode(65+n%26)+name;n=Math.floor(n/26);}
  return name;
 };
 return Object.freeze({writeCells:async(updates,{sourceContentSha256}={})=>{
  if(!Array.isArray(updates)||!updates.length)throw Error('QUALIFICATION_PROJECTOR_UPDATES_INVALID');
  await assertFrozen();
  const fresh=planAuditorQualificationSheetsProjection20(await readInputs());
  if(fresh.sourceContentSha256!==sourceContentSha256||JSON.stringify(fresh.updates)!==JSON.stringify(updates))
   throw Error('QUALIFICATION_PROJECTOR_PREIMAGE_CHANGED');
  const maxRows=new Map(),data=[];
  for(const item of updates){
   const maxColumn=item.sheet==='Auditors'?52:item.sheet==='Auditor_Scope_Qualifications'?26:0;
   if(!maxColumn||!Number.isSafeInteger(item.row)||item.row<2||item.row>=5000||
      !Number.isSafeInteger(item.column)||item.column<1||item.column>maxColumn)
    throw Error('QUALIFICATION_PROJECTOR_UPDATES_INVALID');
   maxRows.set(item.sheet,Math.max(maxRows.get(item.sheet)||0,item.row));
   data.push({range:`'${item.sheet}'!${columnName(item.column)}${item.row}`,values:[[item.value]]});
  }
  for(const [sheet,row] of maxRows){
   await assertFrozen();
   await ensureRows(sheet,row);
  }
  await assertFrozen();
  const confirmed=planAuditorQualificationSheetsProjection20(await readInputs());
  if(confirmed.sourceContentSha256!==sourceContentSha256||JSON.stringify(confirmed.updates)!==JSON.stringify(updates))
   throw Error('QUALIFICATION_PROJECTOR_PREIMAGE_CHANGED');
  await assertFrozen();
  await writeRaw(data);
 }});
}
