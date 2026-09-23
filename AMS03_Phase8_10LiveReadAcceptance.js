/***********************************************************************
 * AMS03_Phase8_10LiveReadAcceptance.js
 * BUILD: 2026-09-23_AMS03_PHASE8_10_LIVE_READ_R2_PROFILE_REUSE
 * Read-only DEV smoke. No sends, proposals, commits or mutations.
 ***********************************************************************/
function RUN_AMS03_PHASE8_10_LIVE_READ_ACCEPTANCE(){
 var t0=Date.now(),r=[];function q(n,v,d){r.push({name:n,ok:!!v,detail:d||''});}
 var d=null,trip=null,comm=null,handover=null,profile=null;
 try{d=PlanningWorkspaceDecisionReadModel_get({from:'2026-09-01',to:'2026-11-30'});q('decisionRead',d&&d.success===true,'rows='+(d&&d.rows?d.rows.length:0));}catch(e){q('decisionRead',false,String(e));}
 var row=d&&d.rows&&d.rows[0]||null;
 if(row){
  try{var aud=row.candidateAuditors&&row.candidateAuditors[0]?row.candidateAuditors[0].email:'';trip=PlanningTripConceptReadModel_get({from:'2026-09-01',to:'2026-11-30',auditIds:[row.auditId],auditorEmail:aud});q('tripConceptRead',trip&&trip.success===true,'audits='+(trip&&trip.audits?trip.audits.length:0));}catch(e2){q('tripConceptRead',false,String(e2));}
  try{profile=PlanningProfilesService_get({companyUids:[row.companyUid],includeCompanies:true,includeAuditors:false});comm=getPlanningCompanyCommunicationV5({companyUids:[row.companyUid],preloadedCompanyProfiles:profile});q('companyCommunicationRead',comm&&comm.success===true,'companies='+(comm&&comm.companies?comm.companies.length:0));}catch(e3){q('companyCommunicationRead',false,String(e3));}
  try{handover=getPlanningHandoverV5({companyUid:row.companyUid,auditId:row.auditId,preloadedCompanyProfiles:profile});q('handoverRead',handover&&handover.success===true,'');}catch(e4){q('handoverRead',false,String(e4));}
 }else{q('sampleAuditAvailable',false,'No decision row available in smoke period');}
 q('companyProfileReuse',!!(comm&&comm.meta&&comm.meta.preloadedProfilesUsed===true&&handover&&handover.companyHandover));
 q('noTripWrites',!trip||trip.meta&&trip.meta.writes===false);
 q('noCompanyWrites',!comm||comm.meta&&comm.meta.writes===false);
 q('noHandoverWrites',!handover||handover.meta&&handover.meta.writes===false);
 var f=r.filter(function(x){return!x.ok}).length,o={ok:f===0,build:'2026-09-23_AMS03_PHASE8_10_LIVE_READ_R2_PROFILE_REUSE',total:r.length,passed:r.length-f,failed:f,results:r,summary:{sampleAuditId:row&&row.auditId||'',tripGpsReady:trip&&trip.summary?trip.summary.gpsReady:null,communicationReady:comm&&comm.summary?comm.summary.communicationReady:null},meta:{nonDestructive:true,liveReadsPerformed:true,liveWritesPerformed:false,sendsPerformed:false,newSsot:false,totalMs:Date.now()-t0}};Logger.log(JSON.stringify(o,null,2));return o;
}
