import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
const outer=read('./server-r15.js');
const inner=read('./server-r4.js');
const grid=read('./manager-portal.js');
new vm.Script(grid,{filename:'manager-portal.js'});
const proxyStart=outer.indexOf('async function proxy(req,res){'),proxyEnd=outer.indexOf('enforcePlanningAtomicCutover20(',proxyStart);
assert(proxyStart>=0&&proxyEnd>proxyStart);
const proxy=outer.slice(proxyStart,proxyEnd);
assert(proxy.includes("writerPath==='/api/v1/manager/self-planning-direct'"));
assert(proxy.includes("writerPath==='/api/v1/manager/extension-obligation-command'"));
assert(proxy.includes("directDevManagerWrite?port+9:innerPort"),'DEV manager writes must reach R4 without lossy R12..R5 Host rewrites');
assert(proxy.includes("runtime.isDev&&req.method==='POST'"),'Only DEV authenticated POST calls may bypass proxy layers');
assert(proxy.includes("origin.protocol!=='https:'"),'The public request must require HTTPS');
assert(proxy.includes("origin.host!==externalHost&&!knownDevOrigin"),'Only exact trusted DEV origins may bypass Cloud Run rewritten Host');
assert(proxy.includes("'https://scope-test---ams-fase12-dev-zwtcar7xpa-ew.a.run.app'"),'Existing DEV tag origin must be supported');
assert(proxy.includes("process.env.K_SERVICE==='ams-fase12-dev'"),'Known-origin exception must be DEV-service-specific');
assert(proxy.includes('headers.host=externalHost')&&proxy.includes('headers.origin=origin.origin'));
assert(!proxy.includes("x-forwarded-host"),'Never trust client-supplied forwarded Host');
for(let n=12;n>=6;n--){
 const source=read('./server-r'+n+'.js');
 assert(source.includes("!['host','content-length','connection'].includes"),'Expected Host-stripping proxy for R'+n);
}
assert(read('./server-r5.js').includes("host:'127.0.0.1:'+INNER_PORT"),'R5 rewrites the Host to localhost');
const originHelper=inner.slice(inner.indexOf('function devScopeTestOriginAllowed20('),inner.indexOf('function isolatedExtDirect20()'));
assert(originHelper.includes("process.env.AMS_RUNTIME_ENV==='DEV'"));
assert(originHelper.includes("process.env.K_SERVICE==='ams-fase12-dev'"));
assert(originHelper.includes("'https://scope-test---ams-fase12-dev-zwtcar7xpa-ew.a.run.app'"));
assert.equal(inner.split('!devScopeTestOriginAllowed20(parsedOrigin.origin)').length-1,2,'EXT and EXT projection must accept isolated tag');
assert(inner.includes("return send(res,200,{ok:true,companyUid:uid,records,mode:'READ_ONLY_CUTOVER_REQUIRED',canMutate:false,"));
assert(inner.includes('directWriterGates:{'),'Read-only EXT must provide safe gate diagnostics');

// Execute the exact DEV writer predicate with normal-grid and preview configurations.
const gateStart=inner.indexOf('function isolatedExtDirect20(){');
const gateEnd=inner.indexOf('async function readIsolatedDevModelCExt20()',gateStart);
assert(gateStart>=0&&gateEnd>gateStart);
const predicate=inner.slice(gateStart,gateEnd);
const enabled={
 AMS_RUNTIME_ENV:'DEV',K_SERVICE:'ams-fase12-dev',
 AMS_DEV_NORMAL_GRID_ENABLED:'true',
 AMS_DEV_MAINTENANCE_MODE:'false',AMS_DEV_EXT_READONLY_PREVIEW:'false',
 AMS_DEV_EXT_DIRECT_ENABLED:'true',AMS_SCOPE_EXTENSION_AUTHORITY:'SHEETS',
 AMS_SCOPE_EXTENSION_MIGRATION_VERIFIED:'false',AMS_SCOPE_EXTENSION_WRITER_FENCE_VERIFIED:'false'
};
function gate(env){
 const context={process:{env}};
 vm.createContext(context);
 vm.runInContext(predicate,context);
 return context.isolatedExtDirect20();
}
assert.equal(gate(enabled),true,'Normal DEV grid must support EXT when explicit writer gate is on');
assert.equal(gate({...enabled,AMS_DEV_EXT_DIRECT_ENABLED:'false'}),false,'EXT stays disabled without opt-in');
assert.equal(gate({...enabled,AMS_RUNTIME_ENV:'PROD'}),false,'Never enable on PROD');
assert.equal(gate({...enabled,K_SERVICE:'other-dev-service'}),false,'No other DEV service');
assert.equal(gate({...enabled,AMS_SCOPE_EXTENSION_AUTHORITY:'FIRESTORE'}),false,'Do not bypass migrated writer');
assert.equal(gate({...enabled,AMS_SCOPE_EXTENSION_MIGRATION_VERIFIED:'true'}),false,'No mixed writer cutover');
assert.equal(gate({...enabled,AMS_SCOPE_EXTENSION_WRITER_FENCE_VERIFIED:'true'}),false,'No mixed fence');
assert.equal(gate({...enabled,AMS_DEV_MAINTENANCE_MODE:'true'}),false,'Invalid grid mode remains blocked');
assert.equal(gate({...enabled,AMS_DEV_NORMAL_GRID_ENABLED:'false',AMS_DEV_MAINTENANCE_MODE:'true',AMS_DEV_EXT_READONLY_PREVIEW:'true'}),true,'Legacy preview remains supported with explicit gate');

const selfStart=inner.indexOf('async function directManagerSelfPlanning20(identity,body){');
const selfEnd=inner.indexOf('async function directManagerExtension(',selfStart);
assert(selfStart>=0&&selfEnd>selfStart);
const self=inner.slice(selfStart,selfEnd);
assert(!self.includes('isolatedExtDirect20()'),'Self planning may not depend on optional EXT pilot flags');
assert(self.includes("process.env.AMS_RUNTIME_ENV!=='DEV'")&&self.includes("process.env.K_SERVICE!=='ams-fase12-dev'"));
assert(self.includes("SID!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs'"));
assert(self.includes("directRowRevision(found.h,found.row)!==expectedRevision"),'CAS revision stays mandatory');
assert(self.includes("SELF_PLANNING_READBACK_UNVERIFIED"),'Sheets readback stays mandatory');
assert(grid.includes('DEV configuration gates blocking EXT:'));
assert(grid.includes("EXT/Undo is not yet authorized: '+(failedGates.length"),'Single EXT must expose same DEV gate diagnostics');
// Real DEV System_Config allows writes; the legacy preview deliberately froze them.
const configStart=inner.indexOf('function devManagerDirectWritesConfigAllowed20(');
const configEnd=inner.indexOf('function isolatedExtDirect20()',configStart);
assert(configStart>=0&&configEnd>configStart);
const configSource=inner.slice(configStart,configEnd);
function allowedConfig(env,values){
 const context={process:{env}};
 vm.createContext(context);
 vm.runInContext(configSource,context);
 return context.devManagerDirectWritesConfigAllowed20(new Map(Object.entries(values)));
}
const writable={ENV:'DEV',ALLOW_DEV_WRITES:'TRUE',DEV_WRITE_MODE:'ALLOW_ALL'};
const frozen={ENV:'DEV',ALLOW_DEV_WRITES:'FALSE',DEV_WRITE_MODE:'BLOCK'};
assert.equal(allowedConfig(enabled,writable),true,'Actual canonical writable DEV must authorize normal-grid operations');
assert.equal(allowedConfig(enabled,{...writable,ALLOW_DEV_WRITES:true}),true,'UNFORMATTED_VALUE boolean TRUE from live Google Sheets must allow normal DEV');
assert.equal(allowedConfig(enabled,{...writable,ALLOW_DEV_WRITES:false}),false,'UNFORMATTED_VALUE boolean FALSE must deny normal DEV');
assert.equal(allowedConfig(enabled,frozen),false,'Frozen mode cannot be used with the normal grid');
assert.equal(allowedConfig({...enabled,AMS_DEV_NORMAL_GRID_ENABLED:'false',AMS_DEV_MAINTENANCE_MODE:'true',AMS_DEV_EXT_READONLY_PREVIEW:'true'},frozen),true,'Legacy preview retains freeze');
assert.equal(allowedConfig({...enabled,AMS_DEV_NORMAL_GRID_ENABLED:'false',AMS_DEV_MAINTENANCE_MODE:'true',AMS_DEV_EXT_READONLY_PREVIEW:'true'},{...frozen,ALLOW_DEV_WRITES:false}),true,'UNFORMATTED_VALUE boolean FALSE must preserve isolated preview freeze');
assert.equal(allowedConfig({...enabled,AMS_RUNTIME_ENV:'PROD'},writable),false,'PROD is never authorized');
assert.equal(allowedConfig(enabled,{...writable,ENV:'PROD'}),false,'DEV service must not write to PROD SSOT');
assert.equal(allowedConfig(enabled,{...writable,DEV_WRITE_MODE:'BLOCK'}),false,'Contradictory config must fail closed');
assert(inner.includes("if(!devManagerDirectWritesConfigAllowed20(cfg))throw Error('SELF_PLANNING_DEV_SSOT_MODE_MISMATCH')"));
assert(inner.includes("if(!devManagerDirectWritesConfigAllowed20(cfg))throw Error('EXT_DEV_DIRECT_SSOT_MODE_MISMATCH')"));



console.log('DEV Self planning / Single EXT / Multi EXT routed write and gate diagnostics PASS');
