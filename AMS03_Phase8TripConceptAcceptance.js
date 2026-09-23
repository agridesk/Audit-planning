/***********************************************************************
 * AMS03_Phase8TripConceptAcceptance.js
 * BUILD: 2026-09-23_AMS03_PHASE8_TRIP_CONCEPT_ACCEPTANCE_R2_BOUNDED_HELPER
 ***********************************************************************/
function RUN_AMS03_PHASE8_TRIP_CONCEPT_ACCEPTANCE(){
 var s=String(PlanningTripConceptReadModel_get),loc=String(PTC_locationsFromProfile_),ct=PlanningWorkspaceTripConceptRpc_contract(),r=[];function q(n,v){r.push({name:n,ok:!!v});}
 q('decisionModelOwner',s.indexOf('PlanningWorkspaceDecisionReadModel_get')>=0);
 q('boundedCompanyLocationOwner',s.indexOf('PlanningProfilesService_get')>=0&&s.indexOf('PTC_locationsFromProfile_')>=0);
 q('selectedAuditIds',s.indexOf('input.auditIds')>=0);
 q('auditorCandidateFit',s.indexOf('candidateForAuditor')>=0);
 q('rotationWarning',s.indexOf('rotationWarning')>=0);
 q('planningWindowContext',s.indexOf('planningWindowFrom')>=0&&s.indexOf('planningWindowTo')>=0);
 q('gpsAndMapContext',s.indexOf('mapsUrl')>=0&&s.indexOf('gpsValid')>=0&&loc.indexOf('locationsJson')>=0);
 q('simpleDistanceAdvisory',s.indexOf('PTC_haversineKm_')>=0);
 q('travelModesVisible',s.indexOf("['car','train','flight']")>=0);
 q('flightPenaltySoft',s.indexOf('SOFT_EXPLICIT_FLIGHT_PENALTY')>=0);
 q('noInventedTravelTime',s.indexOf('travelTimeCalculated:false')>=0);
 q('noInventedCost',s.indexOf('travelCostCalculated:false')>=0);
 q('hotelManual',s.indexOf('autonomousBooking:false')>=0);
 q('noHeavyOptimizer',s.indexOf('routeOptimization:false')>=0);
 q('canonicalCommitStillRequired',s.indexOf('canonicalCommitRequired:true')>=0);
 q('workspaceOnDemandRpc',ct.meta.onDemand===true&&ct.meta.bootstrapInflation===false);
 q('noWrites',s.indexOf('setValue(')<0&&s.indexOf('setValues(')<0&&ct.meta.directSheetWrites===false);
 q('noNewSsot',s.indexOf('newSsot:false')>=0&&ct.meta.newSsot===false);
 var f=r.filter(function(x){return!x.ok}).length,o={ok:f===0,build:'2026-09-23_AMS03_PHASE8_TRIP_CONCEPT_ACCEPTANCE_R2_BOUNDED_HELPER',total:r.length,passed:r.length-f,failed:f,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,newSsot:false}};Logger.log(JSON.stringify(o,null,2));return o;
}
