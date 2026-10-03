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
var MODEL_C_PLANNING_WINDOW_POLICY_BUILD='2026-10-03_AMS_01_6_MODEL_C_PLANNING_WINDOW_POLICY_R2_CONFIG_ANNUAL';

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

function ModelCPlanningWindowPolicy_addMonthsIso_(iso,months){
  var m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return'';
  var y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]),total=y*12+(mo-1)+Number(months||0),ny=Math.floor(total/12),nm=total-ny*12+1,last=new Date(ny,nm,0).getDate();
  return String(ny)+'-'+('0'+nm).slice(-2)+'-'+('0'+Math.min(d,last)).slice(-2);
}

function ModelCPlanningWindowPolicy_configMap_(ss){
  var sh=ss.getSheetByName('Config_Scopes'),out={};
  if(!sh||sh.getLastRow()<2)return out;
  var values=sh.getDataRange().getValues(),h=values[0]||[];
  function ix_(names){for(var i=0;i<h.length;i++){var key=String(h[i]||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();for(var j=0;j<names.length;j++)if(key===names[j])return i;}return-1;}
  var cCode=ix_(['scopecode','scope code','code']),cDisplay=ix_(['displayname','display name','name','scope']),cActive=ix_(['active']),cArchived=ix_(['archived']),cCycle=ix_(['obligation cycle','obligation_cycle','cycle']),cComplete=ix_(['complete by','complete_by','must be completed by']),cFrom=ix_(['planning from','planning_from','planningfrom']),cTo=ix_(['planning to','planning_to','planningto']);
  for(var r=1;r<values.length;r++){
    var code=cCode>=0?String(values[r][cCode]||'').trim():'',display=cDisplay>=0?String(values[r][cDisplay]||'').trim():'';
    var active=cActive<0||['','yes','true','1','x','ja'].indexOf(String(values[r][cActive]||'').trim().toLowerCase())>=0;
    var archived=cArchived>=0&&['yes','true','1','x','ja'].indexOf(String(values[r][cArchived]||'').trim().toLowerCase())>=0;
    if(!active||archived)continue;
    var cfg={
      scopeCode:code,
      displayName:display,
      obligationCycle:cCycle>=0?String(values[r][cCycle]||'').trim().toUpperCase():'',
      completeBy:cComplete>=0?String(values[r][cComplete]||'').trim():'',
      planningFromRaw:cFrom>=0?String(values[r][cFrom]===null||values[r][cFrom]===undefined?'':values[r][cFrom]).trim():'',
      planningToRaw:cTo>=0?String(values[r][cTo]===null||values[r][cTo]===undefined?'':values[r][cTo]).trim():''
    };
    if(code)out[code.toUpperCase()]=cfg;
    if(display)out[display.toUpperCase()]=cfg;
  }
  return out;
}

function ModelCPlanningWindowPolicy_scopeConfig_(ss,scope,configMap){
  configMap=configMap||ModelCPlanningWindowPolicy_configMap_(ss);
  return configMap[String(scope||'').trim().toUpperCase()]||null;
}

function ModelCPlanningWindowPolicy_resolveObligation_(ss,ob,configMap){
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
    var cfg=ModelCPlanningWindowPolicy_scopeConfig_(ss,scope,configMap);
    if(cfg&&cfg.obligationCycle==='ANNUAL'&&/^(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$/.test(cfg.completeBy)){
      var deadline=cycle+'-'+cfg.completeBy,cycleStart=cycle+'-01-01';
      var hasFrom=cfg.planningFromRaw!=='',hasTo=cfg.planningToRaw!=='';
      if(hasFrom!==hasTo){
        return{success:false,hardBlock:true,reason:'PARTIAL_CONFIG_ANNUAL_WINDOW',scopeCode:scope,cycleKey:cycle,startDate:'',endDate:'',source:'Config_Scopes'};
      }
      var start=cycleStart,end=deadline;
      if(hasFrom&&hasTo){
        var fromM=Number(String(cfg.planningFromRaw).replace(',','.')),toM=Number(String(cfg.planningToRaw).replace(',','.'));
        if(!isFinite(fromM)||!isFinite(toM)){
          return{success:false,hardBlock:true,reason:'INVALID_CONFIG_ANNUAL_WINDOW_OFFSETS',scopeCode:scope,cycleKey:cycle,startDate:'',endDate:'',source:'Config_Scopes'};
        }
        start=ModelCPlanningWindowPolicy_addMonthsIso_(deadline,fromM);
        end=ModelCPlanningWindowPolicy_addMonthsIso_(deadline,toM);
        if(start<cycleStart)start=cycleStart;
        if(end>deadline)end=deadline;
      }
      if(!start||!end||start>end){
        return{success:false,hardBlock:true,reason:'CONFIG_ANNUAL_WINDOW_INVALID',scopeCode:scope,cycleKey:cycle,startDate:start||'',endDate:end||'',source:'Config_Scopes'};
      }
      return{success:true,hardBlock:false,reason:'NON_RECURRING_CONFIG_ANNUAL_WINDOW',scopeCode:scope,cycleKey:cycle,startDate:start,endDate:end,completeBy:deadline,source:'Config_Scopes',fallback:true};
    }
    return{success:true,hardBlock:false,reason:'NON_RECURRING_CYCLE_YEAR_FALLBACK',scopeCode:scope,cycleKey:cycle,startDate:cycle+'-01-01',endDate:cycle+'-12-31',source:'Cycle_Key operational fallback',fallback:true};
  }

  return{success:false,hardBlock:true,reason:recurring===false?'NON_RECURRING_CYCLE_KEY_INVALID':'RECURRING_WINDOW_MISSING',scopeCode:scope,cycleKey:cycle,startDate:'',endDate:'',source:'Audit_Obligations'};
}

function ModelCPlanningWindowPolicy_resolveVisitObligations_(ss,obligations){
  ss=ss||SpreadsheetApp.getActive();obligations=obligations||[];
  if(!obligations.length)return{success:false,hardBlock:true,reason:'NO_OBLIGATIONS',scopeWindows:[]};
  var configMap=ModelCPlanningWindowPolicy_configMap_(ss),windows=[],failures=[];
  obligations.forEach(function(ob){
    var r=ModelCPlanningWindowPolicy_resolveObligation_(ss,ob,configMap);
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
