// BUILD: AuditManagerToolsScopes_20260426_ACTIVE_AUDITS_YES
// Scope Manager public endpoints. Active final definitions only.

function m5t_listScopeCatalog_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var defs = m5t_scopeSlotDefs_(ss) || [];
  return defs.map(function(d){
    return {
      scope: String(d.scope || '').trim(),
      scopeCode: String(d.scopeCode || '').trim(),
      slotKey: String(d.slotKey || '').trim(),
      active: d.active,
      archived: d.archived,
      defaultHours: m5t_toNumberOrZero_(d.defaultHours),
      maxConsecutive: m5t_toIntOrNull_(d.maxConsecutive),
      flagCol0: d.flagCol0,
      hourCol0: d.hourCol0
    };
  });
}


// BUILD PATCH: 2026-04-14-R3
// Fixes:
// - Birthdate prefill/write uses 'Birthdate certificate' alias
// - Auditor qualification checks only real Auditors scope columns
// - Soft block auditors remain selectable and include visible warning detail

function m5t_getAuditPlanningConfig(companyUid) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!companyUid) return { success: false, error: 'MISSING_COMPANY_UID' };

  var ap = m5t_getSheet_(ss, m5t_const_().SHEETS.AUDIT_PLANNING);
  var apData = m5t_readSheet_(ap);
  var hdr = apData.headerMap;
  var uidCol = m5t_pickHeader_(hdr, ['Company_UID','Company UID','CompanyUID','COMPANY_UID','UID']);
  var companyCol = m5t_pickHeader_(hdr, ['Company','Customer','Bedrijf','COMPANY']);
  var statusCol = m5t_pickHeader_(hdr, ['Status','STATUS']);
  var auditIdCol = m5t_pickHeader_(hdr, ['Audit ID','Audit_ID','AuditId']);
  var preCol = m5t_pickHeader_(hdr, ['Preassigned Auditor','PreAssigned Auditor','Preassigned','Pre-assigned auditor','Pre assigned auditor']);
  var allowCol = m5t_pickHeader_(hdr, ['Allow self planning','Allow Self Planning','Self planning','AllowSelfPlanning','AC']);
  var birthCol = m5t_pickHeader_(hdr, ['Birthdate certificate','Birthdate','Birth date','Birth Date']);
  var expCol = m5t_pickHeader_(hdr, ['Date - Will Expire','Date Will Expire','Will Expire']);
  if (uidCol < 0 || companyCol < 0) return { success: false, error: 'AUDIT_PLANNING_MISSING_REQUIRED_HEADERS' };

  var matches = [];
  for (var i = 0; i < apData.rows.length; i++) {
    var row = apData.rows[i];
    var uid = String(row[uidCol] || '').trim();
    if (uid && uid === String(companyUid).trim()) matches.push({ rowIndex1: i + 2, row: row });
  }

  var scopesCatalog = m5t_scopeSlotDefs_(ss);
  if (!matches.length) {
    return {
      success: true,
      exists: false,
      companyUid: companyUid,
      companyName: m5t_companyNameByUid_(ss, companyUid),
      preassignedAuditorEmail: '',
      preassignedAuditorDisplay: '',
      allowSelfPlanning: '',
      birthdate: '',
      dateWillExpire: m5t_yearEndText_(),
      scopes: scopesCatalog.map(function(s){
        return {
          scope: s.scope,
          scopeCode: s.scopeCode,
          slotKey: s.slotKey,
          active: s.active,
          archived: s.archived,
          enabled: false,
          defaultHours: s.defaultHours,
          customHours: '',
          usedHours: s.defaultHours,
          maxConsecutive: s.maxConsecutive
        };
      })
    };
  }

  var active = m5t_selectActiveAuditRow_(matches, hdr);
  var arow = active.row || [];
  var preRaw = preCol >= 0 ? String(arow[preCol] || '').trim() : '';
  var preEmail = m5t_resolveAuditorEmail_(ss, preRaw) || String(preRaw || '').trim().toLowerCase();
  var dir = m5t_getAuditorDirectory_(ss);
  var preDisplay = preEmail && dir.byEmail[preEmail] ? (dir.byEmail[preEmail].name + ' <' + preEmail + '>') : preRaw;

  var scopes = scopesCatalog.map(function(s){
    var enabled = !!(s.flagCol0 != null && String(arow[s.flagCol0] || '').trim().toLowerCase() === 'x');
    var custom = (s.hourCol0 != null) ? arow[s.hourCol0] : '';
    var customNum = m5t_toNumberOrNull_(custom);
    var used = enabled ? ((customNum != null) ? customNum : s.defaultHours) : s.defaultHours;
    return {
      scope: s.scope,
      scopeCode: s.scopeCode,
      slotKey: s.slotKey,
      active: s.active,
      archived: s.archived,
      enabled: enabled,
      defaultHours: s.defaultHours,
      customHours: (customNum != null ? customNum : ''),
      usedHours: used,
      maxConsecutive: s.maxConsecutive
    };
  });
  if (typeof ModelCScopeOwner_enrichUiScopes_ === 'function') {
    scopes = ModelCScopeOwner_enrichUiScopes_(ss, companyUid, auditIdCol >= 0 ? String(arow[auditIdCol] || '').trim() : '', scopes);
  }

  return {
    success: true,
    exists: true,
    activeRowIndex1: active.rowIndex1,
    companyUid: companyUid,
    companyName: companyCol >= 0 ? String(arow[companyCol] || '').trim() : companyUid,
    status: statusCol >= 0 ? String(arow[statusCol] || '').trim() : '',
    preassignedAuditorEmail: preEmail || '',
    preassignedAuditorDisplay: preDisplay || '',
    allowSelfPlanning: allowCol >= 0 ? String(arow[allowCol] || '').trim() : '',
    birthdate: birthCol >= 0 ? m5t_normDateText_(arow[birthCol]) : '',
    dateWillExpire: expCol >= 0 ? m5t_normDateText_(arow[expCol]) : '',
    scopes: scopes
  };
}


// Canonical Scope09-20 preassignment path. No mutation: all identity and relation
// checks complete before creating the audit row or calling ModelC scope owner.
function m5t_scope20CanonicalPreassignmentCheck_(ss, email, selectedScopes, defs) {
  function norm(v) { return String(v == null ? '' : v).trim(); }
  function key(v) { return norm(v).toLowerCase(); }
  function yes20(v) { return /^(x|yes|true|1)$/i.test(norm(v)); }
  function index(headers,name) { for(var i=0;i<headers.length;i++)if(key(headers[i])===key(name))return i;return -1; }
  var auditorSheet=ss.getSheetByName('Auditors');
  var relationSheet=ss.getSheetByName('Auditor_Scope_Qualifications');
  if(!auditorSheet||!relationSheet)return {success:false,error:'CANONICAL_QUALIFICATION_SOURCE_UNAVAILABLE'};
  var auditors=auditorSheet.getDataRange().getValues();
  var relations=relationSheet.getDataRange().getValues();
  if(!auditors.length||!relations.length)return {success:false,error:'CANONICAL_QUALIFICATION_SCHEMA_UNAVAILABLE'};
  var ah=auditors[0],rh=relations[0],ae=index(ah,'E-mail'),au=index(ah,'Auditor_UID'),active=index(ah,'Active'),role=index(ah,'Role');
  var ru=index(rh,'Auditor_UID'),rs=index(rh,'ScopeCode'),rq=index(rh,'Qualified');
  if([ae,au,active,role,ru,rs,rq].some(function(x){return x<0;}))return {success:false,error:'CANONICAL_QUALIFICATION_SCHEMA_INCOMPLETE'};
  var matches=auditors.slice(1).filter(function(row){return key(row[ae])===key(email);});
  if(matches.length!==1||!norm(matches[0][au]))return {success:false,error:'CANONICAL_AUDITOR_UID_AMBIGUOUS'};
  var target=matches[0],uid=norm(target[au]);
  if(active>=0&&!yes20(target[active]))return {success:false,error:'CANONICAL_AUDITOR_INACTIVE'};
  if(role>=0&&key(target[role])!=='auditor')return {success:false,error:'CANONICAL_AUDITOR_ROLE_INVALID'};
  var knownUid={},knownEmail={};
  for(var a=1;a<auditors.length;a++) {
    var ar=auditors[a],id=norm(ar[au]),mail=key(ar[ae]);
    if(!id&&!mail)continue;
    if(!id||!mail||knownUid[id]||knownEmail[mail])return {success:false,error:'CANONICAL_AUDITOR_IDENTITY_DUPLICATE'};
    knownUid[id]=true;knownEmail[mail]=true;
  }
  var aliases={},validCodes={},aliasConflict=false;
  (defs||[]).forEach(function(def){
    var code=key(def.scopeCode);
    if(!code)return;
    validCodes[code]=true;
    [def.scopeCode,def.scope,def.slotKey].forEach(function(alias){var k=key(alias);if(!k)return;if(aliases[k]&&aliases[k]!==code)aliasConflict=true;else aliases[k]=code;});
  });
  if(aliasConflict)return {success:false,error:'CANONICAL_SCOPE_ALIAS_AMBIGUOUS'};
  var selected={};
  (selectedScopes||[]).forEach(function(item){
    if(!item||!(item.enabled===true||key(item.enabled)==='true'))return;
    var code=aliases[key(item.scope||item.scopeCode||item.code)];
    if(!code)selected.__unknown=true;
    else selected[code]=true;
  });
  if(selected.__unknown)return {success:false,error:'CANONICAL_SCOPE_IDENTITY_UNRESOLVED'};
  var relationByKey={};
  for(var r=1;r<relations.length;r++) {
    var rec=relations[r],id=norm(rec[ru]),code=key(rec[rs]),value=key(rec[rq]);
    if(!id&&!code&&!value)continue;
    if(!id||!knownUid[id]||!validCodes[code])return {success:false,error:'CANONICAL_QUALIFICATION_ORPHAN'};
    if(!/^(yes|no|true|false|1|0|x)?$/.test(value))return {success:false,error:'CANONICAL_QUALIFICATION_STATE_INVALID'};
    var pair=id+'|'+code;
    if(Object.prototype.hasOwnProperty.call(relationByKey,pair))return {success:false,error:'CANONICAL_QUALIFICATION_DUPLICATE'};
    relationByKey[pair]=yes20(value);
  }
  var codes=Object.keys(selected);
  if(!codes.length)return {success:false,error:'CANONICAL_SCOPE_SELECTION_EMPTY'};
  var withdrawalIndex=index(ah,'Qualification_Withdrawals_JSON');
  if(withdrawalIndex>=0&&norm(target[withdrawalIndex])){
    var withdrawals;
    try{withdrawals=JSON.parse(norm(target[withdrawalIndex]));}
    catch(e){return {success:false,error:'CANONICAL_QUALIFICATION_WITHDRAWAL_SCHEMA_INVALID'};}
    if(!Array.isArray(withdrawals))return {success:false,error:'CANONICAL_QUALIFICATION_WITHDRAWAL_SCHEMA_INVALID'};
    for(var wi=0;wi<withdrawals.length;wi++){
      var item=withdrawals[wi];
      if(!item||typeof item!=='object'||!norm(item.scopeCode)||!norm(item.effectiveDate))
        return {success:false,error:'CANONICAL_QUALIFICATION_WITHDRAWAL_SCHEMA_INVALID'};
      // New preassignment has no grandfathering: treat any recorded withdrawal
      // for a selected scope as a hard gate until an explicit policy cutover.
      if(codes.indexOf(key(item.scopeCode))>=0)return {success:false,error:'CANONICAL_QUALIFICATION_WITHDRAWN',scopeCode:key(item.scopeCode)};
    }
  }
  for(var c=0;c<codes.length;c++)if(relationByKey[uid+'|'+codes[c]]!==true)return {success:false,error:'AUDITOR_NOT_HARD_QUALIFIED',scopeCode:codes[c]};
  return {success:true,auditorUid:uid,qualificationSource:'Auditor_Scope_Qualifications'};
}

function m5t_upsertScopes(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  payload = payload || {};

  var companyUid = String(payload.companyUid || '').trim();
  if (!companyUid) return { success: false, error: 'MISSING_COMPANY_UID' };

  var companyName = String(payload.companyName || '').trim() || m5t_companyNameByUid_(ss, companyUid);
  var selectedScopes = Array.isArray(payload.selectedScopes) ? payload.selectedScopes : [];
  var preassignedAuditor = String(payload.preassignedAuditorEmail || payload.preassignedAuditor || '').trim().toLowerCase();
  var allowSelfPlanning = String(payload.allowSelfPlanning || '').trim();
  var allowSelfPlanningUpper = allowSelfPlanning.toUpperCase();

  if (allowSelfPlanningUpper === 'YES' && !preassignedAuditor) {
    return {
      success: false,
      error: 'PREASSIGNED_AUDITOR_REQUIRED',
      message: 'Preassigned auditor is required when Allow self planning = YES.'
    };
  }

  var ap = m5t_getSheet_(ss, m5t_const_().SHEETS.AUDIT_PLANNING);
  var apData = m5t_readSheet_(ap);
  var hdr = apData.headerMap;

  var uidCol = m5t_pickHeader_(hdr, ['Company_UID','Company UID','CompanyUID','COMPANY_UID','UID']);
  var companyCol = m5t_pickHeader_(hdr, ['Company','Customer','Bedrijf','COMPANY']);
  var statusCol = m5t_pickHeader_(hdr, ['Status','STATUS']);
  var preCol = m5t_pickHeader_(hdr, ['Preassigned Auditor','PreAssigned Auditor','Preassigned','Pre-assigned auditor','Pre assigned auditor']);
  var allowCol = m5t_pickHeader_(hdr, ['Allow self planning','Allow Self Planning','Self planning','AllowSelfPlanning','AC']);
  var birthCol = m5t_pickHeader_(hdr, ['Birthdate certificate','Birthdate','Birth date','Birth Date']);
  var expCol = m5t_pickHeader_(hdr, ['Date - Will Expire','Date Will Expire','Will Expire']);
  var hoursToPlanCol = m5t_pickHeader_(hdr, ['Hours to plan','Hours to plann','HoursToPlan','HOURS_TO_PLAN']);
  var totalCol = m5t_pickHeader_(hdr, ['Total audit time in hours','Total audit time (hours)','Total audit time','Total hours','TOTAL_AUDIT_TIME_HOURS']);
  var auditIdCol = m5t_pickHeader_(hdr, ['Audit ID','Audit_ID','AuditId']);

  if (uidCol < 0 || companyCol < 0) {
    return { success: false, error: 'AUDIT_PLANNING_MISSING_REQUIRED_HEADERS' };
  }

  var enabledCount = selectedScopes.filter(function(s) {
    return s && (s.enabled === true || String(s.enabled) === 'true');
  }).length;

  // Validate the full selection against the canonical catalog before any audit row is created.
  // Unknown, duplicate or ambiguously named scopes must never create orphan rows.
  var scopeDefsPreflight=m5t_scopeSlotDefs_(ss)||[];
  var selectedScopeKeys={},knownScopeAliases={},ambiguousAliases={};
  scopeDefsPreflight.forEach(function(def){
    var canonical=String(def.scopeCode||'').trim().toLowerCase();
    [def.scopeCode,def.scope,def.slotKey].forEach(function(alias){
      var k=String(alias||'').trim().toLowerCase();
      if(!k)return;
      if(knownScopeAliases[k]&&knownScopeAliases[k]!==canonical)ambiguousAliases[k]=true;
      else knownScopeAliases[k]=canonical;
    });
  });
  for(var checkedScope=0;checkedScope<selectedScopes.length;checkedScope++){
    var scopeItem=selectedScopes[checkedScope];
    if(!scopeItem||!(scopeItem.enabled===true||String(scopeItem.enabled).toLowerCase()==='true'))continue;
    var submittedScope=String(scopeItem.scope||scopeItem.scopeCode||scopeItem.code||scopeItem.slotKey||'').trim().toLowerCase();
    if(!submittedScope||!knownScopeAliases[submittedScope])return {success:false,error:'SCOPE_IDENTITY_UNRESOLVED',scope:submittedScope};
    if(ambiguousAliases[submittedScope])return {success:false,error:'SCOPE_IDENTITY_AMBIGUOUS',scope:submittedScope};
    var resolvedScopeCode=knownScopeAliases[submittedScope];
    var configuredScope=scopeDefsPreflight.filter(function(d){return String(d.scopeCode||'').trim().toLowerCase()===resolvedScopeCode;});
    if(configuredScope.length!==1)return {success:false,error:'SCOPE_CATALOG_AMBIGUOUS',scope:resolvedScopeCode};
    if(configuredScope[0].active===false||configuredScope[0].archived===true)return {success:false,error:'SCOPE_INACTIVE_OR_ARCHIVED',scope:resolvedScopeCode};
    var identityFields=[scopeItem.scope,scopeItem.scopeCode,scopeItem.code,scopeItem.slotKey];
    for(var fieldIndex=0;fieldIndex<identityFields.length;fieldIndex++){
      var fieldValue=String(identityFields[fieldIndex]||'').trim().toLowerCase();
      if(!fieldValue)continue;
      if(!knownScopeAliases[fieldValue]||ambiguousAliases[fieldValue]||knownScopeAliases[fieldValue]!==resolvedScopeCode)
        return {success:false,error:'SCOPE_IDENTITY_CONFLICT',scope:submittedScope};
    }
    if(selectedScopeKeys[resolvedScopeCode])return {success:false,error:'DUPLICATE_SELECTED_SCOPE',scope:resolvedScopeCode};
    selectedScopeKeys[resolvedScopeCode]=true;
  }

  // Fail before m5t_createAuditRowFromCompaniesPool_: unsupported physical
  // qualification checks must not leave a newly created audit row behind.
  var canonicalQualificationVerified = false;
  if (preassignedAuditor) {
    var selectedNames = {};
    selectedScopes.forEach(function(item) {
      if (!item || !(item.enabled === true || String(item.enabled).toLowerCase() === 'true')) return;
      var k = String(item.scope || item.scopeCode || item.code || '').trim().toLowerCase();
      if (k) selectedNames[k] = true;
    });
    var defsForPreflight = m5t_scopeSlotDefs_(ss) || [];
    var needsCanonical = defsForPreflight.some(function(d){
      return (d.flagCol0 == null || /^SCOPE_(?:0[9]|1[0-9]|20)$/.test(String(d.slotKey||'').toUpperCase())) && [d.scope,d.scopeCode,d.slotKey].some(function(x){return selectedNames[String(x||'').toLowerCase()];});
    });
    if(needsCanonical){
      var canonicalCheck;
      try{canonicalCheck=m5t_scope20CanonicalPreassignmentCheck_(ss,preassignedAuditor,selectedScopes,defsForPreflight);}
      catch(eCanonical){return {success:false,error:'CANONICAL_QUALIFICATION_READ_FAILED',detail:String(eCanonical&&eCanonical.message||eCanonical)};}
      if(!canonicalCheck||canonicalCheck.success!==true)return canonicalCheck||{success:false,error:'CANONICAL_QUALIFICATION_UNCONFIRMED'};
      canonicalQualificationVerified=true;
    }
  }

  var matches = [];
  for (var i = 0; i < apData.rows.length; i++) {
    var row = apData.rows[i];
    var uid = String(row[uidCol] || '').trim();
    if (uid && uid === companyUid) matches.push({ rowIndex1: i + 2, row: row });
  }

  var targetRowIndex1 = null;
  var status = '';
  var isNew = false;

  if (!matches.length) {
    if (enabledCount === 0) return { success: false, error: 'MIN_1_SCOPE_REQUIRED' };
    // Legacy 01-08 preassignment must be validated before creating the row.
    // A rejected candidate cannot leave an orphaned Audit planning record.
    if(preassignedAuditor&&!canonicalQualificationVerified){
      if(typeof _mp_assertAuditorQualifiedForPlanning_!=='function')
        return {success:false,error:'PREASSIGNMENT_QUALIFICATION_VALIDATOR_UNAVAILABLE'};
      var preflightHeader=ap.getRange(1,1,1,ap.getLastColumn()).getValues()[0];
      var preflightRow=new Array(preflightHeader.length).fill('');
      var preflightMissing='';
      scopeDefsPreflight.forEach(function(def){
        if(!selectedScopeKeys[String(def.scopeCode||'').trim().toLowerCase()])return;
        if(def.flagCol0==null)preflightMissing=String(def.slotKey||'');
        else preflightRow[def.flagCol0]='x';
      });
      if(preflightMissing)return {success:false,error:'SCOPE_QUALIFICATION_COLUMN_UNAVAILABLE',scope:preflightMissing};
      var preflightResult;
      try{preflightResult=_mp_assertAuditorQualifiedForPlanning_(ss,preflightHeader,preflightRow,preassignedAuditor,'');}
      catch(ePreflight){return {success:false,error:'PREASSIGNMENT_QUALIFICATION_READ_FAILED',detail:String(ePreflight&&ePreflight.message||ePreflight)};}
      if(!preflightResult||preflightResult.success!==true)
        return {success:false,error:'AUDITOR_NOT_HARD_QUALIFIED',message:(preflightResult&&preflightResult.message)||'Preassigned auditor is not qualified for selected scopes.'};
    }

    var created = m5t_createAuditRowFromCompaniesPool_(companyUid, companyName);
    if (!created.success) return created;

    targetRowIndex1 = created.rowIndex;
    status = created.status || '';
    isNew = true;
  } else {
    var active = m5t_selectActiveAuditRow_(matches, hdr);
    targetRowIndex1 = active.rowIndex1;
    status = statusCol >= 0 ? String(active.row[statusCol] || '').trim() : '';
  }

  var header = ap.getRange(1, 1, 1, ap.getLastColumn()).getValues()[0];
  var rowRange = ap.getRange(targetRowIndex1, 1, 1, header.length);
  var rowValues = rowRange.getValues()[0];
  var auditId = auditIdCol >= 0 ? String(rowValues[auditIdCol] || '').trim() : '';
  if (!auditId) return { success:false, error:'AUDIT_ID_REQUIRED_FOR_SCOPE_OWNER' };

  if (preassignedAuditor && !canonicalQualificationVerified) {
    if (typeof _mp_assertAuditorQualifiedForPlanning_ !== 'function') {
      return { success:false, error:'PREASSIGNMENT_QUALIFICATION_VALIDATOR_UNAVAILABLE' };
    }
    var qualificationRow = rowValues.slice();
    var selectedByScope = {};
    selectedScopes.forEach(function(s){
      if (!s) return;
      var scopeKey = String(s.scope || s.scopeCode || s.code || '').trim().toLowerCase();
      if (scopeKey) selectedByScope[scopeKey] = (s.enabled === true || String(s.enabled).toLowerCase() === 'true');
    });
    var missingQualificationScope = '';
    (m5t_scopeSlotDefs_(ss) || []).forEach(function(d){
      var scopeKey = String(d.scope || '').trim().toLowerCase();
      var isSelected = selectedByScope[scopeKey] === true;
      if (isSelected && d.flagCol0 == null) missingQualificationScope = String(d.slotKey || '');
      if (d.flagCol0 != null) qualificationRow[d.flagCol0] = isSelected ? 'x' : '';
    });
    if (missingQualificationScope) return {success:false,error:'SCOPE_QUALIFICATION_COLUMN_UNAVAILABLE',scope:missingQualificationScope};
    var qualificationCheck = _mp_assertAuditorQualifiedForPlanning_(ss, header, qualificationRow, preassignedAuditor, '');
    if (!qualificationCheck || qualificationCheck.success !== true) {
      return {
        success:false,
        error:'AUDITOR_NOT_HARD_QUALIFIED',
        message:(qualificationCheck && qualificationCheck.message) || 'Preassigned auditor is not qualified for the selected scope(s).'
      };
    }
  }

  var ownerResult = ModelCScopeOwner_commit({
    companyUid: companyUid,
    auditId: auditId,
    selectedScopes: selectedScopes,
    preassignedAuditorEmail: preassignedAuditor,
    allowSelfPlanning: allowSelfPlanning
  });
  if (!ownerResult || ownerResult.success !== true) return ownerResult || { success:false, error:'SCOPE_OWNER_COMMIT_FAILED' };
  rowValues = rowRange.getValues()[0];
  var eligibilitySync = { success:true, skipped:true, reason:'ELIGIBILITY_SERVICE_UNAVAILABLE' };
  try {
    if (typeof eligService_cacheInvalidate_ === 'function') {
      var eligibilityInvalidation = eligService_cacheInvalidate_({ auditId:auditId });
      eligibilitySync = { success:true, invalidation:eligibilityInvalidation, refreshed:false };
      if (typeof EligibilityTargetedRefreshService_refresh === 'function') {
        var eligibilityRefresh = EligibilityTargetedRefreshService_refresh({ auditId:auditId, force:true, maxRefresh:1 });
        eligibilitySync.refresh = eligibilityRefresh;
        eligibilitySync.refreshed = !!(eligibilityRefresh && eligibilityRefresh.refreshed === 1);
        eligibilitySync.success = !!(eligibilityRefresh && eligibilityRefresh.success === true);
      }
    }
  } catch (eEligibilitySync) {
    eligibilitySync = { success:false, skipped:false, error:String(eEligibilitySync && eEligibilitySync.message ? eEligibilitySync.message : eEligibilitySync) };
  }
  var totalHours = ownerResult.projection ? Number(ownerResult.projection.totalHours || 0) : 0;

  var flagged = false;
  if (m5t_isLockedStatus_(status)) {
    flagged = true;
    var headerMap = m5t_makeHeaderMap_(header);
    m5t_setWarning_(headerMap, rowValues, true, 'Scopes/hours changed while audit is in a locked/planned state. Review planning; replanning may be required.');
    var warningFlagCol = m5t_pickHeader_(headerMap, m5t_const_().WARNING.FLAG_HEADERS);
    var warningReasonCol = m5t_pickHeader_(headerMap, m5t_const_().WARNING.REASON_HEADERS);
    if (warningFlagCol >= 0) ap.getRange(targetRowIndex1, warningFlagCol + 1).setValue(rowValues[warningFlagCol]);
    if (warningReasonCol >= 0) ap.getRange(targetRowIndex1, warningReasonCol + 1).setValue(rowValues[warningReasonCol]);
    m5t_enqueueScopeReplanNotification_(ss, {
      companyUid: companyUid,
      companyName: companyName,
      auditRowIndex1: targetRowIndex1,
      status: status,
      totalHours: totalHours
    });
  }

  var activeAuditsUpdate = { ok: true, skipped: true, reason: 'NO_HELPER' };
  try {
    if (typeof m5t_setCompanyActiveAudits_ === 'function') {
      activeAuditsUpdate = m5t_setCompanyActiveAudits_(ss, companyUid, 'Yes');
    }
  } catch (eActiveAudits) {
    activeAuditsUpdate = { ok: false, error: String(eActiveAudits && eActiveAudits.message ? eActiveAudits.message : eActiveAudits) };
  }

  var availabilitySync = { ok: true, skipped: true, reason: 'NO_SYNC_HELPER' };
  try {
    if (typeof m5t_syncAvailabilityForUpsertSafe_ === 'function') {
      availabilitySync = m5t_syncAvailabilityForUpsertSafe_({
        ss: ss,
        apSheet: ap,
        rowIndex1: targetRowIndex1,
        header: header,
        rowValues: rowValues,
        status: status,
        totalHours: totalHours,
        enabledCount: enabledCount
      });
    }
  } catch (eSync) {
    availabilitySync = { ok: false, error: String(eSync && eSync.message ? eSync.message : eSync) };
  }

  return {
    success: true,
    rowIndex1: targetRowIndex1,
    status: status,
    totalHours: totalHours,
    flagged: flagged,
    companyUid: companyUid,
    isNew: isNew,
    activeAuditsUpdate: activeAuditsUpdate,
    availabilitySync: availabilitySync,
    eligibilitySync: eligibilitySync,
    ownerResult: ownerResult
  };
}



/***********************************************************************
 * FINAL HOTFIX — 2026-04-24 — COMPANY SCOPE MANAGER FRESH COMPANIES LIST
 *
 * PURPOSE
 * - New companies added via Companies UI must appear immediately in
 *   Company Scope Manager > New companies.
 *
 * CAUSE
 * - Company Scope Manager can reuse stale client/bootstrap state.
 * - Central CompaniesIndex cache may also still contain the previous list.
 *
 * SCOPE
 * - Final override of m5t_bootstrap only.
 * - Forces CompaniesIndex cache clear when available.
 * - Reads fresh lists for existing/new companies.
 * - No scope/save/status/planning/availability logic changes.
 ***********************************************************************/
