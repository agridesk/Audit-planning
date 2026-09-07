/***********************************************************************
 * FILE: Cache_Admin_AuditorScopeInvalidation.gs
 * BUILD: 2026-07-02_AUDITOR_SCOPE_CACHE_INVALIDATION_3S_R4
 ***********************************************************************/

var AUDITOR_SCOPE_CACHE_GENERATION_PROP =
  'AUDITOR_SCOPE_CACHE_GENERATION_V1';

function AUDITOR_SCOPE_newGenerationValue_() {
  return 'GEN_' +
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'yyyyMMdd_HHmmss'
    ) +
    '_' +
    new Date().getTime();
}

function AUDITOR_SCOPE_getCacheGeneration_() {
  var props = PropertiesService.getScriptProperties();
  var current = String(props.getProperty(AUDITOR_SCOPE_CACHE_GENERATION_PROP) || '').trim();

  if (!current) {
    current = AUDITOR_SCOPE_newGenerationValue_();
    props.setProperty(AUDITOR_SCOPE_CACHE_GENERATION_PROP, current);
  }

  return current;
}

function AUDITOR_SCOPE_bumpCacheGeneration_() {
  var next = AUDITOR_SCOPE_newGenerationValue_();
  PropertiesService.getScriptProperties().setProperty(AUDITOR_SCOPE_CACHE_GENERATION_PROP, next);
  return next;
}

function RUN_AUDITOR_SCOPE_CACHE_REFRESH(context) {
  context = context || {};

  var started = new Date().getTime();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var out = {
    ok: true,
    build: '2026-07-02_AUDITOR_SCOPE_CACHE_INVALIDATION_3S_R4',
    startedAt: new Date().toISOString(),
    context: context,
    generationBefore: '',
    generationAfter: '',
    cleared: {},
    warnings: [],
    errors: []
  };

  function clearSheetRows_(sheetName) {
    try {
      var sh = ss.getSheetByName(sheetName);
      if (!sh) {
        out.cleared[sheetName] = { exists: false, rowsCleared: 0 };
        return;
      }

      var lastRow = sh.getLastRow();
      var lastCol = sh.getLastColumn();

      if (lastRow <= 1 || lastCol < 1) {
        out.cleared[sheetName] = { exists: true, rowsCleared: 0 };
        return;
      }

      sh.getRange(2, 1, lastRow - 1, lastCol).clearContent();
      out.cleared[sheetName] = { exists: true, rowsCleared: lastRow - 1 };
    } catch (e) {
      out.ok = false;
      out.errors.push(sheetName + ': ' + String(e && e.stack ? e.stack : e));
    }
  }

  try {
    out.generationBefore = AUDITOR_SCOPE_getCacheGeneration_();
    out.generationAfter = AUDITOR_SCOPE_bumpCacheGeneration_();
  } catch (eGen) {
    out.ok = false;
    out.errors.push('generation bump: ' + String(eGen && eGen.stack ? eGen.stack : eGen));
  }

  try {
    if (typeof __mp_resetExecCache_ === 'function') {
      __mp_resetExecCache_();
      out.cleared.execCache = true;
    }
  } catch (e0) {
    out.warnings.push('__mp_resetExecCache_: ' + e0);
  }

  try {
    if (typeof elig_exec_clear_ === 'function') {
      elig_exec_clear_();
      out.cleared.eligExecCache = true;
    }
  } catch (e1) {
    out.warnings.push('elig_exec_clear_: ' + e1);
  }

  try {
    if (typeof __mp_invalidateAuditPlanningPack_ === 'function') {
      __mp_invalidateAuditPlanningPack_();
      out.cleared.auditPlanningPack = true;
    }
  } catch (e2) {
    out.warnings.push('__mp_invalidateAuditPlanningPack_: ' + e2);
  }

  try {
    if (typeof __mp_invalidatePersistCaches_ === 'function') {
      __mp_invalidatePersistCaches_([
        'Auditors',
        'Config_Scopes',
        'Audit planning'
      ]);

      out.cleared.persistCaches = [
        'Auditors',
        'Config_Scopes',
        'Audit planning'
      ];
    } else {
      out.warnings.push('__mp_invalidatePersistCaches_ not available');
    }
  } catch (ePersist) {
    out.warnings.push('__mp_invalidatePersistCaches_: ' + ePersist);
  }

  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE) {
      if (typeof AUDIT_CACHE.removeNamespace === 'function') {
        out.cleared.auditCacheAuditors     = AUDIT_CACHE.removeNamespace('auditors');
        out.cleared.auditCacheConfigScopes = AUDIT_CACHE.removeNamespace('config_scopes');
        out.cleared.auditCacheAuditorGrid  = AUDIT_CACHE.removeNamespace('auditor_grid');
        out.cleared.auditCacheManagerTools = AUDIT_CACHE.removeNamespace('manager_tools');
        out.cleared.auditCacheManager      = AUDIT_CACHE.removeNamespace('manager');
        out.cleared.auditCachePlanning     = AUDIT_CACHE.removeNamespace('planning');
        out.cleared.auditCacheAvailability = AUDIT_CACHE.removeNamespace('availability');
      }

      if (typeof AUDIT_CACHE.overflowClearAll === 'function') {
        out.cleared.auditCacheOverflowRows = AUDIT_CACHE.overflowClearAll();
      }
    }
  } catch (e3) {
    out.ok = false;
    out.errors.push('AUDIT_CACHE: ' + String(e3 && e3.stack ? e3.stack : e3));
  }

  clearSheetRows_('MP_OpenCache_Store');
  clearSheetRows_('MP_AudCache_Store');
  clearSheetRows_('Eligibility_Cache');
  clearSheetRows_('AUDIT_CacheOverflow_Store');
  clearSheetRows_('MP_CalCache_Store');

  SpreadsheetApp.flush();

  out.finishedAt = new Date().toISOString();
  out.durationMs = new Date().getTime() - started;

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function AUDITOR_SCOPE_ON_EDIT(e) {
  try {
    if (!e || !e.range) return;

    var sh = e.range.getSheet();
    var sheetName = String(sh.getName() || '').trim();

    if (sheetName !== 'Auditors' && sheetName !== 'Config_Scopes') return;

    RUN_AUDITOR_SCOPE_CACHE_REFRESH({
      trigger: 'onEdit',
      sheetName: sheetName,
      rangeA1: e.range.getA1Notation()
    });

  } catch (err) {
    Logger.log('[AUDITOR_SCOPE_ON_EDIT] ' + String(err && err.stack ? err.stack : err));
  }
}

function INSTALL_AUDITOR_SCOPE_ON_EDIT_TRIGGER() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;

  for (var i = 0; i < triggers.length; i++) {
    var t = triggers[i];
    if (t.getHandlerFunction && t.getHandlerFunction() === 'AUDITOR_SCOPE_ON_EDIT') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  }

  ScriptApp.newTrigger('AUDITOR_SCOPE_ON_EDIT')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();

  Logger.log('AUDITOR_SCOPE_ON_EDIT trigger installed. Previous triggers removed: ' + removed);

  return {
    ok: true,
    installed: true,
    removedPreviousTriggers: removed
  };
}