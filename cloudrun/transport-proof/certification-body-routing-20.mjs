/**
 * Certification Body (CB) resolution for AMS 2.0.
 * Fail-closed, deterministic, and read-only. Never send an email here.
 * The operational ScopeCode is permanently bound to one CB; no manager,
 * actor or ECAS-specific fallback is permitted.
 */
const clean=x=>String(x??'').trim();
const truth=x=>/^(true|yes|1)$/i.test(clean(x));
const email=x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(x));
const rows=(values,required,label)=>{
 if(!Array.isArray(values)||!values.length||!Array.isArray(values[0]))throw Error('CB_'+label+'_SOURCE_MISSING');
 const head=values[0].map(clean);
 if(required.some(k=>!head.includes(k)))throw Error('CB_'+label+'_SCHEMA_INVALID');
 return values.slice(1).map((data,index)=>({data,row:index+2,get:k=>clean(data[head.indexOf(k)])}));
};
export function resolveCertificationBody20({scopeCode,configScopes,certificationBodies,obligationCbId='',requireDelivery=false}={}){
 const code=clean(scopeCode);
 if(!code)throw Error('CB_SCOPE_CODE_REQUIRED');
 const scopes=rows(configScopes,['ScopeCode','Certification_Body_ID','Active'],'SCOPES');
 const matches=scopes.filter(x=>x.get('ScopeCode')===code);
 if(matches.length!==1)throw Error('CB_SCOPE_MISSING_OR_AMBIGUOUS');
 const scope=matches[0],cbId=scope.get('Certification_Body_ID');
 if(!cbId)throw Error('CB_SCOPE_UNASSIGNED');
 if(obligationCbId&&clean(obligationCbId)!==cbId)throw Error('CB_OBLIGATION_SCOPE_MISMATCH');
 const cbs=rows(certificationBodies,['Certification_Body_ID','Display_Name','Active','Notification_Email','Email_Verified','Notification_Enabled'],'REGISTRY');
 const found=cbs.filter(x=>x.get('Certification_Body_ID')===cbId);
 if(found.length!==1)throw Error('CB_REGISTRY_MISSING_OR_AMBIGUOUS');
 const cb=found[0];
 if(!truth(cb.get('Active')))throw Error('CB_INACTIVE');
 if(!truth(scope.get('Active')))throw Error('CB_SCOPE_INACTIVE');
 const notificationEmail=cb.get('Notification_Email').toLowerCase();
 const emailVerified=truth(cb.get('Email_Verified'));
 const notificationsEnabled=truth(cb.get('Notification_Enabled'));
 const ready=notificationsEnabled&&emailVerified&&email(notificationEmail);
 if(requireDelivery&&!ready)throw Error('CB_NOTIFICATION_BLOCKED_UNVERIFIED_OR_DISABLED');
 return{scopeCode:code,certificationBodyId:cbId,certificationBodyName:cb.get('Display_Name'),notificationReady:ready,
  ...(requireDelivery?{recipientEmail:notificationEmail}:{})};
}
export function planCertificationBodyExtensionNotification20({currentState,previousCommunicatedState,changedAt,now,minimumDelayMinutes=10}={}){
 if(!Number.isSafeInteger(minimumDelayMinutes)||minimumDelayMinutes<10||minimumDelayMinutes>1440)throw Error('CB_NOTIFICATION_DELAY_MINIMUM_10');
 if(!['APPLIED','NOT_APPLIED'].includes(currentState)||!['APPLIED','NOT_APPLIED'].includes(previousCommunicatedState))throw Error('CB_NOTIFICATION_STATE_INVALID');
 const changed=Date.parse(changedAt),clock=Date.parse(now);
 if(!Number.isFinite(changed)||!Number.isFinite(clock)||clock<changed)throw Error('CB_NOTIFICATION_TIMESTAMP_INVALID');
 if(currentState===previousCommunicatedState)return{action:'SUPPRESS',reason:'NO_NET_STATE_CHANGE'};
 if(clock-changed<minimumDelayMinutes*60000)return{action:'BUFFER',readyAt:new Date(changed+minimumDelayMinutes*60000).toISOString()};
 return{action:'READY',eventType:currentState==='APPLIED'?'CERTIFICATION_BODY_EXTENSION_APPLIED':'CERTIFICATION_BODY_EXTENSION_UNDONE'};
}
