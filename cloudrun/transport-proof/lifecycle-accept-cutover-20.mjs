// Issue #45: DEV Auditor ACCEPT direct-write cutover guard.
// No canonical mutation is authorized until one-writer proof is supplied.
// This module must not share SWAP state, locks or collections.
export function assertAuditorAcceptCutover20({
  environment, enabled, canonicalOwner, gasAcceptDisabled,
  managerAcceptFenced, sharedFenceVerified, outboxVerified,
  auditorUid, auditId, expectedRevision
}={}){
  if(environment!=='DEV')throw Error('AUDITOR_ACCEPT_DIRECT_DEV_ONLY');
  if(enabled!==true)throw Error('AUDITOR_ACCEPT_DIRECT_DISABLED');
  if(canonicalOwner!=='CLOUD_RUN')throw Error('AUDITOR_ACCEPT_WRITER_OWNER_UNVERIFIED');
  if(gasAcceptDisabled!==true)throw Error('AUDITOR_ACCEPT_GAS_WRITER_STILL_ACTIVE');
  if(managerAcceptFenced!==true)throw Error('AUDITOR_ACCEPT_MANAGER_WRITER_UNFENCED');
  if(sharedFenceVerified!==true)throw Error('AUDITOR_ACCEPT_SHARED_FENCE_UNVERIFIED');
  if(outboxVerified!==true)throw Error('AUDITOR_ACCEPT_DURABLE_OUTBOX_UNVERIFIED');
  if(!/^[A-Za-z0-9_-]{8,128}$/.test(String(auditorUid||'')))throw Error('AUDITOR_ACCEPT_UID_INVALID');
  if(!/^[A-Za-z0-9_-]{1,256}$/.test(String(auditId||'')))throw Error('AUDITOR_ACCEPT_AUDIT_ID_INVALID');
  if(!/^[a-f0-9]{24}$/.test(String(expectedRevision||'')))throw Error('AUDITOR_ACCEPT_REVISION_REQUIRED');
  return true;
}
