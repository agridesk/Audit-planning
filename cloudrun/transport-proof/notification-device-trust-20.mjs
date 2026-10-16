// AMS Notifications 2.0: device trust primitives. No device can be enrolled from an email action link alone.
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
export const DEVICE_TRUST_TTL_MS=30*24*60*60*1000;
export const DEVICE_COOKIE_NAME='ams_dev_notification_device';
export function issueDeviceCredential({auditorUid,independentlyVerified,now=Date.now()}){
 if(!auditorUid||typeof auditorUid!=='string'||!independentlyVerified)throw Error('INDEPENDENT_VERIFICATION_REQUIRED');
 const secret=randomBytes(32).toString('base64url');
 return {secret,record:{auditorUid,secretHash:createHash('sha256').update(secret).digest('hex'),issuedAt:now,expiresAt:now+DEVICE_TRUST_TTL_MS,revokedAt:null}};
}
export function verifyDeviceCredential({record,secret,auditorUid,now=Date.now()}){
 if(!record||!auditorUid||record.auditorUid!==auditorUid||record.revokedAt!=null||!Number.isFinite(record.expiresAt)||now>=record.expiresAt)return false;
 if(typeof secret!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(secret)||typeof record.secretHash!=='string'||!/^[a-f0-9]{64}$/.test(record.secretHash))return false;
 const supplied=createHash('sha256').update(secret).digest();
 return timingSafeEqual(Buffer.from(record.secretHash,'hex'),supplied);
}
export function deviceCookie(secret,{maxAgeSeconds=2592000}={}){
 if(typeof secret!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(secret))throw Error('INVALID_DEVICE_CREDENTIAL');
 if(!Number.isInteger(maxAgeSeconds)||maxAgeSeconds<1||maxAgeSeconds>2592000)throw Error('INVALID_COOKIE_AGE');
 return DEVICE_COOKIE_NAME+'='+secret+'; Path=/; Max-Age='+maxAgeSeconds+'; Secure; HttpOnly; SameSite=Strict';
}
// Caller must persist record server-side, bind to independently verified Auditor_UID,
// revoke on deactivation and rotate after verification. Never trust a client-supplied UID.
