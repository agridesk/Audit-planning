/**
 * FILE: zz_AMS01_NotificationQueueDuplicatePerfOverride.js
 * BUILD: AMS01_NOTIFICATION_QUEUE_DUPLICATE_PERF_ZZ_20260909_R2
 *
 * Tactical V1.0 performance override.
 *
 * PURPOSE
 * - Preserve NotificationBuilder R8 hash-only duplicate semantics.
 * - Keep the canonical last-200-row duplicate window.
 * - Avoid materializing queue rows in Apps Script for every new event.
 * - Search the PayloadHash range server-side with TextFinder and read Status
 *   only when an exact hash match exists.
 *
 * GOVERNANCE
 * - Notification Queue remains canonical.
 * - No lifecycle/status/planning/availability ownership changes.
 * - No duplicate-policy change: exact PayloadHash only.
 * - Same accepted statuses as canonical R8.
 */
var AMS01_NOTIFICATION_QUEUE_DUPLICATE_PERF_ZZ_BUILD = 'AMS01_NOTIFICATION_QUEUE_DUPLICATE_PERF_ZZ_20260909_R2';

function NB_recentQueueDuplicate_(sh, hash, eventCode, recipientEmail, auditId) {
  var out = { found:false };
  if (!sh || !hash) return out;

  try {
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return out;

    var firstRow = Math.max(2, lastRow - 199);
    var rowCount = lastRow - firstRow + 1;
    var hashRange = sh.getRange(firstRow, 11, rowCount, 1);
    var matches = hashRange.createTextFinder(String(hash))
      .matchEntireCell(true)
      .matchCase(true)
      .findAll() || [];

    for (var i = matches.length - 1; i >= 0; i--) {
      var rowNo = matches[i].getRow();
      if (rowNo < firstRow || rowNo > lastRow) continue;
      var status = NB_clean_(sh.getRange(rowNo, 2).getDisplayValue()).toUpperCase();
      if (status !== 'PENDING' && status !== 'RESERVED' && status !== 'SENT' && status !== 'SENT_DEV_REDIRECT') continue;

      out.found = true;
      out.row = rowNo;
      out.status = status;
      out.match = 'HASH';
      return out;
    }
  } catch (e) {}

  return out;
}

function AMS01_NotificationQueueDuplicatePerfStatus() {
  return {
    success: true,
    active: true,
    build: AMS01_NOTIFICATION_QUEUE_DUPLICATE_PERF_ZZ_BUILD,
    semantics: 'R8_HASH_ONLY',
    strategy: 'TEXTFINDER_HASH_THEN_STATUS',
    maxRows: 200
  };
}
