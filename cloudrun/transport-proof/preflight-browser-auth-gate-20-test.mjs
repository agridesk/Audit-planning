import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const start=source.indexOf(" const preflightHost='preflight---ams-fase12-dev-zwtcar7xpa-ew.a.run.app';");
const end=source.indexOf(" const init={method:req.method,headers,redirect:'manual'};",start);
assert.ok(start>0&&end>start,'R15 exact-host preflight authentication gate must exist');
const adapter=Function('req','res','headers','runtime','process','writerPath',
 source.slice(start,end)+';return {headers,blocked:false};');
const host='preflight---ams-fase12-dev-zwtcar7xpa-ew.a.run.app';
const origin='https://'+host;
function run({path='/auth/dev-login',requestOrigin=origin,fetchSite='',fetchMode='',fetchDest='',hostname=host,flag='true',dev=true}={}){
 const headers={host:hostname};
 if(requestOrigin!==undefined)headers.origin=requestOrigin;
 if(fetchSite)headers['sec-fetch-site']=fetchSite;
 if(fetchMode)headers['sec-fetch-mode']=fetchMode;
 if(fetchDest)headers['sec-fetch-dest']=fetchDest;
 const req={url:path,method:'POST',headers};
 let status=0;
 const res={writeHead:(s)=>{status=s},end:()=>{}};
 const process={env:{AMS_DEV_PREFLIGHT_READONLY_BROWSER_ENABLED:flag}};
 const out=adapter(req,res,{...headers},{isDev:dev},process,path);
 return {status,headers:out?.headers||{},blocked:!out};
}
for(const path of ['/auth/dev-login','/auth/otp/request','/auth/otp/verify','/auth/logout']){
 const outcome=run({path});
 assert.equal(outcome.blocked,false,path+' accepts valid exact same-origin request');
 assert.equal(Object.hasOwn(outcome.headers,'origin'),false,path+' forwards no Origin to R5, independently of configured AUTH_ORIGIN');
}
for(const requestOrigin of [undefined,'null']){
 const native=run({requestOrigin,fetchSite:'same-origin',fetchMode:'navigate',fetchDest:'document'});
 assert.equal(native.blocked,false,'Native same-origin DEV login form with missing/null Origin must work');
 assert.equal(Object.hasOwn(native.headers,'origin'),false);
}
for(const options of [
 {requestOrigin:'null'},
 {requestOrigin:undefined},
 {requestOrigin:'https://evil.example',fetchSite:'same-origin',fetchMode:'navigate',fetchDest:'document'},
 {requestOrigin:'null',fetchSite:'cross-site',fetchMode:'navigate',fetchDest:'document'},
 {requestOrigin:'null',fetchSite:'same-origin',fetchMode:'cors',fetchDest:'document'},
 {requestOrigin:'null',fetchSite:'same-origin',fetchMode:'navigate',fetchDest:'empty'},
 {path:'/auth/otp/verify',requestOrigin:'null',fetchSite:'same-origin',fetchMode:'navigate',fetchDest:'document'}
 ])assert.equal(run(options).status,403,'Invalid or unverified preflight auth request must fail closed');
for(const path of ['/api/v1/planning/commit-handoff','/api/v1/manager/company-management/save']){
 const out=run({path});
 assert.equal(out.blocked,false);
 assert.equal(out.headers.origin,origin,'Business writer Origin must not be stripped');
}
for(const options of [{hostname:'ams-fase12-dev-zwtcar7xpa-ew.a.run.app'}, {flag:'false'},{dev:false}]){
 const out=run(options);
 assert.equal(out.headers.origin,origin,'Outside exact opted-in DEV preflight, preserve existing Origin');
}
const r5=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
assert.ok(r5.includes('if(req.headers.origin&&req.headers.origin!==AUTH_ORIGIN)'),'R5 must retain its configured Origin validation when present');
assert.ok(source.includes('taggedPreflightReadOnly:process.env.AMS_DEV_PREFLIGHT_READONLY_BROWSER_ENABLED'), 'Top-level R15 read-only gate must remain active');
console.log('Preflight browser authentication: origin present/null/omitted, Fetch Metadata, writes and environment variants PASS');
