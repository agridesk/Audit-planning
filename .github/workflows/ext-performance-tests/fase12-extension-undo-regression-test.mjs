import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const ui=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const backend=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const start=ui.indexOf('function extensionControls(r){'),end=ui.indexOf('function grid4ScopeBadges(r){',start);
assert(start>=0&&end>start);
const fn=vm.runInNewContext(ui.slice(start,end)+'\nextensionControls',{actorRole:'Manager',esc:String,extensionAppliedState:r=>!!(r.extensionApplied||r.extApplied)});
assert(fn({statusKey:'PENDING_PLANNING',extensionMonths:3,extensionApplied:false,canExtend:true,auditId:'A'}).includes('ext-single'));
assert(fn({statusKey:'PENDING_PLANNING',extensionMonths:3,extensionApplied:true,canExtend:true,auditId:'A'}).includes('ext-single'));
assert(fn({statusKey:'PENDING_PLANNING',extensionMonths:3,extensionApplied:true,canExtend:false,auditId:'A'}).includes('↶'),'Undo entry must remain visible when Apply eligibility is false');
assert(fn({statusKey:'PENDING_PLANNING',extensionMonths:3,extensionApplied:true,canExtend:null,auditId:'A'}).includes('↶'),'Undo entry must remain visible while eligibility is unresolved');
assert.equal(fn({statusKey:'ACCEPTED',extensionMonths:3,canExtend:null,auditId:'A'}),'');
assert.equal(vm.runInNewContext(ui.slice(start,end)+'\nextensionControls',{actorRole:'Auditor',esc:String,extensionAppliedState:r=>!!(r.extensionApplied||r.extApplied)})({statusKey:'PENDING_PLANNING',extensionMonths:3,auditId:'A'}),'');
assert(ui.includes('window.dispatchEvent(new CustomEvent("ams:open-company-scopes"'),'Multi-scope action must navigate to the selected company scopes');
assert(ui.includes('runSingleScopeExtension20(button)'),'single-scope click must execute direct verified scope command');
assert(ui.includes("['FIRESTORE_VERIFIED','DEV_MODEL_C_DIRECT'].includes(data.mode)"),'single-scope action must explicitly accept only verified Firestore or isolated direct DEV authority');
assert(!ui.includes("fetch('/api/v1/manager/extension-direct'"),'grid may not invoke the unsafe legacy writer');
assert(ui.includes("fetch('/api/v1/manager/extension-obligation-command'"),'single-scope action must use the canonical per-obligation command directly');
assert(ui.includes("extPost('/api/v1/manager/extension-obligation-command'"),'scope dossier must send canonical per-obligation command');
assert(backend.includes("u.pathname==='/api/v1/manager/extension-direct'"),'legacy backend route remains independently fenced');
assert(backend.includes("if(process.env.AMS_RUNTIME_ENV==='PROD')throw new Error('PROD_LIFECYCLE_CANONICAL_WRITER_REQUIRED')"));
const runStart=ui.indexOf('async function runSingleScopeExtension20(button){');
const runEnd=ui.indexOf('function grid4ScopeBadges(r){',runStart);
const alerts=[],row={auditId:'A',companyUid:'C',statusKey:'PENDING_PLANNING'};
const context={all:[row],busyAudits:new Set(),window:{crypto:{randomUUID:()=> 'request'},alert:m=>alerts.push(m)},
 fetch:async url=>url.includes('extension-obligations')
  ?{ok:true,json:async()=>({ok:true,mode:'DEV_MODEL_C_DIRECT',records:[{auditId:'A',auditIds:['A'],obligationId:'O',revision:0,extensionApplied:true,canUndo:true,extensionTransactionId:'TX'}]})}
  :{ok:false,json:async()=>({error:'PORTAL_INTEGRATION_FAILED'})}};
const run=vm.runInNewContext(ui.slice(runStart,runEnd)+'\nrunSingleScopeExtension20',context);
await run({dataset:{auditId:'A'},disabled:false});
assert.match(alerts[0],/outcome not confirmed.*Do not retry/i,'failed command response must not claim no write occurred');
console.log('PASS Fase 1.2 manager Extension/Undo visibility and safe DEV endpoint');

for(const command of ['apply','undo']){
 let clock=0,feedback='',log;
 const urls=[],changes=[];
 const context={
  all:[row],busyAudits:new Set(),Date:{now:()=>clock},
  console:{info:(prefix,json)=>{assert.equal(prefix,'[AMS_EXT_CLIENT_TIMING]');log=JSON.parse(json)}},
  window:{crypto:{randomUUID:()=> 'request'},alert:message=>assert.fail(message)},
  document:{getElementById:()=>({set textContent(value){feedback=value}})},
  mergeRowInPlace:()=>{},updateExtendedScopeCodes20:(id,scope,applied)=>changes.push({scope,applied}),
  fetch:async(url,options)=>{
   urls.push(url);
   if(url.includes('extension-obligations')){
    clock+=700;
    return {ok:true,json:async()=>({ok:true,mode:'DEV_MODEL_C_DIRECT',records:[{
     auditId:'A',auditIds:['A'],obligationId:'O',scopeCode:'MPS-GAP',revision:1,
     extensionApplied:command==='undo',canApply:command==='apply',canUndo:command==='undo',extensionTransactionId:'TX'
    }]})};
   }
   assert.equal(JSON.parse(options.body).command,command);
   clock+=2400;
   return {ok:true,json:async()=>({success:true,direct:true,projection:'PROJECTED',operationId:'OP',
    patch:{extensionApplied:command==='apply'}})};
  }
 };
 const execute=vm.runInNewContext(ui.slice(runStart,runEnd)+'\nrunSingleScopeExtension20',context);
 await execute({dataset:{auditId:'A'},disabled:false});
 assert.deepEqual(log,{entry:'single',command,sourceMs:700,commandMs:2400,totalMs:3100,projected:true});
 assert.match(feedback,/3\.1 s$/,'show full measured action, not just command time');
 assert.equal(urls.length,2,'timing adds no requests or legacy reconcile');
 assert.deepEqual(changes,[{scope:'MPS-GAP',applied:command==='apply'}]);
}

const actionStart=ui.indexOf(' async function extAction(o,command,button){');
const actionEnd=ui.indexOf(' function showExtObligations(data){',actionStart);
assert(actionStart>=0&&actionEnd>actionStart);
for(const command of ['apply','undo']){
 for(const fail of [false,true]){
  let clock=0,log,refreshes=0,feedback={textContent:'',dataset:{}};
  const changes=[],patch={scopeChanges:['MPS-GAP','GRASP'].map(scopeCode=>({scopeCode,extensionApplied:command==='apply'}))};
  const context={
   Date:{now:()=>clock},extBusy:false,extSelectedUid:'C',extCurrent:()=>true,
   window:{crypto:{randomUUID:()=> 'request'}},
   console:{info:(prefix,json)=>{assert.equal(prefix,'[AMS_EXT_CLIENT_TIMING]');log=JSON.parse(json)}},
   extContent:{querySelector:()=>feedback,prepend:()=>{}},
   extPost:async(url,body)=>{
    assert.equal(url,'/api/v1/manager/extension-obligation-command');
    assert.equal(body.command,command);
    clock+=2400;
    if(fail)throw Error('COMMAND_FAILED');
    return {operationId:'OP',direct:true,projection:'PROJECTED',patch};
   },
   mergeRowInPlace:()=>{},updateExtendedScopeCodes20:(id,scope,applied)=>changes.push({scope,applied}),
   loadExtObligations:async()=>{refreshes++;clock+=1000;feedback={textContent:'Fresh authoritative obligations',dataset:{}}},
   el:()=>({}),Array,Object,String,Number
  };
  const execute=vm.runInNewContext(ui.slice(actionStart,actionEnd)+'\nextAction',context);
  await execute({auditId:'A',obligationId:'O',revision:1,canApply:true,canUndo:true},command,null);
  if(fail){
   assert.equal(log.projected,false);
   assert.equal(refreshes,0);
   assert.equal(changes.length,0);
   assert.match(feedback.textContent,/No scope change confirmed.*COMMAND_FAILED/);
   assert.doesNotMatch(feedback.textContent,/verified/);
  }else{
   assert.deepEqual(log,{entry:'dossier',command,commandMs:2400,refreshMs:1000,totalMs:3400,projected:true});
   assert.equal(refreshes,1,'authoritative refresh remains mandatory');
   assert.match(feedback.textContent,/verified.*2\.4 s$/,'verified feedback is reported before the background refresh');
   assert.deepEqual(changes,['MPS-GAP','GRASP'].map(scope=>({scope,applied:command==='apply'})));
  }
 }
}
console.log('EXT client timings: measured single/paired Apply/Undo, full refresh and failure honesty PASS');
