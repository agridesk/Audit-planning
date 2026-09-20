/**
 * AMS-01.6 Model C — canonical recurring lifecycle owner.
 *
 * HARD RULE:
 * Lifecycle behaviour is configuration-driven by Config_Scopes.Recurring.
 * Scope names/codes MUST NOT decide whether expiry/recurrence exists.
 *
 * Recurring = YES  => certificate lifecycle, expiry required, successor eligible.
 * Recurring = NO   => non-recurring lifecycle, no certificate expiry, no automatic successor.
 *
 * MPS-ABC may still have a source-specific ECAS import restriction elsewhere; that is an
 * integration/source rule, not a lifecycle rule.
 */
var MODEL_C_RECURRING_LIFECYCLE_BUILD='2026-09-20_AMS_01_6_MODEL_C_RECURRING_CONFIG_OWNER_R1';

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

/* Compatibility override: normalize selection from the configured Recurring flag. */
function ModelCScopeOwner_normalizeSelected_(items){
  var ss=SpreadsheetApp.getActive(),out={};
  (items||[]).forEach(function(raw){
    raw=raw||{};
    if(!(raw.enabled===true||String(raw.enabled).toLowerCase()==='true'))return;
    var code=String(raw.scopeCode||raw.scope||'').trim();
    if(!code)return;
    var recurring=ModelCRecurringConfig_isRecurring_(ss,code);
    out[code]={
      scopeCode:code,
      recurring:recurring,
      formalHours:raw.formalHours===undefined?raw.customHours:raw.formalHours,
      baseExpiry:recurring?String(raw.baseExpiry||raw.dateWillExpire||'').trim():'',
      certificateBirthday:recurring?String(raw.certificateBirthday||raw.birthdate||'').trim():'',
      lifecycleType:recurring?'CERTIFICATE_RECURRING':'NON_RECURRING'
    };
  });
  /* Dependency rule remains explicit until Config_Scope_Dependencies owns this read path. */
  if(out.GRASP&&out['MPS-GAP']){
    out.GRASP.baseExpiry=out['MPS-GAP'].baseExpiry;
    out.GRASP.certificateBirthday=out['MPS-GAP'].certificateBirthday;
  }
  return out;
}

function ModelCScopeOwner_validateSelection_(selected){
  if(selected.GRASP&&!selected['MPS-GAP'])throw new Error('GRASP requires MPS-GAP');
  Object.keys(selected||{}).forEach(function(code){
    var x=selected[code]||{};
    if(x.recurring!==true)return;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(x.baseExpiry||'')))throw new Error('Expiry date required for '+code);
    if(x.certificateBirthday&&!/^\d{4}-\d{2}-\d{2}$/.test(String(x.certificateBirthday)))throw new Error('Invalid certificate birthday for '+code);
  });
}

function ModelCScopeOwner_newObligation_(command,scope,item,stamp,ss){
  return{
    Obligation_ID:ModelCMigration_newId_('OBL_'),
    Company_Scope_ID:scope.Company_Scope_ID,
    Company_UID:String(command.companyUid),
    ScopeCode:item.scopeCode,
    Cycle_Key:'',
    Trigger_Source:item.recurring===true?'CERTIFICATE_LIFECYCLE':'MANUAL_NON_RECURRING',
    Obligation_State:'OPEN',
    Base_Expiry_Date:'',
    Extension_Applied:'',
    Extension_Metadata_JSON:'',
    Effective_Expiry_Date:'',
    Planning_Window_From:'',
    Planning_Window_To:'',
    Formal_Hours:ModelCScopeOwner_hours_(item.formalHours),
    Preassigned_Auditor_Email:'',
    Allow_Self_Planning:'',
    Migration_Batch_ID:'',
    Source_Audit_ID:String(command.auditId),
    Created_At:stamp,
    Updated_At:stamp,
    Closed_At:''
  };
}

function ModelCScopeOwner_updateObligation_(obligation,command,item,stamp,ss){
  var tz=ss.getSpreadsheetTimeZone()||Session.getScriptTimeZone();
  obligation.Obligation_State='OPEN';
  obligation.Closed_At='';
  obligation.Formal_Hours=ModelCScopeOwner_hours_(item.formalHours);
  obligation.Preassigned_Auditor_Email=String(command.preassignedAuditorEmail||'').toLowerCase();
  obligation.Allow_Self_Planning=String(command.allowSelfPlanning||'');
  obligation.Updated_At=stamp;
  if(item.recurring!==true){
    obligation.Base_Expiry_Date='';
    obligation.Effective_Expiry_Date='';
    obligation.Extension_Applied='';
    obligation.Extension_Metadata_JSON='';
    if(!String(obligation.Cycle_Key||''))obligation.Cycle_Key=String(new Date().getFullYear());
    return;
  }
  var previousBase=ModelCExtension_dateInTz_(obligation.Base_Expiry_Date,tz);
  var baseChanged=previousBase!==item.baseExpiry;
  obligation.Base_Expiry_Date=item.baseExpiry;
  obligation.Cycle_Key=item.baseExpiry;
  if(baseChanged||!ModelCExtension_dateInTz_(obligation.Effective_Expiry_Date,tz)){
    obligation.Effective_Expiry_Date=item.baseExpiry;
    obligation.Extension_Applied='';
    obligation.Extension_Metadata_JSON='';
    var window=ModelCScopeOwner_window_(item.scopeCode,item.baseExpiry,tz);
    obligation.Planning_Window_From=window.from;
    obligation.Planning_Window_To=window.to;
  }
}

function ModelCScopeOwner_enrichUiScopes_(ss,companyUid,auditId,scopes){
  var target=ModelCRecon_readTargets_(ss),rows=target.rows||{},cs=rows[MODEL_C_SHEETS.COMPANY_SCOPES]||[],ob=rows[MODEL_C_SHEETS.AUDIT_OBLIGATIONS]||[],lk=rows[MODEL_C_SHEETS.VISIT_OBLIGATIONS]||[];
  var linked={},csById={},obByCs={};
  lk.forEach(function(x){if(String(x.Audit_ID)===String(auditId)&&String(x.Link_State).toUpperCase()==='ACTIVE')linked[String(x.Obligation_ID)]=true;});
  cs.forEach(function(x){if(String(x.Company_UID)===String(companyUid))csById[String(x.Company_Scope_ID)]=x;});
  ob.forEach(function(x){if(linked[String(x.Obligation_ID)]&&csById[String(x.Company_Scope_ID)])obByCs[String(x.Company_Scope_ID)]=x;});
  return(scopes||[]).map(function(row){
    var match=null;
    Object.keys(csById).some(function(id){if(String(csById[id].ScopeCode)===String(row.scope)){match={cs:csById[id],ob:obByCs[id]||null};return true;}return false;});
    var out={};Object.keys(row).forEach(function(k){out[k]=row[k];});
    var recurring=ModelCRecurringConfig_isRecurring_(ss,row.scope);
    out.recurring=recurring;
    out.certificateBirthday=recurring&&match?ModelCFoundation_clean_(match.cs.Certificate_Birthday):'';
    out.baseExpiry=recurring&&match&&match.ob?ModelCExtension_dateInTz_(match.ob.Base_Expiry_Date,ss.getSpreadsheetTimeZone()):'';
    out.lifecycleType=recurring?'CERTIFICATE_RECURRING':'NON_RECURRING';
    if(match&&match.ob){var modelHours=ModelCScopeOwner_hours_(match.ob.Formal_Hours);out.customHours=modelHours;out.usedHours=modelHours;}
    return out;
  });
}

/* Legacy aggregate projection: only Recurring=YES scopes contribute certificate dates. */
function ModelCScopeOwner_projectLegacy_(sheet,command,selected,obligations,links,ss){
  var values=sheet.getDataRange().getValues(),headers=values[0]||[],map=ModelCFoundation_headerMap_(headers),rowIndex=ModelCExtension_findRow_(values,map,'Audit ID',command.auditId);
  if(!rowIndex)throw new Error('Legacy projection row missing');
  var row=values[rowIndex-1].slice(),defs=m5t_scopeSlotDefs_(ss),total=0,linked={},active=[];
  links.forEach(function(x){if(String(x.Audit_ID)===String(command.auditId)&&String(x.Link_State).toUpperCase()==='ACTIVE')linked[String(x.Obligation_ID)]=true;});
  obligations.forEach(function(x){if(linked[String(x.Obligation_ID)])active.push(x);});
  defs.forEach(function(d){var item=selected[d.scope];if(d.flagCol0!=null)row[d.flagCol0]=item?'x':'';if(d.hourCol0!=null){row[d.hourCol0]=item?ModelCScopeOwner_hours_(item.formalHours):'';if(item)total+=ModelCScopeOwner_hours_(item.formalHours);}});
  ModelCScopeOwner_setLegacy_(row,map,'Total audit time in hours',total);
  ModelCScopeOwner_setLegacy_(row,map,'Preassigned Auditor',String(command.preassignedAuditorEmail||'').toLowerCase());
  ModelCScopeOwner_setLegacy_(row,map,'Allow self planning',String(command.allowSelfPlanning||''));
  var cert=active.filter(function(x){return ModelCRecurringConfig_isRecurring_(ss,String(x.ScopeCode||''));}),from='',to='',earliest='',effectiveEarliest='',birthday='',extension='';
  cert.forEach(function(x){
    var f=ModelCExtension_dateInTz_(x.Planning_Window_From,ss.getSpreadsheetTimeZone()),t=ModelCExtension_dateInTz_(x.Planning_Window_To,ss.getSpreadsheetTimeZone()),e=ModelCExtension_dateInTz_(x.Base_Expiry_Date,ss.getSpreadsheetTimeZone()),z=ModelCExtension_dateInTz_(x.Effective_Expiry_Date,ss.getSpreadsheetTimeZone());
    if(f&&(!from||f>from))from=f;if(t&&(!to||t<to))to=t;if(e&&(!earliest||e<earliest))earliest=e;if(z&&(!effectiveEarliest||z<effectiveEarliest))effectiveEarliest=z;
    if(String(x.Extension_Applied||'').trim())extension='Yes';
    var it=selected[String(x.ScopeCode)];if(it&&it.certificateBirthday&&!birthday)birthday=it.certificateBirthday;
  });
  if(from&&to&&from>to)throw new Error('Selected recurring scopes have no shared planning window');
  ModelCScopeOwner_setLegacy_(row,map,'Birthdate certificate',birthday);
  ModelCScopeOwner_setLegacy_(row,map,'Date - Will Expire',earliest);
  ModelCScopeOwner_setLegacy_(row,map,'Extended Expiration Date',effectiveEarliest||earliest);
  ModelCScopeOwner_setLegacy_(row,map,'Extension applied',extension);
  ModelCScopeOwner_setLegacy_(row,map,'Planning window from',from);
  ModelCScopeOwner_setLegacy_(row,map,'Planning window to',to);
  ModelCScopeOwner_setLegacy_(row,map,'Scopes_List',Object.keys(selected).join(', '));
  var textHeaders=['Birthdate certificate','Date - Will Expire','Extended Expiration Date','Planning window from','Planning window to'];
  textHeaders.forEach(function(header){var col=map[ModelCFoundation_normHeader_(header)];if(col!==undefined)sheet.getRange(rowIndex,col+1).setNumberFormat('@');});
  sheet.getRange(rowIndex,1,1,row.length).setValues([row]);
  return{totalHours:total,certificateScopeCount:cert.length,recurringScopeCount:cert.length,legacyExpiry:earliest,legacyEffectiveExpiry:effectiveEarliest||earliest,planningWindowFrom:from,planningWindowTo:to};
}

/* Annual successor planning: no scope-name special cases. */
function ModelCAnnualCycle_planForAudit_(ss,auditId){
  ss=ss||SpreadsheetApp.getActive();auditId=String(auditId||'').trim();
  var result={success:false,auditId:auditId,currentObligations:0,currentScopes:[],recurring:false,recurringScopes:[],nonRecurringScopes:[],externalScopes:[],nonRecurringOnly:false,externalAbcOnly:false,successorObligations:0,requiresVisitSplit:false,successorGroups:[],errors:[]};
  if(!auditId){result.errors.push('Missing auditId');return result;}
  var target=ModelCRecon_readTargets_(ss),rows=target.rows||{},obligations=rows[MODEL_C_SHEETS.AUDIT_OBLIGATIONS]||[],links=rows[MODEL_C_SHEETS.VISIT_OBLIGATIONS]||[],obById={};
  obligations.forEach(function(ob){var id=String(ob.Obligation_ID||'');if(id)obById[id]=ob;});
  var active=[];
  links.forEach(function(link){if(String(link.Audit_ID||'')!==auditId||String(link.Link_State||'').toUpperCase()!=='ACTIVE')return;var ob=obById[String(link.Obligation_ID||'')];if(!ob){result.errors.push('Orphan active visit link: '+String(link.Obligation_ID||''));return;}var st=String(ob.Obligation_State||'').toUpperCase();if(st==='CANCELLED'||st==='REJECTED'||st==='COMPLETED')return;active.push(ob);});
  result.currentObligations=active.length;result.currentScopes=active.map(function(ob){return String(ob.ScopeCode||'');});
  if(!active.length){result.errors.push('No active obligations linked to audit');return result;}
  var cfg=ModelCAnnualCycle_configByScope_(ss),successors=[];
  active.forEach(function(ob){
    var code=String(ob.ScopeCode||'').trim();if(!code){result.errors.push('Obligation missing ScopeCode');return;}
    var def=cfg[code]||null;if(!def){result.errors.push('Config_Scopes missing scope: '+code);return;}
    if(!def.recurring){result.nonRecurringScopes.push(code);result.externalScopes.push(code);return;}
    result.recurringScopes.push(code);
    var base=ModelCAnnualCycle_iso_(ob.Base_Expiry_Date,ss);if(!base){result.errors.push('Recurring scope missing Base_Expiry_Date: '+code);return;}
    var nextBase=ModelCAnnualCycle_addYearsIso_(base,1),from=ModelCAnnualCycle_addMonthsIso_(nextBase,def.planningFrom),to=ModelCAnnualCycle_addMonthsIso_(nextBase,def.planningTo);
    if(!from||!to){result.errors.push('Unable to calculate successor planning window: '+code);return;}
    successors.push({scopeCode:code,companyScopeId:String(ob.Company_Scope_ID||''),currentObligationId:String(ob.Obligation_ID||''),cycleKey:nextBase,baseExpiry:nextBase,effectiveExpiry:nextBase,planningWindowFrom:from,planningWindowTo:to,formalHours:Number(ob.Formal_Hours||0),triggerSource:'CERTIFICATE_LIFECYCLE'});
  });
  result.recurring=successors.length>0;result.successorObligations=successors.length;
  result.nonRecurringOnly=result.nonRecurringScopes.length>0&&successors.length===0&&result.currentScopes.length===result.nonRecurringScopes.length;
  result.externalAbcOnly=result.nonRecurringOnly; /* backwards-compatible field only */
  if(result.errors.length)return result;
  if(!successors.length){result.success=true;return result;}
  var grouped=ModelCAnnualCycle_groupByWindowIntersection_(successors);result.successorGroups=grouped.groups;result.requiresVisitSplit=grouped.groups.length>1;result.success=grouped.success;if(!grouped.success)result.errors=result.errors.concat(grouped.errors||[]);return result;
}

/* Auditor projection: only Config_Scopes Recurring=YES contributes expiry. */
function ModelCAuditorProjection_buildIndex_(ss){
  ss=ss||SpreadsheetApp.getActive();
  var target=ModelCRecon_readTargets_(ss),rows=target.rows||{},cs=rows[MODEL_C_SHEETS.COMPANY_SCOPES]||[],ob=rows[MODEL_C_SHEETS.AUDIT_OBLIGATIONS]||[],lk=rows[MODEL_C_SHEETS.VISIT_OBLIGATIONS]||[];
  var csById={},obById={},byAudit={},cfg=ModelCRecurringConfig_byCode_(ss);
  cs.forEach(function(x){csById[String(x.Company_Scope_ID||'')]=x;});ob.forEach(function(x){obById[String(x.Obligation_ID||'')]=x;});
  lk.forEach(function(x){if(String(x.Link_State||'').toUpperCase()!=='ACTIVE')return;var auditId=String(x.Audit_ID||'').trim(),obligation=obById[String(x.Obligation_ID||'')];if(!auditId||!obligation)return;var state=String(obligation.Obligation_State||'').toUpperCase();if(state==='CANCELLED'||state==='REJECTED')return;var scope=csById[String(obligation.Company_Scope_ID||'')];if(!scope)return;(byAudit[auditId]=byAudit[auditId]||[]).push({scope:scope,obligation:obligation});});
  var out={};
  Object.keys(byAudit).forEach(function(auditId){
    var linked=byAudit[auditId],scopeExpiries=[],certExpiries=[];
    linked.forEach(function(pair){
      var scopeCode=String(pair.scope.ScopeCode||''),def=cfg[scopeCode];if(!def)throw new Error('Config_Scopes missing scope: '+scopeCode);
      var recurring=def.recurring===true,base=ModelCAuditorProjection_date_(pair.obligation.Base_Expiry_Date,ss),effective=ModelCAuditorProjection_date_(pair.obligation.Effective_Expiry_Date,ss)||base,from=ModelCAuditorProjection_date_(pair.obligation.Planning_Window_From,ss),to=ModelCAuditorProjection_date_(pair.obligation.Planning_Window_To,ss);
      scopeExpiries.push({scopeCode:scopeCode,recurring:recurring,lifecycleType:recurring?'CERTIFICATE_RECURRING':'NON_RECURRING',baseExpiry:recurring?base:'',effectiveExpiry:recurring?effective:'',planningWindowFrom:from,planningWindowTo:to});
      if(recurring&&effective)certExpiries.push(effective);
    });
    certExpiries.sort();scopeExpiries.sort(function(a,b){return String(a.scopeCode).localeCompare(String(b.scopeCode));});
    out[auditId]={auditId:auditId,expirationDate:certExpiries.length?certExpiries[0]:'',scopeExpiries:scopeExpiries,source:'MODEL_C_CONFIG_RECURRING'};
  });
  return out;
}
