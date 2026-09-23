// BUILD: 2026-09-23_AMS03_COMPANY_MAP_MUTATION_INVALIDATION_ACCEPTANCE_R1
function RUN_AMS03_COMPANY_MAP_MUTATION_INVALIDATION_ACCEPTANCE(){
 var a=String(companyUpdate_applyProposalRow),v=String(companyUpdate_applyProposalValueRow),l=String(v5_setCompanyLocationsToPlan),r=[];function q(n,x){r.push({name:n,ok:!!x});}
 q('proposalRowInvalidatesMap',a.indexOf('CompanyMap_invalidateDatasetCache_C04_')>=0);
 q('proposalValueInvalidatesMap',v.indexOf('CompanyMap_invalidateDatasetCache_C04_')>=0);
 q('locationCountInvalidatesMap',l.indexOf('CompanyMap_invalidateDatasetCache_C04_')>=0);
 q('existingCompanyPersistInvalidationPreserved',a.indexOf('__mp_invalidatePersistCaches_')>=0&&v.indexOf('__mp_invalidatePersistCaches_')>=0&&l.indexOf('__mp_invalidatePersistCaches_')>=0);
 q('constraintInvalidationPreserved',a.indexOf('_mp_invalidateCompanyConstraintsCache_')>=0&&v.indexOf('_mp_invalidateCompanyConstraintsCache_')>=0);
 var f=r.filter(function(x){return!x.ok}).length,o={ok:f===0,build:'2026-09-23_AMS03_COMPANY_MAP_MUTATION_INVALIDATION_ACCEPTANCE_R1',total:r.length,passed:r.length-f,failed:f,results:r,meta:{newSsot:false}};Logger.log(JSON.stringify(o,null,2));return o;
}