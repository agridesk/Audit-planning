/**
 * AMS-01.6 Model C — canonical recurring lifecycle configuration reader.
 * Lifecycle behaviour is owned by Config_Scopes.Recurring, never by scope name.
 */
var MODEL_C_RECURRING_CONFIG_BUILD='2026-09-21_AMS_01_6_MODEL_C_RECURRING_CONFIG_R2_CANONICAL';

function ModelCRecurringConfig_truthy_(v){
  var s=String(v==null?'':v).trim().toUpperCase();
  return s==='YES'||s==='TRUE'||s==='1'||s==='X';
}

function ModelCRecurringConfig_byCode_(ss){
  ss=ss||SpreadsheetApp.getActive();
  var sh=ss.getSheetByName(MODEL_C_SHEETS.CONFIG_SCOPES);
  if(!sh)throw new Error('Missing Config_Scopes');
  var v=sh.getDataRange().getValues();
  if(v.length<2)return{};
  var h=v[0]||[],m=ModelCFoundation_headerMap_(h),out={};
  for(var r=1;r<v.length;r++){
    var row=v[r]||[];
    var code=String(ModelCFoundation_valueByHeader_(row,m,['ScopeCode'])||'').trim();
    if(!code)continue;
    var recurringRaw=ModelCFoundation_valueByHeaderRaw_(row,m,['Recurring']);
    out[code]={
      scopeCode:code,
      recurring:ModelCRecurringConfig_truthy_(recurringRaw),
      recurringRaw:String(recurringRaw==null?'':recurringRaw).trim(),
      planningFrom:Number(ModelCFoundation_valueByHeaderRaw_(row,m,['Planning from'])||0),
      planningTo:Number(ModelCFoundation_valueByHeaderRaw_(row,m,['Planning to'])||0)
    };
  }
  return out;
}

function ModelCRecurringConfig_get_(ss,scopeCode){
  var code=String(scopeCode||'').trim();
  if(!code)throw new Error('Missing ScopeCode');
  var cfg=ModelCRecurringConfig_byCode_(ss)[code];
  if(!cfg)throw new Error('Config_Scopes missing scope: '+code);
  return cfg;
}

function ModelCRecurringConfig_isRecurring_(ss,scopeCode){
  return ModelCRecurringConfig_get_(ss,scopeCode).recurring===true;
}

function ModelCRecurringConfig_lifecycleType_(ss,scopeCode){
  return ModelCRecurringConfig_isRecurring_(ss,scopeCode)?'CERTIFICATE_RECURRING':'NON_RECURRING';
}
