import assert from 'node:assert/strict';
import {createFastOtpService} from './auth-fast-otp-20.mjs';
let clock=100000,version=0;const docs=new Map(),mails=[];
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
async function api(url,opts={}){
 const u=new URL(url),id=u.searchParams.get('documentId')||u.pathname.split('/').at(-1),method=opts.method||'GET';
 if(method==='GET')return docs.has(id)?response(docs.get(id)):response({},404);
 if(method==='POST'&&docs.has(id))return response({},409);
 if(method==='PATCH'&&u.searchParams.get('currentDocument.updateTime')!==docs.get(id)?.updateTime)return response({},412);
 const record={...JSON.parse(opts.body),updateTime:'v'+(++version)};docs.set(id,record);return response(record);
}
const options={projectId:'audit-management-system-dev',secret:'s'.repeat(40),getAccessToken:async()=>'token',lookupAccount:async(email)=>email==='a@example.org'?{role:'Auditor',auditorUid:'uid-1'}:null,sendEmail:async(email,code)=>{mails.push(code)},fetchImpl:api,now:()=>clock,codeGenerator:()=>'123456'};
const svc=createFastOtpService(options);
assert.equal((await svc.requestCode('invalid@example.org')).ok,false);
assert.equal((await svc.requestCode('a@example.org')).ok,true);
assert.equal((await svc.requestCode('a@example.org')).throttled,true);
assert.equal(mails.length,1);
assert.equal((await svc.verifyCode('a@example.org','000000')).ok,false);
assert.equal((await svc.verifyCode('a@example.org','123456')).auditorUid,'uid-1');
assert.equal((await svc.verifyCode('a@example.org','123456')).ok,false);
assert.equal(JSON.stringify([...docs.values()]).includes('123456'),false);
clock+=46000;assert.equal((await svc.requestCode('a@example.org')).ok,true);
clock+=601000;assert.equal((await svc.verifyCode('a@example.org','123456')).ok,false);
assert.throws(()=>createFastOtpService({...options,projectId:'prod'}),/DEV_CONFIG/);
console.log('PASS Firestore fast OTP: identity, throttle, single-use, TTL, no plaintext, DEV guard');
