import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const src=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const a=src.indexOf('async function toggleSelfPlanning20(button){');
const b=src.indexOf('\nfunction bindActionButtons',a);
assert(a>=0&&b>a);
const body=src.slice(a,b);
const auditId='AUD_POST_EXT';
const run=async ({freshRevision='rev-after-extension',freshValue='No',status='PENDING_PLANNING',writeOk=true,missing=false}={})=>{
 const calls=[],alerts=[],patches=[],button={disabled:false,getAttribute:k=>k==='data-audit-id'?auditId:k==='data-next'?'true':''};
 const ctx={button,all:[{auditId,sourceRevision:'rev-before-extension',allowSelfPlanning:'No'}],
  busyAudits:new Set(),window:{alert:t=>alerts.push(t)},
  mergeRowInPlace:(id,p)=>patches.push({id,...p}),
  fetch:async (url,options)=>{
   calls.push({url,options});
   if(url==='/api/v1/manager/open')return {ok:true,json:async()=>({success:true,rows:[{auditId,statusKey:status,sourceRevision:missing?'':freshRevision,allowSelfPlanning:freshValue}]})};
   if(url==='/api/v1/manager/self-planning-direct')return {ok:writeOk,json:async()=>writeOk?({success:true,sourceRevision:'rev-next',allowSelfPlanning:true}):({success:false,error:'CAS_CONFLICT'})};
   throw Error('Unexpected URL');
  }};
 vm.createContext(ctx);vm.runInContext(body,ctx);
 await ctx.toggleSelfPlanning20(button);
 return {calls,alerts,patches,button};
};
const good=await run();
assert.equal(good.alerts.length,0);
assert.equal(good.calls.length,2);
assert.equal(good.calls[0].url,'/api/v1/manager/open');
assert.equal(JSON.parse(good.calls[1].options.body).expectedRevision,'rev-after-extension');
assert.equal(good.patches[0].sourceRevision,'rev-next');
assert.equal(good.button.disabled,false);
const missing=await run({missing:true});
assert.equal(missing.calls.length,1);
assert.match(missing.alerts[0],/source revision missing/);
assert.equal(missing.button.disabled,false);
const changed=await run({freshValue:'Yes'});
assert.equal(changed.calls.length,1,'Already-current state needs no second write');
assert.equal(changed.alerts.length,0);
const noStatus=await run({status:'APPROVED'});
assert.equal(noStatus.calls.length,1);
assert.match(noStatus.alerts[0],/no longer Pending Planning/);
const conflict=await run({writeOk:false});
assert.equal(conflict.calls.length,2);
assert.match(conflict.alerts[0],/CAS_CONFLICT/);
console.log('Manager self-planning post EXT/Undo fresh revision and fail-visible regression PASS');
