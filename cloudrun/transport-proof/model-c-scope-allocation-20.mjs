const str=x=>String(x??'').trim();
function minutes(s){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(str(s)))throw Error('SCOPE_TIME_INVALID');const [h,m]=s.split(':').map(Number);return h*60+m}
export function validateScopeVisitAllocation20({auditId,composition,obligations,blocks,allocations}){
 if(!str(auditId)||!['TOGETHER','SEPARATE'].includes(composition))throw Error('SCOPE_COMPOSITION_INVALID');
 if(!Array.isArray(obligations)||obligations.length<2||!Array.isArray(blocks)||!Array.isArray(allocations))throw Error('SCOPE_ALLOCATION_INPUT_INVALID');
 const ob=new Map();for(const o of obligations){const id=str(o.obligationId);if(!id||ob.has(id)||str(o.auditId)!==str(auditId)||str(o.linkState).toUpperCase()!=='ACTIVE')throw Error('SCOPE_OBLIGATION_INVALID');const required=Number(o.requiredMinutes);if(!Number.isInteger(required)||required<0)throw Error('SCOPE_REQUIRED_MINUTES_INVALID');ob.set(id,{...o,requiredMinutes:required})}
 const block=new Map();for(const b of blocks){const id=str(b.blockId);if(!id||block.has(id)||!str(b.date))throw Error('SCOPE_BLOCK_INVALID');const from=minutes(b.start),to=minutes(b.end);if(to<=from)throw Error('SCOPE_BLOCK_DURATION_INVALID');block.set(id,{...b,duration:to-from})}
 const allocated=new Map([...ob.keys()].map(k=>[k,0])),used=new Map([...block.keys()].map(k=>[k,0])),seen=new Set();
 for(const a of allocations){const bid=str(a.blockId),oid=str(a.obligationId),m=Number(a.minutes),k=bid+'|'+oid;if(!block.has(bid)||!ob.has(oid)||seen.has(k)||!Number.isInteger(m)||m<=0)throw Error('SCOPE_ALLOCATION_INVALID');seen.add(k);allocated.set(oid,allocated.get(oid)+m);used.set(bid,used.get(bid)+m)}
 for(const [id,n] of used)if(n>block.get(id).duration)throw Error('SCOPE_DOUBLE_COUNTED_BLOCK');
 const scopes=[...ob.values()].map(o=>({obligationId:o.obligationId,scopeCode:o.scopeCode,requiredMinutes:o.requiredMinutes,plannedMinutes:allocated.get(o.obligationId),remainingMinutes:Math.max(0,o.requiredMinutes-allocated.get(o.obligationId))}));
 if(composition==='SEPARATE')return{auditId,composition,scopes,validForCommit:false,requiresIdentityMaterialization:true,reason:'SEPARATE_REQUIRES_ATOMIC_VISIT_IDENTITY_MIGRATION'};
 return{auditId,composition,scopes,blocks:[...used].map(([blockId,plannedMinutes])=>({blockId,plannedMinutes,unallocatedMinutes:block.get(blockId).duration-plannedMinutes})),validForCommit:false,requiresCanonicalPersistence:true,reason:'ALLOCATION_VALIDATED_BUT_CANONICAL_COMMIT_NOT_ENABLED'};
}
