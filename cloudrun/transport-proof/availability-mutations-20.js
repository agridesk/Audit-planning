/** AMS Availability 2.0 mutation policy. Pure Node ESM; persistence and authentication belong to API layer. */
const str=x=>String(x??'').trim();
const day=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('INVALID_DATE');return Date.parse(s+'T00:00:00Z')/86400000;};
const time=(s,allow24=false)=>{if(allow24&&s==='24:00')return 1440;if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))throw Error('INVALID_TIME');return Number(s.slice(0,2))*60+Number(s.slice(3));};
function windowOf(v){const from=day(v.fromDate??v.date),to=day(v.toDate??v.fromDate??v.date);if(to<from)throw Error('INVALID_DATE_RANGE');const start=v.wholeDay===true?0:time(v.start),end=v.wholeDay===true?1440:time(v.end,true);if(end<=start)throw Error('INVALID_TIME_RANGE');return {from,to,start,end};}
function canonicalBlocks(snapshot){if(!Array.isArray(snapshot?.blocks))throw Error('CANONICAL_BLOCKS_REQUIRED');if(snapshot.blocks.some(x=>!x||typeof x!=='object'||!['SOFT','PROVISIONAL','HARD','COMMITTED'].includes(x.state)))throw Error('CANONICAL_BLOCKS_INVALID');return snapshot.blocks;}
function intersects(a,b){return a.from<=b.to&&b.from<=a.to&&a.start<b.end&&b.start<a.end;}
function contains(a,b){return a.from<=b.from&&a.to>=b.to&&a.start<=b.start&&a.end>=b.end;}
/** Validate one atomic write request against current canonical snapshot; no state is modified. */
export function prepareAvailabilityMutation({actor,targetAuditorId,expectedVersion,mutation,snapshot,now}={}){
 const actorId=str(actor?.id),role=str(actor?.role).toLowerCase(),target=str(targetAuditorId);
 if(!actorId||!target||!['manager','auditor'].includes(role))throw Error('NOT_AUTHORIZED');
 if(role==='auditor'&&actorId!==target)throw Error('NOT_AUTHORIZED');
 if(str(mutation?.action)==='CONFIRM_AVAILABILITY'&&role!=='auditor')throw Error('AUDITOR_CONFIRMATION_REQUIRED');
 if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0||snapshot?.version!==expectedVersion)throw Error('VERSION_CONFLICT');
 if(!mutation||typeof mutation!=='object')throw Error('INVALID_MUTATION');
 const action=str(mutation.action),id=str(mutation.id),items=Array.isArray(snapshot?.baselineExceptions)?snapshot.baselineExceptions:[];
 if(!['BLOCK_PERIOD','EDIT_HARD_BLOCK','RELEASE_BASELINE','CONFIRM_AVAILABILITY','SET_RECURRING','SET_FREE_OVERRIDE','REMOVE_HARD_BLOCK'].includes(action))throw Error('UNSUPPORTED_ACTION');
 if(!now||!Number.isFinite(Date.parse(now)))throw Error('INVALID_TIMESTAMP');
 let payload;
 if(action==='BLOCK_PERIOD'){
  if(!Array.isArray(snapshot?.baselineExceptions))throw Error('CANONICAL_BASELINES_REQUIRED');
  if(!id||items.some(x=>str(x.id)===id))throw Error('DUPLICATE_OR_MISSING_ID');
  const w=windowOf(mutation);if(w.to-w.from>3660)throw Error('PERIOD_TOO_LONG');
  const committed=canonicalBlocks(snapshot).filter(x=>str(x.state)==='COMMITTED');
  if(committed.some(x=>intersects(w,windowOf(x))))throw Error('COMMITTED_CONFLICT');
  payload={id,fromDate:mutation.fromDate??mutation.date,toDate:mutation.toDate??mutation.fromDate??mutation.date,wholeDay:mutation.wholeDay===true,...(mutation.wholeDay===true?{}:{start:mutation.start,end:mutation.end})};
 }else if(action==='EDIT_HARD_BLOCK'){
  if(!Array.isArray(snapshot?.baselineExceptions))throw Error('CANONICAL_BASELINES_REQUIRED');
  const targetId=str(mutation.targetExceptionId);
  const existing=items.find(x=>str(x.id)===targetId);
  if(!targetId||!existing)throw Error('BASELINE_NOT_FOUND');
  const w=windowOf(mutation);if(w.to-w.from>3660)throw Error('PERIOD_TOO_LONG');
  if(!Array.isArray(snapshot?.baselineReleases))throw Error('CANONICAL_HARD_SOURCE_REQUIRED');
  if(canonicalBlocks(snapshot).filter(x=>str(x.state)==='COMMITTED').some(x=>intersects(w,windowOf(x))))throw Error('COMMITTED_CONFLICT');
  if((snapshot?.baselineReleases||[]).some(x=>str(x.targetExceptionId)===targetId&&!contains(w,windowOf(x))))throw Error('EXISTING_RELEASE_OUTSIDE_EDITED_BASELINE');
  payload={id:targetId,fromDate:mutation.fromDate??mutation.date,toDate:mutation.toDate??mutation.fromDate??mutation.date,wholeDay:mutation.wholeDay===true,...(mutation.wholeDay===true?{}:{start:mutation.start,end:mutation.end})};
  if(items.some(x=>str(x.id)===targetId&&x!==existing))throw Error('DUPLICATE_BASELINE_ID');
}else if(action==='RELEASE_BASELINE'){
  if(!Array.isArray(snapshot?.baselineExceptions))throw Error('CANONICAL_BASELINES_REQUIRED');
  const baseline=items.find(x=>str(x.id)===str(mutation.targetExceptionId));if(!baseline)throw Error('BASELINE_NOT_FOUND');
  const w=windowOf(mutation);if(!contains(windowOf(baseline),w))throw Error('RELEASE_OUTSIDE_BASELINE');
  payload={id,targetExceptionId:str(mutation.targetExceptionId),fromDate:mutation.fromDate??mutation.date,toDate:mutation.toDate??mutation.fromDate??mutation.date,wholeDay:mutation.wholeDay===true,...(mutation.wholeDay===true?{}:{start:mutation.start,end:mutation.end})};
 }else if(action==='REMOVE_HARD_BLOCK'){
  if(!Array.isArray(snapshot?.baselineExceptions))throw Error('CANONICAL_BASELINES_REQUIRED');
  const target=str(mutation.targetExceptionId);const baseline=items.find(x=>str(x.id)===target);if(!baseline)throw Error('BASELINE_NOT_FOUND');
  const w=windowOf(mutation);if(!contains(windowOf(baseline),w))throw Error('RELEASE_OUTSIDE_BASELINE');
  payload={targetExceptionId:target,fromDate:mutation.fromDate??mutation.date,toDate:mutation.toDate??mutation.fromDate??mutation.date,wholeDay:mutation.wholeDay===true,...(mutation.wholeDay===true?{}:{start:mutation.start,end:mutation.end})};
 }else if(action==='SET_FREE_OVERRIDE'){
  const w=windowOf(mutation);if(w.to-w.from>3660)throw Error('PERIOD_TOO_LONG');
  const committed=canonicalBlocks(snapshot).filter(x=>['COMMITTED','PROVISIONAL'].includes(str(x.state)));
  if(committed.some(x=>intersects(w,windowOf(x))))throw Error('AUDIT_CONFLICT');
  payload={id,fromDate:mutation.fromDate??mutation.date,toDate:mutation.toDate??mutation.fromDate??mutation.date,wholeDay:mutation.wholeDay===true,...(mutation.wholeDay===true?{}:{start:mutation.start,end:mutation.end})};
 }else if(action==='SET_RECURRING'){
  if(!Array.isArray(mutation.recurring)||mutation.recurring.length>7)throw Error('INVALID_RECURRING');
  const seen=new Set();payload=[];
  for(const item of mutation.recurring){if(!item||!Number.isInteger(item.weekday)||item.weekday<0||item.weekday>6||seen.has(item.weekday))throw Error('INVALID_RECURRING_WEEKDAY');seen.add(item.weekday);
   const start=item.wholeDay===true?'00:00':str(item.start),end=item.wholeDay===true?'24:00':str(item.end);
   if(time(start)>=time(end,true))throw Error('INVALID_RECURRING_TIME');
   payload.push({weekday:item.weekday,start,end});
  }
  payload.sort((a,b)=>a.weekday-b.weekday);
 }else{
  const w=windowOf({...mutation,wholeDay:true});if(w.to-w.from>3660)throw Error('PERIOD_TOO_LONG');
  payload={fromDate:mutation.fromDate??mutation.date,toDate:mutation.toDate??mutation.fromDate??mutation.date};
 }
 return {targetAuditorId:target,expectedVersion,nextVersion:expectedVersion+1,action,payload,audit:{at:now,actorId,actorRole:role,targetAuditorId:target,action,fromDate:payload.fromDate??null,toDate:payload.toDate??null,substantive:action!=='CONFIRM_AVAILABILITY'}};
}