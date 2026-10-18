// AMS Notifications 2.0 — internal action validation only.
// Authentication is exclusively the existing Authentication 2.0 Remember me session.
// No separate email action token or login.
export const ACTIONS=Object.freeze(['ACCEPT','APPROVE','CANCEL','COMPLETE']);
export function validateActionInput(action,{comment='',realizedHours}={}) {
 if(!ACTIONS.includes(action))return 'INVALID_ACTION';
 if(action==='CANCEL'&&!String(comment).trim())return 'CANCEL_REASON_REQUIRED';
 if(action==='COMPLETE'&&(!Number.isFinite(realizedHours)||realizedHours<0||!Number.isInteger(realizedHours*4)))return 'INVALID_HOURS';
 return 'OK';
}
export function auditorEmailActionAllowed(action,status,origin){
 const state=String(status||'').toUpperCase().replace(/[ -]+/g,'_');
 const source=String(origin||'').toUpperCase();
 return (action==='ACCEPT'&&state==='APPROVED'&&source==='MANAGER')||
 (action==='CANCEL'&&state==='PENDING_APPROVAL'&&source==='AUDITOR')||
 (action==='COMPLETE'&&state==='ACCEPTED');
}
