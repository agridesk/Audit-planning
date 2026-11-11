/** Issue #87: full manager-planned Together projection from canonical
 * Audit planning preimage, scope allocations and qualified auditor identity.
 * No writes, provisional reservations or Visit identity changes.
 */
import {deriveCompositionSourceRevision20} from './visit-composition-source-revision-20.mjs';
const str=x=>String(x??'').trim();
const norm=x=>str(x).toUpperCase().replace(/[\s_-]+/g,'_');
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const idx=(h,...names)=>h.findIndex(x=>names.includes(norm(x)));
const time=x=>{if(!/^\d{2}:\d{2}$/.test(str(x)))fail('COMPOSITION_TOGETHER_TIME_INVALID');const [h,m]=x.split(':').map(Number);if(h>23||m>59)fail('COMPOSITION_TOGETHER_TIME_INVALID');return h*60+m;};
const letters=n=>{let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
export function prepareScheduledCompositionTogetherRow20({command,planningValues,assignment,now}={}){
 if(command?.mode!=='TOGETHER'||command?.canCommit!==false||
    !Array.isArray(planningValues)||planningValues.length<2||
    !Array.isArray(planningValues[0])||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str(now)))
  fail('COMPOSITION_TOGETHER_CANONICAL_SOURCE_REQUIRED');
 const h=planningValues[0],id=idx(h,'AUDIT_ID'),uid=idx(h,'COMPANY_UID'),
  status=idx(h,'STATUS'),assigned=idx(h,'ASSIGNED_TO'),
  auditorUid=idx(h,'AUDITOR_UID'),planning=idx(h,'PLANNING_JSON'),
  datePlanned=idx(h,'DATE_PLANNED'),dateApproved=idx(h,'DATE_APPROVED'),
  since=idx(h,'STATUS_SINCE'),decision=idx(h,'LAST_MANAGER_DECISION'),
  timestamp=idx(h,'LAST_DECISION_TIMESTAMP'),
  totalHours=idx(h,'TOTAL_AUDIT_TIME_IN_HOURS'),hoursPlanned=idx(h,'HOURS_PLANNED','PLANNED_HOURS');
 if([id,uid,status,assigned,auditorUid,planning,datePlanned,dateApproved,since,decision,timestamp,totalHours].some(i=>i<0))
  fail('COMPOSITION_TOGETHER_LIFECYCLE_SCHEMA_MISSING');
 if(str(assignment?.auditorUid).length<1||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(str(assignment?.auditorEmail))||
    !str(assignment?.auditorName))
  fail('COMPOSITION_TOGETHER_AUDITOR_REQUIRED');
 const matches=planningValues.slice(1).map((row,i)=>({row,number:i+2}))
  .filter(x=>str(x.row[id])===command.auditId);
 if(matches.length!==1)fail('COMPOSITION_TOGETHER_AUDIT_NOT_UNIQUE');
 const source=matches[0],before=Array.from({length:h.length},(_,i)=>source.row[i]??'');
 if(str(before[uid])!==command.companyUid||norm(before[status])!=='PENDING_PLANNING')
  fail('COMPOSITION_TOGETHER_SOURCE_STATE_INVALID');
 if([assigned,auditorUid,planning,datePlanned,dateApproved].some(i=>str(before[i])))
  fail('COMPOSITION_TOGETHER_EXISTING_PLAN_REQUIRES_MIGRATION');
 const formal=Number(str(before[totalHours]).replace(',','.'));
 if(!Number.isFinite(formal)||formal<=0||Math.round(formal*60)!==command.totalMinutes)
  fail('COMPOSITION_TOGETHER_FORMAL_HOURS_MISMATCH');
 let planned=0,offsite=0;
 for(const block of command.blocks){
  const n=time(block.end)-time(block.start);if(n<=0)fail('COMPOSITION_TOGETHER_TIME_INVALID');
  planned+=n;
  const t=norm(block.executionType||block.workType||'ONSITE');
  if(t==='OFFSITE')offsite+=n;else if(t!=='ONSITE')fail('COMPOSITION_TOGETHER_EXECUTION_INVALID');
 }
 if(planned!==command.totalMinutes)fail('COMPOSITION_TOGETHER_TOTAL_MINUTES_MISMATCH');
 const maxOffsiteHours=Number(assignment.maxOffsiteHours??0);
 if(!Number.isFinite(maxOffsiteHours)||maxOffsiteHours<0||
    offsite>0&&(!assignment.offsitePolicyVerified||offsite>maxOffsiteHours*60))
  fail('COMPOSITION_TOGETHER_OFFSITE_POLICY_REQUIRED');
 const email=str(assignment.auditorEmail).toLowerCase();
 const planningJson=JSON.stringify({
  blocks:command.blocks,formalHours:command.totalMinutes/60,
  totalPlannedHours:planned/60,offsiteHours:offsite/60,maxOffsiteHours,
  auditorEmail:email,auditorName:str(assignment.auditorName)
 });
 const after=[...before];
 after[status]='Approved';after[assigned]=email;after[auditorUid]=str(assignment.auditorUid);
 after[planning]=planningJson;after[datePlanned]=command.blocks[0].date;
 after[dateApproved]=str(now).slice(0,10);after[since]=str(now);
 after[decision]='PLAN';after[timestamp]=str(now);
 if(hoursPlanned>=0)after[hoursPlanned]=planned/60;
 const range='Audit planning!A'+source.number+':'+letters(h.length)+source.number;
 const sourceRevision=deriveCompositionSourceRevision20({
  auditId:command.auditId,planningRows:[h,after]
 }).sourceRevision;
 return Object.freeze({
  auditId:command.auditId,mode:'TOGETHER',status:'Approved',
  auditorUid:str(assignment.auditorUid),assignedTo:email,planningJson,sourceRevision,
  projectionWrites:[{range,values:[after]}],
  projectionPreconditions:[{range,before}],
  canCommit:false,requiresCanonicalRoster:true,requiresCapacityLease:true
 });
}
