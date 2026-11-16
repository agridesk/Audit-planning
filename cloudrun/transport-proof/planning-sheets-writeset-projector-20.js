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
  const m=/^([^!]+)!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(write.range||'');
  if(!m||(m[5]!==undefined&&m[3]!==m[5])||!oneRow(write)||pre[i]?.range!==write.range||!Array.isArray(pre[i]?.before)||!['Audit planning','Auditor Availability','Concept Reservations','Audit_Obligations','Audit_Visit_Obligations','Company_Scopes','Companies','Rejected audits','Log realized audits','Notification Queue'].includes(m[1]))throw Error('SHEETS_PROJECTION_RANGE_INVALID');
  if(seenRanges.has(write.range))throw Error('SHEETS_PROJECTION_DUPLICATE_TARGET');
  seenRanges.add(write.range);
  const start=columnIndex(m[2]),end=columnIndex(m[4]||m[2]),row=Number(m[3]);
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
  const data=await request(base+'?fields='+encodeURIComponent('sheets(properties(sheetId,title,gridProperties(rowCount)))'));
  if(!Array.isArray(data.sheets))throw Error('SHEETS_PROJECTOR_METADATA_INVALID');
  return new Map(data.sheets.map(x=>[x.properties?.title,x.properties]));
 }
 async function inspect(plan){
  const changes=rows(plan),url=new URL(base+'/values:batchGet');
  // Match the canonical R4 preflight reader: unformatted values, formatted dates.
  url.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');
  url.searchParams.set('dateTimeRenderOption','FORMATTED_STRING');
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
  const entered=[],literalDates=[];
  for(const change of changes){
   const literalDate=plan.scopeExtension&&/^Audit_Obligations!([K-M])\d+(?::\1\d+)?$/.test(change.range)&&
    typeof change.values[0]==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(change.values[0]);
   (literalDate?literalDates:entered).push({range:change.range,values:[change.values]});
  }
  for(const [valueInputOption,data] of [['USER_ENTERED',entered],['RAW',literalDates]]){
   if(!data.length)continue;
   await request(base+'/values:batchUpdate','POST',{valueInputOption,data,includeValuesInResponse:false});
   await verifyFence({operationId,gateToken});
  }
  // USER_ENTERED can reinterpret Last_Updated as a localized Sheets date.
  // Preserve the canonical timestamp as literal text, without changing the
  // existing numeric/date/formula behavior of all other cells.
  const lastUpdated=changes.filter(change=>change.sheet==='Auditor Availability'&&
   /^Auditor Availability!A\d+:M\d+$/.test(change.range)&&
   typeof change.values[11]==='string'&&
   /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d$/.test(change.values[11]))
   .map(change=>({range:change.range.replace(/^Auditor Availability!A(\d+):M\d+$/,'Auditor Availability!L$1'),
    values:[[change.values[11]]]}));
  if(lastUpdated.length){
   await verifyFence({operationId,gateToken});
   await request(base+'/values:batchUpdate','POST',{
    valueInputOption:'RAW',data:lastUpdated,includeValuesInResponse:false
   });
   await verifyFence({operationId,gateToken});
  }
  const verified=await inspect(plan);
  if(verified.state!=='MATCH')throw Error('SHEETS_PROJECTION_VERIFY_FAILED');
  await verifyFence({operationId,gateToken});
  return {operationId,idempotent:true,projected:true,replayed:false};
 }
 // Privacy-preserving forensic view: return only differing cell positions,
 // scalar types and whether each cell matches the preflight BEFORE/AFTER.
 // Never return cell values, including email, audit notes or identifiers.
 async function inspectDiff(plan){
  const changes=rows(plan),url=new URL(base+'/values:batchGet');
  url.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');
  url.searchParams.set('dateTimeRenderOption','FORMATTED_STRING');
  for(const change of changes)url.searchParams.append('ranges',change.range);
  const results=(await request(url.toString())).valueRanges;
  if(!Array.isArray(results)||results.length!==changes.length)throw Error('SHEETS_FORENSIC_READ_INCOMPLETE');
  const type=x=>x===undefined||x===null?'empty':typeof x;
  const values=[];
  for(let i=0;i<changes.length;i++){
   const change=changes[i],actual=results[i].values?.[0]||[],target=change.values,before=change.before;
   const length=Math.max(actual.length,target.length,before.length);
   const differing=[];let matchedTarget=0,matchedBefore=0;
   for(let cell=0;cell<length;cell++){
    const have=actual[cell]??'',want=target[cell]??'',old=before[cell]??'';
    const targetMatch=str(have)===str(want),beforeMatch=str(have)===str(old);
    if(targetMatch)matchedTarget++;if(beforeMatch)matchedBefore++;
    if(!targetMatch){
     differing.push({column:cell+1,actualType:type(actual[cell]),targetType:type(target[cell]),
      beforeType:type(before[cell]),matchesBefore:beforeMatch,
      numericStringCoercion:typeof actual[cell]==='number'&&typeof target[cell]==='string'&&
       String(actual[cell])===target[cell]});
    }
   }
   values.push({range:change.range,columns:length,matchedTarget,matchedBefore,
    differingCount:differing.length,differing:differing.slice(0,80),truncated:differing.length>80});
  }
  return values;
 }
 async function inspectRenderParity(plan){
  const changes=rows(plan),url=new URL(base+'/values:batchGet');
  url.searchParams.set('valueRenderOption','FORMATTED_VALUE');
  for(const change of changes)url.searchParams.append('ranges',change.range);
  const results=(await request(url.toString())).valueRanges;
  if(!Array.isArray(results)||results.length!==changes.length)throw Error('SHEETS_RENDER_PARITY_READ_INCOMPLETE');
  const detail=changes.map((change,i)=>{
   const actual=results[i].values?.[0]||[];
   const before=equal(actual,change.before),target=equal(actual,change.values);
   const differences=[];
   const n=Math.max(actual.length,change.before.length,change.values.length);
   for(let j=0;j<n;j++)if(str(actual[j])!==str(change.before[j]))
    differences.push({column:j+1,formattedMatchesTarget:str(actual[j])===str(change.values[j])});
   return {range:change.range,formattedMatchesBefore:before,formattedMatchesTarget:target,
    differingBeforeColumns:differences};
  });
  return {allFormattedBefore:detail.every(x=>x.formattedMatchesBefore),
   allFormattedBeforeOrTarget:detail.every(x=>x.formattedMatchesBefore||x.formattedMatchesTarget),
   detail};
 }
 // Recovery-only normalization: preserve a numeric source cell whose formatted
 // display equals the frozen BEFORE value. Never normalize a changed business
 // value or a cell that the operation intends to modify.
 async function normalizeLegacySourceHours(plan){
  const changes=rows(plan),range='Audit planning!A74:BS74';
  if(changes.length!==5||changes[0].range!==range)throw Error('COMPOSITION_RECOVERY_RANGE_UNEXPECTED');
  const parity=await inspectRenderParity(plan);
  if(!parity.allFormattedBefore)throw Error('COMPOSITION_RECOVERY_FORMATTED_BEFORE_MISMATCH');
  const diff=await inspectDiff(plan);
  if(diff.length!==5||diff[0].differing.some(d=>d.column!==19&&!d.matchesBefore)||
     diff.slice(1).some(x=>x.differing.some(d=>!d.matchesBefore)))
   throw Error('COMPOSITION_RECOVERY_OTHER_CELL_DRIFT');
  const url=new URL(base+'/values:batchGet');
  url.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');
  url.searchParams.set('dateTimeRenderOption','FORMATTED_STRING');
  url.searchParams.append('ranges',range);
  const result=(await request(url.toString())).valueRanges?.[0]?.values?.[0];
  const actual=result?.[18];
  if(typeof actual!=='number'||!Number.isFinite(actual)||
     equal([actual],[changes[0].before[18]]))
   throw Error('COMPOSITION_RECOVERY_HOURS_NOT_FORMAT_ONLY');
  // Recheck the formatted evidence after the unformatted read to guard races.
  const second=await inspectRenderParity(plan);
  if(!second.allFormattedBefore)throw Error('COMPOSITION_RECOVERY_SOURCE_MOVED');
  const normalized=structuredClone(plan);
  normalized.projectionPreconditions[0].before[18]=actual;
  const check=await inspect(normalized);
  if(check.state!=='READY'&&check.state!=='MATCH')
   throw Error('COMPOSITION_RECOVERY_NORMALIZED_PRECONDITION_CONFLICT');
  return normalized;
 }
 // Read-only, recovery-specific normalization of a fully projected row after
 // Sheets USER_ENTERED reinterprets the hours target as a numeric cell.
 // Never accept any unrelated difference, even if its display looks similar.
 async function normalizeCommittedTargetHours(plan){
  const changes=rows(plan),range='Audit planning!A74:BS74';
  if(changes.length!==5||changes[0].range!==range)
   throw Error('COMPOSITION_TARGET_RECOVERY_RANGE_UNEXPECTED');
  const parity=await inspectRenderParity(plan);
  if(!parity.detail.every(x=>x.formattedMatchesTarget))
   throw Error('COMPOSITION_TARGET_RECOVERY_RENDER_MISMATCH');
  const diff=await inspectDiff(plan);
  if(diff.length!==5||diff[0].differing.length!==1||
     diff[0].differing[0].column!==19||
     diff.slice(1).some(x=>x.differingCount!==0))
   throw Error('COMPOSITION_TARGET_RECOVERY_OTHER_CELL_DRIFT');
  const url=new URL(base+'/values:batchGet');
  url.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');
  url.searchParams.set('dateTimeRenderOption','FORMATTED_STRING');
  url.searchParams.append('ranges',range);
  const actual=(await request(url.toString())).valueRanges?.[0]?.values?.[0]?.[18];
  if(typeof actual!=='number'||!Number.isFinite(actual)||
     equal([actual],[changes[0].values[18]]))
   throw Error('COMPOSITION_TARGET_RECOVERY_HOURS_NOT_COERCED');
  const again=await inspectRenderParity(plan);
  if(!again.detail.every(x=>x.formattedMatchesTarget))
   throw Error('COMPOSITION_TARGET_RECOVERY_SOURCE_MOVED');
  const normalized=structuredClone(plan);
  normalized.projectionWrites[0].values[0][18]=actual;
  if((await inspect(normalized)).state!=='MATCH')
   throw Error('COMPOSITION_TARGET_RECOVERY_NOT_MATCH');
  return normalized;
 }
 return Object.freeze({inspect,inspectDiff,inspectRenderParity,normalizeLegacySourceHours,normalizeCommittedTargetHours,apply});
}
