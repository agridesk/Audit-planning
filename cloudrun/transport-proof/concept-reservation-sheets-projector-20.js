const HEADERS = [
  'Audit ID', 'Reservation ID', 'Auditor Email', 'Auditor Name', 'Blocks JSON',
  'State', 'Source Revision', 'Purpose', 'Note', 'Created By', 'Created At',
  'Updated At', 'Released By', 'Released At', 'Release Reason', 'Auditor_UID'
];
const MAX_ROWS = 5000;
const str = value => String(value ?? '');
const normalizeRow = row => {
  const values = Array.from({length: HEADERS.length}, (_, index) => str(row?.[index]));
  while (values.length && values.at(-1) === '') values.pop();
  return values;
};
const normalizeMatrix = rows => {
  const values = (Array.isArray(rows) ? rows : []).map(normalizeRow);
  while (values.length && values.at(-1).length === 0) values.pop();
  return values;
};
const sameMatrix = (left, right) => JSON.stringify(normalizeMatrix(left)) === JSON.stringify(normalizeMatrix(right));
const snapshotKey = rows => JSON.stringify(rows.map(row =>
  [row.auditId, row.version, row.state, row.updatedAt]));

function projectionRows(reservations, roster) {
  const byUid = new Map(roster.map(person => [str(person.auditorId).trim(), person]));
  return [
    HEADERS,
    ...reservations.map(reservation => {
      const person = byUid.get(reservation.auditorUid);
      return [
        reservation.auditId,
        reservation.reservationId,
        str(person?.email).trim().toLowerCase(),
        str(person?.displayName).trim(),
        JSON.stringify(reservation.blocks),
        reservation.state,
        reservation.sourceRevision,
        reservation.purpose,
        reservation.note,
        reservation.createdByUid,
        reservation.createdAt,
        reservation.updatedAt,
        reservation.releasedByUid,
        reservation.releasedAt,
        reservation.releaseReason,
        reservation.auditorUid
      ];
    })
  ];
}

export function createConceptReservationSheetsProjector20({
  store,
  getRoster,
  readSheet,
  ensureRows,
  writeSheet,
  maxRows = MAX_ROWS,
  maxAttempts = 3
} = {}) {
  if (typeof store?.listAll !== 'function' || typeof store?.listOutbox !== 'function' ||
      typeof store?.markProjected !== 'function' || typeof getRoster !== 'function' ||
      typeof readSheet !== 'function' || typeof ensureRows !== 'function' ||
      typeof writeSheet !== 'function' || !Number.isSafeInteger(maxRows) ||
      maxRows < 2 || maxRows > MAX_ROWS || !Number.isSafeInteger(maxAttempts) ||
      maxAttempts < 1 || maxAttempts > 5) {
    throw Error('CONCEPT_RESERVATION_PROJECTOR_CONFIGURATION_INVALID');
  }

  async function reconcile() {
    const roster = await getRoster();
    if (!Array.isArray(roster)) throw Error('CONCEPT_RESERVATION_PROJECTOR_ROSTER_INVALID');
    let reservations = [];
    let target = [];
    let verified = false;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      reservations = await store.listAll();
      if (reservations.length + 1 > maxRows) throw Error('CONCEPT_RESERVATION_PROJECTOR_ROW_LIMIT');
      target = projectionRows(reservations, roster);
      const existing = await readSheet(maxRows + 1);
      if (!Array.isArray(existing) || existing.length > maxRows) {
        throw Error('CONCEPT_RESERVATION_PROJECTOR_SOURCE_TRUNCATED');
      }
      if (!sameMatrix(existing, target)) {
        const rowCount = Math.max(existing.length, target.length);
        await ensureRows(rowCount);
        const values = target.concat(
          Array.from({length: rowCount - target.length}, () => Array(HEADERS.length).fill(''))
        );
        await writeSheet(values);
      }
      const actual = await readSheet(maxRows + 1);
      if (actual.length > maxRows) throw Error('CONCEPT_RESERVATION_PROJECTOR_SOURCE_TRUNCATED');
      if (!sameMatrix(actual, target)) throw Error('CONCEPT_RESERVATION_PROJECTOR_VERIFY_FAILED');
      const latest = await store.listAll();
      if (snapshotKey(latest) === snapshotKey(reservations)) {
        verified = true;
        break;
      }
    }
    if (!verified) throw Error('CONCEPT_RESERVATION_PROJECTOR_SOURCE_UNSTABLE');

    const outbox = await store.listOutbox({pageSize: 200, maxPages: 100});
    const currentAuditIds = new Set(reservations.map(row => row.auditId));
    const pending = outbox.filter(entry => entry.value?.state === 'PENDING');
    for (const entry of pending) {
      const operationId = str(entry.value?.operationId);
      const auditId = str(entry.value?.reservation?.auditId);
      if (!/^p_[a-f0-9]{64}$/.test(operationId) || !entry.updateTime ||
          !currentAuditIds.has(auditId)) {
        throw Error('CONCEPT_RESERVATION_PROJECTOR_OUTBOX_INVALID');
      }
      const result = await store.markProjected({operationId, updateTime: entry.updateTime});
      if (result.marked !== true) throw Error('CONCEPT_RESERVATION_PROJECTOR_OUTBOX_ACK_FAILED');
    }
    const remaining = await store.listOutbox({pageSize: 200, maxPages: 100});
    const pendingOutboxCount = remaining.filter(entry => entry.value?.state === 'PENDING').length;
    return {
      success: pendingOutboxCount === 0,
      verified: true,
      projectedRows: reservations.length,
      acknowledgedOutboxCount: pending.length,
      pendingOutboxCount,
      reason: pendingOutboxCount === 0 ? 'PROJECTED' : 'OUTBOX_CHANGED_DURING_RECONCILE'
    };
  }

  return Object.freeze({reconcile});
}
