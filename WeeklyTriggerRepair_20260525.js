// ============================================================
// FILE: WeeklyTriggerRepair_20260525.gs
// BUILD: 2026-05-25_WEEKLY_TRIGGER_REPAIR_R1
// PURPOSE:
//   Emergency repair utilities for weekly notification triggers.
//   Use when Apps Script trigger UI cannot save because of duplicate-name warning.
//
// INSTALL:
//   1. Create a temporary Apps Script file: WeeklyTriggerRepair_20260525.gs
//   2. Paste this full file.
//   3. Run RUN_WEEKLY_TRIGGER_REPAIR_FROM_CONFIG().
//   4. Optional proof: run RUN_WEEKLY_TRIGGER_TEST_AFTER_5_MINUTES().
//   5. After proof, delete this temporary file if desired.
//
// NOTES:
//   - Does not change weekly renderer logic.
//   - Does not send mail immediately, unless you run the existing weekly functions manually.
//   - Programmatic trigger creation bypasses the broken trigger edit UI.
// ============================================================

function RUN_WEEKLY_TRIGGER_REPAIR_FROM_CONFIG() {
  var out = {
    ok: true,
    build: '2026-05-25_WEEKLY_TRIGGER_REPAIR_R1',
    deleted: {},
    setup: null,
    triggersAfter: []
  };

  out.deleted.runManagerWeeklyAlert = WTR_deleteTriggersByHandler_('runManagerWeeklyAlert');
  out.deleted.runAuditorWeeklyAlert = WTR_deleteTriggersByHandler_('runAuditorWeeklyAlert');

  if (typeof NotificationSender_SetupWeeklyTriggersFromConfig !== 'function') {
    out.ok = false;
    out.error = 'NotificationSender_SetupWeeklyTriggersFromConfig is missing.';
    Logger.log(JSON.stringify(out, null, 2));
    return out;
  }

  out.setup = NotificationSender_SetupWeeklyTriggersFromConfig();
  out.triggersAfter = WTR_listWeeklyTriggers_();

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_WEEKLY_TRIGGER_TEST_AFTER_5_MINUTES() {
  var out = {
    ok: true,
    build: '2026-05-25_WEEKLY_TRIGGER_REPAIR_R1',
    deleted: {},
    created: [],
    triggersAfter: []
  };

  out.deleted.WTR_RunManagerWeeklyAlert_TestOnce = WTR_deleteTriggersByHandler_('WTR_RunManagerWeeklyAlert_TestOnce');
  out.deleted.WTR_RunAuditorWeeklyAlert_TestOnce = WTR_deleteTriggersByHandler_('WTR_RunAuditorWeeklyAlert_TestOnce');

  var managerTrigger = ScriptApp.newTrigger('WTR_RunManagerWeeklyAlert_TestOnce')
    .timeBased()
    .after(5 * 60 * 1000)
    .create();

  var auditorTrigger = ScriptApp.newTrigger('WTR_RunAuditorWeeklyAlert_TestOnce')
    .timeBased()
    .after(7 * 60 * 1000)
    .create();

  out.created.push({ handler: 'WTR_RunManagerWeeklyAlert_TestOnce', triggerId: String(managerTrigger.getUniqueId ? managerTrigger.getUniqueId() : '') });
  out.created.push({ handler: 'WTR_RunAuditorWeeklyAlert_TestOnce', triggerId: String(auditorTrigger.getUniqueId ? auditorTrigger.getUniqueId() : '') });
  out.triggersAfter = WTR_listWeeklyTriggers_();

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function WTR_RunManagerWeeklyAlert_TestOnce() {
  var out = {
    ok: true,
    build: '2026-05-25_WEEKLY_TRIGGER_REPAIR_R1',
    handler: 'WTR_RunManagerWeeklyAlert_TestOnce',
    deletedSelfTriggers: 0,
    result: null
  };

  out.deletedSelfTriggers = WTR_deleteTriggersByHandler_('WTR_RunManagerWeeklyAlert_TestOnce');

  if (typeof runManagerWeeklyAlert !== 'function') {
    out.ok = false;
    out.error = 'runManagerWeeklyAlert is missing.';
    Logger.log(JSON.stringify(out, null, 2));
    return out;
  }

  out.result = runManagerWeeklyAlert();
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function WTR_RunAuditorWeeklyAlert_TestOnce() {
  var out = {
    ok: true,
    build: '2026-05-25_WEEKLY_TRIGGER_REPAIR_R1',
    handler: 'WTR_RunAuditorWeeklyAlert_TestOnce',
    deletedSelfTriggers: 0,
    result: null
  };

  out.deletedSelfTriggers = WTR_deleteTriggersByHandler_('WTR_RunAuditorWeeklyAlert_TestOnce');

  if (typeof runAuditorWeeklyAlert !== 'function') {
    out.ok = false;
    out.error = 'runAuditorWeeklyAlert is missing.';
    Logger.log(JSON.stringify(out, null, 2));
    return out;
  }

  out.result = runAuditorWeeklyAlert();
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_WEEKLY_TRIGGER_LIST() {
  var out = {
    ok: true,
    build: '2026-05-25_WEEKLY_TRIGGER_REPAIR_R1',
    triggers: WTR_listWeeklyTriggers_()
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function WTR_deleteTriggersByHandler_(handlerFunction) {
  var all = ScriptApp.getProjectTriggers();
  var removed = 0;

  for (var i = 0; i < all.length; i++) {
    var fn = String(all[i].getHandlerFunction() || '').trim();
    if (fn !== String(handlerFunction || '').trim()) continue;
    ScriptApp.deleteTrigger(all[i]);
    removed++;
  }

  return removed;
}

function WTR_listWeeklyTriggers_() {
  var wanted = {
    runManagerWeeklyAlert: true,
    runAuditorWeeklyAlert: true,
    WTR_RunManagerWeeklyAlert_TestOnce: true,
    WTR_RunAuditorWeeklyAlert_TestOnce: true
  };

  var out = [];
  var all = ScriptApp.getProjectTriggers();

  for (var i = 0; i < all.length; i++) {
    var t = all[i];
    var fn = String(t.getHandlerFunction() || '').trim();
    if (!wanted[fn]) continue;

    out.push({
      handler: fn,
      eventType: String(t.getEventType ? t.getEventType() : ''),
      triggerSource: String(t.getTriggerSource ? t.getTriggerSource() : ''),
      uniqueId: String(t.getUniqueId ? t.getUniqueId() : '')
    });
  }

  return out;
}
