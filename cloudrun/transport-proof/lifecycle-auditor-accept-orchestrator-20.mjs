// Issue #45: complete DEV Auditor Accept cutover orchestration.
// The active Sheets route is deliberately untouched until its writer is retired.
// Every side-effect follows fresh canonical source proof and identity verification.
import {prepareDirectAuditorAccept20} from './lifecycle-auditor-accept-direct-20.mjs';
import {atomicAcceptCommit20} from './lifecycle-atomic-accept-20.mjs';
import {reconcileLifecycleCanonicalParity20} from './lifecycle-canonical-parity-20.mjs';

const fail=code=>{throw Error(code)};
export function createAuditorAcceptOrchestrator20({
  inspectSource,inspectRoster,inspectFirestore,inspectCutover,
  getToken,fetchImpl,now=()=>new Date().toISOString(),
  write=atomicAcceptCommit20
}={}){
  if([inspectSource,inspectRoster,inspectFirestore,inspectCutover,getToken,write].some(f=>typeof f!=='function'))
    fail('ACCEPT_CANONICAL_DEPENDENCIES_REQUIRED');
  return async function accept({actor,auditId,expectedRevision,operationId}={}){
    if(!actor||actor.role!=='AUDITOR'||!actor.auditorUid||!actor.email||!auditId||!expectedRevision||!operationId)
      fail('ACCEPT_REQUEST_INVALID');
    // Cutover evidence must originate from an authoritative read on every request,
    // never browser flags, process memory or an environment variable.
    const state=await inspectCutover();
    if(state?.environment!=='DEV'||state?.canonicalSource!=='FIRESTORE'||state?.sourceRetirementVerified!==true)
      fail('ACCEPT_CANONICAL_CUTOVER_NOT_VERIFIED');
    if(state.gasAcceptDisabled!==true||state.managerAcceptFenced!==true||state.sharedFenceVerified!==true||state.outboxVerified!==true)
      fail('ACCEPT_CONCURRENT_WRITER_NOT_FENCED');
    const [source,roster,firestore]=await Promise.all([
      inspectSource(auditId),inspectRoster(actor.auditorUid),inspectFirestore(auditId)
    ]);
    if(source?.auditId!==auditId||firestore?.auditId!==auditId||!firestore.updateTime)
      fail('ACCEPT_SOURCE_IDENTITY_UNVERIFIED');
    // Per-record parity is necessary but not a claim of full migration parity.
    const parity=reconcileLifecycleCanonicalParity20({
      sheets:[source.canonical],firestore:[firestore.canonical],
      expectedAuditIds:[auditId],
      sheetsWriterDisabled:state.sourceRetirementVerified,
      gasWriterDisabled:state.gasAcceptDisabled,
      managerWriterFenced:state.managerAcceptFenced
    });
    if(!parity.ok)fail('ACCEPT_SOURCE_PARITY_FAILED:'+parity.errors.join(','));
    const cutover={...state,canonicalOwner:'CLOUD_RUN',enabled:true,expectedRevision,auditorUid:actor.auditorUid};
    const planned=prepareDirectAuditorAccept20({
      cutover,actor,audit:source,roster,now:now()
    });
    if(planned.auditId!==auditId)fail('ACCEPT_PREPARED_ID_MISMATCH');
    return write({
      cutover,canonicalSource:'FIRESTORE',sourceRetirementVerified:true,
      project:state.project,auditId,operationId,expectedRevision,
      updateTime:firestore.updateTime,actorEmail:actor.email,now:now(),getToken,fetchImpl
    });
  };
}
