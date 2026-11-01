/** DEV read-only Model C extension migration inventory. Does not access live services.
 * Supply normalized rows from a separately authorized DEV snapshot.
 * Never reconstructs overwritten legacy original dates.
 */
import {inspectLegacyScopeExtensions20} from './model-c-scope-extension-migration-audit-20.mjs';
const str=x=>String(x??'').trim();
const normalizeDate=x=>{const s=str(x);let y,m,d;if(/^\d{4}-\d{2}-\d{2}$/.test(s)){[y,m,d]=s.split('-').map(Number)}else if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)){[d,m,y]=s.split('/').map(Number)}else return'';return y>=1&&m>=1&&m<=12&&d>=1&&d<=new Date(Date.UTC(y,m,0)).getUTCDate()?String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'):'';};
const validDate=x=>!!normalizeDate(x);
const field=(row,keys)=>{for(const key of keys)if(Object.hasOwn(row,key))return row[key];return undefined;};
const normalize=(row)=>({obligationId:str(field(row,['Obligation_ID','obligationId'])),companyUid:str(field(row,['Company_UID','companyUid'])),scopeCode:str(field(row,['ScopeCode','Scope_Code','scopeCode'])),auditId:str(field(row,['Audit_ID','auditId'])),triggerSource:str(field(row,['Trigger_Source','triggerSource'])),baseExpiry:normalizeDate(field(row,['Base_Expiry_Date','baseExpiry'])),effectiveExpiry:normalizeDate(field(row,['Effective_Expiry_Date','effectiveExpiry'])),windowFrom:normalizeDate(field(row,['Planning_Window_From','windowFrom'])),windowTo:normalizeDate(field(row,['Planning_Window_To','windowTo'])),extensionApplied:/^(yes|true|1|x)$/i.test(str(field(row,['Extension_Applied','extensionApplied']))),extensionMetadata:str(field(row,['Extension_Metadata_JSON','extensionMetadata']))});
export function auditModelCExtensionSnapshot20({obligations,links,planningRows}={}){
 if(!Array.isArray(obligations)||!Array.isArray(links)||!Array.isArray(planningRows))throw Error('EXT_DATA_AUDIT_INPUT_REQUIRED');
 const normalized=obligations.map(normalize),migration=inspectLegacyScopeExtensions20({obligations:normalized});
 const issues=[],byId=new Map(normalized.map(x=>[x.obligationId,x]));
 const auditIds=new Set(planningRows.map(x=>str(field(x,['Audit ID','Audit_ID','auditId']))).filter(Boolean));
 const linkedIds=new Map();
 for(const raw of links){
  const aid=str(field(raw,['Audit_ID','Audit ID','auditId'])),oid=str(field(raw,['Obligation_ID','Obligation ID','obligationId'])),state=str(field(raw,['Link_State','linkState'])).toUpperCase();
  if(state!=='ACTIVE')continue;
  if(!aid||!oid||!byId.has(oid)){issues.push({code:'LINK_MISSING_OBLIGATION',auditId:aid,obligationId:oid});continue}
  if(!auditIds.has(aid))issues.push({code:'LINK_AUDIT_NOT_FOUND',auditId:aid,obligationId:oid});
  const key=aid+'|'+oid;if(linkedIds.has(key))issues.push({code:'DUPLICATE_ACTIVE_LINK',auditId:aid,obligationId:oid});linkedIds.set(key,true);
  const ob=byId.get(oid);if(ob.auditId&&ob.auditId!==aid)issues.push({code:'LINK_AUDIT_LINEAGE_CONFLICT',auditId:aid,obligationId:oid});
 }
 for(const ob of normalized){
  if(!validDate(ob.baseExpiry)||!validDate(ob.effectiveExpiry)||!validDate(ob.windowFrom)||!validDate(ob.windowTo))issues.push({code:'OBLIGATION_DATE_INVALID',auditId:ob.auditId,obligationId:ob.obligationId});
  if(validDate(ob.windowFrom)&&validDate(ob.windowTo)&&ob.windowFrom>ob.windowTo)issues.push({code:'OBLIGATION_WINDOW_REVERSED',auditId:ob.auditId,obligationId:ob.obligationId});
 }
 const status=migration.records.some(x=>x.status==='MIGRATION_REVIEW_REQUIRED'||x.status==='REQUIRES_TRANSACTION_RECONCILIATION')||issues.length?'REVIEW_REQUIRED':'STRUCTURALLY_ELIGIBLE_FOR_FURTHER_VERIFICATION';
 return{readOnly:true,authoritativeCutoverApproved:false,automaticUndoAllowed:false,status,counts:{obligations:normalized.length,activeLinks:linkedIds.size,auditRows:auditIds.size},migrationSummary:migration.summary,issues,records:migration.records};
}
