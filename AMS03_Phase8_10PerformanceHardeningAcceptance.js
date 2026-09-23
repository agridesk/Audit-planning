/***********************************************************************
 * AMS03_Phase8_10PerformanceHardeningAcceptance.js
 * BUILD: 2026-09-23_AMS03_PHASE8_10_PERF_HARDENING_R1
 ***********************************************************************/
function RUN_AMS03_PHASE8_10_PERFORMANCE_HARDENING_ACCEPTANCE(){
 var s=String(PlanningTripConceptReadModel_get)+String(PTC_locationsFromProfile_),r=[];function q(n,v){r.push({name:n,ok:!!v});}
 q('tripUsesBoundedProfiles',s.indexOf('PlanningProfilesService_get')>=0);
 q('tripDoesNotUseCompanyMapFullDataset',s.indexOf('CompanyMap_getBaseDatasetForAuditorLayer_')<0);
 q('tripProjectsLocationsJson',s.indexOf('locationsJson')>=0);
 q('tripKeepsDecisionOwner',s.indexOf('PlanningWorkspaceDecisionReadModel_get')>=0);
 q('tripNoWrites',s.indexOf('setValue(')<0&&s.indexOf('setValues(')<0);
 q('tripNoRouteApi',s.indexOf('routeOptimization:false')>=0&&s.indexOf('travelTimeCalculated:false')>=0);
 q('tripNoNewSsot',s.indexOf('newSsot:false')>=0);
 var f=r.filter(function(x){return!x.ok}).length,o={ok:f===0,build:'2026-09-23_AMS03_PHASE8_10_PERF_HARDENING_R1',total:r.length,passed:r.length-f,failed:f,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,newSsot:false,reason:'Remove full Company Map dataset dependency from selected-audit trip concept hot path.'}};Logger.log(JSON.stringify(o,null,2));return o;
}
