// BUILD: AuditManagerToolsShared_20260426_ACTIVE_AUDITS_SCOPE_MANAGER
// Extracted from ManagerV5Tools.js without business-logic changes.
// Keep legacy m5t_* function names for compatibility.

function m5t_const_() {
  return {
    SHEETS: {
      COMPANIES: 'Companies',
      AUDIT_PLANNING: 'Audit planning',
      STANDARDS: 'Standards',
      LOG_REALIZED: 'Log realized audits',
      NOTIFICATION_QUEUE: 'Notification Queue'
    },
    // NOTE: Status values vary in your project. These are used only for detection and safe defaults.
    STATUS_DEFAULTS: {
      PENDING_PLANNING: 'Pending Planning'
    },
    WARNING: {
      FLAG_HEADERS: ['REQUIRES_REPLAN','Requires Replan','Replan Required','Warning Replan','Warning'],
      REASON_HEADERS: ['REQUIRES_REPLAN_REASON','Requires Replan Reason','Warning Reason','Reason']
    }
  };
}

function m5t_getSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Missing sheet: ' + name);
  return sh;
}

function m5t_readSheet_(sheet) {
  var values = sheet.getDataRange().getValues();
  var header = values.length ? values[0] : [];
  var rows = values.length > 1 ? values.slice(1) : [];
  return { header: header, rows: rows, headerMap: m5t_makeHeaderMap_(header) };
}

function m5t_makeHeaderMap_(headerRow) {
  var map = {};
  for (var i = 0; i < headerRow.length; i++) {
    var raw = String(headerRow[i] || '');
    var key = m5t_normHeader_(raw);
    if (!key) continue;
    if (map[key] === undefined) map[key] = i;
  }
  map.__raw = headerRow.map(function(h){ return String(h || ''); });
  return map;
}

function m5t_normHeader_(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s\-]/g, '');
}

function m5t_pickHeader_(headerMap, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var key = m5t_normHeader_(candidates[i]);
    if (headerMap[key] !== undefined) return headerMap[key];
  }
  return -1;
}

function m5t_findHeaderExact_(headerMap, exactHeaderText) {
  var raw = headerMap.__raw || [];
  var target = String(exactHeaderText || '').trim().toLowerCase();
  for (var i = 0; i < raw.length; i++) {
    if (String(raw[i] || '').trim().toLowerCase() === target) return i;
  }
  return -1;
}

function m5t_findDurationHeader_(headerMap, scopeName) {
  var raw = headerMap.__raw || [];
  var scope = String(scopeName || '').trim().toLowerCase();
  for (var i = 0; i < raw.length; i++) {
    var h = String(raw[i] || '').trim().toLowerCase();
    if (h.indexOf('duration') === 0 && h.indexOf(scope) >= 0) return i;
  }
  return -1;
}

function m5t_toNumberOrNull_(v) {
  if (v === null || v === '' || typeof v === 'undefined') return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}
function m5t_toNumberOrZero_(v) {
  var n = Number(v);
  return isNaN(n) ? 0 : n;
}
function m5t_toIntOrNull_(v) {
  if (v === null || v === '' || typeof v === 'undefined') return null;
  var n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function m5t_yearFromDateCell_(cell) {
  if (!cell) return null;
  if (Object.prototype.toString.call(cell) === '[object Date]') return cell.getFullYear();
  var s = String(cell).trim();
  var m = s.match(/^(\d{4})[-\/]/);
  if (m) return parseInt(m[1], 10);
  return null;
}

function m5t_consecutiveEndingAtLatest_(yearsSortedAsc) {
  if (!yearsSortedAsc || yearsSortedAsc.length === 0) return 0;
  var streak = 1;
  for (var i = yearsSortedAsc.length - 1; i > 0; i--) {
    if (yearsSortedAsc[i] - yearsSortedAsc[i-1] === 1) streak++;
    else break;
  }
  return streak;
}

function m5t_rotationConsecutiveForAuditorFromOwners_(ownersByYear, auditor, maxYearExclusive) {
  var target = String(auditor || '').trim().toLowerCase();
  if (!target || !ownersByYear) return 0;

  var years = Object.keys(ownersByYear)
    .map(function(y){ return parseInt(y, 10); })
    .filter(function(n){ return !isNaN(n) && (!maxYearExclusive || n < maxYearExclusive); })
    .sort(function(a,b){ return b-a; });

  var count = 0;
  for (var i = 0; i < years.length; i++) {
    var owners = ownersByYear[years[i]] || {};
    if (!owners[target]) break;
    count++;
    for (var other in owners) {
      if (owners.hasOwnProperty(other) && other !== target) return count;
    }
  }
  return count;
}

/**
 * Locked status detection (supports both V5 title-case and older uppercase).
 */
function m5t_isLockedStatus_(status) {
  var s = String(status || '').trim();
  var u = s.toUpperCase();
  return (
    u === 'PENDING_APPROVAL' || u === 'APPROVED' || u === 'ACCEPTED' ||
    s === 'Pending Approval' || s === 'Approved' || s === 'Accepted'
  );
}

/**
 * Active audit row selection rule (deterministic):
 * Priority: Pending Planning > Denied > Pending Approval > Approved > Accepted
 * Tie-break: latest plan window start (if exists) else last row.
 */
function m5t_selectActiveAuditRow_(matches, headerMap) {
  var statusCol = m5t_pickHeader_(headerMap, ['Status','STATUS']);
  var planFromCol = m5t_pickHeader_(headerMap, ['Plan van','Plan from','Planning window start','PlanningWindowStart','PlanWindowFrom']);

  var prio = {
    'PENDING PLANNING': 0,
    'PENDING_PLANNING': 0,
    'PENDINGPLANNING': 0,
    'PENDING PLANNING ': 0,
    'DENIED': 1,
    'PENDING APPROVAL': 2,
    'PENDING_APPROVAL': 2,
    'APPROVED': 3,
    'ACCEPTED': 4
  };

  var scored = matches.map(function(m){
    var st = statusCol >= 0 ? String(m.row[statusCol] || '').trim() : '';
    var key = st.toUpperCase().replace(/\s+/g, ' ');
    var p = (prio[key] !== undefined) ? prio[key] : 9;

    var t = 0;
    if (planFromCol >= 0) {
      var d = m.row[planFromCol];
      if (Object.prototype.toString.call(d) === '[object Date]') t = d.getTime();
      else {
        var y = m5t_yearFromDateCell_(d);
        if (y) t = new Date(y,0,1).getTime();
      }
    }
    return { rowIndex1: m.rowIndex1, row: m.row, _p: p, _t: t };
  });

  scored.sort(function(a,b){
    if (a._p !== b._p) return a._p - b._p;
    if (a._t !== b._t) return b._t - a._t;
    return b.rowIndex1 - a.rowIndex1;
  });

  return { rowIndex1: scored[0].rowIndex1, row: scored[0].row };
}

function m5t_activeAuditsHeaderCandidates_() {
  return ['Active Audits','Active audits','Active audit','ActiveAudit','Active_Audits','ACTIVE_AUDITS'];
}

function m5t_pickActiveAuditsCol_(headerMap) {
  var col = m5t_pickHeader_(headerMap, m5t_activeAuditsHeaderCandidates_());
  if (col >= 0) return col;

  // Historical Companies column S fallback (1-based S = zero-based 18).
  // This is only used when the header text is unavailable/mismatched.
  var raw = headerMap && headerMap.__raw ? headerMap.__raw : [];
  if (raw && raw.length >= 19) return 18;
  return -1;
}

function m5t_isActiveAuditsYes_(v) {
  var s = String(v || '').trim().toLowerCase();
  return s === 'yes' || s === 'y' || s === 'true' || s === '1' || s === 'active';
}

function m5t_listCompaniesPool_(ss) {
  var sh = m5t_getSheet_(ss, m5t_const_().SHEETS.COMPANIES);
  var data = m5t_readSheet_(sh);
  var hdr = data.headerMap;

  var uidCol = m5t_pickHeader_(hdr, ['Company_UID','Company UID','CompanyUID','COMPANY_UID','UID']);
  var nameCol = m5t_pickHeader_(hdr, ['Company','Company name','Name','Bedrijf','COMPANY']);
  var activeAuditsCol = m5t_pickActiveAuditsCol_(hdr);
  if (uidCol < 0 || nameCol < 0) throw new Error('Companies sheet missing headers (need Company_UID + Company/Name)');

  var out = [];
  data.rows.forEach(function(r){
    var uid = String(r[uidCol] || '').trim();
    var nm = String(r[nameCol] || '').trim();
    if (!uid || !nm) return;
    var activeRaw = activeAuditsCol >= 0 ? String(r[activeAuditsCol] || '').trim() : '';
    out.push({
      companyUid: uid,
      companyName: nm,
      activeAudits: activeRaw,
      activeAuditsYes: m5t_isActiveAuditsYes_(activeRaw)
    });
  });
  out.sort(function(a,b){ return a.companyName.localeCompare(b.companyName); });
  return out;
}

function m5t_setCompanyActiveAudits_(ss, companyUid, value) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  companyUid = String(companyUid || '').trim();
  value = String(value || '').trim();
  if (!companyUid) return { ok:false, error:'MISSING_COMPANY_UID' };

  var sh = m5t_getSheet_(ss, m5t_const_().SHEETS.COMPANIES);
  var data = m5t_readSheet_(sh);
  var hdr = data.headerMap;
  var uidCol = m5t_pickHeader_(hdr, ['Company_UID','Company UID','CompanyUID','COMPANY_UID','UID']);
  var activeAuditsCol = m5t_pickActiveAuditsCol_(hdr);
  if (uidCol < 0) return { ok:false, error:'COMPANIES_MISSING_COMPANY_UID' };
  if (activeAuditsCol < 0) return { ok:false, error:'COMPANIES_MISSING_ACTIVE_AUDITS' };

  for (var i = 0; i < data.rows.length; i++) {
    var uid = String(data.rows[i][uidCol] || '').trim();
    if (uid !== companyUid) continue;
    sh.getRange(i + 2, activeAuditsCol + 1).setValue(value);
    try { if (typeof CompaniesIndex_ClearCache === 'function') CompaniesIndex_ClearCache(); } catch (eCache) {}
    return { ok:true, rowIndex1:i + 2, value:value };
  }
  return { ok:false, error:'COMPANY_UID_NOT_FOUND', companyUid:companyUid };
}

function m5t_listStandardsScopes_(ss) {
  var sh = m5t_getSheet_(ss, m5t_const_().SHEETS.STANDARDS);
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];
  // Spec: A=scope name, C=max consecutive, D=default audit hours
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    var row = vals[i];
    var scope = String(row[0] || '').trim();
    if (!scope) continue;
    var maxConsecutive = m5t_toIntOrNull_(row[2]);
    var defaultHours = m5t_toNumberOrZero_(row[3]);
    out.push({ scope: scope, defaultHours: defaultHours, maxConsecutive: maxConsecutive });
  }
  return out;
}

function m5t_setWarning_(headerMap, rowValues, flagOn, reason) {
  var c = m5t_const_();
  var flagCol = m5t_pickHeader_(headerMap, c.WARNING.FLAG_HEADERS);
  var reasonCol = m5t_pickHeader_(headerMap, c.WARNING.REASON_HEADERS);
  if (flagCol >= 0) rowValues[flagCol] = flagOn ? 'YES' : '';
  if (reasonCol >= 0) rowValues[reasonCol] = flagOn ? String(reason || '') : '';
}

/**
 * Minimal Notification Queue enqueue (idempotent by key).
 * If sheet/columns missing -> does nothing (no regression).
 */
function m5t_enqueueScopeReplanNotification_(ss, info) {
  var sh = ss.getSheetByName(m5t_const_().SHEETS.NOTIFICATION_QUEUE);
  if (!sh) return;

  var data = m5t_readSheet_(sh);
  var hdr = data.headerMap;

  var eventCol = m5t_pickHeader_(hdr, ['EventType','eventType','Type']);
  var toCol = m5t_pickHeader_(hdr, ['To','Recipient','RecipientEmail','Email']);
  var subjCol = m5t_pickHeader_(hdr, ['Subject','SUBJECT']);
  var bodyCol = m5t_pickHeader_(hdr, ['Body','BODY','Message']);
  var keyCol = m5t_pickHeader_(hdr, ['IdempotencyKey','Key','IDEMPOTENCY_KEY']);
  var tsCol = m5t_pickHeader_(hdr, ['Created','CreatedAt','Timestamp','TS']);

  if (eventCol < 0 || toCol < 0 || subjCol < 0 || bodyCol < 0 || keyCol < 0) return;

  var eventType = 'SCOPE_CHANGE_REPLAN_REQUIRED';
  var idKey = [String(info.companyUid || ''), String(info.auditRowIndex1 || ''), String(info.totalHours || ''), eventType].join('|');

  // idempotency: if key exists -> skip
  var keys = data.rows.map(function(r){ return String(r[keyCol] || ''); });
  if (keys.indexOf(idKey) >= 0) return;

  var subj = 'Scope change requires replanning – ' + (info.companyName || '');
  var body = [
    'Company: ' + (info.companyName || ''),
    'Company_UID: ' + (info.companyUid || ''),
    'AuditPlanningRow: ' + (info.auditRowIndex1 || ''),
    'Status: ' + (info.status || ''),
    'TotalHours: ' + (info.totalHours || ''),
    '',
    'Scopes/hours changed while audit is in a locked/planned state. Review planning; replanning may be required.'
  ].join('\n');

  var row = new Array(data.header.length);
  for (var i = 0; i < row.length; i++) row[i] = '';
  row[eventCol] = eventType;
  row[toCol] = 'MANAGER';
  row[subjCol] = subj;
  row[bodyCol] = body;
  row[keyCol] = idKey;
  if (tsCol >= 0) row[tsCol] = new Date();

  sh.appendRow(row);
}

/**
 * Create an Audit planning row for a company from Companies pool.
 * Reuses legacy Audit ID generator when possible.
 *
 * Writes:
 *  - Company_UID (if column exists)
 *  - Company
 *  - Status (only if Status column exists) = "Pending Planning" (legacy title-case default)
 *  - Audit ID (only if column exists) generated immediately
 */
function m5t_createAuditRowFromCompaniesPool_(companyUid, companyName) {
  companyUid = String(companyUid || '').trim();
  companyName = String(companyName || '').trim();
  if (!companyUid) return { success: false, error: 'MISSING_COMPANY_UID' };

  var ss = SpreadsheetApp.getActive();
  var apSheet = ss.getSheetByName('Audit planning');
  if (!apSheet) return { success: false, error: 'MISSING_AUDIT_PLANNING_SHEET' };

  var apHdr = apSheet.getRange(1, 1, 1, apSheet.getLastColumn()).getValues()[0];
  var apMap = _ms_headerMap_(apHdr); // legacy header map uses exact names

  var newRowIdx = apSheet.getLastRow() + 1;
  var row = new Array(apHdr.length);
  for (var i = 0; i < row.length; i++) row[i] = '';

  // Company_UID (if exists)
  if (apMap['Company_UID'] != null) row[apMap['Company_UID']] = companyUid;

  // Company (required)
  if (apMap['Company'] != null) row[apMap['Company']] = companyName || companyUid;

  // Status default (only if column exists)
  if (apMap['Status'] != null) row[apMap['Status']] = m5t_const_().STATUS_DEFAULTS.PENDING_PLANNING;

  apSheet.getRange(newRowIdx, 1, 1, row.length).setValues([row]);

  // Generate Audit ID immediately when possible (legacy)
  var auditId = _ms_generateAuditIdForRow_(apSheet, newRowIdx, apMap);

  return {
    success: true,
    rowIndex: newRowIdx,
    auditId: auditId,
    status: (apMap['Status'] != null) ? m5t_const_().STATUS_DEFAULTS.PENDING_PLANNING : ''
  };
}

// ============================================================
// LEGACY BLOCK: ManageScopesV5.gs (embedded unchanged where possible)
// ============================================================

/**
 * ManageScopesV5.gs — V5.4 (LEGACY EMBEDDED)
 *
 * Backend for Manager "Manage Scopes" UI.
 *
 * - Sheet "Companies" is the single source of truth for companies (pool).
 * - Sheet "Audit planning" contains concrete audit rows.
 *
 * Responsibilities:
 *  - getManageScopesOverview():
 *      returns per company whether it already has audits in Audit planning,
 *      and how many.
 *  - manageScopesCreateAudit(companyName, location, year):
 *      appends a new audit row in Audit planning with:
 *          Status   = "Pending Planning"
 *          Audit ID = generated immediately in column 'Audit ID'
 *      and ensures the company exists in sheet "Companies".
 */

/**
 * OVERVIEW: number of audits per company in Audit planning.
 */
function m5t_listExistingAuditCompanies_(ss) {
  // Functional rule 2026-04-26:
  // Companies!S "Active Audits" is the explicit business truth for Scope Manager buckets.
  // YES = Existing companies. NO/blank = New companies.
  return m5t_listCompaniesPool_(ss).filter(function(c){
    return !!(c && c.activeAuditsYes);
  }).map(function(c){
    return {
      companyUid: c.companyUid,
      companyName: c.companyName,
      activeAudits: c.activeAudits || 'Yes'
    };
  });
}

function m5t_listNewCompaniesPool_(ss) {
  // Functional rule 2026-04-26:
  // Do not infer "existing" from Audit planning rows. Use Companies!S only.
  return m5t_listCompaniesPool_(ss).filter(function(c){
    return !(c && c.activeAuditsYes);
  }).map(function(c){
    return {
      companyUid: c.companyUid,
      companyName: c.companyName,
      activeAudits: c.activeAudits || ''
    };
  });
}

function m5t_normDateText_(v) {
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    var y = v.getFullYear();
    var m = ('0' + (v.getMonth() + 1)).slice(-2);
    var d = ('0' + v.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }
  var s = String(v).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var m1 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m1) return m1[3] + '-' + ('0'+m1[2]).slice(-2) + '-' + ('0'+m1[1]).slice(-2);
  var m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) return m2[3] + '-' + ('0'+m2[2]).slice(-2) + '-' + ('0'+m2[1]).slice(-2);
  return '';
}

function m5t_yearEndText_() {
  var now = new Date();
  return now.getFullYear() + '-12-31';
}

function m5t_getAuditorDirectory_(ss) {
  var sh = ss.getSheetByName('Auditors');
  var out = { byEmail: {}, list: [] };
  if (!sh) return out;
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return out;
  var hm = m5t_makeHeaderMap_(data[0]);
  var nameCol = m5t_pickHeader_(hm, ['Name','Auditor','Auditor name']);
  var emailCol = m5t_pickHeader_(hm, ['E-mail','Email','E mail','Auditor email','Auditor_Email']);
  var activeCol = m5t_pickHeader_(hm, ['Active']);
  var roleCol = m5t_pickHeader_(hm, ['Role']);
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var email = emailCol >= 0 ? String(row[emailCol] || '').trim().toLowerCase() : '';
    if (!email) continue;
    var role = roleCol >= 0 ? String(row[roleCol] || '').trim().toLowerCase() : '';
    var active = activeCol >= 0 ? String(row[activeCol] || '').trim().toUpperCase() : 'YES';
    if (role && role !== 'auditor') continue;
    if (active && active !== 'YES' && active !== 'TRUE' && active !== '1') continue;
    var item = {
      email: email,
      name: nameCol >= 0 ? String(row[nameCol] || '').trim() : email,
      row: row,
      hm: hm
    };
    out.byEmail[email] = item;
    out.list.push(item);
  }
  return out;
}

function m5t_resolveAuditorEmail_(ss, raw) {
  var s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  if (s.indexOf('@') > 0) return s;
  var dir = m5t_getAuditorDirectory_(ss);
  for (var i = 0; i < dir.list.length; i++) {
    if (String(dir.list[i].name || '').trim().toLowerCase() === s) return dir.list[i].email;
  }
  return '';
}

function m5t_companyNameByUid_(ss, companyUid) {
  var list = m5t_listCompaniesPool_(ss);
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].companyUid || '').trim() === String(companyUid || '').trim()) return list[i].companyName || '';
  }
  return '';
}

function m5t_syncAvailabilityForUpsertSafe_(ctx) {
  ctx = ctx || {};
  try {
    var ap = ctx.apSheet || null;
    var rowIndex1 = Number(ctx.rowIndex1 || 0);
    var header = ctx.header || [];
    var rowValues = ctx.rowValues || [];
    var status = String(ctx.status || '').trim();
    var enabledCount = Number(ctx.enabledCount || 0);

    if (!ap || rowIndex1 < 2 || !header.length) return { ok: true, skipped: true, reason: 'NO_CONTEXT' };

    var hm = m5t_makeHeaderMap_(header);
    var auditIdCol = m5t_pickHeader_(hm, ['Audit ID','AuditId','auditId']);
    var planningJsonCol = m5t_pickHeader_(hm, ['Planning JSON','PlanningJson']);
    var datePlannedCol = m5t_pickHeader_(hm, ['Date - Planned','Date planned','Planned date']);

    var auditId = auditIdCol >= 0 ? String(rowValues[auditIdCol] || '').trim() : '';
    var planningJson = planningJsonCol >= 0 ? String(rowValues[planningJsonCol] || '').trim() : '';
    var datePlanned = datePlannedCol >= 0 ? String(rowValues[datePlannedCol] || '').trim() : '';
    var hasPlanning = !!planningJson || !!datePlanned;

    if (!auditId) return { ok: true, skipped: true, reason: 'NO_AUDIT_ID' };
    if (!m5t_isLockedStatus_(status)) return { ok: true, skipped: true, reason: 'STATUS_NOT_LOCKED' };
    if (!hasPlanning) return { ok: true, skipped: true, reason: 'NO_PLANNING_ON_ROW' };
    if (enabledCount > 0) return { ok: true, skipped: true, reason: 'NO_AVAILABILITY_CHANGE_REQUIRED' };

    if (typeof managerV5_releaseAvailability_ === 'function') {
      return managerV5_releaseAvailability_(auditId, {});
    }
    if (typeof V5_availabilityClearAuditId_ === 'function') {
      return V5_availabilityClearAuditId_(auditId);
    }

    return { ok: true, skipped: true, reason: 'NO_RELEASE_HELPER_AVAILABLE' };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}


// ============================================================
// FINAL OVERRIDE BLOCK — 2026-04-14-ALIAS
// Purpose:
// - Qualification must NEVER use SCOPE_01 / SCOPE_02 ... as auditor headers
// - Qualification must use canonical scope display names from Config_Scopes
// - Legacy typo support included for Florimark Tracecert / Tracecert
// - Email remains the only auditor identifier
// ============================================================

