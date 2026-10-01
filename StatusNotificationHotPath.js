// BUILD: 2026-10-01_AMS01_CANCEL_REJECT_NOTIFICATION_HOTPATH_R1
// PURPOSE: prepare manager Cancel/Reject/Deny notification hot path without changing StatusMachine ownership.
// - suppresses synchronous StatusBridge diagnostics for these hot actions
// - routes Manager Cancel/Reject notification to the assigned auditor instead of back to Manager
// - leaves notification queueing, lifecycle and audit-trail ownership unchanged

var __AMS01_HOTPATH_PREPARED = false;
var __AMS01_ORIGINAL_STATUS_BRIDGE_DIAG = null;
var __AMS01_ORIGINAL_STATUS_BRIDGE_RECIPIENT = null;

function AMS01_prepareLifecycleHotPath_() {
  if (__AMS01_HOTPATH_PREPARED) return { success:true, alreadyPrepared:true };

  if (typeof StatusNotificationBridge_Diag_ === 'function') {
    __AMS01_ORIGINAL_STATUS_BRIDGE_DIAG = StatusNotificationBridge_Diag_;
    StatusNotificationBridge_Diag_ = function(eventType, auditId, action, actor, beforeStatus, afterStatus, ok, message, details) {
      var a = '';
      try { a = Status_normalizeAction_(action); } catch (e0) { a = String(action || '').trim().toUpperCase(); }
      if (a === 'CANCEL' || a === 'DENY' || a === 'REJECT') return null;
      return __AMS01_ORIGINAL_STATUS_BRIDGE_DIAG.apply(this, arguments);
    };
  }

  if (typeof StatusNotificationBridge_ResolveRecipient_ === 'function') {
    __AMS01_ORIGINAL_STATUS_BRIDGE_RECIPIENT = StatusNotificationBridge_ResolveRecipient_;
    StatusNotificationBridge_ResolveRecipient_ = function(action, actor, ctx, payload) {
      var a = '', r = '';
      try { a = Status_normalizeAction_(action); } catch (e1) { a = String(action || '').trim().toUpperCase(); }
      try { r = Status_normalizeRole_(actor); } catch (e2) { r = String(actor || '').trim().toUpperCase(); }

      if (r === 'MANAGER' && (a === 'CANCEL' || a === 'REJECT')) {
        var assigned = '';
        try {
          if (ctx && ctx.row && ctx.col && ctx.col.assigned >= 0) assigned = String(ctx.row[ctx.col.assigned] || '').trim();
        } catch (e3) {}
        assigned = String((payload && payload.auditorEmail) || (payload && payload.assignedTo) || assigned || '').trim();
        return { role:'AUDITOR', email:assigned };
      }

      return __AMS01_ORIGINAL_STATUS_BRIDGE_RECIPIENT.apply(this, arguments);
    };
  }

  __AMS01_HOTPATH_PREPARED = true;
  return {
    success:true,
    build:'2026-10-01_AMS01_CANCEL_REJECT_NOTIFICATION_HOTPATH_R1',
    diagnosticsSuppressed:true,
    managerCancelRejectRecipient:'ASSIGNED_AUDITOR'
  };
}
