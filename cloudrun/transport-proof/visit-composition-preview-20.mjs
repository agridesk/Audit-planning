// Issue #87: read-only composition preview over canonical active Model C obligations.
// No identity generation, side effects, or implicit hour allocation.
const str = value => String(value ?? '').trim();
const fail = code => {const error = new Error(code);error.code=code;throw error;};
const toMinutes = value => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) fail('COMPOSITION_REQUIRED_HOURS_INVALID');
  const v = Math.round(value * 60);
  if (Math.abs(value * 60 - v) > 1e-8) fail('COMPOSITION_REQUIRED_HOURS_NOT_MINUTE_ALIGNED');
  return v;
};
/**
 * A source Audit ID can link to more than one active obligation.
 * Separating that source is never equivalent to splitting a Planning JSON block.
 */
export function previewVisitComposition20({auditId, companyUid, obligations, mode}={}){
  const sourceAuditId=str(auditId),sourceCompanyUid=str(companyUid);
  if (!sourceAuditId || !sourceCompanyUid) fail('COMPOSITION_SOURCE_IDENTITY_REQUIRED');
  if (!Array.isArray(obligations) || !obligations.length) fail('COMPOSITION_MODEL_C_OBLIGATIONS_MISSING');
  const normalized=[],seen=new Set();
  for(const row of obligations){
    const obligationId=str(row?.obligationId),scopeCode=str(row?.scopeCode);
    if(!obligationId||!scopeCode)fail('COMPOSITION_OBLIGATION_IDENTITY_INVALID');
    if(seen.has(obligationId))fail('COMPOSITION_DUPLICATE_OBLIGATION_LINK');
    if(row.companyUid!==undefined && str(row.companyUid)!==sourceCompanyUid)fail('COMPOSITION_COMPANY_UID_MISMATCH');
    if(row.auditId!==undefined && str(row.auditId)!==sourceAuditId)fail('COMPOSITION_LINK_OWNERSHIP_MISMATCH');
    if(row.linkState!==undefined && str(row.linkState).toUpperCase()!=='ACTIVE')fail('COMPOSITION_LINK_NOT_ACTIVE');
    if(row.obligationState!==undefined && ['COMPLETED','REJECTED','CANCELLED'].includes(str(row.obligationState).toUpperCase()))fail('COMPOSITION_TERMINAL_OBLIGATION');
    seen.add(obligationId);
    normalized.push({obligationId,scopeCode,requiredMinutes:toMinutes(Number(row.formalHours))});
  }
  const compositionRequired=normalized.length>1;
  const selectedMode=str(mode).toUpperCase();
  if(compositionRequired&&!['TOGETHER','SEPARATELY'].includes(selectedMode))fail('COMPOSITION_EXPLICIT_CHOICE_REQUIRED');
  if(!compositionRequired&&selectedMode==='SEPARATELY')fail('COMPOSITION_SINGLE_OBLIGATION_CANNOT_SPLIT');
  if(selectedMode&&!['TOGETHER','SEPARATELY'].includes(selectedMode))fail('COMPOSITION_UNSUPPORTED_MODE');
  return{
    sourceAuditId,companyUid:sourceCompanyUid,
    compositionRequired,mode:selectedMode||'SINGLE',
    obligationCount:normalized.length,
    obligations:normalized,
    totalRequiredMinutes:normalized.reduce((sum,x)=>sum+x.requiredMinutes,0),
    requiresExplicitPerBlockAllocation:compositionRequired&&selectedMode==='TOGETHER',
    requiresCanonicalVisitSplit:compositionRequired&&selectedMode==='SEPARATELY',
    canCommit:false,
    reason:compositionRequired&&selectedMode==='SEPARATELY'?'CANONICAL_VISIT_IDENTITY_AND_LINK_TRANSFER_REQUIRED':
      compositionRequired&&selectedMode==='TOGETHER'?'CANONICAL_PER_BLOCK_ALLOCATION_AND_WRITER_REQUIRED':
      'CANONICAL_WRITER_VALIDATION_REQUIRED'
  };
}
