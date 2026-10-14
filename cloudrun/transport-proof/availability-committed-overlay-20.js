/** AMS Availability 2.0: read-only canonical committed-audit overlay.
 * A caller MUST provide authoritative, auditor-scoped audit slots. Fail closed on invalid data.
 * No status is inferred from availability records.
 */
const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const clock=(s,end=false)=>typeof s==='string'&&(/^([01]\d|2[0-3]):[0-5]\d$/.test(s)||(end&&s==='24:00'));
export function committedBlocksFromCanonicalSlots({auditorId,slots}={}){
 if(typeof auditorId!=='string'||!auditorId.trim()||!Array.isArray(slots))throw Error('COMMITTED_SOURCE_INVALID');
 const result=[],ids=new Set();
 for(const slot of slots){
  if(!slot||typeof slot!=='object'||Array.isArray(slot))throw Error('COMMITTED_SOURCE_INVALID');
  if(typeof slot.auditorId!=='string'||!slot.auditorId.trim()||typeof slot.auditId!=='string'||!slot.auditId.trim()||!date(slot.date)||!clock(slot.start)||!clock(slot.end,true)||slot.start>=slot.end)throw Error('COMMITTED_SOURCE_INVALID');
  if(slot.auditorId!==auditorId)continue;
  if(!['COMMITTED','PROVISIONAL'].includes(slot.state))throw Error('COMMITTED_SOURCE_INVALID');
  const id=String(slot.auditId)+'|'+slot.date+'|'+slot.start+'|'+slot.end;
  if(ids.has(id))throw Error('COMMITTED_SOURCE_DUPLICATE');ids.add(id);
  result.push({id:'audit:'+id,date:slot.date,wholeDay:false,start:slot.start,end:slot.end,state:slot.state});
 }
 return result;
}
export function withCommittedOverlay(document,canonicalBlocks){
 if(!document||!Array.isArray(document.blocks)||!Array.isArray(canonicalBlocks))throw Error('COMMITTED_SOURCE_INVALID');
 if(canonicalBlocks.some(x=>!['COMMITTED','PROVISIONAL'].includes(x.state)))throw Error('COMMITTED_SOURCE_INVALID');
 return {...document,blocks:[...document.blocks.filter(x=>!['COMMITTED','PROVISIONAL'].includes(x.state)),...canonicalBlocks]};
}