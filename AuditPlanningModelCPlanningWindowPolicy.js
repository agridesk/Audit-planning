/**
 * AMS-01.6 Model C — generic planning-window policy owner.
 *
 * Canonical rules:
 * - Explicit Planning_Window_From + Planning_Window_To always win.
 * - A partial explicit window is invalid and must hard-block.
 * - For Config_Scopes Recurring=NO with a four-digit Cycle_Key and no explicit
 *   window, the effective operational planning window is the full cycle year.
 * - This fallback is operational only. It does not create certificate expiry,
 *   certificate birthday, extension data or an automatic successor.
 * - Recurring scopes never receive a Cycle_Key full-year fallback here.
 */
var MODEL_C_PLANNING_WINDOW_POLICY_BUILD='2026-09-21_AMS_01_6_MODEL_C_PLANNING_WINDOW_POLICY_R1_NONRECURRING_ANNUAL';

function ModelCPlanningWindowPolicy_text_(v){
  return String(v===null||v===undefined?'':v).trim();
}

function ModelCPlanningWindowPolicy_dateText_(ss,v){
  if(!v)return'';
  if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v.getTime())){
    return Utilities.formatDate(v,ss.getSpreadsheetTimeZone()||Session.getScriptTimeZone(),'yyyy-MM-dd');
  }
  var s=ModelCPlanningWindowPolicy_text_(v);
  if(!s)return'';
  var m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m?(m[1]+'-'+m[2]+'-'+m[3]):'';
}

function ModelCPlanningWindowPolicy_resolveObligation_(ss,ob){
  ss=ss||SpreadsheetApp.getActive();ob=ob||{};
  var scope=ModelCPlanningWindowPolicy_text_(ob.ScopeCode);
  var cycle=ModelCPlanningWindowPolicy_text_(ob.Cycle_Key);
  var from=ModelCPlanningWindowPolicy_dateText_(ss,ob.Planning_Window_From);
  var to=ModelCPlanningWindowPolicy_dateText_(ss,ob.Planning_Window_To);

  if((from&&!to)||(!from&&to)){
    return{success:false,hardBlock:true,reason:'PARTIAL_EXPLICIT_WINDOW',scopeCode:scope,cycleKey:cycle,startDate:from,endDate:to,source:'Audit_Obligations'};
  }
  if(from&&to){
    if(from>to)return{success:false,hardBlock:true,reason:'EXPLICIT_WINDOW_REVERSED',scopeCode:scope,cycleKey:cycle,startDate:from,endDate:to,source:'Audit_Obligations'};
    return{success:true,hardBlock:false,reason:'EXPLICIT_CANONICAL_WINDOW',scopeCode:scope,cycleKey:cycle,startDate:from,endDate:to,source:'Audit_Obligations',fallback:false};
  }

  var recurring=ModelCRecurringConfig_isRecurring_(ss,scope);
  if(recurring===false&&/^20\d{2}$/.test(cycle)){
    return{success:true,hardBlock:false,reason:'NON_RECURRING_CYCLE_YEAR_FALLBACK',scopeCode:scope,cycleKey:cycle,startDate:cycle+'-01-01',endDate:cycle+'-12-31',source:'Cycle_Key operational fallback',fallback:true};
  }

  return{success:false,hardBlock:true,reason:recurring===false?'NON_RECURRING_CYCLE_KEY_INVALID':'RECURRING_WINDOW_MISSING',scopeCode:scope,cycleKey:cycle,startDate:'',endDate:'',source:'Audit_Obligations'};
}

function ModelCPlanningWindowPolicy_resolveVisitObligations_(ss,obligations){
  ss=ss||SpreadsheetApp.getActive();obligations=obligations||[];
  if(!obligations.length)return{success:false,hardBlock:true,reason:'NO_OBLIGATIONS',scopeWindows:[]};
  var windows=[],failures=[];
  obligations.forEach(function(ob){
    var r=ModelCPlanningWindowPolicy_resolveObligation_(ss,ob);
    if(!r.success){failures.push(r);return;}
    windows.push({scope:r.scopeCode,start:r.startDate,end:r.endDate,mode:r.reason,fallback:r.fallback===true});
  });
  if(failures.length)return{success:false,hardBlock:true,reason:'OBLIGATION_WINDOW_INVALID',scopeWindows:windows,failures:failures};

  var maxStart=windows[0].start,minEnd=windows[0].end,minStart=windows[0].start,maxEnd=windows[0].end;
  for(var i=1;i<windows.length;i++){
    if(windows[i].start>maxStart)maxStart=windows[i].start;
    if(windows[i].end<minEnd)minEnd=windows[i].end;
    if(windows[i].start<minStart)minStart=windows[i].start;
    if(windows[i].end>maxEnd)maxEnd=windows[i].end;
  }
  var conflict=maxStart>minEnd;
  return{success:true,hardBlock:conflict,reason:conflict?'SCOPE_WINDOW_CONFLICT_EMPTY_INTERSECTION':'MODEL_C_INTERSECTION',startDate:conflict?minStart:maxStart,endDate:conflict?maxEnd:minEnd,scopeWindows:windows};
}

function RUN_MODEL_C_NONRECURRING_WINDOW_POLICY_ACCEPTANCE(){
  var ss=SpreadsheetApp.getActive();
  var sh=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
  if(!sh)throw new Error('Missing sheet: '+MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
  var rows=ModelCMigration_rowsToObjects_(sh.getDataRange().getValues());
  var counts={obligations:0,recurring:0,nonRecurring:0,explicitWindows:0,cycleFallbacks:0,invalid:0,partialExplicit:0,missingRecurring:0};
  var invalid=[];
  rows.forEach(function(ob){
    var state=ModelCPlanningWindowPolicy_text_(ob.Obligation_State).toUpperCase();
    if(state==='CANCELLED'||state==='REJECTED')return;
    var scope=ModelCPlanningWindowPolicy_text_(ob.ScopeCode);if(!scope)return;
    counts.obligations++;
    var recurring=ModelCRecurringConfig_isRecurring_(ss,scope);
    if(recurring)counts.recurring++;else counts.nonRecurring++;
    var r=ModelCPlanningWindowPolicy_resolveObligation_(ss,ob);
    if(r.success){if(r.fallback)counts.cycleFallbacks++;else counts.explicitWindows++;return;}
    counts.invalid++;
    if(r.reason==='PARTIAL_EXPLICIT_WINDOW')counts.partialExplicit++;
    if(r.reason==='RECURRING_WINDOW_MISSING')counts.missingRecurring++;
    invalid.push({obligationId:ModelCPlanningWindowPolicy_text_(ob.Obligation_ID),companyUid:ModelCPlanningWindowPolicy_text_(ob.Company_UID),scopeCode:scope,cycleKey:ModelCPlanningWindowPolicy_text_(ob.Cycle_Key),reason:r.reason});
  });
  var out={success:counts.invalid===0,build:MODEL_C_PLANNING_WINDOW_POLICY_BUILD,readOnly:true,writesPerformed:false,counts:counts,gates:{nonRecurringCycleFallbackImplemented:true,partialExplicitHardBlock:true,noCertificateSemanticsInvented:true,noInvalidEffectiveWindows:counts.invalid===0},invalid:invalid.slice(0,50)};
  Logger.log(JSON.stringify(out,null,2));
  if(!out.success)throw new Error('Model C planning-window policy acceptance found '+counts.invalid+' invalid obligation window(s)');
  return out;
}
