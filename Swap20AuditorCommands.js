/**
 * Auditor acknowledgement/decline. Authenticated identity MUST be resolved
 * by the canonical auditor UID owner, never from caller-supplied email/UID.
 */
function Swap20AuditorRespond(input){
 input=input||{};
 var auth=V5_AUTH.validateTrustedTokenByRole(input.trustedToken||input.token,'Auditor',input.deviceFingerprint||input.deviceId);
 if(!auth||auth.ok!==true||!auth.email)throw Error('Auditor authentication required');
 if(typeof Swap20_resolveAuditorUidByEmail_!=='function')throw Error('Canonical auditor UID resolver unavailable');
 var uid=String(Swap20_resolveAuditorUidByEmail_(auth.email)||'').trim();
 if(!uid)throw Error('Authenticated auditor UID unavailable');
 var id=String(input.operationId||'').trim(),p=Swap20Store_read_(id);
 if(!p)throw Error('Swap proposal not found');
 if(p.requiredAuditorUids.indexOf(uid)<0)throw Error('Auditor not assigned to proposal');
 var decision=String(input.decision||'').toUpperCase();
 if(decision!=='ACKNOWLEDGE'&&decision!=='DECLINE')throw Error('Invalid swap response');
 if(p.status==='CONFIRMED'&&decision==='ACKNOWLEDGE'&&p.acknowledgedAuditorUids.indexOf(uid)>=0)return {success:true,status:'CONFIRMED',idempotent:true};
 if(p.status!=='AWAITING_ACKNOWLEDGEMENT'&&p.status!=='ESCALATED')throw Error('Swap proposal not awaiting response');
 var next=JSON.parse(JSON.stringify(p)),now=new Date().toISOString();
 if(decision==='DECLINE'){next.status='DECLINED';next.declinedBy=uid;next.declinedAt=now;}
 else{
  if(next.acknowledgedAuditorUids.indexOf(uid)<0)next.acknowledgedAuditorUids.push(uid);
  if(next.requiredAuditorUids.every(function(x){return next.acknowledgedAuditorUids.indexOf(x)>=0;}))next.status='CONFIRMED';
 }
 return Swap20Store_transition_(id,p.status,next,p);
}
