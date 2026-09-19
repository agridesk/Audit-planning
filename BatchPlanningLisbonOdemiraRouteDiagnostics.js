/** FILE: BatchPlanningLisbonOdemiraRouteDiagnostics.gs
 * BUILD: 2026-09-19_LISBON_ODEMIRA_ROUTE_DIAGNOSTICS_R1
 * RUN: RUN_LISBON_ODEMIRA_ROUTE_DIAGNOSTICS
 * Read-only: Companies SSoT + canonical Routes service.
 */
function RUN_LISBON_ODEMIRA_ROUTE_DIAGNOSTICS(){
 var names=['Buijnink International, Unipessoal Lda','Koppe Young Plants Portugal','Praiaplanta'],pts={},loc={};
 names.forEach(function(n){var x=BatchPlanning_getCompanyLocation_(n,'');loc[n]=x;if(x&&x.ok)pts[n]=x.point;});
 var lis=BatchPlanning_normalizePoint_('Humberto Delgado Airport, Lisbon, Portugal');
 if(!lis||!lis.ok)return{ok:false,error:'LISBON_AIRPORT_UNRESOLVED',writesPerformed:false};
 var missing=names.filter(function(n){return !pts[n];});if(missing.length)return{ok:false,error:'COMPANY_LOCATION_UNRESOLVED',companies:missing,locations:loc,writesPerformed:false};
 var nodes=[{key:'LIS',point:lis.point}].concat(names.map(function(n){return{key:n,point:pts[n]};})),legs={};
 nodes.forEach(function(a){nodes.forEach(function(b){if(a.key===b.key)return;var r=BatchPlanningRouteMatrix_Get(a.point,b.point,{forceFresh:false});legs[a.key+' -> '+b.key]=r&&r.ok?{km:Math.round(Number(r.distanceMeters||0)/100)/10,minutes:Math.round(Number(r.durationSeconds||0)/6)/10,cacheHit:!!r.cacheHit}:{error:'ROUTE_UNRESOLVED'};});});
 var perms=[[names[0],names[1],names[2]],[names[0],names[2],names[1]],[names[1],names[0],names[2]],[names[1],names[2],names[0]],[names[2],names[0],names[1]],[names[2],names[1],names[0]]],routes=perms.map(function(p){var seq=['LIS'].concat(p).concat(['LIS']),km=0,min=0,ok=true;for(var i=0;i<seq.length-1;i++){var l=legs[seq[i]+' -> '+seq[i+1]];if(!l||l.error){ok=false;break;}km+=l.km;min+=l.minutes;}return{sequence:seq.join(' -> '),ok:ok,totalKm:Math.round(km*10)/10,totalMinutes:Math.round(min*10)/10};}).filter(function(x){return x.ok;}).sort(function(a,b){return a.totalMinutes-b.totalMinutes||a.totalKm-b.totalKm;});
 var out={ok:true,build:'2026-09-19_LISBON_ODEMIRA_ROUTE_DIAGNOSTICS_R1',startEnd:'Lisbon Airport (LIS)',companyLocations:loc,legs:legs,rankedRoutes:routes,bestRoute:routes[0]||null,meta:{companyLocationOwner:'Companies',routeOwner:'BatchPlanningRouteMatrix',travelTimeLeading:true,distanceInformational:true,liveReadsPerformed:true,liveWritesPerformed:false}};console.info(JSON.stringify(out,null,2));return out;
}