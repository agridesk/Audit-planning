/**
 * FILE: AMS01_StatusActionCorePerfOverride.js
 * BUILD: AMS01_STATUS_ACTION_CORE_PERF_OVERRIDE_20260907_R1
 * PURPOSE:
 *   DEV-only performance override for diagnostics that currently sit inside
 *   the synchronous status-action critical path.
 *
 * SAFETY:
 *   - No status/planning/availability/notification truth changes.
 *   - Only replaces synchronous sheet diagnostics with Logger output.
 *   - Intended for DEV / AMS-01 validation only.
 */

var AMS01_STATUS_ACTION_CORE_PERF_BUILD = 'AMS01_STATUS_ACTION_CORE_PERF_OVERRIDE_20260907_R1';

function Status_diagLog_(diagType, auditId, details) {
  try {
    Logger.log('[AMS01_STATUS_DIAG] ' + JSON.stringify({
      build: AMS01_STATUS_ACTION_CORE_PERF_BUILD,
      type: String(diagType || ''),
      auditId: String(auditId || ''),
      details: details || {}
    }));
  } catch (e) {}
  return { success:true, loggerOnly:true, build:AMS01_STATUS_ACTION_CORE_PERF_BUILD };
}

function ManagerDiagnostics_RecordActionTiming(action, auditId, durationMs, success, extra) {
  try {
    Logger.log('[AMS01_ACTION_TIMING] ' + JSON.stringify({
      build: AMS01_STATUS_ACTION_CORE_PERF_BUILD,
      action: String(action || ''),
      auditId: String(auditId || ''),
      durationMs: Number(durationMs || 0),
      success: success !== false,
      extra: extra || {}
    }));
  } catch (e) {}
  return { success:true, loggerOnly:true, build:AMS01_STATUS_ACTION_CORE_PERF_BUILD };
}

function AMS01_StatusActionCorePerfStatus() {
  var t0 = Date.now();
  var a = Status_diagLog_('AMS01_STATUS', 'TEST', { action:'STATUS' });
  var b = ManagerDiagnostics_RecordActionTiming('status', 'TEST', 0, true, {});
  return {
    success:true,
    active:!!(a && a.loggerOnly && b && b.loggerOnly),
    build:AMS01_STATUS_ACTION_CORE_PERF_BUILD,
    wallMs:Date.now()-t0,
    statusDiagnostics:'LOGGER_ONLY',
    managerActionTiming:'LOGGER_ONLY'
  };
}

function AMS01_RunStatusActionComponentBenchmark() {
  var auditId = 'AUD_ProducciónOrnamental_HQ_1777531729474_68';
  var out = {
    build:AMS01_STATUS_ACTION_CORE_PERF_BUILD,
    auditId:auditId,
    runtimeEnv:(typeof AMS01_env_ === 'function' ? AMS01_env_() : 'UNKNOWN'),
    probes:[]
  };

  function probe_(label, fn) {
    var t0 = Date.now();
    var rec = { label:label, ok:false, wallMs:0, result:null, error:'' };
    try {
      rec.result = fn();
      rec.wallMs = Date.now()-t0;
      rec.ok = !(rec.result && rec.result.success === false);
    } catch(e) {
      rec.wallMs = Date.now()-t0;
      rec.error = String(e && e.message ? e.message : e);
    }
    out.probes.push(rec);
  }

  probe_('Core perf override status', function(){ return AMS01_StatusActionCorePerfStatus(); });
  probe_('Load audit context', function(){ return Status_loadAudit_(auditId); });
  probe_('APPROVE transition only', function(){
    var ctx = Status_loadAudit_(auditId);
    return Status_applyTransition_({ status:ctx && ctx.status, action:'APPROVE', role:'MANAGER' });
  });
  probe_('ACCEPT briefing load', function(){ return StatusNotificationBridge_LoadEcasAuditBriefing_(auditId); });
  probe_('Notification duplicate scan', function(){
    if (typeof NB_recentQueueDuplicate_ !== 'function') return { success:true, skipped:true, reason:'NB_recentQueueDuplicate_ missing' };
    return { success:true, value:NB_recentQueueDuplicate_('AMS01_NON_MATCHING_HASH_' + Date.now()) };
  });

  var compact = out.probes.map(function(p){
    return {
      label:p.label,
      ok:p.ok,
      wallMs:p.wallMs,
      found:!!(p.result && p.result.found),
      status:p.result && p.result.status ? p.result.status : '',
      code:p.result && p.result.code ? p.result.code : '',
      skipped:!!(p.result && p.result.skipped),
      error:p.error || ''
    };
  });

  var result = {
    build:out.build,
    auditId:out.auditId,
    runtimeEnv:out.runtimeEnv,
    probes:compact,
    totalMs:compact.reduce(function(s,x){ return s + Number(x.wallMs || 0); }, 0)
  };
  Logger.log('[AMS01_STATUS_COMPONENT_BENCH] ' + JSON.stringify(result));
  return result;
}
