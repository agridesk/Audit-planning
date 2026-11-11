/** Issue #87: pre-transaction multi-visit lease and qualification guard.
 * Reuses the existing canonical auditor roster and Firestore Availability
 * lease service. No Audit planning, Model C, notification or Firestore audit
 * mutation is performed by this module.
 */
import {verifyCompositionAuditorQualifications20} from './visit-composition-qualification-20.mjs';
import {verifyFreshResolvedCompositionAvailability20} from './visit-composition-resolved-availability-20.mjs';
const str=x=>String(x??'').trim();
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const validDate=x=>{
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(str(x));
 if(!m)return false;
 const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
 const parsed=new Date(Date.UTC(year,month-1,day));
 return parsed.getUTCFullYear()===year&&parsed.getUTCMonth()===month-1&&parsed.getUTCDate()===day;
};
const validTime=x=>{
 const m=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(str(x));
 return Boolean(m);
};
export function createCompositionCapacityGate20({availabilityService,hardGate,roster,canonicalReader,readResolvedAvailability}={}){
 if(typeof availabilityService?.acquirePlanningLease!=='function'||
    typeof availabilityService?.releasePlanningLease!=='function'||
    typeof availabilityService?.markPlanningLeaseUncertain!=='function'||
    typeof hardGate!=='function'||typeof roster!=='function'||
    typeof canonicalReader?.readQualifications!=='function'||
    typeof readResolvedAvailability!=='function')
  fail('COMPOSITION_CAPACITY_DEPENDENCIES_INVALID');
 async function acquire({actor,command,entities}={}){
  if(actor?.role!=='manager'||!str(actor.auditorId)||!str(command?.auditId)||
     !['TOGETHER','SEPARATELY'].includes(command?.mode)||
     !Array.isArray(entities)||!entities.length||
     entities.some(x=>!str(x?.auditId)||!str(x.auditorId)||!Array.isArray(x.blocks)||!x.blocks.length))
   fail('COMPOSITION_CAPACITY_INPUT_INVALID');
  const expectedVisits=command.mode==='TOGETHER'
   ?[{auditId:command.auditId,blocks:command.blocks}]
   :command.visits;
  if(!Array.isArray(expectedVisits)||expectedVisits.length!==entities.length||
     new Set(entities.map(e=>e.auditId)).size!==entities.length||
     expectedVisits.some(visit=>{
      const matches=entities.filter(e=>e.auditId===visit.auditId);
      if(matches.length!==1)return true;
      const entity=matches[0];
      return JSON.stringify(entity.blocks)!==JSON.stringify(visit.blocks)||
       (command.mode==='SEPARATELY'&&
        (str(entity.nextSnapshot?.obligationId)!==str(visit.obligationId)||
         !str(visit.obligationId)));
     }))
   fail('COMPOSITION_CAPACITY_VISIT_MEMBERSHIP_MISMATCH');
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
   // Availability stores exactly one active lease per auditor. Combine all
   // distinct Visits assigned to the same auditor under one source-audit lease,
   // keeping the per-Visit qualification checks independent.
   const auditorGroups=new Map();
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
    let group=auditorGroups.get(entity.auditorId);
    if(!group){
      group={auditorId:entity.auditorId,auditorEmail:result.auditorEmail,blocks:[]};
      auditorGroups.set(entity.auditorId,group);
    }else if(group.auditorEmail!==result.auditorEmail)
      fail('COMPOSITION_CAPACITY_AUDITOR_DIRECTORY_DRIFT');
    group.blocks.push(...entity.blocks.map(b=>({...b})));
   }
   const validatedGroups=[];
   for(const group of [...auditorGroups.values()].sort((a,b)=>a.auditorId.localeCompare(b.auditorId))){
    if(group.blocks.length>50)fail('COMPOSITION_CAPACITY_COMBINED_BLOCKS_LIMIT');
    const intervals=group.blocks.map(b=>{
      const date=str(b.date),start=str(b.start),end=str(b.end);
      if(!validDate(date)||!validTime(start)||!validTime(end)||start>=end)
        fail('COMPOSITION_CAPACITY_COMBINED_TIME_INVALID');
      return {date,start,end};
    });
    intervals.sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start));
    for(let i=1;i<intervals.length;i++)
      if(intervals[i].date===intervals[i-1].date&&intervals[i].start<intervals[i-1].end)
        fail('COMPOSITION_CAPACITY_SAME_AUDITOR_OVERLAP');
    validatedGroups.push(group);
   }
   // Save-time fresh canonical resolved Availability, not a cached month UI
   // response. Check all participants before acquiring the first lease.
   // The separate HARD gate below also catches any HARD obscured by a
   // higher-priority COMMITTED display state.
   let resolvedReadCount=0;
   for(const group of validatedGroups){
    const dates=[...new Set(group.blocks.map(b=>str(b.date)))].sort();
    for(const date of dates){
     const resolved=await readResolvedAvailability({
      actor:leaseActor,auditorId:group.auditorId,
      fromDate:date,toDate:date,fresh:true
     });
     verifyFreshResolvedCompositionAvailability20({
      resolved,auditorId:group.auditorId,date,
      blocks:group.blocks.filter(b=>str(b.date)===date)
     });
     resolvedReadCount++;
    }
   }
   // All Visit groups must be validated before any external lease is acquired.
   // Otherwise an invalid second group can create a short-lived first lease.
   for(const group of validatedGroups){
    const lease=await availabilityService.acquirePlanningLease({
      actor:leaseActor,auditorId:group.auditorId,auditId:command.auditId,
      auditorEmail:group.auditorEmail,plannedBlocks:group.blocks
    });
    if(!str(lease?.token)||!lease.document)
      fail('COMPOSITION_CAPACITY_LEASE_INVALID');
    const ref={actor:leaseActor,auditorId:group.auditorId,token:lease.token};
    pending.push(ref);
    hardGate({document:lease.document,blocks:group.blocks});
   }
   return Object.freeze({release,uncertain:markUncertain,
     leaseCount:pending.length,visitCount:entities.length,resolvedReadCount});
  }catch(e){
   try{await release();}catch{
    await markUncertain('COMPOSITION_CAPACITY_PREFLIGHT_RELEASE_UNKNOWN');
   }
   throw e;
  }
 }
 return Object.freeze({acquire});
}
