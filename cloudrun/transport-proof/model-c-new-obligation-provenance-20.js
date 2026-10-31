import {resolveCompanyScopeHours20} from './company-scope-hours-resolver-20.js';
import {buildObligationHoursSnapshot20,validateObligationHoursSchema20} from './company-scope-hours-snapshot-20.js';

// A year-only ECAS cycle is a legal identity, not an effective date. Use the
// recorded certificate expiry within that year; never assume January 1.
export function resolveNewObligationEffectiveDate20(effectiveDate,obligation){
 const cycle=String(effectiveDate??'').trim();
 const normalized=String(obligation?.Base_Expiry_Date??'').trim();
 const date=/^[0-9]{4}$/.test(cycle)?normalized:cycle;
 if(/^[0-9]{4}$/.test(cycle)&&(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(normalized)||normalized.slice(0,4)!==cycle))throw Error('NEW_OBLIGATION_YEAR_CYCLE_EXPIRY_REQUIRED');
 if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||Number.isNaN(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('NEW_OBLIGATION_EFFECTIVE_DATE_INVALID');
 return date;
}


// Pure fail-closed factory for NEW Model C obligations. No Sheets I/O.
// Historical/Completed obligations must never be passed to this creator.
export function buildNewModelCObligationWithHours20({headers,obligation,companyId,scopeCode,effectiveDate,companyScopes,overrides,scopeVersions,now}={}){
  if(!Array.isArray(headers))throw Error('NEW_OBLIGATION_HEADERS_REQUIRED');
  validateObligationHoursSchema20(headers);
  if(!obligation||typeof obligation!=='object'||Array.isArray(obligation))throw Error('NEW_OBLIGATION_REQUIRED');
  if(!String(obligation.Obligation_ID||'').trim()||String(obligation.Company_UID||'').trim()!==String(companyId||'').trim()||String(obligation.ScopeCode||'').trim()!==String(scopeCode||'').trim())throw Error('NEW_OBLIGATION_IDENTITY_MISMATCH');
  if(String(obligation.Obligation_State||'').toUpperCase()!=='OPEN')throw Error('NEW_OBLIGATION_STATE_INVALID');
  const resolvedEffectiveDate=resolveNewObligationEffectiveDate20(effectiveDate,obligation);
  const resolution=resolveCompanyScopeHours20({companyId,scopeCode,effectiveDate:resolvedEffectiveDate,companyScopes,overrides,scopeVersions});
  const snapshot=buildObligationHoursSnapshot20({resolution,now});
  const provided=obligation.Formal_Hours;
  if(provided!==undefined&&provided!==null&&String(provided)!==''&&Number(provided)!==snapshot.Formal_Hours)throw Error('NEW_OBLIGATION_HOURS_CONFLICT');
  for(const key of Object.keys(snapshot)){
    if(key==='Formal_Hours')continue;
    const existing=obligation[key];
    if(existing!==undefined&&existing!==null&&String(existing)!==''&&String(existing)!==String(snapshot[key]))throw Error('NEW_OBLIGATION_PROVENANCE_CONFLICT_'+key);
  }
  const result={...obligation,...snapshot};
  const row=headers.map(h=>result[h]??'');
  if(row.length!==headers.length)throw Error('NEW_OBLIGATION_ROW_WIDTH_INVALID');
  return {obligation:result,row,snapshot,resolution};
}
