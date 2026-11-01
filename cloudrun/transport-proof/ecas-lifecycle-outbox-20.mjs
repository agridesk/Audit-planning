import {createHash} from 'node:crypto';
import {previewEcasLifecycleIntent20} from './ecas-lifecycle-notification-intent-20.mjs';
const str=x=>String(x??'').trim();
export function buildEcasLifecycleOutbox20({transitionId,committedTransition,previousCommunication,...input}){
 if(!str(transitionId)||committedTransition?.committed!==true||str(committedTransition.auditId)!==str(input.auditId)||str(committedTransition.action).toUpperCase()!==str(input.action).toUpperCase())throw Error('ECAS_TRANSITION_NOT_COMMITTED');
 const prior=previousCommunication||{};
 const intent=previewEcasLifecycleIntent20({...input,priorScheduleVerified:prior.verified===true,priorDeliveryReceipt:prior.receipt,priorCommunicatedSchedule:prior.schedule,recipientEmail:prior.recipientEmail});
 if(!intent.eligible)return{required:false,reason:intent.decision,queueWrites:[],noExternalMail:true};
 if(!['CANCEL','REJECT'].includes(str(input.action).toUpperCase()))throw Error('ECAS_ACTION_UNSUPPORTED');
 const idempotencyKey=createHash('sha256').update(['ECAS_LIFECYCLE_V1',transitionId,input.auditId,str(input.action).toUpperCase(),prior.receipt].join('|')).digest('hex');
 const payload={eventKey:str(input.action).toUpperCase()==='CANCEL'?'ECAS_AUDIT_CANCELLED_DIGEST':'ECAS_AUDIT_REJECTED_DIGEST',type:str(input.action).toUpperCase()==='CANCEL'?'ECAS_AUDIT_CANCELLED_DIGEST':'ECAS_AUDIT_REJECTED_DIGEST',ecasComment:intent.reason,comment:intent.reason,externalReasonText:intent.reason,deliveryProfile:'EXTERNAL_OPERATIONAL',eventType:str(input.action).toUpperCase()==='CANCEL'?'ECAS_AUDIT_CANCELLED_DIGEST':'ECAS_AUDIT_REJECTED_DIGEST',auditId:input.auditId,reason:intent.reason,recipientEmail:intent.recipientEmail,company:intent.priorSchedule.company,mpsNumber:intent.priorSchedule.mpsNumber,auditorUid:intent.priorSchedule.auditorUid,scopes:intent.priorSchedule.scopes,blocks:intent.priorSchedule.blocks||[],plannedHours:intent.priorSchedule.hours,originalEcasCommunicationId:prior.receipt,previousBlocks:intent.priorSchedule.blocks||[],priorSchedule:intent.priorSchedule,priorDeliveryReceipt:prior.receipt,transitionId,idempotencyKey};
 return{required:true,queueWrites:[{idempotencyKey,payload,state:'PREPARED',deliveryEnabled:false}],noExternalMail:true,requiresDurableAtomicOutbox:true};
}
