// Issue #45 — read-only cutover reconciliation; never authorizes a write.
// Compare the entire canonical audit identity and ownership surface, not merely status.
import {createHash} from 'node:crypto';
const norm=v=>String(v??'').trim();
const canonicalFields=['auditId','status','auditorUid','assignedTo','planningJson','lastDecisionTimestamp','statusSince'];
export function reconcileLifecycleCanonicalParity20({sheets=[],firestore=[],expectedAuditIds=[],sheetsWriterDisabled=false,gasWriterDisabled=false,managerWriterFenced=false}={}){
  const errors=[],byId=(rows,side)=>{
    if(!Array.isArray(rows)){errors.push(side+'_ROWS_INVALID');return new Map();}
    const m=new Map();
    for(const row of rows){
      const id=norm(row?.auditId);
      if(!id){errors.push(side+'_AUDIT_ID_MISSING');continue}
      if(m.has(id)){errors.push(side+'_DUPLICATE_AUDIT_ID:'+id);continue}
      m.set(id,row);
    }
    return m;
  };
  const a=byId(sheets,'SHEETS'),b=byId(firestore,'FIRESTORE');
  if(!Array.isArray(expectedAuditIds)||!expectedAuditIds.length)errors.push('EXPECTED_AUDIT_SET_REQUIRED');
  const expected=new Set(expectedAuditIds.map(norm).filter(Boolean));
  if(expected.size!==expectedAuditIds.length)errors.push('EXPECTED_AUDIT_IDS_DUPLICATE_OR_BLANK');
  for(const id of expected){
    if(!a.has(id))errors.push('SHEETS_AUDIT_MISSING:'+id);
    if(!b.has(id))errors.push('FIRESTORE_AUDIT_MISSING:'+id);
    if(a.has(id)&&b.has(id))for(const field of canonicalFields){
      const x=norm(a.get(id)?.[field]),y=norm(b.get(id)?.[field]);
      if(x!==y)errors.push('CANONICAL_FIELD_MISMATCH:'+id+':'+field);
    }
  }
  for(const id of a.keys())if(!expected.has(id))errors.push('SHEETS_UNEXPECTED_AUDIT:'+id);
  for(const id of b.keys())if(!expected.has(id))errors.push('FIRESTORE_UNEXPECTED_AUDIT:'+id);
  if(sheetsWriterDisabled!==true)errors.push('SHEETS_WRITER_NOT_DISABLED');
  if(gasWriterDisabled!==true)errors.push('GAS_WRITER_NOT_DISABLED');
  if(managerWriterFenced!==true)errors.push('MANAGER_WRITER_NOT_FENCED');
  const equal=errors.length===0;
  const fingerprint=createHash('sha256').update(JSON.stringify([...expected].sort().map(id=>[id,...canonicalFields.map(f=>norm(a.get(id)?.[f]))]))).digest('hex');
  return Object.freeze({ok:equal,readOnly:true,checkedAudits:expected.size,fingerprint,errors});
}
