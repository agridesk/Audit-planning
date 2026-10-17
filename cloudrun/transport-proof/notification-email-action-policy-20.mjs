// Notifications 2.0: inert security policy; integration must use canonical GAS writer.
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
export const ACTIONS = Object.freeze(['ACCEPT','CANCEL','COMPLETE']);
export const TRUSTED_DEVICE_DAYS = 30;
export const ACTION_LINK_MINUTES = 60;
export const createActionToken = () => randomBytes(32).toString('base64url');
export function hashActionToken(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('INVALID_TOKEN');
  return createHash('sha256').update(token).digest('hex');
}
export function verifyActionToken(expectedHash, token) {
  if (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  try { return timingSafeEqual(Buffer.from(expectedHash,'hex'), Buffer.from(hashActionToken(token),'hex')); }
  catch { return false; }
}
export function authorizeAction({record,token,auditorUid,auditId,action,status,revision,deviceTrusted=false,deviceVerified=false,now=Date.now()}) {
  if (!record || !ACTIONS.includes(action)) return 'INVALID_ACTION';
  if (!auditorUid || record.auditorUid !== auditorUid || !auditId || record.auditId !== auditId || record.action !== action) return 'SCOPE_MISMATCH';
  if (record.usedAt != null || record.revokedAt != null) return 'TOKEN_CONSUMED';
  if (!Number.isFinite(record.expiresAt) || now >= record.expiresAt) return 'TOKEN_EXPIRED';
  if (!verifyActionToken(record.tokenHash,token)) return 'INVALID_TOKEN';
  if (record.status !== status || record.revision !== revision) return 'STALE_AUDIT';
  // A valid link never creates a lifecycle capability. Bind it to the
  // canonical action/state/origin combination before device verification.
  if (!auditorEmailActionAllowed(action,status,record.origin)) return 'ACTION_NOT_ALLOWED';
  if (!deviceTrusted && !deviceVerified) return 'DEVICE_VERIFICATION_REQUIRED';
  return 'OK';
}
export function validateActionInput(action,{comment='',realizedHours}={}) {
  if (!ACTIONS.includes(action)) return 'INVALID_ACTION';
  if (action === 'CANCEL' && !String(comment).trim()) return 'CANCEL_REASON_REQUIRED';
  if (action === 'COMPLETE' && (!Number.isFinite(realizedHours) || realizedHours < 0 || !Number.isInteger(realizedHours*4))) return 'INVALID_HOURS';
  return 'OK';
}
// GET read-only. Confirmation POST must atomically consume token and execute canonical lifecycle writer.

export function auditorEmailActionAllowed(action,status,origin){
 const state=String(status||'').toUpperCase().replace(/[ -]+/g,'_');
 const source=String(origin||'').toUpperCase();
 return (action==='ACCEPT'&&state==='APPROVED'&&source==='MANAGER')||(action==='CANCEL'&&state==='PENDING_APPROVAL'&&source==='AUDITOR')||(action==='COMPLETE'&&state==='ACCEPTED');
}
