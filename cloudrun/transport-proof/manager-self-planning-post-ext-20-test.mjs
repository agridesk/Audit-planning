import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const src=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const a=src.indexOf('function gridActionError20(');
const b=src.indexOf('\nfunction bindActionButtons',a);
assert(a>=0&&b>a);
const readStart=src.indexOf('async function readGridActionResult20(');
const readEnd=src.indexOf('function removeCompletedRowInPlace',readStart);
const body=src.slice(a,b)+src.slice(readStart,readEnd);
const auditId='AUD_POST_EXT';
const run=async ({gridRevision='',freshRevision='rev-after-extension',freshValue='No',status='PENDING_PLANNING',writeOk=true,writeOutcome='NOT_COMMITTED',missing=false}={})=>{
 const calls=[],notice={textContent:''},patches=[],button={disabled:false,getAttribute:k=>k==='data-audit-id'?auditId:k==='data-next'?'true':''};
 const ctx={button,URLSearchParams,crypto,performance,requestAnimationFrame:fn=>fn(),console,all:[{auditId,statusKey:'PENDING_PLANNING',sourceRow:42,sourceRevision:gridRevision,allowSelfPlanning:'No'}],
  busyAudits:new Set(),document:{getElementById:()=>notice},
  mergeRowInPlace:(id,p)=>patches.push({id,...p}),
  fetch:async (url,options)=>{
   calls.push({url,options});
   if(url.startsWith('/api/v1/manager/self-planning-state?'))return {ok:true,json:async()=>({success:true,auditId,statusKey:status,sourceRevision:missing?'':freshRevision,allowSelfPlanning:freshValue})};
   if(url==='/api/v1/manager/self-planning-direct')return {ok:writeOk,json:async()=>writeOk?({success:true,sourceRevision:'rev-next',allowSelfPlanning:true}):({success:false,error:'CAS_CONFLICT',writeOutcome,reference:'ref-20'})};
   throw Error('Unexpected URL');
  }};
 vm.createContext(ctx);vm.runInContext(body,ctx);
 await ctx.toggleSelfPlanning20(button);
 return {calls,notice:notice.textContent,patches,button};
};
const good=await run();
assert.equal(good.notice,'');
assert.equal(good.calls.length,2);
assert.equal(good.calls[0].url,'/api/v1/manager/self-planning-state?auditId=AUD_POST_EXT&sourceRow=42');
assert.equal(JSON.parse(good.calls[1].options.body).expectedRevision,'rev-after-extension');
assert.equal(good.patches[0].sourceRevision,'rev-next');
assert.equal(good.button.disabled,false);
const direct=await run({gridRevision:'grid-revision'});
assert.deepEqual(direct.calls.map(call=>call.url),['/api/v1/manager/self-planning-direct']);
assert.equal(JSON.parse(direct.calls[0].options.body).expectedRevision,'grid-revision');
assert.equal(JSON.parse(direct.calls[0].options.body).expectedAllowSelfPlanning,false);
const stale=await run({gridRevision:'stale-grid-revision',writeOk:false});
assert.equal(stale.calls.length,1);
assert.equal(stale.patches.length,0);
assert.match(stale.notice,/Change rejected before saving/);
const missing=await run({missing:true});
assert.equal(missing.calls.length,1);
assert.match(missing.notice,/source revision missing/);
assert.equal(missing.button.disabled,false);
const changed=await run({freshValue:'Yes'});
assert.equal(changed.calls.length,1,'Already-current state needs no second write');
assert.equal(changed.notice,'');
const noStatus=await run({status:'APPROVED'});
assert.equal(noStatus.calls.length,1);
assert.match(noStatus.notice,/no longer Pending Planning/);
const conflict=await run({writeOk:false});
assert.equal(conflict.calls.length,2);
assert.match(conflict.notice,/CAS_CONFLICT/);
console.log('Manager self-planning post EXT/Undo fresh revision and fail-visible regression PASS');

assert.match(conflict.notice,/Change rejected before saving.*Reference: ref-20/);
assert.equal(conflict.button.disabled,false);
const uncertain=await run({writeOk:false,writeOutcome:'UNKNOWN'});
assert.match(uncertain.notice,/Save outcome unconfirmed.*Reference: ref-20/);
assert.equal(uncertain.button.disabled,true);
assert.equal(uncertain.patches.length,0);
