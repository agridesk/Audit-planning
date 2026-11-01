const clean=x=>String(x??'').trim();
export function previewEcasLifecycleIntent20(input){
 const action=clean(input?.action).toUpperCase(),auditId=clean(input?.auditId),reason=clean(input?.reason);
 if(!['CANCEL','REJECT'].includes(action))throw Error('ECAS_INTENT_ACTION_INVALID');
 if(!auditId)throw Error('ECAS_INTENT_AUDIT_REQUIRED');
 if(!reason)throw Error('ACTION_REASON_REQUIRED');
 const receipt=clean(input?.priorDeliveryReceipt),recipient=clean(input?.recipientEmail),schedule=input?.priorCommunicatedSchedule;
 const verified=input?.priorScheduleVerified===true;
 if(!receipt||!verified||!schedule)return{auditId,action,reason,eligible:false,decision:'NO_VERIFIED_PRIOR_ECAS_COMMUNICATION',queueAllowed:false};
 if(!recipient)return{auditId,action,reason,eligible:false,decision:'ECAS_RECIPIENT_MISSING',queueAllowed:false};
 const scheduleId=clean(schedule.auditId),date=clean(schedule.date),auditorUid=clean(schedule.auditorUid),company=clean(schedule.company),mpsNumber=clean(schedule.mpsNumber),scopes=Array.isArray(schedule.scopes)?schedule.scopes.map(clean).filter(Boolean):[],blocks=Array.isArray(schedule.blocks)?schedule.blocks:[],hours=Number(schedule.hours);
 if(scheduleId!==auditId||!date||!auditorUid||!company||!mpsNumber||!scopes.length||!blocks.length||!blocks.every(b=>clean(b.date))||!Number.isFinite(hours)||hours<=0)return{auditId,action,reason,eligible:false,decision:'PRIOR_SCHEDULE_INCOMPLETE',queueAllowed:false};
 return{auditId,action,reason,eligible:true,decision:'PREVIEW_ONLY_REQUIRES_DURABLE_QUEUE_AND_IDEMPOTENCY',queueAllowed:false,recipientEmail:recipient,receipt,priorSchedule:{auditId:scheduleId,date,auditorUid,auditorName:clean(schedule.auditorName),company,mpsNumber,scopes,blocks,hours}};
}
