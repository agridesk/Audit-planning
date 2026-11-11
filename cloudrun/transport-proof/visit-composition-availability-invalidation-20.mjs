/** Issue #87: read-model-only targeted Availability invalidation plan.
 * Canonical committed Planning JSON owns occupancy; NEVER write an Availability
 * row here. This pure helper derives only affected auditor/date cache keys.
 * Canonical contract: AMS My Availability 2.0 §§13, 17, 19.
 */
const str=x=>String(x??'').trim();
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const dateOk=x=>{
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(str(x));
 if(!m)return false;
 const y=+m[1],month=+m[2],d=+m[3];
 const v=new Date(Date.UTC(y,month-1,d));
 return v.getUTCFullYear()===y&&v.getUTCMonth()===month-1&&v.getUTCDate()===d;
};
export function prepareCompositionAvailabilityInvalidation20({command,entities,operationId}={}){
 if(!str(operationId)||!str(command?.auditId)||
    !['TOGETHER','SEPARATELY'].includes(command?.mode)||
    !Array.isArray(entities)||!entities.length)
  fail('COMPOSITION_INVALIDATION_CANONICAL_INPUT_REQUIRED');
 const grouped=new Map(),seen=new Set();
 for(const entity of entities){
  const auditorUid=str(entity?.auditorId),auditId=str(entity?.auditId);
  if(!auditorUid||!auditId||seen.has(auditId)||
     !Array.isArray(entity.blocks)||!entity.blocks.length)
   fail('COMPOSITION_INVALIDATION_VISIT_IDENTITY_INVALID');
  seen.add(auditId);
  if(!grouped.has(auditorUid))grouped.set(auditorUid,{auditorUid,auditIds:new Set(),dates:new Set()});
  const group=grouped.get(auditorUid);
  group.auditIds.add(auditId);
  for(const block of entity.blocks){
   if(!dateOk(block?.date))fail('COMPOSITION_INVALIDATION_DATE_INVALID');
   group.dates.add(str(block.date));
  }
 }
 const expected=new Set(command.mode==='TOGETHER'
  ?[command.auditId]:command.visits?.map(v=>str(v.auditId))||[]);
 if(expected.size!==seen.size||[...seen].some(x=>!expected.has(x)))
  fail('COMPOSITION_INVALIDATION_VISIT_SET_MISMATCH');
 const targets=[...grouped.values()].sort((a,b)=>a.auditorUid.localeCompare(b.auditorUid))
  .map(group=>{
   if(group.dates.size>90)fail('COMPOSITION_INVALIDATION_RANGE_TOO_BROAD');
   return Object.freeze({
    auditorUid:group.auditorUid,
    auditIds:[...group.auditIds].sort(),
    dates:[...group.dates].sort()
   });
  });
 return Object.freeze({
  operationId:str(operationId),scope:'RESOLVED_AVAILABILITY_CACHE',
  reason:'CANONICAL_COMMITTED_PLANNING_CHANGED',
  targets,readModelOnly:true,writeEnabled:false,
  affectedAuditors:targets.length
 });
}
