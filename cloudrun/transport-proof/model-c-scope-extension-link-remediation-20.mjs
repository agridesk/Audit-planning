/** Read-only reconciliation of historical Model C ACTIVE links. Never writes.
 * A rejected orphan is a candidate for a reviewed one-row link-state repair,
 * never an automatic data mutation. Cross-company links require manual RCA.
 */
import {createHash} from 'node:crypto';
const str=x=>String(x??'').trim();
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function table(rows,required){
 if(!Array.isArray(rows)||!Array.isArray(rows[0]))throw Error('EXT_REPAIR_TABLE_REQUIRED');
 const headers=rows[0].map(str);if(required.some(k=>!headers.includes(k))||new Set(headers).size!==headers.length)throw Error('EXT_REPAIR_SCHEMA_INVALID');
 return rows.slice(1).map((row,i)=>({row,rowNumber:i+2,record:Object.fromEntries(headers.map((k,j)=>[k,str(row?.[j])]))})).filter(x=>x.row.some(v=>str(v)));
}
export function inspectModelCLinkRemediation20({obligations,visitLinks,planning}={}){
 const os=table(obligations,['Obligation_ID','Company_UID','Source_Audit_ID','Obligation_State']);
 const ls=table(visitLinks,['Audit_ID','Obligation_ID','Link_State','Unlinked_At']);
 const as=table(planning,['Audit ID','Company_UID','Status']);
 const obs=new Map(),audits=new Map(),candidates=[],quarantine=[],linked=new Set();
 for(const x of os){if(!x.record.Obligation_ID||obs.has(x.record.Obligation_ID))throw Error('EXT_REPAIR_OBLIGATION_DUPLICATE');obs.set(x.record.Obligation_ID,x.record)}
 for(const x of as){const id=x.record['Audit ID'];if(id){if(audits.has(id))throw Error('EXT_REPAIR_AUDIT_DUPLICATE');audits.set(id,x.record)}}
 for(const item of ls){
  const row=item.record;if(row.Link_State.toUpperCase()!=='ACTIVE')continue;
  const auditId=row.Audit_ID,obligationId=row.Obligation_ID,obligation=obs.get(obligationId),audit=audits.get(auditId);
  const id=auditId+'|'+obligationId;
  if(linked.has(id)){quarantine.push({reason:'DUPLICATE_ACTIVE_VISIT_LINK',rowNumber:item.rowNumber,auditId,obligationId});continue}
  linked.add(id);
  if(!obligation||!auditId||!obligationId){quarantine.push({reason:'ACTIVE_LINK_MISSING_IDENTITY',rowNumber:item.rowNumber,auditId,obligationId});continue}
  if(!audit){
   if(obligation.Obligation_State.toUpperCase()==='REJECTED'&&obligation.Source_Audit_ID===auditId&&!row.Unlinked_At){
    candidates.push({action:'MARK_REJECTED_ORPHAN_LINK_INACTIVE',rowNumber:item.rowNumber,auditId,obligationId,expectedState:'ACTIVE',expectedUnlinkedAt:'',expectedObligationState:'REJECTED',expectedSourceAuditId:auditId,sourceRowHash:hash(item.row),requiresReview:true,writeAuthorized:false});
   }else quarantine.push({reason:'ORPHAN_WITHOUT_VERIFIED_REJECTION',rowNumber:item.rowNumber,auditId,obligationId});
   continue;
  }
  if(obligation.Company_UID!==audit.Company_UID)quarantine.push({reason:'ACTIVE_LINK_COMPANY_UID_MISMATCH',rowNumber:item.rowNumber,auditId,obligationId,obligationCompanyUid:obligation.Company_UID,auditCompanyUid:audit.Company_UID});
 }
 return{readOnly:true,writeAuthorized:false,requiresReview:true,candidateCount:candidates.length,quarantineCount:quarantine.length,candidates,quarantine};
}
