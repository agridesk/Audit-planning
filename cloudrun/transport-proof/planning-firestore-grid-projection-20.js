/** Read-only Grid projection from canonical Firestore audit snapshots.
 * Rebuilds the `Audit planning` value matrix ([headers, ...rows]) from
 * ams_planning_20_*_audits so the manager Grid can stop reading Sheets.
 * Never writes. Parity output contains only row numbers and reason codes.
 */
const clean=value=>String(value??'').trim();
const trimEnd=values=>{const out=(values||[]).map(v=>v==null?'':v);while(out.length&&clean(out.at(-1))==='')out.pop();return out;};
const num=value=>Number(clean(value).replace(',','.'))||0;
const cell=value=>{const s=clean(value),n=s.replace(',','.');return /^-?\d+(\.\d+)?$/.test(n)?String(Number(n)):s;};
const same=(a,b)=>JSON.stringify(trimEnd(a).map(cell))===JSON.stringify(trimEnd(b).map(cell));
const TOTAL_HOURS_HEADER='total audit time in hours';

// Same rule as GAS AuditTimeV5: sum of marked SCOPE_n columns, using the
// row's "Duration SCOPE_n" override or Config_Scopes Default_hours.
export function scopeDefaultHours20(configScopeValues){
 const head=(configScopeValues?.[0]||[]).map(clean),slot=head.indexOf('SlotKey'),hours=head.indexOf('Default_hours');
 if(slot<0||hours<0)throw Error('GRID_CONFIG_SCOPES_SCHEMA_INVALID');
 const map=new Map();
 for(const row of configScopeValues.slice(1)){const key=clean(row[slot]);if(key)map.set(key,num(row[hours]));}
 return map;
}
export function deriveTotalAuditHours20(headers,row,defaults){
 const head=(headers||[]).map(clean),idx=head.map(h=>h.toLowerCase()).indexOf(TOTAL_HOURS_HEADER);
 if(idx<0||!(defaults instanceof Map))return row;
 let total=0;
 head.forEach((h,c)=>{
  if(!/^SCOPE_\d+$/.test(h)||clean(row[c]).toLowerCase()!=='x')return;
  const d=head.indexOf('Duration '+h),override=d>=0?num(row[d]):0;
  total+=override||defaults.get(h)||0;
 });
 const out=row.slice();while(out.length<=idx)out.push('');out[idx]=total;return out;
}

// Compares two manager Grid outputs (managerOpen) per audit; reports field names and counts only.
export function compareManagerGridOutputs20(sheetGrid,firestoreGrid){
 const index=grid=>new Map((grid?.rows||[]).map(row=>[clean(row.auditId),row]));
 const a=index(sheetGrid),b=index(firestoreGrid),diffFields={};let matched=0,missing=0,extra=0;
 for(const [id,row] of a){
  const other=b.get(id);if(!other){missing++;continue;}
  const fields=[...new Set([...Object.keys(row),...Object.keys(other)])].filter(k=>JSON.stringify(row[k])!==JSON.stringify(other[k]));
  if(!fields.length)matched++;
  for(const k of fields)diffFields[k]=(diffFields[k]||0)+1;
 }
 for(const id of b.keys())if(!a.has(id))extra++;
 return {ready:missing===0&&extra===0&&matched===a.size,gridRowsSheet:a.size,gridRowsFirestore:b.size,gridMatched:matched,gridMissing:missing,gridExtra:extra,gridDiffFields:diffFields};
}

export async function listAllPlanningAudits20(store,{maxPages=20,pageSize=200}={}){
 if(typeof store?.listAudits!=='function')throw Error('GRID_FIRESTORE_STORE_INVALID');
 const audits=[];let pageToken='';
 for(let page=0;page<maxPages;page++){
  const result=await store.listAudits({pageSize,pageToken});
  audits.push(...result.audits);
  if(!result.nextPageToken)return audits;
  pageToken=result.nextPageToken;
 }
 throw Error('GRID_FIRESTORE_SCAN_TRUNCATED');
}

const deepFreeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const v of Object.values(value))deepFreeze(v);}return value;};
/** Exact, change-validated audit source: every call lists current updateTimes
 * (field mask, small) and fetches only new/changed documents. No TTL staleness.
 */
export function createVersionedPlanningAuditSource20(store,{maxPages=10,pageSize=300}={}){
 if(typeof store?.listAuditVersions!=='function'||typeof store?.batchGetAudits!=='function')throw Error('GRID_FIRESTORE_STORE_INVALID');
 let cache=new Map();
 return async function readVersionedPlanningAudits20(){
  const versions=[];let pageToken='',complete=false;
  for(let page=0;page<maxPages;page++){
   const result=await store.listAuditVersions({pageSize,pageToken});
   versions.push(...result.versions);
   if(!result.nextPageToken){complete=true;break;}
   pageToken=result.nextPageToken;
  }
  if(!complete)throw Error('GRID_FIRESTORE_SCAN_TRUNCATED');
  const next=new Map(),stale=[];
  for(const v of versions){const hit=cache.get(v.auditId);if(hit&&hit.updateTime===v.updateTime)next.set(v.auditId,hit);else stale.push(v);}
  for(let i=0;i<stale.length;i+=100){
   const wanted=new Map(stale.slice(i,i+100).map(v=>[v.auditId,v.updateTime]));
   for(const doc of await store.batchGetAudits([...wanted.keys()])){
    // A document changed again after listing: keep the newer read; it is a valid later state.
    next.set(doc.auditId,{updateTime:doc.updateTime,value:deepFreeze(doc.value)});
   }
  }
  cache=next;
  return versions.filter(v=>next.has(v.auditId)).map(v=>next.get(v.auditId).value);
 };
}

// skipUnsupportedShapes is for parity reports only; the live Grid read must stay strict.
export function buildPlanningValuesFromAudits20(records,{scopeDefaults=null,skipUnsupportedShapes=false}={}){
 if(!Array.isArray(records))throw Error('GRID_FIRESTORE_RECORDS_INVALID');
 let headers=null;const rows=[],seenRows=new Set();
 for(const record of records){
  if(!record||record.removed===true)continue;
  const s=record.snapshot;
  const hasRow=s?.sourceRow!==undefined&&s?.sourceRow!==null;
  if(!Array.isArray(s?.headers)||!Array.isArray(s?.row)||hasRow&&(!Number.isSafeInteger(s.sourceRow)||s.sourceRow<2)){
   if(skipUnsupportedShapes)continue;
   throw Error('GRID_FIRESTORE_SNAPSHOT_SHAPE_UNSUPPORTED');
  }
  if(headers===null)headers=s.headers.slice();
  else if(!same(headers,s.headers))throw Error('GRID_FIRESTORE_HEADERS_DIVERGENT');
  if(hasRow&&seenRows.has(s.sourceRow))throw Error('GRID_FIRESTORE_SOURCE_ROW_DUPLICATE');
  if(hasRow)seenRows.add(s.sourceRow);
  rows.push({sourceRow:hasRow?s.sourceRow:Infinity,auditId:clean(record.auditId),row:trimEnd(scopeDefaults?deriveTotalAuditHours20(s.headers,s.row,scopeDefaults):s.row)});
 }
 if(headers===null)throw Error('GRID_FIRESTORE_EMPTY');
 // Firestore-first writers have no Sheets row; they follow legacy rows, ordered by Audit ID.
 rows.sort((a,b)=>a.sourceRow-b.sourceRow||(a.auditId<b.auditId?-1:a.auditId>b.auditId?1:0));
 // Keep legacy rows at their sheet position so Grid sourceRow stays stable.
 const out=[headers];
 for(const x of rows){if(Number.isFinite(x.sourceRow))while(out.length<x.sourceRow-1)out.push([]);out.push(x.row);}
 return out;
}

// Compares the live Sheets tab with Firestore by Audit ID and full row content.
export function comparePlanningGridSources20(sheetValues,records,{scopeDefaults=null}={}){
 const head=(sheetValues?.[0]||[]).map(clean),idCol=head.indexOf('Audit ID');
 if(idCol<0)throw Error('GRID_PARITY_SHEET_SCHEMA_INVALID');
 const problems=[],sheetById=new Map(),mismatchColumns={},missingStatuses={},hoursDiagnostics={},shapeDiagnostics={},statusCol=head.indexOf('Status');let matched=0;
 sheetValues.slice(1).forEach((row,i)=>{
  const id=clean(row[idCol]);if(!id)return;
  if(sheetById.has(id))problems.push({sourceRow:i+2,reason:'SHEET_AUDIT_ID_DUPLICATE'});
  sheetById.set(id,{sourceRow:i+2,row});
 });
 const fsById=new Map(),removedIds=new Set();
 for(const record of records||[]){
  if(record?.removed===true){removedIds.add(clean(record.auditId));continue;}
  if(!record)continue;
  const s=record.snapshot;
  if(!Array.isArray(s?.headers)||!Array.isArray(s?.row)){
   problems.push({sourceRow:null,reason:'FIRESTORE_SNAPSHOT_SHAPE_UNSUPPORTED'});
   const k=Object.keys(s||{}).sort().join('|')+(record.lastOperationId?'#op':'#noop')+'#rev'+record.revision;
   shapeDiagnostics[k]=(shapeDiagnostics[k]||0)+1;continue;
  }
  fsById.set(clean(record.auditId),record);
 }
 for(const [id,sheet] of sheetById){
  const record=fsById.get(id);
  if(!record){problems.push({sourceRow:sheet.sourceRow,reason:'FIRESTORE_AUDIT_MISSING'});const st=statusCol<0?'':clean(sheet.row[statusCol])||'(empty)',key=removedIds.has(id)?st+' (removed in Firestore)':st;missingStatuses[key]=(missingStatuses[key]||0)+1;continue;}
  if(!same(record.snapshot.headers,sheetValues[0]))problems.push({sourceRow:sheet.sourceRow,reason:'HEADERS_MISMATCH'});
  else if(record.snapshot.sourceRow!=null&&record.snapshot.sourceRow!==sheet.sourceRow)problems.push({sourceRow:sheet.sourceRow,reason:'SOURCE_ROW_MOVED'});
  else if(!same(scopeDefaults?deriveTotalAuditHours20(record.snapshot.headers,record.snapshot.row,scopeDefaults):record.snapshot.row,sheet.row)){
   problems.push({sourceRow:sheet.sourceRow,reason:'ROW_CONTENT_MISMATCH'});
   const fsRow=scopeDefaults?deriveTotalAuditHours20(record.snapshot.headers,record.snapshot.row,scopeDefaults):record.snapshot.row;
   const width=Math.max(head.length,fsRow.length,sheet.row.length);
   for(let c=0;c<width;c++)if(cell(fsRow[c])!==cell(sheet.row[c])){const name=head[c]||'#'+c;mismatchColumns[name]=(mismatchColumns[name]||0)+1;}
   if(scopeDefaults){
    const h=head.map(x=>x.toLowerCase()).indexOf(TOTAL_HOURS_HEADER),sheetDerived=deriveTotalAuditHours20(sheetValues[0],sheet.row,scopeDefaults);
    const k=h<0?'NO_HOURS_COLUMN':cell(sheetDerived[h])!==cell(sheet.row[h])?'SHEET_HOURS_NOT_RECOMPUTED':cell(record.snapshot.row[h])===cell(sheet.row[h])?'SNAPSHOT_HOURS_MATCH_SHEET':'SNAPSHOT_SCOPES_STALE';
    hoursDiagnostics[k]=(hoursDiagnostics[k]||0)+1;
   }
  }
  else matched++;
 }
 for(const [id,record] of fsById)if(!sheetById.has(id))problems.push({sourceRow:record.snapshot?.sourceRow??null,reason:'FIRESTORE_AUDIT_NOT_IN_SHEET'});
 const reasons={};for(const p of problems)reasons[p.reason]=(reasons[p.reason]||0)+1;
 return {ready:problems.length===0&&matched===sheetById.size,sheetAudits:sheetById.size,firestoreAudits:fsById.size,matched,reasons,mismatchColumns,missingStatuses,hoursDiagnostics,shapeDiagnostics,problems:problems.slice(0,200)};
}
