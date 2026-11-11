/** Issue #87: canonical planned-by-manager notification intent for
 * multi-scope Together/Separate. Pure: verifies active Notification_Config,
 * expected recipients, Visit identity and R4-compatible queue payload.
 * No sending, no append and no side effects.
 */
import {createHash} from 'node:crypto';
const str=x=>String(x??'').trim();
const norm=x=>str(x).toUpperCase().replace(/[\s_-]+/g,'_');
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const idx=(headers,...names)=>headers.findIndex(h=>names.includes(norm(h)));
const email=x=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(str(x));
export function prepareCompositionManagerNotifications20({
 command,visits,company,actorEmail,notificationConfigRows,now
}={}){
 if(command?.canCommit!==false||!['TOGETHER','SEPARATELY'].includes(command?.mode)||
    !Array.isArray(visits)||!visits.length||!str(company)||!email(actorEmail)||
    !Array.isArray(notificationConfigRows)||notificationConfigRows.length<2||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str(now)))
  fail('COMPOSITION_NOTIFICATIONS_CANONICAL_INPUT_REQUIRED');
 const h=notificationConfigRows[0];
 const event=idx(h,'EVENT_KEY'),active=idx(h,'ACTIVE'),send=idx(h,'SEND_EMAIL'),
  family=idx(h,'TEMPLATE_FAMILY'),template=idx(h,'TEMPLATE_KEY_DEFAULT');
 if([event,active,send,family,template].some(i=>i<0))
  fail('COMPOSITION_NOTIFICATIONS_CONFIG_SCHEMA_INVALID');
 const rules=notificationConfigRows.slice(1).filter(row=>str(row[event])==='AUDIT_PLANNED_BY_MANAGER');
 if(rules.length!==1||norm(rules[0][active])!=='YES'||
    norm(rules[0][send])!=='YES'||str(rules[0][family])!=='RICH_OPERATIONAL'||
    str(rules[0][template])!=='AUDIT_PLANNED_BY_MANAGER')
  fail('COMPOSITION_NOTIFICATIONS_EVENT_NOT_CANONICAL_ACTIVE');
 const expected=new Set(command.mode==='TOGETHER'?[command.auditId]:command.visits.map(v=>v.auditId));
 if(expected.size!==visits.length||new Set(visits.map(v=>v.auditId)).size!==visits.length||
    visits.some(v=>!expected.has(v.auditId)))
  fail('COMPOSITION_NOTIFICATIONS_VISIT_IDS_MISMATCH');
 const rows=[];
 for(const visit of visits){
  if(!email(visit.auditorEmail)||!str(visit.auditorName)||!str(visit.planningJson))
   fail('COMPOSITION_NOTIFICATIONS_AUDITOR_MISSING');
  let plan;
  try{plan=JSON.parse(visit.planningJson);}catch{fail('COMPOSITION_NOTIFICATIONS_PLAN_JSON_INVALID');}
  if(!Array.isArray(plan?.blocks)||!plan.blocks.length||
     plan.auditorEmail!==str(visit.auditorEmail).toLowerCase()||
     plan.auditorName!==visit.auditorName||
     !Number.isFinite(Number(plan.totalPlannedHours))||Number(plan.totalPlannedHours)<=0)
   fail('COMPOSITION_NOTIFICATIONS_PLAN_PAYLOAD_MISMATCH');
  const obligation=command.mode==='SEPARATELY'
   ?command.obligations.find(o=>o.obligationId===visit.obligationId)
   :null;
  if(command.mode==='SEPARATELY'&&(!obligation||Number(plan.formalHours)*60!==obligation.requiredMinutes)||
     command.mode==='TOGETHER'&&Number(plan.formalHours)*60!==command.totalMinutes)
   fail('COMPOSITION_NOTIFICATIONS_SCOPE_HOURS_MISMATCH');
  const recipient=str(visit.auditorEmail).toLowerCase();
  const plannedEvent='AUDIT_PLANNED_BY_MANAGER';
  const subject='Audit planned by manager – '+company+' – '+visit.auditId;
  const body=['Audit planned by manager','Company: '+company,'Audit ID: '+visit.auditId,
    'Auditor: '+visit.auditorName+' <'+recipient+'>',
    'Planning: '+plan.blocks.map(x=>x.date+' '+x.start+'-'+x.end).join('; '),
    'Total hours: '+plan.totalPlannedHours].join('\n');
  const scopes=command.mode==='TOGETHER'
   ?command.obligations.map(o=>o.scopeCode):[obligation.scopeCode];
  const payload={eventType:plannedEvent,eventFamily:'RICH_OPERATIONAL',
   rendererProfile:'RICH_OPERATIONAL',deliveryProfile:'IMMEDIATE_RICH',
   company,companyUid:command.companyUid,auditId:visit.auditId,
   actor:str(actorEmail).toLowerCase(),actorRole:'MANAGER',
   recipientRole:'AUDITOR',recipientGroup:'AUDITOR',
   resultStatus:'Approved',displayStatus:'Pending acceptance',
   plannedDates:[...new Set(plan.blocks.map(x=>x.date))],
   plannedHours:Number(plan.totalPlannedHours),blocks:plan.blocks,scopes,
   auditorEmail:recipient,auditorName:visit.auditorName,planningJson:visit.planningJson,
   config:{active:true,sendEmail:true,logOnly:false,
    consolidate:false,bufferMinutes:0,digestGroup:'RICH_OPERATIONAL',
    templateFamily:'RICH_OPERATIONAL',templateKeyDefault:plannedEvent,
    fromEmail:'planning@agriqa.es',fromName:'Agri Quality Assurance – Audit Planning',
    replyTo:'',includeComment:true,requireReason:false}};
  // R4 planning emits an AUDIT_TRAIL record as well as the planned-mail
  // row; both are derived from the same immutable visit snapshot.
  const trailPayload={
   type:'LIFECYCLE_STATUS_CHANGED',auditId:visit.auditId,
   auditNumber:'',company,actorEmail:str(actorEmail).toLowerCase(),
   actorRole:'MANAGER',beforeStatus:'Pending Planning',afterStatus:'Approved',
   reason:'',hours:null,source:'CLOUD_RUN_CANONICAL_COMPOSITION_MANAGER_PLAN',
   timestamp:now,action:'PLAN'
  };
  const trailHash=createHash('md5').update(
   'LIFECYCLE_STATUS_CHANGED|'+visit.auditId+'|'+now+'|Approved'
  ).digest('hex');
  rows.push([str(now).slice(0,16),'AUDIT_TRAIL','LIFECYCLE_STATUS_CHANGED','',
   visit.auditId,company,'[TRAIL] LIFECYCLE_STATUS_CHANGED :: '+visit.auditId,
   JSON.stringify(trailPayload),0,'',trailHash,'',JSON.stringify({payload:trailPayload})]);
  const hash=createHash('md5').update(recipient+'|'+plannedEvent+'|'+visit.auditId+'|'+visit.planningJson).digest('hex');
  rows.push([str(now).slice(0,16),'PENDING',plannedEvent,recipient,visit.auditId,
   company,subject,body,0,'',hash,'',JSON.stringify({payload})]);
 }
 return Object.freeze({eventKey:'AUDIT_PLANNED_BY_MANAGER',queueRows:rows,
  appendIntents:[{range:'Notification Queue!A:M',values:rows}],
  canCommit:false,requiresDurableOutbox:true});
}
