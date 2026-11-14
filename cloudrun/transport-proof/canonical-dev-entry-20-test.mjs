import assert from 'node:assert/strict';
import {canonicalDevEntry20} from './runtime-environment-20.mjs';
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
console.log('Canonical AMS DEV URL: tagged previews redirect; writes fail closed; PROD unaffected');
