// AMS 2.0 GAS Model C — opt-in NEW obligation hours provenance.
// Pure row resolver. No history rewrite, no Sheet mutation.
var MODEL_C_ANNUAL_HOURS_SNAPSHOT_DEV_ID='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
function ModelCAnnualHoursSnapshot20_enabled_(ss){
  var p=PropertiesService.getScriptProperties().getProperty('AMS_DEV_MODEL_C_ANNUAL_HOURS_SNAPSHOT_ENABLED');
  if(p!=='true')return false;
  if(String(ss.getId())!==MODEL_C_ANNUAL_HOURS_SNAPSHOT_DEV_ID)throw Error('MODEL_C_ANNUAL_HOURS_DEV_ONLY');
  return true;
}
function ModelCAnnualHoursSnapshot20_rows_(values,required){
  if(!Array.isArray(values)||!values.length)throw Error('MODEL_C_HOURS_SOURCE_MISSING');
  if(!Array.isArray(values[0]))throw Error('MODEL_C_HOURS_SOURCE_HEADER_INVALID');
  var headers=values[0].map(function(x){return String(x==null?'':x).trim();});
  var unique={};headers.forEach(function(h){var k=h.toLowerCase();if(!h||unique[k])throw Error('MODEL_C_HOURS_SOURCE_HEADER_AMBIGUOUS');unique[k]=true;});
  if(values.slice(1).some(function(row){return !Array.isArray(row);}))throw Error('MODEL_C_HOURS_SOURCE_ROW_MALFORMED');
  required.forEach(function(k){if(headers.indexOf(k)<0)throw Error('MODEL_C_HOURS_HEADER_MISSING_'+k);});
  return values.slice(1).filter(function(r){return r.some(function(x){return String(x==null?'':x).trim()!=='';});}).map(function(r){
    var obj={};headers.forEach(function(h,i){obj[h]=r[i]==null?'':r[i];});return obj;
  });
}
function ModelCAnnualHoursSnapshot20_sources_(ss,companyScopeValues,obligationHeaders){
  ['Formal_Hours','Formal_Hours_Source','Scope_Version_ID','Company_Hours_Override_ID','Company_Hours_Override_Revision','Hours_Resolved_At'].forEach(function(h){
    if(obligationHeaders.indexOf(h)<0)throw Error('MODEL_C_OBLIGATION_HOURS_HEADER_MISSING_'+h);
  });
  var oh=ss.getSheetByName('Company_Scope_Hours'),sv=ss.getSheetByName('ScopeVersions');
  if(!oh||!sv)throw Error('MODEL_C_HOURS_SOURCES_NOT_READY');
  return {
    companyScopes:ModelCAnnualHoursSnapshot20_rows_(companyScopeValues,['Company_Scope_ID','Company_UID','ScopeCode','Active']),
    overrides:ModelCAnnualHoursSnapshot20_rows_(oh.getDataRange().getValues(),['OverrideId','Company_UID','ScopeCode','Hours','Status','Revision','EffectiveFrom','EffectiveTo']),
    versions:ModelCAnnualHoursSnapshot20_rows_(sv.getDataRange().getValues(),['ScopeCode','VersionId','Hours_to_plan','Status','Effective_From','Effective_To'])
  };
}
function ModelCAnnualHoursSnapshot20_day_(value){
  if(value instanceof Date){
    if(isNaN(value.getTime()))throw Error('MODEL_C_HOURS_DATE_INVALID');
    return String(value.getFullYear()).padStart(4,'0')+'-'+String(value.getMonth()+1).padStart(2,'0')+'-'+String(value.getDate()).padStart(2,'0');
  }
  var day=String(value==null?'':value).trim();
  if(!day)return '';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('MODEL_C_HOURS_DATE_INVALID');
  var d=new Date(day+'T00:00:00.000Z');
  if(isNaN(d.getTime())||d.toISOString().slice(0,10)!==day)throw Error('MODEL_C_HOURS_DATE_INVALID');
  return day;
}
function ModelCAnnualHoursSnapshot20_buildNew_(sources,item,companyUid,stamp){
  var str=function(x){return String(x==null?'':x).trim();};
  var cycle=str(item.cycleKey),day=cycle;
  if(/^[0-9]{4}$/.test(cycle)){
    var expiry=ModelCAnnualHoursSnapshot20_day_(item.baseExpiry);
    if(!expiry||expiry.slice(0,4)!==cycle)throw Error('MODEL_C_HOURS_YEAR_CYCLE_EXPIRY_REQUIRED');
    day=expiry;
  }
  try{day=ModelCAnnualHoursSnapshot20_day_(day);}catch{throw Error('MODEL_C_HOURS_CYCLE_DATE_INVALID');}
  if(!day)throw Error('MODEL_C_HOURS_CYCLE_DATE_INVALID');
  var code=str(item.scopeCode),company=str(companyUid),id=str(item.companyScopeId);
  if(!code||!company||!id||!sources)throw Error('MODEL_C_HOURS_IDENTITY_MISSING');
  var relation=sources.companyScopes.filter(function(r){return str(r.Company_Scope_ID)===id&&str(r.Company_UID)===company&&str(r.ScopeCode)===code;});
  if(relation.length!==1||!/^(yes|true|active|1)$/i.test(str(relation[0].Active)))throw Error('MODEL_C_HOURS_COMPANY_SCOPE_INVALID');
  function effective(start,end){
    start=ModelCAnnualHoursSnapshot20_day_(start);end=ModelCAnnualHoursSnapshot20_day_(end);
    if(start&&end&&start>end)throw Error('MODEL_C_HOURS_DATE_RANGE_INVALID');
    return (!start||start<=day)&&(!end||end>=day);
  }
  var versions=sources.versions.filter(function(r){return str(r.ScopeCode)===code&&str(r.Status).toUpperCase()==='CURRENT'&&effective(r.Effective_From,r.Effective_To);});
  if(versions.length!==1||!str(versions[0].VersionId))throw Error('MODEL_C_HOURS_VERSION_UNRESOLVED');
  var overrides=sources.overrides.filter(function(r){return str(r.Company_UID)===company&&str(r.ScopeCode)===code;});
  overrides.forEach(function(r){if(!str(r.OverrideId)||!str(r.Revision)||!str(r.Status))throw Error('MODEL_C_HOURS_OVERRIDE_INCOMPLETE');effective(r.EffectiveFrom,r.EffectiveTo);});
  var active=overrides.filter(function(r){return str(r.Status).toUpperCase()==='ACTIVE'&&effective(r.EffectiveFrom,r.EffectiveTo);});
  if(active.length>1)throw Error('MODEL_C_HOURS_OVERRIDE_OVERLAP');
  var source=active.length?'COMPANY_OVERRIDE':'SCOPE_DEFAULT',override=active[0]||null;
  var h=str(override?override.Hours:versions[0].Hours_to_plan).replace(',','.');
  if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(h)||Number(h)<=0||Number(h)>10000)throw Error('MODEL_C_HOURS_VALUE_INVALID');
  if(Number(item.formalHours)!==Number(h))throw Error('MODEL_C_HOURS_PLAN_RESOLUTION_CONFLICT');
  if(!stamp||isNaN(Date.parse(stamp)))throw Error('MODEL_C_HOURS_TIMESTAMP_INVALID');
  return {
    Formal_Hours:Number(h),Formal_Hours_Source:source,Scope_Version_ID:str(versions[0].VersionId),
    Company_Hours_Override_ID:override?str(override.OverrideId):'',
    Company_Hours_Override_Revision:override?str(override.Revision):'',
    Hours_Resolved_At:stamp
  };
}
