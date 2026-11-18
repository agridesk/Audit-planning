import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../../NotificationBuilder.js', import.meta.url), 'utf8');
const start = src.indexOf('function NB_queueNotification_(');
const end = src.indexOf('\nfunction ', start + 10);
assert.ok(start > 0 && end > start, 'NB_queueNotification_ found');

function run({ lockThrows = false } = {}) {
  const log = [];
  const rows = [];
  const sh = { getName: () => 'Q' };
  const ctx = {
    LockService: { getScriptLock: () => {
      if (lockThrows) throw new Error('no lock');
      return { waitLock: () => log.push('lock'), releaseLock: () => log.push('unlock') };
    } },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({}), flush: () => log.push('flush') },
    Utilities: { formatDate: () => 'now' },
    NB_eventCode_: (e) => e,
    NB_getEventConfig_: () => ({ active: true, sendEmail: true, logOnly: false }),
    NB_buildPayloadForQueue_: (e, d) => d,
    NB_isDeferredExternalQueueEvent_: () => false,
    NB_buildNotification_: () => ({ subject: 's', body: 'b' }),
    NB_getQueueSheet_: () => sh,
    NB_getTz_: () => 'UTC',
    NB_hashQueueRow_: () => 'H1',
    NB_clean_: (v) => String(v ?? '').trim(),
    NB_recentQueueDuplicate_: () => {
      log.push('check');
      return rows.length ? { found: true, row: 2, status: 'PENDING', match: 'HASH' } : { found: false };
    },
    Date,
    JSON,
  };
  sh.appendRow = (r) => { log.push('append'); rows.push(r); };
  vm.createContext(ctx);
  vm.runInContext(src.slice(start, end), ctx);
  const first = ctx.NB_queueNotification_('a@x', 'AUDIT_PLANNED_BY_MANAGER', { auditId: 'A1' });
  const second = ctx.NB_queueNotification_('a@x', 'AUDIT_PLANNED_BY_MANAGER', { auditId: 'A1' });
  return { log, rows, first, second };
}

const r = run();
assert.equal(r.rows.length, 1, 'only one row appended for identical hash');
assert.equal(r.second.reason, 'DUPLICATE_QUEUE_ROW');
assert.deepEqual(r.log, ['lock', 'check', 'append', 'flush', 'unlock', 'lock', 'check', 'unlock'],
  'duplicate check and append run inside the lock, lock always released');

const nolock = run({ lockThrows: true });
assert.equal(nolock.rows.length, 1, 'still dedupes when lock is unavailable');

console.log('notification-queue-lock-dedupe-20-test OK');
