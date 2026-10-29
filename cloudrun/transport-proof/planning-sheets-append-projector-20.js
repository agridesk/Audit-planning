/** Durable Sheets append-intent projector.
 * Append side effects from a Firestore outbox only under the global write
 * fence. A timeout is UNKNOWN, never an invitation to append again blindly.
 * Recovery scans the unchanged intent for exact stored rows.
 */
const str=x=>String(x??'');
const norm=x=>{const a=(x||[]).map(str);while(a.length&&a.at(-1)==='')a.pop();return a;};
const same=(a,b)=>JSON.stringify(norm(a))===JSON.stringify(norm(b));
const allowed=new Set(['Notification Queue','Rejected audits','Log realized audits','Audit planning','Audit_Obligations','Audit_Visit_Obligations','Diagnostics_Log']);
function validate(intents){
 if(!Array.isArray(intents)||intents.length>24)throw Error('APPEND_INTENTS_INVALID');
 const result=[];
 for(const item of intents){
  const match=/^([^!]+)![A-Z]+:[A-Z]+$/.exec(item?.range||'');
  if(!match||!allowed.has(match[1])||!Array.isArray(item.values)||item.values.length<1||item.values.length>100||item.values.some(x=>!Array.isArray(x)||x.length<1||x.length>100))throw Error('APPEND_INTENT_UNSUPPORTED');
  for(const row of item.values)result.push({range:item.range,sheet:match[1],row});
 }
 if(result.length>200)throw Error('APPEND_INTENTS_TOO_MANY');
 const signatures=new Set();
 for(const item of result){
  const sig=item.sheet+'|'+JSON.stringify(norm(item.row));
  if(signatures.has(sig))throw Error('APPEND_DUPLICATE_INTENT');signatures.add(sig);
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
   const u=base+'/values/'+encodeURIComponent(range)+'?valueRenderOption=FORMATTED_VALUE';
   const data=await request(u),rows=data.values||[];
   if(!Array.isArray(rows)||rows.length>=5000)throw Error('APPEND_PROJECTION_SOURCE_TRUNCATED');
   sources.set(sheet,rows);
  }
  const missing=[];
  for(const item of items){
   const matches=sources.get(item.sheet).filter(row=>same(row,item.row));
   if(matches.length>1)throw Error('APPEND_PROJECTION_DUPLICATE_ALREADY_PRESENT');
   if(!matches.length)missing.push(item);
  }
  return {state:missing.length?'MISSING':'MATCH',missing,count:items.length};
 }
 async function apply({operationId,gateToken,intents}){
  if(!operationId||!gateToken)throw Error('APPEND_PROJECTION_FENCE_REQUIRED');
  await verifyFence({operationId,gateToken});
  const before=await inspect(intents);
  if(before.state==='MATCH')return {operationId,confirmed:true,replayed:true};
  await verifyFence({operationId,gateToken});
  for(const missing of before.missing){
   await verifyFence({operationId,gateToken});
   const url=base+'/values/'+encodeURIComponent(missing.range)+':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';
   await request(url,'POST',{values:[missing.row]});
   await verifyFence({operationId,gateToken});
  }
  const after=await inspect(intents);
  if(after.state!=='MATCH')throw Error('APPEND_PROJECTION_UNVERIFIED');
  await verifyFence({operationId,gateToken});
  return {operationId,confirmed:true,replayed:false};
 }
 return Object.freeze({inspect,apply});
}
