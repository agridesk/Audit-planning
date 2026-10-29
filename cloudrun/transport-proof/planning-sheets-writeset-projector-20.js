/** DEV Sheets projection adapter for a canonical Firestore planning outbox.
 * Replays set the same complete row values, never append business rows.
 * Every target row must be either the staged BEFORE image or the staged AFTER
 * image. Mixed or changed rows fail closed. The global Firestore gate must
 * still be held while metadata is expanded and values are written.
 */
const str=x=>String(x??'');
const normalize=row=>{const result=(row||[]).map(str);while(result.length&&result.at(-1)==='')result.pop();return result;};
const equal=(a,b)=>JSON.stringify(normalize(a))===JSON.stringify(normalize(b));
const oneRow=write=>Array.isArray(write?.values)&&write.values.length===1&&Array.isArray(write.values[0]);
function rows(plan){
 const writes=plan?.projectionWrites,pre=plan?.projectionPreconditions;
 if(!Array.isArray(writes)||!writes.length||writes.length>80||!Array.isArray(pre)||pre.length!==writes.length)throw Error('SHEETS_PROJECTION_PLAN_INVALID');
 const seenRanges=new Set(),occupied=[];
 const columnIndex=letters=>[...letters].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
 return writes.map((write,i)=>{
  const m=/^([^!]+)!([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(write.range||'');
  if(!m||m[3]!==m[5]||!oneRow(write)||pre[i]?.range!==write.range||!Array.isArray(pre[i]?.before)||!['Audit planning','Auditor Availability','Concept Reservations','Audit_Obligations','Audit_Visit_Obligations','Company_Scopes','Companies','Rejected audits','Log realized audits','Notification Queue'].includes(m[1]))throw Error('SHEETS_PROJECTION_RANGE_INVALID');
  if(seenRanges.has(write.range))throw Error('SHEETS_PROJECTION_DUPLICATE_TARGET');
  seenRanges.add(write.range);
  const start=columnIndex(m[2]),end=columnIndex(m[4]),row=Number(m[3]);
  if(row<2||start>end||write.values[0].length>end-start+1||pre[i].before.length>end-start+1)throw Error('SHEETS_PROJECTION_RANGE_INVALID');
  if(occupied.some(x=>x.sheet===m[1]&&x.row===row&&start<=x.end&&end>=x.start))throw Error('SHEETS_PROJECTION_OVERLAPPING_TARGET');
  occupied.push({sheet:m[1],row,start,end});
  return {range:write.range,sheet:m[1],row:Number(m[3]),values:write.values[0],before:pre[i].before};
 });
}
export function createPlanningSheetsWritesetProjector({spreadsheetId,getToken,fetchImpl=fetch,verifyFence}={}){
 if(!spreadsheetId||typeof getToken!=='function'||typeof verifyFence!=='function')throw Error('SHEETS_PROJECTION_CONFIG_REQUIRED');
 const base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheetId);
 async function request(url,method='GET',body){
  const token=await getToken();if(!token)throw Error('SHEETS_PROJECTOR_TOKEN_REQUIRED');
  const result=await fetchImpl(url,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!result.ok)throw Error('SHEETS_PROJECTOR_HTTP_'+result.status);
  return result.json();
 }
 async function metadata(){
  const data=await request(base+'?fields=sheets(properties(sheetId,title,gridProperties(rowCount))');
  if(!Array.isArray(data.sheets))throw Error('SHEETS_PROJECTOR_METADATA_INVALID');
  return new Map(data.sheets.map(x=>[x.properties?.title,x.properties]));
 }
 async function inspect(plan){
  const changes=rows(plan),url=new URL(base+'/values:batchGet');
  url.searchParams.set('valueRenderOption','FORMATTED_VALUE');
  for(const change of changes)url.searchParams.append('ranges',change.range);
  const results=(await request(url.toString())).valueRanges;
  if(!Array.isArray(results)||results.length!==changes.length)throw Error('SHEETS_PROJECTION_READ_INCOMPLETE');
  let allMatch=true;
  const detail=changes.map((change,i)=>{
   const actual=results[i].values?.[0]||[];
   const target=equal(actual,change.values),before=equal(actual,change.before);
   if(!target)allMatch=false;
   return {range:change.range,target,before};
  });
  return {state:allMatch?'MATCH':detail.every(x=>x.target||x.before)?'READY':'CONFLICT',detail};
 }
 async function apply({operationId,plan,gateToken}){
  if(!operationId||!gateToken)throw Error('SHEETS_PROJECTION_FENCE_REQUIRED');
  const changes=rows(plan);
  await verifyFence({operationId,gateToken});
  const first=await inspect(plan);
  if(first.state==='MATCH'){await verifyFence({operationId,gateToken});return {operationId,idempotent:true,projected:true,replayed:true};}
  if(first.state!=='READY')throw Error('SHEETS_PROJECTION_PRECONDITION_CONFLICT');
  const meta=await metadata(),requests=[];
  for(const sheet of new Set(changes.map(x=>x.sheet))){
   const props=meta.get(sheet),max=Math.max(...changes.filter(x=>x.sheet===sheet).map(x=>x.row));
   if(!Number.isSafeInteger(props?.sheetId)||!Number.isSafeInteger(props?.gridProperties?.rowCount))throw Error('SHEETS_PROJECTION_TAB_MISSING');
   if(props.gridProperties.rowCount<max)requests.push({appendDimension:{sheetId:props.sheetId,dimension:'ROWS',length:max-props.gridProperties.rowCount}});
  }
  await verifyFence({operationId,gateToken});
  if(requests.length)await request(base+':batchUpdate','POST',{requests});
  await verifyFence({operationId,gateToken});
  const second=await inspect(plan);
  if(second.state==='MATCH'){await verifyFence({operationId,gateToken});return {operationId,idempotent:true,projected:true,replayed:true};}
  if(second.state!=='READY')throw Error('SHEETS_PROJECTION_CHANGED_DURING_WRITE');
  const payload={valueInputOption:'USER_ENTERED',data:changes.map(x=>({range:x.range,values:[x.values]})),includeValuesInResponse:false};
  await request(base+'/values:batchUpdate','POST',payload);
  await verifyFence({operationId,gateToken});
  const verified=await inspect(plan);
  if(verified.state!=='MATCH')throw Error('SHEETS_PROJECTION_VERIFY_FAILED');
  await verifyFence({operationId,gateToken});
  return {operationId,idempotent:true,projected:true,replayed:false};
 }
 return Object.freeze({inspect,apply});
}
