
// FILE: AuditManagerActions.js
// BUILD: 2026-10-03_COMPLETE_V29_MANAGER_ACTION_R5
// PURPOSE:
//   Minimal stable Manager grid action endpoint after backend split.
//   Replaces old restore-chain that depended on many legacy ManagerV5 helpers.
//   Uses central StatusMachine only.
//   Public endpoints preserved:
//   - managerV5Action(auditId, action, options)
//   - ManagerV5_Action(a, b, options)
//
// IMPORTANT:
//   This adapter intentionally avoids:
//   - scope-list sync
//   - mail queue
//   - dashboard helpers
//   - old ManagerV5 helper chain
//   - unguarded legacy dependencies
//
// Manager Portal 2.0 canonical actions:
//   approve, cancel, reject, complete, edit_realized_hours
// Legacy deny remains accepted only by the backward-compatible adapter during migration.
//
// Required active files:
//   CoreStatusRules.gs
//   CoreStatusActions.gs
//   CoreStatusMachine_CORE_SPLIT.gs
//   StatusNotificationHotPath.js (optional hot-path preparation)

function managerV5Action(auditId, action, options) {
  var started = new Date().getTime();
  options = options || {};
  auditId = String(auditId || '').trim();
  action = String(action || '').trim().toLowerCase();

  function done_(res) {
    res = res || {};
    if (typeof res.success === 'undefined' && typeof res.ok !== 'undefined') res.success = !!res.ok;
    if (typeof res.ok === 'undefined' && typeof res.success !== 'undefined') res.ok = !!res.success;
    res.auditId = res.auditId || auditId;
    res.action = res.action || action;
    res.perf = res.perf || {};
    res.perf.managerActionAdapterMs = new Date().getTime() - started;
    res.perf.requestId = String(options.requestId || '');
    res.adapterBuild = '2026-10-03_COMPLETE_V29_MANAGER_ACTION_R5';
    // Hot-path rule: never append Diagnostics_Action_Timings synchronously.
    // The duration is already returned in res.perf and can be logged by the
    // caller without adding another Spreadsheet write to Cancel/Reject/Approve.
    res.perf.actionTimingRecordedSynchronously = false;
    try {
      Logger.log('[MANAGER_ACTION_TIMING] ' + JSON.stringify({
        action:action,
        auditId:auditId,
        durationMs:res.perf.managerActionAdapterMs,
        success:!(res.success === false || res.ok === false),
        newStatus:res.newStatus || res.afterStatusDisplay || ''
      }));
    } catch (eTimingLog) {}
    return res;
  }

  try {
    if (!auditId) return done_({ success:false, message:'No auditId' });
    if (!action) return done_({ success:false, message:'No action' });

    if (action === 'edit_realized_hours') {
      if (typeof CompletionService_OverrideCompletedHours !== 'function') {
        return done_({ success:false, message:'CompletionService_OverrideCompletedHours not available' });
      }
      var correction = CompletionService_OverrideCompletedHours({
        auditId:auditId,
        hoursDedicated:options.hoursDedicated,
        actorEmail:String(options.actorEmail || options.managerEmail || '').trim().toLowerCase(),
        reason:String(options.reason || '').trim()
      });
      return done_(correction || { success:false, message:'Realized-hours correction returned empty result' });
    }

    var actionMap = {
      approve: 'APPROVE',
      deny: 'DENY',
      cancel: 'CANCEL',
      reject: 'REJECT',
      complete: 'COMPLETE'
    };

    var actionKey = actionMap[action];
    if (!actionKey) {
      return done_({ success:false, message:'Unknown action: ' + action });
    }

    if (typeof Status_applyAction !== 'function') {
      return done_({ success:false, message:'Status_applyAction not available. Check CoreStatusActions.gs is deployed.' });
    }

    // AMS-01: prepare Cancel/Reject/Deny hot path before entering StatusMachine.
    // StatusMachine remains the lifecycle owner; this only removes synchronous
    // diagnostic sheet I/O and corrects Manager -> Auditor notification routing.
    if ((actionKey === 'CANCEL' || actionKey === 'REJECT' || actionKey === 'DENY') &&
        typeof AMS01_prepareLifecycleHotPath_ === 'function') {
      try { AMS01_prepareLifecycleHotPath_(); } catch (eHotPath) {}
    }

    var payload = {};
    for (var k in options) {
      if (Object.prototype.hasOwnProperty.call(options, k)) payload[k] = options[k];
    }

    payload.actorRole = 'MANAGER';
    payload.role = 'MANAGER';

    var result = Status_applyAction('MANAGER', actionKey, auditId, payload);

    if (!result) {
      return done_({ success:false, message:'Status_applyAction returned empty result' });
    }

    if (result.success === false || result.ok === false) {
      if (actionKey === 'COMPLETE' && typeof CompletionService_CommitCompletion === 'function') {
        var recoveredComplete = CompletionService_CommitCompletion({
          auditId:auditId,
          actorEmail:String(payload.actorEmail || payload.managerEmail || '').trim().toLowerCase(),
          hoursDedicated:payload.hoursDedicated,
          mode:'MANAGER_ON_BEHALF',
          reason:String(payload.reason || '').trim()
        });
        if (recoveredComplete && recoveredComplete.success === true) return done_(recoveredComplete);
      }
      return done_(result);
    }

    return done_(result);

  } catch (e) {
    if (action === 'complete' && typeof CompletionService_CommitCompletion === 'function') {
      try {
        var recoveredAfterException = CompletionService_CommitCompletion({
          auditId:auditId,
          actorEmail:String(options.actorEmail || options.managerEmail || '').trim().toLowerCase(),
          hoursDedicated:options.hoursDedicated,
          mode:'MANAGER_ON_BEHALF',
          reason:String(options.reason || '').trim()
        });
        if (recoveredAfterException && recoveredAfterException.success === true) return done_(recoveredAfterException);
      } catch (eRecovery) {}
    }
    return done_({
      success:false,
      ok:false,
      message:String(e && e.message ? e.message : e),
      stack:String(e && e.stack ? e.stack : '')
    });
  }
}

// Backward compatible alias: accepts BOTH orders safely.
// Historical variants:
//   ManagerV5_Action(action, auditId, options)
//   ManagerV5_Action(auditId, action, options)
function ManagerV5_Action(a, b, options) {
  var s1 = String(a || '').toLowerCase().trim();
  var s2 = String(b || '').toLowerCase().trim();
  var known = { approve:1, deny:1, cancel:1, reject:1, complete:1, edit_realized_hours:1 };

  if (known[s1]) return managerV5Action(b, a, options);
  if (known[s2]) return managerV5Action(a, b, options);

  return managerV5Action(b, a, options);
}

function RUN_AUDIT_MANAGER_ACTIONS_ADAPTER_DIAGNOSTICS() {
  var out = {
    ok: true,
    build: '2026-10-03_COMPLETE_V29_MANAGER_ACTION_R5',
    functions: {
      managerV5Action: typeof managerV5Action === 'function',
      ManagerV5_Action: typeof ManagerV5_Action === 'function',
      Status_applyAction: typeof Status_applyAction === 'function',
      Status_applyTransition_: typeof Status_applyTransition_ === 'function',
      Status_requireTransition_: typeof Status_requireTransition_ === 'function',
      AMS01_prepareLifecycleHotPath_: typeof AMS01_prepareLifecycleHotPath_ === 'function'
    },
    probes: {}
  };

  try {
    out.probes.approve = Status_applyTransition_({ status:'Pending Approval', action:'APPROVE', role:'MANAGER' });
    out.probes.cancelApproved = Status_applyTransition_({ status:'Approved', action:'CANCEL', role:'MANAGER' });
    out.probes.rejectAccepted = Status_applyTransition_({ status:'Accepted', action:'REJECT', role:'MANAGER' });
    out.probes.cancelPendingApproval = Status_applyTransition_({ status:'Pending Approval', action:'CANCEL', role:'MANAGER' });
    out.probes.legacyDenyPendingApproval = Status_applyTransition_({ status:'Pending Approval', action:'DENY', role:'MANAGER' });
  } catch (e) {
    out.ok = false;
    out.error = String(e && e.message ? e.message : e);
  }

  try { Logger.log(JSON.stringify(out, null, 2)); } catch (eLog) {}
  return out;
}
