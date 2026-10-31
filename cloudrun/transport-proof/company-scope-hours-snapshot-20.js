// Canonical obligation formal-hours snapshot contract.
// Use only for NEW obligations, never rewrite existing or Completed audit history.
export const HOURS_PROVENANCE_FIELDS=['Formal_Hours_Source','Scope_Version_ID','Company_Hours_Override_ID','Company_Hours_Override_Revision','Hours_Resolved_At'];
export function buildObligationHoursSnapshot20({resolution,now}){
 if(!resolution||!['COMPANY_OVERRIDE','SCOPE_DEFAULT'].includes(resolution.source))throw Error('HOURS_RESOLUTION_REQUIRED');
 const hours=Number(resolution.formalHours);
 if(!Number.isFinite(hours)||hours<=0||hours>10000||!resolution.scopeVersionId)throw Error('INVALID_RESOLVED_HOURS');
 const override=resolution.source==='COMPANY_OVERRIDE';
 if(override&&(!resolution.overrideId||!resolution.overrideRevision))throw Error('OVERRIDE_PROVENANCE_REQUIRED');
 if(!override&&(resolution.overrideId||resolution.overrideRevision))throw Error('BASELINE_PROVENANCE_CONFLICT');
 const timestamp=now||new Date().toISOString();
 if(Number.isNaN(Date.parse(timestamp)))throw Error('INVALID_RESOLUTION_TIMESTAMP');
 return{Formal_Hours:hours,Formal_Hours_Source:resolution.source,Scope_Version_ID:resolution.scopeVersionId,Company_Hours_Override_ID:override?resolution.overrideId:'',Company_Hours_Override_Revision:override?resolution.overrideRevision:'',Hours_Resolved_At:timestamp};
}
export function validateObligationHoursSchema20(headers){
 const required=['Formal_Hours',...HOURS_PROVENANCE_FIELDS];
 const missing=required.filter(h=>!headers.includes(h));
 if(missing.length)throw Error('OBLIGATION_HOURS_SCHEMA_MISSING_'+missing.join('_'));
 if(headers.some((h,i)=>headers.indexOf(h)!==i))throw Error('OBLIGATION_HOURS_SCHEMA_DUPLICATE_HEADER');
 return true;
}
