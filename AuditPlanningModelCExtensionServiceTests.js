var MODEL_C_EXTENSION_TEST_BUILD = '2026-09-20_AMS_01_6_MODEL_C_PHASE_2A_EXTENSION_TESTS_R1';
function RUN_MODEL_C_PHASE2A_EXTENSION_REGRESSION() {
  var tests=[ModelCExtensionTest_certificate_,ModelCExtensionTest_excludesAbc_,ModelCExtensionTest_multiple_,ModelCExtensionTest_noLink_,ModelCExtensionTest_validation_],results=[],passed=0;
  for(var i=0;i<tests.length;i++){try{tests[i]();results.push({name:tests[i].name,ok:true});passed++;}catch(e){results.push({name:tests[i].name,ok:false,error:String(e.message||e)});}}
  var out={ok:passed===tests.length,build:MODEL_C_EXTENSION_TEST_BUILD,serviceBuild:MODEL_C_EXTENSION_BUILD,passed:passed,total:tests.length,writesPerformed:false,results:results}; Logger.log(JSON.stringify(out,null,2)); if(!out.ok)throw new Error('Extension regression failed'); return out;
}
function ModelCExtensionTest_certificate_(){var p=ModelCExtension_planMutation_({auditId:'A1'},[{Obligation_ID:'O1',ScopeCode:'MPS-GAP',Trigger_Source:'CERTIFICATE_LIFECYCLE'}],[{Audit_ID:'A1',Obligation_ID:'O1',Link_State:'ACTIVE'}]);ModelCExtensionTest_assert_(p.success&&p.obligationIds.length===1,'certificate missing');}
function ModelCExtensionTest_excludesAbc_(){var p=ModelCExtension_planMutation_({auditId:'A1'},[{Obligation_ID:'O1',ScopeCode:'MPS-ABC',Trigger_Source:'ECAS'}],[{Audit_ID:'A1',Obligation_ID:'O1',Link_State:'ACTIVE'}]);ModelCExtensionTest_assert_(!p.success,'ABC accepted');}
function ModelCExtensionTest_multiple_(){var p=ModelCExtension_planMutation_({auditId:'A1'},[{Obligation_ID:'O1',ScopeCode:'MPS-GAP',Trigger_Source:'CERTIFICATE_LIFECYCLE'},{Obligation_ID:'O2',ScopeCode:'GRASP',Trigger_Source:'CERTIFICATE_LIFECYCLE'}],[{Audit_ID:'A1',Obligation_ID:'O1',Link_State:'ACTIVE'},{Audit_ID:'A1',Obligation_ID:'O2',Link_State:'ACTIVE'}]);ModelCExtensionTest_assert_(p.obligationIds.length===2,'bundle incomplete');}
function ModelCExtensionTest_noLink_(){var p=ModelCExtension_planMutation_({auditId:'A1'},[],[]);ModelCExtensionTest_assert_(!p.success,'empty accepted');}
function ModelCExtensionTest_validation_(){var c=ModelCExtension_validateCommand_({auditId:'A1',extensionApplied:true,effectiveExpiry:'2027-05-31',planningWindowFrom:'2027-03-01',planningWindowTo:'2027-05-31'});ModelCExtensionTest_assert_(c.extensionApplied==='Yes','flag');}
function ModelCExtensionTest_assert_(v,m){if(!v)throw new Error(m);}
