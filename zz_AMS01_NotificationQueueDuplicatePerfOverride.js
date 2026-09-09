/**
 * FILE: zz_AMS01_NotificationQueueDuplicatePerfOverride.js
 * BUILD: AMS01_NOTIFICATION_QUEUE_DUPLICATE_PERF_ZZ_20260909_R1
 *
 * Tactical V1.0 performance override.
 *
 * PURPOSE
 * - Preserve NotificationBuilder R8 hash-only duplicate semantics.
 * - Avoid reading 13+ columns for the last 200 queue rows when only
 *   Status and PayloadHash are required for duplicate detection.
 * - Read the two required single-column ranges only.
 *
 * GOVERNANCE
 * - Notification Queue remains canonical.
 * - No lifecycle/status/planning/availability ownership changes.
 * - No duplicate-policy change: exact PayloadHash only.
 * - Same accepted statuses as canonical R8.
 */
var AMS01_NOTIFICATION_QUEUE_DUPLICATE_PERF_ZZ_BUILD = 'AMS01_NOTIFICATION_QUEUE_DUPLICATE_PERF_ZZ_20260909_R1';

function NB_recentQueueDuplicate_(sh, hash, eventCode, recipientEmail, auditId) {
  var out = { found:false };
  if (!sh || !hash) return out;

  try {
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return out;

    var firstRow = Math.max(2, lastRow - 199);
    var rowCount = lastRow - firstRow + 1;

    // Canonical queue columns:
    // B = Status, K = PayloadHash.
    // R8 duplicate semantics require no other queue fields.
    var statuses = sh.getRange(firstRow, 2, rowCount, 1).getDisplayValues();
    var hashes = sh.getRange(firstRow, 11, rowCount, 1).getDisplayValues();

    for (var i = rowCount - 1; i >= 0; i--) {
      var status = NB_clean_(statuses[i] && statuses[i][0]).toUpperCase();
      if (status !== 'PENDING' && status !== 'RESERVED' && status !== 'SENT' && status !== 'SENT_DEV_REDIRECT') continue;

      var rowHash = NB_clean_(hashes[i] && hashes[i][0]);
      if (rowHash && rowHash === hash) {
        out.found = true;
        out.row = firstRow + i;
        out.status = status;
        out.match = 'HASH';
        return out;
      }
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
    scanColumns: ['Status', 'PayloadHash'],
    maxRows: 200
  };
}
