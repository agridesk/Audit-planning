/***********************************************************************
 * zz_PlanningWorkspaceAvailabilityContextOverride_20260912.js
 * BUILD: 2026-09-12_WORKSPACE_AVAILABILITY_CONTEXT_R5_PROJECTED_CONTEXT
 *
 * Keeps internal Audit ID as auditRef for client joins AND preserves the
 * server-projected company + scopes context supplied by the overlay bundle.
 * Audit ID remains internal and is never rendered to the user.
 *
 * No additional reads, RPCs or source of truth.
 ***********************************************************************/
var PLANNING_WORKSPACE_AVAILABILITY_CONTEXT_OVERRIDE_BUILD='2026-09-12_WORKSPACE_AVAILABILITY_CONTEXT_R5_PROJECTED_CONTEXT';

function PWOB_availabilityIndex_(rows,contextByAuditId){
  var o={},ctx=contextByAuditId||{};
  for(var i=0;i<(rows||[]).length;i++){
    var r=rows[i]||{},e=PWOB_norm_(r.auditorEmail),d=PWOB_clean_(r.date);
    if(!e||!d)continue;
    if(!o[e])o[e]=[];
    var state='';
    if(r.available===true)state='YES';
    else if(r.available===false)state='NO';
    else{
      var x=PWOB_clean_(r.available).toUpperCase();
      if(x==='TRUE'||x==='YES'||x==='Y'||x==='1'||x==='AVAILABLE'||x==='BESCHIKBAAR')state='YES';
      else if(x==='FALSE'||x==='NO'||x==='N'||x==='0'||x==='UNAVAILABLE'||x==='NOT AVAILABLE'||x==='NIET BESCHIKBAAR')state='NO';
    }
    var slots=[];
    (r.slots||[]).forEach(function(s){
      var auditRef=PWOB_clean_(s&&s.auditId),c=auditRef&&ctx[auditRef]?ctx[auditRef]:{};
      slots.push({
        start:PWOB_clean_(s&&s.start),
        end:PWOB_clean_(s&&s.end),
        status:PWOB_clean_(s&&s.status),
        auditRef:auditRef,
        company:PWOB_clean_(c&&c.company),
        scopes:Array.isArray(c&&c.scopes)?c.scopes.slice():[]
      });
    });
    o[e].push({date:d,state:state,slots:slots});
  }
  return o;
}

function PlanningWorkspaceAvailabilityContextOverride_contract(){return{
  build:PLANNING_WORKSPACE_AVAILABILITY_CONTEXT_OVERRIDE_BUILD,
  internalJoinKey:'auditRef',
  projectedContextFields:['company','scopes'],
  auditIdUserVisible:false,
  extraReads:0,
  extraRpcs:0,
  canonicalOwner:'AvailabilityService / Auditor Availability',
  plannerContextOwner:'Audit planning',
  newSsot:false
};}
