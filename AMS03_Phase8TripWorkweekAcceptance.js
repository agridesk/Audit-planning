/***********************************************************************
 * AMS03_Phase8TripWorkweekAcceptance.js
 * BUILD: 2026-09-23_AMS03_PHASE8_TRIP_WORKWEEK_R1
 ***********************************************************************/
function RUN_AMS03_PHASE8_TRIP_WORKWEEK_ACCEPTANCE(){
 var src=String(getPlanningTripWorkweekV5),r=[];function q(n,v){r.push({name:n,ok:!!v});}
 q('companyMapProjectionReused',src.indexOf('CompanyMap_getDataset_AuditorLayer_C01')>=0);
 q('auditorFilter',src.indexOf('auditorEmail')>=0);
 q('dateWindow',src.indexOf('payload.from')>=0&&src.indexOf('payload.to')>=0);
 q('workweekGrouping',src.indexOf('PTW_isoWeek_')>=0);
 q('regionContext',src.indexOf('region:')>=0);
 q('countryContext',src.indexOf('country:')>=0);
 q('gpsContext',src.indexOf('gpsValid')>=0);
 q('noRouteEngine',src.indexOf('routeOptimization:false')>=0&&src.indexOf('travelTimeCalculated:false')>=0);
 q('advisoryOnly',src.indexOf('advisoryOnly:true')>=0);
 q('noWrites',src.indexOf('setValue(')<0&&src.indexOf('setValues(')<0&&src.indexOf('appendRow(')<0);
 q('noNewSsot',src.indexOf('newSsot:false')>=0);
 var failed=r.filter(function(x){return!x.ok}).length,out={ok:failed===0,build:'2026-09-23_AMS03_PHASE8_TRIP_WORKWEEK_R1',total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,newSsot:false}};Logger.log(JSON.stringify(out,null,2));return out;
}
