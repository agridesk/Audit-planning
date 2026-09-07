/**
 * UiDialogs.gs
 * Generic dialog helpers for the entire V5 application.
 * BUILD: 2026-05-21_UI_ACTION_STATUS_TONE_CONTRACT_R2_SYNCED
 * English-only. Stateless. No suppression / no "don't show again" support.
 *
 * Purpose:
 * - keep naming and defaults in one place
 * - allow all UIs to rely on one shared dialog contract
 * - HTML renderer lives in UiDialogs.html
 */

var UiDialogsConfig = (function () {
  function _text(v, fallback) {
    var s = String(v == null ? '' : v).trim();
    return s || String(fallback == null ? '' : fallback);
  }

  function _base(type, cfg) {
    cfg = cfg || {};
    return {
      type: _text(type, 'info'),
      title: _text(cfg.title, ''),
      message: _text(cfg.message, ''),
      confirmLabel: _text(cfg.confirmLabel, 'Confirm'),
      cancelLabel: _text(cfg.cancelLabel, 'Cancel'),
      allowCancel: cfg.allowCancel !== false,
      requireInput: cfg.requireInput === true,
      inputLabel: _text(cfg.inputLabel, ''),
      inputPlaceholder: _text(cfg.inputPlaceholder, ''),
      inputRequired: cfg.inputRequired === true,
      rows: Number(cfg.rows || 4),
      autoCloseMs: Number(cfg.autoCloseMs || 0)
    };
  }

  return {
    confirm: function (cfg) {
      var o = _base('confirm', cfg);
      if (!o.confirmLabel) o.confirmLabel = 'Confirm';
      if (!o.cancelLabel) o.cancelLabel = 'Cancel';
      return o;
    },

    warning: function (cfg) {
      var o = _base('warning', cfg);
      if (!o.confirmLabel) o.confirmLabel = 'Continue';
      if (!o.cancelLabel) o.cancelLabel = 'Cancel';
      return o;
    },

    error: function (cfg) {
      if (typeof cfg === 'string') cfg = { message: cfg };
      var o = _base('error', cfg);
      o.title = _text(o.title, 'Error');
      o.confirmLabel = _text(o.confirmLabel, 'Close');
      o.allowCancel = false;
      return o;
    },

    info: function (cfg) {
      if (typeof cfg === 'string') cfg = { message: cfg };
      var o = _base('info', cfg);
      o.confirmLabel = _text(o.confirmLabel, 'Close');
      o.allowCancel = false;
      return o;
    },

    success: function (cfg) {
      if (typeof cfg === 'string') cfg = { message: cfg };
      var o = _base('success', cfg);
      o.confirmLabel = _text(o.confirmLabel, 'Close');
      o.allowCancel = false;
      return o;
    },

    prompt: function (cfg) {
      var o = _base('prompt', cfg);
      o.requireInput = true;
      if (!o.confirmLabel) o.confirmLabel = 'Confirm';
      if (!o.cancelLabel) o.cancelLabel = 'Cancel';
      return o;
    },

    reasonRequired: function (cfg) {
      var o = _base('reason_required', cfg);
      o.requireInput = true;
      o.inputRequired = true;
      if (!o.confirmLabel) o.confirmLabel = 'Confirm';
      if (!o.cancelLabel) o.cancelLabel = 'Cancel';
      return o;
    },

    flashSuccess: function (message, autoCloseMs) {
      return _base('success', {
        title: '',
        message: _text(message, 'Saved'),
        confirmLabel: 'Close',
        allowCancel: false,
        autoCloseMs: Number(autoCloseMs || 500)
      });
    }
  };
})();

/**
 * UiActionContract
 * Central labels/tones contract for UI actions.
 * Business-neutral: no status transitions, no writes.
 */
var UiActionContract = (function () {
  var ACTIONS = {
    save:     { idle: 'Save',          busy: 'Saving…',      done: 'Saved',      tone: 'primary' },
    savePlanning:{ idle: 'Save planning', busy: 'Saving…',   done: 'Saved',      tone: 'primary' },
    complete: { idle: 'Complete',      busy: 'Completing…',  done: 'Completed',  tone: 'complete' },
    accept:   { idle: 'Accept',        busy: 'Accepting…',   done: 'Accepted',   tone: 'accept' },
    approve:  { idle: 'Approve',       busy: 'Approving…',   done: 'Approved',   tone: 'success' },
    deny:     { idle: 'Deny',          busy: 'Returning to Pending Planning…', done: 'Pending Planning', tone: 'warning' },
    cancel:   { idle: 'Cancel',        busy: 'Returning to Pending Planning…', done: 'Pending Planning', tone: 'neutral' },
    reject:   { idle: 'Reject',        busy: 'Rejecting…',   done: 'Rejected',   tone: 'danger' },
    plan:     { idle: 'Plan',          busy: 'Opening…',     done: 'Opened',     tone: 'primary' },
    reload:   { idle: 'Reload',        busy: 'Reloading…',   done: 'Reloaded',   tone: 'neutral' },
    refresh:  { idle: 'Refresh',       busy: 'Refreshing…',  done: 'Refreshed',  tone: 'neutral' },
    export:   { idle: 'Export',        busy: 'Exporting…',   done: 'Exported',   tone: 'neutral' },
    diag:     { idle: 'Diag',          busy: 'Loading…',     done: 'Loaded',     tone: 'neutral' }
  };

  function key_(action) {
    return String(action || '').trim();
  }

  function get(action) {
    var k = key_(action);
    return ACTIONS[k] || ACTIONS[k.toLowerCase()] || {
      idle: k || 'Action',
      busy: 'Working…',
      done: 'Done',
      tone: 'neutral'
    };
  }

  return {
    get: get,
    label: function(action, phase) {
      var c = get(action);
      return c[String(phase || 'idle')] || c.idle || 'Action';
    },
    tone: function(action) {
      return get(action).tone || 'neutral';
    },
    all: function () {
      return JSON.parse(JSON.stringify(ACTIONS));
    }
  };
})();

