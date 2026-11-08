/** DEV-only pilot: constructs an audit-scoped promotion receipt after source and
 * Firestore parity. Never treats this as a global writer cutover.
 * An operator attestation is required because GAS triggers are not introspectable
 * from the Cloud Run service. Caller must validate live DEV System_Config and IAP.
 */
import {selectScopeExtensionDevPilot20} from './model-c-scope-extension-dev-pilot-20.mjs';
const txt=x=>String(x??'').trim();
export function prepareScopeExtensionDevPilotPromotion20({
 manifest,verifiedParity,sourceFrozen,selectedAuditId,typedApproval,
 operatorWriterFreezeAttested=false,liveDevGuardEvidenceRef=''
}={}){
 if(sourceFrozen!==true||verifiedParity?.parity!==true
 ||verifiedParity?.counts?.obligation!==199||verifiedParity?.counts?.auditcontext!==105
 ||verifiedParity?.counts?.event!==0||verifiedParity?.counts?.outbox!==0)throw Error('EXT_PILOT_LIVE_PARITY_REQUIRED');
 const choice=selectScopeExtensionDevPilot20({manifest,expectedSha256:manifest?.sourceManifest});
 const match=choice.candidates.filter(x=>x.auditId===selectedAuditId);
 if(match.length!==1||!txt(selectedAuditId)||match[0].sourceManifestSha256!==manifest.sourceManifest)throw Error('EXT_PILOT_AUDIT_NOT_ELIGIBLE');
 if(typedApproval!=='PROMOTE '+selectedAuditId+' DEV EXT'||operatorWriterFreezeAttested!==true
 ||!/^DEV_GAS_DIAGNOSTIC_2026-11-08T15:43:12Z_SYSTEM_CONFIG_BLOCK$/.test(txt(liveDevGuardEvidenceRef)))throw Error('EXT_PILOT_EXPLICIT_ATTESTATION_REQUIRED');
 const item=match[0];
 // This is a bounded operator-attested DEV pilot, NOT independent proof of
 // every historical script revision or a license for global context promotion.
 return Object.freeze({
  promotionPrepared:true,readOnly:true,cutoverApproved:false,projectId:'audit-management-system-dev',
  sourceSnapshotSha256:manifest.sourceManifest,
  writerFreezeEvidenceRef:liveDevGuardEvidenceRef+'__PILOT_ONLY',
  sourceParityEvidenceRef:'DEV_FROZEN_SOURCE_'+manifest.sourceManifest,
  seedParityEvidenceRef:'FIRESTORE_304_FULL_PARITY_'+manifest.sourceManifest,
  pilotOnly:true,globalWriterCutoverAuthorized:false,
  promotions:[{auditId:item.auditId,companyUid:item.companyUid,obligationIds:[item.obligationId],
    expectedRevision:0,sourceSnapshotSha256:manifest.sourceManifest,writerFenceVerified:true}]
 });
}
