/**
 * FILE: AMS01_Checkpoint.js
 * PURPOSE: One consolidated DEV checkpoint for AMS-01.
 * READ-ONLY except for cache reads/writes already performed by production read paths.
 * Does not perform PLAN/APPROVE/ACCEPT/COMPLETE actions and does not queue notifications.
 */

var AMS01_CHECKPOINT_BUILD = 'AMS01_CHECKPOINT_20260908';

function AMS01_RunCheckpoint() {
  var started = Date.now();
  var out = {
    build: AMS01_CHECKPOINT_BUILD,
    generatedAt: new Date().toISOString(),
    runtimeEnv: '',
    probes: [],
    summary: {}
  };

  try {
    out.runtimeEnv = (typeof EnvironmentGuard_getRuntimeEnv === 'function')
      ? String(EnvironmentGuard_getRuntimeEnv() || '')
      : '';
  } catch (eEnv) {}

  function probe_(label, fn) {
    var t0 = Date.now();
    var rec = { label: label, ok: false, wallMs: 0 };
    try {
      var res = fn() || {};
      rec.ok = res.success !== false && res.ok !== false;
      rec.wallMs = Date.now() - t0;
      rec.result = res;
    } catch (e) {
      rec.ok = false;
      rec.wallMs = Date.now() - t0;
      rec.error = String(e && e.message ? e.message : e);
    }
    out.probes.push(rec);
    return rec;
  }

  var toolkitAuditId = 'AUD_CultiusItxartSCP_HQ_1777531729225_18';
  var statusAuditId = 'AUD_ProducciónOrnamental_HQ_1777531729474_68';
  var auditorEmail = 'david@agriqa.es';
  var monthStart = '2026-09-01';
  var monthEnd = '2026-09-30';

  probe_('Manager overview open grid', function() {
    var r = getManagerV5Open();
    return {
      success: !!(r && r.success !== false),
      rows: r && r.rows ? r.rows.length : 0,
      serverMs: r && r.serverMs != null ? Number(r.serverMs) : null,
      fastFirstPaint: !!(r && r.fastFirstPaint)
    };
  });

  probe_('Manager overview enrichment', function() {
    var r = getManagerV5OpenEnriched();
    return {
      success: !!(r && r.success !== false),
      rows: r && r.rows ? r.rows.length : (Array.isArray(r) ? r.length : null),
      serverMs: r && r.serverMs != null ? Number(r.serverMs) : null
    };
  });

  probe_('Manager dashboard summary', function() {
    var r = null;
    if (typeof getManagerV5DashboardData === 'function') r = getManagerV5DashboardData();
    else if (typeof ManagerV5_GetDashboard === 'function') r = ManagerV5_GetDashboard();
    else return { success:false, error:'Dashboard endpoint missing' };
    return {
      success: !!r,
      counts: r && r.counts ? r.counts : null,
      perf: r && r.perf ? r.perf : null
    };
  });

  probe_('Manager Toolkit open bundle', function() {
    var r = getToolkitOpenBundleV5_d13(toolkitAuditId, '2026-09', { role:'MANAGER' });
    return {
      success: !!(r && r.success !== false),
      bundleStage: r && r.__bundleStage ? r.__bundleStage : '',
      bundleServerMs: r && r.__bundleServerMs != null ? Number(r.__bundleServerMs) : null,
      openServerMs: r && r.__serverMs != null ? Number(r.__serverMs) : null,
      liteManager: !!(r && r.__ams01LiteContext),
      auditors: r && r.auditors ? r.auditors.length : 0
    };
  });

  probe_('Toolkit visible month availability', function() {
    var r = getToolkitAvailabilityMonthDirectV5(auditorEmail, '2026-09', { forceFresh:true });
    return {
      success: !!(r && r.success !== false),
      rows: r && r.meta && r.meta.rowsMatched != null ? Number(r.meta.rowsMatched) : null,
      meta: r && r.meta ? r.meta : null
    };
  });

  probe_('Availability regression', function() {
    if (typeof AMS01_RunAvailabilityRegressionDiagnostic !== 'function') {
      return { success:false, error:'AMS01_RunAvailabilityRegressionDiagnostic missing' };
    }
    var r = AMS01_RunAvailabilityRegressionDiagnostic(auditorEmail, monthStart, monthEnd);
    return {
      success: !!(r && r.equal === true && Number(r.diffCount || 0) === 0),
      equal: !!(r && r.equal === true),
      diffCount: r && r.diffCount != null ? Number(r.diffCount) : null,
      rawMs: r && r.rawMs != null ? Number(r.rawMs) : null,
      liteMs: r && r.liteMs != null ? Number(r.liteMs) : null,
      liteMeta: r && r.liteMeta ? r.liteMeta : null
    };
  });

  probe_('Auditor Portal cold grid', function() {
    try {
      if (typeof auditorV5_invalidateUserGridCache_ === 'function') auditorV5_invalidateUserGridCache_(auditorEmail);
    } catch (eInv) {}
    var r = AuditorV5B_GetAuditorGrid_U20409(auditorEmail, 'active');
    return {
      success: !!(r && r.success !== false),
      rows: r && r.rows ? r.rows.length : 0,
      perf: r && r.perf ? r.perf : null
    };
  });

  probe_('Auditor Portal warm grid', function() {
    var r = AuditorV5B_GetAuditorGrid_U20409(auditorEmail, 'active');
    return {
      success: !!(r && r.success !== false),
      rows: r && r.rows ? r.rows.length : 0,
      perf: r && r.perf ? r.perf : null
    };
  });

  probe_('Status action component', function() {
    if (typeof AMS01_RunStatusActionComponentBenchmark !== 'function') {
      return { success:false, error:'AMS01_RunStatusActionComponentBenchmark missing' };
    }
    var r = AMS01_RunStatusActionComponentBenchmark(statusAuditId);
    return {
      success: !!(r && r.runtimeEnv === 'DEV'),
      totalMs: r && r.totalMs != null ? Number(r.totalMs) : null,
      probes: r && r.probes ? r.probes : null
    };
  });

  probe_('PLAN notification render only', function() {
    var payload = {
      eventType: 'AUDIT_PLANNED_BY_MANAGER',
      auditId: toolkitAuditId,
      company: 'AMS01 checkpoint',
      auditorEmail: auditorEmail,
      auditorName: 'David Pastor',
      actor: 'AMS01 checkpoint',
      actorRole: 'MANAGER',
      recipientRole: 'auditor',
      scopes: ['MPS-GAP','GRASP'],
      blocks: [{ date:'2026-09-15', start:'09:00', end:'17:00' }],
      plannedDates: ['2026-09-15'],
      plannedHours: 8,
      planningWindowFrom: '2026-09-01',
      planningWindowTo: '2026-09-30'
    };
    var tPayload = Date.now();
    var q = NB_buildPayloadForQueue_('AUDIT_PLANNED_BY_MANAGER', payload);
    var payloadMs = Date.now() - tPayload;
    var tRender = Date.now();
    var rendered = NB_buildNotification_('AUDIT_PLANNED_BY_MANAGER', q);
    var renderMs = Date.now() - tRender;
    return {
      success: !!rendered,
      payloadMs: payloadMs,
      renderMs: renderMs,
      subjectLength: rendered && rendered.subject ? String(rendered.subject).length : 0,
      bodyLength: rendered && rendered.body ? String(rendered.body).length : 0,
      htmlLength: rendered && rendered.htmlBody ? String(rendered.htmlBody).length : 0
    };
  });

  out.totalMs = Date.now() - started;

  function get_(label) {
    for (var i=0; i<out.probes.length; i++) if (out.probes[i].label === label) return out.probes[i];
    return null;
  }

  var mo = get_('Manager overview open grid');
  var me = get_('Manager overview enrichment');
  var mt = get_('Manager Toolkit open bundle');
  var av = get_('Toolkit visible month availability');
  var ar = get_('Availability regression');
  var ac = get_('Auditor Portal cold grid');
  var aw = get_('Auditor Portal warm grid');
  var st = get_('Status action component');
  var nr = get_('PLAN notification render only');

  out.summary = {
    managerOpenWallMs: mo ? mo.wallMs : null,
    managerEnrichmentWallMs: me ? me.wallMs : null,
    toolkitOpenWallMs: mt ? mt.wallMs : null,
    availabilityWallMs: av ? av.wallMs : null,
    availabilityRegressionEqual: !!(ar && ar.result && ar.result.equal === true),
    auditorColdWallMs: ac ? ac.wallMs : null,
    auditorWarmWallMs: aw ? aw.wallMs : null,
    statusWallMs: st ? st.wallMs : null,
    planNotificationPayloadMs: nr && nr.result ? nr.result.payloadMs : null,
    planNotificationRenderMs: nr && nr.result ? nr.result.renderMs : null
  };

  Logger.log('[AMS01_CHECKPOINT] ' + JSON.stringify(out));
  return out;
}
