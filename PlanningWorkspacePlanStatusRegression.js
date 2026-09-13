/***********************************************************************
 * PlanningWorkspacePlanStatusRegression.js
 * BUILD: 2026-09-13_WORKSPACE_PLAN_STATUS_REGRESSION_R1
 * READ-ONLY regression for canonical PLAN lifecycle semantics.
 ***********************************************************************/
var PLANNING_WORKSPACE_PLAN_STATUS_REGRESSION_BUILD='2026-09-13_WORKSPACE_PLAN_STATUS_REGRESSION_R1';
function PWPSR_assert_(cond,msg,items){items.push({name:msg,passed:!!cond});if(!cond)throw new Error('FAIL: '+msg);}
function RUN_PLANNING_WORKSPACE_PLAN_STATUS_REGRESSION(){
  var items=[];
  var managerPending=Status_applyTransition_({status:'Pending Planning',action:'PLAN',role:'MANAGER'});
  var auditorPending=Status_applyTransition_({status:'Pending Planning',action:'PLAN',role:'AUDITOR'});
  var managerPendingApproval=Status_applyTransition_({status:'Pending Approval',action:'PLAN',role:'MANAGER'});
  var managerApproved=Status_applyTransition_({status:'Approved',action:'PLAN',role:'MANAGER'});
  var managerAccepted=Status_applyTransition_({status:'Accepted',action:'PLAN',role:'MANAGER'});
  PWPSR_assert_(managerPending&&managerPending.ok===true,'Manager PLAN allowed from Pending Planning',items);
  PWPSR_assert_(managerPending.afterStatus==='APPROVED','Manager PLAN targets Approved',items);
  PWPSR_assert_(managerPending.afterStatusDisplay==='Approved','Manager PLAN display target is Approved',items);
  PWPSR_assert_(auditorPending&&auditorPending.ok===true,'Auditor PLAN allowed from Pending Planning',items);
  PWPSR_assert_(auditorPending.afterStatus==='PENDING_APPROVAL','Auditor PLAN targets Pending Approval',items);
  PWPSR_assert_(managerPendingApproval&&managerPendingApproval.ok!==true,'Manager PLAN blocked from Pending Approval',items);
  PWPSR_assert_(managerApproved&&managerApproved.ok!==true,'Manager PLAN blocked from Approved',items);
  PWPSR_assert_(managerAccepted&&managerAccepted.ok!==true,'Manager PLAN blocked from Accepted',items);
  PWPSR_assert_(typeof PlanningCanonicalCommitService_commit==='function','Canonical commit service loaded',items);
  PWPSR_assert_(String(PLANNING_CANONICAL_COMMIT_BUILD||'').indexOf('STALE_STATUS_GUARD')>=0,'Canonical commit stale-status guard build loaded',items);
  var out={ok:true,build:PLANNING_WORKSPACE_PLAN_STATUS_REGRESSION_BUILD,passed:items.filter(function(x){return x.passed;}).length,total:items.length,items:items,meta:{nonDestructive:true,spreadsheetReads:false,spreadsheetWrites:false,planningWrites:false,availabilityWrites:false,statusWrites:false,noNewSsot:true}};
  console.log(JSON.stringify(out,null,2));
  return out;
}
