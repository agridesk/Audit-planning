/***********************************************************************
 * FILE: AMS01_PlanningWorkspaceTransportDiagnostic.js
 * BUILD: 2026-09-17_AMS01_WORKSPACE_TRANSPORT_RCA_R1
 * Non-destructive DEV diagnostic for the remaining browser transport gap.
 ***********************************************************************/
var AMS01_WORKSPACE_TRANSPORT_RCA_BUILD='2026-09-17_AMS01_WORKSPACE_TRANSPORT_RCA_R1';
function AMS01_PWTR_chars_(v){try{return JSON.stringify(v).length;}catch(e){return-1;}}
function RUN_AMS01_PLANNING_WORKSPACE_TRANSPORT_RCA(){
  if(typeof EnvironmentGuard_getRuntimeEnv==='function'){
    var env=String(EnvironmentGuard_getRuntimeEnv()||'').trim().toUpperCase();
    if(env&&env!=='DEV')throw new Error('DEV_ONLY');
  }
  var input={from:'2026-09-01',to:'2026-12-31'};
  var t0=Date.now(),r=PlanningWorkspaceRpc_bootstrap(input),wall=Date.now()-t0;
  if(!r||r.ok!==true||!r.data)throw new Error(r&&r.error&&r.error.message||'BOOTSTRAP_FAILED');
  var a=r.data.advisory||{},o=r.data.overlays||{},res=o.reservations||{},av=o.availability||{};
  var sizes={
    envelopeChars:AMS01_PWTR_chars_(r),
    advisoryChars:AMS01_PWTR_chars_(a),
    advisoryRowsChars:AMS01_PWTR_chars_(a.rows||[]),
    overlayChars:AMS01_PWTR_chars_(o),
    availabilityChars:AMS01_PWTR_chars_(av),
    reservationBundleChars:AMS01_PWTR_chars_(res),
    reservationRowsChars:AMS01_PWTR_chars_(res.rows||[]),
    reservationByAuditorChars:AMS01_PWTR_chars_(res.byAuditorEmail||{}),
    reservationByAuditChars:AMS01_PWTR_chars_(res.byAuditId||{}),
    staleReservationChars:AMS01_PWTR_chars_(res.staleRows||[])
  };
  var duplicateReservationIndexChars=Math.max(0,sizes.reservationByAuditorChars)+Math.max(0,sizes.reservationByAuditChars);
  var leanEstimate=Math.max(0,sizes.envelopeChars-duplicateReservationIndexChars);
  var out={ok:true,build:AMS01_WORKSPACE_TRANSPORT_RCA_BUILD,period:input,serverMs:Number(r.durationMs||0),runnerWallMs:wall,counts:{advisoryRows:Array.isArray(a.rows)?a.rows.length:0,candidateAuditors:r.data.meta&&r.data.meta.candidateAuditors||0,reservationRows:Array.isArray(res.rows)?res.rows.length:0,availabilityAuditors:Object.keys(av.byAuditorEmail||{}).length},sizes:sizes,analysis:{duplicateReservationIndexChars:duplicateReservationIndexChars,duplicateReservationIndexPct:sizes.envelopeChars>0?Math.round(duplicateReservationIndexChars*1000/sizes.envelopeChars)/10:0,leanEnvelopeEstimateChars:leanEstimate,leanEnvelopeReductionPct:sizes.envelopeChars>0?Math.round((sizes.envelopeChars-leanEstimate)*1000/sizes.envelopeChars)/10:0},meta:{nonDestructive:true,liveReads:true,liveWrites:false,purpose:'Separate payload/serialization pressure from Apps Script transport latency before changing the browser contract.'}};
  Logger.log(JSON.stringify(out,null,2));return out;
}
