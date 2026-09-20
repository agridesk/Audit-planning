/**
 * AMS-01.6 — one-time repair for Config_Scopes.Recurring lifecycle ownership.
 * Converts existing Model C data to the generic rule:
 * Recurring=YES => certificate expiry lifecycle
 * Recurring=NO  => no certificate expiry / no automatic successor
 */
var MODEL_C_RECURRING_CONFIG_REPAIR_BUILD='2026-09-20_AMS_01_6_MODEL_C_RECURRING_CONFIG_REPAIR_R1';

function RUN_MODEL_C_RECURRING_CONFIG_REPAIR_AND_ACCEPTANCE(){
  var ss=SpreadsheetApp.getActive();
  var lock=LockService.getScriptLock();
  lock.waitLock(15000);
  var changedCompanyScopes=0,changedObligations=0,clearedExpiryFields=0;
  try{
    var cfg=ModelCRecurringConfig_byCode_(ss);
    var csSheet=ss.getSheetByName(MODEL_C_SHEETS.COMPANY_SCOPES);
    var obSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
    if(!csSheet||!obSheet)throw new Error('Missing Model C lifecycle sheets');

    var csValues=csSheet.getDataRange().getValues();
    var obValues=obSheet.getDataRange().getValues();
    var cs=ModelCMigration_rowsToObjects_(csValues);
    var ob=ModelCMigration_rowsToObjects_(obValues);
    var stamp=new Date().toISOString();

    cs.forEach(function(x){
      var code=String(x.ScopeCode||'').trim(),def=cfg[code];
      if(!def)throw new Error('Config_Scopes missing scope: '+code);
      var expected=def.recurring?'CERTIFICATE_RECURRING':'NON_RECURRING';
      var changed=false;
      if(String(x.Lifecycle_Type||'')!==expected){x.Lifecycle_Type=expected;changed=true;}
      if(!def.recurring&&String(x.Certificate_Birthday||'').trim()!==''){x.Certificate_Birthday='';changed=true;}
      if(changed){x.Updated_At=stamp;changedCompanyScopes++;}
    });

    ob.forEach(function(x){
      var code=String(x.ScopeCode||'').trim(),def=cfg[code];
      if(!def)throw new Error('Config_Scopes missing scope: '+code);
      if(def.recurring)return;
      var changed=false;
      ['Base_Expiry_Date','Effective_Expiry_Date','Extension_Applied','Extension_Metadata_JSON'].forEach(function(k){
        if(String(x[k]||'').trim()!==''){x[k]='';changed=true;clearedExpiryFields++;}
      });
      if(changed){x.Updated_At=stamp;changedObligations++;}
    });

    if(changedCompanyScopes){
      ModelCScopeOwner_writeObjects_(csSheet,MODEL_C_SCHEMA.Company_Scopes,cs,['Certificate_Birthday']);
    }
    if(changedObligations){
      ModelCScopeOwner_writeObjects_(obSheet,MODEL_C_SCHEMA.Audit_Obligations,ob,['Cycle_Key','Base_Expiry_Date','Effective_Expiry_Date','Planning_Window_From','Planning_Window_To']);
    }
    SpreadsheetApp.flush();
  }finally{
    try{lock.releaseLock();}catch(ignore){}
  }

  var compatibility=RUN_MODEL_C_COMPATIBILITY_PROJECTION_REPAIR();
  var acceptance=RUN_MODEL_C_RECURRING_CONFIG_ACCEPTANCE();
  var out={
    success:acceptance&&acceptance.success===true,
    build:MODEL_C_RECURRING_CONFIG_REPAIR_BUILD,
    writesPerformed:changedCompanyScopes>0||changedObligations>0||(compatibility&&compatibility.writesPerformed===true),
    owner:'Config_Scopes.Recurring',
    repaired:{companyScopes:changedCompanyScopes,obligations:changedObligations,clearedExpiryFields:clearedExpiryFields},
    compatibility:compatibility,
    acceptance:acceptance
  };
  Logger.log(JSON.stringify(out,null,2));
  if(!out.success)throw new Error('Recurring config repair acceptance failed');
  return out;
}
