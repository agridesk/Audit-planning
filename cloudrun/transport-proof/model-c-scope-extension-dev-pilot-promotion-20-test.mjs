import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareScopeExtensionDevPilotPromotion20 as prepare} from './model-c-scope-extension-dev-pilot-promotion-20.mjs';
const contexts=Array.from({length:105},(_,i)=>({auditId:'A'+i,companyUid:'C'+i,lifecycleStatus:i===60?'PENDING_PLANNING':'APPROVED',obligationIds:['O'+i],writerFenceVerified:false,migrationState:'STAGED_UNVERIFIED',policyByScope:i===60?{GAP:{extensionMonths:3,planningFromMonths:-3,planningToMonths:-1}}:{}}));
const obligations=Array.from({length:199},(_,i)=>{const j=i<105?i:i<155?i-105:-1;if(j>=0&&i>=105)contexts[j].obligationIds.push('O'+i);
 return{obligationId:'O'+i,auditId:j>=0?'A'+j:'OLD',companyUid:j>=0?'C'+j:'HIST',scopeCode:'GAP',linkState:j>=0?'ACTIVE':'UNLINKED',
 triggerSource:'CERTIFICATE_LIFECYCLE',expiryManaged:true,revision:0,pendingProjectionId:'',extensionApplied:false,extensionMetadata:'',legacyApplyQuarantined:false,
 legacyUndoQuarantined:false,legacyDateQuarantined:false,baseExpiry:'2027-02-01',effectiveExpiry:'2027-02-01',windowFrom:'2026-12-01',windowTo:'2027-02-01'};});
const sourceManifest=createHash('sha256').update('isolated DEV fixture').digest('hex');
const manifest={readOnly:true,writeAuthorized:false,sourceManifest,obligations,contexts,stats:{activeLinks:155,historicalUnlinked:44}};
const verifiedParity={parity:true,counts:{obligation:199,auditcontext:105,event:0,outbox:0}};
const base={manifest,verifiedParity,sourceFrozen:true,selectedAuditId:'A60',typedApproval:'PROMOTE A60 DEV EXT',
 operatorWriterFreezeAttested:true,liveDevGuardEvidenceRef:'DEV_GAS_DIAGNOSTIC_2026-11-08T15:43:12Z_SYSTEM_CONFIG_BLOCK'};
const ok=prepare(base);
assert.equal(ok.promotionPrepared,true);
assert.equal(ok.cutoverApproved,false);
assert.equal(ok.pilotOnly,true);
assert.equal(ok.globalWriterCutoverAuthorized,false);
assert.equal(ok.promotions.length,1);
assert.deepEqual(ok.promotions[0].obligationIds,['O60']);
assert.equal(ok.promotions[0].expectedRevision,0);
for(const change of [
 {sourceFrozen:false},{selectedAuditId:'A0'},{typedApproval:'PROMOTE A59 DEV EXT'},
 {operatorWriterFreezeAttested:false},{liveDevGuardEvidenceRef:'UNKNOWN'},
 {verifiedParity:{...verifiedParity,parity:false}},{verifiedParity:{parity:true,counts:{...verifiedParity.counts,event:1}}}
])await assert.rejects(async()=>prepare({...base,...change}),/EXT_PILOT_/);
console.log('PASS one-audit DEV pilot promotion: frozen source, exact approval, attested GAS runtime, complete stage parity, no global cutover');
