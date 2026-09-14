/***********************************************************************
 * PlanningWorkspacePlannedAuditReadService.js
 * BUILD: 2026-09-14_WORKSPACE_PLANNED_AUDIT_READ_R4_DERIVED_HOURS
 *
 * Targeted read model for Modify/Cancel dialogs.
 * Adds canonical planning-window context so Modify can visually enforce the
 * same hard constraint before the user presses Save.
 *
 * R4:
 *   - derives total planned hours from canonical Planning JSON blocks when
 *     totalPlannedHours is absent/stale, so the read model cannot report 0 h
 *     for a valid multi-block planning.
 ***********************************************************************/
var PLANNING_WORKSPACE_PLANNED_AUDIT_READ_BUILD='2026-09-14_WORKSPACE_PLANNED_AUDIT_READ_R4_DERIVED_HOURS';
function PWPARS_clean_(v){return String(v==null?'':v).trim();}
function PWPARS_findCol_(headers,candidates){headers=headers||[];var normalized=headers.map(function(h){return PWPARS_clean_(h).toLowerCase().replace(/[ _\-–—]/g,'');});for(var c=0;c<(candidates||[]).length;c++){var key=PWPARS_clean_(candidates[c]).toLowerCase().replace(/[ _\-–—]/g,'');var ix=normalized.indexOf(key);if(ix>=0)return ix;}return-1;}
function PWPARS_value_(headers,row,candidates){var ix=PWPARS_findCol_(headers,candidates);return ix>=0?row[ix]:'';}
function PWPARS_iso_(v){if(!v)return'';if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v.getTime())){var tz='Etc/UTC';try{tz=SpreadsheetApp.getActive().getSpreadsheetTimeZone()||tz;}catch(e){}return Utilities.formatDate(v,tz,'yyyy-MM-dd');}var s=PWPARS_clean_(v);if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;var m=s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);return m?m[3]+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[1]).slice(-2):'';}
function PWPARS_timeMinutes_(v){var m=PWPARS_clean_(v).match(/^(\d{1,2}):(\d{2})$/);if(!m)return null;var h=Number(m[1]),n=Number(m[2]);if(!isFinite(h)||!isFinite(n)||h<0||h>23||n<0||n>59)return null;return h*60+n;}
function PWPARS_hoursFromBlocks_(blocks){var mins=0,valid=false;for(var i=0;i<(blocks||[]).length;i++){var b=blocks[i]||{},s=PWPARS_timeMinutes_(b.start),e=PWPARS_timeMinutes_(b.end);if(s==null||e==null||e<=s)continue;mins+=e-s;valid=true;}return valid?Math.round((mins/60)*100)/100:0;}
function PlanningWorkspacePlannedAuditReadService_get(input){
  input=input||{};
  var auditId=PWPARS_clean_(input.auditId);
  if(!auditId)throw new Error('PlanningWorkspacePlannedAuditReadService: auditId is required');
  if(typeof PlanningRevisionTokenService_get!=='function')throw new Error('PlanningWorkspacePlannedAuditReadService: PlanningRevisionTokenService_get unavailable');
  if(typeof PRT_readCanonicalRow_!=='function')throw new Error('PlanningWorkspacePlannedAuditReadService: canonical row reader unavailable');

  var rr=PlanningRevisionTokenService_get({auditId:auditId}),snap=rr&&rr.snapshot||{},planning={};
  try{planning=snap.planningJson?JSON.parse(String(snap.planningJson)):{};}catch(e){planning={};}
  var canonical=PRT_readCanonicalRow_(auditId,null),headers=canonical&&canonical.headers||[],row=canonical&&canonical.row||[];
  var planningWindowFrom=PWPARS_iso_(PWPARS_value_(headers,row,['Planning window from','Planning Window From','Plan from','Planning from']));
  var planningWindowTo=PWPARS_iso_(PWPARS_value_(headers,row,['Planning window to','Planning Window To','Plan to','Planning to']));
  var requiredHours=Number(PWPARS_value_(headers,row,['Total audit time in hours','Total audit time','Required audit hours'])||0)||0;
  var blocks=Array.isArray(planning.blocks)?planning.blocks:[];
  var totalPlannedHours=Number(planning.totalPlannedHours||0)||0;
  if(totalPlannedHours<=0&&blocks.length)totalPlannedHours=PWPARS_hoursFromBlocks_(blocks);
  var status=PWPARS_clean_(snap.status),normalized=typeof Status_normalizeStatus_==='function'?Status_normalizeStatus_(status):status.toUpperCase().replace(/\s+/g,'_');
  var modifiable=normalized==='APPROVED'||normalized==='PENDING_APPROVAL'||normalized==='ACCEPTED',cancellable=modifiable;
  return{
    success:true,
    build:PLANNING_WORKSPACE_PLANNED_AUDIT_READ_BUILD,
    auditId:auditId,
    status:status,
    normalizedStatus:normalized,
    assignedTo:PWPARS_clean_(snap.assignedTo),
    auditorEmail:PWPARS_clean_(planning.auditorEmail||snap.assignedTo).toLowerCase(),
    auditorName:PWPARS_clean_(planning.auditorName||snap.assignedTo),
    blocks:blocks,
    totalPlannedHours:totalPlannedHours,
    requiredHours:requiredHours,
    planningWindowFrom:planningWindowFrom,
    planningWindowTo:planningWindowTo,
    revision:PWPARS_clean_(rr&&rr.revision),
    permissions:{modify:modifiable,cancel:cancellable},
    policy:{sameAuditorOnly:true,acceptedModifyAllowed:true,reacceptanceRequired:normalized==='ACCEPTED',acceptedModifyTargetStatus:normalized==='ACCEPTED'?'Approved':'',planningWindowHard:true},
    meta:{writes:false,readOnly:true,onDemand:true,canonicalOwner:'Audit planning',revisionOwner:'PlanningRevisionTokenService',planningWindowOwner:'Audit planning.Planning window from/to',plannedHoursDerivedWhenMissing:true,newSsot:false}
  };
}
