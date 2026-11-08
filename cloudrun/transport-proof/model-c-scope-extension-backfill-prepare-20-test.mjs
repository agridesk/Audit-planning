import assert from 'node:assert/strict';
import {prepareScopeExtensionBackfill20 as prepare} from './model-c-scope-extension-backfill-prepare-20.mjs';
const oh=['Obligation_ID','Company_UID','ScopeCode','Trigger_Source','Obligation_State','Base_Expiry_Date','Effective_Expiry_Date','Planning_Window_From','Planning_Window_To','Extension_Applied','Extension_Metadata_JSON','Source_Audit_ID'];
const row=(id,company,scope,meta='',applied='',dates=['30/09/2026','30/09/2026','30/05/2026','30/09/2026'])=>
 [id,company,scope,'CERTIFICATE_LIFECYCLE','LINKED_TO_VISIT',...dates.slice(0,1),dates[1],dates[2],dates[3],applied,meta,'A1'];
const obligations=[oh,
 row('O1','C1','GAP'),
 row('O2','C1','GRASP',JSON.stringify({source:'LEGACY',months:4}),'Yes'),
 row('O3','C1','GAP',JSON.stringify({source:'LEGACY',undo:true})),
 row('O4','C2','GAP','','',['','','',''])];
const links=[['Audit_ID','Obligation_ID','Link_State'],['A1','O1','ACTIVE'],['A1','O2','ACTIVE'],['A2','O3','ACTIVE']];
const planning=[['Audit ID','Status'],['A1','Pending Planning'],['A2','Approved']];
const scopes=[['ScopeCode','Extension','Planning from','Planning to','Trigger source'],['GAP','4','-4','-1',''],['GRASP','4','-4','-2','']];
const build=(extra={})=>prepare({obligationRows:obligations,linkRows:links,planningRows:planning,scopeRows:scopes,...extra});
const manifest=build();
assert.equal(manifest.writeAuthorized,false);
assert.equal(manifest.readOnly,true);
assert.match(manifest.sourceManifest,/^[a-f0-9]{64}$/);
assert.equal(manifest.stats.sourceObligations,4);
assert.equal(manifest.stats.activeLinks,3);
assert.equal(manifest.stats.activeAudits,2);
assert.equal(manifest.stats.multiScopeAudits,1);
assert.equal(manifest.stats.pendingPlanningAudits,1);
assert.equal(manifest.stats.pendingEligibleUntouched,1);
assert.equal(manifest.stats.blockedLegacyUndo,1);
assert.equal(manifest.stats.historicalUnlinked,1);
assert.equal(manifest.stats.missingHistoricalDates,4);
assert(manifest.contexts.every(x=>x.writerFenceVerified===false&&x.migrationState==='STAGED_UNVERIFIED'));
assert(manifest.obligations.every(x=>x.revision===0&&x.pendingProjectionId===''));
assert.equal(manifest.obligations.find(x=>x.obligationId==='O2').legacyUndoQuarantined,true);
assert.equal(manifest.obligations.find(x=>x.obligationId==='O3').legacyApplyQuarantined,true);
assert.equal(manifest.obligations.find(x=>x.obligationId==='O1').baseExpiry,'2026-09-30');
assert.deepEqual(manifest.stats,build().stats,'stable counts');
assert.equal(manifest.sourceManifest,build().sourceManifest,'stable manifest digest');
assert.throws(()=>build({linkRows:[...links,['A2','O1','ACTIVE']]}),/MULTI_AUDIT_LINK/);
assert.throws(()=>build({linkRows:[...links,['UNKNOWN','O1','ACTIVE']]}),/ACTIVE_LINK_ORPHAN/);
const cross=structuredClone(obligations);cross[2][1]='C3';
assert.throws(()=>build({obligationRows:cross}),/AUDIT_CROSS_COMPANY/);
const bad=structuredClone(obligations);bad[1][7]='31/02/2026';
assert.throws(()=>build({obligationRows:bad}),/DATE_INVALID/);
const missing=structuredClone(obligations);missing[1][7]='';
assert.throws(()=>build({obligationRows:missing}),/ACTIVE_DATES_INCOMPLETE/);
const corrupt=structuredClone(obligations);corrupt[2][10]='{broken';
assert.throws(()=>build({obligationRows:corrupt}),/LEGACY_METADATA_INVALID/);
console.log('PASS pure Model C EXT backfill: normalization, lineage, provenance quarantine, no write authority and stable manifest');
