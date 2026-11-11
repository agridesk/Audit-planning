/** Issue #87: authoritative Audit planning sourceRevision, identical to
 * server-r4 directRowRevision. Pure; no persistence or side effects.
 */
import {createHash} from 'node:crypto';
const str=x=>String(x??'').trim();
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const norm=x=>str(x).toUpperCase().replace(/[\s-]+/g,'_');
const col=(headers,names)=>headers.findIndex(h=>names.map(norm).includes(norm(h)));
const get=(row,headers,names)=>{const i=col(headers,names);return i>=0?str(row[i]):'';};
export function deriveCompositionSourceRevision20({auditId,planningRows}={}){
 if(!str(auditId)||!Array.isArray(planningRows)||planningRows.length<2||
    !Array.isArray(planningRows[0])||planningRows.some(x=>!Array.isArray(x)))
  fail('COMPOSITION_REVISION_CANONICAL_ROWS_REQUIRED');
 const headers=planningRows[0],id=col(headers,['Audit ID','Audit_ID','AuditId','Audit Id']);
 if(id<0||col(headers,['Status'])<0)fail('COMPOSITION_REVISION_CANONICAL_HEADERS_REQUIRED');
 const matches=planningRows.slice(1).filter(row=>str(row[id])===str(auditId));
 if(matches.length!==1)fail('COMPOSITION_REVISION_SOURCE_NOT_UNIQUE');
 const row=matches[0],g=names=>get(row,headers,names);
 const fields=[
  g(['Audit ID','Audit_ID','AuditId','Audit Id']),
  g(['Status']),
  g(['Assigned to','Assigned auditor','Auditor']),
  g(['Planning JSON','Planning_JSON']),
  g(['Last decision timestamp']),
  g(['Status since'])
 ];
 const auditorUid=g(['Auditor_UID','Assigned_Auditor_UID']);
 const sourceRevision=createHash('sha256').update(
  fields.join('|')+(auditorUid?'|'+auditorUid:'')
 ).digest('hex').slice(0,24);
 return Object.freeze({auditId:str(auditId),sourceRevision,
  canonicalSource:'AUDIT_PLANNING_DIRECT_ROW_REVISION',writeEnabled:false});
}
