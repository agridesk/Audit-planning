const TOOLKIT_OPEN_FOCUSED_PERF_DIAG_VERSION = 'T03_TOOLKIT_OPEN_FOCUSED_PERF_DIAG_20260427';
const TOOLKIT_OPEN_FOCUSED_PERF_AUDIT_ID = 'TESTAUD38';

function RUN_DIAG_ToolkitOpenFocusedPerformance_TESTAUD38() {
  return DIAG_ToolkitOpenFocusedPerformance(TOOLKIT_OPEN_FOCUSED_PERF_AUDIT_ID);
}

function RUN_DIAG_ToolkitOpenFocusedPerformanceSamples_TESTAUD38() {
  return DIAG_ToolkitOpenFocusedPerformance_Samples(TOOLKIT_OPEN_FOCUSED_PERF_AUDIT_ID, 5);
}

function DIAG_ToolkitOpenFocusedPerformance(auditId) {
  const started = Date.now();
  auditId = auditId || TOOLKIT_OPEN_FOCUSED_PERF_AUDIT_ID;

  const out = {
    ok: false,
    version: TOOLKIT_OPEN_FOCUSED_PERF_DIAG_VERSION,
    generatedAt: new Date().toISOString(),
    auditId: auditId,
    stages: [],
    auditRow: {},
    monthTests: [],
    conclusion: '',
    errors: [],
    totalMs: 0
  };

  try {
    if (!auditId) {
      throw new Error('Missing auditId. Fixed wrapper uses TESTAUD38.');
    }

    const auditRow = FOCUS_measure_(out, 'auditRowProbe_onlyAuditPlanning', function () {
      return FOCUS_findAuditPlanningRow_(auditId);
    });

    out.auditRow = auditRow || {};

    const monthKeys = FOCUS_unique_([
      '',
      FOCUS_toMonthKey_(auditRow && auditRow.planningWindowFrom),
      FOCUS_toMonthKey_(auditRow && auditRow.datePlanned),
      FOCUS_toMonthKey_(auditRow && auditRow.planningWindowTo)
    ]);

    for (let i = 0; i < monthKeys.length; i++) {
      const monthKey = monthKeys[i];

      const result = FOCUS_measure_(out, 'mainOpen_monthKey_' + (monthKey || 'EMPTY'), function () {
        if (typeof getPlanningContextAndFirstMonthV5 !== 'function') {
          throw new Error('getPlanningContextAndFirstMonthV5 not found.');
        }
        return getPlanningContextAndFirstMonthV5(auditId, monthKey);
      });

      out.monthTests.push(FOCUS_profileMainOpen_(monthKey, result));
    }

    out.conclusion = FOCUS_conclusion_(out);
    out.ok = true;

  } catch (err) {
    out.ok = false;
    out.errors.push({
      message: err.message || String(err),
      stack: err.stack || ''
    });
  }

  out.totalMs = Date.now() - started;
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function DIAG_ToolkitOpenFocusedPerformance_Samples(auditId, sampleCount) {
  auditId = auditId || TOOLKIT_OPEN_FOCUSED_PERF_AUDIT_ID;
  sampleCount = sampleCount || 5;

  const out = {
    ok: true,
    version: TOOLKIT_OPEN_FOCUSED_PERF_DIAG_VERSION,
    generatedAt: new Date().toISOString(),
    auditId: auditId,
    sampleCount: sampleCount,
    samples: [],
    stats: {}
  };

  const totalMs = [];
  const mainEmptyMs = [];
  const mainPlanFromMs = [];
  const mainDatePlannedMs = [];

  for (let i = 0; i < sampleCount; i++) {
    Utilities.sleep(1500);

    const res = DIAG_ToolkitOpenFocusedPerformance(auditId);
    out.samples.push({
      ok: res.ok,
      totalMs: res.totalMs,
      conclusion: res.conclusion,
      monthTests: res.monthTests
    });

    totalMs.push(res.totalMs || 0);
    mainEmptyMs.push(FOCUS_getStageMs_(res.stages, 'mainOpen_monthKey_EMPTY'));

    const planFromKey = FOCUS_toMonthKey_(res.auditRow && res.auditRow.planningWindowFrom);
    const datePlannedKey = FOCUS_toMonthKey_(res.auditRow && res.auditRow.datePlanned);

    if (planFromKey) {
      mainPlanFromMs.push(FOCUS_getStageMs_(res.stages, 'mainOpen_monthKey_' + planFromKey));
    }

    if (datePlannedKey) {
      mainDatePlannedMs.push(FOCUS_getStageMs_(res.stages, 'mainOpen_monthKey_' + datePlannedKey));
    }
  }

  out.stats = {
    totalMs: FOCUS_stats_(totalMs),
    mainEmptyMs: FOCUS_stats_(mainEmptyMs),
    mainPlanFromMs: FOCUS_stats_(mainPlanFromMs),
    mainDatePlannedMs: FOCUS_stats_(mainDatePlannedMs)
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function FOCUS_measure_(out, name, fn) {
  const s = Date.now();
  let result = null;
  let ok = true;
  let error = '';

  try {
    result = fn();
  } catch (err) {
    ok = false;
    error = String(err);
  }

  out.stages.push({
    stage: name,
    ms: Date.now() - s,
    ok: ok,
    error: error
  });

  return result;
}

function FOCUS_findAuditPlanningRow_(auditId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Audit planning');

  if (!sh) {
    throw new Error('Audit planning sheet missing.');
  }

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();

  if (lastRow < 2) {
    return {
      found: false,
      reason: 'No data rows.'
    };
  }

  const values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map(function (h) {
    return String(h || '').trim();
  });

  const auditIdCol = FOCUS_headerIndex_(headers, ['Audit ID', 'Audit_ID', 'AuditId']);
  const finalAuditIdCol = auditIdCol >= 0 ? auditIdCol : 34;

  for (let r = 1; r < values.length; r++) {
    if (String(values[r][finalAuditIdCol] || '').trim() === auditId) {
      return {
        found: true,
        rowNumber: r + 1,
        auditIdCol: finalAuditIdCol + 1,
        company: FOCUS_value_(headers, values[r], ['Company']) || values[r][0] || '',
        assignedTo: FOCUS_value_(headers, values[r], ['Assigned to', 'Assigned']) || '',
        preassignedAuditor: FOCUS_value_(headers, values[r], ['Preassigned auditor', 'Preassigned Auditor', 'Preassigned']) || '',
        planningWindowFrom: FOCUS_value_(headers, values[r], ['Planning window from', 'Plan van']) || '',
        planningWindowTo: FOCUS_value_(headers, values[r], ['Planning window to', 'Plant tot']) || '',
        datePlanned: FOCUS_value_(headers, values[r], ['Date Planned', 'Date - Planned', 'Date – Planned']) || '',
        planningJsonLength: String(FOCUS_value_(headers, values[r], ['Planning JSON']) || '').length
      };
    }
  }

  return {
    found: false,
    lastRow: lastRow,
    lastCol: lastCol,
    auditIdCol: finalAuditIdCol + 1
  };
}

function FOCUS_profileMainOpen_(monthKey, payload) {
  const out = {
    requestedMonthKey: monthKey || '',
    success: !!(payload && payload.success),
    serverMs: payload && payload.serverMs || null,
    jsonLength: 0,
    windowStart: '',
    windowEnd: '',
    windowStartMonthKey: '',
    firstMonthAvailabilityType: '',
    firstMonthAvailabilityJsonLength: 0,
    firstMonthAvailabilitySkipped: payload && payload.availabilityBootstrapSkipped,
    fastFirstPaint: payload && payload.fastFirstPaint,
    locationsCount: payload && payload.locationsCount,
    activeScopesCount: payload && payload.activeScopes && payload.activeScopes.length || 0,
    auditorsCount: payload && payload.auditors && payload.auditors.length || 0,
    warningsCount: payload && payload.warnings && payload.warnings.length || 0
  };

  try {
    out.jsonLength = JSON.stringify(payload || {}).length;
  } catch (err) {
    out.jsonLength = -1;
  }

  if (payload && payload.window) {
    out.windowStart = String(payload.window.startDate || payload.window.from || '');
    out.windowEnd = String(payload.window.endDate || payload.window.to || '');
    out.windowStartMonthKey = FOCUS_toMonthKey_(out.windowStart);
  }

  const av = payload && payload.firstMonthAvailability;
  out.firstMonthAvailabilityType = Object.prototype.toString.call(av);

  try {
    out.firstMonthAvailabilityJsonLength = JSON.stringify(av || null).length;
  } catch (err2) {
    out.firstMonthAvailabilityJsonLength = -1;
  }

  return out;
}

function FOCUS_conclusion_(out) {
  const tests = out.monthTests || [];

  const empty = tests.filter(function (x) {
    return !x.requestedMonthKey;
  })[0];

  const fastest = tests.slice().sort(function (a, b) {
    return (a.serverMs || 999999) - (b.serverMs || 999999);
  })[0];

  const row = out.auditRow || {};
  const planFromKey = FOCUS_toMonthKey_(row.planningWindowFrom);
  const plannedKey = FOCUS_toMonthKey_(row.datePlanned);

  let msg = [];

  msg.push('Focus result: compare requested monthKey against returned window and serverMs.');

  if (planFromKey && plannedKey && planFromKey !== plannedKey) {
    msg.push('Audit row has planningWindowFrom month ' + planFromKey + ' but datePlanned month ' + plannedKey + '.');
  }

  if (empty && empty.windowStartMonthKey && planFromKey && empty.windowStartMonthKey !== planFromKey) {
    msg.push('Empty monthKey opens returned window month ' + empty.windowStartMonthKey + ', not planningWindowFrom month ' + planFromKey + '.');
  }

  if (fastest) {
    msg.push('Fastest tested monthKey: ' + (fastest.requestedMonthKey || 'EMPTY') + ' with serverMs=' + fastest.serverMs + '.');
  }

  msg.push('If all mainOpen tests remain >5s, fix must be inline inside getPlanningContextAndFirstMonthV5, not external probes.');

  return msg.join(' ');
}

function FOCUS_headerIndex_(headers, names) {
  const normalized = headers.map(function (h) {
    return String(h || '').trim().toLowerCase();
  });

  for (let i = 0; i < names.length; i++) {
    const idx = normalized.indexOf(String(names[i]).trim().toLowerCase());
    if (idx >= 0) {
      return idx;
    }
  }

  return -1;
}

function FOCUS_value_(headers, row, names) {
  const idx = FOCUS_headerIndex_(headers, names);
  return idx >= 0 ? row[idx] : '';
}

function FOCUS_toMonthKey_(value) {
  if (!value) {
    return '';
  }

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM');
  }

  const s = String(value).trim();

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return m[1] + '-' + m[2];
  }

  m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    return m[1] + '-' + m[2];
  }

  return '';
}

function FOCUS_unique_(arr) {
  const seen = {};
  const out = [];

  arr.forEach(function (x) {
    x = String(x || '').trim();
    if (!seen[x]) {
      seen[x] = true;
      out.push(x);
    }
  });

  return out;
}

function FOCUS_getStageMs_(stages, name) {
  if (!stages || !stages.length) {
    return 0;
  }

  const row = stages.find(function (x) {
    return x.stage === name;
  });

  return row ? row.ms : 0;
}

function FOCUS_stats_(arr) {
  arr = (arr || []).filter(function (n) {
    return typeof n === 'number' && !isNaN(n);
  });

  if (!arr.length) {
    return {
      min: 0,
      max: 0,
      avg: 0,
      p50: 0,
      p95: 0
    };
  }

  const sorted = arr.slice().sort(function (a, b) {
    return a - b;
  });

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sorted.reduce(function (a, b) {
      return a + b;
    }, 0) / sorted.length),
    p50: FOCUS_percentile_(sorted, 50),
    p95: FOCUS_percentile_(sorted, 95)
  };
}

function FOCUS_percentile_(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}
