/***********************************************************************
 * zz_PlanningWorkspaceOverlayCanonicalStatusOverride_20260913.js
 * BUILD: 2026-09-13_WORKSPACE_OVERLAY_CANONICAL_STATUS_OVERRIDE_R1
 *
 * Late override: force effective Workspace Availability projection to use
 * canonical Audit planning status from PlanningWorkspaceAvailabilityContext.
 * No extra reads/RPCs; context is already loaded in the same overlay RPC.
 ***********************************************************************/
var PLANNING_WORKSPACE_OVERLAY_CANONICAL_STATUS_OVERRIDE_BUILD='2026-09-13_WORKSPACE_OVERLAY_CANONICAL_STATUS_OVERRIDE_R1';
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
        status:PWOB_clean_((c&&c.status)||(s&&s.status)),
        auditRef:auditRef,
        company:PWOB_clean_(c&&c.company),
        scopes:Array.isArray(c&&c.scopes)?c.scopes.slice():[]
      });
    });
    o[e].push({date:d,state:state,slots:slots});
  }
  return o;
}
