import {createHash} from 'node:crypto';
import {previewEcasLifecycleIntent20} from './ecas-lifecycle-notification-intent-20.mjs';
const str=x=>String(x??'').trim();
export function buildEcasLifecycleOutbox20({transitionId,committedTransition,previousCommunication,...input}){
 if(!str(transitionId)||committedTransition?.committed!==true||str(committedTransition.auditId)!==str(input.auditId)||str(committedTransition.action).toUpperCase()!==str(input.action).toUpperCase())throw Error('ECAS_TRANSITION_NOT_COMMITTED');
 const prior=previousCommunication||{};
 const intent=previewEcasLifecycleIntent20({...input,priorScheduleVerified:prior.verified===true,priorDeliveryReceipt:prior.receipt,priorCommunicatedSchedule:prior.schedule,recipientEmail:prior.recipientEmail});
 if(!intent.eligible)return{required:false,reason:intent.decision,queueWrites:[],noExternalMail:true};
 const idempotencyKey=createHash('sha256').update(['ECAS_LIFECYCLE_V1',transitionId,input.auditId,str(input.action).toUpperCase(),prior.receipt].join('|')).digest('hex');
 const payload={eventType:str(input.action).toUpperCase()==='CANCEL'?'ECAS_AUDIT_CANCELLED':'ECAS_AUDIT_REJECTED',auditId:input.auditId,reason:intent.reason,recipientEmail:intent.recipientEmail,priorSchedule:intent.priorSchedule,priorDeliveryReceipt:prior.receipt,transitionId,idempotencyKey};
 return{required:true,queueWrites:[{idempotencyKey,payload,state:'PREPARED',deliveryEnabled:false}],noExternalMail:true,requiresDurableAtomicOutbox:true};
}
