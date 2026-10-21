import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../../Swap20CombinedEcasDigest.js',import.meta.url),'utf8');
let verified=0,prepared=0;
const ctx={String,JSON,Array,Error,
 ECAS20_VerifyPersistedCommunication_:(id,receipt)=>{verified++;return receipt==='proof-'+id;},
 StatusNotificationBridge_PrepareEcasChangeCancel_:(_,before,after,reason)=>{prepared++;return {ok:true,payload:{auditId:before.auditId,previousBlocks:before.blocks,blocks:after.blocks,ecasComment:reason}};}};
runInNewContext(src,ctx);
const op={operationId:'swap-11111111',auditA:'A',auditB:'B',ecasComment:'Changed after auditor approval'};
function change(id){return {before:{auditId:id,communicationId:'proof-'+id,planningDigest:'hash-'+id,communicatedToEcas:true,blocks:[{date:'2026-10-20'}]},after:{auditId:id,blocks:[{date:'2026-10-21'}]}};}
const result=ctx.Swap20_prepareCombinedEcasDigest_(op,[change('A'),change('B')]);
assert.equal(result.combined,true);
assert.equal(result.items.length,2);
assert.equal(result.queueAllowed,false);
assert.equal(verified,2);assert.equal(prepared,2);
const invalid=change('B');invalid.before.communicationId='unverified';
assert.throws(()=>ctx.Swap20_prepareCombinedEcasDigest_(op,[change('A'),invalid]),/unverified/);
assert.throws(()=>ctx.Swap20_prepareCombinedEcasDigest_(op,[change('A'),change('A')]),/identity/);
assert.throws(()=>ctx.Swap20_prepareCombinedEcasDigest_(op,[change('A')]),/Exactly two/);
console.log('SWAP combined ECAS digest provenance contract tests passed');
