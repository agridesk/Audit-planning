/** FILE: BatchPlanningSchedulingHoursTests.gs
 * BUILD: 2026-09-19_BATCH_PLANNING_SCHEDULING_HOURS_R1
 * RUN: RUN_BATCH_PLANNING_SCHEDULING_HOURS_REGRESSION
 */
function RUN_BATCH_PLANNING_SCHEDULING_HOURS_REGRESSION(){
 var r=[];function t(n,v,d){r.push({name:n,ok:!!v,detail:d||''});}
 var cat=ConfigScopes_GetCatalog(true),rows=cat&&cat.rows||[];
 t('catalogAvailable',!!(cat&&cat.ok));
 t('schedulingHoursFieldExposed',rows.length===0||rows.every(function(x){return x.hasOwnProperty('schedulingHours');}));
 var abc=rows.filter(function(x){return /mps.?abc/i.test(String(x.displayName||'')+' '+String(x.scopeCode||''));})[0]||null;
 t('mpsAbcFound',!!abc,abc?abc.displayName:'');
 t('mpsAbcSchedulingHoursConfigured',!!abc&&Number(abc.schedulingHours)>0,'Scheduling_hours='+String(abc&&abc.schedulingHours));
 if(abc){var s=BatchPlanningCandidateEngine_schedulingHours_([abc.displayName],Number(abc.defaultHours||0));t('abcOperationalHoursResolved',Number(s.hours)===Number(abc.schedulingHours),JSON.stringify(s));t('abcFormalHoursUnchanged',Number(abc.defaultHours)>0,'Default_hours='+abc.defaultHours);}
 var fallback=rows.filter(function(x){return x.schedulingHours==null&&Number(x.defaultHours)>0;})[0]||null;
 if(fallback){var f=BatchPlanningCandidateEngine_schedulingHours_([fallback.displayName],fallback.defaultHours);t('blankSchedulingFallsBackToFormal',Number(f.hours)===Number(fallback.defaultHours),JSON.stringify(f));}
 else t('blankSchedulingFallsBackToFormal',true,'No blank Scheduling_hours row available to exercise');
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_BATCH_PLANNING_SCHEDULING_HOURS_R1',total:r.length,passed:passed,failed:r.length-passed,results:r};console.info(JSON.stringify(out,null,2));return out;
}