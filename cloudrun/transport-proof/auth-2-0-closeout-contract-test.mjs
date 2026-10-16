import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const r5=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const otp=readFileSync(new URL('./auth-fast-otp-20.mjs',import.meta.url),'utf8');
assert.match(r5,/FAST_OTP_ENABLED=RUNTIME_ENV==='DEV'/,'fast route must be DEV-only');
assert.match(r4,/process\.env\.AMS_RUNTIME_ENV!=='DEV'\|\|process\.env\.AMS_AUTH_FAST_OTP_ENABLED!=='true'/,'session issuer is DEV-only');
assert.match(r5,/cookie\.length!==2/,'verify must require both cookies');
assert.match(r5,/getSetCookie\(\)/,'cookie exchange must preserve separate cookies');
assert.match(r4,/ams_auth_device=.*HttpOnly; Secure; SameSite=Lax/,'device proof must use protected cookie');
assert.match(r4,/session\.deviceHash&&!safeEq/,'device proof must be checked');
assert.match(r4,/14\*86400:7200/,'remember 14d and default 2h session');
assert.match(r4,/session\.auditorUid!==check\.uid/,'auditor identity requires current UID');
assert.match(r5,/cloudRevocationStore\(\)\.revoke/,'logout must revoke persisted server session');
assert.match(r5,/ams_auth_device=; Max-Age=0/,'logout must erase device proof');
assert.match(r5,/safeLoginDestination\(body\.next,identity\.role\)/,'deep links must pass server allowlist');
assert.match(otp,/const TTL_MS=600000/,'OTP must expire in ten minutes');
assert.match(otp,/const THROTTLE_MS=45000/,'OTP resend delay');
assert.match(otp,/const MAX_ATTEMPTS=5/,'OTP failed attempt limit');
assert.match(otp,/const MAX_ACTIVE=2/,'OTP active record cap');
assert.match(otp,/for\(const row of state\.codes\).*row\.usedAt=/s,'sibling codes must be invalidated on success');
for(const n of [6,7,8,9,10,11,12,15]){
 const r=readFileSync(new URL('./server-r'+n+'.js',import.meta.url),'utf8');
 assert.match(r,/getSetCookie\(\)/,'proxy '+n+' must preserve discrete cookies');
}
console.log('PASS auth closeout static security contracts: dev gates, cookies, UID, expiry, lockout, logout, redirects and proxies');
