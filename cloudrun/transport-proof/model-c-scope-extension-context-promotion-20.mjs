/** DEV-only, non-authorizing Model C promotion plan.
 * Seeded Firestore obligations remain read-only until an independently verified
 * source freeze and fresh complete parity proof exist. Pure: never writes.
 */
import {createHash} from 'node:crypto';
const text=x=>String(x??'').trim();
const digest=x=>/^[0-9a-f]{64}$/.test(text(x));
const uniq=x=>new Set(x).size===x.length;
const status=x=>text(x).toUpperCase().replace(/[\s-]+/g,'_');
/**
 * Pure adapter for the actual 304-document DEV stage-1 manifest.
 * It DOES NOT prove a writer freeze or grant cutover; those remain independent
 * mandatory inputs to prepareScopeExtensionContextPromotion20.
 */
export function adaptScopeExtensionStagedManifestForPromotion20(manifest){
 if(!manifest||manifest.readOnly!==true||manifest.writeAuthorized!==false||!digest(manifest.sourceManifest)
   ||!Array.isArray(manifest.obligations)||!Array.isArray(manifest.contexts)
   ||manifest.obligations.length!==199||manifest.contexts.length!==105
   ||manifest.stats?.activeLinks!==155||manifest.stats?.historicalUnlinked!==44
   ||createHash('sha256').update(JSON.stringify({obligations:manifest.obligations,contexts:manifest.contexts})).digest('hex')!==manifest.sourceManifest)throw Error('EXT_PROMOTION_STAGED_MANIFEST_INVALID');
 const documents=manifest.obligations.map(x=>({...x}));
 const auditContexts=manifest.contexts.map(x=>({...x,obligationIds:Array.isArray(x.obligationIds)?[...x.obligationIds]:null}));
 const linked=documents.filter(x=>x.linkState==='ACTIVE');
 const unlinked=documents.filter(x=>x.linkState==='UNLINKED');
 const map=new Map(documents.map(x=>[x.obligationId,x]));
 if(map.size!==199||linked.length!==155||unlinked.length!==44
   ||auditContexts.some(c=>!Array.isArray(c.obligationIds)||c.obligationIds.length<1||c.writerFenceVerified!==false||c.migrationState!=='STAGED_UNVERIFIED')
   ||linked.some(d=>!text(d.auditId)||!auditContexts.some(c=>c.auditId===d.auditId&&c.companyUid===d.companyUid&&c.obligationIds.includes(d.obligationId)))
   ||unlinked.some(d=>d.pendingProjectionId!==''||d.revision!==0))throw Error('EXT_PROMOTION_STAGED_LINEAGE_INVALID');
 return Object.freeze({readOnly:true,seedPermitted:false,cutoverApproved:false,eligibleForControlledStaging:true,
   unresolvedFailures:[],quarantinedAudits:[],documents,auditContexts,
   counts:{contexts:auditContexts.length,obligations:documents.length,activeLinks:linked.length,historicalUnlinked:unlinked.length},
   sourceManifestSha256:manifest.sourceManifest});
}
export function prepareScopeExtensionContextPromotion20({
 projectId,stage,sourceSnapshotSha256,seedReadback,sourceParity,
 writerFreeze,approval,runtime
}={}){
 if(projectId!=='audit-management-system-dev'||runtime?.repository!=='agridesk/Audit-planning'||runtime?.ref!=='refs/heads/dev'||runtime?.environment!=='ams-dev-migration'||runtime?.projectId!==projectId||runtime?.eventName!=='workflow_dispatch')throw Error('EXT_PROMOTION_DEV_RUNTIME_REQUIRED');
 if(approval!=='CONFIRM_DEV_MODEL_C_WRITER_PROMOTION')throw Error('EXT_PROMOTION_EXPLICIT_APPROVAL_REQUIRED');
 if(!stage||stage.readOnly!==true||stage.cutoverApproved!==false||stage.seedPermitted!==false||stage.eligibleForControlledStaging!==true||stage.unresolvedFailures?.length||!Array.isArray(stage.auditContexts)||!Array.isArray(stage.documents)||!Array.isArray(stage.quarantinedAudits)||!digest(sourceSnapshotSha256))throw Error('EXT_PROMOTION_STAGE_INVALID');
 if(!writerFreeze||writerFreeze.verified!==true||writerFreeze.projectId!==projectId||writerFreeze.sourceSnapshotSha256!==sourceSnapshotSha256||!text(writerFreeze.evidenceRef)||writerFreeze.allLegacyGASWritersFenced!==true||writerFreeze.allCloudRunRoutesFenced!==true||writerFreeze.sourceMutationGuardVerified!==true)throw Error('EXT_PROMOTION_WRITER_FREEZE_UNVERIFIED');
 if(!sourceParity||sourceParity.verified!==true||sourceParity.projectId!==projectId||sourceParity.snapshotSha256!==sourceSnapshotSha256||sourceParity.complete!==true||sourceParity.unexpectedDocuments!==0||sourceParity.missingDocuments!==0||sourceParity.mismatchedDocuments!==0||!text(sourceParity.evidenceRef))throw Error('EXT_PROMOTION_SOURCE_PARITY_UNVERIFIED');
 if(!seedReadback||seedReadback.verified!==true||seedReadback.projectId!==projectId||seedReadback.snapshotSha256!==sourceSnapshotSha256||seedReadback.contextCount!==stage.auditContexts.length||seedReadback.obligationCount!==stage.documents.length||seedReadback.unexpectedDocuments!==0||seedReadback.missingDocuments!==0||seedReadback.mismatchedDocuments!==0||!text(seedReadback.evidenceRef))throw Error('EXT_PROMOTION_SEEDED_PARITY_UNVERIFIED');
 const quarantine=new Set(stage.quarantinedAudits.map(x=>text(x.auditId)));
 if(quarantine.size!==stage.quarantinedAudits.length||stage.quarantinedAudits.some(x=>x.automaticRepairAllowed!==false))throw Error('EXT_PROMOTION_QUARANTINE_INVALID');
 const byObligation=new Map(),unlinked=new Set();
 for(const d of stage.documents){
  if(!text(d.obligationId)||byObligation.has(d.obligationId)||unlinked.has(d.obligationId)||!text(d.companyUid)||!text(d.scopeCode)||d.revision!==0||d.pendingProjectionId!==''||d.stagingWriterFenceVerified!==false||d.writerFenceVerified===true)throw Error('EXT_PROMOTION_DOCUMENT_INVALID');
  if(d.linkState==='UNLINKED'){unlinked.add(d.obligationId);continue}
  if(d.linkState!=='ACTIVE'||!text(d.auditId)||quarantine.has(d.auditId))throw Error('EXT_PROMOTION_DOCUMENT_INVALID');
  byObligation.set(d.obligationId,d);
 }
 const promoted=[],seen=new Set(),mapped=new Set();
 for(const ctx of stage.auditContexts){
  if(!text(ctx.auditId)||seen.has(ctx.auditId)||quarantine.has(ctx.auditId)||!text(ctx.companyUid)||ctx.writerFenceVerified!==false||ctx.migrationState!=='STAGED_UNVERIFIED'||(ctx.revision!==undefined&&ctx.revision!==0)||!Array.isArray(ctx.obligationIds)||ctx.obligationIds.length<1||ctx.obligationIds.length>100||!uniq(ctx.obligationIds))throw Error('EXT_PROMOTION_CONTEXT_INVALID');
  seen.add(ctx.auditId);
  if(!['PENDING_PLANNING','PENDING_APPROVAL','APPROVED','ACCEPTED','READY','COMPLETED','REJECTED'].includes(status(ctx.lifecycleStatus)))throw Error('EXT_PROMOTION_LIFECYCLE_UNKNOWN');
  for(const id of ctx.obligationIds){const d=byObligation.get(id);if(!d||mapped.has(id)||d.auditId!==ctx.auditId||d.companyUid!==ctx.companyUid)throw Error('EXT_PROMOTION_LINEAGE_MISMATCH');mapped.add(id)}
  promoted.push({auditId:ctx.auditId,companyUid:ctx.companyUid,obligationIds:[...ctx.obligationIds],expectedRevision:0,sourceSnapshotSha256,writerFenceVerified:true});
 }
 if(mapped.size!==byObligation.size||promoted.length!==stage.counts?.contexts||mapped.size+unlinked.size!==stage.counts?.obligations)throw Error('EXT_PROMOTION_COVERAGE_MISMATCH');
 return Object.freeze({readOnly:true,cutoverApproved:false,promotionPrepared:true,projectId,sourceSnapshotSha256,writerFreezeEvidenceRef:writerFreeze.evidenceRef,sourceParityEvidenceRef:sourceParity.evidenceRef,seedParityEvidenceRef:seedReadback.evidenceRef,counts:{contexts:promoted.length,obligations:mapped.size,unlinkedPreserved:unlinked.size,quarantined:quarantine.size},promotions:promoted});
}
