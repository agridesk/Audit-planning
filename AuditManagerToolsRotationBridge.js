// BUILD: AuditManagerToolsRotationBridge_20260425
// Final RotationAuditorService bridge only. Active final definitions only.

function RUN_M5T_ROTATION_CACHE_CLEAR() {
  if (typeof RotationAuditorService_clearCache === 'function') {
    return RotationAuditorService_clearCache();
  }
  var keys = ['M5T_ROTATION_CACHE_V1','M5T_ROTATION_CACHE_V2','M5T_ROTATION_CACHE_V3','M5T_ROTATION_CACHE_V4','M5T_ROTATION_CACHE_V5','M5T_ROTATION_CACHE_V6','M5T_ROTATION_CACHE_V7'];
  try {
    var c = CacheService.getScriptCache();
    keys.forEach(function(k){ c.remove(k); });
  } catch (e) {}
  return { success:true, cleared:keys };
}

function m5t_getWorkloadOverview() {
  if (typeof RotationAuditorService_getOverview === 'function') {
    return RotationAuditorService_getOverview(true);
  }
  return m5t_getWorkloadOverview_uncached_();
}

function m5t_getWorkloadOverview_cached() {
  return m5t_getWorkloadOverview();
}

function m5t_getWorkloadOverview_uncached_() {
  if (typeof RotationAuditorService_getOverview === 'function') {
    return RotationAuditorService_getOverview(true);
  }
  return { success:false, error:'RotationAuditorService_getOverview missing' };
}

function m5t_rotationMaxByScope_(ss) {
  if (typeof RotationAuditorService_getMaxByScope === 'function') {
    return RotationAuditorService_getMaxByScope() || {};
  }
  return {};
}

function m5t_countConsecutiveFor_(ss, auditor, company, scope) {
  if (typeof RotationAuditorService_countFor === 'function') {
    return RotationAuditorService_countFor(ss || SpreadsheetApp.getActiveSpreadsheet(), auditor, company, scope, '');
  }
  return 0;
}

function m5t_getEligibleAuditors(payload) {
  if (typeof RotationAuditorService_getEligibleAuditors === 'function') {
    return RotationAuditorService_getEligibleAuditors(payload || {});
  }
  return { success:false, auditors:[], blockedAuditors:[], error:'RotationAuditorService_getEligibleAuditors missing' };
}

function RUN_ROTATION_AUDITOR_SERVICE_OVERVIEW() {
  return m5t_getWorkloadOverview();
}
