/***********************************************************************
 * OpenAuditsGrid2Service.js
 * BUILD: 2026-10-01_OPEN_AUDITS_GRID2_SERVICE_R1
 * PURPOSE:
 *   Canonical Manager Portal 2.0 enrichment + extension façade.
 *   Reuses existing Manager V5 / Model C owners; no planning truth duplicated.
 ***********************************************************************/
var OPEN_AUDITS_GRID2_SERVICE_BUILD='2026-10-01_OPEN_AUDITS_GRID2_SERVICE_R1';

function OAG2_clean_(v){return String(v==null?'':v).trim();}
function OAG2_date_(v){
  if(v instanceof Date&&!isNaN(v.getTime()))return Utilities.formatDate(v,Session.getScriptTimeZone(),'yyyy-MM-dd');
  var s=OAG2_clean_(v),m=s.match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:s;
}
function OAG2_ids_(auditIds){
  var out=[],seen={};
  (Array.isArray(auditIds)?auditIds:[]).forEach(function(v){var id=OAG2_clean_(v);if(id&&!seen[id]){seen[id]=true;out.push(id);}});
  return out.slice(0,500);
}
function OAG2_rows_(payload){
  if(Array.isArray(payload))return payload;
  if(payload&&Array.isArray(payload.rows))return payload.rows;
  if(payload&&Array.isArray(payload.audits))return payload.audits;
  return [];
}
function OAG2_reservationContext_(rows,ids){
  var by={},idSet={};ids.forEach(function(id){idSet[id]=true;by[id]=[];});
  if(typeof READ_ACTIVE_RESERVATIONS!=='function')return{byAuditId:by,available:false,reason:'READ_ACTIVE_RESERVATIONS_UNAVAILABLE'};
  var min='',max='';
  rows.forEach(function(r){var f=OAG2_date_(r&&r.planningWindowFrom),t=OAG2_date_(r&&r.planningWindowTo);if(f&&(!min||f<min))min=f;if(t&&(!max||t>max))max=t;});
  if(!min||!max)return{byAuditId:by,available:true,reason:'NO_BOUNDED_WINDOW'};
  try{
    var res=READ_ACTIVE_RESERVATIONS(min,max),list=Array.isArray(res)?res:(res&&Array.isArray(res.rows)?res.rows:[]);
    list.forEach(function(x){var id=OAG2_clean_(x&&x.auditId);if(idSet[id])by[id].push({reservationId:OAG2_clean_(x.reservationId),auditorEmail:OAG2_clean_(x.auditorEmail),date:OAG2_date_(x.date),startTime:OAG2_clean_(x.startTime),endTime:OAG2_clean_(x.endTime),durationMin:Number(x.durationMin||0)||0,source:OAG2_clean_(x.source),status:OAG2_clean_(x.status)});});
    return{byAuditId:by,available:true,periodFrom:min,periodTo:max};
  }catch(e){return{byAuditId:by,available:false,reason:String(e&&e.message?e.message:e)};}
}
function OAG2_decorate_(payload,ids){
  var rows=OAG2_rows_(payload),reservation=OAG2_reservationContext_(rows,ids);
  rows.forEach(function(r){
    var id=OAG2_clean_(r&&r.auditId),rr=reservation.byAuditId[id]||[],provisional=0,confirmed=0;
    rr.forEach(function(x){var s=OAG2_clean_(x.status).toLowerCase();if(s==='provisional')provisional++;else if(s==='confirmed')confirmed++;});
    r.provisionalReservationCount=provisional;
    r.confirmedReservationCount=confirmed;
    r.hasProvisionalPlanning=provisional>0;
    r.hasConfirmedReservation=confirmed>0;
    r.reservations=rr;
    /* No persisted concept-month owner exists in the current codebase. Do not
       synthesize one from preferred months or reservations. */
    if(typeof r.conceptMonth==='undefined')r.conceptMonth='';
    r.conceptCommitted=false;
  });
  return{success:!(payload&&payload.success===false),build:OPEN_AUDITS_GRID2_SERVICE_BUILD,rows:rows,source:payload,meta:{canonicalEnrichmentOwner:'getManagerV5OpenEnriched',planningWindowOwner:'Audit planning / Model C',reservationOwner:'ConceptReservationReadModel',conceptMonthOwner:'NOT_AVAILABLE_CURRENT_MODEL',conceptIsCommitted:false,provisionalIsCommitted:false,reservationRead:reservation.available,reservationReason:reservation.reason||'',reservationPeriodFrom:reservation.periodFrom||'',reservationPeriodTo:reservation.periodTo||''}};
}
function OpenAuditsGrid2_getEnriched(auditIds){
  var ids=OAG2_ids_(auditIds);
  if(!ids.length)return{success:true,build:OPEN_AUDITS_GRID2_SERVICE_BUILD,rows:[],meta:{empty:true}};
  if(typeof getManagerV5OpenEnriched!=='function')return{success:false,error:'MANAGER_OPEN_ENRICHMENT_OWNER_UNAVAILABLE',build:OPEN_AUDITS_GRID2_SERVICE_BUILD};
  var payload=getManagerV5OpenEnriched(ids);
  if(payload&&payload.success===false)return{success:false,error:payload.message||payload.error||'MANAGER_OPEN_ENRICHMENT_FAILED',source:payload,build:OPEN_AUDITS_GRID2_SERVICE_BUILD};
  return OAG2_decorate_(payload,ids);
}
function OpenAuditsGrid2_applyExtension(auditId,command){
  auditId=OAG2_clean_(auditId);command=OAG2_clean_(command).toLowerCase();
  if(!auditId)return{success:false,error:'AUDIT_ID_REQUIRED',build:OPEN_AUDITS_GRID2_SERVICE_BUILD};
  if(command!=='apply'&&command!=='undo')return{success:false,error:'EXTENSION_COMMAND_NOT_ALLOWED',build:OPEN_AUDITS_GRID2_SERVICE_BUILD};
  var fn=command==='apply'?(typeof v5_applyExtension==='function'?v5_applyExtension:null):(typeof v5_undoExtension==='function'?v5_undoExtension:null);
  if(!fn)return{success:false,error:'CANONICAL_EXTENSION_OWNER_UNAVAILABLE',build:OPEN_AUDITS_GRID2_SERVICE_BUILD};
  var result=fn(auditId);
  if(!result||result.success===false)return{success:false,error:(result&&(result.error||result.message))||'EXTENSION_WRITE_FAILED',result:result||null,build:OPEN_AUDITS_GRID2_SERVICE_BUILD};
  var enriched=OpenAuditsGrid2_getEnriched([auditId]);
  if(!enriched.success)return{success:false,error:'EXTENSION_WRITE_SUCCEEDED_REREAD_FAILED',result:result,enrichment:enriched,build:OPEN_AUDITS_GRID2_SERVICE_BUILD};
  return{success:true,build:OPEN_AUDITS_GRID2_SERVICE_BUILD,auditId:auditId,command:command,result:result,patch:enriched.rows[0]||null,meta:enriched.meta};
}
function RUN_OPEN_AUDITS_GRID2_SERVICE_CONTRACT(){
  var out={ok:true,build:OPEN_AUDITS_GRID2_SERVICE_BUILD,writesPerformed:false,checks:[]};
  function c(n,v){out.checks.push({name:n,ok:!!v});if(!v)out.ok=false;}
  c('canonicalEnrichmentOwner',typeof getManagerV5OpenEnriched==='function');
  c('applyExtensionOwner',typeof v5_applyExtension==='function');
  c('undoExtensionOwner',typeof v5_undoExtension==='function');
  c('modelCExtensionOwner',typeof ModelCExtension_commit==='function');
  c('reservationReadOwner',typeof READ_ACTIVE_RESERVATIONS==='function');
  try{Logger.log(JSON.stringify(out,null,2));}catch(e){}
  return out;
}
