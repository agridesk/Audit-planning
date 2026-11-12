import {canonicalPlanningRevision20} from './combined-visit-canonical-gas-bridge-20.mjs';
const clean=x=>String(x??'').trim();
const norm=x=>clean(x).toLowerCase().replace(/[^a-z0-9]+/g,'');
const col=(h,...names)=>names.map(n=>h.findIndex(x=>norm(x)===norm(n))).find(x=>x>=0)??-1;
const field=(row,i)=>i<0?'':clean(row[i]);
export function previewModelCVisitComposition20({auditId,obligations,links,planningRows=null,configScopes=null}){
 const id=clean(auditId),oh=obligations?.[0]||[],lh=links?.[0]||[];
 if(!id)throw Error('AUDIT_ID_REQUIRED');
 const oi=col(oh,'Obligation_ID'),os=col(oh,'ScopeCode'),oc=col(oh,'Company_UID'),of=col(oh,'Formal_Hours','Required_Hours','Audit_Hours'),oe=col(oh,'Effective_Expiry_Date'),owf=col(oh,'Planning_Window_From'),owt=col(oh,'Planning_Window_To'),ost=col(oh,'Obligation_State');
 const la=col(lh,'Audit_ID'),lo=col(lh,'Obligation_ID'),ls=col(lh,'Link_State');
 if([oi,os,oc,la,lo,ls].some(x=>x<0))throw Error('MODEL_C_PREVIEW_SCHEMA_INCOMPLETE');
 const selectedLinks=links.slice(1).filter(r=>field(r,la)===id&&norm(field(r,ls))==='active');
 const activeIds=selectedLinks.map(r=>field(r,lo));
 if(activeIds.some(x=>!x)||new Set(activeIds).size!==activeIds.length)
  throw Error('MODEL_C_PREVIEW_DUPLICATE_ACTIVE_LINK');
 const ids=new Set(activeIds);
 if(links.slice(1).some(row=>norm(field(row,ls))==='active'&&
   ids.has(field(row,lo))&&field(row,la)!==id))
  throw Error('MODEL_C_PREVIEW_ACTIVE_OBLIGATION_LINKED_ELSEWHERE');
 if(!ids.size)throw Error('MODEL_C_PREVIEW_NO_ACTIVE_LINKS');
 const rows=obligations.slice(1).filter(r=>ids.has(field(r,oi))).map(r=>({obligationId:field(r,oi),scopeCode:field(r,os),companyUid:field(r,oc),requiredHours:field(r,of),plannedHours:null,remainingHours:null,allocationStatus:'UNKNOWN_NOT_INFERRED',effectiveExpiry:field(r,oe),windowFrom:field(r,owf),windowTo:field(r,owt),state:field(r,ost)}));
 if(rows.length!==ids.size)throw Error('MODEL_C_PREVIEW_LINK_UNRESOLVED');
 if(rows.some(r=>!r.obligationId||!r.scopeCode||!r.companyUid)||new Set(rows.map(r=>r.companyUid)).size>1)throw Error('MODEL_C_PREVIEW_IDENTITY_INCOMPLETE');
 if(new Set(rows.map(r=>r.obligationId)).size!==rows.length)throw Error('MODEL_C_PREVIEW_DUPLICATE_OBLIGATION');
 const source={checked:false,sourceRows:null,status:null,companyUid:null,revision:'NOT_VERIFIED'};
 let parentWindow={from:'',to:''};
 if(planningRows!==null){
  const ph=planningRows?.[0]||[],pa=col(ph,'Audit ID','Audit_ID'),ps=col(ph,'Status'),
   pc=col(ph,'Company_UID','Company UID');
  if(pa<0||ps<0)throw Error('MODEL_C_PREVIEW_PLANNING_SCHEMA_INCOMPLETE');
  const matching=planningRows.slice(1).filter(r=>field(r,pa)===id);
  if(matching.length!==1)throw Error('MODEL_C_PREVIEW_SOURCE_IDENTITY_CONFLICT');
  source.checked=true;source.sourceRows=1;source.status=field(matching[0],ps);
  source.companyUid=field(matching[0],pc)||null;
  parentWindow={from:field(matching[0],col(ph,'Planning window from')),
   to:field(matching[0],col(ph,'Planning window to'))};
  // Reuse the DEV GAS combined-visit PRT1 source fingerprint for source
  // evidence. This is a read-only candidate, NOT an authoritative commit CAS.
  source.revision=canonicalPlanningRevision20(ph,matching[0]);
  if(source.companyUid&&source.companyUid!==rows[0].companyUid)
   throw Error('MODEL_C_PREVIEW_COMPANY_UID_CONFLICT');
 }
 let catalog={checked:false,missingScopeCodes:[],duplicateScopeCodes:[]};
 if(configScopes!==null){
  const ch=configScopes?.[0]||[],ci=col(ch,'ScopeCode');
  if(ci<0)throw Error('MODEL_C_PREVIEW_SCOPE_CATALOG_SCHEMA_INCOMPLETE');
  const counts=new Map(),policies=new Map(),recCol=col(ch,'Recurring');
  for(const r of configScopes.slice(1)){
   const key=field(r,ci);if(!key)continue;
   counts.set(key,(counts.get(key)||0)+1);
   if(recCol>=0)policies.set(key,field(r,recCol));
  }
  for(const row of rows){
   const raw=String(policies.get(row.scopeCode)||'').trim().toUpperCase();
   row.recurring=['YES','TRUE','1','X'].includes(raw)?true:['NO','FALSE','0'].includes(raw)?false:null;
   row.windowSource='OBLIGATION_CANONICAL';
   if(row.recurring===false&&(!row.windowFrom||!row.windowTo)){
    if(!row.windowFrom)row.windowFrom=parentWindow.from;
    if(!row.windowTo)row.windowTo=parentWindow.to;
    row.windowSource='SOURCE_AUDIT_PLANNING_NONRECURRING_FALLBACK';
   }
  }
  catalog={checked:true,missingScopeCodes:rows.filter(r=>!counts.has(r.scopeCode)).map(r=>r.scopeCode),
   duplicateScopeCodes:rows.filter(r=>(counts.get(r.scopeCode)||0)>1).map(r=>r.scopeCode)};
  if(catalog.missingScopeCodes.length||catalog.duplicateScopeCodes.length)
   throw Error('MODEL_C_PREVIEW_SCOPE_CATALOG_IDENTITY_CONFLICT');
 }
 const missingRequiredHours=rows.filter(r=>!(Number(r.requiredHours)>0)).map(r=>r.obligationId);
 const sourceEvidenceReady=source.checked&&catalog.checked&&!missingRequiredHours.length;

 return {auditId:id,companyUid:rows[0]?.companyUid||'',scopeCount:rows.length,obligations:rows,compositionOptions:rows.length>1?['TOGETHER','SEPARATELY']:['SINGLE'],source,catalog,missingRequiredHours,sourceEvidenceReady,readOnly:true,canCommit:false,allocationStatus:'NOT_PROVIDED'};
}
