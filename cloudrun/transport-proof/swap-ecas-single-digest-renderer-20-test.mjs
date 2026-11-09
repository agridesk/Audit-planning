import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../../NotificationRenderer_PlanningToClientDigest.js',import.meta.url),'utf8');
const begin=source.indexOf('function NB_renderExternalOperationalDigest_(');
const end=source.indexOf('function NB_externalOperationalSubject_(',begin);
assert.ok(begin>=0&&end>begin);
let normalized=0,tableCalls=0,swapSectionCalls=0,journalChecks=0,ownershipChecks=0;
const ctx={
 Error,String,Array,JSON,
 NB_normalizePayload_:(event,child)=>{normalized++;return {...child,eventCode:event};},
 NB_getEventConfig_:()=>({active:true}),
 NB_externalValidateDigestItems_:items=>({validItems:items,invalid:[]}),
 NB_externalOperationalSubject_:()=> 'ECAS digest',
 NB_assertCommittedSwapJournal_:id=>{assert.equal(id,'op1');journalChecks++;},
 NB_assertEcasSwapScopeOwnership_:()=>{ownershipChecks++;},
 NB_renderEcasSwapsSectionHtml_:items=>{swapSectionCalls++;return '<section>'+items.map(i=>i.auditId).join(',')+'</section>';},
 NB_renderEcasSwapsSectionText_:items=>items.map(i=>i.auditId).join(','),
 NB_renderExternalOperationalTableHtml_:items=>{tableCalls++;return items.map(i=>i.auditId).join(',');},
 NB_renderExternalOperationalTableText_:items=>items.map(i=>i.auditId).join(','),
 NB_externalShellStart_:()=>'<html>',NB_externalShellEnd_:()=>'</html>'};
runInNewContext(source.slice(begin,end),ctx);
const child=id=>({eventType:'ECAS_AUDIT_CHANGED_DIGEST',auditId:id,company:id,blocks:[{date:'2026-10-21'}]});
const result=ctx.NB_renderExternalOperationalDigest_('planning@example.test',
 [{auditId:'SWAP_op1',operationId:'op1',eventType:'ECAS_AUDIT_CHANGED_DIGEST',swapItems:[child('A'),child('B')]}]);
assert.match(result.body,/A,B/);
assert.equal(normalized,2);
assert.equal(tableCalls,0);
assert.equal(swapSectionCalls,1);
assert.equal(journalChecks,1);
assert.equal(ownershipChecks,2);
assert.throws(()=>ctx.NB_renderExternalOperationalDigest_('planning@example.test',
 [{auditId:'SWAP_op1',operationId:'op1',eventType:'ECAS_AUDIT_CHANGED_DIGEST',swapItems:[child('A')]}]),/exactly two/);
assert.throws(()=>ctx.NB_renderExternalOperationalDigest_('planning@example.test',
 [{auditId:'SWAP_op1',operationId:'op1',eventType:'ECAS_AUDIT_CHANGED_DIGEST',swapItems:[child('A'),child('A')]}]),/collision/);
console.log('SWAP one-email, two-audit ECAS renderer tests passed');
