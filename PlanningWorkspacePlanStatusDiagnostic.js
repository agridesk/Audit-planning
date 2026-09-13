/***********************************************************************
 * PlanningWorkspacePlanStatusDiagnostic.js
 * BUILD: 2026-09-13_WORKSPACE_PLAN_STATUS_DIAGNOSTIC_R2_ACTIVE_CONCEPTS
 * READ-ONLY diagnostic for STATUS_TRANSITION_BLOCKED in Workspace Plan.
 ***********************************************************************/
var PLANNING_WORKSPACE_PLAN_STATUS_DIAG_BUILD='2026-09-13_WORKSPACE_PLAN_STATUS_DIAGNOSTIC_R2_ACTIVE_CONCEPTS';

function PWPSD_clean_(v){return String(v==null?'':v).trim();}

function RUN_PLANNING_WORKSPACE_PLAN_STATUS_DIAGNOSTIC(){
  var ss=SpreadsheetApp.getActive();
  var sh=ss&&ss.getSheetByName('Audit planning');
  if(!sh)throw new Error("Sheet 'Audit planning' missing.");

  var ctx=loadContext_(sh);
  var reservations=(typeof ConceptReservationReadModel_get==='function')
    ? ConceptReservationReadModel_get({})
    : null;
  var rows=reservations&&Array.isArray(reservations.rows)?reservations.rows:[];
  var items=[];

  for(var i=0;i<rows.length;i++){
    var r=rows[i]||{};
    var auditId=PWPSD_clean_(r.auditId);
    if(!auditId)continue;
    var rowInfo=findAudit_(ctx,auditId);
    if(!rowInfo){
      items.push({auditId:auditId,found:false,reservationStatus:PWPSD_clean_(r.status),sourceRevision:PWPSD_clean_(r.sourceRevision)});
      continue;
    }
    var managerTransition=Status_applyTransition_({status:rowInfo.status,action:'PLAN',role:'MANAGER'});
    var auditorTransition=Status_applyTransition_({status:rowInfo.status,action:'PLAN',role:'AUDITOR'});
    var revision=typeof PlanningRevisionTokenService_get==='function'?PlanningRevisionTokenService_get({auditId:auditId}):null;
    items.push({
      auditId:auditId,
      found:true,
      canonicalStatus:PWPSD_clean_(rowInfo.status),
      normalizedStatus:typeof Status_normalizeStatus_==='function'?Status_normalizeStatus_(rowInfo.status):'',
      managerPlanTransition:managerTransition,
      auditorPlanTransition:auditorTransition,
      reservation:{
        auditorEmail:PWPSD_clean_(r.auditorEmail),
        auditorName:PWPSD_clean_(r.auditorName),
        sourceRevision:PWPSD_clean_(r.sourceRevision),
        currentRevision:PWPSD_clean_(revision&&revision.revision),
        revisionMatches:PWPSD_clean_(r.sourceRevision)===PWPSD_clean_(revision&&revision.revision),
        blockCount:Array.isArray(r.blocks)?r.blocks.length:0
      }
    });
  }

  var out={
    ok:true,
    build:PLANNING_WORKSPACE_PLAN_STATUS_DIAG_BUILD,
    reservationCount:rows.length,
    items:items,
    summary:{
      found:items.filter(function(x){return x.found===true;}).length,
      missing:items.filter(function(x){return x.found===false;}).length,
      managerPlanAllowed:items.filter(function(x){return x.found===true&&x.managerPlanTransition&&x.managerPlanTransition.ok===true;}).length,
      managerPlanBlocked:items.filter(function(x){return x.found===true&&(!x.managerPlanTransition||x.managerPlanTransition.ok!==true);}).length,
      revisionMismatch:items.filter(function(x){return x.found===true&&x.reservation&&x.reservation.revisionMatches===false;}).length
    },
    meta:{nonDestructive:true,spreadsheetWrites:false,planningWrites:false,availabilityWrites:false,statusWrites:false}
  };
  console.log(JSON.stringify(out,null,2));
  return out;
}
