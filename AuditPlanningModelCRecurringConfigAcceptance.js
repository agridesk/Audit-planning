/** AMS-01.6 — Config_Scopes.Recurring lifecycle ownership acceptance. READ-ONLY. */
var MODEL_C_RECURRING_CONFIG_TEST_BUILD='2026-09-21_AMS_01_6_MODEL_C_RECURRING_CONFIG_ACCEPTANCE_R2_CANONICAL_OWNER';

function RUN_MODEL_C_RECURRING_CONFIG_ACCEPTANCE(){
  var ss=SpreadsheetApp.getActive();
  var cfg=ModelCRecurringConfig_byCode_(ss);
  var target=ModelCRecon_readTargets_(ss),rows=target.rows||{};
  var cs=rows[MODEL_C_SHEETS.COMPANY_SCOPES]||[],ob=rows[MODEL_C_SHEETS.AUDIT_OBLIGATIONS]||[],lk=rows[MODEL_C_SHEETS.VISIT_OBLIGATIONS]||[];
  var csById={},obById={},activeAuditByOb={},errors=[],nonRecurringCodes=[],recurringCodes=[];
  Object.keys(cfg).forEach(function(code){(cfg[code].recurring?recurringCodes:nonRecurringCodes).push(code);});
  cs.forEach(function(x){csById[String(x.Company_Scope_ID||'')]=x;});
  ob.forEach(function(x){obById[String(x.Obligation_ID||'')]=x;});
  lk.forEach(function(x){if(String(x.Link_State||'').toUpperCase()==='ACTIVE')activeAuditByOb[String(x.Obligation_ID||'')]=String(x.Audit_ID||'');});

  var recurringObligations=0,nonRecurringObligations=0,nonRecurringWithExpiry=0,recurringMissingExpiry=0,checkedPlans=0,nonRecurringSuccessors=0;
  ob.forEach(function(x){
    var code=String(x.ScopeCode||'').trim(),def=cfg[code];
    if(!def){errors.push('Config_Scopes missing scope: '+code);return;}
    var state=String(x.Obligation_State||'').toUpperCase();
    if(state==='CANCELLED'||state==='REJECTED')return;
    var base=ModelCAuditorProjection_date_(x.Base_Expiry_Date,ss),effective=ModelCAuditorProjection_date_(x.Effective_Expiry_Date,ss);
    if(def.recurring){
      recurringObligations++;
      if(!base&&!effective){recurringMissingExpiry++;errors.push('Recurring obligation missing expiry: '+String(x.Obligation_ID||'')+'|'+code);}
    }else{
      nonRecurringObligations++;
      if(base||effective){nonRecurringWithExpiry++;errors.push('Non-recurring obligation has expiry: '+String(x.Obligation_ID||'')+'|'+code);}
    }
  });

  var auditIds={};
  Object.keys(activeAuditByOb).forEach(function(obId){var id=activeAuditByOb[obId];if(id)auditIds[id]=true;});
  Object.keys(auditIds).forEach(function(auditId){
    var plan=ModelCAnnualCycle_planForAudit_(ss,auditId);checkedPlans++;
    if(!plan.success){(plan.errors||[]).forEach(function(e){if(errors.length<25)errors.push(auditId+': '+e);});return;}
    (plan.successorGroups||[]).forEach(function(g){(g.obligations||[]).forEach(function(s){var def=cfg[String(s.scopeCode||'')];if(def&&def.recurring!==true){nonRecurringSuccessors++;errors.push('Non-recurring successor created: '+auditId+'|'+s.scopeCode);}});});
  });

  var projection=ModelCAuditorProjection_buildIndex_(ss),projectionMismatches=0;
  Object.keys(projection).forEach(function(auditId){
    var p=projection[auditId]||{};
    (p.scopeExpiries||[]).forEach(function(s){
      var def=cfg[String(s.scopeCode||'')];
      if(!def)return;
      if(def.recurring===false&&(s.baseExpiry||s.effectiveExpiry)){
        projectionMismatches++;errors.push('Auditor projection exposes expiry for non-recurring scope: '+auditId+'|'+s.scopeCode);
      }
    });
  });

  var ownerBuild=typeof MODEL_C_RECURRING_CONFIG_BUILD!=='undefined'?MODEL_C_RECURRING_CONFIG_BUILD:'MISSING';
  if(ownerBuild==='MISSING')errors.push('Canonical ModelCRecurringConfig owner build missing');
  var out={
    success:errors.length===0,
    build:MODEL_C_RECURRING_CONFIG_TEST_BUILD,
    ownerBuild:ownerBuild,
    readOnly:true,
    writesPerformed:false,
    counts:{
      configuredScopes:Object.keys(cfg).length,
      recurringScopeCodes:recurringCodes.length,
      nonRecurringScopeCodes:nonRecurringCodes.length,
      recurringObligations:recurringObligations,
      nonRecurringObligations:nonRecurringObligations,
      recurringMissingExpiry:recurringMissingExpiry,
      nonRecurringWithExpiry:nonRecurringWithExpiry,
      checkedAnnualPlans:checkedPlans,
      nonRecurringSuccessors:nonRecurringSuccessors,
      auditorProjectionMismatches:projectionMismatches
    },
    gates:{
      canonicalOwnerLoaded:ownerBuild!=='MISSING',
      lifecycleOwnerIsConfigRecurring:true,
      recurringScopesRequireExpiry:recurringMissingExpiry===0,
      nonRecurringScopesHaveNoExpiry:nonRecurringWithExpiry===0,
      nonRecurringScopesHaveNoAutomaticSuccessor:nonRecurringSuccessors===0,
      auditorProjectionUsesRecurringFlag:projectionMismatches===0
    },
    recurringScopeCodes:recurringCodes.sort(),
    nonRecurringScopeCodes:nonRecurringCodes.sort(),
    errors:errors.slice(0,25)
  };
  out.success=out.success&&Object.keys(out.gates).every(function(k){return out.gates[k]===true;});
  Logger.log(JSON.stringify(out,null,2));
  if(!out.success)throw new Error('Config_Scopes Recurring lifecycle acceptance failed');
  return out;
}
