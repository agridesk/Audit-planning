/***********************************************************************
 * PlanningTripConceptReadModel.js
 * BUILD: 2026-09-23_AMS03_PHASE8_TRIP_CONCEPT_R1
 * Planning 2.0 trip/workweek advisory over existing decision + map owners.
 * No route API, no autonomous optimizer, no writes, no new SSoT.
 ***********************************************************************/
var AMS03_TRIP_CONCEPT_BUILD='2026-09-23_AMS03_PHASE8_TRIP_CONCEPT_R1';
function PTC_s_(v){return String(v==null?'':v).trim();}
function PTC_num_(v){var n=Number(v);return isFinite(n)?n:null;}
function PTC_haversineKm_(a,b){
 if(!a||!b)return null;var a1=PTC_num_(a.lat),o1=PTC_num_(a.lng),a2=PTC_num_(b.lat),o2=PTC_num_(b.lng);if(a1==null||o1==null||a2==null||o2==null)return null;
 var R=6371,d=Math.PI/180,dp=(a2-a1)*d,dl=(o2-o1)*d,x=Math.sin(dp/2)*Math.sin(dp/2)+Math.cos(a1*d)*Math.cos(a2*d)*Math.sin(dl/2)*Math.sin(dl/2);return Math.round((R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)))*10)/10;
}
function PTC_locationIndex_(base){
 var byUid={};(base&&base.entities||[]).forEach(function(e){if(!e||e.gpsValid!==true)return;var uid=PTC_s_(e.companyId);if(!uid)return;if(!byUid[uid])byUid[uid]=[];byUid[uid].push(e);});return byUid;
}
function PlanningTripConceptReadModel_get(input){
 input=input||{};var t0=Date.now(),auditIds=Array.isArray(input.auditIds)?input.auditIds.map(PTC_s_).filter(Boolean):[],wanted={};auditIds.forEach(function(x){wanted[x]=true;});
 var decision=PlanningWorkspaceDecisionReadModel_get({from:input.from,to:input.to,country:input.country||'',scope:input.scope||'',auditorEmails:input.auditorEmail?[PTC_s_(input.auditorEmail).toLowerCase()]:[],auditIds:auditIds});
 var base=CompanyMap_getBaseDatasetForAuditorLayer_(),loc=PTC_locationIndex_(base),aud=PTC_s_(input.auditorEmail).toLowerCase(),rows=(decision.rows||[]).filter(function(r){return !auditIds.length||wanted[PTC_s_(r.auditId)];}).map(function(r){
   var places=loc[PTC_s_(r.companyUid)]||[],place=places.filter(function(x){return String(x.locationCode||'').toUpperCase()==='HQ';})[0]||places[0]||null,cand=(r.candidateAuditors||[]).filter(function(x){return PTC_s_(x.email).toLowerCase()===aud;})[0]||null;
   return{auditId:r.auditId,companyUid:r.companyUid,company:r.company,region:r.region,country:r.country,planningWindowFrom:r.planningWindowFrom,planningWindowTo:r.planningWindowTo,hoursToPlan:r.hoursToPlan,scopes:r.scopes,candidateForAuditor:!!cand,rotationWarning:!!(cand&&cand.rotationWarning),location:place?{code:PTC_s_(place.locationCode)||'HQ',label:PTC_s_(place.locationLabel),lat:place.lat,lng:place.lng,gpsValid:true,mapsUrl:PTC_s_(place.mapsUrl)}:{code:'',label:'',lat:null,lng:null,gpsValid:false,mapsUrl:''}};
 });
 var legs=[],total=0;for(var i=1;i<rows.length;i++){var km=PTC_haversineKm_(rows[i-1].location,rows[i].location);legs.push({fromAuditId:rows[i-1].auditId,toAuditId:rows[i].auditId,straightLineKm:km});if(km!=null)total+=km;}
 var modes=['car','train','flight'].map(function(mode){return{mode:mode,doorToDoorMinutes:null,cost:null,feasible:null,sustainabilityPenalty:mode==='flight'?'SOFT_EXPLICIT_FLIGHT_PENALTY':'NONE',source:'MANUAL_OR_FUTURE_RELIABLE_PROVIDER'};});
 return{success:true,build:AMS03_TRIP_CONCEPT_BUILD,auditorEmail:aud,period:decision.period||{from:input.from||'',to:input.to||''},audits:rows,legs:legs,travelModes:modes,hotelContext:{advisory:true,autonomousBooking:false,startEndPointAllowed:true},summary:{audits:rows.length,gpsReady:rows.filter(function(x){return x.location.gpsValid;}).length,candidateFit:rows.filter(function(x){return x.candidateForAuditor;}).length,rotationWarnings:rows.filter(function(x){return x.rotationWarning;}).length,straightLineKm:Math.round(total*10)/10},meta:{readOnly:true,writes:false,newSsot:false,decisionOwner:'PlanningWorkspaceDecisionReadModel_get',mapOwner:'CompanyMap base dataset',sequencePolicy:'INPUT_ORDER_ADVISORY',routeOptimization:false,travelTimeCalculated:false,travelCostCalculated:false,canonicalCommitRequired:true,totalMs:Date.now()-t0}};
}
