// BUILD: 2026-09-23_AMS03_TOOLKIT_COMPANY_PREFETCH_INDEXED_ACCEPTANCE_R1
function RUN_AMS03_TOOLKIT_COMPANY_PREFETCH_INDEXED_ACCEPTANCE() {
  var fn = String(_mp_prefetchToolkitCompanyContextForAudit_);
  var results = [];
  function gate(name, ok, detail) { results.push({name:name, ok:!!ok, detail:detail||''}); }
  gate('usesCanonicalAuditRowIndex', fn.indexOf('__mp_getAuditPlanningRow_') >= 0);
  gate('noFullAuditPlanningRead', fn.indexOf('getDataRange') < 0);
  gate('requiresAuditId', fn.indexOf('Missing auditId') >= 0);
  gate('preservesCompanyContextCache', fn.indexOf('_mp_getCachedToolkitCompanyContext_') >= 0 && fn.indexOf('_mp_putCachedToolkitCompanyContext_') >= 0);
  gate('preservesCompanyConstraintOwner', fn.indexOf('_mp_companyConstraintsCached_') >= 0);
  gate('readOnlyAuditPlanning', fn.indexOf('setValue') < 0 && fn.indexOf('setValues') < 0 && fn.indexOf('appendRow') < 0 && fn.indexOf('deleteRow') < 0);
  var passed = results.filter(function(x){return x.ok;}).length;
  return {ok:passed===results.length,build:'2026-09-23_AMS03_TOOLKIT_COMPANY_PREFETCH_INDEXED_ACCEPTANCE_R1',total:results.length,passed:passed,failed:results.length-passed,results:results,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,newSsot:false}};
}
