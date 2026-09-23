/***********************************************************************
 * PlanningTripConceptReadModel.js
 * BUILD: 2026-09-23_AMS03_PHASE8_TRIP_CONCEPT_R2_BOUNDED_LOCATION_CONTEXT
 * Planning 2.0 trip/workweek advisory over existing decision + map owners.
 * No route API, no autonomous optimizer, no writes, no new SSoT.
 ***********************************************************************/
var AMS03_TRIP_CONCEPT_BUILD='2026-09-23_AMS03_PHASE8_TRIP_CONCEPT_R4_CANONICAL_GPS_STRING';
function PTC_s_(v){return String(v==null?'':v).trim();}
function PTC_num_(v){var n=Number(v);return isFinite(n)?n:null;}
function PTC_haversineKm_(a,b){
 if(!a||!b)return null;var a1=PTC_num_(a.lat),o1=PTC_num_(a.lng),a2=PTC_num_(b.lat),o2=PTC_num_(b.lng);if(a1==null||o1==null||a2==null||o2==null)return null;
 var R=6371,d=Math.PI/180,dp=(a2-a1)*d,dl=(o2-o1)*d,x=Math.sin(dp/2)*Math.sin(dp/2)+Math.cos(a1*d)*Math.cos(a2*d)*Math.sin(dl/2)*Math.sin(dl/2);return Math.round((R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)))*10)/10;
}
function PTC_gpsPair_(raw){var s=PTC_s_(raw),m=s.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);if(!m)return null;var lat=Number(m[1]),lng=Number(m[2]);if(!isFinite(lat)||!isFinite(lng)||lat < -90||lat > 90||lng < -180||lng > 180)return null;return{lat:lat,lng:lng};}
function PTC_locationsFromProfile_(x){
 var out=[],raw=PTC_s_(x&&x.locationsJson);if(raw){try{var a=JSON.parse(raw);if(!Array.isArray(a)&&a&&Array.isArray(a.locations))a=a.locations;if(Array.isArray(a))a.forEach(function(z){z=z||{};var pair=PTC_gpsPair_(z.gps||z.GPS||z.gpsData||z.gps_data||z.latLng||z.latlong),lat=pair?pair.lat:PTC_num_(z.lat!=null?z.lat:z.latitude),lng=pair?pair.lng:PTC_num_(z.lng!=null?z.lng:z.longitude);if(lat!=null&&lng!=null)out.push({locationCode:PTC_s_(z.code||z.locationCode||z.id||'HQ').toUpperCase(),locationLabel:PTC_s_(z.label||z.name||z.location||z.title||z.code||'HQ'),lat:lat,lng:lng,gpsValid:true,mapsUrl:'https://www.google.com/maps?q='+lat+','+lng});});}catch(e){}}
 return out;
}
function PlanningTripConceptReadModel_get(input){
 input=input||{};var t0=Date.now(),auditIds=Array.isArray(input.auditIds)?input.auditIds.map(PTC_s_).filter(Boolean):[],wanted={};auditIds.forEach(function(x){wanted[x]=true;});
 var decision=PlanningWorkspaceDecisionReadModel_get({from:input.from,to:input.to,country:input.country||'',scope:input.scope||'',auditorEmails:input.auditorEmail?[PTC_s_(input.auditorEmail).toLowerCase()]:[],auditIds:auditIds});
 var companyUids=(decision.rows||[]).map(function(r){return PTC_s_(r.companyUid);}).filter(Boolean),profile=PlanningProfilesService_get({includeCompanies:true,includeAuditors:false,companyUids:companyUids}),loc={},aud=PTC_s_(input.auditorEmail).toLowerCase(),rows=(decision.rows||[]).filter(function(r){return !auditIds.length||wanted[PTC_s_(r.auditId)];}).map(function(r){
   var places=loc[PTC_s_(r.companyUid)]||[],place=places.filter(function(x){return String(x.locationCode||'').toUpperCase()==='HQ';})[0]||places[0]||null,cand=(r.candidateAuditors||[]).filter(function(x){return PTC_s_(x.email).toLowerCase()===aud;})[0]||null;
   return{auditId:r.auditId,companyUid:r.companyUid,company:r.company,region:r.region,country:r.country,planningWindowFrom:r.planningWindowFrom,planningWindowTo:r.planningWindowTo,hoursToPlan:r.hoursToPlan,scopes:r.scopes,candidateForAuditor:!!cand,rotationWarning:!!(cand&&cand.rotationWarning),location:place?{code:PTC_s_(place.locationCode)||'HQ',label:PTC_s_(place.locationLabel),lat:place.lat,lng:place.lng,gpsValid:true,mapsUrl:PTC_s_(place.mapsUrl)}:{code:'',label:'',lat:null,lng:null,gpsValid:false,mapsUrl:''}};
 });
 (profile.companies||[]).forEach(function(x){var uid=PTC_s_(x.companyUid);if(uid)loc[uid]=PTC_locationsFromProfile_(x);});
 rows.forEach(function(r){var places=loc[PTC_s_(r.companyUid)]||[],place=places.filter(function(x){return String(x.locationCode||'').toUpperCase()==='HQ';})[0]||places[0]||null;r.location=place?{code:PTC_s_(place.locationCode)||'HQ',label:PTC_s_(place.locationLabel)||PTC_s_(place.locationCode)||'HQ',lat:place.lat,lng:place.lng,gpsValid:true,mapsUrl:place.mapsUrl}:{code:'',label:'',lat:null,lng:null,gpsValid:false,mapsUrl:''};});
 var legs=[],total=0;for(var i=1;i<rows.length;i++){var km=PTC_haversineKm_(rows[i-1].location,rows[i].location);legs.push({fromAuditId:rows[i-1].auditId,toAuditId:rows[i].auditId,straightLineKm:km});if(km!=null)total+=km;}
 var modes=['car','train','flight'].map(function(mode){return{mode:mode,doorToDoorMinutes:null,cost:null,feasible:null,sustainabilityPenalty:mode==='flight'?'SOFT_EXPLICIT_FLIGHT_PENALTY':'NONE',source:'MANUAL_OR_FUTURE_RELIABLE_PROVIDER'};});
 return{success:true,build:AMS03_TRIP_CONCEPT_BUILD,auditorEmail:aud,period:decision.period||{from:input.from||'',to:input.to||''},audits:rows,legs:legs,travelModes:modes,hotelContext:{advisory:true,autonomousBooking:false,startEndPointAllowed:true},summary:{audits:rows.length,gpsReady:rows.filter(function(x){return x.location.gpsValid;}).length,candidateFit:rows.filter(function(x){return x.candidateForAuditor;}).length,rotationWarnings:rows.filter(function(x){return x.rotationWarning;}).length,straightLineKm:Math.round(total*10)/10},meta:{readOnly:true,writes:false,newSsot:false,decisionOwner:'PlanningWorkspaceDecisionReadModel_get',mapOwner:'PlanningProfilesService bounded Companies/Locations_JSON projection',sequencePolicy:'INPUT_ORDER_ADVISORY',routeOptimization:false,travelTimeCalculated:false,travelCostCalculated:false,canonicalCommitRequired:true,totalMs:Date.now()-t0}};
}
