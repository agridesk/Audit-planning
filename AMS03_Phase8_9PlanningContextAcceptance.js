/***********************************************************************
 * AMS03_Phase8_9PlanningContextAcceptance.js
 * BUILD: 2026-09-23_AMS03_PHASE8_9_CONTEXT_GATE_R1
 ***********************************************************************/
function RUN_AMS03_PHASE8_9_PLANNING_CONTEXT_ACCEPTANCE(){
 var t=RUN_AMS03_PHASE8_TRIP_WORKWEEK_ACCEPTANCE(),ts=String(getPlanningTripWorkweekV5),cs=String(getPlanningCompanyCommunicationV5),r=[];function q(n,v){r.push({name:n,ok:!!v});}
 q('phase8Architecture',t&&t.ok===true);
 q('tripUsesAuditorProfileOwner',ts.indexOf('PlanningProfilesService_get')>=0&&ts.indexOf("includeCompanies:false")>=0);
 q('tripBaseLocation',ts.indexOf('baseLocation')>=0);
 q('tripAdvisoryNoRouteEngine',ts.indexOf('routeOptimization:false')>=0&&ts.indexOf('travelTimeCalculated:false')>=0);
 q('companyUsesProfilesOwner',cs.indexOf('PlanningProfilesService_get')>=0&&cs.indexOf('includeAuditors:false')>=0);
 q('companyContactContext',cs.indexOf('contactEmail')>=0);
 q('companyPlanningConstraints',cs.indexOf('planningLimitsDays')>=0&&cs.indexOf('planningLimitsHours')>=0);
 q('companyProposalOwnerDeclared',cs.indexOf("proposalOwner:'Company_Update_Proposals'")>=0);
 q('companyNoSend',cs.indexOf('sends:false')>=0);
 q('noDirectWrites',ts.indexOf('setValue(')<0&&ts.indexOf('setValues(')<0&&cs.indexOf('setValue(')<0&&cs.indexOf('setValues(')<0);
 q('noNewSsot',ts.indexOf('newSsot:false')>=0&&cs.indexOf('newSsot:false')>=0);
 var failed=r.filter(function(x){return!x.ok}).length,out={ok:failed===0,build:'2026-09-23_AMS03_PHASE8_9_CONTEXT_GATE_R1',total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,newSsot:false}};Logger.log(JSON.stringify(out,null,2));return out;
}
