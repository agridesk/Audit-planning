const clean=x=>String(x??'').trim();
const norm=x=>clean(x).toLowerCase().replace(/[^a-z0-9]+/g,'');
const col=(h,...names)=>names.map(n=>h.findIndex(x=>norm(x)===norm(n))).find(x=>x>=0)??-1;
const field=(row,i)=>i<0?'':clean(row[i]);
export function previewModelCVisitComposition20({auditId,obligations,links}){
 const id=clean(auditId),oh=obligations?.[0]||[],lh=links?.[0]||[];
 if(!id)throw Error('AUDIT_ID_REQUIRED');
 const oi=col(oh,'Obligation_ID'),os=col(oh,'ScopeCode'),oc=col(oh,'Company_UID'),of=col(oh,'Formal_Hours','Required_Hours','Audit_Hours'),oe=col(oh,'Effective_Expiry_Date'),owf=col(oh,'Planning_Window_From'),owt=col(oh,'Planning_Window_To'),ost=col(oh,'Obligation_State');
 const la=col(lh,'Audit_ID'),lo=col(lh,'Obligation_ID'),ls=col(lh,'Link_State');
 if([oi,os,oc,la,lo,ls].some(x=>x<0))throw Error('MODEL_C_PREVIEW_SCHEMA_INCOMPLETE');
 const ids=new Set(links.slice(1).filter(r=>field(r,la)===id&&norm(field(r,ls))==='active').map(r=>field(r,lo)));
 if(!ids.size)throw Error('MODEL_C_PREVIEW_NO_ACTIVE_LINKS');
 const rows=obligations.slice(1).filter(r=>ids.has(field(r,oi))).map(r=>({obligationId:field(r,oi),scopeCode:field(r,os),companyUid:field(r,oc),requiredHours:field(r,of),plannedHours:null,remainingHours:null,allocationStatus:'UNKNOWN_NOT_INFERRED',effectiveExpiry:field(r,oe),windowFrom:field(r,owf),windowTo:field(r,owt),state:field(r,ost)}));
 if(rows.length!==ids.size)throw Error('MODEL_C_PREVIEW_LINK_UNRESOLVED');
 if(rows.some(r=>!r.obligationId||!r.scopeCode||!r.companyUid)||new Set(rows.map(r=>r.companyUid)).size>1)throw Error('MODEL_C_PREVIEW_IDENTITY_INCOMPLETE');
 if(new Set(rows.map(r=>r.obligationId)).size!==rows.length)throw Error('MODEL_C_PREVIEW_DUPLICATE_OBLIGATION');
 return {auditId:id,companyUid:rows[0]?.companyUid||'',scopeCount:rows.length,obligations:rows,compositionOptions:rows.length>1?['TOGETHER','SEPARATELY']:['SINGLE'],readOnly:true,canCommit:false,allocationStatus:'NOT_PROVIDED'};
}
