/** FILE: BatchPlanningIntegratedLiveSmokeTests.gs
 * BUILD: 2026-09-17_BATCH_PLANNING_INTEGRATED_LIVE_SMOKE_R1
 * RUN: RUN_BATCH_PLANNING_INTEGRATED_LIVE_SMOKE
 * Live read-only smoke. Route API is explicitly disabled; no planning writes.
 */
function RUN_BATCH_PLANNING_INTEGRATED_LIVE_SMOKE(){
 var results=[];function t(n,ok,detail){results.push({name:n,ok:!!ok,detail:ok?'':String(detail||'')});}
 var directory=AuditorsIndex_GetDirectory(false),list=directory&&directory.list?directory.list:[],auditor=list.length?list[0].email:'',from=new Date(),to=new Date(from.getTime());to.setDate(to.getDate()+45);
 t('auditorAvailable',!!auditor,'No auditor in directory');if(!auditor)return BatchPlanningIntegratedLiveSmoke_finish_(results,{auditorEmail:'',writesPerformed:false});
 CompaniesIndexBatchPlanning_ClearExecutionIndex();
 var input={auditorEmail:auditor,periodFrom:from,periodTo:to,noApiCall:true};
 var candidates=BatchPlanningCandidateEngine_Collect(input);t('candidateRead',!!(candidates&&candidates.ok),candidates&&candidates.error);t('candidateShape',!!(candidates&&Array.isArray(candidates.candidates)),'Missing candidates array');
 var boundaries=BatchPlanningAnchorRouteModel_Resolve(input);t('boundaryRead',!!(boundaries&&boundaries.ok),boundaries&&boundaries.error);t('boundaryReadOnly',!!(boundaries&&boundaries.writesPerformed===false),'Boundary model write flag');
 var stopOk=true,checked=0;(candidates&&candidates.candidates||[]).slice(0,10).forEach(function(c){var s=BatchPlanningStops_GetCompany(c.companyUid,c.company);checked++;if(!s||!s.ok||!Array.isArray(s.stops))stopOk=false;});t('companyStopsReadable',stopOk,'Checked '+checked+' candidates');
 var integrated=BatchPlanningIntegratedConcept_Generate(input);t('integratedRead',!!(integrated&&integrated.ok),integrated&&integrated.error);t('integratedReadOnly',!!(integrated&&integrated.writesPerformed===false),'Integrated write flag');t('safeInjection',!!(integrated&&integrated.safeCandidateInjection===true),'Safe injection flag missing');t('dynamicBoundaries',!!(integrated&&integrated.dynamicRouteBoundaries===true),'Dynamic boundary flag missing');t('fixedAnchorsImmutable',!!(integrated&&integrated.fixedAnchorsImmutable===true),'Immutable anchor flag missing');t('routeApiDisabled',input.noApiCall===true,'Route API unexpectedly enabled');
 return BatchPlanningIntegratedLiveSmoke_finish_(results,{auditorEmail:auditor,periodFrom:BatchPlanningCandidateEngine_iso_(from),periodTo:BatchPlanningCandidateEngine_iso_(to),candidateCount:candidates&&candidates.candidateCount||0,routedCandidateCount:integrated&&integrated.routedCandidateCount||0,stopIssues:integrated&&integrated.stopIssues?integrated.stopIssues.length:0,unresolved:integrated&&integrated.unresolved?integrated.unresolved.length:0,writesPerformed:false,externalRouteApiCalled:false});
}
function BatchPlanningIntegratedLiveSmoke_finish_(results,meta){var passed=results.filter(function(x){return x.ok;}).length,out={ok:passed===results.length,build:'2026-09-17_BATCH_PLANNING_INTEGRATED_LIVE_SMOKE_R1',total:results.length,passed:passed,failed:results.length-passed,results:results,meta:meta};Logger.log(JSON.stringify(out,null,2));return out;}
