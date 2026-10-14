'use strict';
const {enforceAmsRotationAtWrite20}=require('./rotation-ams-write-integration-20');
// Integration boundary for an existing canonical writer. The same lock MUST cover
// source reads, policy enforcement and the actual mutation. No mutation on WARN.
async function commitAuditWithRotation20({withWriterLock,loadSheets,commitAudit,companyUid,auditorUid,auditId,scopeKeys}={}){
 if(typeof withWriterLock!=='function'||typeof loadSheets!=='function'||typeof commitAudit!=='function')throw Error('ROTATION_WRITER_INTEGRATION_MISSING');
 return withWriterLock(async()=>{
  const check=await enforceAmsRotationAtWrite20({loadSheets,phase:'COMMIT',companyUid,auditorUid,auditId,scopeKeys});
  if(check.decision!=='ALLOW')throw Error('ROTATION_WRITER_NOT_ALLOWED');
  return commitAudit({companyUid,auditorUid,auditId,scopeKeys,rotationDecision:check});
 });
}
module.exports={commitAuditWithRotation20};
