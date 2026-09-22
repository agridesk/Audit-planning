/**
 * FILE: PlanningReAdjustModelCPolicyTests.gs
 * BUILD: 2026-09-22_AMS03_READJUST_MODEL_C_POLICY_TEST_R1
 * RUN: RUN_AMS03_READJUST_MODEL_C_POLICY_ACCEPTANCE
 * Read-only acceptance.
 */
function RUN_AMS03_READJUST_MODEL_C_POLICY_ACCEPTANCE(){
  var errors=[],gates={},sample=null,ss=SpreadsheetApp.getActive();
  function gate(n,v){gates[n]=!!v;if(!v)errors.push(n);}

  var p=PlanningReAdjustModelCPolicy_statusRule_('Pending Approval');
  var a=PlanningReAdjustModelCPolicy_statusRule_('Approved');
  var x=PlanningReAdjustModelCPolicy_statusRule_('Accepted');
  var c=PlanningReAdjustModelCPolicy_statusRule_('Completed');
  gate('pendingApprovalPreserved',p.modifiable&&p.after==='Pending Approval'&&p.statusPreserved&&!p.reacceptanceRequired);
  gate('approvedPreserved',a.modifiable&&a.after==='Approved'&&a.statusPreserved&&!a.reacceptanceRequired);
  gate('acceptedReturnsToApproved',x.modifiable&&x.after==='Approved'&&!x.statusPreserved&&x.reacceptanceRequired);
  gate('completedBlocked',!c.modifiable);

  var sh=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING);
  gate('auditPlanningPresent',!!sh);
  if(sh){
    var rows=PlanningReAdjustModelCPolicy_rows_(sh.getDataRange().getValues());
    var candidate='';
    for(var i=0;i<rows.length;i++){
      var st=String(PlanningReAdjustModelCPolicy_pick_(rows[i],['Status'])||'').trim().toLowerCase();
      var id=String(PlanningReAdjustModelCPolicy_pick_(rows[i],['Audit ID','Audit_ID','AuditId'])||'').trim();
      if(id&&(st==='pending approval'||st==='approved'||st==='accepted')){candidate=id;break;}
    }
    if(candidate)sample=PlanningReAdjustModelCPolicy_build_(ss,candidate);
  }

  gate('liveSampleAvailable',!!sample);
  if(sample){
    gate('liveSampleSuccess',sample.success===true);
    gate('readOnly',sample.readOnly===true&&sample.writesPerformed===false);
    gate('policySameAuditorOnly',sample.policy&&sample.policy.sameAuditorOnly===true);
    gate('policyUsesModelCWindow',sample.policy&&sample.policy.planningWindowOwner==='Audit_Obligations intersection');
    gate('writeOwnerUnchanged',sample.policy&&sample.policy.writeOwner==='PlanningCanonicalModifyService');
    gate('deterministicObligationOrder',(sample.obligations||[]).every(function(v,i,arr){return i===0||(arr[i-1].scopeCode<arr[i].scopeCode)||(arr[i-1].scopeCode===arr[i].scopeCode&&arr[i-1].obligationId<=arr[i].obligationId);}));
    gate('intersectionValid',sample.planningWindow&&sample.planningWindow.valid===true);
    gate('summaryMatchesObligations',sample.summary&&Number(sample.summary.linkedObligations||0)===(sample.obligations||[]).length);
  }

  var out={success:errors.length===0,build:'2026-09-22_AMS03_READJUST_MODEL_C_POLICY_TEST_R1',readOnly:true,writesPerformed:false,sampleAuditId:sample&&sample.auditId||'',sampleStatus:sample&&sample.status||'',sampleSummary:sample&&sample.summary||{},gates:gates,errors:errors};
  Logger.log(JSON.stringify(out,null,2));return out;
}
