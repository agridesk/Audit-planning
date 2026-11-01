import {createHash} from 'node:crypto';
const str=x=>String(x??'').trim();
export function previewSeparateVisits20({auditId,companyUid,obligations,expectedRevision}){
 if(!str(auditId)||!str(companyUid)||!str(expectedRevision)||!Array.isArray(obligations)||obligations.length<2)throw Error('SPLIT_INPUT_INVALID');
 const seen=new Set(),visits=[];
 for(const o of obligations){const id=str(o.obligationId),scope=str(o.scopeCode);if(!id||!scope||seen.has(id)||str(o.companyUid)!==companyUid||str(o.auditId)!==auditId||str(o.linkState).toUpperCase()!=='ACTIVE')throw Error('SPLIT_OBLIGATION_INVALID');seen.add(id);
  const visitId='VIS-'+createHash('sha256').update(['AMS_SPLIT_V1',auditId,companyUid,id].join('|')).digest('hex').slice(0,20).toUpperCase();
  visits.push({visitId,sourceAuditId:auditId,companyUid,obligationId:id,scopeCode:scope,requiredMinutes:o.requiredMinutes,expectedRevision,proposedState:'PENDING_PLANNING'});
 }
 return{auditId,composition:'SEPARATE',visits,readOnly:true,commitAllowed:false,requiresAtomicRelink:true,requiresDistinctAuditIds:true,legacyAuditUnchanged:true};
}
