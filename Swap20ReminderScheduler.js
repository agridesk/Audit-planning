/**
 * Swap 2.0 reminder/escalation state. Safe, idempotent scheduling metadata.
 * Does NOT claim delivery: notification dispatcher must explicitly mark sent.
 */
function Swap20_dueActions_(proposal,now){
 if(!proposal||['AWAITING_ACKNOWLEDGEMENT','ESCALATED'].indexOf(proposal.status)<0)return [];
 var created=Date.parse(proposal.createdAt||''),at=Date.parse(now||new Date().toISOString());
 if(!isFinite(created)||!isFinite(at)||at<created)throw Error('Invalid swap reminder timestamps');
 var hours=(at-created)/3600000,actions=[];
 if(hours>=24&&!proposal.reminderSentAt)actions.push({kind:'AUDITOR_REMINDER',operationId:proposal.operationId,missingAuditorUids:proposal.requiredAuditorUids.filter(function(uid){return proposal.acknowledgedAuditorUids.indexOf(uid)<0;})});
 if(hours>=24&&!proposal.managerAlertSentAt)actions.push({kind:'MANAGER_ALERT',operationId:proposal.operationId});
 if(hours>=48&&proposal.status!=='ESCALATED')actions.push({kind:'MANAGER_ESCALATION',operationId:proposal.operationId});
 return actions;
}
function Swap20_markDelivery_(operationId,kind,receipt){
 if(!receipt||receipt.accepted!==true||!String(receipt.providerId||'').trim())throw Error('Confirmed delivery receipt required');
 var old=Swap20Store_read_(operationId);
 if(!old)throw Error('Swap proposal not found');
 var field={AUDITOR_REMINDER:'reminderSentAt',MANAGER_ALERT:'managerAlertSentAt',MANAGER_ESCALATION:'escalatedAt'}[kind];
 if(!field)throw Error('Unknown swap notification kind');
 if(old[field])return {success:true,idempotent:true,status:old.status};
 if(['AWAITING_ACKNOWLEDGEMENT','ESCALATED'].indexOf(old.status)<0)throw Error('Swap no longer awaiting response');
 var next=JSON.parse(JSON.stringify(old));
 next[field]=new Date().toISOString();
 next[field+'ProviderId']=String(receipt.providerId);
 if(kind==='MANAGER_ESCALATION')next.status='ESCALATED';
 return Swap20Store_transition_(operationId,old.status,next,old);
}
