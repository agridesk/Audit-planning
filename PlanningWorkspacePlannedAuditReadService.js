/***********************************************************************
 * PlanningWorkspacePlannedAuditReadService.js
 * BUILD: 2026-09-13_WORKSPACE_PLANNED_AUDIT_READ_R1
 *
 * Targeted read model for Modify/Cancel dialogs. Reads one canonical
 * Audit planning row through PlanningRevisionTokenService only on demand.
 * No bootstrap cost, no writes, no new source of truth.
 ***********************************************************************/
var PLANNING_WORKSPACE_PLANNED_AUDIT_READ_BUILD='2026-09-13_WORKSPACE_PLANNED_AUDIT_READ_R1';
function PWPARS_clean_(v){return String(v==null?'':v).trim();}
function PlanningWorkspacePlannedAuditReadService_get(input){
  input=input||{};
  var auditId=PWPARS_clean_(input.auditId);
  if(!auditId)throw new Error('PlanningWorkspacePlannedAuditReadService: auditId is required');
  if(typeof PlanningRevisionTokenService_get!=='function')throw new Error('PlanningWorkspacePlannedAuditReadService: PlanningRevisionTokenService_get unavailable');
  var rr=PlanningRevisionTokenService_get({auditId:auditId}),snap=rr&&rr.snapshot||{},planning={};
  try{planning=snap.planningJson?JSON.parse(String(snap.planningJson)):{};}catch(e){planning={};}
  var status=PWPARS_clean_(snap.status),normalized=typeof Status_normalizeStatus_==='function'?Status_normalizeStatus_(status):status.toUpperCase().replace(/\s+/g,'_');
  var modifiable=normalized==='APPROVED'||normalized==='PENDING_APPROVAL';
  var cancellable=normalized==='APPROVED'||normalized==='PENDING_APPROVAL'||normalized==='ACCEPTED';
  return{
    success:true,
    build:PLANNING_WORKSPACE_PLANNED_AUDIT_READ_BUILD,
    auditId:auditId,
    status:status,
    normalizedStatus:normalized,
    assignedTo:PWPARS_clean_(snap.assignedTo),
    auditorEmail:PWPARS_clean_(planning.auditorEmail||snap.assignedTo).toLowerCase(),
    auditorName:PWPARS_clean_(planning.auditorName||snap.assignedTo),
    blocks:Array.isArray(planning.blocks)?planning.blocks:[],
    totalPlannedHours:Number(planning.totalPlannedHours||0)||0,
    revision:PWPARS_clean_(rr&&rr.revision),
    permissions:{modify:modifiable,cancel:cancellable},
    policy:{sameAuditorOnly:true,acceptedModifyBlocked:normalized==='ACCEPTED'},
    meta:{writes:false,readOnly:true,onDemand:true,canonicalOwner:'Audit planning',revisionOwner:'PlanningRevisionTokenService',newSsot:false}
  };
}
