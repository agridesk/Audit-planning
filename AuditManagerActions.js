
// FILE: AuditManagerActions.js
// BUILD: 2026-04-25_MINIMAL_STATUS_ACTION_ADAPTER
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
// Supported actions:
//   approve, deny, cancel, reject
//
// Required active files:
//   CoreStatusRules.gs
//   CoreStatusActions.gs
//   CoreStatusMachine_CORE_SPLIT.gs

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
    res.adapterBuild = '2026-04-25_MINIMAL_STATUS_ACTION_ADAPTER';
    try {
      if (typeof ManagerDiagnostics_RecordActionTiming === 'function') {
        ManagerDiagnostics_RecordActionTiming(
          action,
          auditId,
          res.perf.managerActionAdapterMs,
          !(res.success === false || res.ok === false),
          {
            message: res.message || '',
            newStatus: res.newStatus || res.afterStatusDisplay || '',
            adapterBuild: res.adapterBuild
          }
        );
      }
    } catch (eTiming) {}
    return res;
  }

  try {
    if (!auditId) return done_({ success:false, message:'No auditId' });
    if (!action) return done_({ success:false, message:'No action' });

    var actionMap = {
      approve: 'APPROVE',
      deny: 'DENY',
      cancel: 'CANCEL',
      reject: 'REJECT'
    };

    var actionKey = actionMap[action];
    if (!actionKey) {
      return done_({ success:false, message:'Unknown action: ' + action });
    }

    if (typeof Status_applyAction !== 'function') {
      return done_({ success:false, message:'Status_applyAction not available. Check CoreStatusActions.gs is deployed.' });
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
      return done_(result);
    }

    return done_(result);

  } catch (e) {
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
  var known = { approve:1, deny:1, cancel:1, reject:1 };

  if (known[s1]) return managerV5Action(b, a, options);
  if (known[s2]) return managerV5Action(a, b, options);

  return managerV5Action(b, a, options);
}

function RUN_AUDIT_MANAGER_ACTIONS_ADAPTER_DIAGNOSTICS() {
  var out = {
    ok: true,
    build: '2026-04-25_MINIMAL_STATUS_ACTION_ADAPTER',
    functions: {
      managerV5Action: typeof managerV5Action === 'function',
      ManagerV5_Action: typeof ManagerV5_Action === 'function',
      Status_applyAction: typeof Status_applyAction === 'function',
      Status_applyTransition_: typeof Status_applyTransition_ === 'function',
      Status_requireTransition_: typeof Status_requireTransition_ === 'function'
    },
    probes: {}
  };

  try {
    out.probes.approve = Status_applyTransition_({ status:'Pending Approval', action:'APPROVE', role:'MANAGER' });
    out.probes.cancelApproved = Status_applyTransition_({ status:'Approved', action:'CANCEL', role:'MANAGER' });
    out.probes.rejectAccepted = Status_applyTransition_({ status:'Accepted', action:'REJECT', role:'MANAGER' });
    out.probes.denyPendingApproval = Status_applyTransition_({ status:'Pending Approval', action:'DENY', role:'MANAGER' });
  } catch (e) {
    out.ok = false;
    out.error = String(e && e.message ? e.message : e);
  }

  try { Logger.log(JSON.stringify(out, null, 2)); } catch (eLog) {}
  return out;
}
