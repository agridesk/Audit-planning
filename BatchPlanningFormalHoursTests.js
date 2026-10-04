/** FILE: BatchPlanningFormalHoursTests.gs
 * BUILD: 2026-10-04_BATCH_PLANNING_FORMAL_HOURS_R1
 * RUN: RUN_BATCH_PLANNING_FORMAL_HOURS_REGRESSION
 */
function RUN_BATCH_PLANNING_FORMAL_HOURS_REGRESSION(){
 var r=[];function t(n,v,d){r.push({name:n,ok:!!v,detail:d||''});}
 var cat=ConfigScopes_GetCatalog(true),rows=cat&&cat.rows||[];
 t('catalogAvailable',!!(cat&&cat.ok));
 t('formalHoursFieldExposed',rows.length===0||rows.every(function(x){return x.hasOwnProperty('formalHours');}));
 t('maxOffsiteHoursFieldExposed',rows.length===0||rows.every(function(x){return x.hasOwnProperty('maxOffsiteHours');}));
 var abc=rows.filter(function(x){return /mps.?abc/i.test(String(x.displayName||'')+' '+String(x.scopeCode||''));})[0]||null;
 t('mpsAbcFound',!!abc,abc?abc.displayName:'');
 if(abc){
   var p=BatchPlanningCandidateEngine_offsitePolicy_([abc.displayName]);
   t('abcFormalHoursAvailable',Number(abc.formalHours)>0,'formalHours='+String(abc.formalHours));
   t('abcOffsitePolicyResolved',Number(p.maxOffsiteHours)===Number(abc.maxOffsiteHours),JSON.stringify(p));
 }
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-10-04_BATCH_PLANNING_FORMAL_HOURS_R1',total:r.length,passed:passed,failed:r.length-passed,results:r};console.info(JSON.stringify(out,null,2));return out;
}
