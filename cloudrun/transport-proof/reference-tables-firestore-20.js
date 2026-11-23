/** DEV Firestore authority for reference tables (Auditors, Companies, Config_Scopes).
 * One document per entity, keyed by Auditor_UID / Company_UID / SlotKey, plus one
 * meta document per table holding the header row and a revision. Readers validate
 * the cache on the meta revision, so a warm read is a single document GET.
 * Every future writer MUST change rows and bump the meta revision in one commit.
 */
import {createHash} from 'node:crypto';

export const REFERENCE_TABLES_20=Object.freeze({
 auditors:Object.freeze({sheet:'Auditors',range:'Auditors!A1:AZ500',maxRows:500,keyHeaders:['Auditor UID','AuditorUID','Auditor_UID','UID','Auditor ID','AuditorID']}),
 companies:Object.freeze({sheet:'Companies',range:'Companies!A1:AZ1024',maxRows:1024,keyHeaders:['Company_UID','Company UID','CompanyUid','UID']}),
 config_scopes:Object.freeze({sheet:'Config_Scopes',range:'Config_Scopes!A1:AZ128',maxRows:128,keyHeaders:['SlotKey','Slot key','Slot']})
});
const META='ams_reference_20_dev_meta';
const rowsCollection=table=>'ams_reference_20_dev_'+table;
const norm=x=>String(x??'').trim().toLowerCase().replace(/[\s_-]+/g,'');
const cellString=x=>x===undefined||x===null?'':String(x);
// Sheets UNFORMATTED_VALUE cells keep their type (number/boolean/string); empty becomes ''.
const cellValue=x=>typeof x==='boolean'||(typeof x==='number'&&Number.isFinite(x))?x:cellString(x);
const validKey=x=>typeof x==='string'&&x.length>0&&x.length<=180&&!/[\\/]/.test(x)&&x!=='.'&&x!=='..'&&!/^__.*__$/.test(x);
const hex=x=>createHash('sha256').update(x).digest('hex');
const tableDef=table=>{const def=REFERENCE_TABLES_20[table];if(!def)throw Error('REFERENCE_TABLE_UNKNOWN');return def;};
const blank=row=>!Array.isArray(row)||row.every(v=>cellString(v).trim()==='');
const trimRow=row=>{const out=row.map(cellValue);while(out.length&&out[out.length-1]==='')out.pop();return out;};

function encode(v){
 if(v===null)return {nullValue:null};
 if(typeof v==='string')return {stringValue:v};
 if(typeof v==='boolean')return {booleanValue:v};
 if(typeof v==='number'&&Number.isSafeInteger(v))return {integerValue:String(v)};
 if(typeof v==='number'&&Number.isFinite(v))return {doubleValue:v};
 if(Array.isArray(v))return {arrayValue:{values:v.map(encode)}};
 if(v&&typeof v==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};
 throw Error('REFERENCE_FIRESTORE_INVALID_VALUE');
}
function decode(v){
 if('nullValue'in v)return null;
 if('stringValue'in v)return v.stringValue;
 if('integerValue'in v)return Number(v.integerValue);
 if('doubleValue'in v)return Number(v.doubleValue);
 if('booleanValue'in v)return v.booleanValue;
 if('arrayValue'in v)return (v.arrayValue.values||[]).map(decode);
 if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));
 throw Error('REFERENCE_FIRESTORE_DECODE_INVALID');
}
const payloadOf=raw=>{if(!raw?.fields?.payload)throw Error('REFERENCE_FIRESTORE_CORRUPT');return decode(raw.fields.payload);};
const deepFreeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.freeze(x);for(const v of Object.values(x))deepFreeze(v);}return x;};

/** Pure: turn the Sheets values of one tab into keyed row documents (no I/O). */
export function planReferenceTable20(table,values){
 const def=tableDef(table);
 if(!Array.isArray(values)||!values.length||blank(values[0]))throw Error('REFERENCE_SOURCE_HEADER_MISSING');
 if(values.length>=def.maxRows)throw Error('REFERENCE_SOURCE_TRUNCATED');
 const headers=trimRow(values[0]),wanted=def.keyHeaders.map(norm),keyIndex=wanted.map(w=>headers.findIndex(h=>norm(h)===w)).find(i=>i>=0)??-1;
 if(keyIndex<0)throw Error('REFERENCE_SOURCE_KEY_COLUMN_MISSING');
 const rows=[],seen=new Set();let blankRows=0,missingKey=0,invalidKey=0,duplicateKey=0;
 values.slice(1).forEach((row,i)=>{
  if(blank(row)){blankRows++;return;}
  const key=cellString(row[keyIndex]).trim();
  if(!key){missingKey++;return;}
  if(!validKey(key)){invalidKey++;return;}
  if(seen.has(key)){duplicateKey++;return;}
  seen.add(key);rows.push({key,rowIndex:i+1,cells:trimRow(row)});
 });
 const blocked=missingKey+invalidKey+duplicateKey;
 const manifest=hex(JSON.stringify({table,headers,rows}));
 return {table,headers,rows,manifest,counts:{rows:rows.length,blankRows,missingKey,invalidKey,duplicateKey,blocked}};
}

/** Pure: rebuild a Sheets-shaped matrix ([headers,...rows]) bounded like a range read. */
export function referenceMatrix20({headers,rows},{maxCols=Infinity,maxRows=Infinity}={}){
 const cut=row=>trimRow(row.slice(0,maxCols));
 return [cut(headers),...[...rows].sort((a,b)=>a.rowIndex-b.rowIndex).map(r=>cut(r.cells))].slice(0,maxRows);
}

/** Pure: exact parity between Sheets values and the Firestore-backed matrix (blank rows ignored). */
export function compareReferenceMatrix20(sheetValues,firestoreMatrix){
 const strip=values=>(values||[]).filter((row,i)=>i===0||!blank(row)).map(trimRow);
 const a=strip(sheetValues),b=strip(firestoreMatrix);
 let differing=0;const n=Math.max(a.length,b.length);
 for(let i=0;i<n;i++)if(JSON.stringify(a[i]??null)!==JSON.stringify(b[i]??null))differing++;
 return {sheetRows:a.length,firestoreRows:b.length,differing,equal:differing===0};
}

export function createReferenceTablesFirestoreStore20({projectId,getToken,fetchImpl=fetch,databaseId='(default)'}={}){
 if(!/^[a-z][a-z0-9-]{4,62}$/.test(projectId||'')||typeof getToken!=='function')throw Error('REFERENCE_FIRESTORE_CONFIG_INVALID');
 const root='projects/'+projectId+'/databases/'+databaseId+'/documents';
 const base='https://firestore.googleapis.com/v1/'+root.split('/').map(encodeURIComponent).join('/');
 const metaUrl=table=>{tableDef(table);return base+'/'+META+'/'+encodeURIComponent(table);};
 const writeName=(collection,id)=>root+'/'+collection+'/'+id;
 async function request(url,method='GET',body){
  const token=await getToken();if(!token)throw Error('REFERENCE_FIRESTORE_TOKEN_REQUIRED');
  return fetchImpl(url,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 }
 async function readMeta(table){
  const r=await request(metaUrl(table));
  if(r.status===404)return null;
  if(!r.ok)throw Error('REFERENCE_FIRESTORE_READ_'+r.status);
  const raw=await r.json();return {...payloadOf(raw),updateTime:raw.updateTime};
 }
 async function listRows(table,limit){
  tableDef(table);const out=[];let pageToken='';
  do{
   const r=await request(base+'/'+rowsCollection(table)+'?pageSize=300'+(pageToken?'&pageToken='+encodeURIComponent(pageToken):''));
   if(!r.ok)throw Error('REFERENCE_FIRESTORE_LIST_'+r.status);
   const json=await r.json();
   for(const raw of json.documents||[]){const p=payloadOf(raw),id=raw.name.slice(raw.name.lastIndexOf('/')+1);if(p.key!==id)throw Error('REFERENCE_FIRESTORE_KEY_MISMATCH');out.push(p);}
   if(out.length>limit)throw Error('REFERENCE_FIRESTORE_SCAN_TRUNCATED');
   pageToken=json.nextPageToken||'';
  }while(pageToken);
  return out;
 }
 async function readTable(table){
  const meta=await readMeta(table);if(!meta)return null;
  const rows=await listRows(table,tableDef(table).maxRows);
  if(rows.length!==meta.rowCount)throw Error('REFERENCE_FIRESTORE_ROWCOUNT_MISMATCH');
  return {meta,headers:meta.headers,rows};
 }
 async function commit(writes){
  const r=await request(base+':commit','POST',{writes});
  if(!r.ok)throw Error('REFERENCE_FIRESTORE_COMMIT_'+r.status);
 }
 /** Create-only backfill of a validated plan. Existing identical rows are skipped (resume);
  * any differing existing row or an existing meta document aborts without writes. */
 async function backfillTable(plan,{expectedManifest}={}){
  if(!plan||plan.counts.blocked)throw Error('REFERENCE_BACKFILL_BLOCKED');
  if(plan.manifest!==expectedManifest)throw Error('REFERENCE_BACKFILL_MANIFEST_MISMATCH');
  if(await readMeta(plan.table))throw Error('REFERENCE_BACKFILL_ALREADY_MIGRATED');
  const existing=new Map((await listRows(plan.table,tableDef(plan.table).maxRows)).map(r=>[r.key,r]));
  const pending=[];
  for(const row of plan.rows){
   const have=existing.get(row.key);
   if(have){if(JSON.stringify(have)!==JSON.stringify(row))throw Error('REFERENCE_BACKFILL_EXISTING_ROW_DIFFERS');existing.delete(row.key);continue;}
   pending.push(row);
  }
  if(existing.size)throw Error('REFERENCE_BACKFILL_UNEXPECTED_EXISTING_ROWS');
  const collection=rowsCollection(plan.table);
  for(let i=0;i<pending.length;i+=400)
   await commit(pending.slice(i,i+400).map(row=>({update:{name:writeName(collection,row.key),fields:{payload:encode(row)}},currentDocument:{exists:false}})));
  // Meta last: readers ignore the table until every row exists.
  await commit([{update:{name:writeName(META,plan.table),fields:{payload:encode({table:plan.table,headers:plan.headers,rowCount:plan.rows.length,revision:1,manifest:plan.manifest,source:'SHEETS_BACKFILL'})}},currentDocument:{exists:false}}]);
  return {table:plan.table,written:pending.length,skipped:plan.rows.length-pending.length};
 }
 return Object.freeze({readMeta,readTable,backfillTable});
}

/** Revision-validated reader: one meta GET per call; rows reload only when the revision changes. */
export function createVersionedReferenceTableReader20(store){
 if(!store||typeof store.readMeta!=='function'||typeof store.readTable!=='function')throw Error('REFERENCE_READER_STORE_INVALID');
 const cache=new Map();
 return async function read(table){
  const meta=await store.readMeta(table);
  if(!meta)throw Error('REFERENCE_TABLE_NOT_MIGRATED');
  const hit=cache.get(table);
  if(hit&&hit.revision===meta.revision&&hit.updateTime===meta.updateTime)return hit.value;
  const loaded=await store.readTable(table);
  if(!loaded||loaded.meta.revision!==meta.revision||loaded.meta.updateTime!==meta.updateTime)throw Error('REFERENCE_TABLE_CHANGED_DURING_READ');
  const value=deepFreeze({headers:loaded.headers,rows:loaded.rows});
  cache.set(table,{revision:meta.revision,updateTime:meta.updateTime,value});
  return value;
 };
}

/** Grid-shaped reference source: same ranges/widths as managerGridSources20's Sheets read. */
export function createGridReferenceSource20(read){
 if(typeof read!=='function')throw Error('REFERENCE_GRID_SOURCE_INVALID');
 return async()=>{
  const [scopes,companies,auditors]=await Promise.all(['config_scopes','companies','auditors'].map(read));
  return [
   {values:referenceMatrix20(scopes,{maxCols:26,maxRows:128})},
   {values:referenceMatrix20(companies,{maxCols:52,maxRows:1024})},
   {values:referenceMatrix20(auditors,{maxCols:26,maxRows:256})}
  ];
 };
}
