/***********************************************************************
 * PlanningRevisionTokenServiceTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_PLANNING_REVISION_TOKEN_TESTS_R1
 * Permanent, non-destructive regression.
 ***********************************************************************/

var PLANNING_REVISION_TOKEN_TEST_BUILD = '2026-09-09_ROADMAP_2_4_PLANNING_REVISION_TOKEN_TESTS_R1';

function PRTTEST_assert_(name, condition, detail, out) {
  var ok = !!condition;
  out.push({ name:name, ok:ok, detail:ok ? '' : String(detail || 'failed') });
}

function PRTTEST_firstAuditId_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss && ss.getSheetByName('Audit planning');
  if (!sh || sh.getLastRow() < 2) return { auditId:'', rowsRead:0, colsRead:0 };
  var lastCol = sh.getLastColumn();
  var data = sh.getRange(1, 1, sh.getLastRow(), lastCol).getValues();
  var headers = data[0] || [];
  var c = PRT_findCol_(headers, ['Audit ID','Audit_ID','AuditId','Audit Id']);
  if (c < 0) return { auditId:'', rowsRead:data.length, colsRead:lastCol };
  for (var r = 1; r < data.length; r++) {
    var id = PRT_clean_(data[r][c]);
    if (id) return { auditId:id, rowsRead:data.length, colsRead:lastCol };
  }
  return { auditId:'', rowsRead:data.length, colsRead:lastCol };
}

function RUN_PLANNING_REVISION_TOKEN_REGRESSION() {
  var results = [];
  var headers = ['Audit ID','Status','Assigned to','Date - Planned','Planning JSON'];
  var row = ['AUD-1','Approved','a@example.com','2026-09-10',' { "blocks" : [ { "date" : "2026-09-10" } ] } '];
  var snap = PRT_snapshotFromRow_(headers, row);

  PRTTEST_assert_('snapshotAuditId', snap.auditId === 'AUD-1', 'audit id', results);
  PRTTEST_assert_('snapshotStatus', snap.status === 'Approved', 'status', results);
  PRTTEST_assert_('snapshotAssigned', snap.assignedTo === 'a@example.com', 'assigned', results);
  PRTTEST_assert_('jsonNormalized', snap.planningJson === '{"blocks":[{"date":"2026-09-10"}]}', snap.planningJson, results);

  var token1 = PRT_tokenFromSnapshot_(snap);
  var token2 = PRT_tokenFromSnapshot_(PRT_snapshotFromRow_(headers, row));
  PRTTEST_assert_('deterministicToken', token1 === token2 && token1.indexOf('PRT1-') === 0, 'deterministic token', results);

  var changedStatus = JSON.parse(JSON.stringify(snap));
  changedStatus.status = 'Accepted';
  PRTTEST_assert_('statusChangeChangesToken', PRT_tokenFromSnapshot_(changedStatus) !== token1, 'status change', results);

  var changedAssigned = JSON.parse(JSON.stringify(snap));
  changedAssigned.assignedTo = 'b@example.com';
  PRTTEST_assert_('auditorChangeChangesToken', PRT_tokenFromSnapshot_(changedAssigned) !== token1, 'auditor change', results);

  var changedDate = JSON.parse(JSON.stringify(snap));
  changedDate.datePlanned = '2026-09-11';
  PRTTEST_assert_('dateChangeChangesToken', PRT_tokenFromSnapshot_(changedDate) !== token1, 'date change', results);

  var changedJson = JSON.parse(JSON.stringify(snap));
  changedJson.planningJson = '{"blocks":[{"date":"2026-09-11"}]}';
  PRTTEST_assert_('planningJsonChangeChangesToken', PRT_tokenFromSnapshot_(changedJson) !== token1, 'planning json change', results);

  var sameCase = JSON.parse(JSON.stringify(snap));
  sameCase.assignedTo = 'A@EXAMPLE.COM';
  PRTTEST_assert_('emailCaseNormalized', PRT_tokenFromSnapshot_(sameCase) === token1, 'email case', results);

  PRTTEST_assert_('serviceFunctionPresent', typeof PlanningRevisionTokenService_get === 'function', 'service unavailable', results);
  PRTTEST_assert_('guardPresent', typeof PlanningOptimisticRevisionGuard_evaluate === 'function', 'guard unavailable', results);
  PRTTEST_assert_('platformLockPresent', typeof Platform_withLock === 'function', 'Platform_withLock unavailable', results);

  var liveProbe = PRTTEST_firstAuditId_();
  PRTTEST_assert_('liveAuditAvailable', !!liveProbe.auditId, 'no live audit id', results);

  var live = null;
  var liveMs = null;
  if (liveProbe.auditId) {
    var t0 = Date.now();
    live = PlanningRevisionTokenService_get({ auditId:liveProbe.auditId });
    liveMs = Date.now() - t0;
    PRTTEST_assert_('liveServiceSuccess', live && live.success === true, 'live service', results);
    PRTTEST_assert_('liveTokenShape', live && /^PRT1-[0-9a-f]{40}$/.test(live.revision || ''), live && live.revision, results);
    PRTTEST_assert_('liveReadOnly', live && live.meta && live.meta.writes === false && live.meta.derivedOnly === true, 'read-only metadata', results);
    PRTTEST_assert_('canonicalOwner', live && live.meta && live.meta.canonicalOwner === 'Audit planning', 'canonical owner', results);
    PRTTEST_assert_('commitLockRequired', live && live.meta && live.meta.lockRequiredForCommitReread === true && live.meta.lockOwner === 'Platform_withLock', 'commit lock', results);
    var selfGuard = PlanningOptimisticRevisionGuard_evaluate({ auditId:liveProbe.auditId, expectedRevision:live.revision, currentRevision:live.revision });
    PRTTEST_assert_('tokenAcceptedByGuard', selfGuard && selfGuard.accepted === true, 'guard integration', results);
  }

  var passed = results.filter(function(x){ return x.ok; }).length;
  var out = {
    ok: passed === results.length,
    build: PLANNING_REVISION_TOKEN_TEST_BUILD,
    total: results.length,
    passed: passed,
    failed: results.length - passed,
    liveAuditId: liveProbe.auditId,
    liveServerMs: liveMs,
    auditPlanningRowsReadForProbe: liveProbe.rowsRead,
    auditPlanningColsReadForProbe: liveProbe.colsRead,
    devPerformance: live ? live.devPerformance || null : null,
    results: results,
    meta: {
      nonDestructive: true,
      liveCanonicalReadPerformed: !!live,
      liveWritesPerformed: false
    }
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
