/** DEV write-through gateway for the reference tabs (Auditors, Companies, Config_Scopes).
 * Installed as a fetch wrapper so every existing Sheets writer becomes Firestore-first without
 * touching its call site:
 *  1. translate the Sheets write into row changes and commit them to Firestore (meta revision
 *     bump, precondition on the meta updateTime; conflicts retry on a fresh snapshot);
 *  2. forward the untouched request to Sheets, which is only a projection;
 *  3. read the touched rows back from Sheets and align Firestore to Sheets' rendering of exactly
 *     those rows (dates, locale numbers, formulas), so both stay value-identical.
 * A Sheets failure reverts the Firestore commit. Anything that cannot be proven consistent marks
 * the table stale, after which readers refuse Firestore and fall back to Sheets.
 * Writes that cannot be translated safely (deletes, clears, formulas in structural writes, key
 * changes, row clears, header renames) fail closed before anything is written.
 * The optional read facade serves UNFORMATTED_VALUE/FORMATTED_STRING value reads of these tabs
 * from Firestore, positionally identical to the Sheets response.
 */
import {REFERENCE_TABLES_20,referenceKeyIndex20,referenceKeyValid20,referenceRowBlank20,referenceTrimRow20} from './reference-tables-firestore-20.js';

const ORIGIN='https://sheets.googleapis.com';
export const REFERENCE_GATEWAY_MAX_COLUMNS_20=52; // A:AZ, the width migrated and verified.
const MAX_COLS=REFERENCE_GATEWAY_MAX_COLUMNS_20;
const TABLE_BY_SHEET=new Map(Object.entries(REFERENCE_TABLES_20).map(([table,def])=>[def.sheet,table]));
const SKIP=Symbol('skip');
class Refusal extends Error{constructor(code){super(code);this.code=code;}}
const refuse=code=>{throw new Refusal(code);};
const cellString=x=>x===undefined||x===null?'':String(x);
const sameCells=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export function columnIndex20(letters){let n=0;for(const ch of String(letters).toUpperCase())n=n*26+(ch.charCodeAt(0)-64);return n-1;}
const columnLetters=i=>{let s='';for(let n=i+1;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};

/** A1 range → 0-based grid bounds (end exclusive, null = open). Returns null when unparsable. */
export function parseA1Range20(range){
 const m=/^(?:'((?:[^']|'')+)'|([^!']+))(?:!(.+))?$/.exec(String(range??'').trim());
 if(!m)return null;
 const sheet=m[1]!==undefined?m[1].replace(/''/g,"'"):m[2];
 if(m[3]===undefined)return {sheet,startRow:0,startCol:0,endRow:null,endCol:null};
 const c=/^([A-Za-z]{0,3})(\d*)(?::([A-Za-z]{0,3})(\d*))?$/.exec(m[3]);
 if(!c||(!c[1]&&!c[2])||(c[2]&&Number(c[2])<1)||(c[4]&&Number(c[4])<1))return {sheet,invalid:true};
 const startCol=c[1]?columnIndex20(c[1]):0,startRow=c[2]?Number(c[2])-1:0;
 if(c[3]===undefined)return {sheet,startRow,startCol,endRow:c[2]?startRow+1:null,endCol:c[1]?startCol+1:null};
 return {sheet,startRow,startCol,endRow:c[4]?Number(c[4]):null,endCol:c[3]?columnIndex20(c[3])+1:null};
}

function inputValue(v,mode){
 if(v===null||v===undefined)return SKIP;
 if(typeof v==='boolean')return v;
 if(typeof v==='number'){if(!Number.isFinite(v))refuse('REFERENCE_GATEWAY_VALUE_INVALID');return v;}
 if(typeof v!=='string')refuse('REFERENCE_GATEWAY_VALUE_INVALID');
 if(mode==='RAW')return v;
 // USER_ENTERED best effort; the Sheets read-back after the write makes it exact.
 if(v.startsWith("'"))return v.slice(1);
 if(/^(true|false)$/i.test(v))return v.toLowerCase()==='true';
 if(/^-?\d{1,15}(\.\d+)?$/.test(v))return Number(v);
 return v;
}
const fieldsTouchValue=fields=>String(fields??'').split(',').map(x=>x.trim()).some(x=>x==='*'||x==='userEnteredValue'||x.startsWith('userEnteredValue.'));
function structuralValue(cell){
 const u=cell?.userEnteredValue;
 if(!u)return '';
 if('stringValue'in u)return String(u.stringValue);
 if('numberValue'in u){const n=Number(u.numberValue);if(!Number.isFinite(n))refuse('REFERENCE_GATEWAY_VALUE_INVALID');return n;}
 if('boolValue'in u)return Boolean(u.boolValue);
 return refuse('REFERENCE_GATEWAY_STRUCTURAL_VALUE_UNSUPPORTED');
}
function sheetIdsIn(x,out=new Set()){
 if(Array.isArray(x))x.forEach(v=>sheetIdsIn(v,out));
 else if(x&&typeof x==='object')for(const [k,v] of Object.entries(x)){if(k==='sheetId'&&Number.isSafeInteger(v))out.add(v);else sheetIdsIn(v,out);}
 return out;
}

/** Pure: translate one Sheets write request into reference-table items. null = not a reference write. */
export function planReferenceWrite20({path,method,query,body,sheetTitles}){
 const items=new Map(),add=(table,item)=>{if(!items.has(table))items.set(table,[]);items.get(table).push(item);};
 let structural=false,valuesAppend=false;
 const refRange=range=>{
  const p=parseA1Range20(range);
  if(!p){if([...TABLE_BY_SHEET.keys()].some(s=>String(range??'').includes(s)))refuse('REFERENCE_GATEWAY_RANGE_UNPARSABLE');return null;}
  const table=TABLE_BY_SHEET.get(p.sheet);
  if(!table)return null;
  if(p.invalid)refuse('REFERENCE_GATEWAY_RANGE_UNPARSABLE');
  return {table,...p};
 };
 const valueCells=(p,values,mode,majorDimension)=>{
  if(majorDimension&&majorDimension!=='ROWS')refuse('REFERENCE_GATEWAY_MAJOR_DIMENSION_UNSUPPORTED');
  if(!Array.isArray(values)||values.some(r=>!Array.isArray(r)))refuse('REFERENCE_GATEWAY_VALUES_INVALID');
  if(p.endRow!==null&&p.startRow+values.length>p.endRow)refuse('REFERENCE_GATEWAY_VALUES_EXCEED_RANGE');
  const cells=[];
  values.forEach((row,i)=>row.forEach((v,j)=>{
   if(p.endCol!==null&&p.startCol+j>=p.endCol)refuse('REFERENCE_GATEWAY_VALUES_EXCEED_RANGE');
   const value=inputValue(v,mode);if(value!==SKIP)cells.push({row:p.startRow+i,col:p.startCol+j,value});
  }));
  return cells;
 };
 const mode=x=>{if(x!=='RAW'&&x!=='USER_ENTERED')refuse('REFERENCE_GATEWAY_INPUT_OPTION_UNSUPPORTED');return x;};
 let m;
 if(method==='POST'&&path==='/values:batchUpdate'){
  for(const d of body?.data||[]){const p=refRange(d?.range);if(p)add(p.table,{type:'cells',cells:valueCells(p,d.values,mode(body.valueInputOption),d.majorDimension)});}
 }else if(method==='POST'&&(m=/^\/values\/([^:/]+):append$/.exec(path))){
  const p=refRange(decodeURIComponent(m[1]));
  if(p){
   const cells=valueCells({...p,startRow:0,endRow:null},body?.values,mode(query.get('valueInputOption')),body?.majorDimension);
   add(p.table,{type:'append',startCol:p.startCol,rowCount:body.values.length,cells});valuesAppend=true;
  }
 }else if(method==='PUT'&&(m=/^\/values\/([^:/]+)$/.exec(path))){
  const p=refRange(decodeURIComponent(m[1]));
  if(p)add(p.table,{type:'cells',cells:valueCells(p,body?.values,mode(query.get('valueInputOption')),body?.majorDimension)});
 }else if(method==='POST'&&path===':batchUpdate'){
  const tableOf=id=>TABLE_BY_SHEET.get(sheetTitles.get(id));
  for(const request of body?.requests||[]){
   const [type,spec]=Object.entries(request||{})[0]||[];
   if(type==='updateCells'){
    const table=tableOf(spec?.range?.sheetId??spec?.start?.sheetId??0);
    if(!table||!fieldsTouchValue(spec.fields))continue;
    structural=true;const cells=[],rows=spec.rows||[];
    if(spec.range){
     const r=spec.range;
     if(![r.startRowIndex,r.endRowIndex,r.startColumnIndex,r.endColumnIndex].every(Number.isSafeInteger))refuse('REFERENCE_GATEWAY_UNBOUNDED_RANGE');
     if(rows.length>r.endRowIndex-r.startRowIndex||rows.some(x=>(x?.values||[]).length>r.endColumnIndex-r.startColumnIndex))refuse('REFERENCE_GATEWAY_VALUES_EXCEED_RANGE');
     // A range update clears every cell of the range that rows do not specify.
     for(let i=r.startRowIndex;i<r.endRowIndex;i++)for(let j=r.startColumnIndex;j<r.endColumnIndex;j++)
      cells.push({row:i,col:j,value:structuralValue(rows[i-r.startRowIndex]?.values?.[j-r.startColumnIndex])});
    }else{
     const r0=spec.start?.rowIndex??0,c0=spec.start?.columnIndex??0;
     rows.forEach((row,i)=>(row?.values||[]).forEach((cell,j)=>cells.push({row:r0+i,col:c0+j,value:structuralValue(cell)})));
    }
    add(table,{type:'cells',cells});
   }else if(type==='appendCells'){
    const table=tableOf(spec?.sheetId??0);
    if(!table)continue;
    if(!fieldsTouchValue(spec.fields))refuse('REFERENCE_GATEWAY_FORMAT_APPEND_UNSUPPORTED');
    structural=true;const rows=spec.rows||[];
    add(table,{type:'append',startCol:0,rowCount:rows.length,cells:rows.flatMap((row,i)=>(row?.values||[]).map((cell,j)=>({row:i,col:j,value:structuralValue(cell)})))});
   }else if(type==='appendDimension'){
    continue; // grows the grid only; no values change
   }else{
    const touched=[...sheetIdsIn(spec)].filter(id=>tableOf(id));
    if(!touched.length)continue;
    if(type==='repeatCell'&&!fieldsTouchValue(spec?.fields))continue; // formatting only
    refuse('REFERENCE_GATEWAY_REQUEST_UNSUPPORTED_'+String(type).slice(0,40));
   }
  }
 }else if(/^\/values(:batchClear|:batchClearByDataFilter|:batchUpdateByDataFilter|\/[^/]+:clear)$/.test(path)){
  if(/DataFilter/.test(path))refuse('REFERENCE_GATEWAY_DATA_FILTER_UNSUPPORTED');
  const ranges=path==='/values:batchClear'?(body?.ranges||[]):[decodeURIComponent(path.slice('/values/'.length,-':clear'.length))];
  if(ranges.some(r=>refRange(r)))refuse('REFERENCE_GATEWAY_CLEAR_UNSUPPORTED');
 }
 return items.size?{items,structural,valuesAppend}:null;
}

/** Pure: apply translated items to a table snapshot; returns the row puts and new headers. */
export function applyReferenceWrite20(table,snapshot,items){
 const def=REFERENCE_TABLES_20[table];
 const byIndex=new Map(snapshot.rows.map(r=>[r.rowIndex,r])),draft=new Map(),appended=[];
 let headers=[...snapshot.headers],headerTouched=false;
 let lastRow=Math.max(0,...snapshot.rows.map(r=>r.rowIndex));
 const set=(row,col,value)=>{
  if(col<0||col>=MAX_COLS)refuse('REFERENCE_GATEWAY_COLUMN_OUT_OF_RANGE');
  if(row<0||row>=def.maxRows-1)refuse('REFERENCE_GATEWAY_ROW_OUT_OF_RANGE');
  if(row===0){
   const current=cellString(headers[col]).trim(),next=cellString(value).trim();
   if(current===next)return;
   if(current!==''||typeof value!=='string')refuse('REFERENCE_GATEWAY_HEADER_CHANGE_UNSUPPORTED');
   while(headers.length<=col)headers.push('');
   headers[col]=value;headerTouched=true;return;
  }
  if(!draft.has(row))draft.set(row,[...(byIndex.get(row)?.cells||[])]);
  const cells=draft.get(row);while(cells.length<=col)cells.push('');cells[col]=value;
  if(row>lastRow&&cellString(value).trim()!=='')lastRow=row;
 };
 for(const item of items){
  if(item.type==='cells'){for(const c of item.cells)set(c.row,c.col,c.value);continue;}
  // Sheets appends after the last row holding data; the position is verified after the write.
  const start=lastRow+1;
  appended.push({start,count:item.rowCount});
  for(let i=0;i<item.rowCount;i++)if(!draft.has(start+i))draft.set(start+i,[...(byIndex.get(start+i)?.cells||[])]);
  for(const c of item.cells)set(start+c.row,item.startCol+c.col,c.value);
  lastRow=Math.max(lastRow,start+item.rowCount-1);
 }
 headers=referenceTrimRow20(headers);
 const keyIndex=referenceKeyIndex20(table,headers);
 if(keyIndex<0||keyIndex!==referenceKeyIndex20(table,snapshot.headers))refuse('REFERENCE_GATEWAY_KEY_COLUMN_CHANGED');
 const keys=new Set(snapshot.rows.map(r=>r.key)),puts=[],before=[];
 for(const [rowIndex,raw] of [...draft].sort((a,b)=>a[0]-b[0])){
  const cells=referenceTrimRow20(raw),old=byIndex.get(rowIndex),key=cellString(cells[keyIndex]).trim();
  if(old){
   if(referenceRowBlank20(cells))refuse('REFERENCE_GATEWAY_ROW_CLEAR_UNSUPPORTED');
   if(key!==old.key)refuse('REFERENCE_GATEWAY_KEY_CHANGE_UNSUPPORTED');
   if(!sameCells(cells,old.cells)){puts.push({row:{key,rowIndex,cells},create:false});before.push(old);}
  }else{
   if(referenceRowBlank20(cells))continue;
   if(!referenceKeyValid20(key))refuse('REFERENCE_GATEWAY_KEY_INVALID');
   if(keys.has(key))refuse('REFERENCE_GATEWAY_KEY_DUPLICATE');
   keys.add(key);puts.push({row:{key,rowIndex,cells},create:true});
  }
 }
 return {table,puts,before,headers,headersChanged:!sameCells(headers,snapshot.headers),headerTouched,
  rowCount:snapshot.rows.length+puts.filter(p=>p.create).length,touchedRows:[...draft.keys()].sort((a,b)=>a-b),appended};
}

/** Pure: Sheets-identical values for a range read (blank rows inside as [], trailing blanks trimmed). */
export function referenceRangeValues20({headers,rows},p){
 const endCol=Math.min(p.endCol??MAX_COLS,MAX_COLS),out=[];
 const all=[[0,headers],...rows.map(r=>[r.rowIndex,r.cells])]
  .filter(([i])=>i>=p.startRow&&(p.endRow===null||i<p.endRow)).sort((a,b)=>a[0]-b[0]);
 for(const [i,cells] of all){
  const slice=referenceTrimRow20((cells||[]).slice(p.startCol,endCol));
  if(!slice.length)continue;
  while(out.length<i-p.startRow)out.push([]);
  out[i-p.startRow]=slice;
 }
 return out;
}

const authOf=headers=>headers instanceof Headers?headers.get('authorization'):(headers?.authorization||headers?.Authorization||'');
const jsonResponse=(status,json)=>new Response(JSON.stringify(json),{status,headers:{'content-type':'application/json'}});
const refusalResponse=code=>jsonResponse(409,{error:{code:409,status:'FAILED_PRECONDITION',message:code}});

export function createReferenceTablesGateway20({spreadsheetId,store,fetchImpl,writeEnabled=true,readEnabled=false,log=()=>{}}={}){
 if(!spreadsheetId||!store||typeof store.commitChanges!=='function'||typeof fetchImpl!=='function')throw Error('REFERENCE_GATEWAY_CONFIG_INVALID');
 const base=ORIGIN+'/v4/spreadsheets/'+encodeURIComponent(spreadsheetId);
 const cache=new Map(),stats={writes:0,refused:0,reverted:0,stale:0,canonicalized:0,facadeReads:0,passthrough:0};
 let sheetTitles=null,sheetTitlesAt=0,chain=Promise.resolve();
 const serialize=fn=>{const p=chain.then(fn,fn);chain=p.catch(()=>{});return p;};

 async function snapshot(table){
  const meta=await store.readMeta(table);
  if(!meta||meta.stale)return null;
  const hit=cache.get(table);
  if(hit&&hit.meta.revision===meta.revision&&hit.meta.updateTime===meta.updateTime)return hit;
  const loaded=await store.readTable(table);
  if(!loaded||loaded.meta.revision!==meta.revision||loaded.meta.updateTime!==meta.updateTime)throw Error('REFERENCE_TABLE_CHANGED_DURING_READ');
  const value={meta:loaded.meta,headers:loaded.headers,rows:loaded.rows};
  cache.set(table,value);return value;
 }
 async function titles(auth){
  if(sheetTitles&&Date.now()-sheetTitlesAt<300000)return sheetTitles;
  const r=await fetchImpl(base+'?fields='+encodeURIComponent('sheets.properties(sheetId,title)'),{headers:{authorization:auth}});
  if(!r.ok)throw Error('REFERENCE_GATEWAY_SHEET_METADATA_'+r.status);
  sheetTitles=new Map(((await r.json()).sheets||[]).map(s=>[s.properties?.sheetId,s.properties?.title]));sheetTitlesAt=Date.now();
  return sheetTitles;
 }
 async function markStale(table,reason){
  cache.delete(table);stats.stale++;
  try{await store.markStale(table,reason);log({event:'REFERENCE_GATEWAY_STALE',table,reason});}
  catch(e){log({event:'REFERENCE_GATEWAY_STALE_MARK_FAILED',table,reason,error:String(e?.message||e).slice(0,80)});}
 }
 const remember=(applied,commits)=>{for(const c of commits){
  const a=applied.find(x=>x.table===c.table),rows=new Map(a.snap.rows.map(r=>[r.rowIndex,r]));
  for(const p of a.puts)rows.set(p.row.rowIndex,p.row);
  cache.set(c.table,{meta:{...a.snap.meta,headers:a.headers,rowCount:a.rowCount,revision:c.revision,updateTime:c.updateTime},headers:a.headers,rows:[...rows.values()]});
 }};
 async function readBack(auth,ranges){
  const u=new URL(base+'/values:batchGet');
  for(const r of ranges)u.searchParams.append('ranges',r);
  u.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');u.searchParams.set('dateTimeRenderOption','FORMATTED_STRING');
  const r=await fetchImpl(u,{headers:{authorization:auth}});
  if(!r.ok)throw Error('REFERENCE_GATEWAY_READBACK_'+r.status);
  return ((await r.json()).valueRanges||[]).map(v=>v.values||[]);
 }
 // Align Firestore to Sheets' rendering of exactly the rows this write touched.
 async function canonicalize(auth,applied,commits){
  const targets=applied.filter(a=>commits.some(c=>c.table===a.table)&&cache.has(a.table));
  if(!targets.length)return;
  const plan=targets.map(a=>({a,rows:[...(a.headerTouched?[0]:[]),...a.touchedRows]}));
  const sheet=t=>REFERENCE_TABLES_20[t].sheet;
  const ranges=plan.flatMap(({a,rows})=>rows.map(r=>sheet(a.table)+'!A'+(r+1)+':'+columnLetters(MAX_COLS-1)+(r+1)));
  let values;
  try{values=await readBack(auth,ranges);}catch{for(const {a} of plan)await markStale(a.table,'READBACK_FAILED');return;}
  let k=0;const changes=[];
  for(const {a,rows} of plan){
   const snap=cache.get(a.table),byIndex=new Map(snap.rows.map(r=>[r.rowIndex,r])),keyIndex=referenceKeyIndex20(a.table,snap.headers);
   let headers=snap.headers,inconsistent='';const puts=[];
   for(const rowIndex of rows){
    const cells=referenceTrimRow20((values[k++]||[])[0]||[]);
    if(rowIndex===0){if(!sameCells(cells,headers)){if(referenceKeyIndex20(a.table,cells)!==keyIndex)inconsistent='HEADER_MISMATCH';else headers=cells;}continue;}
    const doc=byIndex.get(rowIndex),key=cellString(cells[keyIndex]).trim();
    if(!doc){if(!referenceRowBlank20(cells))inconsistent='UNTRACKED_ROW';continue;}
    if(referenceRowBlank20(cells)||key!==doc.key){inconsistent='ROW_MISMATCH';continue;}
    if(!sameCells(cells,doc.cells))puts.push({row:{key,rowIndex,cells},create:false});
   }
   if(inconsistent){await markStale(a.table,inconsistent);continue;}
   if(puts.length||!sameCells(headers,snap.headers))changes.push({table:a.table,meta:snap.meta,puts,headers,rowCount:snap.rows.length,writer:'GATEWAY_CANONICAL',snap,count:puts.length});
  }
  if(!changes.length)return;
  try{
   const result=await store.commitChanges(changes);
   remember(changes.map(c=>({table:c.table,snap:c.snap,puts:c.puts,headers:c.headers,rowCount:c.rowCount})),result);
   stats.canonicalized+=changes.reduce((n,c)=>n+c.count,0);
  }catch{for(const c of changes)await markStale(c.table,'CANONICAL_COMMIT_FAILED');}
 }
 async function revert(applied,commits){
  const changes=commits.map(c=>{
   const a=applied.find(x=>x.table===c.table);
   return {table:c.table,meta:{...a.snap.meta,revision:c.revision,updateTime:c.updateTime},
    puts:a.before.map(row=>({row,create:false})),deletes:a.puts.filter(p=>p.create).map(p=>p.row.key),
    headers:a.snap.headers,rowCount:a.snap.rows.length,writer:'GATEWAY_REVERT'};
  });
  for(const c of changes)cache.delete(c.table);
  try{await store.commitChanges(changes);stats.reverted++;}
  catch{for(const c of changes)await markStale(c.table,'REVERT_FAILED');}
 }

 async function execute(plan,input,init){
  const started=Date.now(),auth=authOf(init.headers);
  let applied=[],commits=[];
  for(let attempt=0;;attempt++){
   const tables=[...plan.items.keys()].sort(),snaps=new Map();
   for(const t of tables)snaps.set(t,await snapshot(t));
   // Tables not migrated (or already stale) keep the plain Sheets behaviour.
   applied=tables.filter(t=>snaps.get(t)).map(t=>({...applyReferenceWrite20(t,snaps.get(t),plan.items.get(t)),snap:snaps.get(t)}));
   const changes=applied.filter(a=>a.puts.length||a.headersChanged);
   if(!changes.length){commits=[];break;}
   try{commits=await store.commitChanges(changes.map(a=>({table:a.table,meta:a.snap.meta,puts:a.puts,headers:a.headers,rowCount:a.rowCount,writer:'GATEWAY'})));break;}
   catch(e){if(e?.message!=='REFERENCE_FIRESTORE_CONFLICT'||attempt>=2)throw e;cache.clear();}
  }
  remember(applied,commits);
  let response,text;
  try{response=await fetchImpl(input,init);text=await response.text();}
  catch(e){for(const c of commits)await markStale(c.table,'SHEETS_OUTCOME_UNKNOWN');throw Object.assign(e instanceof Error?e:Error(String(e)),{sheetsTransport:true});}
  if(!response.ok){if(commits.length)await revert(applied,commits);}
  else if(commits.length){
   try{
    if(plan.valuesAppend){
     const a=applied[0],actual=parseA1Range20(JSON.parse(text)?.updates?.updatedRange);
     if(a&&commits.some(c=>c.table===a.table)&&actual?.startRow!==a.appended[0]?.start){await markStale(a.table,'APPEND_POSITION_MISMATCH');applied=applied.filter(x=>x!==a);}
    }
    await canonicalize(auth,applied,commits);
   }catch{for(const c of commits)if(cache.has(c.table))await markStale(c.table,'POST_WRITE_CHECK_FAILED');}
  }
  stats.writes++;
  log({event:'REFERENCE_GATEWAY_WRITE',tables:applied.map(a=>a.table),rows:applied.reduce((n,a)=>n+a.puts.length,0),sheetsStatus:response.status,ms:Date.now()-started});
  return new Response(text,{status:response.status,statusText:response.statusText,headers:response.headers});
 }

 async function facade(url,input,init,rest){
  const q=url.searchParams;
  if(q.get('valueRenderOption')!=='UNFORMATTED_VALUE'||q.get('dateTimeRenderOption')!=='FORMATTED_STRING'||(q.get('majorDimension')||'ROWS')!=='ROWS')return null;
  let m,ranges;
  if(rest==='/values:batchGet')ranges=q.getAll('ranges');
  else if((m=/^\/values\/([^:/]+)$/.exec(rest)))ranges=[decodeURIComponent(m[1])];
  else return null;
  const parsed=ranges.map(r=>{const p=parseA1Range20(r),table=p&&!p.invalid?TABLE_BY_SHEET.get(p.sheet):null;return table&&(p.endCol??MAX_COLS)<=MAX_COLS?{table,...p}:null;});
  if(!parsed.some(Boolean))return null;
  const snaps=new Map();
  for(const t of new Set(parsed.filter(Boolean).map(p=>p.table))){const s=await snapshot(t);if(!s)return null;snaps.set(t,s);}
  const values=parsed.map(p=>p?referenceRangeValues20(snaps.get(p.table),p):null);
  const others=ranges.filter((_,i)=>!parsed[i]);
  if(others.length){
   const u=new URL(url);u.searchParams.delete('ranges');others.forEach(r=>u.searchParams.append('ranges',r));
   const r=await fetchImpl(u,init);
   if(!r.ok)return new Response(await r.text(),{status:r.status,statusText:r.statusText,headers:r.headers});
   const rest2=(await r.json()).valueRanges||[];let k=0;
   parsed.forEach((p,i)=>{if(!p)values[i]=rest2[k++]?.values||[];});
  }
  stats.facadeReads++;
  const valueRange=(range,v)=>({range,majorDimension:'ROWS',...(v.length?{values:v}:{})});
  if(rest==='/values:batchGet')return jsonResponse(200,{spreadsheetId,valueRanges:ranges.map((r,i)=>valueRange(r,values[i]))});
  return jsonResponse(200,valueRange(ranges[0],values[0]));
 }

 async function gatewayFetch(input,init={}){
  let url=null;
  try{if(typeof input==='string'||input instanceof URL)url=new URL(String(input));}catch{}
  const m=url&&url.origin===ORIGIN?/^\/v4\/spreadsheets\/([^/:]+)(.*)$/.exec(url.pathname):null;
  if(!m||decodeURIComponent(m[1])!==spreadsheetId)return fetchImpl(input,init);
  const method=String(init?.method||'GET').toUpperCase(),rest=m[2];
  if(method==='GET'){
   if(readEnabled){
    try{const r=await facade(url,input,init,rest);if(r)return r;}
    catch(e){log({event:'REFERENCE_GATEWAY_FACADE_FALLBACK',error:String(e?.message||e).slice(0,80)});}
   }
   return fetchImpl(input,init);
  }
  if(!writeEnabled)return fetchImpl(input,init);
  try{
   let body={};
   if(init.body!==undefined&&init.body!==null){if(typeof init.body!=='string')refuse('REFERENCE_GATEWAY_BODY_UNSUPPORTED');body=JSON.parse(init.body);}
   const auth=authOf(init.headers);
   const plan=planReferenceWrite20({path:rest,method,query:url.searchParams,body,sheetTitles:rest===':batchUpdate'?await titles(auth):new Map()});
   if(!plan){stats.passthrough++;return fetchImpl(input,init);}
   return await serialize(()=>execute(plan,input,init));
  }catch(e){
   if(e?.sheetsTransport)throw e;
   if(e instanceof Refusal){stats.refused++;log({event:'REFERENCE_GATEWAY_REFUSED',code:e.code});return refusalResponse(e.code);}
   // Firestore unavailable before the Sheets write: nothing was written anywhere.
   log({event:'REFERENCE_GATEWAY_ERROR',error:String(e?.message||e).slice(0,80)});
   return jsonResponse(503,{error:{code:503,status:'UNAVAILABLE',message:'REFERENCE_GATEWAY_FIRESTORE_UNAVAILABLE'}});
  }
 }
 return Object.freeze({fetch:gatewayFetch,stats:()=>({...stats})});
}
