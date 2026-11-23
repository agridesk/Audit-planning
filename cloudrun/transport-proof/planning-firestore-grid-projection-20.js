/** Read-only Grid projection from canonical Firestore audit snapshots.
 * Rebuilds the `Audit planning` value matrix ([headers, ...rows]) from
 * ams_planning_20_*_audits so the manager Grid can stop reading Sheets.
 * Never writes. Parity output contains only row numbers and reason codes.
 */
const clean=value=>String(value??'').trim();
const trimEnd=values=>{const out=(values||[]).map(v=>v==null?'':v);while(out.length&&clean(out.at(-1))==='')out.pop();return out;};
const same=(a,b)=>JSON.stringify(trimEnd(a).map(clean))===JSON.stringify(trimEnd(b).map(clean));

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

export function buildPlanningValuesFromAudits20(records){
 if(!Array.isArray(records))throw Error('GRID_FIRESTORE_RECORDS_INVALID');
 let headers=null;const rows=[],seenRows=new Set();
 for(const record of records){
  if(!record||record.removed===true)continue;
  const s=record.snapshot;
  if(!Array.isArray(s?.headers)||!Array.isArray(s?.row)||!Number.isSafeInteger(s?.sourceRow)||s.sourceRow<2)throw Error('GRID_FIRESTORE_SNAPSHOT_SHAPE_UNSUPPORTED');
  if(headers===null)headers=s.headers.slice();
  else if(!same(headers,s.headers))throw Error('GRID_FIRESTORE_HEADERS_DIVERGENT');
  if(seenRows.has(s.sourceRow))throw Error('GRID_FIRESTORE_SOURCE_ROW_DUPLICATE');
  seenRows.add(s.sourceRow);
  rows.push({sourceRow:s.sourceRow,row:trimEnd(s.row)});
 }
 if(headers===null)throw Error('GRID_FIRESTORE_EMPTY');
 rows.sort((a,b)=>a.sourceRow-b.sourceRow);
 return [headers,...rows.map(x=>x.row)];
}

// Compares the live Sheets tab with Firestore by Audit ID and full row content.
export function comparePlanningGridSources20(sheetValues,records){
 const head=(sheetValues?.[0]||[]).map(clean),idCol=head.indexOf('Audit ID');
 if(idCol<0)throw Error('GRID_PARITY_SHEET_SCHEMA_INVALID');
 const problems=[],sheetById=new Map(),mismatchColumns={},missingStatuses={},statusCol=head.indexOf('Status');let matched=0;
 sheetValues.slice(1).forEach((row,i)=>{
  const id=clean(row[idCol]);if(!id)return;
  if(sheetById.has(id))problems.push({sourceRow:i+2,reason:'SHEET_AUDIT_ID_DUPLICATE'});
  sheetById.set(id,{sourceRow:i+2,row});
 });
 const fsById=new Map();
 for(const record of records||[]){
  if(!record||record.removed===true)continue;
  const s=record.snapshot;
  if(!Array.isArray(s?.headers)||!Array.isArray(s?.row)){problems.push({sourceRow:null,reason:'FIRESTORE_SNAPSHOT_SHAPE_UNSUPPORTED'});continue;}
  fsById.set(clean(record.auditId),record);
 }
 for(const [id,sheet] of sheetById){
  const record=fsById.get(id);
  if(!record){problems.push({sourceRow:sheet.sourceRow,reason:'FIRESTORE_AUDIT_MISSING'});const st=statusCol<0?'':clean(sheet.row[statusCol])||'(empty)';missingStatuses[st]=(missingStatuses[st]||0)+1;continue;}
  if(!same(record.snapshot.headers,sheetValues[0]))problems.push({sourceRow:sheet.sourceRow,reason:'HEADERS_MISMATCH'});
  else if(record.snapshot.sourceRow!==sheet.sourceRow)problems.push({sourceRow:sheet.sourceRow,reason:'SOURCE_ROW_MOVED'});
  else if(!same(record.snapshot.row,sheet.row)){
   problems.push({sourceRow:sheet.sourceRow,reason:'ROW_CONTENT_MISMATCH'});
   const width=Math.max(head.length,record.snapshot.row.length,sheet.row.length);
   for(let c=0;c<width;c++)if(clean(record.snapshot.row[c])!==clean(sheet.row[c])){const name=head[c]||'#'+c;mismatchColumns[name]=(mismatchColumns[name]||0)+1;}
  }
  else matched++;
 }
 for(const [id,record] of fsById)if(!sheetById.has(id))problems.push({sourceRow:record.snapshot?.sourceRow??null,reason:'FIRESTORE_AUDIT_NOT_IN_SHEET'});
 const reasons={};for(const p of problems)reasons[p.reason]=(reasons[p.reason]||0)+1;
 return {ready:problems.length===0&&matched===sheetById.size,sheetAudits:sheetById.size,firestoreAudits:fsById.size,matched,reasons,mismatchColumns,missingStatuses,problems:problems.slice(0,200)};
}
