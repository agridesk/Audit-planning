/** Issue #87: pre-transaction multi-visit lease and qualification guard.
 * Reuses the existing canonical auditor roster and Firestore Availability
 * lease service. No Audit planning, Model C, notification or Firestore audit
 * mutation is performed by this module.
 */
import {verifyCompositionAuditorQualifications20} from './visit-composition-qualification-20.mjs';
const str=x=>String(x??'').trim();
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
export function createCompositionCapacityGate20({availabilityService,hardGate,roster,canonicalReader}={}){
 if(typeof availabilityService?.acquirePlanningLease!=='function'||
    typeof availabilityService?.releasePlanningLease!=='function'||
    typeof availabilityService?.markPlanningLeaseUncertain!=='function'||
    typeof hardGate!=='function'||typeof roster!=='function'||
    typeof canonicalReader?.readQualifications!=='function')
  fail('COMPOSITION_CAPACITY_DEPENDENCIES_INVALID');
 async function acquire({actor,command,entities}={}){
  if(actor?.role!=='manager'||!str(actor.auditorId)||
     !['TOGETHER','SEPARATELY'].includes(command?.mode)||
     !Array.isArray(entities)||!entities.length||
     entities.some(x=>!str(x?.auditId)||!str(x.auditorId)||!Array.isArray(x.blocks)||!x.blocks.length))
   fail('COMPOSITION_CAPACITY_INPUT_INVALID');
  const directory=await canonicalReader.readQualifications();
  const rosterRows=await roster();
  if(!Array.isArray(rosterRows)||!rosterRows.length)
   fail('COMPOSITION_CAPACITY_ROSTER_REQUIRED');
  const pending=[];
  const leaseActor={role:'manager',id:actor.auditorId};
  const markUncertain=async(reason)=>{
   const failures=[];
   for(let i=pending.length-1;i>=0;i--){
    const lease=pending[i];
    try{
      await availabilityService.markPlanningLeaseUncertain({...lease,reason});
      pending.splice(i,1);
    }catch(e){failures.push(e);}
   }
   if(failures.length)fail('COMPOSITION_CAPACITY_UNCERTAIN_RECOVERY_REQUIRED');
  };
  const release=async()=>{
   while(pending.length){
    const lease=pending.at(-1);
    await availabilityService.releasePlanningLease(lease);
    pending.pop();
   }
  };
  try{
   for(const entity of entities.slice().sort((a,b)=>a.auditId.localeCompare(b.auditId))){
    const candidates=rosterRows.filter(row=>row.role==='auditor'&&row.active!==false&&
      row.auditorId===entity.auditorId&&str(row.email));
    if(candidates.length!==1)fail('COMPOSITION_CAPACITY_AUDITOR_NOT_IN_ROSTER');
    const scopes=command.mode==='TOGETHER'
      ?[...new Set(command.obligations.map(o=>o.scopeCode))]
      :[command.obligations.find(o=>o.obligationId===entity.nextSnapshot?.obligationId)?.scopeCode];
    if(scopes.some(x=>!str(x)))fail('COMPOSITION_CAPACITY_SCOPE_MISSING');
    const result=verifyCompositionAuditorQualifications20({
      auditorUid:entity.auditorId,scopeCodes:scopes,
      auditorRows:directory.auditorRows,qualificationRows:directory.qualificationRows
    });
    if(result.auditorEmail!==str(candidates[0].email).toLowerCase())
      fail('COMPOSITION_CAPACITY_AUDITOR_IDENTITY_MISMATCH');
    const lease=await availabilityService.acquirePlanningLease({
      actor:leaseActor,auditorId:entity.auditorId,auditId:entity.auditId,
      auditorEmail:result.auditorEmail,plannedBlocks:entity.blocks
    });
    if(!str(lease?.token)||!lease.document)
      fail('COMPOSITION_CAPACITY_LEASE_INVALID');
    const ref={actor:leaseActor,auditorId:entity.auditorId,token:lease.token};
    pending.push(ref);
    hardGate({document:lease.document,blocks:entity.blocks});
  }
  return Object.freeze({release,uncertain:markUncertain,leaseCount:pending.length});
  }catch(e){
   try{await release();}catch{
    await markUncertain('COMPOSITION_CAPACITY_PREFLIGHT_RELEASE_UNKNOWN');
   }
   throw e;
  }
 }
 return Object.freeze({acquire});
}
