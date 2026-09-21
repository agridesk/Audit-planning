/** AMS-01.6 Model C Toolkit cycle-year acceptance. READ-ONLY. */
var MODEL_C_TOOLKIT_CYCLE_TEST_BUILD = '2026-09-21_AMS_01_6_MODEL_C_TOOLKIT_CYCLE_TEST_R3_NON_RECURRING_CYCLE_KEY';

function RUN_MODEL_C_TOOLKIT_CYCLE_YEAR_ACCEPTANCE() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING);
  var obSheet = ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
  var linkSheet = ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS);
  var out = {
    success:false,
    build:MODEL_C_TOOLKIT_CYCLE_TEST_BUILD,
    ownerBuild:(typeof MODEL_C_TOOLKIT_CYCLE_OWNER_BUILD !== 'undefined' ? MODEL_C_TOOLKIT_CYCLE_OWNER_BUILD : ''),
    owner:'Config_Scopes.Recurring + Audit_Obligations.Cycle_Key',
    readOnly:true,
    writesPerformed:false,
    counts:{auditRows:0,recurringAudits:0,nonRecurringOnlyAudits:0,modelCycleResolved:0,nonRecurringCycleResolved:0,unresolvedNonRecurringCycle:0,legacyExpiryFallbacks:0,mismatches:0},
    errors:[],
    samples:[]
  };
  if (!sh || !obSheet || !linkSheet) {
    if (!sh) out.errors.push('Missing Audit planning');
    if (!obSheet) out.errors.push('Missing Audit_Obligations');
    if (!linkSheet) out.errors.push('Missing Audit_Visit_Obligations');
    Logger.log(JSON.stringify(out,null,2));
    return out;
  }

  var values = sh.getDataRange().getValues();
  var hdr = values[0] || [];
  var ai = _mp_findHeaderIdxCI_(hdr,['Audit ID','Audit_ID','AuditId','Audit Id']);
  if (ai < 0) {
    out.errors.push('Missing Audit ID header');
    Logger.log(JSON.stringify(out,null,2));
    return out;
  }

  var obligations = ModelCMigration_rowsToObjects_(obSheet.getDataRange().getValues());
  var links = ModelCMigration_rowsToObjects_(linkSheet.getDataRange().getValues());
  var cfgByCode = ModelCRecurringConfig_byCode_(ss);
  var obById = {}, linksByAudit = {};
  obligations.forEach(function(ob){obById[String(ob.Obligation_ID||'')] = ob;});
  links.forEach(function(link){
    if (String(link.Link_State||'').toUpperCase() !== 'ACTIVE') return;
    var auditId = String(link.Audit_ID||'').trim();
    if (!auditId) return;
    (linksByAudit[auditId] || (linksByAudit[auditId]=[])).push(link);
  });

  for (var r=1; r<values.length; r++) {
    var row = values[r] || [];
    var auditId = String(row[ai] || '').trim();
    if (!auditId) continue;
    out.counts.auditRows++;

    var profile = ModelCToolkitCycleAcceptance_profile_(auditId,linksByAudit,obById,cfgByCode);
    var modelYear = ModelCToolkitCycle_yearForAudit_(ss,auditId);
    var resolved = _mp_getCurrentCycleYearFromAuditRow_(hdr,row);

    if (profile.hasRecurring) out.counts.recurringAudits++;
    else if (profile.nonRecurringYears.length) out.counts.nonRecurringOnlyAudits++;

    if (modelYear) out.counts.modelCycleResolved++;

    var expected = profile.recurringYears.length ? profile.recurringYears[0] : (profile.nonRecurringYears.length ? profile.nonRecurringYears[0] : null);
    if (!profile.hasRecurring && profile.nonRecurringYears.length) {
      if (modelYear) out.counts.nonRecurringCycleResolved++;
      else out.counts.unresolvedNonRecurringCycle++;
    }

    if (expected && Number(modelYear) !== Number(expected)) {
      out.counts.mismatches++;
      if (out.errors.length < 20) out.errors.push('Toolkit cycle year mismatch: '+auditId+' expected='+expected+' model='+modelYear);
    }
    if (expected && Number(resolved) !== Number(expected)) {
      out.counts.mismatches++;
      if (out.errors.length < 20) out.errors.push('Toolkit resolved year mismatch: '+auditId+' expected='+expected+' actual='+resolved);
    }

    if (!profile.hasRecurring && profile.nonRecurringYears.length) {
      var ixExp = _mp_findHeaderIdxCI_(hdr,['Date - Will Expire','Will expire date','Expiry date']);
      var legacy = ixExp >= 0 ? String(row[ixExp] || '').trim() : '';
      if (legacy) out.counts.legacyExpiryFallbacks++;
    }

    if (expected && out.samples.length < 12) out.samples.push({auditId:auditId,expectedYear:expected,modelYear:modelYear,resolvedYear:resolved,recurring:profile.hasRecurring});
  }

  out.gates = {
    ownerLoaded: typeof MODEL_C_TOOLKIT_CYCLE_OWNER_BUILD !== 'undefined',
    zeroMismatches: out.counts.mismatches === 0,
    allNonRecurringCycleKeysResolved: out.counts.unresolvedNonRecurringCycle === 0,
    nonRecurringOnlyAuditsDoNotUseLegacyExpiry: out.counts.legacyExpiryFallbacks === 0,
    readOnly:true
  };
  out.success = Object.keys(out.gates).every(function(k){ return out.gates[k] === true; }) && out.errors.length === 0;
  Logger.log(JSON.stringify(out,null,2));
  if (!out.success) throw new Error('Model C Toolkit cycle-year acceptance failed: '+out.errors.join('; '));
  return out;
}

function ModelCToolkitCycleAcceptance_profile_(auditId,linksByAudit,obById,cfgByCode){
  var recurringYears=[],nonRecurringYears=[],hasRecurring=false;
  (linksByAudit[String(auditId)]||[]).forEach(function(link){
    var ob=obById[String(link.Obligation_ID||'')];
    if(!ob)return;
    var state=String(ob.Obligation_State||'').toUpperCase();
    if(state==='CANCELLED'||state==='REJECTED'||state==='COMPLETED')return;
    var code=String(ob.ScopeCode||'').trim(),cfg=cfgByCode[code],recurring=!!(cfg&&cfg.recurring===true);
    if(recurring)hasRecurring=true;
    var raw=recurring?String(ob.Cycle_Key||ob.Base_Expiry_Date||'').trim():String(ob.Cycle_Key||'').trim();
    var m=raw.match(/^(20\d{2})(?:-|$)/);
    if(!m)return;
    var year=Number(m[1]);
    (recurring?recurringYears:nonRecurringYears).push(year);
  });
  recurringYears.sort(function(a,b){return a-b;});
  nonRecurringYears.sort(function(a,b){return a-b;});
  return{hasRecurring:hasRecurring,recurringYears:recurringYears,nonRecurringYears:nonRecurringYears};
}
