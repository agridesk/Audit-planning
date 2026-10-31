// AMS 2.0: pure, read-only hours resolution contract. No Sheets writes.
// The adapter must provide verified canonical rows. This module does NOT assume
// Company_Scope_Hours has already been created in DEV.
const str=x=>String(x??'').trim();
const date=x=>{const s=str(x);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('INVALID_EFFECTIVE_DATE');return s};
const hours=x=>{const s=str(x).replace(',','.');if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(s)||!(Number(s)>0)||Number(s)>10000)throw Error('INVALID_FORMAL_HOURS');return Number(s)};
const one=(rows,missing,duplicate)=>{if(rows.length>1)throw Error(duplicate);if(!rows.length)throw Error(missing);return rows[0]};
export function resolveCompanyScopeHours20({companyId,scopeCode,effectiveDate,companyScopes,overrides,scopeVersions}){
 const company=str(companyId),scope=str(scopeCode),day=date(effectiveDate);
 if(!company||!scope)throw Error('COMPANY_SCOPE_IDENTITY_REQUIRED');
 if(!Array.isArray(companyScopes)||!Array.isArray(overrides)||!Array.isArray(scopeVersions))throw Error('HOURS_SOURCE_NOT_READY');
 const relation=one(companyScopes.filter(r=>str(r.Company_UID)===company&&str(r.ScopeCode)===scope),'COMPANY_SCOPE_RELATION_MISSING','COMPANY_SCOPE_RELATION_DUPLICATE');
 if(!['ACTIVE','TRUE','YES','1'].includes(str(relation.Active??relation.Status).toUpperCase()))throw Error('COMPANY_SCOPE_INACTIVE');
 const applicable=r=>(!str(r.EffectiveFrom)||date(r.EffectiveFrom)<=day)&&(!str(r.EffectiveTo)||date(r.EffectiveTo)>=day);
 const candidates=overrides.filter(r=>str(r.Company_UID)===company&&str(r.ScopeCode)===scope);
 // Validate all records for this relationship before deciding that baseline applies.
 for(const r of candidates){if(!str(r.OverrideId)||!str(r.Status)||!str(r.Revision))throw Error('OVERRIDE_RECORD_INCOMPLETE');if(str(r.EffectiveFrom))date(r.EffectiveFrom);if(str(r.EffectiveTo))date(r.EffectiveTo);if(str(r.EffectiveFrom)&&str(r.EffectiveTo)&&r.EffectiveFrom>r.EffectiveTo)throw Error('OVERRIDE_DATE_RANGE_INVALID');}
 const active=candidates.filter(r=>str(r.Status).toUpperCase()==='ACTIVE'&&applicable(r));
 if(active.length>1)throw Error('OVERLAPPING_COMPANY_OVERRIDES');
 const baseline=one(scopeVersions.filter(r=>str(r.ScopeCode)===scope&&str(r.Status).toUpperCase()==='CURRENT'&&(!str(r.Effective_From)||date(r.Effective_From)<=day)&&(!str(r.Effective_To)||date(r.Effective_To)>=day)),'SCOPE_VERSION_MISSING','SCOPE_VERSION_AMBIGUOUS');
 const baselineHours=hours(baseline.Hours_to_plan);
 if(!str(baseline.VersionId))throw Error('SCOPE_VERSION_ID_MISSING');
 if(active.length){
   const r=active[0];return{formalHours:hours(r.Hours),source:'COMPANY_OVERRIDE',companyId:company,scopeCode:scope,effectiveDate:day,scopeVersionId:str(baseline.VersionId),overrideId:str(r.OverrideId),overrideRevision:str(r.Revision)};
 }
 return{formalHours:baselineHours,source:'SCOPE_DEFAULT',companyId:company,scopeCode:scope,effectiveDate:day,scopeVersionId:str(baseline.VersionId),overrideId:null,overrideRevision:null};
}
