/**
 * AMS-01.6 Model C Phase 2B controlled Scope Manager route smoke test.
 * PURPOSE
 * - Exercise the actual m5t_upsertScopes endpoint used by the Scope Manager.
 * - Operate only on the dedicated DEV test audit/company.
 * - Set MPS-GAP formal hours to 8.5 and preserve all other current scope values.
 * - Immediately verify Model C + legacy projection through Phase 2B reconciliation.
 */
var MODEL_C_PHASE2B_ROUTE_SMOKE_BUILD='2026-09-20_AMS_01_6_MODEL_C_PHASE_2B_ROUTE_SMOKE_R1';

function RUN_MODEL_C_PHASE2B_SCOPE_MANAGER_ROUTE_SMOKE(){
  var ss=SpreadsheetApp.getActive();
  var auditId='AUD_TEST_AcceptedDelta_HQ_1777979469906_101';
  var companyUid='89f8171f-0d7a-4de8-9c4c-14a27bd20bdf';

  var ap=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING);
  if(!ap)throw new Error('Missing Audit planning');
  var values=ap.getDataRange().getValues();
  var headers=values[0]||[];
  var map=ModelCFoundation_headerMap_(headers);
  var rowIndex=ModelCExtension_findRow_(values,map,'Audit ID',auditId);
  if(!rowIndex)throw new Error('Dedicated DEV test audit not found');
  var actualCompanyUid=ModelCFoundation_valueByHeader_(values[rowIndex-1],map,['Company_UID']);
  if(actualCompanyUid!==companyUid)throw new Error('Dedicated DEV test audit company mismatch');

  var cfg=m5t_getAuditPlanningConfig(companyUid);
  if(!cfg||cfg.success!==true||cfg.exists!==true)throw new Error('Unable to load Scope Manager config for dedicated DEV test company');

  var selected=(cfg.scopes||[]).map(function(s){
    var hours=s.customHours!==''&&s.customHours!==null&&s.customHours!==undefined?s.customHours:s.usedHours;
    if(String(s.scope)==='MPS-GAP')hours='8.5';
    return{
      scope:String(s.scope||''),
      enabled:!!s.enabled,
      customHours:hours,
      certificateBirthday:String(s.certificateBirthday||''),
      baseExpiry:String(s.baseExpiry||'')
    };
  });

  var payload={
    companyUid:companyUid,
    companyName:String(cfg.companyName||''),
    selectedScopes:selected,
    preassignedAuditorEmail:String(cfg.preassignedAuditorEmail||''),
    allowSelfPlanning:String(cfg.allowSelfPlanning||'')
  };

  var saveResult=m5t_upsertScopes(payload);
  if(!saveResult||saveResult.success!==true){
    var fail={success:false,build:MODEL_C_PHASE2B_ROUTE_SMOKE_BUILD,stage:'SAVE',saveResult:saveResult||null};
    Logger.log(JSON.stringify(fail,null,2));
    throw new Error('Scope Manager route smoke save failed: '+JSON.stringify(saveResult||null));
  }

  var source=ModelCMigration_readSource_(ss);
  var target=ModelCRecon_readTargets_(ss);
  var reconciliation=(source.success&&target.success)?ModelCPhase2BRecon_compare_(ss,source,target):{success:false,errors:['Unable to read reconciliation source/target']};

  var modelGapHours='';
  var rows=target.rows||{};
  var obligations=rows[MODEL_C_SHEETS.AUDIT_OBLIGATIONS]||[];
  var links=rows[MODEL_C_SHEETS.VISIT_OBLIGATIONS]||[];
  var obById={};
  obligations.forEach(function(x){obById[String(x.Obligation_ID||'')]=x;});
  links.forEach(function(x){
    if(String(x.Audit_ID)!==auditId||String(x.Link_State).toUpperCase()!=='ACTIVE')return;
    var ob=obById[String(x.Obligation_ID||'')];
    if(ob&&String(ob.ScopeCode)==='MPS-GAP')modelGapHours=ob.Formal_Hours;
  });

  var out={
    success:saveResult.success===true&&Number(modelGapHours)===8.5&&reconciliation.success===true,
    build:MODEL_C_PHASE2B_ROUTE_SMOKE_BUILD,
    writesPerformed:true,
    auditId:auditId,
    saveOwnerBuild:saveResult.ownerResult&&saveResult.ownerResult.build||'',
    saveResult:{success:saveResult.success,rowIndex1:saveResult.rowIndex1,totalHours:saveResult.totalHours,ownerResult:saveResult.ownerResult||null},
    modelGapHours:modelGapHours,
    reconciliation:ModelCPhase2BRecon_compact_(reconciliation)
  };
  Logger.log(JSON.stringify(out,null,2));
  if(!out.success)throw new Error('Scope Manager route smoke verification failed');
  return out;
}
