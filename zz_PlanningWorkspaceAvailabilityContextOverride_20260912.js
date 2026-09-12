/***********************************************************************
 * zz_PlanningWorkspaceAvailabilityContextOverride_20260912.js
 * BUILD: 2026-09-12_WORKSPACE_AVAILABILITY_CONTEXT_R4_INTERNAL_JOIN
 *
 * Keeps the internal Audit ID only as a join reference so the browser can
 * enrich blocked time with company + scopes from data already loaded in the
 * Workspace advisory payload. It is never rendered to the user.
 *
 * No additional reads, RPCs or source of truth.
 ***********************************************************************/
var PLANNING_WORKSPACE_AVAILABILITY_CONTEXT_OVERRIDE_BUILD='2026-09-12_WORKSPACE_AVAILABILITY_CONTEXT_R4_INTERNAL_JOIN';

function PWOB_availabilityIndex_(rows){
  var o={};
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
      slots.push({
        start:PWOB_clean_(s.start),
        end:PWOB_clean_(s.end),
        status:PWOB_clean_(s.status),
        auditRef:PWOB_clean_(s.auditId)
      });
    });
    o[e].push({date:d,state:state,slots:slots});
  }
  return o;
}

function PlanningWorkspaceAvailabilityContextOverride_contract(){return{
  build:PLANNING_WORKSPACE_AVAILABILITY_CONTEXT_OVERRIDE_BUILD,
  internalJoinKey:'auditRef',
  auditIdUserVisible:false,
  extraReads:0,
  extraRpcs:0,
  canonicalOwner:'AvailabilityService / Auditor Availability',
  newSsot:false
};}
