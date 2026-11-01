/** Pure read-only backfill plan: existing Model C Sheets -> guarded Firestore documents.
 * No auto-approval and no recovery of unproven legacy extension provenance.
 */
const str=x=>String(x??'').trim();
const date=x=>{const s=str(x);let y,m,d;if(/^\d{4}-\d{2}-\d{2}$/.test(s))[y,m,d]=s.split('-').map(Number);else if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s))[d,m,y]=s.split('/').map(Number);else return'';return y>0&&m>=1&&m<=12&&d>=1&&d<=new Date(Date.UTC(y,m,0)).getUTCDate()?String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'):'';};
const yes=x=>/^(yes|true|1|x)$/i.test(str(x));
const normalStatus=x=>str(x).toUpperCase().replace(/[\s-]+/g,'_');
const objects=values=>{if(!Array.isArray(values)||!values.length||!Array.isArray(values[0]))throw Error('EXT_BACKFILL_TABLE_REQUIRED');const headers=values[0].map(str);if(new Set(headers).size!==headers.length)throw Error('EXT_BACKFILL_DUPLICATE_HEADER');return values.slice(1).filter(row=>row.some(x=>str(x))).map(row=>Object.fromEntries(headers.map((k,i)=>[k,row[i]])))};
export function planScopeExtensionFirestoreBackfill20({obligations,visitLinks,planning,configScopes}={}){
 const [os,ls,as,cs]=[obligations,visitLinks,planning,configScopes].map(objects);
 for(const [row,fields] of [[os,['Obligation_ID','Company_UID','ScopeCode','Trigger_Source']],[ls,['Audit_ID','Obligation_ID','Link_State']],[as,['Audit ID','Status','Company_UID']],[cs,['ScopeCode','Extension','Planning from','Planning to']]])if(row.length&&fields.some(k=>!Object.hasOwn(row[0],k)))throw Error('EXT_BACKFILL_SCHEMA_INCOMPLETE');
 const policy={},recurringByScope={},warnings=[],fatal=[],docs=[],contexts=[];
 for(const c of cs){const sc=str(c.ScopeCode);if(!sc||Object.hasOwn(policy,sc)){fatal.push({code:'SCOPE_CATALOG_INVALID',scopeCode:sc});continue}recurringByScope[sc]=yes(c.Recurring);const months=Number(c.Extension),from=Number(c['Planning from']),to=Number(c['Planning to']);if(!Number.isSafeInteger(months)||months<=0||!Number.isSafeInteger(from)||!Number.isSafeInteger(to)){policy[sc]=null;continue}policy[sc]={extensionMonths:months,planningFromMonths:from,planningToMonths:to}}
 if(cs.length>20)fatal.push({code:'SCOPE_CATALOG_EXCEEDS_20',count:cs.length});
 const obs=new Map();for(const o of os){const id=str(o.Obligation_ID);if(!id||obs.has(id))fatal.push({code:'OBLIGATION_ID_DUPLICATE',obligationId:id});else obs.set(id,o)}
 const audits=new Map();for(const a of as){const id=str(a['Audit ID']);if(id){if(audits.has(id))fatal.push({code:'AUDIT_ID_DUPLICATE',auditId:id});audits.set(id,a)}}
 const linksByAudit=new Map(),usedObligations=new Map();
 for(const l of ls){if(normalStatus(l.Link_State)!=='ACTIVE')continue;const auditId=str(l.Audit_ID),obligationId=str(l.Obligation_ID);if(!auditId||!obligationId||!audits.has(auditId)||!obs.has(obligationId)){fatal.push({code:'ORPHAN_ACTIVE_LINK',auditId,obligationId});continue}
  if(usedObligations.has(obligationId)){fatal.push({code:'OBLIGATION_SHARED_BETWEEN_VISITS',obligationId,auditId});continue}usedObligations.set(obligationId,auditId);const list=linksByAudit.get(auditId)||[];list.push(obligationId);linksByAudit.set(auditId,list);
 }
 for(const [auditId,ids] of linksByAudit){const a=audits.get(auditId),companyUid=str(a.Company_UID),status=normalStatus(a.Status);
  if(!companyUid){fatal.push({code:'AUDIT_COMPANY_UID_MISSING',auditId});continue}
  const localPolicy={},stagedDocs=[],stagedWarnings=[];let valid=true;
  for(const id of ids){const o=obs.get(id),scopeCode=str(o.ScopeCode),triggerSource=str(o.Trigger_Source),external=triggerSource.toUpperCase()==='ECAS',expiryManaged=!external&&recurringByScope[scopeCode]===true;
   if(str(o.Company_UID)!==companyUid||!scopeCode){fatal.push({code:'OBLIGATION_LINEAGE_CONFLICT',auditId,obligationId:id});valid=false;continue}
   const base=date(o.Base_Expiry_Date),effective=date(o.Effective_Expiry_Date),from=date(o.Planning_Window_From),to=date(o.Planning_Window_To);
   if(expiryManaged&&(!base||!effective||!from||!to||from>to)){fatal.push({code:'CERTIFICATE_DATES_MISSING',auditId,obligationId:id,scopeCode});valid=false;continue}
   if(expiryManaged&&policy[scopeCode]===undefined){fatal.push({code:'SCOPE_POLICY_MISSING',auditId,scopeCode});valid=false;continue}
   if(policy[scopeCode])localPolicy[scopeCode]=policy[scopeCode];
   const applied=yes(o.Extension_Applied),metadata=str(o.Extension_Metadata_JSON);
   if(applied)stagedWarnings.push({code:'LEGACY_EXTENSION_UNDO_QUARANTINED',auditId,obligationId:id});
   stagedDocs.push({obligationId:id,auditId,companyUid,scopeCode,triggerSource,expiryManaged,linkState:'ACTIVE',revision:0,pendingProjectionId:'',baseExpiry:base,effectiveExpiry:effective,windowFrom:from,windowTo:to,extensionApplied:applied,extensionMetadata:metadata,legacyUndoQuarantined:applied,source:'SHEETS_MODEL_C_DEV_BACKFILL'});
  }
  if(valid){docs.push(...stagedDocs);warnings.push(...stagedWarnings);contexts.push({auditId,companyUid,lifecycleStatus:status,obligationIds:ids,policyByScope:localPolicy,writerFenceVerified:false,revision:0});}
 }
 const duplicateDocs=docs.length-new Set(docs.map(x=>x.obligationId)).size;if(duplicateDocs)fatal.push({code:'DUPLICATE_BACKFILL_DOCUMENT',count:duplicateDocs});
 return{readOnly:true,cutoverApproved:false,seedPermitted:false,readyForManualReconciliation:fatal.length===0,counts:{auditContexts:contexts.length,obligations:docs.length,legacyUndoQuarantined:warnings.length},fatal,warnings,documents:docs,auditContexts:contexts};
}
