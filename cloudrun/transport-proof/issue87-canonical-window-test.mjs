import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const fn=source.match(/function selectedVisitWindow\(\)\{[\s\S]*?(?=function renderAvailability\()/)?.[0];
assert.ok(fn,'planning window function must remain defined');
const ctx={
 composition20:{mode:'TOGETHER',scopes:[
  {windowFrom:'2027-01-01',windowTo:'2027-03-31'},
  {windowFrom:'2027-02-01',windowTo:'2027-04-30'}
 ]},
 model:{data:{audit:{planningWindowFrom:'2027-01-01',planningWindowTo:'2027-12-31'}}},
 visitAuditIds:new Set(),
 compositionDate20:raw=>{const x=String(raw||'');return /^\d{4}-\d{2}-\d{2}$/.test(x)?x:''}
};
runInNewContext(fn+';this.getWindow=selectedVisitWindow;',ctx);
const normal=ctx.getWindow();
assert.equal(normal.from,'2027-02-01');
assert.equal(normal.to,'2027-03-31');
assert.equal(normal.valid,true);
ctx.composition20.scopes[1].windowFrom='2027-04-01';
assert.equal(ctx.getWindow().valid,false,'disjoint scope windows must block Together');
ctx.composition20.scopes[1].windowFrom='';
assert.equal(ctx.getWindow().valid,false,'missing scope window must fail closed');
ctx.composition20.mode='SEPARATELY';
ctx.composition20.selectedScope='b';
ctx.composition20.scopes[1].obligationId='b';
ctx.composition20.scopes[1].windowFrom='2027-04-01';
const separate=ctx.getWindow();
assert.equal(separate.from,'2027-04-01','separate scope uses only its own date window');
assert.equal(separate.to,'2027-04-30');
assert.equal(separate.valid,true);
assert.ok(source.includes("policy.requiresScopeAllocation&&!['TOGETHER','SEPARATELY'].includes(composition20?.mode)"),
 'already validated canonical scope allocations must not report legacy warning');
console.log('Issue #87: canonical scope windows and off-site warning parity PASS');
