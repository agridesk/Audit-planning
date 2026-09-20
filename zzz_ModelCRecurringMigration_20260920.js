/**
 * Model C migration lifecycle compatibility.
 * Generic lifecycle behaviour is owned by Config_Scopes.Recurring.
 */
var MODEL_C_RECURRING_MIGRATION_BUILD='2026-09-20_AMS_01_6_MODEL_C_RECURRING_MIGRATION_R1';

function ModelCFoundation_cycleKey_(row,map,scope){
  scope=scope||{};
  var recurring=ModelCRecurringConfig_truthy_(scope.recurring);
  if(recurring){
    var baseExpiry=ModelCFoundation_valueByHeader_(row,map,['Date - Will Expire']);
    return baseExpiry||'UNRESOLVED_CYCLE';
  }
  var windowFrom=ModelCFoundation_valueByHeader_(row,map,['Planning window from']);
  var yearMatch=/^(\d{4})/.exec(windowFrom);
  if(yearMatch)return yearMatch[1];
  var windowTo=ModelCFoundation_valueByHeader_(row,map,['Planning window to']);
  yearMatch=/^(\d{4})/.exec(windowTo);
  return yearMatch?yearMatch[1]:'UNRESOLVED_YEAR';
}

function ModelCMigration_buildCompanyScope_(row,map,scope,companyUid,auditId,batchId,stamp,generateIds){
  var recurring=ModelCRecurringConfig_truthy_(scope&&scope.recurring);
  return{
    Company_Scope_ID:generateIds?ModelCMigration_newId_('CS_'):'PREVIEW_CS_'+ModelCMigration_safeKey_(companyUid+'_'+scope.scopeCode),
    Company_UID:companyUid,
    ScopeCode:scope.scopeCode,
    Active:'YES',
    Lifecycle_Type:recurring?'CERTIFICATE_RECURRING':'NON_RECURRING',
    Certificate_Birthday:recurring?ModelCFoundation_valueByHeader_(row,map,['Birthdate certificate']):'',
    Company_Formal_Hours_Override:scope.formalHours,
    Certificate_Metadata_JSON:'',
    Migration_Batch_ID:batchId,
    Source_Audit_ID:auditId,
    Created_At:stamp,
    Updated_At:stamp
  };
}

function ModelCMigration_buildObligation_(row,map,scope,companyScope,companyUid,auditId,batchId,stamp,generateIds){
  var recurring=ModelCRecurringConfig_truthy_(scope&&scope.recurring);
  var status=ModelCFoundation_valueByHeader_(row,map,['Status'])||'Pending Planning';
  return{
    Obligation_ID:generateIds?ModelCMigration_newId_('OBL_'):'PREVIEW_OBL_'+ModelCMigration_safeKey_(auditId+'_'+scope.scopeCode),
    Company_Scope_ID:companyScope.Company_Scope_ID,
    Company_UID:companyUid,
    ScopeCode:scope.scopeCode,
    Cycle_Key:ModelCFoundation_cycleKey_(row,map,scope),
    Trigger_Source:recurring?'CERTIFICATE_LIFECYCLE':'NON_RECURRING_SOURCE',
    Obligation_State:ModelCMigration_obligationStateFromVisitStatus_(status),
    Base_Expiry_Date:recurring?ModelCFoundation_valueByHeader_(row,map,['Date - Will Expire']):'',
    Extension_Applied:recurring?ModelCFoundation_valueByHeader_(row,map,['Extension applied']):'',
    Extension_Metadata_JSON:'',
    Effective_Expiry_Date:recurring?ModelCFoundation_valueByHeader_(row,map,['Extended Expiration Date','Date - Will Expire']):'',
    Planning_Window_From:ModelCFoundation_valueByHeader_(row,map,['Planning window from']),
    Planning_Window_To:ModelCFoundation_valueByHeader_(row,map,['Planning window to']),
    Formal_Hours:scope.formalHours,
    Preassigned_Auditor_Email:ModelCFoundation_valueByHeader_(row,map,['Preassigned Auditor']).toLowerCase(),
    Allow_Self_Planning:ModelCFoundation_valueByHeader_(row,map,['Allow self planning']),
    Migration_Batch_ID:batchId,
    Source_Audit_ID:auditId,
    Created_At:stamp,
    Updated_At:stamp,
    Closed_At:''
  };
}
