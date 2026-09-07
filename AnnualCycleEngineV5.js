
/***********************************************************************
 * ANNUALCYCLEENGINEV5.GS — RECURRING / CENTRAL-WINDOW-AS-AT / DUPLICATE-SAFE
 *
 * Scope:
 * - Called after a completion has been committed to "Log realized audits"
 * - Decides whether a next cycle must be created
 * - NEVER uses completion date as cycle anchor
 * - Uses:
 *     annual anchor = Date - Will Expire (X / annual line)
 *     NEVER uses Extended Expiration Date (Z) as next-cycle anchor
 *     because Z is only a temporary current-cycle extension
 * - Spawns next cycle only if ANY active scope is recurring = YES in Config_Scopes
 *
 * Hard rules:
 * - No new sheets / columns / statuses
 * - No dependence on completion date
 * - Duplicate-safe for same next cycle
 ***********************************************************************/

var AC_SHEET_AUDIT_PLANNING = "Audit planning";
var AC_SHEET_CONFIG_SCOPES = "Config_Scopes";
var AC_SHEET_STANDARDS = "Standards"; // Deprecated fallback name only; Config_Scopes is canonical.

function AnnualCycleEngineV5_OnCompleted(auditId) {
  try {
    auditId = String(auditId || '').trim();
    if (!auditId) return { success:false, message:'Missing auditId' };

    var ss = SpreadsheetApp.getActive();
    var shPlan = ss.getSheetByName(AC_SHEET_AUDIT_PLANNING);
    if (!shPlan) return { success:false, message:'Missing sheet: ' + AC_SHEET_AUDIT_PLANNING };

    var data = shPlan.getDataRange().getValues();
    if (!data || data.length < 2) return { success:false, message:'Audit planning empty' };

    var headers = data[0].map(function(h){ return String(h || '').trim(); });
    var colAuditId = headers.indexOf('Audit ID');
    if (colAuditId < 0) return { success:false, message:'Missing header: Audit ID' };

    for (var r = 1; r < data.length; r++) {
      if (String(data[r][colAuditId] || '').trim() !== auditId) continue;
      var rowObj = AC_buildRowObject_(headers, data[r], r + 1);
      return AnnualCycleEngineV5_HandleCompletionRow_(rowObj);
    }
    return { success:false, message:'Audit not found: ' + auditId };
  } catch (e) {
    return { success:false, message:String(e && e.message ? e.message : e) };
  }
}

/**
 * Preferred internal API.
 * Input = Audit planning row object of the just-completed cycle.
 */
function AnnualCycleEngineV5_HandleCompletionRow_(planningRowObj) {
  try {
    if (!planningRowObj || typeof planningRowObj !== 'object') {
      return { success:false, message:'Invalid planning row' };
    }

    var ss = SpreadsheetApp.getActive();
    var shPlan = ss.getSheetByName(AC_SHEET_AUDIT_PLANNING);
    if (!shPlan) return { success:false, message:'Missing sheet: ' + AC_SHEET_AUDIT_PLANNING };

    var headers = shPlan.getRange(1, 1, 1, shPlan.getLastColumn()).getValues()[0]
      .map(function(h){ return String(h || '').trim(); });

    var recurringScopeSlots = AC_getRecurringScopeSlotsForPlanningRow_(headers, planningRowObj);
    var recurringScopes = recurringScopeSlots.map(function(it){ return it.name; });
    if (!recurringScopes.length) {
      return {
        success:true,
        recurring:false,
        spawned:false,
        nextCycleEligible:false,
        anchorUsed: AC_getAnchorDateString_(planningRowObj) || '',
        recurringScopes:[]
      };
    }

    var anchor = AC_getAnchorDate_(planningRowObj);
    if (!anchor) {
      return {
        success:false,
        recurring:true,
        spawned:false,
        nextCycleEligible:false,
        message:'Missing annual anchor (Date - Will Expire)'
      };
    }

    var nextExpiry = AC_addYearsPreserveDay_(anchor, 1);
    var nextExpiryStr = AC_formatDate_(nextExpiry);

    var duplicate = AC_findExistingNextCycleRow_(shPlan, headers, planningRowObj, nextExpiryStr);
    if (duplicate) {
      return {
        success:true,
        recurring:true,
        spawned:false,
        nextCycleEligible:true,
        duplicatePrevented:true,
        nextAuditId:String(duplicate.auditId || ''),
        nextExpiry:nextExpiryStr,
        recurringScopes:recurringScopes
      };
    }

    var sourceRow = AC_rowObjectToArray_(headers, planningRowObj);
    var newRow = sourceRow.slice();

    AC_keepRecurringScopesOnly_(headers, newRow, recurringScopeSlots);

    AC_setHeaderValue_(headers, newRow, 'Status', 'Pending Planning');
    AC_setHeaderValue_(headers, newRow, 'Date - Will Expire', nextExpiryStr);
    AC_setHeaderValue_(headers, newRow, 'Extended Expiration Date', nextExpiryStr);
    AC_setHeaderValue_(headers, newRow, 'Date – Planned', '');
    AC_setHeaderValue_(headers, newRow, 'Date - Planned', '');
    AC_setHeaderValue_(headers, newRow, 'Date – Approved', '');
    AC_setHeaderValue_(headers, newRow, 'Date - Approved', '');
    AC_setHeaderValue_(headers, newRow, 'Planning JSON', '');
    AC_setHeaderValue_(headers, newRow, 'Audit days textual', '');
    AC_setHeaderValue_(headers, newRow, 'Extension applied', '');
    AC_setHeaderValue_(headers, newRow, 'Last manager decision', '');
    AC_setHeaderValue_(headers, newRow, 'Last decision timestamp', '');
    AC_setHeaderValue_(headers, newRow, 'Status since', '');
    AC_setHeaderValue_(headers, newRow, 'Manager comment (last)', '');
    AC_setHeaderValue_(headers, newRow, 'Last auditor decision', '');
    AC_setHeaderValue_(headers, newRow, 'Last auditor decision timestamp', '');
    AC_setHeaderValue_(headers, newRow, 'Auditor comment (last)', '');
    AC_setHeaderValue_(headers, newRow, 'Assigned to', '');
    AC_setHeaderValue_(headers, newRow, 'Assigned To', '');
    AC_setHeaderValue_(headers, newRow, 'Assigned', '');
    AC_setHeaderValue_(headers, newRow, 'Assigned Auditor', '');
    AC_setHeaderValue_(headers, newRow, 'Assigned auditor', '');

    var carryPreassigned = AC_trim_(planningRowObj['Preassigned Auditor'] || planningRowObj['Preassigned auditor'] || planningRowObj['Preassigned'] || planningRowObj['Assigned to'] || planningRowObj['Assigned Auditor'] || planningRowObj['Assigned auditor'] || '');
    AC_setHeaderValue_(headers, newRow, 'Preassigned Auditor', carryPreassigned);
    AC_setHeaderValue_(headers, newRow, 'Preassigned auditor', carryPreassigned);
    AC_setHeaderValue_(headers, newRow, 'Preassigned', carryPreassigned);

    AC_recalculateHoursForRecurringScopes_(headers, newRow, recurringScopeSlots);
    AC_applyCentralPlanningWindow_(headers, newRow);

    var newAuditId = AC_buildNewAuditId_(planningRowObj, shPlan.getLastRow() + 1);
    AC_setHeaderValue_(headers, newRow, 'Audit ID', newAuditId);

    shPlan.appendRow(newRow);

    try {
      var appendedRow = shPlan.getLastRow();
      AC_forceTextDateByHeader_(shPlan, headers, appendedRow, 'Date - Will Expire', nextExpiryStr);
      AC_forceTextDateByHeader_(shPlan, headers, appendedRow, 'Extended Expiration Date', nextExpiryStr);
      AC_forceTextDateByHeaderCandidates_(shPlan, headers, appendedRow, ['Planning window from','AS'], AC_getHeaderValueByCandidates_(headers, newRow, ['Planning window from','AS']));
      AC_forceTextDateByHeaderCandidates_(shPlan, headers, appendedRow, ['Planning window to','AT'], AC_getHeaderValueByCandidates_(headers, newRow, ['Planning window to','AT']));
    } catch (e_forceText) {
    }

    return {
      success:true,
      recurring:true,
      spawned:true,
      nextCycleEligible:true,
      nextAuditId:newAuditId,
      nextExpiry:nextExpiryStr,
      recurringScopes:recurringScopes,
      anchorUsed:AC_formatDate_(anchor),
      planningWindowFrom: AC_getHeaderValueByCandidates_(headers, newRow, ['Planning window from','AS']) || '',
      planningWindowTo: AC_getHeaderValueByCandidates_(headers, newRow, ['Planning window to','AT']) || ''
    };
  } catch (e) {
    return { success:false, message:String(e && e.message ? e.message : e) };
  }
}



/**
 * Public API: recalculate and persist central planning window (AS/AT) for one audit row.
 * Event-driven usage:
 * - after extension apply / undo
 * - after manual scope / expiry edits
 * - after repairs / migrations
 */
function AnnualCycleEngineV5_RecalculatePlanningWindowForAuditId(auditId) {
  try {
    auditId = String(auditId || '').trim();
    if (!auditId) return { success:false, message:'Missing auditId' };

    var ss = SpreadsheetApp.getActive();
    var shPlan = ss.getSheetByName(AC_SHEET_AUDIT_PLANNING);
    if (!shPlan) return { success:false, message:'Missing sheet: ' + AC_SHEET_AUDIT_PLANNING };

    var values = shPlan.getDataRange().getValues();
    if (!values || values.length < 2) return { success:false, message:'Audit planning empty' };

    var headers = values[0].map(function(h){ return String(h || '').trim(); });
    var idxAuditId = headers.indexOf('Audit ID');
    if (idxAuditId < 0) return { success:false, message:'Missing header: Audit ID' };

    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idxAuditId] || '').trim() !== auditId) continue;
      return AnnualCycleEngineV5_RecalculatePlanningWindowForRowIndex_(shPlan, headers, r + 1, values[r]);
    }

    return { success:false, message:'Audit not found: ' + auditId };
  } catch (e) {
    return { success:false, message:String(e && e.message ? e.message : e) };
  }
}

/**
 * Public API: rebuild AS/AT for all rows in Audit planning.
 * Intended for one-time repair and controlled manual use, not for daily scheduling.
 */
function AnnualCycleEngineV5_RecalculatePlanningWindowsAll() {
  try {
    var ss = SpreadsheetApp.getActive();
    var shPlan = ss.getSheetByName(AC_SHEET_AUDIT_PLANNING);
    if (!shPlan) return { success:false, message:'Missing sheet: ' + AC_SHEET_AUDIT_PLANNING };

    var values = shPlan.getDataRange().getValues();
    if (!values || values.length < 2) return { success:true, updated:0, scanned:0, message:'Audit planning empty' };

    var headers = values[0].map(function(h){ return String(h || '').trim(); });
    var scanned = 0;
    var updated = 0;

    for (var r = 1; r < values.length; r++) {
      scanned++;
      var res = AnnualCycleEngineV5_RecalculatePlanningWindowForRowIndex_(shPlan, headers, r + 1, values[r]);
      if (res && res.success && res.updated) updated++;
    }

    return { success:true, updated:updated, scanned:scanned, message:'Planning windows rebuilt' };
  } catch (e) {
    return { success:false, message:String(e && e.message ? e.message : e) };
  }
}

function AnnualCycleEngineV5_RecalculatePlanningWindowForRowIndex_(shPlan, headers, rowIndex, rowValuesOpt) {
  try {
    if (!shPlan) return { success:false, message:'Missing sheet' };
    headers = headers || shPlan.getRange(1, 1, 1, shPlan.getLastColumn()).getValues()[0]
      .map(function(h){ return String(h || '').trim(); });

    var row = rowValuesOpt || shPlan.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
    if (!row || !row.length) return { success:false, message:'Missing row values' };

    var workingRow = row.slice();
    AC_applyCentralPlanningWindow_(headers, workingRow);

    var fromVal = AC_getHeaderValueByCandidates_(headers, workingRow, ['Planning window from','AS']) || '';
    var toVal = AC_getHeaderValueByCandidates_(headers, workingRow, ['Planning window to','AT']) || '';
    var oldFrom = AC_getHeaderValueByCandidates_(headers, row, ['Planning window from','AS']) || '';
    var oldTo = AC_getHeaderValueByCandidates_(headers, row, ['Planning window to','AT']) || '';

    AC_forceTextDateByHeaderCandidates_(shPlan, headers, rowIndex, ['Planning window from','AS'], fromVal);
    AC_forceTextDateByHeaderCandidates_(shPlan, headers, rowIndex, ['Planning window to','AT'], toVal);

    var rowObj = AC_buildRowObject_(headers, row, rowIndex);
    var expiryRaw = AC_getHeaderValueByCandidates_(headers, row, ['Extended Expiration Date','Extended Expiry Date','Date - Will Expire']) || '';
    var selectedScopes = AC_getAllSelectedScopeSlotsForPlanningRow_(headers, rowObj).map(function(it){ return String(it.name || ''); });
    var recurringScopes = AC_getRecurringScopeSlotsForPlanningRow_(headers, rowObj).map(function(it){ return String(it.name || ''); });

    return {
      success:true,
      updated:(String(fromVal || '') !== String(oldFrom || '') || String(toVal || '') !== String(oldTo || '')),
      planningWindowFrom:String(fromVal || ''),
      planningWindowTo:String(toVal || ''),
      debug:{
        expirySourceValue:String(expiryRaw || ''),
        selectedScopes:selectedScopes,
        recurringScopes:recurringScopes
      }
    };
  } catch (e) {
    return { success:false, message:String(e && e.message ? e.message : e) };
  }
}

/* ========================= helpers ========================= */

function AC_buildRowObject_(headers, row, rowIndex) {
  var obj = {};
  for (var i = 0; i < headers.length; i++) obj[String(headers[i] || '')] = row[i];
  obj._rowIndex = rowIndex || 0;
  return obj;
}

function AC_rowObjectToArray_(headers, rowObj) {
  var arr = new Array(headers.length);
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '');
    arr[i] = rowObj.hasOwnProperty(h) ? rowObj[h] : '';
  }
  return arr;
}

function AC_setHeaderValue_(headers, row, headerName, value) {
  var idx = headers.indexOf(headerName);
  if (idx >= 0) row[idx] = value;
}



function AC_colLetterToIndex0_(letter) {
  letter = String(letter || '').trim().toUpperCase();
  if (!letter || !/^[A-Z]{1,3}$/.test(letter)) return -1;
  var n = 0;
  for (var i = 0; i < letter.length; i++) n = n * 26 + (letter.charCodeAt(i) - 64);
  return n - 1;
}

function AC_findIndexByCandidate_(headers, candidate) {
  candidate = String(candidate || '').trim();
  if (!candidate) return -1;
  var idx = headers.indexOf(candidate);
  if (idx >= 0) return idx;

  // Fallback: allow physical column letters as candidates (e.g. AS / AT),
  // even when the actual header text is different or blank.
  if (/^[A-Z]{1,3}$/.test(candidate)) {
    var colIdx = AC_colLetterToIndex0_(candidate);
    if (colIdx >= 0 && colIdx < headers.length) return colIdx;
  }

  return -1;
}

function AC_getHeaderValue_(headers, row, headerName) {
  var idx = headers.indexOf(headerName);
  return idx >= 0 ? row[idx] : '';
}

function AC_getHeaderValueByCandidates_(headers, row, headerCandidates) {
  for (var i = 0; i < headerCandidates.length; i++) {
    var idx = AC_findIndexByCandidate_(headers, headerCandidates[i]);
    if (idx >= 0) return row[idx];
  }
  return '';
}

function AC_forceTextDateByHeaderCandidates_(sheet, headers, rowIndex, headerCandidates, value) {
  var wrote = false;
  for (var i = 0; i < headerCandidates.length; i++) {
    var idx = AC_findIndexByCandidate_(headers, headerCandidates[i]);
    if (idx >= 0) {
      sheet.getRange(rowIndex, idx + 1).setNumberFormat('@STRING@').setValue(String(value || ''));
      wrote = true;
    }
  }
  return wrote;
}

function AC_forceTextDateByHeader_(sheet, headers, rowIndex, headerName, value) {
  var idx = AC_findIndexByCandidate_(headers, headerName);
  if (idx < 0) return;
  sheet.getRange(rowIndex, idx + 1).setNumberFormat('@STRING@').setValue(String(value || ''));
}

function AC_trim_(v) { return String(v == null ? '' : v).trim(); }

function AC_getTz_() {
  try {
    var ss = SpreadsheetApp.getActive();
    if (ss && ss.getSpreadsheetTimeZone) return ss.getSpreadsheetTimeZone();
  } catch (e) {}
  return 'Europe/Paris';
}

function AC_cellToYmd_(v) {
  if (v === null || typeof v === 'undefined' || v === '') return '';

  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    try {
      return Utilities.formatDate(v, AC_getTz_(), 'yyyy-MM-dd');
    } catch (e) {
      return '';
    }
  }

  var s = AC_trim_(v);
  if (!s) return '';

  // DATE-SAFE FIX 2026-04-30:
  // Never use new Date('yyyy-mm-dd') for sheet/text dates.
  // In Apps Script / JS this may be parsed as UTC and formatted back in the
  // spreadsheet timezone as the previous day. Keep ISO text as text.
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];

  var euDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (euDash) {
    return euDash[3] + '-' + ('0' + euDash[2]).slice(-2) + '-' + ('0' + euDash[1]).slice(-2);
  }

  var euSlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (euSlash) {
    return euSlash[3] + '-' + ('0' + euSlash[2]).slice(-2) + '-' + ('0' + euSlash[1]).slice(-2);
  }

  var isoSlash = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (isoSlash) {
    return isoSlash[1] + '-' + ('0' + isoSlash[2]).slice(-2) + '-' + ('0' + isoSlash[3]).slice(-2);
  }

  // Last resort only for real spreadsheet date-like strings. Avoid this path for ISO text.
  var d = new Date(s);
  if (isNaN(d.getTime())) return '';

  try {
    return Utilities.formatDate(d, AC_getTz_(), 'yyyy-MM-dd');
  } catch (e2) {
    return '';
  }
}

function AC_parseDate_(v) {
  var ymd = AC_cellToYmd_(v);
  if (!ymd) return null;

  var m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function AC_formatDate_(d) {
  var ymd = AC_cellToYmd_(d);
  return ymd || '';
}

function AC_addYearsPreserveDay_(d, years) {
  var y = d.getFullYear();
  var m = d.getMonth();
  var day = d.getDate();
  var nd = new Date(y + Number(years || 0), m, 1);
  var last = new Date(nd.getFullYear(), nd.getMonth() + 1, 0).getDate();
  nd.setDate(Math.min(day, last));
  return nd;
}


function AC_addMonthsPreserveDay_(d, months) {
  if (!d) return null;
  var y = d.getFullYear();
  var m = d.getMonth();
  var day = d.getDate();
  var nd = new Date(y, m + Number(months || 0), 1);
  var last = new Date(nd.getFullYear(), nd.getMonth() + 1, 0).getDate();
  nd.setDate(Math.min(day, last));
  return nd;
}

function AC_buildNewAuditId_(planningRowObj, fallbackRowNumber) {
  var company = AC_trim_(planningRowObj['Company'] || '');
  var location = AC_trim_(planningRowObj['Location'] || '');
  var companyPart = company.replace(/\s+/g, '').substring(0, 20) || 'AUDIT';
  var locPart = location ? ('_' + location.replace(/\s+/g, '').substring(0, 12)) : '';
  return 'AUD_' + companyPart + locPart + '_' + new Date().getTime() + '_' + String(fallbackRowNumber || '');
}

function AC_getAnchorDate_(planningRowObj) {
  // Annual line is ALWAYS based on Date - Will Expire.
  // Extended Expiration Date is a temporary current-cycle override only
  // and must never become the anchor for next year.
  return AC_parseDate_(planningRowObj['Date - Will Expire']);
}

function AC_getAnchorDateString_(planningRowObj) {
  var d = AC_getAnchorDate_(planningRowObj);
  return d ? AC_formatDate_(d) : '';
}

function AC_getPlanningWindowExpiryInfo_(headers, row) {
  var direct = AC_parseDate_(AC_getHeaderValue_(headers, row, 'Extended Expiration Date') || AC_getHeaderValue_(headers, row, 'Date - Will Expire'));
  if (direct) {
    return { date: direct, source: 'EXISTING_EXPIRY', synthetic: false };
  }

  var scopeSlots = AC_getAllSelectedScopeSlotsForPlanningRow_(headers, AC_buildRowObject_(headers, row, 0));
  if (!scopeSlots.length) {
    return { date: null, source: 'NO_SELECTED_SCOPES', synthetic: false };
  }

  var standardsInfo = AC_loadStandardsInfoMap_();
  var matchedCount = 0;
  var hasRecurring = false;

  for (var i = 0; i < scopeSlots.length; i++) {
    var aliases = scopeSlots[i].normAliases || [];
    var info = null;
    for (var a = 0; a < aliases.length; a++) {
      var key = aliases[a];
      if (key && standardsInfo[key]) {
        info = standardsInfo[key];
        break;
      }
    }
    if (!info) continue;
    matchedCount++;
    if (info.recurring === true) {
      hasRecurring = true;
      break;
    }
  }

  if (matchedCount > 0 && !hasRecurring) {
    var now = new Date();
    var synthetic = new Date(now.getFullYear(), 11, 31);
    return { date: synthetic, source: 'NON_RECURRING_YEAR_END_FALLBACK', synthetic: true };
  }

  return { date: null, source: matchedCount ? 'RECURRING_SCOPES_NEED_EXPIRY' : 'NO_STANDARDS_MATCH', synthetic: false };
}


function AC_loadRecurringStandardsMap_() {
  // Deprecated compatibility wrapper. Config_Scopes is canonical.
  var info = AC_loadConfigScopesInfoMap_();
  var map = {};
  for (var key in info) {
    if (info.hasOwnProperty(key)) map[key] = !!(info[key] && info[key].recurring === true);
  }
  return map;
}

function AC_normKey_(v) {
  return String(v == null ? '' : v).trim().toLowerCase().replace(/[\s_\-\/]+/g, '');
}

function AC_loadConfigScopeMap_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(AC_SHEET_CONFIG_SCOPES);
  var bySlot = {};
  if (!sh) return bySlot;

  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return bySlot;

  var headers = values[0].map(function(h){ return String(h || '').trim(); });
  var idxSlot = headers.indexOf('SlotKey');
  var idxCode = headers.indexOf('ScopeCode');
  var idxDisplay = headers.indexOf('DisplayName');
  var idxActive = headers.indexOf('Active');

  if (idxSlot < 0) return bySlot;

  for (var r = 1; r < values.length; r++) {
    var slot = AC_trim_(values[r][idxSlot]);
    if (!slot) continue;

    var activeRaw = idxActive >= 0 ? AC_trim_(values[r][idxActive]).toUpperCase() : 'YES';
    var active = (!activeRaw || activeRaw === 'YES' || activeRaw === 'TRUE' || activeRaw === '1' || activeRaw === 'X');

    var idxDefaultHours = AC_findFirstIndex_(headers, ['Default_hours','Default hours','Default Hours']);
    bySlot[slot] = {
      active: active,
      scopeCode: AC_trim_(idxCode >= 0 ? values[r][idxCode] : ''),
      displayName: AC_trim_(idxDisplay >= 0 ? values[r][idxDisplay] : ''),
      defaultHours: idxDefaultHours >= 0 ? Number(values[r][idxDefaultHours] || 0) : 0
    };
  }
  return bySlot;
}

function AC_getRecurringScopesForPlanningRow_(headers, planningRowObj) {
  var items = AC_getRecurringScopeSlotsForPlanningRow_(headers, planningRowObj);
  return items.map(function(it){ return it.name; });
}

function AC_getAllSelectedScopeSlotsForPlanningRow_(headers, planningRowObj) {
  var configMap = AC_loadConfigScopeMap_();
  var selectedScopes = [];

  for (var i = 0; i < headers.length; i++) {
    var header = String(headers[i] || '').trim();
    if (!header) continue;

    var cell = planningRowObj.hasOwnProperty(header) ? planningRowObj[header] : '';
    var val = AC_trim_(cell).toUpperCase();
    if (val !== 'X') continue;

    var aliases = [];
    function addAlias_(x) {
      x = AC_trim_(x);
      if (!x) return;
      if (aliases.indexOf(x) === -1) aliases.push(x);
    }

    var cfg = configMap[header] || null;
    if (cfg) {
      addAlias_(cfg.scopeCode);
      addAlias_(cfg.displayName);
    }
    addAlias_(header);

    var primaryName = aliases.length ? aliases[0] : header;
    var durationHeader = AC_findDurationHeaderForScope_(headers, header);
    var durationValue = durationHeader ? planningRowObj[durationHeader] : '';
    var overrideHours = AC_parseHoursNumber_(durationValue);
    var defaultHours = cfg && isFinite(Number(cfg.defaultHours)) ? Number(cfg.defaultHours) : 0;
    var effectiveHours = (overrideHours != null) ? overrideHours : defaultHours;

    selectedScopes.push({
      header: header,
      name: primaryName,
      aliases: aliases,
      normAliases: aliases.map(function(a){ return AC_normKey_(a); }),
      durationHeader: durationHeader || '',
      overrideHours: overrideHours,
      defaultHours: defaultHours,
      effectiveHours: effectiveHours
    });
  }

  return selectedScopes;
}

function AC_findDurationHeaderForScope_(headers, scopeHeader) {
  var candidates = [
    'Duration ' + scopeHeader,
    'Duration_' + scopeHeader,
    'Duration ' + scopeHeader.replace(/_/g, ' '),
    'Duration' + scopeHeader
  ];
  for (var i = 0; i < candidates.length; i++) {
    var idx = headers.indexOf(candidates[i]);
    if (idx >= 0) return headers[idx];
  }
  return '';
}

function AC_parseHoursNumber_(v) {
  if (v === null || v === undefined) return null;
  var s = AC_trim_(v);
  if (!s) return null;
  if (typeof v === 'number') return isFinite(v) ? Number(v) : null;
  s = s.replace(',', '.');
  var n = Number(s);
  return isFinite(n) ? n : null;
}

function AC_getRecurringScopeSlotsForPlanningRow_(headers, planningRowObj) {
  var standardsInfo = AC_loadStandardsInfoMap_();
  var selectedScopes = AC_getAllSelectedScopeSlotsForPlanningRow_(headers, planningRowObj);
  var recurringScopes = [];

  for (var i = 0; i < selectedScopes.length; i++) {
    var item = selectedScopes[i] || {};
    var aliases = item.normAliases || [];
    for (var a = 0; a < aliases.length; a++) {
      var key = aliases[a];
      if (!key) continue;
      if (standardsInfo[key] && standardsInfo[key].recurring === true) {
        recurringScopes.push(item);
        break;
      }
    }
  }

  return recurringScopes;
}

function AC_keepRecurringScopesOnly_(headers, row, recurringScopeSlots) {
  var keepMap = {};
  for (var i = 0; i < recurringScopeSlots.length; i++) {
    keepMap[String(recurringScopeSlots[i].header || '')] = true;
  }

  for (var c = 0; c < headers.length; c++) {
    var header = String(headers[c] || '').trim();
    if (!header) continue;
    var cell = AC_trim_(row[c]).toUpperCase();
    if (cell !== 'X') continue;
    if (!keepMap[header]) {
      row[c] = '';
      var durationHeader = AC_findDurationHeaderForScope_(headers, header);
      if (durationHeader) {
        var dIdx = headers.indexOf(durationHeader);
        if (dIdx >= 0) row[dIdx] = '';
      }
    }
  }
}

function AC_recalculateHoursForRecurringScopes_(headers, row, recurringScopeSlots) {
  var total = 0;
  for (var i = 0; i < recurringScopeSlots.length; i++) {
    var item = recurringScopeSlots[i] || {};
    var hours = AC_parseHoursNumber_(item.overrideHours);
    if (hours == null) hours = AC_parseHoursNumber_(item.defaultHours);
    if (hours == null) hours = AC_parseHoursNumber_(item.effectiveHours);
    if (hours == null) continue;
    total += Number(hours);
  }

  AC_setIfHeaderExists_(headers, row, ['Total time in hours','Total audit time in hours','Total hours','Required hours','Hours planned','Hours to be planned'], total);
}

function AC_setIfHeaderExists_(headers, row, headerCandidates, value) {
  for (var i = 0; i < headerCandidates.length; i++) {
    var idx = AC_findIndexByCandidate_(headers, headerCandidates[i]);
    if (idx >= 0) row[idx] = value;
  }
}

function AC_loadStandardsInfoMap_() {
  // Backward-compatible function name, but canonical source is Config_Scopes.
  // Standards is no longer the owner for scope metadata, recurring rules, hours or planning offsets.
  return AC_loadConfigScopesInfoMap_();
}

function AC_loadConfigScopesInfoMap_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(AC_SHEET_CONFIG_SCOPES);
  var map = {};
  if (!sh) return map;

  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return map;

  var headers = values[0].map(function(h){ return String(h || '').trim(); });
  var idxSlot = AC_findFirstIndex_(headers, ['SlotKey','Slot Key','Scope slot','ScopeSlot']);
  var idxCode = AC_findFirstIndex_(headers, ['ScopeCode','Scope Code','Code','Name','Scope','Standard']);
  var idxDisplay = AC_findFirstIndex_(headers, ['DisplayName','Display Name','Name','Scope name','Standard name']);
  var idxActive = AC_findFirstIndex_(headers, ['Active','Is active']);
  var idxRecurring = AC_findFirstIndex_(headers, ['Recurring','Is recurring','Recurring audit','Recurring?']);
  var idxFrom = AC_findFirstIndex_(headers, ['Planning from','Planning From','Planning window from','Plan from','Window from','PlanningFrom','Planning_from','Offset from','From months','FromMonths']);
  var idxTo = AC_findFirstIndex_(headers, ['Planning to','Planning To','Planning window to','Plan to','Window to','PlanningTo','Planning_to','Offset to','To months','ToMonths']);
  var idxHours = AC_findFirstIndex_(headers, ['Default_hours','Default hours','Default Hours','Audit time in hours','Total audit time in hours','Total time in hours','Hours','Required hours']);

  if (idxSlot < 0 && idxCode < 0 && idxDisplay < 0) return map;

  for (var r = 1; r < values.length; r++) {
    var rawSlot = idxSlot >= 0 ? AC_trim_(values[r][idxSlot]) : '';
    var rawCode = idxCode >= 0 ? AC_trim_(values[r][idxCode]) : '';
    var rawDisplay = idxDisplay >= 0 ? AC_trim_(values[r][idxDisplay]) : '';
    var activeRaw = idxActive >= 0 ? AC_trim_(values[r][idxActive]).toUpperCase() : 'YES';
    var active = (!activeRaw || activeRaw === 'YES' || activeRaw === 'TRUE' || activeRaw === '1' || activeRaw === 'X' || activeRaw === 'JA');
    if (!active) continue;

    var recurringRaw = idxRecurring >= 0 ? AC_trim_(values[r][idxRecurring]).toUpperCase() : '';
    var recurring = recurringRaw === 'YES' || recurringRaw === 'TRUE' || recurringRaw === '1' || recurringRaw === 'X' || recurringRaw === 'JA';
    var fromMonths = idxFrom >= 0 ? Number(values[r][idxFrom] || 0) : 0;
    var toMonths = idxTo >= 0 ? Number(values[r][idxTo] || 0) : 0;
    var hours = idxHours >= 0 ? Number(values[r][idxHours] || 0) : 0;

    var canonicalName = rawCode || rawDisplay || rawSlot;
    if (!canonicalName) continue;

    var info = {
      name: canonicalName,
      recurring: recurring,
      fromMonths: isFinite(fromMonths) ? fromMonths : 0,
      toMonths: isFinite(toMonths) ? toMonths : 0,
      hours: isFinite(hours) ? hours : 0,
      source: AC_SHEET_CONFIG_SCOPES,
      slotKey: rawSlot,
      scopeCode: rawCode,
      displayName: rawDisplay
    };

    AC_putScopeInfoAlias_(map, rawSlot, info);
    AC_putScopeInfoAlias_(map, rawCode, info);
    AC_putScopeInfoAlias_(map, rawDisplay, info);
  }

  return map;
}

function AC_putScopeInfoAlias_(map, alias, info) {
  var key = AC_normKey_(alias);
  if (key) map[key] = info;
}

function AC_findFirstIndex_(headers, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var idx = AC_findIndexByCandidate_(headers, candidates[i]);
    if (idx >= 0) return idx;
  }
  return -1;
}

function AC_applyCentralPlanningWindow_(headers, row) {
  AC_setIfHeaderExists_(headers, row, ['Planning window from','AS'], '');
  AC_setIfHeaderExists_(headers, row, ['Planning window to','AT'], '');

  var expiryInfo = AC_getPlanningWindowExpiryInfo_(headers, row);
  var expiry = expiryInfo && expiryInfo.date ? expiryInfo.date : null;
  if (!expiry) return;

  var scopeSlots = AC_getAllSelectedScopeSlotsForPlanningRow_(headers, AC_buildRowObject_(headers, row, 0));
  if (!scopeSlots.length) return;

  var standardsInfo = AC_loadStandardsInfoMap_();
  var maxStart = null;
  var minEnd = null;
  var matched = 0;

  for (var i = 0; i < scopeSlots.length; i++) {
    var aliases = scopeSlots[i].normAliases || [];
    var info = null;
    for (var a = 0; a < aliases.length; a++) {
      var key = aliases[a];
      if (key && standardsInfo[key]) {
        info = standardsInfo[key];
        break;
      }
    }
    if (!info) continue;

    var start = AC_addMonthsPreserveDay_(expiry, Number(info.fromMonths || 0));
    var end = AC_addMonthsPreserveDay_(expiry, Number(info.toMonths || 0));
    if (start.getTime() > end.getTime()) {
      var tmp = start; start = end; end = tmp;
    }
    if (!maxStart || start.getTime() > maxStart.getTime()) maxStart = start;
    if (!minEnd || end.getTime() < minEnd.getTime()) minEnd = end;
    matched++;
  }

  if (!matched || !maxStart || !minEnd) return;

  AC_setIfHeaderExists_(headers, row, ['Planning window from','AS'], AC_formatDate_(maxStart));
  AC_setIfHeaderExists_(headers, row, ['Planning window to','AT'], AC_formatDate_(minEnd));
}

function AC_findExistingNextCycleRow_(shPlan, headers, planningRowObj, nextExpiryStr) {
  var values = shPlan.getDataRange().getValues();
  if (!values || values.length < 2) return null;

  // BUILD: 20260520_COMPANY_UID_DUPLICATE_MATCH_R1
  // Company names are mutable display values. Recurring successor duplicate
  // detection must use Company_UID as the primary company identity whenever
  // available, and only fall back to Company name for legacy rows without UID.
  var idxCompanyUid = AC_findFirstIndex_(headers, ['Company_UID', 'Company UID', 'CompanyUid', 'Company uid']);
  var idxCompany = AC_findFirstIndex_(headers, ['Company']);
  var idxLocation = AC_findFirstIndex_(headers, ['Location']);
  var idxBirthdate = AC_findFirstIndex_(headers, ['Birthdate certificate']);
  var idxExpireY = AC_findFirstIndex_(headers, ['Date - Will Expire', 'Date – Will Expire', 'Will Expire']);
  var idxAuditId = AC_findFirstIndex_(headers, ['Audit ID', 'Audit_ID', 'AuditId']);
  var idxStatus = AC_findFirstIndex_(headers, ['Status']);

  var companyUid = AC_trim_(planningRowObj['Company_UID'] || planningRowObj['Company UID'] || planningRowObj['CompanyUid'] || planningRowObj['Company uid'] || '');
  var company = AC_trim_(planningRowObj['Company']);
  var location = AC_trim_(planningRowObj['Location']);
  var birthdateStr = AC_formatDate_(AC_parseDate_(planningRowObj['Birthdate certificate']));
  var sourceAuditId = AC_trim_(planningRowObj['Audit ID']);

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var auditId = idxAuditId >= 0 ? AC_trim_(row[idxAuditId]) : '';
    if (sourceAuditId && auditId === sourceAuditId) continue;

    var status = idxStatus >= 0 ? AC_trim_(row[idxStatus]).toLowerCase() : '';
    if (status === 'completed') continue;

    var companyUid2 = idxCompanyUid >= 0 ? AC_trim_(row[idxCompanyUid]) : '';
    var company2 = idxCompany >= 0 ? AC_trim_(row[idxCompany]) : '';
    var location2 = idxLocation >= 0 ? AC_trim_(row[idxLocation]) : '';
    var birthdate2 = idxBirthdate >= 0 ? AC_formatDate_(AC_parseDate_(row[idxBirthdate])) : '';
    var expiry2 = idxExpireY >= 0 ? AC_formatDate_(AC_parseDate_(row[idxExpireY])) : '';

    var sameCompany = false;
    if (companyUid && companyUid2) {
      sameCompany = (companyUid2 === companyUid);
    } else {
      sameCompany = (company2 === company);
    }

    if (sameCompany &&
        location2 === location &&
        birthdate2 === birthdateStr &&
        expiry2 === nextExpiryStr) {
      return {
        rowIndex:r + 1,
        auditId:auditId,
        matchedBy:(companyUid && companyUid2) ? 'Company_UID' : 'Company',
        companyUid:companyUid2 || companyUid || '',
        company:company2 || company || ''
      };
    }
  }
  return null;
}


/* ==================== DIAGNOSE PLANNING WINDOW ==================== */

function AnnualCycleEngineV5_DiagnosePlanningWindowByAuditId(auditId) {
  var result;
  try {
    auditId = String(auditId || '').trim();
    if (!auditId) {
      result = AnnualCycleEngineV5_DiagnosePlanningWindowFirstEmpty();
    } else {
      var ss = SpreadsheetApp.getActive();
      var shPlan = ss.getSheetByName(AC_SHEET_AUDIT_PLANNING);
      if (!shPlan) result = { success:false, message:'Missing sheet: ' + AC_SHEET_AUDIT_PLANNING };
      else {
        var values = shPlan.getDataRange().getValues();
        if (!values || values.length < 2) result = { success:false, message:'Audit planning empty' };
        else {
          var headers = values[0].map(function(h){ return String(h || '').trim(); });
          var idxAuditId = AC_findFirstIndex_(headers, ['Audit ID','AuditId','auditId']);
          if (idxAuditId < 0) result = { success:false, message:'Missing header: Audit ID' };
          else {
            result = { success:false, message:'Audit not found: ' + auditId };
            for (var r = 1; r < values.length; r++) {
              if (String(values[r][idxAuditId] || '').trim() !== auditId) continue;
              var rowObj = AC_buildRowObject_(headers, values[r], r + 1);
              result = AC_buildPlanningWindowDiagnosis_(headers, rowObj);
              break;
            }
          }
        }
      }
    }
  } catch (e) {
    result = { success:false, message:String(e && e.message ? e.message : e) };
  }
  AC_logDiagnosisResult_(result);
  return result;
}

function AnnualCycleEngineV5_DiagnosePlanningWindowsAll() {
  var result;
  try {
    var ss = SpreadsheetApp.getActive();
    var shPlan = ss.getSheetByName(AC_SHEET_AUDIT_PLANNING);
    if (!shPlan) result = { success:false, message:'Missing sheet: ' + AC_SHEET_AUDIT_PLANNING };
    else {
      var values = shPlan.getDataRange().getValues();
      if (!values || values.length < 2) result = { success:true, scanned:0, rows:[] };
      else {
        var headers = values[0].map(function(h){ return String(h || '').trim(); });
        var rows = [];
        for (var r = 1; r < values.length; r++) {
          var rowObj = AC_buildRowObject_(headers, values[r], r + 1);
          rows.push(AC_buildPlanningWindowDiagnosis_(headers, rowObj));
        }
        result = { success:true, scanned:rows.length, rows:rows };
      }
    }
  } catch (e) {
    result = { success:false, message:String(e && e.message ? e.message : e) };
  }
  AC_logDiagnosisSummary_(result);
  return result;
}



function AnnualCycleEngineV5_DiagnosePlanningWindowFirstEmpty() {
  var result;
  try {
    var ss = SpreadsheetApp.getActive();
    var shPlan = ss.getSheetByName(AC_SHEET_AUDIT_PLANNING);
    if (!shPlan) result = { success:false, message:'Missing sheet: ' + AC_SHEET_AUDIT_PLANNING };
    else {
      var values = shPlan.getDataRange().getValues();
      if (!values || values.length < 2) result = { success:false, message:'Audit planning empty' };
      else {
        var headers = values[0].map(function(h){ return String(h || '').trim(); });
        var idxAS = AC_findFirstIndex_(headers, ['Planning window from','AS']);
        var idxAT = AC_findFirstIndex_(headers, ['Planning window to','AT']);
        var picked = null;
        for (var r = 1; r < values.length; r++) {
          var asVal = idxAS >= 0 ? String(values[r][idxAS] || '').trim() : '';
          var atVal = idxAT >= 0 ? String(values[r][idxAT] || '').trim() : '';
          if (!asVal || !atVal) {
            picked = AC_buildRowObject_(headers, values[r], r + 1);
            break;
          }
        }
        if (!picked) picked = AC_buildRowObject_(headers, values[1], 2);
        result = AC_buildPlanningWindowDiagnosis_(headers, picked);
      }
    }
  } catch (e) {
    result = { success:false, message:String(e && e.message ? e.message : e) };
  }
  AC_logDiagnosisResult_(result);
  return result;
}

function AC_logDiagnosisResult_(result) {
  try { Logger.log(JSON.stringify(result, null, 2)); } catch (e1) {}
  try { console.log(JSON.stringify(result, null, 2)); } catch (e2) {}
}

function AC_logDiagnosisSummary_(result) {
  try {
    if (!result || !result.rows || !result.rows.length) {
      AC_logDiagnosisResult_(result);
      return;
    }
    var summary = {
      success: !!result.success,
      scanned: Number(result.scanned || 0),
      ok: 0,
      noExpiry: 0,
      noScopes: 0,
      noConfigScopesMatch: 0,
      calcEmpty: 0,
      sample: []
    };
    for (var i = 0; i < result.rows.length; i++) {
      var row = result.rows[i] || {};
      var reason = String(row.reason || '');
      if (reason === 'OK') summary.ok++;
      else if (reason === 'NO_EXPIRY_DATE') summary.noExpiry++;
      else if (reason === 'NO_SELECTED_SCOPE_SLOTS') summary.noScopes++;
      else if (reason === 'NO_CONFIG_SCOPES_MATCH_FOR_SELECTED_SCOPES') summary.noConfigScopesMatch++;
      else if (reason === 'WINDOW_CALCULATION_EMPTY') summary.calcEmpty++;
      if (summary.sample.length < 10) {
        summary.sample.push({
          rowIndex: row.rowIndex || 0,
          auditId: row.auditId || '',
          company: row.company || '',
          reason: row.reason || '',
          expiryParsed: row.expiryParsed || '',
          calculatedAS: row.calculatedAS || '',
          calculatedAT: row.calculatedAT || '',
          selectedScopeCount: row.selectedScopeCount || 0,
          matchedScopeCount: row.matchedScopeCount || 0
        });
      }
    }
    Logger.log(JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
  } catch (e) {
    AC_logDiagnosisResult_({ success:false, message:String(e && e.message ? e.message : e) });
  }
}

function AnnualCycleEngineV5_DiagnosePlanningWindowByAuditId_Log(auditId) {
  return AnnualCycleEngineV5_DiagnosePlanningWindowByAuditId(auditId);
}

function AnnualCycleEngineV5_DiagnosePlanningWindowsAll_Log() {
  return AnnualCycleEngineV5_DiagnosePlanningWindowsAll();
}


function AC_buildPlanningWindowDiagnosis_(headers, planningRowObj) {
  var standardsInfo = AC_loadStandardsInfoMap_();
  var selected = AC_getAllSelectedScopeSlotsForPlanningRow_(headers, planningRowObj);
  var rowArr = AC_rowObjectToArray_(headers, planningRowObj);
  var expiryRaw = AC_getHeaderValue_(headers, rowArr, 'Extended Expiration Date') ||
                  AC_getHeaderValue_(headers, rowArr, 'Date - Will Expire');
  var expiryInfo = AC_getPlanningWindowExpiryInfo_(headers, rowArr);
  var expiry = expiryInfo && expiryInfo.date ? expiryInfo.date : null;

  var maxStart = null;
  var minEnd = null;
  var matched = [];
  var unmatched = [];

  for (var i = 0; i < selected.length; i++) {
    var item = selected[i] || {};
    var aliases = item.normAliases || [];
    var info = null;
    var matchedBy = '';
    for (var a = 0; a < aliases.length; a++) {
      var key = aliases[a];
      if (key && standardsInfo[key]) {
        info = standardsInfo[key];
        matchedBy = key;
        break;
      }
    }

    if (!info) {
      unmatched.push({
        slotKey: item.header || '',
        aliases: item.aliases || [],
        durationHeader: item.durationHeader || '',
        overrideHours: item.overrideHours,
        defaultHours: item.defaultHours,
        effectiveHours: item.effectiveHours
      });
      continue;
    }

    var entry = {
      slotKey: item.header || '',
      aliases: item.aliases || [],
      matchedStandardKey: matchedBy,
      matchedStandardName: info.name || '',
      planningFromMonths: Number(info.fromMonths || 0),
      planningToMonths: Number(info.toMonths || 0),
      durationHeader: item.durationHeader || '',
      overrideHours: item.overrideHours,
      defaultHours: item.defaultHours,
      effectiveHours: item.effectiveHours
    };

    if (expiry) {
      var start = AC_addMonthsPreserveDay_(expiry, Number(info.fromMonths || 0));
      var end = AC_addMonthsPreserveDay_(expiry, Number(info.toMonths || 0));
      if (start.getTime() > end.getTime()) {
        var tmp = start; start = end; end = tmp;
      }
      entry.windowFrom = AC_formatDate_(start);
      entry.windowTo = AC_formatDate_(end);
      if (!maxStart || start.getTime() > maxStart.getTime()) maxStart = start;
      if (!minEnd || end.getTime() < minEnd.getTime()) minEnd = end;
    }

    matched.push(entry);
  }

  var calculatedFrom = maxStart ? AC_formatDate_(maxStart) : '';
  var calculatedTo = minEnd ? AC_formatDate_(minEnd) : '';
  var currentFrom = AC_getHeaderValueByCandidates_(headers, AC_rowObjectToArray_(headers, planningRowObj), ['Planning window from','AS']) || '';
  var currentTo = AC_getHeaderValueByCandidates_(headers, AC_rowObjectToArray_(headers, planningRowObj), ['Planning window to','AT']) || '';

  var reason = '';
  if (!expiry) reason = 'NO_EXPIRY_DATE';
  else if (!selected.length) reason = 'NO_SELECTED_SCOPE_SLOTS';
  else if (!matched.length) reason = 'NO_CONFIG_SCOPES_MATCH_FOR_SELECTED_SCOPES';
  else if (!calculatedFrom || !calculatedTo) reason = 'WINDOW_CALCULATION_EMPTY';
  else reason = 'OK';

  return {
    success:true,
    rowIndex: Number(planningRowObj._rowIndex || 0),
    auditId: AC_trim_(planningRowObj['Audit ID'] || ''),
    company: AC_trim_(planningRowObj['Company'] || ''),
    location: AC_trim_(planningRowObj['Location'] || ''),
    status: AC_trim_(planningRowObj['Status'] || ''),
    expiryRaw: expiryRaw,
    expiryParsed: expiry ? AC_formatDate_(expiry) : '',
    expirySource: expiryInfo && expiryInfo.source ? expiryInfo.source : '',
    expirySynthetic: !!(expiryInfo && expiryInfo.synthetic),
    currentAS: currentFrom,
    currentAT: currentTo,
    calculatedAS: calculatedFrom,
    calculatedAT: calculatedTo,
    selectedScopeCount: selected.length,
    matchedScopeCount: matched.length,
    unmatchedScopeCount: unmatched.length,
    reason: reason,
    selectedScopes: selected.map(function(item){
      return {
        slotKey: item.header || '',
        aliases: item.aliases || [],
        durationHeader: item.durationHeader || '',
        overrideHours: item.overrideHours,
        defaultHours: item.defaultHours,
        effectiveHours: item.effectiveHours
      };
    }),
    matchedScopes: matched,
    unmatchedScopes: unmatched,
    configScopesCanonicalHeadersDetected: AC_getConfigScopesCanonicalHeaderDiagnosis_(),
    configScopesLoaded: AC_getConfigScopesHeaderDiagnosis_()
  };
}

function AC_getConfigScopesHeaderDiagnosis_() {
  return AC_getConfigScopesCanonicalHeaderDiagnosis_();
}

function AC_getConfigScopesCanonicalHeaderDiagnosis_() {
  try {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(AC_SHEET_CONFIG_SCOPES);
    if (!sh) return { ok:false, message:'Missing sheet: ' + AC_SHEET_CONFIG_SCOPES };
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function(h){ return String(h || '').trim(); });
    return {
      ok:true,
      source:AC_SHEET_CONFIG_SCOPES,
      headers: headers,
      idxSlot: AC_findFirstIndex_(headers, ['SlotKey','Slot Key','Scope slot','ScopeSlot']),
      idxCode: AC_findFirstIndex_(headers, ['ScopeCode','Scope Code','Code','Name','Scope','Standard']),
      idxDisplay: AC_findFirstIndex_(headers, ['DisplayName','Display Name','Name','Scope name','Standard name']),
      idxRecurring: AC_findFirstIndex_(headers, ['Recurring','Is recurring','Recurring audit','Recurring?']),
      idxFrom: AC_findFirstIndex_(headers, ['Planning from','Planning From','Planning window from','Plan from','Window from','PlanningFrom','Planning_from','Offset from','From months','FromMonths']),
      idxTo: AC_findFirstIndex_(headers, ['Planning to','Planning To','Planning window to','Plan to','Window to','PlanningTo','Planning_to','Offset to','To months','ToMonths']),
      idxHours: AC_findFirstIndex_(headers, ['Default_hours','Default hours','Default Hours','Audit time in hours','Total audit time in hours','Total time in hours','Hours','Required hours']),
      idxActive: AC_findFirstIndex_(headers, ['Active','Is active'])
    };
  } catch (e) {
    return { ok:false, message:String(e && e.message ? e.message : e) };
  }
}

function AC_getConfigScopesHeaderDiagnosis_() {
  try {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(AC_SHEET_CONFIG_SCOPES);
    if (!sh) return { ok:false, message:'Missing sheet: ' + AC_SHEET_CONFIG_SCOPES };
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function(h){ return String(h || '').trim(); });
    return {
      ok:true,
      headers: headers,
      idxSlot: AC_findFirstIndex_(headers, ['SlotKey']),
      idxCode: AC_findFirstIndex_(headers, ['ScopeCode']),
      idxDisplay: AC_findFirstIndex_(headers, ['DisplayName']),
      idxDefaultHours: AC_findFirstIndex_(headers, ['Default_hours','Default hours','Default Hours']),
      idxActive: AC_findFirstIndex_(headers, ['Active'])
    };
  } catch (e) {
    return { ok:false, message:String(e && e.message ? e.message : e) };
  }
}


/***********************************************************************
/***********************************************************************
 * MANUAL ONE-TIME REPAIR RUNNERS — AUDIT PLANNING BOOTSTRAP
 * Added for one-time import/bootstrap repair.
 *
 * Purpose:
 * - Fill missing Audit ID values in existing Audit planning rows
 * - Normalize Date - Will Expire to the active cycle year
 * - Normalize Extended Expiration Date to Date - Will Expire when no extension is applied
 * - Recalculate central Planning window from / to
 *
 * Important:
 * - This repair is for the 2026 bootstrap/import event.
 * - Birthdate certificate may contain an older/source year.
 * - Date - Will Expire must use AC_MANUAL_REPAIR_TARGET_YEAR with the same month/day.
 *
 * Safety:
 * - DRY RUN functions do not write
 * - APPLY functions write only controlled bootstrap fields
 * - Existing Audit IDs are not overwritten
 * - Expiry/window fields are corrected when they are empty or have the wrong cycle year
 * - Intended for controlled manual use only
 ***********************************************************************/

var AC_MANUAL_REPAIR_TARGET_YEAR = 2026;
var AC_MANUAL_REPAIR_SAMPLE_LIMIT = 20;

function AnnualCycleEngineV5_ManualRepairAuditPlanning_DryRun() {
  return AC_manualRepairAuditPlanning_(false);
}

function AnnualCycleEngineV5_ManualRepairAuditPlanning_Apply() {
  return AC_manualRepairAuditPlanning_(true);
}

function AnnualCycleEngineV5_ManualRepairTotalAuditHours_DryRun() {
  return AC_manualRepairTotalAuditHours_(false);
}

function AnnualCycleEngineV5_ManualRepairTotalAuditHours_Apply() {
  return AC_manualRepairTotalAuditHours_(true);
}

function AnnualCycleEngineV5_ManualRepairMissingAuditIds_DryRun() {
  return AC_manualRepairMissingAuditIds_(false);
}

function AnnualCycleEngineV5_ManualRepairMissingAuditIds_Apply() {
  return AC_manualRepairMissingAuditIds_(true);
}

function AnnualCycleEngineV5_ManualRepairExpiryAndWindows_DryRun() {
  return AC_manualRepairExpiryAndWindows_(false);
}

function AnnualCycleEngineV5_ManualRepairExpiryAndWindows_Apply() {
  return AC_manualRepairExpiryAndWindows_(true);
}

function AC_manualRepairAuditPlanning_(apply) {
  var idResult = AC_manualRepairMissingAuditIds_(apply);
  var hoursResult = AC_manualRepairTotalAuditHours_(apply);
  var expiryResult = AC_manualRepairExpiryAndWindows_(apply);
  var result = {
    success: !!(idResult && idResult.success && hoursResult && hoursResult.success && expiryResult && expiryResult.success),
    apply: !!apply,
    targetYear: AC_getManualRepairTargetYear_(),
    auditIds: idResult,
    totalAuditHours: hoursResult,
    expiryAndWindows: expiryResult
  };
  AC_logDiagnosisResult_(AC_compactManualRepairResult_(result));
  return result;
}

function AC_getManualRepairTargetYear_() {
  var year = Number(AC_MANUAL_REPAIR_TARGET_YEAR || 0);
  if (isFinite(year) && year >= 2000 && year <= 2100) return year;
  return new Date().getFullYear();
}

function AC_ymdWithYear_(ymd, targetYear) {
  ymd = AC_cellToYmd_(ymd);
  if (!ymd) return '';
  var m = ymd.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return String(targetYear) + '-' + m[1] + '-' + m[2];
}

function AC_isYes_(v) {
  var s = AC_trim_(v).toUpperCase();
  return s === 'YES' || s === 'TRUE' || s === '1' || s === 'X' || s === 'JA';
}

function AC_compactManualRepairResult_(result) {
  if (!result || typeof result !== 'object') return result;
  try {
    var out = JSON.parse(JSON.stringify(result));
    if (out.auditIds && out.auditIds.sampleRows && out.auditIds.sampleRows.length > 10) {
      out.auditIds.sampleRows = out.auditIds.sampleRows.slice(0, 10);
    }
    if (out.totalAuditHours && out.totalAuditHours.sampleRows && out.totalAuditHours.sampleRows.length > 10) {
      out.totalAuditHours.sampleRows = out.totalAuditHours.sampleRows.slice(0, 10);
    }
    if (out.expiryAndWindows && out.expiryAndWindows.sampleRows && out.expiryAndWindows.sampleRows.length > 10) {
      out.expiryAndWindows.sampleRows = out.expiryAndWindows.sampleRows.slice(0, 10);
    }
    return out;
  } catch (e) {
    return result;
  }
}

function AC_manualRepairMissingAuditIds_(apply) {
  try {
    var ss = SpreadsheetApp.getActive();
    var shPlan = ss.getSheetByName(AC_SHEET_AUDIT_PLANNING);
    if (!shPlan) return { success:false, message:'Missing sheet: ' + AC_SHEET_AUDIT_PLANNING };

    var values = shPlan.getDataRange().getValues();
    if (!values || values.length < 2) return { success:true, apply:!!apply, scanned:0, wouldWrite:0, written:0, sampleRows:[] };

    var headers = values[0].map(function(h){ return String(h || '').trim(); });
    var idxAuditId = AC_findFirstIndex_(headers, ['Audit ID','Audit_ID','AuditId','auditId']);
    if (idxAuditId < 0) return { success:false, message:'Missing header: Audit ID / Audit_ID' };

    var rows = [];
    var wouldWrite = 0;
    var written = 0;

    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      var existing = AC_trim_(row[idxAuditId]);
      if (existing) continue;

      var rowObj = AC_buildRowObject_(headers, row, r + 1);
      var newAuditId = AC_buildNewAuditId_(rowObj, r + 1);
      wouldWrite++;

      if (apply) {
        shPlan.getRange(r + 1, idxAuditId + 1).setNumberFormat('@STRING@').setValue(newAuditId);
        written++;
      }

      if (rows.length < AC_MANUAL_REPAIR_SAMPLE_LIMIT) {
        rows.push({
          rowIndex: r + 1,
          company: AC_trim_(rowObj['Company'] || ''),
          location: AC_trim_(rowObj['Location'] || ''),
          newAuditId: newAuditId
        });
      }
    }

    return {
      success:true,
      apply:!!apply,
      scanned:values.length - 1,
      wouldWrite:wouldWrite,
      written:written,
      sampleRows:rows
    };
  } catch (e) {
    return { success:false, message:String(e && e.message ? e.message : e) };
  }
}

function AC_manualRepairExpiryAndWindows_(apply) {
  try {
    var ss = SpreadsheetApp.getActive();
    var shPlan = ss.getSheetByName(AC_SHEET_AUDIT_PLANNING);
    if (!shPlan) return { success:false, message:'Missing sheet: ' + AC_SHEET_AUDIT_PLANNING };

    var values = shPlan.getDataRange().getValues();
    if (!values || values.length < 2) return { success:true, apply:!!apply, scanned:0, wouldWriteRows:0, writtenRows:0, sampleRows:[] };

    var headers = values[0].map(function(h){ return String(h || '').trim(); });
    var idxAuditId = AC_findFirstIndex_(headers, ['Audit ID','Audit_ID','AuditId','auditId']);
    var idxBirthdate = AC_findFirstIndex_(headers, ['Birthdate certificate','Birthdate Certificate','Certificate birthdate']);
    var idxWillExpire = AC_findFirstIndex_(headers, ['Date - Will Expire','Date – Will Expire','Will Expire']);
    var idxExtended = AC_findFirstIndex_(headers, ['Extended Expiration Date','Extended Expiry Date']);
    var idxAS = AC_findFirstIndex_(headers, ['Planning window from','AS']);
    var idxAT = AC_findFirstIndex_(headers, ['Planning window to','AT']);
    var idxExtensionApplied = AC_findFirstIndex_(headers, ['Extension applied','Extension Applied']);

    if (idxWillExpire < 0) return { success:false, message:'Missing header: Date - Will Expire' };
    if (idxExtended < 0) return { success:false, message:'Missing header: Extended Expiration Date' };

    var targetYear = AC_getManualRepairTargetYear_();
    var rows = [];
    var wouldWriteRows = 0;
    var writtenRows = 0;
    var missingSourceForExpiry = 0;
    var noCalculatedWindow = 0;
    var normalizedWillExpire = 0;
    var normalizedExtended = 0;
    var recalculatedWindows = 0;

    for (var r = 1; r < values.length; r++) {
      var row = values[r].slice();
      var original = values[r];
      var rowObj = AC_buildRowObject_(headers, row, r + 1);
      var auditId = idxAuditId >= 0 ? AC_trim_(row[idxAuditId]) : '';
      var currentY = AC_cellToYmd_(row[idxWillExpire]);
      var currentZ = AC_cellToYmd_(row[idxExtended]);
      var birthdate = idxBirthdate >= 0 ? AC_cellToYmd_(row[idxBirthdate]) : '';
      var extensionApplied = idxExtensionApplied >= 0 ? AC_isYes_(row[idxExtensionApplied]) : false;

      var sourceForY = birthdate || currentY || currentZ;
      var newY = currentY;
      var newZ = currentZ;
      var actions = [];

      if (sourceForY) {
        var targetY = AC_ymdWithYear_(sourceForY, targetYear);
        if (targetY && currentY !== targetY) {
          newY = targetY;
          row[idxWillExpire] = newY;
          normalizedWillExpire++;
          actions.push(currentY ? 'normalize Date - Will Expire to target year' : 'fill Date - Will Expire from Birthdate certificate using target year');
        }
      }

      if (!newY) {
        var expiryInfo = AC_getPlanningWindowExpiryInfo_(headers, row);
        if (expiryInfo && expiryInfo.date && expiryInfo.synthetic) {
          newY = AC_ymdWithYear_(AC_formatDate_(expiryInfo.date), targetYear);
          row[idxWillExpire] = newY;
          actions.push('fill Date - Will Expire from non-recurring year-end fallback using target year');
        }
      }

      if (!newY) missingSourceForExpiry++;

      if (!extensionApplied && newY && currentZ !== newY) {
        newZ = newY;
        row[idxExtended] = newZ;
        normalizedExtended++;
        actions.push(currentZ ? 'normalize Extended Expiration Date to Date - Will Expire' : 'fill Extended Expiration Date from Date - Will Expire');
      }

      var beforeAS = idxAS >= 0 ? AC_cellToYmd_(original[idxAS]) : '';
      var beforeAT = idxAT >= 0 ? AC_cellToYmd_(original[idxAT]) : '';
      AC_applyCentralPlanningWindow_(headers, row);
      var afterAS = idxAS >= 0 ? AC_cellToYmd_(row[idxAS]) : '';
      var afterAT = idxAT >= 0 ? AC_cellToYmd_(row[idxAT]) : '';

      if ((!afterAS || !afterAT) && (newY || newZ)) noCalculatedWindow++;

      if ((afterAS && beforeAS !== afterAS) || (afterAT && beforeAT !== afterAT)) {
        recalculatedWindows++;
        actions.push('recalculate Planning window from/to');
      }

      if (!actions.length) continue;
      wouldWriteRows++;

      if (apply) {
        if (currentY !== newY && newY) AC_forceTextDateByHeader_(shPlan, headers, r + 1, 'Date - Will Expire', newY);
        if (currentZ !== newZ && newZ) AC_forceTextDateByHeader_(shPlan, headers, r + 1, 'Extended Expiration Date', newZ);
        if (beforeAS !== afterAS && afterAS) AC_forceTextDateByHeaderCandidates_(shPlan, headers, r + 1, ['Planning window from','AS'], afterAS);
        if (beforeAT !== afterAT && afterAT) AC_forceTextDateByHeaderCandidates_(shPlan, headers, r + 1, ['Planning window to','AT'], afterAT);
        writtenRows++;
      }

      if (rows.length < AC_MANUAL_REPAIR_SAMPLE_LIMIT) {
        rows.push({
          rowIndex:r + 1,
          auditId:auditId,
          company:AC_trim_(rowObj['Company'] || ''),
          location:AC_trim_(rowObj['Location'] || ''),
          actions:actions,
          oldDateWillExpire:currentY || '',
          newDateWillExpire:newY || '',
          oldExtendedExpirationDate:currentZ || '',
          newExtendedExpirationDate:newZ || '',
          oldPlanningWindowFrom:beforeAS || '',
          newPlanningWindowFrom:afterAS || '',
          oldPlanningWindowTo:beforeAT || '',
          newPlanningWindowTo:afterAT || ''
        });
      }
    }

    return {
      success:true,
      apply:!!apply,
      targetYear:targetYear,
      scanned:values.length - 1,
      wouldWriteRows:wouldWriteRows,
      writtenRows:writtenRows,
      normalizedWillExpire:normalizedWillExpire,
      normalizedExtended:normalizedExtended,
      recalculatedWindows:recalculatedWindows,
      missingSourceForExpiry:missingSourceForExpiry,
      noCalculatedWindow:noCalculatedWindow,
      sampleRows:rows
    };
  } catch (e) {
    return { success:false, message:String(e && e.message ? e.message : e) };
  }
}


/***********************************************************************
 * MANUAL REPAIR — TOTAL AUDIT TIME IN HOURS (CONFIG_SCOPES CANONICAL)
 ***********************************************************************/

function AC_manualRepairTotalAuditHours_(apply) {
  try {
    var ss = SpreadsheetApp.getActive();
    var shPlan = ss.getSheetByName(AC_SHEET_AUDIT_PLANNING);
    if (!shPlan) return { success:false, message:'Missing sheet: ' + AC_SHEET_AUDIT_PLANNING };

    var values = shPlan.getDataRange().getValues();
    if (!values || values.length < 2) return { success:true, apply:!!apply, scanned:0, wouldWriteRows:0, writtenRows:0, sampleRows:[] };

    var headers = values[0].map(function(h){ return String(h || '').trim(); });
    var idxAuditId = AC_findFirstIndex_(headers, ['Audit ID','Audit_ID','AuditId','auditId']);
    var idxTotalHours = AC_findFirstIndex_(headers, ['Total audit time in hours','Total time in hours','Total hours','Required hours','Hours to be planned']);
    if (idxTotalHours < 0) return { success:false, message:'Missing header: Total audit time in hours' };

    var rows = [];
    var wouldWriteRows = 0;
    var writtenRows = 0;
    var noSelectedScopes = 0;
    var noHoursResolved = 0;

    for (var r = 1; r < values.length; r++) {
      var row = values[r].slice();
      var rowObj = AC_buildRowObject_(headers, row, r + 1);
      var auditId = idxAuditId >= 0 ? AC_trim_(row[idxAuditId]) : '';
      var selected = AC_getAllSelectedScopeSlotsForPlanningRow_(headers, rowObj);

      if (!selected.length) {
        noSelectedScopes++;
        continue;
      }

      var total = 0;
      var contributing = [];
      var missingHours = [];

      for (var i = 0; i < selected.length; i++) {
        var item = selected[i] || {};
        var hours = AC_parseHoursNumber_(item.overrideHours);
        var source = 'Duration override';
        if (hours == null) {
          hours = AC_parseHoursNumber_(item.defaultHours);
          source = 'Config_Scopes default hours';
        }
        if (hours == null) {
          hours = AC_parseHoursNumber_(item.effectiveHours);
          source = 'effective hours';
        }

        if (hours == null || !isFinite(Number(hours))) {
          missingHours.push({ slotKey:item.header || '', aliases:item.aliases || [], durationHeader:item.durationHeader || '' });
          continue;
        }

        total += Number(hours);
        contributing.push({ slotKey:item.header || '', aliases:item.aliases || [], hours:Number(hours), source:source });
      }

      if (!contributing.length) {
        noHoursResolved++;
        continue;
      }

      total = Math.round(total * 100) / 100;
      var currentRaw = row[idxTotalHours];
      var current = AC_parseHoursNumber_(currentRaw);
      var currentNormalized = current == null ? '' : String(Math.round(Number(current) * 100) / 100);
      var totalNormalized = String(total);

      if (currentNormalized === totalNormalized) continue;

      wouldWriteRows++;

      if (apply) {
        shPlan.getRange(r + 1, idxTotalHours + 1).setValue(total);
        writtenRows++;
      }

      if (rows.length < AC_MANUAL_REPAIR_SAMPLE_LIMIT) {
        rows.push({
          rowIndex:r + 1,
          auditId:auditId,
          company:AC_trim_(rowObj['Company'] || ''),
          location:AC_trim_(rowObj['Location'] || ''),
          oldTotalAuditTimeInHours: currentRaw === null || typeof currentRaw === 'undefined' ? '' : String(currentRaw),
          newTotalAuditTimeInHours: total,
          selectedScopeCount:selected.length,
          contributingScopeCount:contributing.length,
          missingHoursCount:missingHours.length,
          contributingScopes:contributing.slice(0, 5),
          missingHours:missingHours.slice(0, 5)
        });
      }
    }

    var result = {
      success:true,
      apply:!!apply,
      source:'Config_Scopes',
      scanned:values.length - 1,
      wouldWriteRows:wouldWriteRows,
      writtenRows:writtenRows,
      noSelectedScopes:noSelectedScopes,
      noHoursResolved:noHoursResolved,
      sampleRows:rows
    };
    AC_logDiagnosisResult_(result);
    return result;
  } catch (e) {
    return { success:false, message:String(e && e.message ? e.message : e) };
  }
}


/***********************************************************************
 * RUNTIME ONEDIT — RECALCULATE TOTAL AUDIT TIME + PLANNING WINDOW
 * Source of truth: Config_Scopes
 *
 * Purpose:
 * - When a scope X is added/removed in Audit planning, immediately recalculate
 *   Total audit time in hours.
 * - When a duration override is edited, immediately recalculate Total audit time.
 * - Scope changes can also affect Planning window from/to, so AS/AT are refreshed.
 *
 * Activation:
 * - Preferred: run AnnualCycleEngineV5_InstallOnEditTrigger() once.
 * - If your project already has a central onEdit(e), call AnnualCycleEngineV5_OnEdit(e)
 *   from that dispatcher instead of installing a separate trigger.
 ***********************************************************************/

function AnnualCycleEngineV5_InstallOnEditTrigger() {
  try {
    var ss = SpreadsheetApp.getActive();
    var triggers = ScriptApp.getProjectTriggers();
    var existing = false;
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction && triggers[i].getHandlerFunction() === 'AnnualCycleEngineV5_OnEdit') {
        existing = true;
        break;
      }
    }
    if (!existing) {
      ScriptApp.newTrigger('AnnualCycleEngineV5_OnEdit').forSpreadsheet(ss).onEdit().create();
    }
    return { success:true, installed:!existing, alreadyExisted:existing, handler:'AnnualCycleEngineV5_OnEdit' };
  } catch (e) {
    return { success:false, message:String(e && e.message ? e.message : e) };
  }
}

function AnnualCycleEngineV5_RemoveOnEditTrigger() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var removed = 0;
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction && triggers[i].getHandlerFunction() === 'AnnualCycleEngineV5_OnEdit') {
        ScriptApp.deleteTrigger(triggers[i]);
        removed++;
      }
    }
    return { success:true, removed:removed, handler:'AnnualCycleEngineV5_OnEdit' };
  } catch (e) {
    return { success:false, message:String(e && e.message ? e.message : e) };
  }
}

function AnnualCycleEngineV5_OnEdit(e) {
  try {
    if (!e || !e.range) return { success:true, skipped:true, reason:'NO_EVENT_RANGE' };
    var range = e.range;
    var sh = range.getSheet();
    if (!sh || sh.getName() !== AC_SHEET_AUDIT_PLANNING) return { success:true, skipped:true, reason:'NOT_AUDIT_PLANNING' };
    if (range.getRow() <= 1) return { success:true, skipped:true, reason:'HEADER_ROW' };
    if (range.getNumRows && range.getNumRows() !== 1) return AnnualCycleEngineV5_RecalculateRuntimeDerivedFieldsAll_DryRun();
    if (range.getNumColumns && range.getNumColumns() !== 1) return AnnualCycleEngineV5_RecalculateRuntimeDerivedFieldsAll_DryRun();

    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
      .map(function(h){ return String(h || '').trim(); });
    var colIndex0 = range.getColumn() - 1;
    var editedHeader = String(headers[colIndex0] || '').trim();

    if (!AC_isRuntimeDerivedFieldsTriggerHeader_(headers, editedHeader)) {
      return { success:true, skipped:true, reason:'NOT_SCOPE_OR_DURATION_OR_EXPIRY_FIELD', header:editedHeader };
    }

    return AnnualCycleEngineV5_RecalculateRuntimeDerivedFieldsForRowIndex_(sh, headers, range.getRow());
  } catch (err) {
    var result = { success:false, message:String(err && err.message ? err.message : err) };
    AC_logDiagnosisResult_(result);
    return result;
  }
}

function AnnualCycleEngineV5_RecalculateRuntimeDerivedFieldsAll_DryRun() {
  return AC_recalculateRuntimeDerivedFieldsAll_(false);
}

function AnnualCycleEngineV5_RecalculateRuntimeDerivedFieldsAll_Apply() {
  return AC_recalculateRuntimeDerivedFieldsAll_(true);
}

function AnnualCycleEngineV5_RecalculateRuntimeDerivedFieldsForAuditId(auditId) {
  try {
    auditId = AC_trim_(auditId);
    if (!auditId) return { success:false, message:'Missing auditId' };

    var ss = SpreadsheetApp.getActive();
    var shPlan = ss.getSheetByName(AC_SHEET_AUDIT_PLANNING);
    if (!shPlan) return { success:false, message:'Missing sheet: ' + AC_SHEET_AUDIT_PLANNING };

    var values = shPlan.getDataRange().getValues();
    if (!values || values.length < 2) return { success:false, message:'Audit planning empty' };

    var headers = values[0].map(function(h){ return String(h || '').trim(); });
    var idxAuditId = AC_findFirstIndex_(headers, ['Audit ID','Audit_ID','AuditId','auditId']);
    if (idxAuditId < 0) return { success:false, message:'Missing header: Audit ID / Audit_ID' };

    for (var r = 1; r < values.length; r++) {
      if (AC_trim_(values[r][idxAuditId]) === auditId) {
        return AnnualCycleEngineV5_RecalculateRuntimeDerivedFieldsForRowIndex_(shPlan, headers, r + 1);
      }
    }
    return { success:false, message:'Audit not found: ' + auditId };
  } catch (e) {
    return { success:false, message:String(e && e.message ? e.message : e) };
  }
}

function AnnualCycleEngineV5_RecalculateRuntimeDerivedFieldsForRowIndex(rowIndex) {
  try {
    var ss = SpreadsheetApp.getActive();
    var shPlan = ss.getSheetByName(AC_SHEET_AUDIT_PLANNING);
    if (!shPlan) return { success:false, message:'Missing sheet: ' + AC_SHEET_AUDIT_PLANNING };
    var headers = shPlan.getRange(1, 1, 1, shPlan.getLastColumn()).getValues()[0]
      .map(function(h){ return String(h || '').trim(); });
    return AnnualCycleEngineV5_RecalculateRuntimeDerivedFieldsForRowIndex_(shPlan, headers, Number(rowIndex || 0));
  } catch (e) {
    return { success:false, message:String(e && e.message ? e.message : e) };
  }
}

function AnnualCycleEngineV5_RecalculateRuntimeDerivedFieldsForRowIndex_(shPlan, headers, rowIndex) {
  try {
    if (!shPlan) return { success:false, message:'Missing sheet' };
    if (!rowIndex || rowIndex <= 1) return { success:false, message:'Invalid rowIndex' };
    headers = headers || shPlan.getRange(1, 1, 1, shPlan.getLastColumn()).getValues()[0]
      .map(function(h){ return String(h || '').trim(); });

    var row = shPlan.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
    var before = row.slice();
    var idxTotalHours = AC_findFirstIndex_(headers, ['Total audit time in hours','Total time in hours','Total hours','Required hours','Hours to be planned']);
    var idxAuditId = AC_findFirstIndex_(headers, ['Audit ID','Audit_ID','AuditId','auditId']);
    if (idxTotalHours < 0) return { success:false, message:'Missing header: Total audit time in hours' };

    var hoursInfo = AC_calculateTotalAuditHoursForRow_(headers, row);
    var totalWritten = false;
    var windowWritten = false;

    if (hoursInfo.success && hoursInfo.hasSelectedScopes && hoursInfo.hasResolvedHours) {
      var current = AC_parseHoursNumber_(before[idxTotalHours]);
      var currentNormalized = current == null ? '' : String(Math.round(Number(current) * 100) / 100);
      var newNormalized = String(hoursInfo.totalHours);
      if (currentNormalized !== newNormalized) {
        shPlan.getRange(rowIndex, idxTotalHours + 1).setValue(hoursInfo.totalHours);
        row[idxTotalHours] = hoursInfo.totalHours;
        totalWritten = true;
      }
    }

    var beforeAS = AC_cellToYmd_(AC_getHeaderValueByCandidates_(headers, before, ['Planning window from','AS']));
    var beforeAT = AC_cellToYmd_(AC_getHeaderValueByCandidates_(headers, before, ['Planning window to','AT']));
    AC_applyCentralPlanningWindow_(headers, row);
    var afterAS = AC_cellToYmd_(AC_getHeaderValueByCandidates_(headers, row, ['Planning window from','AS']));
    var afterAT = AC_cellToYmd_(AC_getHeaderValueByCandidates_(headers, row, ['Planning window to','AT']));

    if (beforeAS !== afterAS) {
      AC_forceTextDateByHeaderCandidates_(shPlan, headers, rowIndex, ['Planning window from','AS'], afterAS);
      windowWritten = true;
    }
    if (beforeAT !== afterAT) {
      AC_forceTextDateByHeaderCandidates_(shPlan, headers, rowIndex, ['Planning window to','AT'], afterAT);
      windowWritten = true;
    }

    var result = {
      success:true,
      source:'Config_Scopes',
      rowIndex:rowIndex,
      auditId:idxAuditId >= 0 ? AC_trim_(row[idxAuditId]) : '',
      totalHoursWritten:totalWritten,
      planningWindowWritten:windowWritten,
      totalHours:hoursInfo.totalHours,
      selectedScopeCount:hoursInfo.selectedScopeCount,
      contributingScopeCount:hoursInfo.contributingScopeCount,
      missingHoursCount:hoursInfo.missingHoursCount,
      planningWindowFrom:afterAS || '',
      planningWindowTo:afterAT || ''
    };
    AC_logDiagnosisResult_(result);
    return result;
  } catch (e) {
    return { success:false, message:String(e && e.message ? e.message : e) };
  }
}

function AC_recalculateRuntimeDerivedFieldsAll_(apply) {
  try {
    var ss = SpreadsheetApp.getActive();
    var shPlan = ss.getSheetByName(AC_SHEET_AUDIT_PLANNING);
    if (!shPlan) return { success:false, message:'Missing sheet: ' + AC_SHEET_AUDIT_PLANNING };

    var values = shPlan.getDataRange().getValues();
    if (!values || values.length < 2) return { success:true, apply:!!apply, scanned:0, wouldWriteRows:0, writtenRows:0, sampleRows:[] };

    var headers = values[0].map(function(h){ return String(h || '').trim(); });
    var idxTotalHours = AC_findFirstIndex_(headers, ['Total audit time in hours','Total time in hours','Total hours','Required hours','Hours to be planned']);
    var idxAuditId = AC_findFirstIndex_(headers, ['Audit ID','Audit_ID','AuditId','auditId']);
    if (idxTotalHours < 0) return { success:false, message:'Missing header: Total audit time in hours' };

    var rows = [];
    var wouldWriteRows = 0;
    var writtenRows = 0;
    var noSelectedScopes = 0;
    var noHoursResolved = 0;

    for (var r = 1; r < values.length; r++) {
      var row = values[r].slice();
      var original = values[r];
      var hoursInfo = AC_calculateTotalAuditHoursForRow_(headers, row);
      var changed = false;
      var actions = [];

      if (!hoursInfo.hasSelectedScopes) {
        noSelectedScopes++;
      } else if (!hoursInfo.hasResolvedHours) {
        noHoursResolved++;
      } else {
        var current = AC_parseHoursNumber_(original[idxTotalHours]);
        var currentNormalized = current == null ? '' : String(Math.round(Number(current) * 100) / 100);
        var newNormalized = String(hoursInfo.totalHours);
        if (currentNormalized !== newNormalized) {
          changed = true;
          actions.push('recalculate Total audit time in hours');
          row[idxTotalHours] = hoursInfo.totalHours;
        }
      }

      var beforeAS = AC_cellToYmd_(AC_getHeaderValueByCandidates_(headers, original, ['Planning window from','AS']));
      var beforeAT = AC_cellToYmd_(AC_getHeaderValueByCandidates_(headers, original, ['Planning window to','AT']));
      AC_applyCentralPlanningWindow_(headers, row);
      var afterAS = AC_cellToYmd_(AC_getHeaderValueByCandidates_(headers, row, ['Planning window from','AS']));
      var afterAT = AC_cellToYmd_(AC_getHeaderValueByCandidates_(headers, row, ['Planning window to','AT']));
      if (beforeAS !== afterAS) { changed = true; actions.push('recalculate Planning window from'); }
      if (beforeAT !== afterAT) { changed = true; actions.push('recalculate Planning window to'); }

      if (!changed) continue;
      wouldWriteRows++;

      if (apply) {
        if (hoursInfo.hasSelectedScopes && hoursInfo.hasResolvedHours) shPlan.getRange(r + 1, idxTotalHours + 1).setValue(hoursInfo.totalHours);
        if (beforeAS !== afterAS) AC_forceTextDateByHeaderCandidates_(shPlan, headers, r + 1, ['Planning window from','AS'], afterAS);
        if (beforeAT !== afterAT) AC_forceTextDateByHeaderCandidates_(shPlan, headers, r + 1, ['Planning window to','AT'], afterAT);
        writtenRows++;
      }

      if (rows.length < AC_MANUAL_REPAIR_SAMPLE_LIMIT) {
        rows.push({
          rowIndex:r + 1,
          auditId:idxAuditId >= 0 ? AC_trim_(row[idxAuditId]) : '',
          actions:actions,
          oldTotalAuditTimeInHours:String(original[idxTotalHours] == null ? '' : original[idxTotalHours]),
          newTotalAuditTimeInHours:hoursInfo.totalHours,
          selectedScopeCount:hoursInfo.selectedScopeCount,
          contributingScopeCount:hoursInfo.contributingScopeCount,
          missingHoursCount:hoursInfo.missingHoursCount,
          oldPlanningWindowFrom:beforeAS || '',
          newPlanningWindowFrom:afterAS || '',
          oldPlanningWindowTo:beforeAT || '',
          newPlanningWindowTo:afterAT || ''
        });
      }
    }

    var result = {
      success:true,
      apply:!!apply,
      source:'Config_Scopes',
      scanned:values.length - 1,
      wouldWriteRows:wouldWriteRows,
      writtenRows:writtenRows,
      noSelectedScopes:noSelectedScopes,
      noHoursResolved:noHoursResolved,
      sampleRows:rows
    };
    AC_logDiagnosisResult_(result);
    return result;
  } catch (e) {
    return { success:false, message:String(e && e.message ? e.message : e) };
  }
}

function AC_isRuntimeDerivedFieldsTriggerHeader_(headers, editedHeader) {
  editedHeader = String(editedHeader || '').trim();
  if (!editedHeader) return false;

  if (AC_isScopeSlotHeader_(editedHeader)) return true;
  if (AC_isDurationHeader_(headers, editedHeader)) return true;

  var directHeaders = {
    'Birthdate certificate': true,
    'Date - Will Expire': true,
    'Date – Will Expire': true,
    'Extended Expiration Date': true,
    'Extension applied': true
  };
  return !!directHeaders[editedHeader];
}

function AC_isScopeSlotHeader_(header) {
  var cfg = AC_loadConfigScopeMap_();
  return !!cfg[String(header || '').trim()];
}

function AC_isDurationHeader_(headers, editedHeader) {
  editedHeader = String(editedHeader || '').trim();
  if (!editedHeader) return false;
  var cfg = AC_loadConfigScopeMap_();
  for (var slotKey in cfg) {
    if (!cfg.hasOwnProperty(slotKey)) continue;
    var durationHeader = AC_findDurationHeaderForScope_(headers, slotKey);
    if (durationHeader && durationHeader === editedHeader) return true;
  }
  return false;
}

function AC_calculateTotalAuditHoursForRow_(headers, row) {
  var rowObj = AC_buildRowObject_(headers, row, 0);
  var selected = AC_getAllSelectedScopeSlotsForPlanningRow_(headers, rowObj);
  var total = 0;
  var contributing = [];
  var missingHours = [];

  for (var i = 0; i < selected.length; i++) {
    var item = selected[i] || {};
    var hours = AC_parseHoursNumber_(item.overrideHours);
    var source = 'Duration override';
    if (hours == null) {
      hours = AC_parseHoursNumber_(item.defaultHours);
      source = 'Config_Scopes default hours';
    }
    if (hours == null) {
      hours = AC_parseHoursNumber_(item.effectiveHours);
      source = 'effective hours';
    }

    if (hours == null || !isFinite(Number(hours))) {
      missingHours.push({ slotKey:item.header || '', aliases:item.aliases || [], durationHeader:item.durationHeader || '' });
      continue;
    }

    total += Number(hours);
    contributing.push({ slotKey:item.header || '', aliases:item.aliases || [], hours:Number(hours), source:source });
  }

  total = Math.round(total * 100) / 100;
  return {
    success:true,
    source:'Config_Scopes',
    hasSelectedScopes:selected.length > 0,
    hasResolvedHours:contributing.length > 0,
    totalHours:total,
    selectedScopeCount:selected.length,
    contributingScopeCount:contributing.length,
    missingHoursCount:missingHours.length,
    contributingScopes:contributing,
    missingHours:missingHours
  };
}
