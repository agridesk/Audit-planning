import assert from 'node:assert/strict';
import {canonicalDevEntry20} from './runtime-environment-20.mjs';
import {readFileSync} from 'node:fs';
const base={isDev:true,service:'ams-fase12-dev'};
const canonical='ams-fase12-dev-zwtcar7xpa-ew.a.run.app';
const review='issue87-review---'+canonical;
assert.deepEqual(canonicalDevEntry20({...base,host:canonical,method:'POST',url:'/api/v1/manager/self-planning-direct'}),{action:'PASS'});
assert.deepEqual(canonicalDevEntry20({...base,host:review,method:'GET',url:'/planning?auditId=one'}),{
 action:'REDIRECT',status:302,location:'https://'+canonical+'/planning?auditId=one'
});
assert.deepEqual(canonicalDevEntry20({...base,host:'scope-test---'+canonical,method:'HEAD',url:'/'}),{
 action:'REDIRECT',status:302,location:'https://'+canonical+'/'
});
for(const method of ['POST','PUT','PATCH','DELETE'])assert.deepEqual(
 canonicalDevEntry20({...base,host:review,method,url:'/api/v1/manager/extension-obligation-command'}),
 {action:'REJECT',status:421});
assert.deepEqual(canonicalDevEntry20({...base,host:review,method:'GET',url:'//evil.test'}),{action:'REJECT',status:400});
assert.deepEqual(canonicalDevEntry20({...base,isDev:false,host:review,method:'POST',url:'/'}),{action:'PASS'});
assert.deepEqual(canonicalDevEntry20({...base,service:'another-service',host:review,method:'GET',url:'/'}),{action:'PASS'});
assert.deepEqual(canonicalDevEntry20({...base,host:'otherhost.test',method:'GET',url:'/'}),{action:'PASS'});

// Only the exact opt-in preflight host is allowed to render read-only pages.
const preflight='preflight---'+canonical;
for(const method of ['GET','HEAD'])assert.deepEqual(canonicalDevEntry20({...base,host:preflight,method,url:'/planning?auditId=one',taggedPreflightReadOnly:true}),{action:'PASS'});
for(const path of ['/auth/otp/request','/auth/otp/verify','/auth/dev-login','/auth/logout'])assert.deepEqual(
 canonicalDevEntry20({...base,host:preflight,method:'POST',url:path,taggedPreflightReadOnly:true}),{action:'PASS'});
for(const path of ['/api/v1/planning/direct-commit','/api/v1/manager/company-management/save','/api/v1/planning/commit-handoff','/auth/signed-handoff'])assert.deepEqual(
 canonicalDevEntry20({...base,host:preflight,method:'POST',url:path,taggedPreflightReadOnly:true}),{action:'REJECT',status:421});
assert.deepEqual(canonicalDevEntry20({...base,host:preflight,method:'GET',url:'//foreign.example',taggedPreflightReadOnly:true}),{action:'REJECT',status:400});
assert.deepEqual(canonicalDevEntry20({...base,host:review,method:'GET',url:'/',taggedPreflightReadOnly:true}),{
 action:'REDIRECT',status:302,location:'https://'+canonical+'/'
});
assert.deepEqual(canonicalDevEntry20({...base,host:preflight,method:'GET',url:'/',taggedPreflightReadOnly:false}),{
 action:'REDIRECT',status:302,location:'https://'+canonical+'/'
});
const runtime=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
assert.ok(runtime.includes("taggedPreflightReadOnly:process.env.AMS_DEV_PREFLIGHT_READONLY_BROWSER_ENABLED==='true'"),'R15 must explicitly opt into preflight read-only gate');
assert.ok(runtime.includes("String(req.headers.host||'').toLowerCase()===preflightHost"),'Preflight authorization requires the exact tagged host');
assert.ok(runtime.includes("requestOrigin!==expectedPreflightOrigin&&!samePreflightForm"),'Preflight auth requires exact origin or verified same-origin form');
assert.ok(runtime.includes("writerPath==='/auth/dev-login'&&")&&runtime.includes("(!requestOrigin||requestOrigin==='null')")&&runtime.includes("String(req.headers['sec-fetch-site']||'')==='same-origin'")&&runtime.includes("String(req.headers['sec-fetch-mode']||'')==='navigate'")&&runtime.includes("String(req.headers['sec-fetch-dest']||'')==='document'"),'Only a protected same-origin top-level browser DEV-login form may omit Origin or send null');
assert.ok(runtime.includes("preflightAuthRoutes.has(writerPath)"),'Only login/logout requests receive the trusted auth bridge');
assert.ok(runtime.includes("delete headers.origin;"),'Public proxy validates preflight Origin, then strips it only for authorized login routes');
assert.ok(!runtime.includes("PREFLIGHT_AUTH_CANONICAL_ORIGIN_NOT_CONFIGURED"),'Preflight login must not depend on a possibly absent canonical DEV origin setting');
console.log('Canonical AMS DEV URL: tagged previews redirect; writes fail closed; PROD unaffected');
