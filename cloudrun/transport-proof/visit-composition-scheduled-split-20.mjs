/** Issue #87: scheduled Audit planning rows for canonical Separate Visits.
 * Wraps the checked Model C scope split and adds manager PLANNED lifecycle
 * fields, independently from client-written row contents. No side effects.
 * Every visit is independently audited; no DB or Sheets operations here.
 */
import {prepareModelCPlanningVisitSplitRows20} from './visit-model-c-planning-split-rows-20.mjs';
const str=x=>String(x??'').trim();
const norm=x=>str(x).toUpperCase().replace(/[\s_-]+/g,'_');
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const idx=(h,...keys)=>h.findIndex(x=>keys.includes(norm(x)));
const minute=x=>{if(!/^\d{2}:\d{2}$/.test(str(x)))fail('COMPOSITION_SCHEDULED_TIME_INVALID');const [h,m]=x.split(':').map(Number);if(h>23||m>59)fail('COMPOSITION_SCHEDULED_TIME_INVALID');return h*60+m;};
const validEmail=x=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(str(x));
export function prepareScheduledCompositionSplitRows20({
 command,planningValues,configScopeValues,newRowNumbers,assignments,now
}={}){
 const base=prepareModelCPlanningVisitSplitRows20({
  command,planningValues,configScopeValues,newRowNumbers
 });
 if(!Array.isArray(assignments)||assignments.length!==command.visits.length||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str(now)))
  fail('COMPOSITION_SCHEDULED_ASSIGNMENTS_REQUIRED');
 const h=planningValues[0];
 const status=idx(h,'STATUS'),assigned=idx(h,'ASSIGNED_TO'),
  auditorUid=idx(h,'AUDITOR_UID'),planning=idx(h,'PLANNING_JSON'),
  datePlanned=idx(h,'DATE_PLANNED'),dateApproved=idx(h,'DATE_APPROVED'),
  since=idx(h,'STATUS_SINCE'),decision=idx(h,'LAST_MANAGER_DECISION'),
  timestamp=idx(h,'LAST_DECISION_TIMESTAMP'),hoursPlanned=idx(h,'HOURS_PLANNED','PLANNED_HOURS');
 if([status,assigned,auditorUid,planning,datePlanned,dateApproved,since,decision,timestamp].some(i=>i<0))
  fail('COMPOSITION_SCHEDULED_LIFECYCLE_SCHEMA_REQUIRED');
 const map=new Map();
 for(const a of assignments){
  const id=str(a?.auditId),obligationId=str(a?.obligationId);
  if(!id||!obligationId||map.has(id)||!str(a?.auditorUid)||
     !validEmail(a?.auditorEmail)||!str(a?.auditorName))
   fail('COMPOSITION_SCHEDULED_AUDITOR_ASSIGNMENT_INVALID');
  map.set(id,a);
 }
 const projected=base.projectionWrites.map((write,i)=>{
  const visit=command.visits[i],a=map.get(visit.auditId);
  if(!a||str(a.obligationId)!==visit.obligationId)
   fail('COMPOSITION_SCHEDULED_VISIT_ASSIGNMENT_MISMATCH');
  const row=[...write.values[0]];
  const blocks=visit.blocks.map(b=>({...b}));
  let offsiteMinutes=0,plannedMinutes=0;
  for(const b of blocks){
   const length=minute(b.end)-minute(b.start);
   if(length<=0)fail('COMPOSITION_SCHEDULED_TIME_INVALID');
   plannedMinutes+=length;
   const type=norm(b.executionType||b.workType||'ONSITE');
   if(type==='OFFSITE')offsiteMinutes+=length;
   else if(type!=='ONSITE')fail('COMPOSITION_SCHEDULED_EXECUTION_TYPE_UNKNOWN');
  }
  if(plannedMinutes!==visit.requiredMinutes)
   fail('COMPOSITION_SCHEDULED_FORMAL_HOURS_MISMATCH');
  const maxOffsiteHours=Number(a.maxOffsiteHours??0);
  if(!Number.isFinite(maxOffsiteHours)||maxOffsiteHours<0||
     offsiteMinutes>0&&(!a.offsitePolicyVerified||offsiteMinutes>maxOffsiteHours*60))
   fail('COMPOSITION_SCHEDULED_OFFSITE_POLICY_REQUIRED');
  const email=str(a.auditorEmail).toLowerCase();
  const planningJson=JSON.stringify({
   blocks,formalHours:visit.requiredMinutes/60,
   totalPlannedHours:plannedMinutes/60,
   offsiteHours:offsiteMinutes/60,maxOffsiteHours,
   auditorEmail:email,auditorName:str(a.auditorName)
  });
  row[status]='Approved';row[assigned]=email;row[auditorUid]=str(a.auditorUid);
  row[planning]=planningJson;row[datePlanned]=blocks[0].date;
  row[dateApproved]=str(now).slice(0,10);row[since]=str(now);
  row[decision]='PLAN';row[timestamp]=str(now);
  if(hoursPlanned>=0)row[hoursPlanned]=visit.requiredMinutes/60;
  return {range:write.range,values:[row]};
 });
 return Object.freeze({
  ...base,projectionWrites:projected,
  visits:command.visits.map((v,i)=>({
   auditId:v.auditId,obligationId:v.obligationId,
   auditorUid:str(assignments.find(a=>a.auditId===v.auditId).auditorUid),
   status:'Approved',planningJson:projected[i].values[0][planning]
  })),
  canCommit:false,requiresCanonicalRoster:true,
  requiresCapacityLeases:true,requiresPreimageVerification:true
 });
}
