/** DEV migration import authorization is deliberately separate from staging and runtime cutover.
 * Pure validation only. No API calls or writes.
 */
import {createHash} from 'node:crypto';
const str=x=>String(x??'').trim();
const hex=x=>/^[a-f0-9]{64}$/.test(str(x));
export function prepareScopeExtensionImportGate20({stage,expectedSnapshotSha256,attestedWriterFreeze,requestApproval,runtime={}}={}){
 if(!stage||stage.readOnly!==true||stage.seedPermitted!==false||stage.cutoverApproved!==false||stage.eligibleForControlledStaging!==true||!Array.isArray(stage.auditContexts)||!Array.isArray(stage.documents)||!Array.isArray(stage.quarantinedAudits)||stage.unresolvedFailures?.length)throw Error('EXT_IMPORT_STAGE_NOT_VERIFIED');
 if(!runtime||runtime.repository!=='agridesk/Audit-planning'||runtime.ref!=='refs/heads/dev'||runtime.environment!=='ams-dev-migration'||runtime.projectId!=='audit-management-system-dev'||runtime.eventName!=='workflow_dispatch')throw Error('EXT_IMPORT_RUNTIME_CONTEXT_INVALID');
 if(!hex(expectedSnapshotSha256))throw Error('EXT_IMPORT_EXPECTED_SNAPSHOT_HASH_REQUIRED');
 const sourceDigest=createHash('sha256').update(JSON.stringify({contexts:stage.auditContexts,documents:stage.documents})).digest('hex');
 if(sourceDigest!==expectedSnapshotSha256)throw Error('EXT_IMPORT_SOURCE_SNAPSHOT_CHANGED');
 if(stage.auditContexts.length!==stage.counts?.contexts||stage.documents.length!==stage.counts?.obligations||stage.auditContexts.length<1||stage.documents.length<1)throw Error('EXT_IMPORT_COUNTS_MISMATCH');
 const quarantined=new Set(stage.quarantinedAudits.map(x=>x.auditId));
 if(quarantined.size!==stage.quarantinedAudits.length||stage.quarantinedAudits.some(x=>x.automaticRepairAllowed!==false))throw Error('EXT_IMPORT_QUARANTINE_INVALID');
 const seenContexts=new Set(),seenDocs=new Set();
 const docs=new Map(stage.documents.map(d=>{if(!str(d.obligationId)||seenDocs.has(d.obligationId))throw Error('EXT_IMPORT_DOCUMENT_DUPLICATE');seenDocs.add(d.obligationId);return[d.obligationId,d]}));
 for(const c of stage.auditContexts){
  if(!str(c.auditId)||seenContexts.has(c.auditId)||quarantined.has(c.auditId)||c.writerFenceVerified!==false||!Array.isArray(c.obligationIds)||!c.obligationIds.length||c.obligationIds.length>100)throw Error('EXT_IMPORT_CONTEXT_INVALID');
  seenContexts.add(c.auditId);
  for(const id of c.obligationIds){const d=docs.get(id);if(!d||d.auditId!==c.auditId||d.companyUid!==c.companyUid||d.revision!==0||d.linkState!=='ACTIVE'||d.pendingProjectionId!=='')throw Error('EXT_IMPORT_LINKAGE_INVALID')}
 }
 if(stage.auditContexts.reduce((n,c)=>n+c.obligationIds.length,0)!==stage.documents.length)throw Error('EXT_IMPORT_DOCUMENTS_UNLINKED');
 if(requestApproval!=='CONFIRM_DEV_STAGE_ONLY')throw Error('EXT_IMPORT_APPROVAL_REQUIRED');
 if(!attestedWriterFreeze||attestedWriterFreeze.verified!==true||attestedWriterFreeze.projectId!==runtime.projectId||attestedWriterFreeze.sourceSnapshotSha256!==sourceDigest||!str(attestedWriterFreeze.evidenceRef))throw Error('EXT_IMPORT_WRITER_FREEZE_EVIDENCE_REQUIRED');
 return Object.freeze({writeEligible:true,stageOnly:true,cutoverApproved:false,snapshotSha256:sourceDigest,contexts:stage.counts.contexts,obligations:stage.counts.obligations,quarantinedAudits:[...quarantined]});
}
