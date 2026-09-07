// =====================================================
// ToolkitCacheAdmin.gs
// BUILD: TOOLKIT_CACHE_ADMIN_HARD_REFRESH_R3_AUDIT_PLANNING_ROW_CACHE_20260527
// DEZE IS BEDOELD VOOR MIJ OM NA AANPASSEN VAN DATA IN AUDIT PLANNING SNELLER DE WIJZIGINGEN TE ZIEN IN PLANNING TOOLKIT
// Purpose:
// - Manual admin-only hard refresh for Planning Toolkit stale data.
// - Keeps normal runtime cache/TTL behavior unchanged.
// - Adds Audit planning row-index / persist-cache invalidation coverage.
//
// Use:
//   RUN_TOOLKIT_HARD_REFRESH_CACHES_R3()
//   RUN_TOOLKIT_HARD_REFRESH_FOR_AUDIT_R3('AUDIT_ID_HERE')
//   RUN_TOOLKIT_REQUIRED_HOURS_DIAG_R3('AUDIT_ID_HERE')
//
// Notes:
// - This file does NOT change toolkit hot path behavior.
// - Browser popup/in-memory state still requires closing and reopening Toolkit.
// =====================================================

var TOOLKIT_CACHE_ADMIN_R3_BUILD = 'TOOLKIT_CACHE_ADMIN_HARD_REFRESH_R3_AUDIT_PLANNING_ROW_CACHE_20260527';

function RUN_TOOLKIT_HARD_REFRESH_CACHES_R3() {
  return ToolkitCacheAdmin_R3_hardRefresh_({ auditId: '' });
}

function RUN_TOOLKIT_HARD_REFRESH_FOR_AUDIT_R3(auditId) {
  return ToolkitCacheAdmin_R3_hardRefresh_({ auditId: String(auditId || '').trim() });
}

function ToolkitCacheAdmin_R3_hardRefresh_(opts) {
  opts = opts || {};
  var auditId = String(opts.auditId || '').trim();
  var startedAt = new Date();
  var out = {
    ok: true,
    build: TOOLKIT_CACHE_ADMIN_R3_BUILD,
    auditId: auditId,
    startedAt: startedAt.toISOString(),
    finishedAt: '',
    steps: []
  };

  function step_(name, fn) {
    var item = { name: name, ok: false, skipped: false, message: '', error: '' };
    try {
      var res = fn();
      if (res && res.__skip === true) {
        item.ok = true;
        item.skipped = true;
        item.message = res.message || 'Skipped.';
      } else {
        item.ok = true;
        item.message = ToolkitCacheAdmin_R3_toMessage_(res);
      }
    } catch (e) {
      item.ok = false;
      item.error = String(e && e.message ? e.message : e);
      out.ok = false;
    }
    out.steps.push(item);
    return item;
  }

  step_('Audit planning exec/row-index cache invalidation', function () {
    var msgs = [];

    if (typeof __mp_invalidateAuditPlanningPack_ === 'function') {
      msgs.push('__mp_invalidateAuditPlanningPack_=' + ToolkitCacheAdmin_R3_toMessage_(__mp_invalidateAuditPlanningPack_()));
    } else {
      msgs.push('__mp_invalidateAuditPlanningPack_=MISSING');
    }

    if (typeof __mp_invalidatePersistCaches_ === 'function') {
      msgs.push('__mp_invalidatePersistCaches_=' + ToolkitCacheAdmin_R3_toMessage_(__mp_invalidatePersistCaches_(['Audit planning', 'Auditors', 'Companies', 'Config_Scopes'])));
    } else {
      msgs.push('__mp_invalidatePersistCaches_=MISSING');
    }

    if (typeof AuditPlanningRowIndexCache_Clear === 'function') {
      msgs.push('AuditPlanningRowIndexCache_Clear=' + ToolkitCacheAdmin_R3_toMessage_(AuditPlanningRowIndexCache_Clear()));
    }
    if (typeof AuditPlanningRowIndex_ClearCache === 'function') {
      msgs.push('AuditPlanningRowIndex_ClearCache=' + ToolkitCacheAdmin_R3_toMessage_(AuditPlanningRowIndex_ClearCache()));
    }
    if (typeof RUN_AUDIT_PLANNING_ROW_INDEX_CLEAR === 'function') {
      msgs.push('RUN_AUDIT_PLANNING_ROW_INDEX_CLEAR=' + ToolkitCacheAdmin_R3_toMessage_(RUN_AUDIT_PLANNING_ROW_INDEX_CLEAR()));
    }

    return msgs.join(' | ');
  });

  step_('ScriptCache remove known toolkit/open/persist keys', function () {
    var keys = ToolkitCacheAdmin_R3_knownScriptKeys_(auditId);
    if (keys.length) CacheService.getScriptCache().removeAll(keys);
    return 'Removed ' + keys.length + ' known ScriptCache keys.';
  });

  step_('Open cache invalidation for auditId', function () {
    if (!auditId) return { __skip: true, message: 'No auditId supplied.' };
    var msgs = [];
    if (typeof _mp_open_cacheInvalidate_ === 'function') {
      msgs.push('_mp_open_cacheInvalidate_=' + ToolkitCacheAdmin_R3_toMessage_(_mp_open_cacheInvalidate_(auditId)));
    } else {
      msgs.push('_mp_open_cacheInvalidate_=MISSING');
    }
    if (typeof _mp_aud_cacheInvalidate_ === 'function') {
      msgs.push('_mp_aud_cacheInvalidate_=' + ToolkitCacheAdmin_R3_toMessage_(_mp_aud_cacheInvalidate_(auditId)));
    }
    if (typeof elig_cacheInvalidate_ === 'function') {
      msgs.push('elig_cacheInvalidate_=' + ToolkitCacheAdmin_R3_toMessage_(elig_cacheInvalidate_({ auditId: auditId })));
    }
    return msgs.join(' | ');
  });

  step_('AUDIT_CACHE namespaces', function () {
    if (typeof AUDIT_CACHE === 'undefined' || !AUDIT_CACHE || typeof AUDIT_CACHE.removeNamespace !== 'function') {
      return { __skip: true, message: 'AUDIT_CACHE.removeNamespace not present.' };
    }
    var namespaces = [
      'manager',
      'manager_tools',
      'planning',
      'mp_readonly_audit_planning_sheet',
      'mp_readonly_companies_sheet',
      'mp_readonly_auditors_sheet',
      'mp_readonly_config_scopes_sheet',
      'mp_readonly_log_realized_audits_sheet',
      'companies_index',
      'toolkit_company_context'
    ];
    var msgs = [];
    namespaces.forEach(function (ns) {
      try { msgs.push(ns + '=' + ToolkitCacheAdmin_R3_toMessage_(AUDIT_CACHE.removeNamespace(ns))); } catch (e) { msgs.push(ns + '=ERR:' + e); }
    });
    return msgs.join(' | ');
  });

  step_('Known cache helper functions', function () {
    var fns = [
      'CompaniesIndex_ClearCache',
      'TEC_ClearAllCaches',
      'MP_ClearOpenCacheStore',
      'ToolkitAvailabilityMonth_ClearCaches',
      'TDM_ClearAllCaches',
      'MP_OpenCache_ClearAll',
      'MP_OpenCacheStore_ClearAll'
    ];
    var msgs = [];
    fns.forEach(function (name) {
      try {
        if (typeof this[name] === 'function') msgs.push(name + '=' + ToolkitCacheAdmin_R3_toMessage_(this[name]()));
        else msgs.push(name + '=MISSING');
      } catch (e) {
        msgs.push(name + '=ERR:' + String(e && e.message ? e.message : e));
      }
    }, this);
    return msgs.join(' | ');
  });

  step_('Clear known sheet-backed cache tabs', function () {
    var ss = ToolkitCacheAdmin_R3_getSs_();
    var names = [
      'MP_OpenCache_Store',
      'MP_CalCache_Store',
      'Eligibility_Cache',
      'MP_PersistCache_Store',
      'MP_Persist_Cache',
      'AuditPlanningRowIndex_Cache',
      'Audit_Planning_RowIndex_Cache',
      'AuditPlanning_Row_Index_Cache'
    ];
    var msgs = [];
    names.forEach(function (name) {
      var sh = ss.getSheetByName(name);
      if (!sh) {
        msgs.push(name + '=missing');
        return;
      }
      var rows = Math.max(0, sh.getLastRow() - 1);
      var cols = Math.max(1, sh.getLastColumn());
      if (rows > 0) sh.getRange(2, 1, rows, cols).clearContent();
      msgs.push(name + ' rows=' + rows);
    });
    return msgs.join('; ');
  });

  step_('Post-clear direct Audit planning read check', function () {
    if (!auditId) return { __skip: true, message: 'No auditId supplied.' };
    return RUN_TOOLKIT_REQUIRED_HOURS_DIAG_R3(auditId);
  });

  step_('Admin note', function () {
    return 'Close the Planning Toolkit popup/browser tab and reopen. Server-side caches were cleared; browser JS state cannot be cleared from Apps Script.';
  });

  out.finishedAt = new Date().toISOString();
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_TOOLKIT_REQUIRED_HOURS_DIAG_R3(auditId) {
  auditId = String(auditId || '').trim();
  if (!auditId) return { ok: false, message: 'Missing auditId' };

  var ss = ToolkitCacheAdmin_R3_getSs_();
  var sh = ss.getSheetByName('Audit planning');
  if (!sh) return { ok: false, message: "Missing sheet 'Audit planning'" };

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return { ok: false, message: 'Audit planning has no data rows' };

  var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  var cAuditId = ToolkitCacheAdmin_R3_findCol_(hdr, ['Audit ID']);
  var cHours = ToolkitCacheAdmin_R3_findColContains_(hdr, ['total audit time in hours', 'total time in hours', 'required hours', 'total hours']);
  var cCompany = ToolkitCacheAdmin_R3_findCol_(hdr, ['Company']);
  var cStatus = ToolkitCacheAdmin_R3_findCol_(hdr, ['Status']);
  var cPlanningJson = ToolkitCacheAdmin_R3_findCol_(hdr, ['Planning JSON', 'PlanningJSON']);

  if (cAuditId < 0) return { ok: false, message: "Missing 'Audit ID' column" };

  var ids = sh.getRange(2, cAuditId + 1, lastRow - 1, 1).getValues();
  var rowNumber = 0;
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || '').trim() === auditId) {
      rowNumber = i + 2;
      break;
    }
  }
  if (!rowNumber) return { ok: false, message: 'Audit not found: ' + auditId };

  var row = sh.getRange(rowNumber, 1, 1, lastCol).getValues()[0] || [];
  var rawHours = cHours >= 0 ? row[cHours] : '';
  var parsedHours = '';
  if (typeof rawHours === 'number') parsedHours = rawHours;
  else if (rawHours !== null && rawHours !== '' && !isNaN(Number(rawHours))) parsedHours = Number(rawHours);

  var openFastForced = null;
  try {
    if (typeof getToolkitOpenFastV5 === 'function') {
      openFastForced = getToolkitOpenFastV5(auditId, '', { forceFresh: true, withCalendar: false });
    }
  } catch (eOpen) {
    openFastForced = { success: false, message: String(eOpen && eOpen.message ? eOpen.message : eOpen) };
  }

  var out = {
    ok: true,
    build: TOOLKIT_CACHE_ADMIN_R3_BUILD,
    auditId: auditId,
    rowNumber: rowNumber,
    company: cCompany >= 0 ? String(row[cCompany] || '').trim() : '',
    status: cStatus >= 0 ? String(row[cStatus] || '').trim() : '',
    requiredHoursHeaderIndex1Based: cHours >= 0 ? cHours + 1 : 0,
    requiredHoursHeader: cHours >= 0 ? String(hdr[cHours] || '') : '',
    requiredHoursRaw: rawHours,
    requiredHoursParsed: parsedHours,
    planningJsonPresent: cPlanningJson >= 0 ? !!String(row[cPlanningJson] || '').trim() : false,
    openFastForceFreshSuccess: !!(openFastForced && openFastForced.success),
    openFastForceFreshRequiredHours: (openFastForced && openFastForced.audit) ? openFastForced.audit.requiredHours : '',
    openFastForceFreshCacheHit: !!(openFastForced && openFastForced.__cacheHit),
    openFastForceFreshCacheTier: openFastForced && openFastForced.__cacheTier ? openFastForced.__cacheTier : '',
    openFastForceFreshMessage: openFastForced && openFastForced.message ? openFastForced.message : ''
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function ToolkitCacheAdmin_R3_getSs_() {
  try {
    var id = String(PropertiesService.getScriptProperties().getProperty('V5_SSOT_SPREADSHEET_ID') || '').trim();
    if (id) return SpreadsheetApp.openById(id);
  } catch (e) {}
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No active spreadsheet and V5_SSOT_SPREADSHEET_ID not configured.');
  return ss;
}

function ToolkitCacheAdmin_R3_knownScriptKeys_(auditId) {
  auditId = String(auditId || '').trim();
  var keys = [
    'MP_COMPANY_CONSTRAINTS',
    'MP_OPEN_CACHE',
    'ELIGIBILITY_CACHE',
    'AUDIT_PLANNING_PACK',
    'MP_PERSIST::Audit planning',
    'MP_PERSIST::Auditors',
    'MP_PERSIST::Companies',
    'MP_PERSIST::Config_Scopes',
    'MP_PERSIST::manager::single_grid_open_v1'
    ];

  if (auditId) {
    keys.push('MP_OPEN_FAST_V5::s1::' + auditId);
    keys.push('MP_OPEN_FAST_V5::s2::' + auditId);
    keys.push('MP_OPEN_FAST_V5_R23B::' + auditId);
    keys.push('MP_OPEN_FAST_V5_ROUTES::s1::' + auditId);
    keys.push('MP_OPEN_FAST_V5_ROUTES::s2::' + auditId);
    try {
      if (typeof _mp_open_cacheKey_ === 'function') keys.push(_mp_open_cacheKey_(auditId));
    } catch (e1) {}
  }

  var seen = {};
  return keys.filter(function (k) {
    k = String(k || '').trim();
    if (!k || seen[k]) return false;
    seen[k] = true;
    return true;
  });
}

function ToolkitCacheAdmin_R3_findCol_(hdr, names) {
  hdr = hdr || [];
  names = names || [];
  function norm_(v) {
    return String(v || '').toLowerCase().replace(/[–—−]/g, '-').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  var wanted = names.map(norm_);
  for (var i = 0; i < hdr.length; i++) {
    var h = norm_(hdr[i]);
    for (var j = 0; j < wanted.length; j++) {
      if (h === wanted[j]) return i;
    }
  }
  return -1;
}

function ToolkitCacheAdmin_R3_findColContains_(hdr, names) {
  hdr = hdr || [];
  names = names || [];
  function norm_(v) {
    return String(v || '').toLowerCase().replace(/[–—−]/g, '-').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  var wanted = names.map(norm_);
  for (var i = 0; i < hdr.length; i++) {
    var h = norm_(hdr[i]);
    for (var j = 0; j < wanted.length; j++) {
      if (h && wanted[j] && h.indexOf(wanted[j]) >= 0) return i;
    }
  }
  return -1;
}

function ToolkitCacheAdmin_R3_toMessage_(v) {
  try {
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
  } catch (e) {
    return String(v);
  }
}
