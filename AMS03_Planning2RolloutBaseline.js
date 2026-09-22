/**
 * FILE: AMS03_Planning2RolloutBaseline.gs
 * BUILD: 2026-09-23_AMS03_PLANNING2_ROLLOUT_BASELINE_R1
 * PURPOSE:
 *   Read-only rollout gate for Master Roadmap V2.6 / Planning 2.0.
 *   Closes the current capacity correction gate and establishes a fresh
 *   server-side baseline for the main Planning 1.0 hot paths that Planning 2.0
 *   must replace or materially accelerate.
 *
 * GOVERNANCE
 * - No business writes.
 * - No status transitions.
 * - No Availability mutation.
 * - No cache invalidation.
 * - Uses existing canonical/read-only routes only.
 * - Browser paint / proxy latency remains a separate UI measurement.
 */
var AMS03_PLANNING2_ROLLOUT_BASELINE_BUILD = '2026-09-23_AMS03_PLANNING2_ROLLOUT_BASELINE_R1';

function RUN_AMS03_PLANNING2_ROLLOUT_BASELINE() {
  var started = Date.now();
  var fixture = {
    auditId: 'AUD_CultiusItxartSCP_HQ_1777531729225_18',
    auditorEmail: 'david@agriqa.es',
    monthKey: '2026-09'
  };

  var out = {
    success: false,
    build: AMS03_PLANNING2_ROLLOUT_BASELINE_BUILD,
    readOnly: true,
    writesPerformed: false,
    fixture: fixture,
    capacityGate: null,
    probes: [],
    gates: {},
    errors: [],
    totalMs: 0
  };

  try {
    if (typeof RUN_AMS03_AVAILABILITY_CAPACITY_PROJECTION_ACCEPTANCE === 'function') {
      out.capacityGate = RUN_AMS03_AVAILABILITY_CAPACITY_PROJECTION_ACCEPTANCE();
    } else {
      out.capacityGate = { success:false, error:'MISSING RUN_AMS03_AVAILABILITY_CAPACITY_PROJECTION_ACCEPTANCE' };
    }

    AMS03_P2_probePair_(out, 'Availability Calendar / Toolkit month', function(forceFresh) {
      if (typeof getToolkitAvailabilityMonthDirectV5 !== 'function') throw new Error('Missing getToolkitAvailabilityMonthDirectV5');
      return getToolkitAvailabilityMonthDirectV5(fixture.auditorEmail, fixture.monthKey, {
        forceFresh: !!forceFresh,
        bypassCache: !!forceFresh,
        verifyFreshness: false
      });
    });

    AMS03_P2_probePair_(out, 'Manager Planning Toolkit open', function(forceFresh) {
      if (typeof getToolkitOpenBundleV5_d13 !== 'function') throw new Error('Missing getToolkitOpenBundleV5_d13');
      return getToolkitOpenBundleV5_d13(fixture.auditId, fixture.monthKey, {
        role: 'MANAGER',
        withCalendar: false,
        forceFresh: !!forceFresh
      });
    });

    AMS03_P2_probePair_(out, 'Auditor Portal active grid', function(forceFresh) {
      if (typeof AuditorV5B_GetAuditorGrid_U20409 !== 'function') throw new Error('Missing AuditorV5B_GetAuditorGrid_U20409');
      return AuditorV5B_GetAuditorGrid_U20409({
        view: 'active',
        auditorEmail: fixture.auditorEmail,
        noCache: !!forceFresh
      });
    });

    AMS03_P2_probePair_(out, 'Manager Portal open grid', function(forceFresh) {
      if (typeof getManagerV5Open !== 'function') throw new Error('Missing getManagerV5Open');
      return getManagerV5Open({ forceFresh: !!forceFresh });
    });

    AMS03_P2_probePair_(out, 'Planning Toolkit eligibility', function() {
      if (typeof getToolkitAuditorsV5 !== 'function') throw new Error('Missing getToolkitAuditorsV5');
      return getToolkitAuditorsV5(fixture.auditId);
    });

    var capacityOk = !!(out.capacityGate && out.capacityGate.success === true);
    var allProbesOk = out.probes.every(function(p){ return p.ok === true; });
    var pairedCoverage = ['Availability Calendar / Toolkit month','Manager Planning Toolkit open','Auditor Portal active grid','Manager Portal open grid'].every(function(label){
      return out.probes.some(function(p){return p.label===label && p.mode==='COLD';}) &&
             out.probes.some(function(p){return p.label===label && p.mode==='WARM';});
    });

    out.gates = {
      capacityCorrectionAccepted: capacityOk,
      allServerProbesExecuted: allProbesOk,
      coldWarmCoverage: pairedCoverage,
      readOnly: true,
      noWrites: true,
      browserMetricsExplicitlySeparate: true
    };

    Object.keys(out.gates).forEach(function(k){ if (!out.gates[k]) out.errors.push(k); });
    out.success = out.errors.length === 0;
  } catch (e) {
    out.errors.push(String(e && e.message ? e.message : e));
  }

  out.totalMs = Date.now() - started;
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function AMS03_P2_probePair_(out, label, fn) {
  AMS03_P2_probe_(out, label, 'COLD', function(){ return fn(true); });
  AMS03_P2_probe_(out, label, 'WARM', function(){ return fn(false); });
}

function AMS03_P2_probe_(out, label, mode, fn) {
  var t0 = Date.now();
  var p = {
    label: label,
    mode: mode,
    ok: false,
    wallMs: 0,
    serverReportedMs: null,
    cacheHit: null,
    rowsReturned: null,
    payloadBytesEstimate: null,
    error: ''
  };

  try {
    var res = fn();
    p.wallMs = Date.now() - t0;
    p.ok = !(res && res.success === false);
    p.serverReportedMs = AMS03_P2_pickNumber_(res, ['__bundleServerMs','__serverMs','serverMs','totalMs']);
    p.cacheHit = AMS03_P2_pickBool_(res, ['__cacheHit','cacheHit']);
    p.rowsReturned = AMS03_P2_rows_(res);
    p.payloadBytesEstimate = AMS03_P2_bytes_(res);
    if (!p.ok) p.error = String((res && (res.message || res.error)) || 'FAILED');
  } catch (e) {
    p.wallMs = Date.now() - t0;
    p.error = String(e && e.message ? e.message : e);
  }
  out.probes.push(p);
}

function AMS03_P2_pickNumber_(obj, keys) {
  obj = obj || {};
  for (var i=0;i<keys.length;i++) if (obj[keys[i]] != null && isFinite(Number(obj[keys[i]]))) return Number(obj[keys[i]]);
  if (obj.perf && typeof obj.perf === 'object') for (var j=0;j<keys.length;j++) if (obj.perf[keys[j]] != null && isFinite(Number(obj.perf[keys[j]]))) return Number(obj.perf[keys[j]]);
  if (obj.meta && typeof obj.meta === 'object') for (var k=0;k<keys.length;k++) if (obj.meta[keys[k]] != null && isFinite(Number(obj.meta[keys[k]]))) return Number(obj.meta[keys[k]]);
  return null;
}

function AMS03_P2_pickBool_(obj, keys) {
  obj = obj || {};
  for (var i=0;i<keys.length;i++) if (typeof obj[keys[i]] === 'boolean') return obj[keys[i]];
  if (obj.perf && typeof obj.perf === 'object') for (var j=0;j<keys.length;j++) if (typeof obj.perf[keys[j]] === 'boolean') return obj.perf[keys[j]];
  if (obj.meta && typeof obj.meta === 'object') for (var k=0;k<keys.length;k++) if (typeof obj.meta[keys[k]] === 'boolean') return obj.meta[keys[k]];
  return null;
}

function AMS03_P2_rows_(res) {
  if (!res) return null;
  if (Array.isArray(res.rows)) return res.rows.length;
  if (Array.isArray(res.auditors)) return res.auditors.length;
  if (res.auditorsBundle && Array.isArray(res.auditorsBundle.auditors)) return res.auditorsBundle.auditors.length;
  if (res.meta && isFinite(Number(res.meta.rowsMatched))) return Number(res.meta.rowsMatched);
  if (res.perf && isFinite(Number(res.perf.rowsReturned))) return Number(res.perf.rowsReturned);
  return null;
}

function AMS03_P2_bytes_(res) {
  try { return Utilities.newBlob(JSON.stringify(res || {})).getBytes().length; }
  catch (e) { return null; }
}
