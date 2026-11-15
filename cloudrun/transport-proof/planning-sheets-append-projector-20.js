/** Durable Sheets append-intent projector.
 * Append side effects from a Firestore outbox only under the global write
 * fence. A timeout is UNKNOWN, never an invitation to append again blindly.
 * Recovery scans the unchanged intent for exact stored rows.
 */
const str=x=>String(x??'');
const scalar=x=>x===null||typeof x==='string'||typeof x==='boolean'||typeof x==='number'&&Number.isFinite(x);
const norm=x=>{const a=(x||[]).map(str);while(a.length&&a.at(-1)==='')a.pop();return a;};
const same=(a,b)=>JSON.stringify(norm(a))===JSON.stringify(norm(b));
const columnNumber=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
const widthOf=range=>{const m=/!A:([A-Z]+)$/.exec(range);return m?columnNumber(m[1]):0;};
const allowed=new Set(['Notification Queue','Rejected audits','Log realized audits','Audit planning','Audit_Obligations','Audit_Visit_Obligations','Diagnostics_Log','CB_Extension_Outbox']);
function validate(intents){
 if(!Array.isArray(intents)||intents.length>24)throw Error('APPEND_INTENTS_INVALID');
 const result=[];
 for(const item of intents){
  const match=/^([^!]+)![A-Z]+:[A-Z]+$/.exec(item?.range||'');
  if(!match||!allowed.has(match[1])||!Array.isArray(item.values)||item.values.length<1||item.values.length>100||item.values.some(x=>!Array.isArray(x)||x.length<1||x.length>100))throw Error('APPEND_INTENT_UNSUPPORTED');
  const width=widthOf(item.range);
  if(!width||item.values.some(row=>row.length>width))throw Error('APPEND_INTENT_WIDTH_INVALID');
  if(item.values.some(row=>row.some(v=>!scalar(v))))throw Error('APPEND_INTENT_CELL_INVALID');
  for(const row of item.values)result.push({range:item.range,sheet:match[1],row});
 }
 if(result.length>200)throw Error('APPEND_INTENTS_TOO_MANY');
 // A single sheet scan cannot safely verify intents using different column widths.
 const sheetRanges=new Map();
 for(const item of result){
  const previous=sheetRanges.get(item.sheet);
  if(previous&&previous!==item.range)throw Error('APPEND_INTENT_MIXED_RANGES');
  sheetRanges.set(item.sheet,item.range);
 }
 const signatures=new Set(),notificationHashes=new Set();
 for(const item of result){
  const sig=item.sheet+'|'+JSON.stringify(norm(item.row));
  if(signatures.has(sig))throw Error('APPEND_DUPLICATE_INTENT');signatures.add(sig);
  if(item.sheet==='Notification Queue'){
   const hash=str(item.row[10]).trim();
   if(!hash)throw Error('APPEND_NOTIFICATION_HASH_REQUIRED');
   if(notificationHashes.has(hash))throw Error('APPEND_NOTIFICATION_DUPLICATE_HASH_INTENT');
   notificationHashes.add(hash);
  }
 }
 return result;
}
export function createPlanningSheetsAppendProjector({spreadsheetId,getToken,fetchImpl=fetch,verifyFence}={}){
 if(!spreadsheetId||typeof getToken!=='function'||typeof verifyFence!=='function')throw Error('APPEND_PROJECTOR_CONFIG_INVALID');
 const base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheetId);
 async function request(url,method='GET',body){
  const token=await getToken();if(!token)throw Error('APPEND_PROJECTOR_TOKEN_REQUIRED');
  const r=await fetchImpl(url,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!r.ok)throw Error('APPEND_PROJECTOR_HTTP_'+r.status);
  return r.json();
 }
 async function inspect(intents){
  const items=validate(intents);
  if(!items.length)return {state:'MATCH',missing:[],count:0};
  const sources=new Map();
  for(const sheet of new Set(items.map(x=>x.sheet))){
   const width=items.find(x=>x.sheet===sheet).range.split(':')[1],range=sheet+'!A1:'+width+'5000';
   const u=base+'/values/'+encodeURIComponent(range)+'?valueRenderOption=UNFORMATTED_VALUE';
   const data=await request(u);
   if(!data||!Object.prototype.hasOwnProperty.call(data,'values'))throw Error('APPEND_PROJECTION_SOURCE_MALFORMED');
   const rows=data.values;
   if(!Array.isArray(rows)||rows.length>=5000)throw Error('APPEND_PROJECTION_SOURCE_TRUNCATED');
   if(!rows.length||rows.some(row=>!Array.isArray(row)))throw Error('APPEND_PROJECTION_SOURCE_MALFORMED');
   // A legacy values.append can leave an orphaned row starting in AG/BY.
   // Never append again while such rows exist: they may contain this operation.
   if(sheet==='Audit planning'&&rows.slice(1).some(row=>str(row[0])===''&&row.some(v=>str(v)!=='')))
    throw Error('APPEND_PROJECTION_SHIFTED_ROW_PRESENT');
   sources.set(sheet,rows);
  }
  const missing=[];
  for(const item of items){
   // Notification delivery timestamps may change while the logical event stays
   // identical. A matching PayloadHash in column K must never be appended twice.
   if(item.sheet==='Notification Queue'){
    const hash=str(item.row[10]);
    if(hash){
     const existing=sources.get(item.sheet).slice(1).filter(row=>str(row[10])===hash);
     if(existing.length>1)throw Error('APPEND_NOTIFICATION_LOGICAL_DUPLICATE_PRESENT');
     if(existing.length===1&&!same(existing[0],item.row)){
      // Delivery updates Status/Attempts/LastError/TimestampSent; immutable
      // event identity and payload must remain byte-for-byte consistent.
      const immutable=[0,2,3,4,5,6,7,10,12];
      if(immutable.some(i=>str(existing[0][i])!==str(item.row[i])))
       throw Error('APPEND_NOTIFICATION_HASH_CONFLICT');
      continue;
     }
    }
   }
   const matches=sources.get(item.sheet).slice(1).filter(row=>same(row,item.row));
   if(matches.length>1)throw Error('APPEND_PROJECTION_DUPLICATE_ALREADY_PRESENT');
   if(!matches.length)missing.push(item);
  }
  return {state:missing.length?'MISSING':'MATCH',missing,count:items.length};
 }
 async function apply({operationId,gateToken,intents}){
  if(!operationId||!gateToken)throw Error('APPEND_PROJECTION_FENCE_REQUIRED');
  await verifyFence({operationId,gateToken});
  const before=await inspect(intents);
  if(before.state==='MATCH'){await verifyFence({operationId,gateToken});return {operationId,confirmed:true,replayed:true};}
  await verifyFence({operationId,gateToken});
  for(const missing of before.missing){
   await verifyFence({operationId,gateToken});
   // A previous append or another writer may have materialized this row since
   // the initial scan. Reconcile again before issuing an irreversible append.
   const fresh=await inspect([{range:missing.range,values:[missing.row]}]);
   if(fresh.state==='MATCH')continue;
   await verifyFence({operationId,gateToken});
   // values.append guesses a table boundary and can place data in a later column.
   // appendCells always starts at column A, preserving RAW scalar types.
   const metadata=await request(base+'?fields=sheets(properties(sheetId,title))');
   const target=(metadata.sheets||[]).find(s=>s.properties?.title===missing.sheet);
   if(!Number.isInteger(target?.properties?.sheetId))throw Error('APPEND_TARGET_SHEET_NOT_FOUND');
   const values=missing.row.map(v=>({userEnteredValue:v===null?{}:typeof v==='string'?{stringValue:v}:typeof v==='boolean'?{boolValue:v}:{numberValue:v}}));
   await request(base+':batchUpdate','POST',{requests:[{appendCells:{sheetId:target.properties.sheetId,rows:[{values}],fields:'userEnteredValue'}}]});
   await verifyFence({operationId,gateToken});
  }
  const after=await inspect(intents);
  if(after.state!=='MATCH')throw Error('APPEND_PROJECTION_UNVERIFIED');
  await verifyFence({operationId,gateToken});
  return {operationId,confirmed:true,replayed:false};
 }
 return Object.freeze({inspect,apply});
}
