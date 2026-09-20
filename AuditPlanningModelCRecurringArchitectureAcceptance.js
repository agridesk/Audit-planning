/** AMS-01.6 — Config-driven recurring lifecycle architecture acceptance. READ-ONLY. */
var MODEL_C_RECURRING_ARCH_ACCEPTANCE_BUILD='2026-09-20_AMS_01_6_MODEL_C_RECURRING_ARCH_ACCEPTANCE_R1';

function RUN_MODEL_C_RECURRING_ARCHITECTURE_ACCEPTANCE(){
  var base=RUN_MODEL_C_RECURRING_CONFIG_ACCEPTANCE();
  var checks=[
    {name:'scopeNormalize',fn:ModelCScopeOwner_normalizeSelected_},
    {name:'scopeValidate',fn:ModelCScopeOwner_validateSelection_},
    {name:'scopeUpdate',fn:ModelCScopeOwner_updateObligation_},
    {name:'legacyProjection',fn:ModelCScopeOwner_projectLegacy_},
    {name:'annualCycle',fn:ModelCAnnualCycle_planForAudit_},
    {name:'auditorProjection',fn:ModelCAuditorProjection_buildIndex_},
    {name:'migrationCompanyScope',fn:ModelCMigration_buildCompanyScope_},
    {name:'migrationObligation',fn:ModelCMigration_buildObligation_},
    {name:'migrationCycleKey',fn:ModelCFoundation_cycleKey_}
  ];
  var errors=[],details=[];
  checks.forEach(function(c){
    var src=String(c.fn||'');
    var hardcodedName=/MPS[- ]ABC/i.test(src);
    var hardcodedHelper=/ModelCFoundation_isAbc_/i.test(src);
    var usesRecurring=/Recurring|recurring|ModelCRecurringConfig_/i.test(src);
    var ok=!hardcodedName&&!hardcodedHelper&&usesRecurring;
    details.push({name:c.name,ok:ok,hardcodedScopeName:hardcodedName,hardcodedLifecycleHelper:hardcodedHelper,usesRecurringConfig:usesRecurring});
    if(!ok)errors.push('Generic lifecycle path not config-driven: '+c.name);
  });
  var out={
    success:base&&base.success===true&&errors.length===0,
    build:MODEL_C_RECURRING_ARCH_ACCEPTANCE_BUILD,
    owner:'Config_Scopes.Recurring',
    readOnly:true,
    writesPerformed:false,
    baseAcceptance:base,
    gates:{
      dataLifecycleClean:base&&base.success===true,
      noHardcodedScopeLifecycle:errors.length===0,
      migrationLifecycleConfigDriven:details.filter(function(x){return x.name.indexOf('migration')===0&&!x.ok;}).length===0
    },
    checks:details,
    errors:errors
  };
  Logger.log(JSON.stringify(out,null,2));
  if(!out.success)throw new Error('Config-driven recurring architecture acceptance failed');
  return out;
}
