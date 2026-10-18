import assert from 'node:assert/strict';
import fs from 'node:fs';
const server=fs.readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const gas=fs.readFileSync(new URL('../../EntryV5.js',import.meta.url),'utf8');
const cases=[
 ['Cloud Run renders unauthenticated DEV login',()=>assert.match(server,/return sendHtml\(res,200,RUNTIME_ENV==='DEV'\?cloudAuthLoginHtml\(\):portalLoginHtml\(\)\)/)],
 ['Browser-facing OTP request and verify handlers',()=>{assert.match(server,/\/auth\/otp\/request/);assert.match(server,/\/auth\/otp\/verify/);}],
 ['No GAS script URL in rendered login HTML',()=>{const html=server.slice(server.indexOf('function cloudAuthLoginHtml'),server.indexOf('async function cloudAuthGas'));assert.doesNotMatch(html,/script\.google\.com/);assert.doesNotMatch(html,/trustedToken/);}],
 ['DEV-only GAS shared-key bridge',()=>{assert.match(server,/RUNTIME_ENV!=='DEV'\|\|!GAS_WRITE_URL\|\|WRITE_KEY\.length<32/);assert.match(gas,/V5_ENTRY_externalBridgeBody_\(e\)/);}],
 ['OTP verified by canonical GAS AuthService',()=>{assert.match(gas,/V5_AUTH\.requestLoginCode\(email\)/);assert.match(gas,/V5_AUTH\.verifyLoginCode\(email,code,'',body\.remember===true,deviceId/);}],
 ['Cloud Run exchanges verified token server-side',()=>{assert.match(server,/http:\/\/127\.0\.0\.1:'\+INNER_PORT\+'\/api\/v1\/session\/exchange/);assert.match(server,/exchanged\.headers\.get\('set-cookie'\)/);}],
 ['Invalid OTP cannot create a session',()=>assert.match(server,/if\(!verified\.ok\|\|!verified\.token\)return sendJson\(res,401/)],
 ['Auditor UID-gated DEV shortcut retained',()=>assert.match(server,/AMS_AUDITOR_UID_LOGIN_ENABLED/)],
 ['Remember toggle reaches canonical AuthService',()=>{assert.match(server,/id="remember" type="checkbox"/);assert.match(server,/remember:el\('remember'\)\.checked/);assert.match(server,/remember=body\.remember===true/);assert.match(gas,/body\.remember===true,deviceId/);}],
 ['Stable browser device binding',()=>{assert.match(server,/localStorage\.getItem\(deviceKey\)/);assert.match(server,/localStorage\.setItem\(deviceKey,deviceId\)/);}],
 ['Visible throttled resend',()=>{assert.match(server,/function updateCountdown\(\)/);assert.match(server,/Resend available in /);}],
 ['Login OTP supports keyboard verification',()=>{assert.match(server,/e\.key==='Enter'/);assert.match(server,/el\('verify'\)\.click\(\)/);}],
 ['Deep links are server-allowlisted and role-scoped',()=>{assert.match(server,/function safeLoginDestination\(raw,role\)/);assert.match(server,/value\.startsWith\('\/\/'\)/);assert.match(server,/parsed\.pathname==='\/planning'/);assert.match(server,/destination:safeLoginDestination\(body\.next,verified\.role\)/);}],
 ['OTP navigation uses authorized server destination',()=>{assert.match(server,/next:loginNext/);assert.match(server,/location\.assign\(verified\.destination\|\|'\/'\)/);}],
 ['Unauthenticated planning preserves authorized login destination',()=>{assert.match(server,/'location':'\/\?next='\+encodeURIComponent\(next\)/);assert.match(server,/safeLoginDestination\(u\.searchParams\.get\('next'\),identity\.role\)/);}],
 ['Production OTP bridge stays closed',()=>assert.match(gas,/if\(!V5_ENTRY_isDevEnv_\(\)\)return authResponse\(\{ok:false,error:'DEV_ONLY'\}\)/)],
];
let failed=0;for(const [name,fn] of cases){try{fn();console.log('PASS',name);}catch(error){failed++;console.error('FAIL',name,error.message);}}
console.log(`${cases.length-failed}/${cases.length} Cloud Run authentication contracts passed`);if(failed)process.exitCode=1;
