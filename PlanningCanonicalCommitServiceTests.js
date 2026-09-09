/***********************************************************************
 * PlanningCanonicalCommitServiceTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CANONICAL_COMMIT_ORCHESTRATION_TESTS_R1
 * Permanent regression. No planning writes are performed.
 ***********************************************************************/

var PLANNING_CANONICAL_COMMIT_TEST_BUILD = '2026-09-09_ROADMAP_2_4_CANONICAL_COMMIT_ORCHESTRATION_TESTS_R1';

function PCCSTEST_assert_(name, condition, detail, out) {
  var ok = !!condition;
  out.push({ name:name, ok:ok, detail:ok ? '' : String(detail || 'failed') });
}

function PCCSTEST_firstAuditId_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss && ss.getSheetByName('Audit planning');
  if (!sh || sh.getLastRow() < 2) return '';
  var lastCol = sh.getLastColumn();
  var hdr = sh.getRange(1,1,1,lastCol).getValues()[0] || [];
  var c = hdr.map(function(v){ return String(v || '').trim().toLowerCase(); }).indexOf('audit id');
  if (c < 0) return '';
  var vals = sh.getRange(2,c + 1,sh.getLastRow() - 1,1).getValues();
  for (var i = 0; i < vals.length; i++) {
    var id = String(vals[i][0] || '').trim();
    if (id) return id;
  }
  return '';
}

function RUN_PLANNING_CANONICAL_COMMIT_ORCHESTRATION_REGRESSION() {
  var results = [];

  var deps = PCCS_dependencies_();
  PCCSTEST_assert_('platformLockAvailable', deps.lock === true, 'Platform_withLock', results);
  PCCSTEST_assert_('lockedGateAvailable', deps.lockedGate === true, 'locked gate', results);
  PCCSTEST_assert_('statusMachineAvailable', deps.statusMachine === true, 'StatusMachine', results);
  PCCSTEST_assert_('loadContextAvailable', deps.loadContext === true, 'loadContext_', results);
  PCCSTEST_assert_('findAuditAvailable', deps.findAudit === true, 'findAudit_', results);
  PCCSTEST_assert_('canonicalWriterAvailable', deps.canonicalWriter === true, 'Planning_executeWrite_', results);
  PCCSTEST_assert_('revisionBuilderAvailable', deps.revisionBuilder === true, 'revision builder', results);
  PCCSTEST_assert_('serviceFunctionPresent', typeof PlanningCanonicalCommitService_commit === 'function', 'service function', results);

  var blocked = PCCS_blocked_({auditId:'AUD-1'}, {reason:'REVISION_CONFLICT'}, 'REVISION_CONFLICT');
  PCCSTEST_assert_('blockedDoesNotWrite', blocked.committed === false && blocked.meta.canonicalWriterCalled === false, 'blocked write', results);
  PCCSTEST_assert_('blockedUsesOneLockContract', blocked.meta.oneLockThroughWriteBoundary === true, 'lock contract', results);
  PCCSTEST_assert_('blockedCanonicalWriterNamed', blocked.meta.canonicalWriter === 'AuditPlanningEngine.Planning_executeWrite_', 'writer owner', results);
  PCCSTEST_assert_('blockedRevisionDerivedOnly', blocked.meta.revisionRole === 'derived concurrency token only', 'revision role', results);

  var fakeWrite = {
    success:true,
    auditId:'AUD-1',
    newStatus:'Approved',
    assignedTo:'auditor@example.com',
    plannedDate:'2026-10-01',
    planningJson:'{"blocks":[{"date":"2026-10-01","start":"08:00","end":"12:00","hours":4}],"totalPlannedHours":4,"auditorEmail":"auditor@example.com","auditorName":"Auditor"}'
  };
  var rev1 = PCCS_postWriteRevision_(fakeWrite);
  var rev2 = PRT_tokenFromSnapshot_({
    auditId:'AUD-1',
    status:'Approved',
    assignedTo:'auditor@example.com',
    datePlanned:'2026-10-01',
    planningJson:fakeWrite.planningJson
  });
  PCCSTEST_assert_('postWriteRevisionDeterministic', rev1 === rev2 && /^PRT1-[0-9a-f]{40}$/.test(rev1), rev1, results);
  PCCSTEST_assert_('failedWriteNoRevision', PCCS_postWriteRevision_({success:false}) === '', 'failed revision', results);

  var liveAuditId = PCCSTEST_firstAuditId_();
  PCCSTEST_assert_('liveAuditAvailable', !!liveAuditId, 'no live audit', results);

  var live = null;
  var liveMs = null;
  if (liveAuditId) {
    var t0 = Date.now();
    live = PlanningCanonicalCommitService_commit({
      auditId: liveAuditId,
      expectedRevision: 'PRT1-0000000000000000000000000000000000000000',
      blocks: [{date:'2099-01-01',start:'08:00',end:'09:00',hours:1}],
      auditorEmail:'never-used@example.com',
      auditorName:'Never Used',
      actorRole:'MANAGER'
    });
    liveMs = Date.now() - t0;
    PCCSTEST_assert_('liveConflictBlocked', live && live.committed === false && live.reason === 'REVISION_CONFLICT', live && live.reason, results);
    PCCSTEST_assert_('liveConflictNoWriterCall', live && live.meta && live.meta.canonicalWriterCalled === false, 'writer must not run', results);
    PCCSTEST_assert_('liveConflictGatePresent', live && live.gate && live.gate.meta && live.gate.meta.conflictFastPath === true, 'conflict fast path', results);
    PCCSTEST_assert_('liveConflictPreflightSkipped', live && live.gate && live.gate.preflight === null, 'preflight should skip', results);
    PCCSTEST_assert_('liveLockUsed', live && live.meta && live.meta.lockUsed === true && live.meta.oneLockThroughWriteBoundary === true, 'lock contract', results);
  }

  PCCSTEST_assert_('legacyPlanEntrypointStillPresent', typeof planAudit === 'function' && typeof planAuditV5_ === 'function', 'legacy entrypoint', results);
  PCCSTEST_assert_('canonicalWriteOwnerUnchanged', typeof Planning_executeWrite_ === 'function', 'canonical writer unchanged', results);

  var passed = results.filter(function(x){ return x.ok; }).length;
  var out = {
    ok: passed === results.length,
    build: PLANNING_CANONICAL_COMMIT_TEST_BUILD,
    total: results.length,
    passed: passed,
    failed: results.length - passed,
    liveAuditId: liveAuditId || '',
    liveServerMs: liveMs,
    liveResult: live,
    results: results,
    meta: {
      nonDestructive: true,
      liveLockAcquired: !!liveAuditId,
      liveCanonicalRevisionReadPerformed: !!liveAuditId,
      liveCanonicalPreflightPerformed: false,
      liveCanonicalWriterCalled: false,
      liveWritesPerformed: false,
      reason: 'Live probe deliberately uses an impossible expected revision so conflict stops before preflight/write.'
    }
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
