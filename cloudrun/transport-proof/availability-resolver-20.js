// AMS Availability 2.0 — pure interval resolver. DEV source only.
// Does not persist data, materialize days, or write committed planning.
// All intervals are half-open [start,end). Times expressed as minutes since midnight.
export const AV20_STATES=Object.freeze({FREE:'FREE',SOFT:'SOFT',HARD:'HARD',PROVISIONAL:'PROVISIONAL',COMMITTED:'COMMITTED'});
const rank={FREE:0,SOFT:1,PROVISIONAL:2,HARD:3,COMMITTED:4};
function assertMinute(n){if(!Number.isInteger(n)||n<0||n>1440)throw Error('AV20_INVALID_MINUTE');return n;}
export function av20ValidateInterval(x){
  if(!x||!Object.prototype.hasOwnProperty.call(rank,x.state))throw Error('AV20_INVALID_STATE');
  const start=assertMinute(x.start),end=assertMinute(x.end);
  if(start>=end)throw Error('AV20_INVALID_INTERVAL');
  return {...x,start,end};
}
export function av20ResolveDay(blocks=[]){
  const source=blocks.map(av20ValidateInterval);
  const cuts=[0,1440,...source.flatMap(b=>[b.start,b.end])].sort((a,b)=>a-b);
  const edges=[...new Set(cuts)],out=[];
  for(let i=0;i<edges.length-1;i++){
    const start=edges[i],end=edges[i+1];
    const covering=source.filter(b=>b.start<end&&start<b.end);
    const winner=covering.reduce((a,b)=>rank[b.state]>rank[a.state]?b:a,{state:'FREE'});
    const state=winner.state;
    const conflicts=covering.some(b=>b.state==='HARD')&&covering.some(b=>b.state==='PROVISIONAL');
    const last=out[out.length-1];
    if(last&&last.end===start&&last.state===state&&last.provisionalConflict===conflicts)last.end=end;
    else out.push({start,end,state,provisionalConflict:conflicts});
  }
  return out;
}
export function av20Overlaps(a,b){return a.start<b.end&&b.start<a.end;}
export function av20CanPlan(blocks,start,end){
  av20ValidateInterval({state:'FREE',start,end});
  const resolved=av20ResolveDay(blocks);
  const blocked=resolved.filter(b=>av20Overlaps(b,{start,end})&&(b.state==='HARD'||b.state==='COMMITTED'||b.state==='PROVISIONAL'));
  return {allowed:blocked.length===0,blocked};
}
export function av20ApplyAvailableOverride(blocks=[],start=0,end=1440){
  av20ValidateInterval({state:'FREE',start,end});
  // An Available override suppresses recurring SOFT only; preserves all other states.
  const kept=[];
  for(const raw of blocks){
    const b=av20ValidateInterval(raw);
    if(b.state!=='SOFT'||!av20Overlaps(b,{start,end})){kept.push(b);continue;}
    if(b.start<start)kept.push({...b,end:start});
    if(b.end>end)kept.push({...b,start:end});
  }
  return kept;
}
