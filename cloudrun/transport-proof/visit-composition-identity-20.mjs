/** Issue #87: deterministically derive a new Visit Audit ID.
 * This is an identity proposal, NOT issuance or permission to commit.
 * Caller must check complete canonical Audit planning IDs under a global
 * write gate, and commit the new Firestore audit with expectedRevision:null.
 */
import {createHash} from 'node:crypto';
const str=x=>String(x??'').trim();
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
export function deriveVisitSplitIdentity20({sourceAuditId,obligationId,sourceRevision}={}){
 const source=str(sourceAuditId),obligation=str(obligationId),revision=str(sourceRevision);
 if(!source||!obligation||source.length>140||source==='.'||source==='..'||
    source.includes('/')||source.includes('\\')||
    obligation.length>180||obligation==='.'||obligation==='..'||
    obligation.includes('/')||obligation.includes('\\')||
    !/^[a-f0-9]{24}$/.test(revision))
  fail('COMPOSITION_IDENTITY_SOURCE_INVALID');
 const digest=createHash('sha256').update(JSON.stringify(['AMS_VISIT_COMPOSITION_20',source,obligation,revision])).digest('hex').slice(0,24);
 const auditId=source+'_SPLIT_'+digest;
 if(auditId.length>180||auditId===source)
  fail('COMPOSITION_IDENTITY_LENGTH_INVALID');
 return Object.freeze({auditId,sourceAuditId:source,obligationId:obligation,
  identityIssuedBy:'CANONICAL',identityIssueRevision:revision,
  writeEnabled:false,requiresAuditIdCollisionCheck:true,
  requiresFirestoreCreateCAS:true});
}
