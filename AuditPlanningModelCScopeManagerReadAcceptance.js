var MODEL_C_SCOPE_MANAGER_READ_ACCEPTANCE_BUILD='2026-09-20_AMS_01_6_MODEL_C_SCOPE_MANAGER_READ_ACCEPTANCE_R1';

function RUN_MODEL_C_SCOPE_MANAGER_READ_ACCEPTANCE(){
  var ss=SpreadsheetApp.getActive();
  var companyUid='89f8171f-0d7a-4de8-9c4c-14a27bd20bdf';
  var auditId='AUD_TEST_AcceptedDelta_HQ_1777979469906_101';
  var cfg=m5t_getAuditPlanningConfig(companyUid);
  if(!cfg||cfg.success!==true||cfg.exists!==true)throw new Error('Scope Manager config not available for dedicated DEV audit');

  var rows=ModelCRecon_readTargets_(ss).rows||{};
  var cs=rows[MODEL_C_SHEETS.COMPANY_SCOPES]||[];
  var ob=rows[MODEL_C_SHEETS.AUDIT_OBLIGATIONS]||[];
  var lk=rows[MODEL_C_SHEETS.VISIT_OBLIGATIONS]||[];
  var csById={},obById={},expectedByScope={},errors=[];

  cs.forEach(function(x){
    if(String(x.Company_UID)===companyUid)csById[String(x.Company_Scope_ID||'')]=x;
  });
  ob.forEach(function(x){obById[String(x.Obligation_ID||'')]=x;});
  lk.forEach(function(x){
    if(String(x.Audit_ID)!==auditId||String(x.Link_State).toUpperCase()!=='ACTIVE')return;
    var obligation=obById[String(x.Obligation_ID||'')];
    if(!obligation)return;
    var scope=csById[String(obligation.Company_Scope_ID||'')];
    if(!scope)return;
    expectedByScope[String(scope.ScopeCode||'')]=ModelCScopeOwner_hours_(obligation.Formal_Hours);
  });

  var checked=0,samples=[];
  (cfg.scopes||[]).forEach(function(scopeRow){
    var code=String(scopeRow.scope||'');
    if(!Object.prototype.hasOwnProperty.call(expectedByScope,code))return;
    checked++;
    var expected=expectedByScope[code];
    var custom=ModelCScopeOwner_hours_(scopeRow.customHours);
    var used=ModelCScopeOwner_hours_(scopeRow.usedHours);
    var ok=custom===expected&&used===expected;
    if(!ok)errors.push(code+': expected '+expected+', customHours '+custom+', usedHours '+used);
    samples.push({scope:code,expectedFormalHours:expected,uiCustomHours:custom,uiUsedHours:used,ok:ok});
  });

  var expectedCount=Object.keys(expectedByScope).length;
  if(expectedCount===0)errors.push('No active Model C obligations found for dedicated DEV audit');
  if(checked!==expectedCount)errors.push('Scope Manager returned '+checked+' of '+expectedCount+' linked Model C scopes');

  var out={
    success:errors.length===0,
    build:MODEL_C_SCOPE_MANAGER_READ_ACCEPTANCE_BUILD,
    ownerBuild:typeof MODEL_C_SCOPE_OWNER_BUILD==='undefined'?'':MODEL_C_SCOPE_OWNER_BUILD,
    readOnly:true,
    writesPerformed:false,
    companyUid:companyUid,
    auditId:auditId,
    counts:{expectedModelScopes:expectedCount,checkedUiScopes:checked},
    gates:{scopeManagerLoaded:!!cfg,allLinkedScopesReturned:checked===expectedCount,formalHoursReadFromModelC:errors.length===0},
    samples:samples,
    errors:errors
  };
  Logger.log(JSON.stringify(out,null,2));
  if(!out.success)throw new Error('Model C Scope Manager read acceptance failed: '+errors.join('; '));
  return out;
}
