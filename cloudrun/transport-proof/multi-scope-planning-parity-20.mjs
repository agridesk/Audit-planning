/** Issue #87 — pure multi-scope draft allocation for the existing Planning 2.0 editor.
 * No authority granted here: the canonical R4/Firestore preflight remains mandatory.
 */
export function multiScopePlanningParity20({scopes,blocks,allocations=null}={}){
 const fail=reason=>({ok:false,reason,scopes:[],blocks:[],allocations:[]});
 if(!Array.isArray(scopes)||scopes.length<2||!Array.isArray(blocks))
  return fail('COMPOSITION_DRAFT_INPUT_INVALID');
 const obligations=new Map();
 for(const o of scopes){
  const id=String(o?.obligationId||''),hours=Number(o?.requiredHours),minutes=Math.round(hours*60);
  if(!id||obligations.has(id)||!Number.isSafeInteger(minutes)||minutes<=0||Math.abs(hours*60-minutes)>0.000001)
   return fail('COMPOSITION_DRAFT_SCOPE_INVALID');
  obligations.set(id,{obligationId:id,scopeCode:String(o.scopeCode||''),requiredMinutes:minutes});
 }
 const durations=new Map(),seenBlock=new Set();
 for(const b of blocks){
  const date=String(b?.date||''),start=String(b?.start||''),end=String(b?.end||'');
  const m=t=>{const v=/^([01]\\d|2[0-3]):(00|15|30|45)$/.exec(t);return v?Number(v[1])*60+Number(v[2]):NaN};
  const from=m(start),to=m(end),key=date+'|'+start+'|'+end;
  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)||!Number.isFinite(from)||!Number.isFinite(to)||to<=from||seenBlock.has(key))
   return fail('COMPOSITION_DRAFT_BLOCK_INVALID');
  seenBlock.add(key);durations.set(key,to-from);
 }
 const required=[...obligations.values()].reduce((n,x)=>n+x.requiredMinutes,0);
 const available=[...durations.values()].reduce((n,x)=>n+x,0);
 let result=[];
 if(allocations===null){
  const remaining=new Map([...obligations].map(([id,o])=>[id,o.requiredMinutes]));
  for(const [blockId,duration] of durations){
   let open=duration;
   for(const [obligationId] of obligations){
    const take=Math.min(open,remaining.get(obligationId));
    if(take>0){result.push({blockId,obligationId,minutes:take});remaining.set(obligationId,remaining.get(obligationId)-take);open-=take;}
    if(!open)break;
   }
  }
 }else{
  if(!Array.isArray(allocations))return fail('COMPOSITION_DRAFT_ALLOCATION_INVALID');
  result=allocations.map(a=>({blockId:String(a?.blockId||''),obligationId:String(a?.obligationId||''),minutes:Number(a?.minutes)}));
 }
 const byScope=new Map([...obligations].map(([id])=>[id,0])),byBlock=new Map([...durations].map(([id])=>[id,0])),pairs=new Set();
 for(const a of result){
  const key=a.blockId+'|'+a.obligationId;
  if(!obligations.has(a.obligationId)||!durations.has(a.blockId)||pairs.has(key)||!Number.isSafeInteger(a.minutes)||a.minutes<=0||a.minutes%15)
   return fail('COMPOSITION_DRAFT_ALLOCATION_INVALID');
  pairs.add(key);byScope.set(a.obligationId,byScope.get(a.obligationId)+a.minutes);
  byBlock.set(a.blockId,byBlock.get(a.blockId)+a.minutes);
 }
 const rowScopes=[...obligations.values()].map(x=>({...x,plannedMinutes:byScope.get(x.obligationId),
  remainingMinutes:x.requiredMinutes-byScope.get(x.obligationId)}));
 const rowBlocks=[...durations].map(([blockId,duration])=>({blockId,durationMinutes:duration,
  allocatedMinutes:byBlock.get(blockId),remainingMinutes:duration-byBlock.get(blockId)}));
 const excess=rowScopes.some(x=>x.remainingMinutes<0)||rowBlocks.some(x=>x.remainingMinutes<0);
 const complete=available===required&&rowScopes.every(x=>x.remainingMinutes===0)&&rowBlocks.every(x=>x.remainingMinutes===0);
 return {ok:!excess&&complete,reason:excess?'COMPOSITION_DRAFT_ALLOCATION_EXCEEDS_CAPACITY':
  complete?'READY':'COMPOSITION_DRAFT_HOURS_REMAINING',
  totalRequiredMinutes:required,totalPlannedMinutes:available,scopes:rowScopes,blocks:rowBlocks,allocations:result};
}
