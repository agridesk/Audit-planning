/***********************************************************************
 * PlanningWorkspacePlanStatusDiagnostic.js
 * BUILD: 2026-09-13_WORKSPACE_PLAN_STATUS_DIAGNOSTIC_R1
 * READ-ONLY diagnostic for STATUS_TRANSITION_BLOCKED in Workspace Plan.
 ***********************************************************************/
var PLANNING_WORKSPACE_PLAN_STATUS_DIAG_BUILD='2026-09-13_WORKSPACE_PLAN_STATUS_DIAGNOSTIC_R1';

function RUN_PLANNING_WORKSPACE_PLAN_STATUS_DIAGNOSTIC(){
  var auditId='AUD_ProduccionOrnamental_HQ_1777531729474_08';
  var ss=SpreadsheetApp.getActive();
  var sh=ss&&ss.getSheetByName('Audit planning');
  if(!sh)throw new Error("Sheet 'Audit planning' missing.");
  var ctx=loadContext_(sh);
  var rowInfo=findAudit_(ctx,auditId);
  if(!rowInfo)throw new Error('Audit not found: '+auditId);
  var managerTransition=Status_applyTransition_({status:rowInfo.status,action:'PLAN',role:'MANAGER'});
  var auditorTransition=Status_applyTransition_({status:rowInfo.status,action:'PLAN',role:'AUDITOR'});
  var revision=typeof PlanningRevisionTokenService_get==='function'?PlanningRevisionTokenService_get({auditId:auditId}):null;
  var demand=typeof PlanningDemandService_get==='function'?PlanningDemandService_get({from:'2026-09-01',to:'2026-09-30'}):null;
  var demandRow=null;
  (demand&&demand.rows||[]).some(function(r){if(String(r&&r.auditId||'').trim()===auditId){demandRow=r;return true;}return false;});
  var out={
    ok:true,
    build:PLANNING_WORKSPACE_PLAN_STATUS_DIAG_BUILD,
    auditId:auditId,
    canonical:{status:rowInfo.status,normalizedStatus:typeof Status_normalizeStatus_==='function'?Status_normalizeStatus_(rowInfo.status):'',managerPlanTransition:managerTransition,auditorPlanTransition:auditorTransition,revision:revision&&revision.revision||''},
    workspaceDemand:{present:!!demandRow,status:demandRow&&demandRow.status||'',row:demandRow?{company:demandRow.company||'',planningWindowFrom:demandRow.planningWindowFrom||'',planningWindowTo:demandRow.planningWindowTo||'',requiredHours:demandRow.requiredHours||demandRow.auditHours||''}:null},
    meta:{nonDestructive:true,spreadsheetWrites:false,planningWrites:false,availabilityWrites:false,statusWrites:false}
  };
  console.log(JSON.stringify(out,null,2));
  return out;
}
