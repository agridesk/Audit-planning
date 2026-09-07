// BUILD: AuditManagerToolsScopes_20260426_ACTIVE_AUDITS_YES
// Scope Manager public endpoints. Active final definitions only.

function m5t_listScopeCatalog_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var defs = m5t_scopeSlotDefs_(ss) || [];
  return defs.map(function(d){
    return {
      scope: String(d.scope || '').trim(),
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
      enabled: enabled,
      defaultHours: s.defaultHours,
      customHours: (customNum != null ? customNum : ''),
      usedHours: used,
      maxConsecutive: s.maxConsecutive
    };
  });

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

  var birthdate = m5t_normDateText_(payload.birthdate);
  var dateWillExpire = m5t_normDateText_(payload.dateWillExpire);

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

  if (uidCol < 0 || companyCol < 0) {
    return { success: false, error: 'AUDIT_PLANNING_MISSING_REQUIRED_HEADERS' };
  }

  var enabledCount = selectedScopes.filter(function(s) {
    return s && (s.enabled === true || String(s.enabled) === 'true');
  }).length;

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
  var slotDefs = m5t_scopeSlotDefs_(ss);

  var selectedMap = {};
  selectedScopes.forEach(function(s) {
    if (!s) return;
    var sc = String(s.scope || '').trim();
    if (!sc) return;
    selectedMap[sc] = {
      enabled: (s.enabled === true || String(s.enabled) === 'true'),
      customHours: m5t_toNumberOrNull_(s.customHours)
    };
  });

  var totalHours = 0;
  for (var k = 0; k < slotDefs.length; k++) {
    var def = slotDefs[k];
    var sel = selectedMap[def.scope] || { enabled: false, customHours: null };

    if (def.flagCol0 != null && def.flagCol0 < rowValues.length) {
      rowValues[def.flagCol0] = sel.enabled ? 'x' : '';
    }

    if (def.hourCol0 != null && def.hourCol0 < rowValues.length) {
      if (sel.enabled) {
        var used = (sel.customHours != null) ? sel.customHours : def.defaultHours;
        rowValues[def.hourCol0] = used;
        totalHours += m5t_toNumberOrZero_(used);
      } else {
        rowValues[def.hourCol0] = '';
      }
    }
  }

  if (hoursToPlanCol >= 0) rowValues[hoursToPlanCol] = totalHours;
  if (totalCol >= 0) rowValues[totalCol] = totalHours;
  if (preCol >= 0) rowValues[preCol] = preassignedAuditor;
  if (allowCol >= 0) rowValues[allowCol] = allowSelfPlanning;
  if (birthCol >= 0) rowValues[birthCol] = birthdate;

  if (expCol >= 0) {
    if (dateWillExpire) rowValues[expCol] = dateWillExpire;
    else if (isNew && !String(rowValues[expCol] || '').trim()) rowValues[expCol] = m5t_yearEndText_();
  }

  var flagged = false;
  if (m5t_isLockedStatus_(status)) {
    flagged = true;
    var headerMap = m5t_makeHeaderMap_(header);
    m5t_setWarning_(headerMap, rowValues, true, 'Scopes/hours changed while audit is in a locked/planned state. Review planning; replanning may be required.');
    m5t_enqueueScopeReplanNotification_(ss, {
      companyUid: companyUid,
      companyName: companyName,
      auditRowIndex1: targetRowIndex1,
      status: status,
      totalHours: totalHours
    });
  }

  rowRange.setValues([rowValues]);

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
    availabilitySync: availabilitySync
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

